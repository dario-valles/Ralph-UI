//! Backend commands for Ralph Wiggum Loop orchestration
//!
//! These commands control the external Ralph loop that spawns fresh agent instances.
//!
//! This module is organized into submodules:
//! - prd_ops: PRD CRUD operations (init, get, update, delete)
//! - story_ops: Story management (add, remove, mark passing/failing)
//! - execution: Loop execution (start, stop, get_state, get_metrics)
//! - assignments: Assignment operations (assign, release, get_files_in_use)
//! - learnings: Learning management (add, update, delete, export)
//! - progress: Progress tracking (get, add_note, clear, summary)
//! - brief: Brief operations (get, regenerate, historical)
//! - config: Config operations (get, set, init, update)
//! - worktrees: Worktree management (cleanup, list)
//! - iterations: Iteration history operations

mod prd_ops;
mod story_ops;
mod execution;
mod assignments;
mod learnings;
mod progress;
mod brief;
mod config;
mod worktrees;
mod iterations;
mod notifications;
mod helpers;

#[cfg(test)]
mod tests;

// Re-export all public items
pub use prd_ops::*;
pub use story_ops::*;
pub use execution::*;
pub use assignments::*;
pub use learnings::*;
pub use progress::*;
pub use brief::*;
pub use config::*;
pub use worktrees::*;
pub use iterations::*;
pub use notifications::send_test_notification;
pub use helpers::{RalphLoopManagerState, RalphFiles};
