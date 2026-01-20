// Session crash recovery

#![allow(dead_code)] // Recovery infrastructure

use crate::models::{SessionStatus, TaskStatus};
use crate::session::lock::{find_stale_locks, remove_stale_lock, LockInfo};
use anyhow::{Result, anyhow};
use chrono::{DateTime, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Status of recovered session
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RecoveryStatus {
    /// Session was recovered from a crash
    Recovered,
    /// Session was cleanly closed
    Clean,
    /// Session is currently active
    Active,
    /// Session state is unknown
    Unknown,
}

/// Information about a crashed session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashedSession {
    /// Session ID
    pub session_id: String,
    /// Lock information at time of crash
    pub lock_info: CrashedLockInfo,
    /// Number of tasks that were in progress
    pub in_progress_tasks: usize,
    /// When the crash was detected
    pub detected_at: DateTime<Utc>,
}

/// Simplified lock info for serialization
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrashedLockInfo {
    pub pid: u32,
    pub timestamp: DateTime<Utc>,
}

impl From<LockInfo> for CrashedLockInfo {
    fn from(info: LockInfo) -> Self {
        Self {
            pid: info.pid,
            timestamp: info.timestamp,
        }
    }
}

/// Recovery result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryResult {
    /// Session ID that was recovered
    pub session_id: String,
    /// Previous status
    pub previous_status: SessionStatus,
    /// New status after recovery
    pub new_status: SessionStatus,
    /// Number of tasks that were unassigned
    pub tasks_unassigned: usize,
    /// When recovery was performed
    pub recovered_at: DateTime<Utc>,
}

/// Session recovery manager
pub struct SessionRecovery {
    project_path: std::path::PathBuf,
}

impl SessionRecovery {
    /// Create a new recovery manager
    pub fn new(project_path: &Path) -> Self {
        Self {
            project_path: project_path.to_path_buf(),
        }
    }

    /// Detect sessions stuck in "Active" status with stale locks
    pub fn detect_stale_sessions(&self, conn: &Connection) -> Result<Vec<CrashedSession>> {
        let stale_locks = find_stale_locks(&self.project_path)?;
        let mut crashed_sessions = Vec::new();

        for (session_id, lock_info) in stale_locks {
            // Check if session exists and is in Active status
            if let Ok(session) = self.get_session_status(conn, &session_id) {
                if session == SessionStatus::Active {
                    let in_progress = self.count_in_progress_tasks(conn, &session_id)?;

                    crashed_sessions.push(CrashedSession {
                        session_id,
                        lock_info: lock_info.into(),
                        in_progress_tasks: in_progress,
                        detected_at: Utc::now(),
                    });
                }
            }
        }

        Ok(crashed_sessions)
    }

    /// Recover a single session
    pub fn recover_session(&self, conn: &Connection, session_id: &str) -> Result<RecoveryResult> {
        // Get current status
        let previous_status = self.get_session_status(conn, session_id)?;

        if previous_status != SessionStatus::Active {
            return Err(anyhow!(
                "Session {} is not in Active status, cannot recover",
                session_id
            ));
        }

        // Transition to Paused (interrupted) status
        let new_status = SessionStatus::Paused;
        self.update_session_status(conn, session_id, new_status)?;

        // Clear assigned_agent from in-progress tasks
        let tasks_unassigned = self.unassign_in_progress_tasks(conn, session_id)?;

        // Remove stale lock file
        remove_stale_lock(&self.project_path, session_id)?;

        Ok(RecoveryResult {
            session_id: session_id.to_string(),
            previous_status,
            new_status,
            tasks_unassigned,
            recovered_at: Utc::now(),
        })
    }

    /// Recover all stale sessions
    pub fn recover_all(&self, conn: &Connection) -> Result<Vec<RecoveryResult>> {
        let crashed = self.detect_stale_sessions(conn)?;
        let mut results = Vec::new();

        for session in crashed {
            match self.recover_session(conn, &session.session_id) {
                Ok(result) => results.push(result),
                Err(e) => {
                    log::warn!(
                        "Failed to recover session {}: {}",
                        session.session_id,
                        e
                    );
                }
            }
        }

        Ok(results)
    }

    /// Check if a session needs recovery
    pub fn needs_recovery(&self, conn: &Connection, session_id: &str) -> Result<bool> {
        // Check if session is active
        let status = self.get_session_status(conn, session_id)?;
        if status != SessionStatus::Active {
            return Ok(false);
        }

        // Check for stale lock
        let lock = crate::session::lock::SessionLock::new(&self.project_path, session_id);
        lock.is_stale()
    }

    // Private helper methods

