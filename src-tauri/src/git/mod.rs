// Git operations using git2-rs
#![allow(dead_code)]

use git2::{
    Branch, BranchType, Commit, Delta, Diff, DiffOptions, Error as GitError, Oid, Repository,
    Signature, Status, StatusOptions, Worktree,
};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Git manager for repository operations
pub struct GitManager {
    repo: Repository,
}

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

impl GitManager {
    /// Create a new GitManager for the given repository path
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self, GitError> {
        let repo = Repository::open(path)?;
        Ok(Self { repo })
    }

    /// Get the repository path
    pub fn repo_path(&self) -> PathBuf {
        self.repo.path().to_path_buf()
    }

    /// Create a new branch from the current HEAD
    pub fn create_branch(&self, name: &str, force: bool) -> Result<BranchInfo, GitError> {
        let head = self.repo.head()?;
        let head_commit = head.peel_to_commit()?;

        let branch = self.repo.branch(name, &head_commit, force)?;

        Ok(self.branch_to_info(&branch)?)
    }

    /// Create a new branch from a specific commit
    pub fn create_branch_from_commit(
        &self,
        name: &str,
        commit_id: &str,
        force: bool,
    ) -> Result<BranchInfo, GitError> {
        let oid = Oid::from_str(commit_id)?;
        let commit = self.repo.find_commit(oid)?;

        let branch = self.repo.branch(name, &commit, force)?;

        Ok(self.branch_to_info(&branch)?)
    }

    /// Delete a branch
    pub fn delete_branch(&self, name: &str) -> Result<(), GitError> {
        let mut branch = self.repo.find_branch(name, BranchType::Local)?;
        branch.delete()?;
        Ok(())
    }

    /// Get all local branches
    pub fn list_branches(&self) -> Result<Vec<BranchInfo>, GitError> {
        let branches = self.repo.branches(Some(BranchType::Local))?;

        let mut result = Vec::new();
        for branch in branches {
            let (branch, _) = branch?;
            result.push(self.branch_to_info(&branch)?);
        }

        Ok(result)
    }

    /// Get the current branch
    pub fn get_current_branch(&self) -> Result<BranchInfo, GitError> {
        let head = self.repo.head()?;

        if !head.is_branch() {
            return Err(GitError::from_str("HEAD is not a branch"));
        }

        let branch = Branch::wrap(head);
        self.branch_to_info(&branch)
    }

    /// Checkout a branch
    pub fn checkout_branch(&self, name: &str) -> Result<(), GitError> {
        let obj = self.repo.revparse_single(&format!("refs/heads/{}", name))?;

        self.repo.checkout_tree(&obj, None)?;
        self.repo.set_head(&format!("refs/heads/{}", name))?;

        Ok(())
    }

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

        // Create the worktree with the branch reference
        let worktree = self.repo.worktree(
            branch,
            Path::new(path),
            Some(&opts),
        )?;

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

    /// Remove a worktree
    pub fn remove_worktree(&self, name: &str) -> Result<(), GitError> {
        let worktree = self.repo.find_worktree(name)?;

        // Prune the worktree
        worktree.prune(None)?;

        Ok(())
    }

    /// Get git status
    pub fn get_status(&self) -> Result<Vec<FileStatus>, GitError> {
        let mut opts = StatusOptions::new();
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(true);

        let statuses = self.repo.statuses(Some(&mut opts))?;

        let mut result = Vec::new();
        for entry in statuses.iter() {
            if let Some(path) = entry.path() {
                result.push(FileStatus {
                    path: path.to_string(),
                    status: self.status_to_string(entry.status()),
                });
            }
        }

        Ok(result)
    }

    /// Get commit history
    pub fn get_commit_history(&self, max_count: usize) -> Result<Vec<CommitInfo>, GitError> {
        let mut revwalk = self.repo.revwalk()?;
        revwalk.push_head()?;

        let mut result = Vec::new();
        for (i, oid) in revwalk.enumerate() {
            if i >= max_count {
                break;
            }

            let oid = oid?;
            let commit = self.repo.find_commit(oid)?;
            result.push(self.commit_to_info(&commit)?);
        }

        Ok(result)
    }

    /// Get a specific commit
    pub fn get_commit(&self, commit_id: &str) -> Result<CommitInfo, GitError> {
        let oid = Oid::from_str(commit_id)?;
        let commit = self.repo.find_commit(oid)?;
        Ok(self.commit_to_info(&commit)?)
    }

    /// Create a commit
    pub fn create_commit(
        &self,
        message: &str,
        author_name: &str,
        author_email: &str,
    ) -> Result<CommitInfo, GitError> {
        let signature = Signature::now(author_name, author_email)?;

        // Get the current index
        let mut index = self.repo.index()?;
        let tree_id = index.write_tree()?;
        let tree = self.repo.find_tree(tree_id)?;

        // Get parent commit
        let parent_commit = self.repo.head()?.peel_to_commit()?;

        // Create the commit
        let oid = self.repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &[&parent_commit],
        )?;

