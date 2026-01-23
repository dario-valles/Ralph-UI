use crate::git::{
    ai_resolver::{ConflictResolverConfig, ConflictResolver, MergeResolutionResult},
    BranchInfo, CommitInfo, ConflictInfo, DiffInfo, FileStatus, GitManager, MergeResult,
    WorktreeInfo,
};
use crate::models::AgentType;
use crate::utils::ResultExt;
use std::collections::HashMap;
use std::sync::Mutex;

/// Git manager state
pub struct GitState {
    managers: Mutex<HashMap<String, GitManager>>,
}

impl GitState {
    pub fn new() -> Self {
        Self {
            managers: Mutex::new(HashMap::new()),
        }
    }

    pub fn get_or_create(&self, repo_path: &str) -> Result<(), String> {
        let mut managers = self.managers.lock().with_context("Lock error")?;

        if !managers.contains_key(repo_path) {
            let manager = GitManager::new(repo_path).with_context("Failed to open repository")?;
            managers.insert(repo_path.to_string(), manager);
        }

        Ok(())
    }

    pub fn with_manager<F, R>(&self, repo_path: &str, f: F) -> Result<R, String>
    where
        F: FnOnce(&GitManager) -> Result<R, git2::Error>,
    {
        self.get_or_create(repo_path)?;
        let managers = self.managers.lock().with_context("Lock error")?;
        let manager = managers
            .get(repo_path)
            .ok_or_else(|| "Repository not found".to_string())?;
        f(manager).with_context("Git operation failed")
    }
}

/// Create a new branch
pub fn git_create_branch(
    repo_path: String,
    name: String,
    force: bool,
    state: &GitState,
) -> Result<BranchInfo, String> {
    state.with_manager(&repo_path, |manager| manager.create_branch(&name, force))
}

/// Create a branch from a specific commit
pub fn git_create_branch_from_commit(
    repo_path: String,
    name: String,
    commit_id: String,
    force: bool,
    state: &GitState,
) -> Result<BranchInfo, String> {
    state.with_manager(&repo_path, |manager| {
        manager.create_branch_from_commit(&name, &commit_id, force)
    })
}

/// Delete a branch
pub fn git_delete_branch(
    repo_path: String,
    name: String,
    state: &GitState,
) -> Result<(), String> {
    state.with_manager(&repo_path, |manager| manager.delete_branch(&name))
}

/// List all branches
pub fn git_list_branches(
    repo_path: String,
    state: &GitState,
) -> Result<Vec<BranchInfo>, String> {
    state.with_manager(&repo_path, |manager| manager.list_branches())
}

/// Get current branch
pub fn git_get_current_branch(
    repo_path: String,
    state: &GitState,
) -> Result<BranchInfo, String> {
    state.with_manager(&repo_path, |manager| manager.get_current_branch())
}

/// Checkout a branch
pub fn git_checkout_branch(
    repo_path: String,
    name: String,
    state: &GitState,
) -> Result<(), String> {
    state.with_manager(&repo_path, |manager| manager.checkout_branch(&name))
}

/// Create a worktree
pub fn git_create_worktree(
    repo_path: String,
    branch: String,
    path: String,
    state: &GitState,
) -> Result<WorktreeInfo, String> {
    state.with_manager(&repo_path, |manager| {
        manager.create_worktree(&branch, &path)
    })
}

/// List worktrees
pub fn git_list_worktrees(
    repo_path: String,
    state: &GitState,
) -> Result<Vec<WorktreeInfo>, String> {
    state.with_manager(&repo_path, |manager| manager.list_worktrees())
}

/// Remove a worktree
pub fn git_remove_worktree(
    repo_path: String,
    name: String,
    state: &GitState,
) -> Result<(), String> {
    state.with_manager(&repo_path, |manager| manager.remove_worktree(&name))
}

/// Get git status
pub fn git_get_status(
    repo_path: String,
    state: &GitState,
) -> Result<Vec<FileStatus>, String> {
    state.with_manager(&repo_path, |manager| manager.get_status())
}