    fn get_session_status(&self, conn: &Connection, session_id: &str) -> Result<SessionStatus> {
        let status_str: String = conn.query_row(
            "SELECT status FROM sessions WHERE id = ?1",
            [session_id],
            |row| row.get(0),
        )?;

        serde_json::from_str(&status_str)
            .map_err(|e| anyhow!("Failed to parse session status: {}", e))
    }

    fn update_session_status(
        &self,
        conn: &Connection,
        session_id: &str,
        status: SessionStatus,
    ) -> Result<()> {
        let status_str = serde_json::to_string(&status)?;
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "UPDATE sessions SET status = ?1, last_resumed_at = ?2 WHERE id = ?3",
            [&status_str, &now, session_id],
        )?;

        Ok(())
    }

    fn count_in_progress_tasks(&self, conn: &Connection, session_id: &str) -> Result<usize> {
        let status_str = serde_json::to_string(&TaskStatus::InProgress)?;

        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE session_id = ?1 AND status = ?2",
            [session_id, &status_str],
            |row| row.get(0),
        )?;

        Ok(count as usize)
    }

    fn unassign_in_progress_tasks(&self, conn: &Connection, session_id: &str) -> Result<usize> {
        let in_progress_str = serde_json::to_string(&TaskStatus::InProgress)?;
        let pending_str = serde_json::to_string(&TaskStatus::Pending)?;

        let affected = conn.execute(
            "UPDATE tasks SET assigned_agent = NULL, status = ?1 WHERE session_id = ?2 AND status = ?3",
            [&pending_str, session_id, &in_progress_str],
        )?;

        Ok(affected)
    }
}

