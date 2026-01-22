// Git operations using git2-rs
// Some methods are infrastructure for future features (worktree management, conflict resolution)
#![allow(dead_code)]

pub mod ai_resolver;

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

/// Represents the result of a merge operation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeResult {
    pub success: bool,
    pub message: String,
    pub conflict_files: Vec<String>,
    pub commit_id: Option<String>,
    pub fast_forward: bool,
}

/// Detailed information about a single file in conflict
/// Used for AI-assisted conflict resolution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictInfo {
    pub path: String,
    /// Content from target branch (ours)
    pub our_content: String,
    /// Content from source branch (theirs)
    pub their_content: String,
    /// Content from common ancestor
    pub ancestor_content: String,
    /// Full file content with conflict markers
    pub conflict_markers: String,
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
        // Try to get HEAD, handle unborn branch case
        let head = match self.repo.head() {
            Ok(head) => head,
            Err(e) if e.code() == git2::ErrorCode::UnbornBranch => {
                // Repository has no commits yet - create an initial commit
                log::info!("[GitManager] No commits found, creating initial commit");
                self.create_initial_commit()?;
                self.repo.head()?
            }
            Err(e) => return Err(e.into()),
        };

        let head_commit = head.peel_to_commit()?;
        let branch = self.repo.branch(name, &head_commit, force)?;

        Ok(self.branch_to_info(&branch)?)
    }

    /// Create an initial empty commit for a new repository
    fn create_initial_commit(&self) -> Result<(), GitError> {
        // Create an empty tree
        let tree_id = self.repo.index()?.write_tree()?;
        let tree = self.repo.find_tree(tree_id)?;

        // Create a signature
        let signature = self
            .repo
            .signature()
            .or_else(|_| git2::Signature::now("Ralph UI", "ralph@example.com"))?;

        // Create the initial commit
        self.repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            "Initial commit (created by Ralph UI)",
            &tree,
            &[], // No parents for initial commit
        )?;

        log::info!("[GitManager] Created initial commit");
        Ok(())
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

        let diff = self
            .repo
            .diff_tree_to_workdir_with_index(Some(&tree), Some(&mut DiffOptions::new()))?;

        Ok(self.diff_to_info(&diff)?)
    }

    /// Merge a source branch into a target branch
    /// Returns MergeResult with details about the merge outcome
    pub fn merge_branch(
        &self,
        source_branch: &str,
        target_branch: &str,
    ) -> Result<MergeResult, GitError> {
        use git2::{build::CheckoutBuilder, MergeOptions};

        log::info!(
            "[GitManager] Merging {} into {}",
            source_branch,
            target_branch
        );

        // First checkout the target branch
        self.checkout_branch(target_branch)?;

        // Get the source branch reference
        let source_ref = self.repo.find_branch(source_branch, BranchType::Local)?;
        let source_commit = source_ref.get().peel_to_commit()?;
        let annotated_commit = self.repo.find_annotated_commit(source_commit.id())?;

        // Perform merge analysis
        let (analysis, _preference) = self.repo.merge_analysis(&[&annotated_commit])?;

        if analysis.is_up_to_date() {
            log::info!("[GitManager] Already up to date");
            return Ok(MergeResult {
                success: true,
                message: "Already up to date".to_string(),
                conflict_files: vec![],
                commit_id: None,
                fast_forward: false,
            });
        }

        if analysis.is_fast_forward() {
            // Fast-forward merge
            log::info!("[GitManager] Fast-forward merge possible");

            let target_ref_name = format!("refs/heads/{}", target_branch);
            let mut target_ref = self.repo.find_reference(&target_ref_name)?;
            target_ref.set_target(
                source_commit.id(),
                &format!(
                    "Fast-forward merge {} into {}",
                    source_branch, target_branch
                ),
            )?;
            self.repo
                .checkout_head(Some(CheckoutBuilder::default().force()))?;

            return Ok(MergeResult {
                success: true,
                message: format!(
                    "Fast-forward merged {} into {}",
                    source_branch, target_branch
                ),
                conflict_files: vec![],
                commit_id: Some(source_commit.id().to_string()),
                fast_forward: true,
            });
        }

        // Normal merge
        let mut merge_opts = MergeOptions::new();
        let mut checkout_opts = CheckoutBuilder::new();
        checkout_opts.safe();

        self.repo.merge(
            &[&annotated_commit],
            Some(&mut merge_opts),
            Some(&mut checkout_opts),
        )?;

        // Check for conflicts
        let mut index = self.repo.index()?;
        if index.has_conflicts() {
            let mut conflict_files = Vec::new();
            let conflicts = index.conflicts()?;
            for conflict in conflicts {
                if let Ok(conflict) = conflict {
                    if let Some(entry) = conflict.our.or(conflict.their).or(conflict.ancestor) {
                        let path = String::from_utf8_lossy(&entry.path).to_string();
                        conflict_files.push(path);
                    }
                }
            }

            log::warn!("[GitManager] Merge has conflicts: {:?}", conflict_files);
            return Ok(MergeResult {
                success: false,
                message: format!("Merge conflicts in {} file(s)", conflict_files.len()),
                conflict_files,
                commit_id: None,
                fast_forward: false,
            });
        }

        // No conflicts - create merge commit
        let tree_id = index.write_tree()?;
        let tree = self.repo.find_tree(tree_id)?;

        let head_commit = self.repo.head()?.peel_to_commit()?;
        let signature = self
            .repo
            .signature()
            .or_else(|_| git2::Signature::now("Ralph UI", "ralph@example.com"))?;

        let merge_commit = self.repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            &format!("Merge branch '{}' into '{}'", source_branch, target_branch),
            &tree,
            &[&head_commit, &source_commit],
        )?;

        // Clean up merge state
        self.repo.cleanup_state()?;

        log::info!("[GitManager] Merge successful: {}", merge_commit);

        Ok(MergeResult {
            success: true,
            message: format!(
                "Successfully merged {} into {}",
                source_branch, target_branch
            ),
            conflict_files: vec![],
            commit_id: Some(merge_commit.to_string()),
            fast_forward: false,
        })
    }

    /// Abort an ongoing merge
    pub fn merge_abort(&self) -> Result<(), GitError> {
        log::info!("[GitManager] Aborting merge");

        // Reset to HEAD
        let head = self.repo.head()?.peel_to_commit()?;
        self.repo
            .reset(head.as_object(), git2::ResetType::Hard, None)?;

        // Clean up merge state
        self.repo.cleanup_state()?;

        Ok(())
    }

    /// Check if there are any conflicts between two branches
    pub fn check_merge_conflicts(
        &self,
        source_branch: &str,
        target_branch: &str,
    ) -> Result<Vec<String>, GitError> {
        use git2::MergeOptions;

        // Get the commits for both branches
        let source_ref = self.repo.find_branch(source_branch, BranchType::Local)?;
        let target_ref = self.repo.find_branch(target_branch, BranchType::Local)?;

        let source_commit = source_ref.get().peel_to_commit()?;
        let target_commit = target_ref.get().peel_to_commit()?;

        // Find merge base
        let merge_base = self
            .repo
            .merge_base(source_commit.id(), target_commit.id())?;

        // Get trees
        let source_tree = source_commit.tree()?;
        let target_tree = target_commit.tree()?;
        let base_commit = self.repo.find_commit(merge_base)?;
        let base_tree = base_commit.tree()?;

        // Perform index merge
        let mut merge_opts = MergeOptions::new();
        let index = self.repo.merge_trees(
            &base_tree,
            &target_tree,
            &source_tree,
            Some(&mut merge_opts),
        )?;

        let mut conflict_files = Vec::new();
        if index.has_conflicts() {
            let conflicts = index.conflicts()?;
            for conflict in conflicts {
                if let Ok(conflict) = conflict {
                    if let Some(entry) = conflict.our.or(conflict.their).or(conflict.ancestor) {
                        let path = String::from_utf8_lossy(&entry.path).to_string();
                        conflict_files.push(path);
                    }
                }
            }
        }

        Ok(conflict_files)
    }

    /// Get detailed conflict information for all files in conflict.
    /// This should be called when the repository is in a merge conflict state.
    /// Returns content from our side, their side, and the ancestor for each conflicted file.
    pub fn get_conflict_details(&self) -> Result<Vec<ConflictInfo>, GitError> {
        use std::fs;

        let index = self.repo.index()?;

        if !index.has_conflicts() {
            return Ok(Vec::new());
        }

        let mut conflicts = Vec::new();
        let workdir = self
            .repo
            .workdir()
            .ok_or_else(|| GitError::from_str("Repository has no working directory"))?;

        // Iterate through conflict entries
        for conflict in index.conflicts()? {
            let conflict = conflict?;

            // Get the path from any of the conflict entries
            let path = if let Some(ref entry) = conflict.our {
                String::from_utf8_lossy(&entry.path).to_string()
            } else if let Some(ref entry) = conflict.their {
                String::from_utf8_lossy(&entry.path).to_string()
            } else if let Some(ref entry) = conflict.ancestor {
                String::from_utf8_lossy(&entry.path).to_string()
            } else {
                continue;
            };

            // Get content from each stage
            let our_content = self.get_blob_content(conflict.our.as_ref())?;
            let their_content = self.get_blob_content(conflict.their.as_ref())?;
            let ancestor_content = self.get_blob_content(conflict.ancestor.as_ref())?;

            // Read the working directory file (contains conflict markers)
            let file_path = workdir.join(&path);
            let conflict_markers = fs::read_to_string(&file_path).unwrap_or_else(|_| String::new());

            conflicts.push(ConflictInfo {
                path,
                our_content,
                their_content,
                ancestor_content,
                conflict_markers,
            });
        }

        log::info!("[GitManager] Found {} conflict(s)", conflicts.len());
        Ok(conflicts)
    }

    /// Helper to get blob content from an index entry
    fn get_blob_content(&self, entry: Option<&git2::IndexEntry>) -> Result<String, GitError> {
        match entry {
            Some(entry) => {
                let blob = self.repo.find_blob(entry.id)?;
                Ok(String::from_utf8_lossy(blob.content()).to_string())
            }
            None => Ok(String::new()),
        }
    }

    /// Apply resolved content to a conflicted file and stage it.
    /// This writes the resolved content to the file and adds it to the index.
    pub fn resolve_conflict(&self, path: &str, resolved_content: &str) -> Result<(), GitError> {
        use std::fs;

        let workdir = self
            .repo
            .workdir()
            .ok_or_else(|| GitError::from_str("Repository has no working directory"))?;

        // Write the resolved content to the file
        let file_path = workdir.join(path);
        fs::write(&file_path, resolved_content)
            .map_err(|e| GitError::from_str(&format!("Failed to write file: {}", e)))?;

        // Stage the file
        let mut index = self.repo.index()?;
        index.add_path(Path::new(path))?;
        index.write()?;

        log::info!("[GitManager] Resolved and staged conflict for: {}", path);
        Ok(())
    }

    /// Complete a merge after all conflicts have been resolved.
    /// Creates the merge commit using the staged index.
    pub fn complete_merge(
        &self,
        message: &str,
        author_name: &str,
        author_email: &str,
    ) -> Result<CommitInfo, GitError> {
        // Check if we're actually in a merge state
        let merge_head_path = self.repo.path().join("MERGE_HEAD");
        if !merge_head_path.exists() {
            return Err(GitError::from_str("Not in a merge state"));
        }

        // Check that there are no remaining conflicts
        let index = self.repo.index()?;
        if index.has_conflicts() {
            return Err(GitError::from_str(
                "Cannot complete merge: unresolved conflicts remain",
            ));
        }

        // Read MERGE_HEAD to get the other parent
        let merge_head_content = std::fs::read_to_string(&merge_head_path)
            .map_err(|e| GitError::from_str(&format!("Failed to read MERGE_HEAD: {}", e)))?;
        let merge_head_oid = Oid::from_str(merge_head_content.trim())?;
        let merge_commit = self.repo.find_commit(merge_head_oid)?;

        // Get HEAD commit
        let head_commit = self.repo.head()?.peel_to_commit()?;

        // Write the tree from the index
        let mut index = self.repo.index()?;
        let tree_id = index.write_tree()?;
        let tree = self.repo.find_tree(tree_id)?;

        // Create signature
        let signature = Signature::now(author_name, author_email)?;

        // Create the merge commit with two parents
        let commit_id = self.repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &[&head_commit, &merge_commit],
        )?;

        // Clean up merge state
        self.repo.cleanup_state()?;

        log::info!("[GitManager] Completed merge with commit: {}", commit_id);

        // Return the commit info
        let new_commit = self.repo.find_commit(commit_id)?;
        self.commit_to_info(&new_commit)
    }

    /// Push a branch to the remote repository
    pub fn push_branch(&self, branch_name: &str, force: bool) -> Result<(), GitError> {
        // Find the remote (default to "origin")
        let mut remote = self.repo.find_remote("origin")?;

        // Build the refspec
        let refspec = if force {
            format!("+refs/heads/{}:refs/heads/{}", branch_name, branch_name)
        } else {
            format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name)
        };

        // Set up callbacks for authentication
        let mut callbacks = git2::RemoteCallbacks::new();
        callbacks.credentials(|_url, username_from_url, _allowed_types| {
            git2::Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
        });

        let mut push_options = git2::PushOptions::new();
        push_options.remote_callbacks(callbacks);

        // Push
        remote.push(&[&refspec], Some(&mut push_options))?;

        log::info!("[GitManager] Pushed branch {} to origin", branch_name);
        Ok(())
    }

    // Helper methods

    fn branch_to_info(&self, branch: &Branch) -> Result<BranchInfo, GitError> {
        let name = branch.name()?.unwrap_or("").to_string();
        let is_head = branch.is_head();
        let upstream = branch
            .upstream()
            .ok()
            .and_then(|b| b.name().ok().flatten().map(|s| s.to_string()));

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

        let parent_ids = commit.parent_ids().map(|oid| oid.to_string()).collect();

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

    fn diff_to_info(&self, diff: &Diff) -> Result<DiffInfo, GitError> {
        let stats = diff.stats()?;

        let mut files = Vec::new();
        diff.foreach(
            &mut |delta, _| {
                let old_path = delta
                    .old_file()
                    .path()
                    .map(|p| p.to_string_lossy().to_string());
                let new_path = delta
                    .new_file()
                    .path()
                    .map(|p| p.to_string_lossy().to_string());
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