/// Get commit history
pub fn git_get_commit_history(
    repo_path: String,
    max_count: usize,
    state: &GitState,
) -> Result<Vec<CommitInfo>, String> {
    state.with_manager(&repo_path, |manager| manager.get_commit_history(max_count))
}

/// Get a specific commit
pub fn git_get_commit(
    repo_path: String,
    commit_id: String,
    state: &GitState,
) -> Result<CommitInfo, String> {
    state.with_manager(&repo_path, |manager| manager.get_commit(&commit_id))
}

/// Create a commit
pub fn git_create_commit(
    repo_path: String,
    message: String,
    author_name: String,
    author_email: String,
    state: &GitState,
) -> Result<CommitInfo, String> {
    state.with_manager(&repo_path, |manager| {
        manager.create_commit(&message, &author_name, &author_email)
    })
}

/// Stage files
pub fn git_stage_files(
    repo_path: String,
    paths: Vec<String>,
    state: &GitState,
) -> Result<(), String> {
    state.with_manager(&repo_path, |manager| {
        let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        manager.stage_files(&path_refs)
    })
}

/// Stage all files
pub fn git_stage_all(repo_path: String, state: &GitState) -> Result<(), String> {
    state.with_manager(&repo_path, |manager| manager.stage_all())
}

/// Get diff between commits
pub fn git_get_diff(
    repo_path: String,
    from_commit: Option<String>,
    to_commit: Option<String>,
    state: &GitState,
) -> Result<DiffInfo, String> {
    state.with_manager(&repo_path, |manager| {
        manager.get_diff(from_commit.as_deref(), to_commit.as_deref())
    })
}

/// Get working directory diff
pub fn git_get_working_diff(repo_path: String, state: &GitState) -> Result<DiffInfo, String> {
    state.with_manager(&repo_path, |manager| manager.get_working_diff())
}

/// Check if a path is a git repository
pub fn git_is_repository(path: String) -> Result<bool, String> {
    use std::path::Path;
    let git_path = Path::new(&path).join(".git");
    Ok(git_path.exists())
}

/// Initialize a new git repository
pub fn git_init_repository(path: String) -> Result<(), String> {
    use git2::Repository;
    use std::path::Path;

    let repo_path = Path::new(&path);
    if !repo_path.exists() {
        return Err(format!("Directory does not exist: {}", path));
    }

    Repository::init(repo_path).with_context("Failed to initialize git repository")?;

    log::info!("[Git] Initialized new repository at: {}", path);
    Ok(())
}

/// Merge a source branch into a target branch
pub fn git_merge_branch(
    repo_path: String,
    source_branch: String,
    target_branch: String,
    state: &GitState,
) -> Result<MergeResult, String> {
    state.with_manager(&repo_path, |manager| {
        manager.merge_branch(&source_branch, &target_branch)
    })
}

/// Abort an ongoing merge
pub fn git_merge_abort(repo_path: String, state: &GitState) -> Result<(), String> {
    state.with_manager(&repo_path, |manager| manager.merge_abort())
}

/// Check for merge conflicts between two branches without actually merging
pub fn git_check_merge_conflicts(
    repo_path: String,
    source_branch: String,
    target_branch: String,
    state: &GitState,
) -> Result<Vec<String>, String> {
    state.with_manager(&repo_path, |manager| {
        manager.check_merge_conflicts(&source_branch, &target_branch)
    })
}

/// Get detailed conflict information for files in a merge conflict state.
/// Call this after git_merge_branch returns with conflicts.

pub fn git_get_conflict_details(
    repo_path: String,
    state: &GitState,
) -> Result<Vec<ConflictInfo>, String> {
    state.with_manager(&repo_path, |manager| manager.get_conflict_details())
}

/// Apply resolved content to a conflicted file and stage it.
/// Use this after AI has resolved the conflict.

pub fn git_resolve_conflict(
    repo_path: String,
    path: String,
    resolved_content: String,
    state: &GitState,
) -> Result<(), String> {
    state.with_manager(&repo_path, |manager| {
        manager.resolve_conflict(&path, &resolved_content)
    })
}

/// Complete a merge after all conflicts have been resolved.
/// Creates the merge commit.

