// Parallel execution and agent orchestration

pub mod pool;
pub mod scheduler;
pub mod coordinator;
pub mod conflicts;

// Re-export for convenience
pub use pool::AgentPool;
pub use scheduler::ParallelScheduler;
pub use coordinator::WorktreeCoordinator;
pub use conflicts::{ConflictDetector, MergeConflict, ConflictResolutionStrategy};
