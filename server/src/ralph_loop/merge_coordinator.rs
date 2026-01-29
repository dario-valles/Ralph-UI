//! Merge Coordinator for Parallel Execution
//!
//! Handles merging completed agent work from parallel worktree branches
//! back into the main branch.

use crate::git::GitManager;
use std::path::{Path, PathBuf};

/// Result of a merge operation
#[derive(Debug, Clone)]
pub enum MergeResult {
    /// Merge completed successfully
    Success {
        /// Number of files changed
        files_changed: usize,
        /// Commit hash of the merge commit
        commit_hash: String,
    },
    /// Merge failed due to conflicts
    Conflict(ConflictInfo),
    /// Merge failed for another reason
    Error(String),
}

/// Information about merge conflicts
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictInfo {
    /// Story ID that caused the conflict
    pub story_id: String,
    /// Branch name that conflicted
    pub branch_name: String,
    /// Files with conflicts
    pub conflicting_files: Vec<String>,
    /// Timestamp of conflict detection
    pub detected_at: String,
}

/// Completed work ready for merging
#[derive(Debug, Clone)]
pub struct CompletedWork {
    /// Story ID
    pub story_id: String,
    /// Branch name with the completed work
    pub branch_name: String,
    /// Path to the worktree
    pub worktree_path: PathBuf,
    /// Agent ID that completed the work
    pub agent_id: String,
}

/// Coordinator for merging parallel agent work
pub struct MergeCoordinator {
    /// Path to the main project
    project_path: PathBuf,
    /// Target branch to merge into
    target_branch: String,
    /// Queue of conflicts waiting for resolution
    conflict_queue: Vec<ConflictInfo>,
}

impl MergeCoordinator {
    /// Create a new merge coordinator
    pub fn new(project_path: &Path, target_branch: &str) -> Self {
        Self {
            project_path: project_path.to_path_buf(),
            target_branch: target_branch.to_string(),
            conflict_queue: Vec::new(),
        }
    }

    /// Get the target branch for merges
    pub fn target_branch(&self) -> &str {
        &self.target_branch
    }

    /// Get queued conflicts
    pub fn conflicts(&self) -> &[ConflictInfo] {
        &self.conflict_queue
    }

    /// Clear a conflict from the queue (after resolution)
    pub fn clear_conflict(&mut self, story_id: &str) {
        self.conflict_queue.retain(|c| c.story_id != story_id);
    }

    /// Merge completed agent work into the target branch
    ///
    /// This uses git merge with a commit message describing the completed story.
    /// If conflicts occur, they are recorded and the merge is aborted.
    pub fn merge(&mut self, completed: &CompletedWork) -> Result<MergeResult, String> {
        log::info!(
            "[MergeCoordinator] Merging story {} from branch {}",
            completed.story_id,
            completed.branch_name
        );

        let git_manager = GitManager::new(&self.project_path)
            .map_err(|e| format!("Failed to open git repository: {}", e))?;

        // Use the existing merge_branch method which handles checkout, merge, and commit
        match git_manager.merge_branch(&completed.branch_name, &self.target_branch) {
            Ok(merge_result) => {
                if merge_result.success {
                    log::info!(
                        "[MergeCoordinator] Successfully merged story {}: {}",
                        completed.story_id,
                        merge_result.message
                    );

                    Ok(MergeResult::Success {
                        files_changed: 0, // merge_result doesn't track this directly
                        commit_hash: merge_result.commit_id.unwrap_or_default(),
                    })
                } else if !merge_result.conflict_files.is_empty() {
                    // Merge had conflicts - abort and record
                    if let Err(abort_err) = git_manager.merge_abort() {
                        log::warn!("[MergeCoordinator] Failed to abort merge: {}", abort_err);
                    }

                    let conflict_info = ConflictInfo {
                        story_id: completed.story_id.clone(),
                        branch_name: completed.branch_name.clone(),
                        conflicting_files: merge_result.conflict_files,
                        detected_at: chrono::Utc::now().to_rfc3339(),
                    };

                    log::warn!(
                        "[MergeCoordinator] Conflict detected for story {}: {:?}",
                        completed.story_id,
                        conflict_info.conflicting_files
                    );

                    // Add to conflict queue
                    self.conflict_queue.push(conflict_info.clone());

                    Ok(MergeResult::Conflict(conflict_info))
                } else {
                    // Some other failure
                    log::error!(
                        "[MergeCoordinator] Merge failed for story {}: {}",
                        completed.story_id,
                        merge_result.message
                    );
                    Ok(MergeResult::Error(merge_result.message))
                }
            }
            Err(e) => {
                let error_str = e.to_string();
                log::error!(
                    "[MergeCoordinator] Merge error for story {}: {}",
                    completed.story_id,
                    error_str
                );
                Ok(MergeResult::Error(error_str))
            }
        }
    }

    /// Check if a branch can be merged without conflicts
    ///
    /// This does a dry-run merge check without actually performing the merge.
    pub fn check_can_merge(&self, branch_name: &str) -> Result<bool, String> {
        let git_manager = GitManager::new(&self.project_path)
            .map_err(|e| format!("Failed to open git repository: {}", e))?;

        let conflicts = git_manager
            .check_merge_conflicts(branch_name, &self.target_branch)
            .map_err(|e| format!("Failed to check merge conflicts: {}", e))?;

        Ok(conflicts.is_empty())
    }

    /// Sync PRD files from a worktree back to the main project
    ///
    /// Called after successful merge to ensure PRD status is up to date.
    pub fn sync_prd_from_worktree(
        &self,
        worktree_path: &Path,
        prd_name: &str,
    ) -> Result<(), String> {
        let src_prds_dir = worktree_path.join(".ralph-ui").join("prds");
        let dst_prds_dir = self.project_path.join(".ralph-ui").join("prds");

        if !src_prds_dir.exists() {
            return Ok(()); // No PRD files to sync
        }

        // Ensure destination directory exists
        std::fs::create_dir_all(&dst_prds_dir)
            .map_err(|e| format!("Failed to create .ralph-ui/prds directory: {}", e))?;

        // Sync PRD JSON file (most important - contains pass/fail status)
        let prd_filename = format!("{}.json", prd_name);
        let src_prd = src_prds_dir.join(&prd_filename);
        let dst_prd = dst_prds_dir.join(&prd_filename);

        if src_prd.exists() {
            std::fs::copy(&src_prd, &dst_prd)
                .map_err(|e| format!("Failed to sync PRD file: {}", e))?;
            log::debug!(
                "[MergeCoordinator] Synced {} from worktree to main project",
                prd_filename
            );
        }

        Ok(())
    }
}

/// Check if an error message indicates a merge conflict
#[allow(dead_code)]
fn is_conflict_error(error: &str) -> bool {
    let error_lower = error.to_lowercase();
    error_lower.contains("conflict")
        || error_lower.contains("merge")
            && (error_lower.contains("fail") || error_lower.contains("cannot"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_conflict_error() {
        assert!(is_conflict_error("Merge conflict in file.rs"));
        assert!(is_conflict_error("CONFLICT (content): Merge conflict"));
        assert!(is_conflict_error("Cannot merge: conflicts detected"));
        assert!(!is_conflict_error("Successfully merged"));
        assert!(!is_conflict_error("Branch not found"));
    }
}