/// Perform automatic recovery on application startup
pub fn auto_recover_on_startup(conn: &Connection, project_path: &Path) -> Result<Vec<RecoveryResult>> {
    let recovery = SessionRecovery::new(project_path);
    recovery.recover_all(conn)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use tempfile::TempDir;

    fn setup_test_db() -> (Connection, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let conn = Connection::open_in_memory().unwrap();
        // Enable foreign key enforcement
        conn.execute("PRAGMA foreign_keys = ON", []).unwrap();

        // Create sessions table
        conn.execute(
            "CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                project_path TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_resumed_at TEXT,
                status TEXT NOT NULL,
                max_parallel INTEGER NOT NULL DEFAULT 3,
                max_iterations INTEGER NOT NULL DEFAULT 10,
                max_retries INTEGER NOT NULL DEFAULT 3,
                agent_type TEXT NOT NULL DEFAULT '\"claude\"',
                auto_create_prs INTEGER NOT NULL DEFAULT 1,
                draft_prs INTEGER NOT NULL DEFAULT 0,
                run_tests INTEGER NOT NULL DEFAULT 1,
                run_lint INTEGER NOT NULL DEFAULT 1,
                total_cost REAL NOT NULL DEFAULT 0.0,
                total_tokens INTEGER NOT NULL DEFAULT 0
            )",
            [],
        ).unwrap();

        // Create tasks table
        conn.execute(
            "CREATE TABLE tasks (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                status TEXT NOT NULL,
                priority INTEGER NOT NULL DEFAULT 0,
                dependencies TEXT,
                assigned_agent TEXT,
                estimated_tokens INTEGER,
                actual_tokens INTEGER,
                started_at TEXT,
                completed_at TEXT,
                branch TEXT,
                worktree_path TEXT,
                error TEXT
            )",
            [],
        ).unwrap();

        (conn, temp_dir)
    }

    fn create_test_session(conn: &Connection, session_id: &str, status: SessionStatus) {
        let status_str = serde_json::to_string(&status).unwrap();
        let now = Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO sessions (id, name, project_path, created_at, status) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![session_id, "Test Session", "/test/path", &now, &status_str],
        ).unwrap();
    }

    fn create_test_task(conn: &Connection, task_id: &str, session_id: &str, status: TaskStatus, assigned: Option<&str>) {
        let status_str = serde_json::to_string(&status).unwrap();

        conn.execute(
            "INSERT INTO tasks (id, session_id, title, description, status, assigned_agent) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![task_id, session_id, "Test Task", "Description", &status_str, assigned],
        ).unwrap();
    }

    fn create_stale_lock(temp_dir: &Path, session_id: &str) {
        use crate::session::lock::LockInfo;
        use std::fs;

        let lock_dir = temp_dir.join(".ralph-ui");
        fs::create_dir_all(&lock_dir).unwrap();

        let stale_info = LockInfo {
            pid: 999999, // Non-existent PID
            timestamp: Utc::now() - chrono::Duration::hours(1),
            session_id: session_id.to_string(),
            version: "1.0.0".to_string(),
        };

        let lock_path = lock_dir.join(format!("session-{}.lock", session_id));
        let contents = serde_json::to_string(&stale_info).unwrap();
        fs::write(&lock_path, contents).unwrap();
    }

    #[test]
    fn test_detects_session_stuck_in_active_with_stale_lock() {
        let (conn, temp_dir) = setup_test_db();

        // Create an active session
        create_test_session(&conn, "session-1", SessionStatus::Active);

        // Create a stale lock for it
        create_stale_lock(temp_dir.path(), "session-1");

        let recovery = SessionRecovery::new(temp_dir.path());
        let crashed = recovery.detect_stale_sessions(&conn).unwrap();

        assert_eq!(crashed.len(), 1);
        assert_eq!(crashed[0].session_id, "session-1");
    }

    #[test]
    fn test_transitions_stuck_session_to_paused() {
        let (conn, temp_dir) = setup_test_db();

        create_test_session(&conn, "session-1", SessionStatus::Active);
        create_stale_lock(temp_dir.path(), "session-1");

        let recovery = SessionRecovery::new(temp_dir.path());
        let result = recovery.recover_session(&conn, "session-1").unwrap();

        assert_eq!(result.previous_status, SessionStatus::Active);
        assert_eq!(result.new_status, SessionStatus::Paused);
    }

    #[test]
    fn test_clears_assigned_agent_from_tasks_on_crash() {
        let (conn, temp_dir) = setup_test_db();

        create_test_session(&conn, "session-1", SessionStatus::Active);
        create_test_task(&conn, "task-1", "session-1", TaskStatus::InProgress, Some("agent-1"));
        create_test_task(&conn, "task-2", "session-1", TaskStatus::InProgress, Some("agent-2"));
        create_stale_lock(temp_dir.path(), "session-1");

        let recovery = SessionRecovery::new(temp_dir.path());
        let result = recovery.recover_session(&conn, "session-1").unwrap();

        assert_eq!(result.tasks_unassigned, 2);

        // Verify tasks are now Pending with no assigned agent
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE session_id = 'session-1' AND assigned_agent IS NULL",
            [],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(count, 2);
    }

    #[test]
    fn test_does_not_recover_session_with_valid_lock() {
        let (conn, temp_dir) = setup_test_db();

        create_test_session(&conn, "session-1", SessionStatus::Active);
        // No stale lock created

        let recovery = SessionRecovery::new(temp_dir.path());
        let crashed = recovery.detect_stale_sessions(&conn).unwrap();

        // Should not detect as crashed (no lock = no crash indicator)
        assert_eq!(crashed.len(), 0);
    }

    #[test]
    fn test_handles_multiple_crashed_sessions() {
        let (conn, temp_dir) = setup_test_db();

        // Create multiple crashed sessions
        create_test_session(&conn, "session-1", SessionStatus::Active);
        create_test_session(&conn, "session-2", SessionStatus::Active);
        create_test_session(&conn, "session-3", SessionStatus::Completed); // Not active

        create_stale_lock(temp_dir.path(), "session-1");
        create_stale_lock(temp_dir.path(), "session-2");
        create_stale_lock(temp_dir.path(), "session-3"); // Ignored - not active

        let recovery = SessionRecovery::new(temp_dir.path());
        let crashed = recovery.detect_stale_sessions(&conn).unwrap();

        assert_eq!(crashed.len(), 2);
    }

    #[test]
    fn test_recover_all() {
        let (conn, temp_dir) = setup_test_db();

        create_test_session(&conn, "session-1", SessionStatus::Active);
        create_test_session(&conn, "session-2", SessionStatus::Active);
        create_stale_lock(temp_dir.path(), "session-1");
        create_stale_lock(temp_dir.path(), "session-2");

        let recovery = SessionRecovery::new(temp_dir.path());
        let results = recovery.recover_all(&conn).unwrap();

        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_needs_recovery() {
        let (conn, temp_dir) = setup_test_db();

        create_test_session(&conn, "session-1", SessionStatus::Active);
        create_stale_lock(temp_dir.path(), "session-1");

        let recovery = SessionRecovery::new(temp_dir.path());
        assert!(recovery.needs_recovery(&conn, "session-1").unwrap());
    }

    #[test]
    fn test_does_not_need_recovery_when_completed() {
        let (conn, temp_dir) = setup_test_db();

        create_test_session(&conn, "session-1", SessionStatus::Completed);
        create_stale_lock(temp_dir.path(), "session-1");

        let recovery = SessionRecovery::new(temp_dir.path());
        assert!(!recovery.needs_recovery(&conn, "session-1").unwrap());
    }
}
