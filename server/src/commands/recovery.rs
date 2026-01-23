// Recovery Backend commands
// Uses file-based storage for session data

use crate::session::{
    lock::{find_stale_locks, remove_stale_lock, LockInfo, SessionLock},
    recovery::SessionRecovery,
};
use crate::utils::{as_path, ResultExt};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Stale session info for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaleLockInfo {
    pub session_id: String,
    pub pid: u32,
    pub timestamp: DateTime<Utc>,
    pub version: String,
}

impl From<(String, LockInfo)> for StaleLockInfo {
    fn from((session_id, info): (String, LockInfo)) -> Self {
        Self {
            session_id,
            pid: info.pid,
            timestamp: info.timestamp,
            version: info.version,
        }
    }
}

/// Recovery result for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryResult {
    pub session_id: String,
    pub tasks_unassigned: usize,
    pub success: bool,
    pub message: String,
}

/// Check for stale sessions that need recovery

pub async fn check_stale_sessions(
    project_path: String,
) -> Result<Vec<StaleLockInfo>, String> {
    let path = as_path(&project_path);

    find_stale_locks(path)
        .map(|locks| locks.into_iter().map(StaleLockInfo::from).collect())
        .with_context("Failed to check stale sessions")
}

/// Recover a single stale session

pub async fn recover_stale_session(
    project_path: String,
    session_id: String,
) -> Result<RecoveryResult, String> {
    let path = as_path(&project_path);
    let recovery = SessionRecovery::new(path);

    match recovery.recover_session(&session_id) {
        Ok(result) => Ok(RecoveryResult {
            session_id: result.session_id,
            tasks_unassigned: result.tasks_unassigned,
            success: true,
            message: format!(
                "Recovered session, unassigned {} tasks",
                result.tasks_unassigned
            ),
        }),
        Err(e) => Ok(RecoveryResult {
            session_id,
            tasks_unassigned: 0,
            success: false,
            message: format!("Failed to recover: {}", e),
        }),
    }
}

/// Recover all stale sessions

pub async fn recover_all_stale_sessions(
    project_path: String,
) -> Result<Vec<RecoveryResult>, String> {
    let path = as_path(&project_path);
    let recovery = SessionRecovery::new(path);
    let stale_sessions = recovery
        .detect_stale_sessions()
        .with_context("Failed to detect stale sessions")?;

    let mut results = Vec::new();

    for crashed in stale_sessions {
        match recovery.recover_session(&crashed.session_id) {
            Ok(result) => {
                results.push(RecoveryResult {
                    session_id: result.session_id,
                    tasks_unassigned: result.tasks_unassigned,
                    success: true,
                    message: "Recovered".to_string(),
                });
            }
            Err(e) => {
                results.push(RecoveryResult {
                    session_id: crashed.session_id,
                    tasks_unassigned: 0,
                    success: false,
                    message: format!("{}", e),
                });
            }
        }
    }

    Ok(results)
}

/// Acquire lock for a session

pub async fn acquire_session_lock(
    project_path: String,
    session_id: String,
) -> Result<bool, String> {
    let path = as_path(&project_path);

    // Create lock directory if needed
    let lock_dir = path.join(".ralph-ui");
    std::fs::create_dir_all(&lock_dir)
        .with_context("Failed to create lock directory")?;

    let lock_path = lock_dir.join(format!("session-{}.lock", session_id));

    // Check if lock already exists and is valid
    if lock_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&lock_path) {
            if let Ok(info) = serde_json::from_str::<LockInfo>(&content) {
                // Check if process is still running
                use sysinfo::{System, Pid};
                let mut system = System::new();
                system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
                if system.process(Pid::from_u32(info.pid)).is_some() {
                    // Lock is held by another process
                    return Ok(false);
                }
            }
        }
    }

    // Create new lock
    let lock_info = LockInfo {
        pid: std::process::id(),
        timestamp: Utc::now(),
        session_id: session_id.clone(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    };
    let content = serde_json::to_string_pretty(&lock_info)
        .with_context("Failed to serialize lock")?;
    std::fs::write(&lock_path, content)
        .with_context("Failed to write lock")?;

    Ok(true)
}

/// Release lock for a session

pub async fn release_session_lock(
    project_path: String,
    session_id: String,
) -> Result<(), String> {
    let path = as_path(&project_path);
    let lock = SessionLock::new(path, &session_id);

    // Check if we own the lock (current PID)
    if let Ok(Some(info)) = lock.get_lock_info() {
        if info.pid == std::process::id() {
            // Force release by removing the file
            remove_stale_lock(path, &session_id)
                .with_context("Failed to release lock")?;
        }
    }

    Ok(())
}

/// Get lock info for a session

pub async fn get_session_lock_info(
    project_path: String,
    session_id: String,
) -> Result<Option<StaleLockInfo>, String> {
    let path = as_path(&project_path);
    let lock = SessionLock::new(path, &session_id);

    match lock.get_lock_info() {
        Ok(Some(info)) => Ok(Some(StaleLockInfo {
            session_id,
            pid: info.pid,
            timestamp: info.timestamp,
            version: info.version,
        })),
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Failed to get lock info: {}", e)),
    }
}

/// Refresh session lock (heartbeat)

pub async fn refresh_session_lock(
    project_path: String,
    session_id: String,
) -> Result<(), String> {
    let path = as_path(&project_path);

    // Create lock info and write directly
    let lock_dir = path.join(".ralph-ui");
    let lock_path = lock_dir.join(format!("session-{}.lock", session_id));

    if lock_path.exists() {
        // Read current lock to verify ownership
        let content = std::fs::read_to_string(&lock_path)
            .with_context("Failed to read lock")?;
        let info: LockInfo = serde_json::from_str(&content)
            .with_context("Failed to parse lock")?;

        if info.pid == std::process::id() {
            // We own it, refresh timestamp
            let new_info = LockInfo {
                pid: std::process::id(),
                timestamp: Utc::now(),
                session_id: session_id.clone(),
                version: env!("CARGO_PKG_VERSION").to_string(),
            };
            let new_content = serde_json::to_string_pretty(&new_info)
                .with_context("Failed to serialize lock")?;
            std::fs::write(&lock_path, new_content)
                .with_context("Failed to write lock")?;
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_check_stale_sessions_empty() {
        let temp_dir = TempDir::new().unwrap();
        let result = check_stale_sessions(temp_dir.path().to_string_lossy().to_string()).await;
        assert!(result.is_ok());
        assert!(result.unwrap().is_empty());
    }

    #[tokio::test]
    async fn test_acquire_and_release_lock() {
        let temp_dir = TempDir::new().unwrap();
        let path = temp_dir.path().to_string_lossy().to_string();

        // Acquire lock
        let acquired = acquire_session_lock(path.clone(), "test-session".to_string()).await;
        assert!(acquired.is_ok());
        assert!(acquired.unwrap());

        // Get lock info
        let info = get_session_lock_info(path.clone(), "test-session".to_string()).await;
        assert!(info.is_ok());
        assert!(info.unwrap().is_some());

        // Release lock
        let released = release_session_lock(path.clone(), "test-session".to_string()).await;
        assert!(released.is_ok());

        // Lock should be gone
        let info_after = get_session_lock_info(path, "test-session".to_string()).await;
        assert!(info_after.is_ok());
        assert!(info_after.unwrap().is_none());
    }
}
