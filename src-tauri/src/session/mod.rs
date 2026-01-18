// Session management (lock files, recovery, progress tracking)

pub mod lock;
pub mod progress;
pub mod recovery;

// Re-export main types
// Note: ProgressEntry and RecoveryResult are accessible via full path when needed
pub use progress::{ProgressStatus, ProgressTracker};
pub use recovery::auto_recover_on_startup;
