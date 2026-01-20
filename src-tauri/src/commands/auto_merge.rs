// Tauri commands for auto-merge functionality
// Handles merging completed task branches back to target branch

use crate::database::{Database, tasks as db_tasks};
use crate::models::TaskStatus;
use crate::commands::git::GitState;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

/// Configuration for auto-merge operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoMergeConfig {
    /// Target branch to merge into (default: main)
    pub target_branch: String,
    /// Whether to delete branches after successful merge
    pub delete_branches: bool,
    /// Whether to cleanup worktrees after merge
    pub cleanup_worktrees: bool,
    /// Whether to use AI for conflict resolution (not implemented yet)
    pub use_ai_conflict_resolution: bool,
}

/// Result of a single branch merge
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeBranchResult {
    pub task_id: String,
    pub branch: String,
    pub success: bool,
    pub message: String,
    pub conflict_files: Option<Vec<String>>,
}

/// Result of auto-merge operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoMergeResult {
    pub total_branches: usize,
    pub merged: usize,
    pub failed: usize,
    pub skipped: usize,
    pub results: Vec<MergeBranchResult>,
}

/// Information about a branch ready for merge
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeableBranch {
    pub task_id: String,
    pub branch: String,
    pub completed_at: String,
}

/// Get list of branches ready for merge (completed tasks with branches)
#[tauri::command]
pub fn get_mergeable_branches(
    session_id: String,
    _repo_path: String,
    db: State<Mutex<Database>>,
) -> Result<Vec<MergeableBranch>, String> {
    log::info!("[AutoMerge] Getting mergeable branches for session: {}", session_id);

    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    let tasks = db_tasks::get_tasks_for_session(conn, &session_id)
        .map_err(|e| format!("Failed to get tasks: {}", e))?;

    let mergeable: Vec<MergeableBranch> = tasks
        .iter()
        .filter(|t| t.status == TaskStatus::Completed && t.branch.is_some())
        .map(|t| MergeableBranch {
            task_id: t.id.clone(),
            branch: t.branch.clone().unwrap_or_default(),
            completed_at: t.completed_at
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_else(|| "".to_string()),
        })
        .collect();

    log::info!("[AutoMerge] Found {} mergeable branches", mergeable.len());
    Ok(mergeable)
}

