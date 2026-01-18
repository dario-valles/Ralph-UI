// Session management (lock files, recovery, progress tracking)

pub mod lock;
pub mod progress;
pub mod recovery;

// Re-export main types
pub use progress::{ProgressEntry, ProgressStatus, ProgressTracker};
pub use recovery::{auto_recover_on_startup, RecoveryResult};
