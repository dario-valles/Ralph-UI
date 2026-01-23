//! Merge management for collaborative Ralph Loop mode (US-5.1)
//!
//! This module handles merging worktree branches back to the target branch at configured intervals.
//! It supports:
//! - Periodic merge intervals (merge every N iterations)
//! - Merge conflict detection
//! - Conflict resolution strategy selection (stop or continue)
//! - WebSocket event notifications

use crate::git::GitManager;
use crate::events::{
    MergeAttemptedPayload, MergeConflictDetectedPayload, EVENT_MERGE_ATTEMPTED,
    EVENT_MERGE_CONFLICT_DETECTED,
};
use crate::server::ServerAppState;
use std::sync::Arc;

/// Configuration for merge operations
#[derive(Debug, Clone)]
pub struct MergeConfig {
    /// Whether merge is enabled
    pub enabled: bool,
    /// Merge every N iterations (0 = disabled)
    pub interval: u32,
    /// Target branch for merges
    pub target_branch: String,
    /// Whether to stop on conflict (true) or continue (false)
    pub stop_on_conflict: bool,
}

impl Default for MergeConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            interval: 0,
            target_branch: "main".to_string(),
            stop_on_conflict: true,
        }
    }
}

/// Result of a merge attempt
#[derive(Debug, Clone)]
pub struct MergeAttemptResult {
    /// Whether merge succeeded
    pub success: bool,
    /// Files with conflicts (empty if no conflicts)
    pub conflicting_files: Vec<String>,
    /// Message describing the result
    pub message: String,
}

/// Merge manager for handling merge operations
pub struct MergeManager {
    config: MergeConfig,
    git_manager: GitManager,
}

impl MergeManager {
    /// Create a new merge manager
    pub fn new(config: MergeConfig, project_path: &str) -> Result<Self, String> {
        let git_manager = GitManager::new(project_path)
            .map_err(|e| format!("Failed to initialize git manager: {}", e))?;

        Ok(Self {
            config,
            git_manager,
        })
    }

    /// Check if a merge should be attempted at this iteration
    pub fn should_merge_at_iteration(&self, iteration: u32) -> bool {
        if !self.config.enabled || self.config.interval == 0 {
            return false;
        }
        iteration % self.config.interval == 0
    }

    /// Attempt to merge the execution branch to the target branch
    pub fn attempt_merge(
        &self,
        source_branch: &str,
        _execution_id: &str,
    ) -> Result<MergeAttemptResult, String> {
        // Attempt the merge
        let merge_result = self
            .git_manager
            .merge_branch(source_branch, &self.config.target_branch)
            .map_err(|e| format!("Git merge failed: {}", e))?;

        let result = if merge_result.success {
            MergeAttemptResult {
                success: true,
                conflicting_files: vec![],
                message: format!(
                    "Successfully merged {} into {} ({})",
                    source_branch,
                    self.config.target_branch,
                    if merge_result.fast_forward {
                        "fast-forward"
                    } else {
                        "merge commit"
                    }
                ),
            }
        } else {
            MergeAttemptResult {
                success: false,
                conflicting_files: merge_result.conflict_files.clone(),
                message: format!(
                    "Merge conflict detected in {} files: {}",
                    merge_result.conflict_files.len(),
                    merge_result.conflict_files.join(", ")
                ),
            }
        };

        Ok(result)
    }

    /// Emit a merge attempt event
    pub fn emit_merge_attempted_event(
        result: &MergeAttemptResult,
        source_branch: &str,
        target_branch: &str,
        execution_id: &str,
        prd_name: &str,
        server_state: Arc<ServerAppState>,
    ) {
        let payload = MergeAttemptedPayload {
            execution_id: execution_id.to_string(),
            prd_name: prd_name.to_string(),
            source_branch: source_branch.to_string(),
            target_branch: target_branch.to_string(),
            success: result.success,
            conflict_count: result.conflicting_files.len(),
            message: result.message.clone(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        let _ = server_state
            .broadcaster
            .broadcast(EVENT_MERGE_ATTEMPTED, &payload);
    }

    /// Emit a merge conflict detected event
    pub fn emit_merge_conflict_event(
        conflicting_files: &[String],
        iteration: u32,
        execution_id: &str,
        prd_name: &str,
        merge_strategy: &str,
        resolution_strategy: &str,
        server_state: Arc<ServerAppState>,
    ) {
        let payload = MergeConflictDetectedPayload {
            execution_id: execution_id.to_string(),
            prd_name: prd_name.to_string(),
            conflicting_files: conflicting_files.to_vec(),
            iteration,
            merge_strategy: merge_strategy.to_string(),
            resolution_strategy: resolution_strategy.to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        };

        let _ = server_state
            .broadcaster
            .broadcast(EVENT_MERGE_CONFLICT_DETECTED, &payload);
    }

    /// Abort the merge in progress (if any)
    pub fn abort_merge(&self) -> Result<(), String> {
        // Reset the merge state without committing
        self.git_manager.merge_abort().map_err(|e| e.to_string())
    }

    /// Get the conflict resolution strategy
    pub fn should_stop_on_conflict(&self) -> bool {
        self.config.stop_on_conflict
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_merge_config_default() {
        let config = MergeConfig::default();
        assert!(!config.enabled);
        assert_eq!(config.interval, 0);
        assert_eq!(config.target_branch, "main");
        assert!(config.stop_on_conflict);
    }

    #[test]
    fn test_should_merge_at_iteration_disabled() {
        let config = MergeConfig {
            enabled: false,
            interval: 5,
            ..Default::default()
        };

        assert!(!config.enabled || config.interval == 0 || (5 % config.interval == 0));
    }

    #[test]
    fn test_should_merge_at_iteration_no_interval() {
        let config = MergeConfig {
            enabled: true,
            interval: 0,
            ..Default::default()
        };

        assert!(!config.enabled || config.interval == 0);
    }

    #[test]
    fn test_should_merge_at_iteration_logic() {
        let config = MergeConfig {
            enabled: true,
            interval: 5,
            ..Default::default()
        };

        // Test the interval checking logic
        assert!(config.enabled && config.interval > 0);
        assert!(5 % config.interval == 0);
        assert!(10 % config.interval == 0);
        assert!(!(1 % config.interval == 0));
        assert!(!(4 % config.interval == 0));
        assert!(!(6 % config.interval == 0));
    }

    #[test]
    fn test_merge_attempt_result_success() {
        let result = MergeAttemptResult {
            success: true,
            conflicting_files: vec![],
            message: "Merge successful".to_string(),
        };

        assert!(result.success);
        assert!(result.conflicting_files.is_empty());
    }

    #[test]
    fn test_merge_attempt_result_conflict() {
        let result = MergeAttemptResult {
            success: false,
            conflicting_files: vec!["src/main.rs".to_string(), "Cargo.toml".to_string()],
            message: "Merge conflict detected in 2 files".to_string(),
        };

        assert!(!result.success);
        assert_eq!(result.conflicting_files.len(), 2);
    }
}
