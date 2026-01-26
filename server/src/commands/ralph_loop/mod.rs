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

mod assignments;
mod brief;
mod config;
mod execution;
mod helpers;
mod iterations;
mod learnings;
mod notifications;
mod prd_ops;
mod progress;
mod story_ops;
mod worktrees;

#[cfg(test)]
mod tests;

// Re-export all public items
pub use assignments::*;
pub use brief::*;
pub use config::*;
pub use execution::*;
pub use helpers::{RalphFiles, RalphLoopManagerState};
pub use iterations::*;
pub use learnings::*;
pub use notifications::send_test_notification;
pub use prd_ops::*;
pub use progress::*;
pub use story_ops::*;
pub use worktrees::*;