/// Merge all completed task branches back to target branch
#[tauri::command]
pub fn auto_merge_completed_branches(
    session_id: String,
    repo_path: String,
    config: AutoMergeConfig,
    db: State<Mutex<Database>>,
    git_state: State<GitState>,
) -> Result<AutoMergeResult, String> {
    log::info!("[AutoMerge] Starting auto-merge for session: {} to branch: {}", session_id, config.target_branch);

    // Get completed tasks with branches
    let mergeable = {
        let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
        let conn = db.get_connection();

        let tasks = db_tasks::get_tasks_for_session(conn, &session_id)
            .map_err(|e| format!("Failed to get tasks: {}", e))?;

        tasks
            .into_iter()
            .filter(|t| t.status == TaskStatus::Completed && t.branch.is_some())
            .collect::<Vec<_>>()
    };

    let total_branches = mergeable.len();
    let mut merged = 0;
    let mut failed = 0;
    let mut skipped = 0;
    let mut results = Vec::new();

    for task in mergeable {
        let branch = task.branch.clone().unwrap_or_default();
        if branch.is_empty() {
            skipped += 1;
            results.push(MergeBranchResult {
                task_id: task.id.clone(),
                branch: branch.clone(),
                success: false,
                message: "No branch associated with task".to_string(),
                conflict_files: None,
            });
            continue;
        }

        log::info!("[AutoMerge] Merging branch {} for task {}", branch, task.id);

        // Perform the merge
        let merge_result = git_state.with_manager(&repo_path, |manager| {
            manager.merge_branch(&branch, &config.target_branch)
        });

        match merge_result {
            Ok(result) => {
                if result.success {
                    merged += 1;

                    // Delete branch if configured
                    if config.delete_branches {
                        if let Err(e) = git_state.with_manager(&repo_path, |manager| {
                            manager.delete_branch(&branch)
                        }) {
                            log::warn!("[AutoMerge] Failed to delete branch {}: {}", branch, e);
                        }
                    }

                    // Cleanup worktree if configured and task has worktree
                    if config.cleanup_worktrees {
                        if let Some(ref worktree_path) = task.worktree_path {
                            if let Err(e) = git_state.with_manager(&repo_path, |manager| {
                                manager.remove_worktree(worktree_path)
                            }) {
                                log::warn!("[AutoMerge] Failed to remove worktree {}: {}", worktree_path, e);
                            }
                        }
                    }

                    results.push(MergeBranchResult {
                        task_id: task.id.clone(),
                        branch: branch.clone(),
                        success: true,
                        message: result.message,
                        conflict_files: None,
                    });
                } else {
                    failed += 1;

                    // Abort the merge to clean up state
                    let _ = git_state.with_manager(&repo_path, |manager| {
                        manager.merge_abort()
                    });

                    results.push(MergeBranchResult {
                        task_id: task.id.clone(),
                        branch: branch.clone(),
                        success: false,
                        message: result.message,
                        conflict_files: Some(result.conflict_files),
                    });
                }
            }
            Err(e) => {
                failed += 1;
                log::error!("[AutoMerge] Failed to merge branch {}: {}", branch, e);

                // Try to abort any partial merge
                let _ = git_state.with_manager(&repo_path, |manager| {
                    manager.merge_abort()
                });

                results.push(MergeBranchResult {
                    task_id: task.id.clone(),
                    branch: branch.clone(),
                    success: false,
                    message: e,
                    conflict_files: None,
                });
            }
        }
    }

    log::info!("[AutoMerge] Completed: {} merged, {} failed, {} skipped out of {} total",
        merged, failed, skipped, total_branches);

    Ok(AutoMergeResult {
        total_branches,
        merged,
        failed,
        skipped,
        results,
    })
}

/// Merge a single branch with optional AI conflict resolution
#[tauri::command]
pub fn merge_branch_with_ai(
    repo_path: String,
    source_branch: String,
    target_branch: String,
    task_id: String,
    git_state: State<GitState>,
) -> Result<MergeBranchResult, String> {
    log::info!("[AutoMerge] Merging branch {} into {} for task {}",
        source_branch, target_branch, task_id);

    let merge_result = git_state.with_manager(&repo_path, |manager| {
        manager.merge_branch(&source_branch, &target_branch)
    })?;

    if merge_result.success {
        Ok(MergeBranchResult {
            task_id,
            branch: source_branch,
            success: true,
            message: merge_result.message,
            conflict_files: None,
        })
    } else {
        // Abort the merge
        let _ = git_state.with_manager(&repo_path, |manager| {
            manager.merge_abort()
        });

        // TODO: If AI conflict resolution is enabled, attempt to resolve conflicts
        // For now, just return the conflict information

        Ok(MergeBranchResult {
            task_id,
            branch: source_branch,
            success: false,
            message: merge_result.message,
            conflict_files: Some(merge_result.conflict_files),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auto_merge_config_serialization() {
        let config = AutoMergeConfig {
            target_branch: "main".to_string(),
            delete_branches: true,
            cleanup_worktrees: true,
            use_ai_conflict_resolution: false,
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("targetBranch"));
        assert!(json.contains("deleteBranches"));
    }

    #[test]
    fn test_merge_branch_result_serialization() {
        let result = MergeBranchResult {
            task_id: "task-1".to_string(),
            branch: "feature/task-1".to_string(),
            success: true,
            message: "Merged successfully".to_string(),
            conflict_files: None,
        };

        let json = serde_json::to_string(&result).unwrap();
        assert!(json.contains("taskId"));
        assert!(json.contains("conflictFiles"));
    }
}
