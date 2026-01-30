//! Branch operations for GitManager
//!
//! Contains methods for creating, deleting, listing, and checking out branches

use git2::{Branch, BranchType, Commit, Error as GitError, Oid, Signature};

use crate::git::types::BranchInfo;
use crate::git::GitManager;

impl GitManager {
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
            Err(e) => return Err(e),
        };

        let head_commit = head.peel_to_commit()?;
        let branch = self.repo.branch(name, &head_commit, force)?;

        Ok(self.branch_to_info(&branch)?)
    }

    /// Create an initial empty commit for a new repository
    pub(crate) fn create_initial_commit(&self) -> Result<(), GitError> {
        // Create an empty tree
        let tree_id = self.repo.index()?.write_tree()?;
        let tree = self.repo.find_tree(tree_id)?;

        // Create a signature
        let signature = self
            .repo
            .signature()
            .or_else(|_| Signature::now("Ralph UI", "ralph@example.com"))?;

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

    /// Convert a Branch to BranchInfo
    pub(crate) fn branch_to_info(&self, branch: &Branch) -> Result<BranchInfo, GitError> {
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

    /// Convert a Commit to CommitInfo
    pub(crate) fn commit_to_info(
        &self,
        commit: &Commit,
    ) -> Result<crate::git::types::CommitInfo, GitError> {
        let author = commit.author();

        let parent_ids = commit.parent_ids().map(|oid| oid.to_string()).collect();

        Ok(crate::git::types::CommitInfo {
            id: commit.id().to_string(),
            short_id: commit.id().to_string()[..7].to_string(),
            message: commit.message().unwrap_or("").to_string(),
            author: author.name().unwrap_or("").to_string(),
            email: author.email().unwrap_or("").to_string(),
            timestamp: commit.time().seconds(),
            parent_ids,
        })
    }

    /// Get the default branch name for this repository.
    ///
    /// Resolution order:
    /// 1. Current HEAD branch (if HEAD points to a branch)
    /// 2. First existing common default branch ("main", "master")
    /// 3. Fallback to "main"
    pub fn get_default_branch_name(&self) -> String {
        // Try to get the current HEAD branch
        if let Ok(head) = self.repo.head() {
            if head.is_branch() {
                if let Some(name) = head.shorthand() {
                    return name.to_string();
                }
            }
        }

        // Check for common default branches
        for name in &["main", "master"] {
            if self.repo.find_branch(name, BranchType::Local).is_ok() {
                return (*name).to_string();
            }
        }

        // Final fallback
        "main".to_string()
    }
}
