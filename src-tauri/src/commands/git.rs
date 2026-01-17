use crate::git::{BranchInfo, CommitInfo, DiffInfo, FileStatus, GitManager, WorktreeInfo};
use tauri::State;
use std::sync::Mutex;
use std::collections::HashMap;

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
        let mut managers = self.managers.lock().unwrap();

        if !managers.contains_key(repo_path) {
            let manager = GitManager::new(repo_path)
                .map_err(|e| format!("Failed to open repository: {}", e))?;
            managers.insert(repo_path.to_string(), manager);
        }

        Ok(())
    }

    pub fn with_manager<F, R>(&self, repo_path: &str, f: F) -> Result<R, String>
    where
        F: FnOnce(&GitManager) -> Result<R, git2::Error>,
    {
        self.get_or_create(repo_path)?;
        let managers = self.managers.lock().unwrap();
        let manager = managers.get(repo_path)
            .ok_or_else(|| "Repository not found".to_string())?;
        f(manager).map_err(|e| format!("Git operation failed: {}", e))
    }
}

/// Create a new branch
#[tauri::command]
pub fn git_create_branch(
    repo_path: String,
    name: String,
    force: bool,
    state: State<GitState>,
) -> Result<BranchInfo, String> {
    state.with_manager(&repo_path, |manager| {
        manager.create_branch(&name, force)
    })
}

/// Create a branch from a specific commit
#[tauri::command]
pub fn git_create_branch_from_commit(
    repo_path: String,
    name: String,
    commit_id: String,
    force: bool,
    state: State<GitState>,
) -> Result<BranchInfo, String> {
    state.with_manager(&repo_path, |manager| {
        manager.create_branch_from_commit(&name, &commit_id, force)
    })
}

/// Delete a branch
#[tauri::command]
pub fn git_delete_branch(
    repo_path: String,
    name: String,
    state: State<GitState>,
) -> Result<(), String> {
    state.with_manager(&repo_path, |manager| {
        manager.delete_branch(&name)
    })
}

/// List all branches
#[tauri::command]
pub fn git_list_branches(
    repo_path: String,
    state: State<GitState>,
) -> Result<Vec<BranchInfo>, String> {
    state.with_manager(&repo_path, |manager| {
        manager.list_branches()
    })
}

/// Get current branch
#[tauri::command]
pub fn git_get_current_branch(
    repo_path: String,
    state: State<GitState>,
) -> Result<BranchInfo, String> {
    state.with_manager(&repo_path, |manager| {
        manager.get_current_branch()
    })
}

/// Checkout a branch
#[tauri::command]
pub fn git_checkout_branch(
    repo_path: String,
    name: String,
    state: State<GitState>,
) -> Result<(), String> {
    state.with_manager(&repo_path, |manager| {
        manager.checkout_branch(&name)
    })
}

/// Create a worktree
#[tauri::command]
pub fn git_create_worktree(
    repo_path: String,
    branch: String,
    path: String,
    state: State<GitState>,
) -> Result<WorktreeInfo, String> {
    state.with_manager(&repo_path, |manager| {
        manager.create_worktree(&branch, &path)
    })
}

/// List worktrees
#[tauri::command]
pub fn git_list_worktrees(
    repo_path: String,
    state: State<GitState>,
) -> Result<Vec<WorktreeInfo>, String> {
    state.with_manager(&repo_path, |manager| {
        manager.list_worktrees()
    })
}

/// Remove a worktree
#[tauri::command]
pub fn git_remove_worktree(
    repo_path: String,
    name: String,
    state: State<GitState>,
) -> Result<(), String> {
    state.with_manager(&repo_path, |manager| {
        manager.remove_worktree(&name)
    })
}

/// Get git status
#[tauri::command]
pub fn git_get_status(
    repo_path: String,
    state: State<GitState>,
) -> Result<Vec<FileStatus>, String> {
    state.with_manager(&repo_path, |manager| {
        manager.get_status()
    })
}

/// Get commit history
#[tauri::command]
pub fn git_get_commit_history(
    repo_path: String,
    max_count: usize,
    state: State<GitState>,
) -> Result<Vec<CommitInfo>, String> {
    state.with_manager(&repo_path, |manager| {
        manager.get_commit_history(max_count)
    })
}

/// Get a specific commit
#[tauri::command]
pub fn git_get_commit(
    repo_path: String,
    commit_id: String,
    state: State<GitState>,
) -> Result<CommitInfo, String> {
    state.with_manager(&repo_path, |manager| {
        manager.get_commit(&commit_id)
    })
}

/// Create a commit
#[tauri::command]
pub fn git_create_commit(
    repo_path: String,
    message: String,
    author_name: String,
    author_email: String,
    state: State<GitState>,
) -> Result<CommitInfo, String> {
    state.with_manager(&repo_path, |manager| {
        manager.create_commit(&message, &author_name, &author_email)
    })
}

/// Stage files
#[tauri::command]
pub fn git_stage_files(
    repo_path: String,
    paths: Vec<String>,
    state: State<GitState>,
) -> Result<(), String> {
    state.with_manager(&repo_path, |manager| {
        let path_refs: Vec<&str> = paths.iter().map(|s| s.as_str()).collect();
        manager.stage_files(&path_refs)
    })
}

