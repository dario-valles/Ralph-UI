//! Git data types and structures
//!
//! Contains all shared types used across git operations

use serde::{Deserialize, Serialize};

/// Represents a git branch
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BranchInfo {
    pub name: String,
    pub is_head: bool,
    pub upstream: Option<String>,
    pub commit_id: String,
}

/// Represents a git commit
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommitInfo {
    pub id: String,
    pub short_id: String,
    pub message: String,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub parent_ids: Vec<String>,
}

/// Represents a git worktree
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeInfo {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub is_locked: bool,
}

/// Represents a file status in git
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileStatus {
    pub path: String,
    pub status: String,
}

/// Represents a diff between commits/branches
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiffInfo {
    pub files_changed: usize,
    pub insertions: usize,
    pub deletions: usize,
    pub files: Vec<FileDiff>,
}

/// Represents a file diff
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileDiff {
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub status: String,
    pub insertions: usize,
    pub deletions: usize,
}

/// Represents the result of a merge operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    pub success: bool,
    pub message: String,
    pub conflict_files: Vec<String>,
    pub commit_id: Option<String>,
    pub fast_forward: bool,
}

/// Detailed information about a single file in conflict
/// Used for AI-assisted conflict resolution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictInfo {
    pub path: String,
    /// Content from target branch (ours)
    pub our_content: String,
    /// Content from source branch (theirs)
    pub their_content: String,
    /// Content from common ancestor
    pub ancestor_content: String,
    /// Full file content with conflict markers
    pub conflict_markers: String,
}
