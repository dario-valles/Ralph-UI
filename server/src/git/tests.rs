//! Tests for GitManager
//!
//! Contains unit tests for all git operations

#[cfg(test)]
mod tests {
    use crate::git::GitManager;
    use git2::{Repository, Signature};
    use std::fs;
    use std::path::Path;
    use tempfile::TempDir;

    fn setup_test_repo() -> (TempDir, GitManager) {
        let temp_dir = TempDir::new().unwrap();
        let repo_path = temp_dir.path();

        // Initialize a git repository
        let repo = Repository::init(repo_path).unwrap();

        // Create initial commit
        let sig = Signature::now("Test User", "test@example.com").unwrap();
        let tree_id = {
            let mut index = repo.index().unwrap();

            // Create a test file
            let test_file = repo_path.join("test.txt");
            fs::write(&test_file, "Hello, World!").unwrap();
            index.add_path(Path::new("test.txt")).unwrap();
            index.write().unwrap();
            index.write_tree().unwrap()
        };

        let tree = repo.find_tree(tree_id).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "Initial commit", &tree, &[])
            .unwrap();

        let manager = GitManager::new(repo_path).unwrap();
        (temp_dir, manager)
    }

    #[test]
    fn test_create_git_manager() {
        let (_temp_dir, manager) = setup_test_repo();
        assert!(manager.repo_path().exists());
    }

    #[test]
    fn test_create_branch() {
        let (_temp_dir, manager) = setup_test_repo();

        let branch = manager.create_branch("feature-test", false).unwrap();
        assert_eq!(branch.name, "feature-test");
        assert!(!branch.is_head);
    }

    #[test]
    fn test_list_branches() {
        let (_temp_dir, manager) = setup_test_repo();

        manager.create_branch("branch1", false).unwrap();
        manager.create_branch("branch2", false).unwrap();

        let branches = manager.list_branches().unwrap();
        assert!(branches.len() >= 3); // main/master + branch1 + branch2

        let branch_names: Vec<String> = branches.iter().map(|b| b.name.clone()).collect();
        assert!(branch_names.contains(&"branch1".to_string()));
        assert!(branch_names.contains(&"branch2".to_string()));
    }

    #[test]
    fn test_get_current_branch() {
        let (_temp_dir, manager) = setup_test_repo();

        let branch = manager.get_current_branch().unwrap();
        assert!(branch.is_head);
        assert!(branch.name == "main" || branch.name == "master");
    }

    #[test]
    fn test_checkout_branch() {
        let (_temp_dir, manager) = setup_test_repo();

        manager.create_branch("feature-checkout", false).unwrap();
        manager.checkout_branch("feature-checkout").unwrap();

        let current = manager.get_current_branch().unwrap();
        assert_eq!(current.name, "feature-checkout");
        assert!(current.is_head);
    }

    #[test]
    fn test_delete_branch() {
        let (_temp_dir, manager) = setup_test_repo();

        manager.create_branch("to-delete", false).unwrap();
        let branches = manager.list_branches().unwrap();
        let branch_names: Vec<String> = branches.iter().map(|b| b.name.clone()).collect();
        assert!(branch_names.contains(&"to-delete".to_string()));

        manager.delete_branch("to-delete").unwrap();
        let branches = manager.list_branches().unwrap();
        let branch_names: Vec<String> = branches.iter().map(|b| b.name.clone()).collect();
        assert!(!branch_names.contains(&"to-delete".to_string()));
    }

    #[test]
    fn test_get_status() {
        let (temp_dir, manager) = setup_test_repo();

        // Create a new file
        let new_file = temp_dir.path().join("new_file.txt");
        fs::write(&new_file, "New content").unwrap();

        let status = manager.get_status().unwrap();
        assert!(!status.is_empty());

        let paths: Vec<String> = status.iter().map(|s| s.path.clone()).collect();
        assert!(paths.contains(&"new_file.txt".to_string()));
    }

    #[test]
    fn test_stage_files() {
        let (temp_dir, manager) = setup_test_repo();

        // Create a new file
        let new_file = temp_dir.path().join("stage_test.txt");
        fs::write(&new_file, "Stage me").unwrap();

        manager.stage_files(&["stage_test.txt"]).unwrap();

        // Verify file is staged
        let status = manager.get_status().unwrap();
        let staged_file = status.iter().find(|s| s.path == "stage_test.txt");
        assert!(staged_file.is_some());
    }

    #[test]
    fn test_get_commit_history() {
        let (_temp_dir, manager) = setup_test_repo();

        let history = manager.get_commit_history(10).unwrap();
        assert!(!history.is_empty());
        assert_eq!(history[0].message, "Initial commit");
    }

    #[test]
    fn test_get_commit() {
        let (_temp_dir, manager) = setup_test_repo();

        let history = manager.get_commit_history(1).unwrap();
        let commit_id = &history[0].id;

        let commit = manager.get_commit(commit_id).unwrap();
        assert_eq!(commit.id, *commit_id);
        assert_eq!(commit.message, "Initial commit");
    }

    #[test]
    fn test_create_worktree() {
        let (temp_dir, manager) = setup_test_repo();

        let worktree_path = temp_dir.path().join("worktree-test");
        let worktree = manager
            .create_worktree("feature-worktree", worktree_path.to_str().unwrap())
            .unwrap();

        assert_eq!(worktree.name, "feature-worktree");
        assert!(Path::new(&worktree.path).exists());
    }

    #[test]
    fn test_list_worktrees() {
        let (temp_dir, manager) = setup_test_repo();

        let worktree_path1 = temp_dir.path().join("worktree1");
        let worktree_path2 = temp_dir.path().join("worktree2");

        manager
            .create_worktree("wt1", worktree_path1.to_str().unwrap())
            .unwrap();
        manager
            .create_worktree("wt2", worktree_path2.to_str().unwrap())
            .unwrap();

        let worktrees = manager.list_worktrees().unwrap();
        // Should have at least 2 worktrees (+ possibly the main one)
        assert!(worktrees.len() >= 2);

        let names: Vec<String> = worktrees.iter().map(|w| w.name.clone()).collect();
        assert!(names.contains(&"wt1".to_string()));
        assert!(names.contains(&"wt2".to_string()));
    }

    #[test]
    fn test_get_working_diff() {
        let (temp_dir, manager) = setup_test_repo();

        // Modify the test file
        let test_file = temp_dir.path().join("test.txt");
        fs::write(&test_file, "Modified content").unwrap();

        let diff = manager.get_working_diff().unwrap();
        assert!(diff.files_changed > 0);
    }

    #[test]
    fn test_branch_from_commit() {
        let (_temp_dir, manager) = setup_test_repo();

        let history = manager.get_commit_history(1).unwrap();
        let commit_id = &history[0].id;

        let branch = manager
            .create_branch_from_commit("from-commit", commit_id, false)
            .unwrap();

        assert_eq!(branch.name, "from-commit");
        assert_eq!(branch.commit_id, *commit_id);
    }

    #[test]
    fn test_commit_info_fields() {
        let (_temp_dir, manager) = setup_test_repo();

        let history = manager.get_commit_history(1).unwrap();
        let commit = &history[0];

        assert!(!commit.id.is_empty());
        assert_eq!(commit.short_id.len(), 7);
        assert_eq!(commit.author, "Test User");
        assert_eq!(commit.email, "test@example.com");
        assert!(commit.timestamp > 0);
    }
}
