//! Commit operations for GitManager
//!
//! Contains methods for creating commits, viewing history, and diffs

use git2::{Delta, Diff, DiffOptions, Error as GitError, Oid, Signature};
use std::path::Path;

use crate::git::types::{CommitInfo, DiffInfo, FileDiff};
use crate::git::GitManager;

impl GitManager {
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

    /// Convert a Diff to DiffInfo
    pub(crate) fn diff_to_info(&self, diff: &Diff) -> Result<DiffInfo, GitError> {
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

    /// Convert a Delta to a string representation
    pub(crate) fn delta_to_string(&self, delta: Delta) -> String {
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
