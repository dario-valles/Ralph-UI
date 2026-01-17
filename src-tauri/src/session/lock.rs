// Session lock file management for crash detection
#![allow(dead_code)]

use anyhow::{Result, anyhow};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

/// Default lock timeout in minutes
const DEFAULT_LOCK_TIMEOUT_MINUTES: i64 = 5;

/// Lock file contents
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LockInfo {
    /// Process ID that holds the lock
    pub pid: u32,
    /// Timestamp when lock was acquired
    pub timestamp: DateTime<Utc>,
    /// Session ID
    pub session_id: String,
    /// Application version (for compatibility)
    pub version: String,
}

impl LockInfo {
    /// Create new lock info for current process
    pub fn new(session_id: &str) -> Self {
        Self {
            pid: std::process::id(),
            timestamp: Utc::now(),
            session_id: session_id.to_string(),
            version: env!("CARGO_PKG_VERSION").to_string(),
        }
    }
}

/// Session lock manager
pub struct SessionLock {
    /// Path to the lock file
    lock_path: PathBuf,
    /// Session ID
    session_id: String,
    /// Whether this instance owns the lock
    is_owner: bool,
    /// Lock timeout in minutes
    timeout_minutes: i64,
}

impl SessionLock {
    /// Create a new session lock manager
    pub fn new(project_path: &Path, session_id: &str) -> Self {
        let lock_dir = project_path.join(".ralph-ui");
        let lock_path = lock_dir.join(format!("session-{}.lock", session_id));

        Self {
            lock_path,
            session_id: session_id.to_string(),
            is_owner: false,
            timeout_minutes: DEFAULT_LOCK_TIMEOUT_MINUTES,
        }
    }

    /// Set custom timeout
    pub fn with_timeout(mut self, minutes: i64) -> Self {
        self.timeout_minutes = minutes;
        self
    }

    /// Try to acquire the lock
    pub fn acquire(&mut self) -> Result<bool> {
        // Ensure lock directory exists
        if let Some(parent) = self.lock_path.parent() {
            fs::create_dir_all(parent)?;
        }

        // Check if lock file exists
        if self.lock_path.exists() {
            let existing = self.read_lock_info()?;

            // Check if lock is stale
            if self.is_lock_stale(&existing) {
                // Lock is stale, we can take it over
                self.write_lock()?;
                self.is_owner = true;
                return Ok(true);
            }

            // Lock is held by another active process
            return Ok(false);
        }

        // No lock exists, create it
        self.write_lock()?;
        self.is_owner = true;
        Ok(true)
    }

    /// Release the lock
    pub fn release(&mut self) -> Result<()> {
        if self.is_owner && self.lock_path.exists() {
            fs::remove_file(&self.lock_path)?;
            self.is_owner = false;
        }
        Ok(())
    }

    /// Refresh the lock timestamp (heartbeat)
    pub fn refresh(&self) -> Result<()> {
        if self.is_owner {
            self.write_lock()?;
        }
        Ok(())
    }

    /// Check if the lock is stale
    pub fn is_lock_stale(&self, info: &LockInfo) -> bool {
        // Check if timestamp is expired
        let now = Utc::now();
        let age = now - info.timestamp;
        if age > Duration::minutes(self.timeout_minutes) {
            return true;
        }

        // Check if process is still running
        if !self.is_process_alive(info.pid) {
            return true;
        }

        false
    }

    /// Check if the lock file exists
    pub fn exists(&self) -> bool {
        self.lock_path.exists()
    }

    /// Check if this instance owns the lock
    pub fn is_owner(&self) -> bool {
        self.is_owner
    }

    /// Get lock info without owning
    pub fn get_lock_info(&self) -> Result<Option<LockInfo>> {
        if self.lock_path.exists() {
            Ok(Some(self.read_lock_info()?))
        } else {
            Ok(None)
        }
    }