/// Stage all files
#[tauri::command]
pub fn git_stage_all(
    repo_path: String,
    state: State<GitState>,
) -> Result<(), String> {
    state.with_manager(&repo_path, |manager| {
        manager.stage_all()
    })
}

/// Get diff between commits
#[tauri::command]
pub fn git_get_diff(
    repo_path: String,
    from_commit: Option<String>,
    to_commit: Option<String>,
    state: State<GitState>,
) -> Result<DiffInfo, String> {
    state.with_manager(&repo_path, |manager| {
        manager.get_diff(
            from_commit.as_deref(),
            to_commit.as_deref(),
        )
    })
}

/// Get working directory diff
#[tauri::command]
pub fn git_get_working_diff(
    repo_path: String,
    state: State<GitState>,
) -> Result<DiffInfo, String> {
    state.with_manager(&repo_path, |manager| {
        manager.get_working_diff()
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;
    use git2::{Repository, Signature};
    use std::path::Path;

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

        let result = git_create_branch(
            repo_path,
            "test-branch".to_string(),
            false,
            State::from(&state),
        );

        assert!(result.is_ok());
        let branch = result.unwrap();
        assert_eq!(branch.name, "test-branch");
    }

    #[test]
    fn test_git_list_branches_command() {
        let (_temp_dir, repo_path, state) = setup_test_repo();

        let _ = git_create_branch(
            repo_path.clone(),
            "branch1".to_string(),
            false,
            State::from(&state),
        );

        let result = git_list_branches(repo_path, State::from(&state));

        assert!(result.is_ok());
        let branches = result.unwrap();
        assert!(branches.len() >= 2);
    }

    #[test]
    fn test_git_get_current_branch_command() {
        let (_temp_dir, repo_path, state) = setup_test_repo();

        let result = git_get_current_branch(repo_path, State::from(&state));

        assert!(result.is_ok());
        let branch = result.unwrap();
        assert!(branch.is_head);
    }

    #[test]
    fn test_git_checkout_branch_command() {
        let (_temp_dir, repo_path, state) = setup_test_repo();

        let _ = git_create_branch(
            repo_path.clone(),
            "checkout-test".to_string(),
            false,
            State::from(&state),
        );

        let result = git_checkout_branch(
            repo_path.clone(),
            "checkout-test".to_string(),
            State::from(&state),
        );

        assert!(result.is_ok());

        let current = git_get_current_branch(repo_path, State::from(&state)).unwrap();
        assert_eq!(current.name, "checkout-test");
    }

    #[test]
    fn test_git_get_status_command() {
        let (temp_dir, repo_path, state) = setup_test_repo();

        // Create a new file
        let new_file = temp_dir.path().join("new.txt");
        fs::write(&new_file, "New content").unwrap();

        let result = git_get_status(repo_path, State::from(&state));

        assert!(result.is_ok());
        let status = result.unwrap();
        assert!(!status.is_empty());
    }

    #[test]
    fn test_git_get_commit_history_command() {
        let (_temp_dir, repo_path, state) = setup_test_repo();

        let result = git_get_commit_history(repo_path, 10, State::from(&state));

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

        let result = git_stage_files(
            repo_path,
            vec!["stage.txt".to_string()],
            State::from(&state),
        );

        assert!(result.is_ok());
    }

    #[test]
    fn test_git_create_worktree_command() {
        let (temp_dir, repo_path, state) = setup_test_repo();

        let worktree_path = temp_dir.path().join("worktree");

        let result = git_create_worktree(
            repo_path,
            "wt-branch".to_string(),
            worktree_path.to_str().unwrap().to_string(),
            State::from(&state),
        );

        assert!(result.is_ok());
        let worktree = result.unwrap();
        assert_eq!(worktree.name, "wt-branch");
    }

    #[test]
    fn test_git_list_worktrees_command() {
        let (temp_dir, repo_path, state) = setup_test_repo();

        let worktree_path = temp_dir.path().join("worktree1");
        let _ = git_create_worktree(
            repo_path.clone(),
            "wt1".to_string(),
            worktree_path.to_str().unwrap().to_string(),
            State::from(&state),
        );

        let result = git_list_worktrees(repo_path, State::from(&state));

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

        let result = git_get_working_diff(repo_path, State::from(&state));

        assert!(result.is_ok());
        let diff = result.unwrap();
        assert!(diff.files_changed > 0);
    }

    #[test]
    fn test_git_delete_branch_command() {
        let (_temp_dir, repo_path, state) = setup_test_repo();

        let _ = git_create_branch(
            repo_path.clone(),
            "delete-me".to_string(),
            false,
            State::from(&state),
        );

        let result = git_delete_branch(
            repo_path.clone(),
            "delete-me".to_string(),
            State::from(&state),
        );

        assert!(result.is_ok());

        let branches = git_list_branches(repo_path, State::from(&state)).unwrap();
        let names: Vec<String> = branches.iter().map(|b| b.name.clone()).collect();
        assert!(!names.contains(&"delete-me".to_string()));
    }
}
