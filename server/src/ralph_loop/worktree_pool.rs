//! Worktree Pool for Parallel Execution
//!
//! Manages multiple git worktrees for parallel agent execution.
//! Each parallel agent gets its own isolated worktree to work in.

use crate::git::GitManager;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Information about an allocated worktree
#[derive(Debug, Clone)]
pub struct WorktreeAllocation {
    /// Story ID this worktree is allocated for
    pub story_id: String,
    /// Path to the worktree directory
    pub path: PathBuf,
    /// Branch name for this worktree
    pub branch_name: String,
    /// Agent ID working in this worktree
    pub agent_id: Option<String>,
}

/// Pool of worktrees for parallel execution
pub struct WorktreePool {
    /// Path to the main project
    project_path: PathBuf,
    /// Base branch to create worktrees from (kept for future use in branch naming)
    #[allow(dead_code)]
    base_branch: String,
    /// Currently active worktrees (story_id -> allocation)
    active: HashMap<String, WorktreeAllocation>,
    /// Maximum number of worktrees (matches max_parallel)
    max_worktrees: usize,
    /// PRD name for unique worktree naming
    prd_name: String,
}

impl WorktreePool {
    /// Create a new worktree pool
    pub fn new(
        project_path: &Path,
        base_branch: &str,
        max_worktrees: usize,
        prd_name: &str,
    ) -> Self {
        Self {
            project_path: project_path.to_path_buf(),
            base_branch: base_branch.to_string(),
            active: HashMap::new(),
            max_worktrees,
            prd_name: prd_name.to_string(),
        }
    }

    /// Get the number of available worktree slots
    pub fn available_slots(&self) -> usize {
        self.max_worktrees.saturating_sub(self.active.len())
    }

    /// Check if a story already has an allocated worktree
    pub fn has_worktree(&self, story_id: &str) -> bool {
        self.active.contains_key(story_id)
    }

    /// Get worktree allocation for a story
    pub fn get_allocation(&self, story_id: &str) -> Option<&WorktreeAllocation> {
        self.active.get(story_id)
    }

    /// Get all active allocations
    pub fn active_allocations(&self) -> impl Iterator<Item = &WorktreeAllocation> {
        self.active.values()
    }

    /// Acquire a worktree for a story
    ///
    /// Creates a new git worktree with an isolated branch for the story.
    /// Returns the worktree allocation if successful.
    pub fn acquire(&mut self, story_id: &str) -> Result<WorktreeAllocation, String> {
        // Check if already allocated
        if let Some(existing) = self.active.get(story_id) {
            return Ok(existing.clone());
        }

        // Check if we have available slots
        if self.active.len() >= self.max_worktrees {
            return Err(format!(
                "Worktree pool exhausted: {} active, max {}",
                self.active.len(),
                self.max_worktrees
            ));
        }

        // Generate branch name: ralph-parallel/{prd_name}/{story_id}
        let branch_name = format!(
            "ralph-parallel/{}/{}",
            sanitize_branch_name(&self.prd_name),
            sanitize_branch_name(story_id)
        );

        // Generate worktree path: {project}/.worktrees/parallel/{story_id}
        let worktree_path = self
            .project_path
            .join(".worktrees")
            .join("parallel")
            .join(sanitize_path_component(story_id));

        // Create parent directory if needed
        if let Some(parent) = worktree_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create worktree directory: {}", e))?;
        }

        // Create git manager
        let git_manager = GitManager::new(&self.project_path)
            .map_err(|e| format!("Failed to open git repository: {}", e))?;

        // Prune any orphaned worktrees first
        if let Err(e) = git_manager.prune_orphaned_worktrees() {
            log::warn!("[WorktreePool] Failed to prune orphaned worktrees: {}", e);
        }

        // Clean up if worktree path exists but is invalid
        if worktree_path.exists() && !worktree_path.join(".git").exists() {
            log::warn!(
                "[WorktreePool] Removing invalid worktree at {:?}",
                worktree_path
            );
            if let Err(e) = std::fs::remove_dir_all(&worktree_path) {
                log::warn!("[WorktreePool] Failed to remove stale directory: {}", e);
            }
        }

        // Try to delete any stale branch with the same name
        if let Err(e) = git_manager.delete_branch(&branch_name) {
            log::debug!(
                "[WorktreePool] Branch {} didn't exist or couldn't be deleted: {}",
                branch_name,
                e
            );
        }

        // Create worktree with new branch
        git_manager
            .create_worktree(&branch_name, worktree_path.to_str().unwrap())
            .map_err(|e| format!("Failed to create worktree: {}", e))?;

        log::info!(
            "[WorktreePool] Created worktree for story {} at {:?} on branch {}",
            story_id,
            worktree_path,
            branch_name
        );