        let commit = self.repo.find_commit(oid)?;
        Ok(self.commit_to_info(&commit)?)
    }

    /// Stage files for commit
    pub fn stage_files(&self, paths: &[&str]) -> Result<(), GitError> {
        let mut index = self.repo.index()?;

        for path in paths {
            index.add_path(Path::new(path))?;
        }

        index.write()?;
        Ok(())
    }

    /// Stage all files
    pub fn stage_all(&self) -> Result<(), GitError> {
        let mut index = self.repo.index()?;
        index.add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)?;
        index.write()?;
        Ok(())
    }

    /// Get diff between two commits
    pub fn get_diff(
        &self,
        from_commit: Option<&str>,
        to_commit: Option<&str>,
    ) -> Result<DiffInfo, GitError> {
        let from_tree = if let Some(from) = from_commit {
            let oid = Oid::from_str(from)?;
            let commit = self.repo.find_commit(oid)?;
            Some(commit.tree()?)
        } else {
            None
        };

        let to_tree = if let Some(to) = to_commit {
            let oid = Oid::from_str(to)?;
            let commit = self.repo.find_commit(oid)?;
            Some(commit.tree()?)
        } else {
            // Use HEAD if no to_commit specified
            let head = self.repo.head()?.peel_to_commit()?;
            Some(head.tree()?)
        };

        let diff = self.repo.diff_tree_to_tree(
            from_tree.as_ref(),
            to_tree.as_ref(),
            Some(&mut DiffOptions::new()),
        )?;

        Ok(self.diff_to_info(&diff)?)
    }

    /// Get diff for working directory
    pub fn get_working_diff(&self) -> Result<DiffInfo, GitError> {
        let head = self.repo.head()?.peel_to_commit()?;
        let tree = head.tree()?;

        let diff = self.repo.diff_tree_to_workdir_with_index(
            Some(&tree),
            Some(&mut DiffOptions::new()),
        )?;

        Ok(self.diff_to_info(&diff)?)
    }

    // Helper methods

    fn branch_to_info(&self, branch: &Branch) -> Result<BranchInfo, GitError> {
        let name = branch.name()?.unwrap_or("").to_string();
        let is_head = branch.is_head();
        let upstream = branch.upstream().ok().and_then(|b| {
            b.name().ok().flatten().map(|s| s.to_string())
        });

        let commit = branch.get().peel_to_commit()?;
        let commit_id = commit.id().to_string();

        Ok(BranchInfo {
            name,
            is_head,
            upstream,
            commit_id,
        })
    }

    fn commit_to_info(&self, commit: &Commit) -> Result<CommitInfo, GitError> {
        let author = commit.author();

        let parent_ids = commit
            .parent_ids()
            .map(|oid| oid.to_string())
            .collect();

        Ok(CommitInfo {
            id: commit.id().to_string(),
            short_id: commit.id().to_string()[..7].to_string(),
            message: commit.message().unwrap_or("").to_string(),
            author: author.name().unwrap_or("").to_string(),
            email: author.email().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
            parent_ids,
        })
    }

    fn worktree_to_info(&self, worktree: &Worktree) -> Result<WorktreeInfo, GitError> {
        let name = worktree.name().unwrap_or("").to_string();
        let path = worktree.path().to_string_lossy().to_string();
        let is_locked = worktree.is_locked().map(|status| !matches!(status, git2::WorktreeLockStatus::Unlocked)).unwrap_or(false);

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

    fn diff_to_info(&self, diff: &Diff) -> Result<DiffInfo, GitError> {
        let stats = diff.stats()?;

        let mut files = Vec::new();
        diff.foreach(
            &mut |delta, _| {
                let old_path = delta.old_file().path().map(|p| p.to_string_lossy().to_string());
                let new_path = delta.new_file().path().map(|p| p.to_string_lossy().to_string());
                let status = self.delta_to_string(delta.status());

                files.push(FileDiff {
                    old_path,
                    new_path,
                    status,
                    insertions: 0, // Will be updated in hunk callback
                    deletions: 0,  // Will be updated in hunk callback
                });

                true
            },
            None,
            None,
            None,
        )?;

        Ok(DiffInfo {
            files_changed: stats.files_changed(),
            insertions: stats.insertions(),
            deletions: stats.deletions(),
            files,
        })
    }

    fn status_to_string(&self, status: Status) -> String {
        let mut result = Vec::new();

        if status.contains(Status::INDEX_NEW) || status.contains(Status::WT_NEW) {
            result.push("new");
        }
        if status.contains(Status::INDEX_MODIFIED) || status.contains(Status::WT_MODIFIED) {
            result.push("modified");
        }
        if status.contains(Status::INDEX_DELETED) || status.contains(Status::WT_DELETED) {
            result.push("deleted");
        }
        if status.contains(Status::INDEX_RENAMED) || status.contains(Status::WT_RENAMED) {
            result.push("renamed");
        }
        if status.contains(Status::INDEX_TYPECHANGE) || status.contains(Status::WT_TYPECHANGE) {
            result.push("typechange");
        }

        if result.is_empty() {
            "unknown".to_string()
        } else {
            result.join(", ")
        }
    }

    fn delta_to_string(&self, delta: Delta) -> String {
        match delta {
            Delta::Added => "added",
            Delta::Deleted => "deleted",
            Delta::Modified => "modified",
            Delta::Renamed => "renamed",
            Delta::Copied => "copied",
            Delta::Ignored => "ignored",
            Delta::Untracked => "untracked",
            Delta::Typechange => "typechange",
            Delta::Unmodified => "unmodified",
            Delta::Unreadable => "unreadable",
            Delta::Conflicted => "conflicted",
        }
        .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
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
