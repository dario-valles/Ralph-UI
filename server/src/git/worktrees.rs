//! Worktree management for GitManager
//!
//! Contains methods for creating, listing, and removing worktrees

use git2::{BranchType, Error as GitError, Repository, Worktree};
use std::path::Path;

use crate::git::types::WorktreeInfo;
use crate::git::GitManager;

impl GitManager {
    /// Create a worktree
    pub fn create_worktree(&self, branch: &str, path: &str) -> Result<WorktreeInfo, GitError> {
        use git2::WorktreeAddOptions;

        // Check if branch already exists, create it if not
        let branch_exists = self.repo.find_branch(branch, BranchType::Local).is_ok();
        if !branch_exists {
            self.create_branch(branch, false)?;
        }

        // Get the branch reference (now guaranteed to exist)
        let branch_ref = self.repo.find_branch(branch, BranchType::Local)?;

        // Create worktree options with the branch reference
        let mut opts = WorktreeAddOptions::new();
        opts.reference(Some(branch_ref.get()));

        // Sanitize the worktree name to avoid nested directories in .git/worktrees/
        // Branch names like "task/uuid" would create ".git/worktrees/task/uuid" which fails
        let worktree_name = branch.replace('/', "-");

        // Create the worktree with the branch reference
        let worktree = self
            .repo
            .worktree(&worktree_name, Path::new(path), Some(&opts))?;

        Ok(self.worktree_to_info(&worktree)?)
    }

    /// List all worktrees
    pub fn list_worktrees(&self) -> Result<Vec<WorktreeInfo>, GitError> {
        let worktrees = self.repo.worktrees()?;

        let mut result = Vec::new();
        for name in worktrees.iter() {
            if let Some(name_str) = name {
                if let Ok(worktree) = self.repo.find_worktree(name_str) {
                    result.push(self.worktree_to_info(&worktree)?);
                }
            }
        }

        Ok(result)
    }

    /// Remove a worktree by path
    /// Searches all worktrees to find one matching the given path
    pub fn remove_worktree(&self, path: &str) -> Result<(), GitError> {
        let worktrees = self.repo.worktrees()?;

        // Find the worktree with matching path
        for name in worktrees.iter() {
            if let Some(name_str) = name {
                if let Ok(worktree) = self.repo.find_worktree(name_str) {
                    let worktree_path = worktree.path().to_string_lossy();
                    if worktree_path == path
                        || worktree_path.trim_end_matches('/') == path.trim_end_matches('/')
                    {
                        // Found the worktree, prune it
                        worktree.prune(None)?;
                        return Ok(());
                    }
                }
            }
        }

        // If no worktree found by path, try using the path as a name directly (fallback)
        if let Ok(worktree) = self.repo.find_worktree(path) {
            worktree.prune(None)?;
            return Ok(());
        }

        Err(GitError::from_str(&format!("Worktree not found: {}", path)))
    }

    /// Prune orphaned worktrees (where the physical directory no longer exists)
    /// This cleans up stale entries in .git/worktrees/
    pub fn prune_orphaned_worktrees(&self) -> Result<u32, GitError> {
        let worktrees = self.repo.worktrees()?;
        let mut pruned_count = 0;

        for name in worktrees.iter() {
            if let Some(name_str) = name {
                if let Ok(worktree) = self.repo.find_worktree(name_str) {
                    let worktree_path = worktree.path();
                    // Check if the physical worktree directory exists
                    if !worktree_path.exists() {
                        log::info!(
                            "[Git] Pruning orphaned worktree '{}' (path {:?} no longer exists)",
                            name_str,
                            worktree_path
                        );
                        if let Err(e) = worktree.prune(None) {
                            log::warn!("[Git] Failed to prune worktree '{}': {}", name_str, e);
                        } else {
                            pruned_count += 1;
                        }
                    }
                }
            }
        }

        Ok(pruned_count)
    }

    /// Convert a Worktree to WorktreeInfo
    pub(crate) fn worktree_to_info(&self, worktree: &Worktree) -> Result<WorktreeInfo, GitError> {
        let name = worktree.name().unwrap_or("").to_string();
        let path = worktree.path().to_string_lossy().to_string();
        let is_locked = worktree
            .is_locked()
            .map(|status| !matches!(status, git2::WorktreeLockStatus::Unlocked))
            .unwrap_or(false);

        // Try to determine the branch for this worktree
        let branch = if let Ok(wt_repo) = Repository::open(worktree.path()) {
            if let Ok(head) = wt_repo.head() {
                if head.is_branch() {
                    head.shorthand().map(|s| s.to_string())
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        };

        Ok(WorktreeInfo {
            name,
            path,
            branch,
            is_locked,
        })
    }
}