        // Sync PRD files to the new worktree
        self.sync_prd_to_worktree(&worktree_path)?;

        let allocation = WorktreeAllocation {
            story_id: story_id.to_string(),
            path: worktree_path,
            branch_name,
            agent_id: None,
        };

        self.active.insert(story_id.to_string(), allocation.clone());
        Ok(allocation)
    }

    /// Set the agent ID for a worktree allocation
    pub fn set_agent_id(&mut self, story_id: &str, agent_id: &str) {
        if let Some(allocation) = self.active.get_mut(story_id) {
            allocation.agent_id = Some(agent_id.to_string());
        }
    }

    /// Release a worktree after completion
    ///
    /// Removes the worktree and cleans up the branch.
    /// Call this after successfully merging the agent's work.
    pub fn release(&mut self, story_id: &str) -> Result<(), String> {
        let allocation = match self.active.remove(story_id) {
            Some(a) => a,
            None => return Ok(()), // Already released
        };

        let git_manager = GitManager::new(&self.project_path)
            .map_err(|e| format!("Failed to open git repository: {}", e))?;

        // Remove the worktree from git
        if let Err(e) = git_manager.remove_worktree(allocation.path.to_str().unwrap()) {
            log::warn!("[WorktreePool] Failed to remove worktree from git: {}", e);
        }

        // Remove the worktree directory
        if allocation.path.exists() {
            if let Err(e) = std::fs::remove_dir_all(&allocation.path) {
                log::warn!("[WorktreePool] Failed to remove worktree directory: {}", e);
            }
        }

        // Delete the branch (optional - keep for history)
        // Note: We keep the branch for now so work isn't lost if merge fails
        // if let Err(e) = git_manager.delete_branch(&allocation.branch_name) {
        //     log::warn!("[WorktreePool] Failed to delete branch: {}", e);
        // }

        log::info!(
            "[WorktreePool] Released worktree for story {} at {:?}",
            story_id,
            allocation.path
        );

        Ok(())
    }

    /// Release all worktrees (cleanup on shutdown)
    pub fn release_all(&mut self) -> Result<(), String> {
        let story_ids: Vec<String> = self.active.keys().cloned().collect();
        for story_id in story_ids {
            if let Err(e) = self.release(&story_id) {
                log::warn!(
                    "[WorktreePool] Failed to release worktree for {}: {}",
                    story_id,
                    e
                );
            }
        }
        Ok(())
    }

    /// Sync PRD files from main project to a worktree
    fn sync_prd_to_worktree(&self, worktree_path: &Path) -> Result<(), String> {
        let src_prds_dir = self.project_path.join(".ralph-ui").join("prds");
        let dst_prds_dir = worktree_path.join(".ralph-ui").join("prds");

        if !src_prds_dir.exists() {
            return Ok(()); // No PRD files to sync
        }

        // Ensure destination directory exists
        std::fs::create_dir_all(&dst_prds_dir)
            .map_err(|e| format!("Failed to create .ralph-ui/prds directory: {}", e))?;

        // Copy PRD-specific files
        for ext in &["json", "txt", "md"] {
            let filename = if *ext == "json" {
                format!("{}.{}", self.prd_name, ext)
            } else if *ext == "txt" {
                format!("{}-progress.{}", self.prd_name, ext)
            } else {
                format!("{}-prompt.{}", self.prd_name, ext)
            };

            let src_file = src_prds_dir.join(&filename);
            let dst_file = dst_prds_dir.join(&filename);

            if src_file.exists() {
                std::fs::copy(&src_file, &dst_file)
                    .map_err(|e| format!("Failed to copy {}: {}", filename, e))?;
            }
        }

        log::debug!(
            "[WorktreePool] Synced PRD files to worktree at {:?}",
            worktree_path
        );
        Ok(())
    }
}

/// Sanitize a string for use in a branch name
fn sanitize_branch_name(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect::<String>()
        .to_lowercase()
}

/// Sanitize a string for use as a path component
fn sanitize_path_component(s: &str) -> String {
    s.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_branch_name() {
        assert_eq!(sanitize_branch_name("US-1.1"), "us-1-1");
        assert_eq!(sanitize_branch_name("my feature/story"), "my-feature-story");
        assert_eq!(sanitize_branch_name("CAPS_123"), "caps_123");
    }

    #[test]
    fn test_sanitize_path_component() {
        assert_eq!(sanitize_path_component("US-1.1"), "US-1_1");
        assert_eq!(sanitize_path_component("my/path"), "my_path");
    }

    #[test]
    fn test_available_slots() {
        let pool = WorktreePool::new(Path::new("/tmp"), "main", 3, "test-prd");
        assert_eq!(pool.available_slots(), 3);
    }
}
