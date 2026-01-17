// Session management (lock files, recovery)

pub mod lock;
pub mod recovery;

// Re-export main types
pub use lock::{SessionLock, LockInfo, find_stale_locks, remove_stale_lock};
pub use recovery::{SessionRecovery, RecoveryStatus, CrashedSession, RecoveryResult, auto_recover_on_startup};
