// Session crash recovery
// Uses file-based storage for session data

#![allow(dead_code)] // Recovery infrastructure

use crate::file_storage::sessions as session_storage;
use crate::models::{SessionStatus, TaskStatus};
use crate::session::lock::{find_stale_locks, remove_stale_lock, LockInfo};
use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
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
    pub fn detect_stale_sessions(&self) -> Result<Vec<CrashedSession>> {
        let stale_locks = find_stale_locks(&self.project_path)?;
        let mut crashed_sessions = Vec::new();

        for (session_id, lock_info) in stale_locks {
            // Check if session exists and is in Active status
            if let Ok(session) = session_storage::read_session(&self.project_path, &session_id) {
                if session.status == SessionStatus::Active {
                    let in_progress = session
                        .tasks
                        .iter()
                        .filter(|t| t.status == TaskStatus::InProgress)
                        .count();

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
    pub fn recover_session(&self, session_id: &str) -> Result<RecoveryResult> {
        // Get current session
        let session = session_storage::read_session(&self.project_path, session_id)
            .map_err(|e| anyhow!("Failed to read session: {}", e))?;

        let previous_status = session.status;

        if previous_status != SessionStatus::Active {
            return Err(anyhow!(
                "Session {} is not in Active status, cannot recover",
                session_id
            ));
        }

        // Transition to Paused (interrupted) status
        let new_status = SessionStatus::Paused;
        session_storage::update_session_status(&self.project_path, session_id, new_status)
            .map_err(|e| anyhow!("Failed to update session status: {}", e))?;

        // Clear assigned_agent from in-progress tasks and count them
        let tasks_unassigned =
            session_storage::unassign_in_progress_tasks(&self.project_path, session_id)
                .map_err(|e| anyhow!("Failed to unassign tasks: {}", e))?;

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
    pub fn recover_all(&self) -> Result<Vec<RecoveryResult>> {
        let crashed = self.detect_stale_sessions()?;
        let mut results = Vec::new();

        for session in crashed {
            match self.recover_session(&session.session_id) {
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
    pub fn needs_recovery(&self, session_id: &str) -> Result<bool> {
        // Check if session exists and is active
        let session = match session_storage::read_session(&self.project_path, session_id) {
            Ok(s) => s,
            Err(_) => return Ok(false), // Session doesn't exist
        };

        if session.status != SessionStatus::Active {
            return Ok(false);
        }

        // Check for stale lock
        let lock = crate::session::lock::SessionLock::new(&self.project_path, session_id);
        lock.is_stale()
    }
}

/// Perform automatic recovery on application startup
pub fn auto_recover_on_startup(project_path: &Path) -> Result<Vec<RecoveryResult>> {
    let recovery = SessionRecovery::new(project_path);
    recovery.recover_all()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::file_storage;
    use crate::models::{AgentType, Session, SessionConfig, Task};
    use tempfile::TempDir;

    fn setup_test_project() -> TempDir {
        let temp_dir = TempDir::new().unwrap();
        file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();
        temp_dir
    }

    fn create_test_session(project_path: &Path, session_id: &str, status: SessionStatus) {
        let session = Session {
            id: session_id.to_string(),
            name: "Test Session".to_string(),
            project_path: project_path.to_string_lossy().to_string(),
            created_at: Utc::now(),
            last_resumed_at: None,
            status,
            config: SessionConfig {
                max_parallel: 1,
                max_iterations: 10,
                max_retries: 3,
                agent_type: AgentType::Claude,
                auto_create_prs: false,
                draft_prs: false,
                run_tests: false,
                run_lint: false,
            },
            tasks: Vec::new(),
            total_cost: 0.0,
            total_tokens: 0,
        };
        session_storage::save_session(project_path, &session).unwrap();
    }

    fn create_test_session_with_tasks(
        project_path: &Path,
        session_id: &str,
        status: SessionStatus,
        tasks: Vec<Task>,
    ) {
        let session = Session {
            id: session_id.to_string(),
            name: "Test Session".to_string(),
            project_path: project_path.to_string_lossy().to_string(),
            created_at: Utc::now(),
            last_resumed_at: None,
            status,
            config: SessionConfig {
                max_parallel: 1,
                max_iterations: 10,
                max_retries: 3,
                agent_type: AgentType::Claude,
                auto_create_prs: false,
                draft_prs: false,
                run_tests: false,
                run_lint: false,
            },
            tasks,
            total_cost: 0.0,
            total_tokens: 0,
        };
        session_storage::save_session(project_path, &session).unwrap();
    }

    fn create_test_task(task_id: &str, status: TaskStatus, assigned_agent: Option<&str>) -> Task {
        Task {
            id: task_id.to_string(),
            title: "Test Task".to_string(),
            description: "Description".to_string(),
            status,
            priority: 1,
            dependencies: Vec::new(),
            assigned_agent: assigned_agent.map(String::from),
            estimated_tokens: None,
            actual_tokens: None,
            started_at: if status == TaskStatus::InProgress {
                Some(Utc::now())
            } else {
                None
            },
            completed_at: None,
            branch: None,
            worktree_path: None,
            error: None,
        }
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
        let temp_dir = setup_test_project();

        // Create an active session
        create_test_session(temp_dir.path(), "session-1", SessionStatus::Active);

        // Create a stale lock for it
        create_stale_lock(temp_dir.path(), "session-1");

        let recovery = SessionRecovery::new(temp_dir.path());
        let crashed = recovery.detect_stale_sessions().unwrap();

        assert_eq!(crashed.len(), 1);
        assert_eq!(crashed[0].session_id, "session-1");
    }

    #[test]
    fn test_transitions_stuck_session_to_paused() {
        let temp_dir = setup_test_project();

        create_test_session(temp_dir.path(), "session-1", SessionStatus::Active);
        create_stale_lock(temp_dir.path(), "session-1");

        let recovery = SessionRecovery::new(temp_dir.path());
        let result = recovery.recover_session("session-1").unwrap();

        assert_eq!(result.previous_status, SessionStatus::Active);
        assert_eq!(result.new_status, SessionStatus::Paused);

        // Verify session is now paused
        let session = session_storage::read_session(temp_dir.path(), "session-1").unwrap();
        assert_eq!(session.status, SessionStatus::Paused);
    }

    #[test]
    fn test_clears_assigned_agent_from_tasks_on_crash() {
        let temp_dir = setup_test_project();

        let tasks = vec![
            create_test_task("task-1", TaskStatus::InProgress, Some("agent-1")),
            create_test_task("task-2", TaskStatus::InProgress, Some("agent-2")),
        ];
        create_test_session_with_tasks(temp_dir.path(), "session-1", SessionStatus::Active, tasks);
        create_stale_lock(temp_dir.path(), "session-1");

        let recovery = SessionRecovery::new(temp_dir.path());
        let result = recovery.recover_session("session-1").unwrap();

        assert_eq!(result.tasks_unassigned, 2);

        // Verify tasks are now Pending with no assigned agent
        let session = session_storage::read_session(temp_dir.path(), "session-1").unwrap();
        for task in session.tasks {
            assert_eq!(task.status, TaskStatus::Pending);
            assert!(task.assigned_agent.is_none());
        }
    }

    #[test]
    fn test_does_not_recover_session_with_valid_lock() {
        let temp_dir = setup_test_project();

        create_test_session(temp_dir.path(), "session-1", SessionStatus::Active);
        // No stale lock created

        let recovery = SessionRecovery::new(temp_dir.path());
        let crashed = recovery.detect_stale_sessions().unwrap();

        // Should not detect as crashed (no lock = no crash indicator)
        assert_eq!(crashed.len(), 0);
    }

    #[test]
    fn test_handles_multiple_crashed_sessions() {
        let temp_dir = setup_test_project();

        // Create multiple sessions
        create_test_session(temp_dir.path(), "session-1", SessionStatus::Active);
        create_test_session(temp_dir.path(), "session-2", SessionStatus::Active);
        create_test_session(temp_dir.path(), "session-3", SessionStatus::Completed); // Not active

        create_stale_lock(temp_dir.path(), "session-1");
        create_stale_lock(temp_dir.path(), "session-2");
        create_stale_lock(temp_dir.path(), "session-3"); // Ignored - not active

        let recovery = SessionRecovery::new(temp_dir.path());
        let crashed = recovery.detect_stale_sessions().unwrap();

        assert_eq!(crashed.len(), 2);
    }

    #[test]
    fn test_recover_all() {
        let temp_dir = setup_test_project();

        create_test_session(temp_dir.path(), "session-1", SessionStatus::Active);
        create_test_session(temp_dir.path(), "session-2", SessionStatus::Active);
        create_stale_lock(temp_dir.path(), "session-1");
        create_stale_lock(temp_dir.path(), "session-2");

        let recovery = SessionRecovery::new(temp_dir.path());
        let results = recovery.recover_all().unwrap();

        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_needs_recovery() {
        let temp_dir = setup_test_project();

        create_test_session(temp_dir.path(), "session-1", SessionStatus::Active);
        create_stale_lock(temp_dir.path(), "session-1");

        let recovery = SessionRecovery::new(temp_dir.path());
        assert!(recovery.needs_recovery("session-1").unwrap());
    }

    #[test]
    fn test_does_not_need_recovery_when_completed() {
        let temp_dir = setup_test_project();

        create_test_session(temp_dir.path(), "session-1", SessionStatus::Completed);
        create_stale_lock(temp_dir.path(), "session-1");

        let recovery = SessionRecovery::new(temp_dir.path());
        assert!(!recovery.needs_recovery("session-1").unwrap());
    }
}
