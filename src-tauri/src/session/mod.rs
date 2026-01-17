// Session management (lock files, recovery)

pub mod lock;
pub mod recovery;

// Re-export main types
pub use recovery::{auto_recover_on_startup, RecoveryResult};
