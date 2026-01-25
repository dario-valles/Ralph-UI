//! Worktree management: cleanup, list

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ============================================================================
// Types
// ============================================================================

/// Information about a Ralph worktree
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphWorktreeInfo {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub is_locked: bool,
}

// ============================================================================
// Worktree Operations
// ============================================================================

/// Cleanup a Ralph loop worktree
///
/// Removes the git worktree and optionally deletes the directory.
/// The worktree should be kept for review until this command is called.
pub fn cleanup_ralph_worktree(
    project_path: String,
    worktree_path: String,
    delete_directory: Option<bool>,
) -> Result<(), String> {
    use crate::git::GitManager;

    log::info!("[RalphLoop] Cleaning up worktree at {}", worktree_path);

    // Remove the git worktree
    let git_manager = GitManager::new(&project_path)
        .map_err(|e| format!("Failed to open git repository: {}", e))?;

    git_manager
        .remove_worktree(&worktree_path)
        .map_err(|e| format!("Failed to remove worktree: {}", e))?;

    // Optionally delete the directory
    if delete_directory.unwrap_or(true) {
        let path = PathBuf::from(&worktree_path);
        if path.exists() {
            std::fs::remove_dir_all(&path)
                .map_err(|e| format!("Failed to delete worktree directory: {}", e))?;
            log::info!(
                "[RalphLoop] Deleted worktree directory at {}",
                worktree_path
            );
        }
    }

    Ok(())
}

/// List all Ralph worktrees for a project
pub fn list_ralph_worktrees(project_path: String) -> Result<Vec<RalphWorktreeInfo>, String> {
    use crate::git::GitManager;

    let git_manager = GitManager::new(&project_path)
        .map_err(|e| format!("Failed to open git repository: {}", e))?;

    let worktrees = git_manager
        .list_worktrees()
        .map_err(|e| format!("Failed to list worktrees: {}", e))?;

    // Filter to only ralph worktrees (path contains "ralph-")
    let ralph_worktrees: Vec<RalphWorktreeInfo> = worktrees
        .into_iter()
        .filter(|wt| wt.path.contains("ralph-") || wt.name.starts_with("ralph"))
        .map(|wt| RalphWorktreeInfo {
            name: wt.name,
            path: wt.path,
            branch: wt.branch,
            is_locked: wt.is_locked,
        })
        .collect();

    Ok(ralph_worktrees)
}
