//! Git operations using git2-rs
//!
//! This module provides git functionality organized into focused submodules:
//! - `manager` - Core GitManager struct and basic operations
//! - `branches` - Branch operations (create, delete, list, checkout)
//! - `worktrees` - Worktree management (add, remove, list)
//! - `commits` - Commit operations (commit, history, diff)
//! - `merge` - Merge and conflict handling
//! - `status` - Status and file tracking operations
//! - `types` - Shared data structures
//! - `ai_resolver` - AI-powered conflict resolution
//!
//! Some methods are infrastructure for future features (worktree management, conflict resolution)
#![allow(dead_code)]

// Submodules
pub mod ai_resolver;
mod branches;
mod commits;
mod manager;
mod merge;
mod status;
#[cfg(test)]
mod tests;
mod types;
mod worktrees;

// Re-export the main GitManager struct
pub use manager::GitManager;

// Re-export all types for public use
// FileDiff is re-exported because DiffInfo contains Vec<FileDiff>
#[allow(unused_imports)]
pub use types::{
    BranchInfo, CommitInfo, ConflictInfo, DiffInfo, FileDiff, FileStatus, MergeResult, WorktreeInfo,
};