    /// Check if a lock is stale (public interface)
    pub fn is_stale(&self) -> Result<bool> {
        if let Some(info) = self.get_lock_info()? {
            Ok(self.is_lock_stale(&info))
        } else {
            // No lock file = not stale
            Ok(false)
        }
    }

    /// Get the session ID
    pub fn session_id(&self) -> &str {
        &self.session_id
    }

    /// Get the lock file path
    pub fn lock_path(&self) -> &Path {
        &self.lock_path
    }

    // Private methods

    fn read_lock_info(&self) -> Result<LockInfo> {
        let mut file = File::open(&self.lock_path)
            .map_err(|e| anyhow!("Failed to open lock file: {}", e))?;

        let mut contents = String::new();
        file.read_to_string(&mut contents)
            .map_err(|e| anyhow!("Failed to read lock file: {}", e))?;

        serde_json::from_str(&contents)
            .map_err(|e| anyhow!("Failed to parse lock file: {}", e))
    }

    fn write_lock(&self) -> Result<()> {
        let info = LockInfo::new(&self.session_id);
        let contents = serde_json::to_string_pretty(&info)
            .map_err(|e| anyhow!("Failed to serialize lock info: {}", e))?;

        let mut file = File::create(&self.lock_path)
            .map_err(|e| anyhow!("Failed to create lock file: {}", e))?;

        file.write_all(contents.as_bytes())
            .map_err(|e| anyhow!("Failed to write lock file: {}", e))?;

        Ok(())
    }

    fn is_process_alive(&self, pid: u32) -> bool {
        use sysinfo::{System, Pid};

        let mut system = System::new();
        system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        system.process(Pid::from_u32(pid)).is_some()
    }
}

impl Drop for SessionLock {
    fn drop(&mut self) {
        // Release lock on drop
        let _ = self.release();
    }
}

/// Scan for stale locks in a project directory
pub fn find_stale_locks(project_path: &Path) -> Result<Vec<(String, LockInfo)>> {
    let lock_dir = project_path.join(".ralph-ui");
    let mut stale_locks = Vec::new();

    if !lock_dir.exists() {
        return Ok(stale_locks);
    }

    for entry in fs::read_dir(&lock_dir)? {
        let entry = entry?;
        let path = entry.path();

        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with("session-") && name.ends_with(".lock") {
                // Extract session ID from filename
                let session_id = name
                    .strip_prefix("session-")
                    .and_then(|s| s.strip_suffix(".lock"))
                    .unwrap_or("");

                if !session_id.is_empty() {
                    let lock = SessionLock::new(project_path, session_id);
                    if let Ok(Some(info)) = lock.get_lock_info() {
                        if lock.is_lock_stale(&info) {
                            stale_locks.push((session_id.to_string(), info));
                        }
                    }
                }
            }
        }
    }

    Ok(stale_locks)
}