pub fn git_complete_merge(
    repo_path: String,
    message: String,
    author_name: String,
    author_email: String,
    state: &GitState,
) -> Result<CommitInfo, String> {
    state.with_manager(&repo_path, |manager| {
        manager.complete_merge(&message, &author_name, &author_email)
    })
}

/// Push a branch to the remote repository

pub fn git_push_branch(
    repo_path: String,
    branch_name: String,
    force: bool,
    state: &GitState,
) -> Result<(), String> {
    state.with_manager(&repo_path, |manager| {
        manager.push_branch(&branch_name, force)
    })
}

/// Resolve all conflicts using AI (Claude Code or other CLI agent).
/// This command:
/// 1. Gets conflict details (3-way diff) for all conflicted files
/// 2. Runs an AI agent to resolve each conflict
/// 3. Applies the resolved content and stages the files
///
/// After this succeeds, call git_complete_merge to create the merge commit.

pub async fn git_resolve_conflicts_with_ai(
    repo_path: String,
    agent_type: Option<String>,
    model: Option<String>,
    timeout_secs: Option<u64>,
    state: &GitState,
) -> Result<MergeResolutionResult, String> {
    log::info!(
        "[Git] Resolving conflicts with AI in {} using {:?}",
        repo_path,
        agent_type
    );

    // Get conflict details first
    let conflicts = state.with_manager(&repo_path, |manager| manager.get_conflict_details())?;

    if conflicts.is_empty() {
        return Ok(MergeResolutionResult {
            resolutions: vec![],
            resolved_count: 0,
            failed_count: 0,
            total_duration_secs: 0.0,
        });
    }

    // Parse agent type
    let agent = agent_type
        .as_deref()
        .map(|s| s.parse::<AgentType>())
        .transpose()?
        .unwrap_or_default();

    // Create resolver config
    let config = ConflictResolverConfig {
        agent_type: agent,
        model,
        timeout_secs: timeout_secs.unwrap_or(120),
        project_path: repo_path.clone(),
    };

    // Create resolver and run resolution
    let resolver = ConflictResolver::new(config);
    let result = resolver.resolve_all(&conflicts).await;

    // Apply successful resolutions
    for resolution in &result.resolutions {
        if resolution.success {
            if let Some(ref content) = resolution.resolved_content {
                // Apply the resolved content
                state
                    .with_manager(&repo_path, |manager| {
                        manager.resolve_conflict(&resolution.path, content)
                    })
                    .map_err(|e| {
                        format!("Failed to apply resolution for {}: {}", resolution.path, e)
                    })?;
            }
        }
    }

    log::info!(
        "[Git] AI resolution complete: {}/{} conflicts resolved",
        result.resolved_count,
        result.resolutions.len()
    );

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::{Repository, Signature};
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;

    fn setup_test_repo() -> (TempDir, String, GitState) {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path().to_str().unwrap().to_string();

        // Initialize a git repository
        let repo = Repository::init(&repo_path).unwrap();

        // Create initial commit
        let sig = Signature::now("Test User", "test@example.com").unwrap();
        let tree_id = {
            let mut index = repo.index().unwrap();

            // Create a test file
            let test_file = temp_dir.path().join("test.txt");
            fs::write(&test_file, "Hello, World!").unwrap();
            index.add_path(Path::new("test.txt")).unwrap();
            index.write().unwrap();
            index.write_tree().unwrap()
        };

        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
            .unwrap();

        let state = GitState::new();
        (temp_dir, repo_path, state)
    }

    #[test]
    fn test_git_create_branch_command() {
        let (_temp_dir, repo_path, state) = setup_test_repo();

        let result = state.with_manager(&repo_path, |manager| {
            manager.create_branch("test-branch", false)
        });

        assert!(result.is_ok());
        let branch = result.unwrap();
        assert_eq!(branch.name, "test-branch");
    }

    #[test]
    fn test_git_list_branches_command() {
        let (_temp_dir, repo_path, state) = setup_test_repo();

        let _ = state.with_manager(&repo_path, |manager| {
            manager.create_branch("branch1", false)
        });

        let result = state.with_manager(&repo_path, |manager| manager.list_branches());

        assert!(result.is_ok());
        let branches = result.unwrap();
        assert!(branches.len() >= 2);
    }

    #[test]
    fn test_git_get_current_branch_command() {
        let (_temp_dir, repo_path, state) = setup_test_repo();

        let result = state.with_manager(&repo_path, |manager| manager.get_current_branch());

        assert!(result.is_ok());
        let branch = result.unwrap();
        assert!(branch.is_head);
    }

    #[test]
    fn test_git_checkout_branch_command() {
        let (_temp_dir, repo_path, state) = setup_test_repo();

        let _ = state.with_manager(&repo_path, |manager| {
            manager.create_branch("checkout-test", false)
        });

        let result = state.with_manager(&repo_path, |manager| {
            manager.checkout_branch("checkout-test")
        });

        assert!(result.is_ok());

        let current = state
            .with_manager(&repo_path, |manager| manager.get_current_branch())
            .unwrap();
        assert_eq!(current.name, "checkout-test");
    }

    #[test]
    fn test_git_get_status_command() {
        let (temp_dir, repo_path, state) = setup_test_repo();

        // Create a new file
        let new_file = temp_dir.path().join("new.txt");
        fs::write(&new_file, "New content").unwrap();

        let result = state.with_manager(&repo_path, |manager| manager.get_status());

        assert!(result.is_ok());
        let status = result.unwrap();
        assert!(!status.is_empty());
    }

    #[test]
    fn test_git_get_commit_history_command() {
        let (_temp_dir, repo_path, state) = setup_test_repo();

        let result = state.with_manager(&repo_path, |manager| manager.get_commit_history(10));

        assert!(result.is_ok());
        let history = result.unwrap();
        assert!(!history.is_empty());
        assert_eq!(history[0].message, "Initial commit");
    }

    #[test]
    fn test_git_stage_files_command() {
        let (temp_dir, repo_path, state) = setup_test_repo();

        // Create a new file
        let new_file = temp_dir.path().join("stage.txt");
        fs::write(&new_file, "Stage me").unwrap();

        let result = state.with_manager(&repo_path, |manager| manager.stage_files(&["stage.txt"]));

        assert!(result.is_ok());
    }

    #[test]
    fn test_git_create_worktree_command() {
        let (temp_dir, repo_path, state) = setup_test_repo();

        let worktree_path = temp_dir.path().join("worktree");

        let result = state.with_manager(&repo_path, |manager| {
            manager.create_worktree("wt-branch", worktree_path.to_str().unwrap())
        });

        assert!(result.is_ok());
        let worktree = result.unwrap();
        assert_eq!(worktree.name, "wt-branch");
    }

    #[test]
    fn test_git_list_worktrees_command() {
        let (temp_dir, repo_path, state) = setup_test_repo();

        let worktree_path = temp_dir.path().join("worktree1");
        let _ = state.with_manager(&repo_path, |manager| {
            manager.create_worktree("wt1", worktree_path.to_str().unwrap())
        });

        let result = state.with_manager(&repo_path, |manager| manager.list_worktrees());

        assert!(result.is_ok());
        let worktrees = result.unwrap();
        assert!(worktrees.len() >= 1);
    }

    #[test]
    fn test_git_get_working_diff_command() {
        let (temp_dir, repo_path, state) = setup_test_repo();

        // Modify a file
        let test_file = temp_dir.path().join("test.txt");
        fs::write(&test_file, "Modified").unwrap();

        let result = state.with_manager(&repo_path, |manager| manager.get_working_diff());

        assert!(result.is_ok());
        let diff = result.unwrap();
        assert!(diff.files_changed > 0);
    }

    #[test]
    fn test_git_delete_branch_command() {
        let (_temp_dir, repo_path, state) = setup_test_repo();

        let _ = state.with_manager(&repo_path, |manager| {
            manager.create_branch("delete-me", false)
        });

        let result = state.with_manager(&repo_path, |manager| manager.delete_branch("delete-me"));

        assert!(result.is_ok());

        let branches = state
            .with_manager(&repo_path, |manager| manager.list_branches())
            .unwrap();
        let names: Vec<String> = branches.iter().map(|b| b.name.clone()).collect();
        assert!(!names.contains(&"delete-me".to_string()));
    }
}