/// Remove a stale lock file
pub fn remove_stale_lock(project_path: &Path, session_id: &str) -> Result<()> {
    let lock_path = project_path
        .join(".ralph-ui")
        .join(format!("session-{}.lock", session_id));

    if lock_path.exists() {
        fs::remove_file(&lock_path)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_dir() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn test_creates_lock_file_with_pid_and_timestamp() {
        let temp_dir = create_test_dir();
        let mut lock = SessionLock::new(temp_dir.path(), "test-session");

        let acquired = lock.acquire().unwrap();
        assert!(acquired);
        assert!(lock.is_owner());

        let info = lock.get_lock_info().unwrap().unwrap();
        assert_eq!(info.pid, std::process::id());
        assert_eq!(info.session_id, "test-session");
        assert!(info.timestamp <= Utc::now());
    }

    #[test]
    fn test_detects_stale_lock_expired_timestamp() {
        let temp_dir = create_test_dir();
        let lock = SessionLock::new(temp_dir.path(), "test-session").with_timeout(1);

        // Create a lock with old timestamp
        let old_info = LockInfo {
            pid: std::process::id(),
            timestamp: Utc::now() - Duration::minutes(10),
            session_id: "test-session".to_string(),
            version: "1.0.0".to_string(),
        };

        assert!(lock.is_lock_stale(&old_info));
    }

    #[test]
    fn test_detects_stale_lock_dead_pid() {
        let temp_dir = create_test_dir();
        let lock = SessionLock::new(temp_dir.path(), "test-session");

        // Create a lock with non-existent PID
        let dead_info = LockInfo {
            pid: 999999, // Very unlikely to be a real PID
            timestamp: Utc::now(),
            session_id: "test-session".to_string(),
            version: "1.0.0".to_string(),
        };

        // On most systems, PID 999999 won't exist
        // This test may be flaky if such a PID happens to exist
        assert!(lock.is_lock_stale(&dead_info));
    }

    #[test]
    fn test_releases_lock_on_drop() {
        let temp_dir = create_test_dir();

        {
            let mut lock = SessionLock::new(temp_dir.path(), "test-session");
            lock.acquire().unwrap();
            assert!(lock.exists());
        } // lock drops here

        // Lock file should be removed
        let lock = SessionLock::new(temp_dir.path(), "test-session");
        assert!(!lock.exists());
    }

    #[test]
    fn test_fails_to_acquire_lock_when_already_held() {
        let temp_dir = create_test_dir();

        let mut lock1 = SessionLock::new(temp_dir.path(), "test-session");
        assert!(lock1.acquire().unwrap());

        // Another instance should fail to acquire
        let mut lock2 = SessionLock::new(temp_dir.path(), "test-session");
        assert!(!lock2.acquire().unwrap());
    }

    #[test]
    fn test_handles_missing_lock_file_gracefully() {
        let temp_dir = create_test_dir();
        let lock = SessionLock::new(temp_dir.path(), "nonexistent");

        let info = lock.get_lock_info().unwrap();
        assert!(info.is_none());
        assert!(!lock.exists());
    }

    #[test]
    fn test_find_stale_locks() {
        let temp_dir = create_test_dir();

        // Create a stale lock manually
        let lock_dir = temp_dir.path().join(".ralph-ui");
        fs::create_dir_all(&lock_dir).unwrap();

        let stale_info = LockInfo {
            pid: 999999,
            timestamp: Utc::now() - Duration::minutes(60),
            session_id: "stale-session".to_string(),
            version: "1.0.0".to_string(),
        };

        let lock_path = lock_dir.join("session-stale-session.lock");
        let contents = serde_json::to_string(&stale_info).unwrap();
        fs::write(&lock_path, contents).unwrap();

        let stale_locks = find_stale_locks(temp_dir.path()).unwrap();
        assert_eq!(stale_locks.len(), 1);
        assert_eq!(stale_locks[0].0, "stale-session");
    }

    #[test]
    fn test_remove_stale_lock() {
        let temp_dir = create_test_dir();
        let lock_dir = temp_dir.path().join(".ralph-ui");
        fs::create_dir_all(&lock_dir).unwrap();

        let lock_path = lock_dir.join("session-test.lock");
        fs::write(&lock_path, "{}").unwrap();
        assert!(lock_path.exists());

        remove_stale_lock(temp_dir.path(), "test").unwrap();
        assert!(!lock_path.exists());
    }

    #[test]
    fn test_lock_refresh() {
        let temp_dir = create_test_dir();
        let mut lock = SessionLock::new(temp_dir.path(), "test-session");

        lock.acquire().unwrap();
        let info1 = lock.get_lock_info().unwrap().unwrap();

        // Small delay
        std::thread::sleep(std::time::Duration::from_millis(10));

        lock.refresh().unwrap();
        let info2 = lock.get_lock_info().unwrap().unwrap();

        // Timestamp should be updated
        assert!(info2.timestamp >= info1.timestamp);
    }
}
