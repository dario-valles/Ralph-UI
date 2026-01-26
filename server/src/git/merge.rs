//! Merge and conflict handling for GitManager
//!
//! Contains methods for merging branches and resolving conflicts

use git2::{build::CheckoutBuilder, BranchType, Error as GitError, MergeOptions, Oid, Signature};
use std::path::Path;

use crate::git::types::{CommitInfo, ConflictInfo, MergeResult};
use crate::git::GitManager;

impl GitManager {
    /// Merge a source branch into a target branch
    /// Returns MergeResult with details about the merge outcome
    pub fn merge_branch(
        &self,
        source_branch: &str,
        target_branch: &str,
    ) -> Result<MergeResult, GitError> {
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
            .or_else(|_| Signature::now("Ralph UI", "ralph@example.com"))?;

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
    pub(crate) fn get_blob_content(
        &self,
        entry: Option<&git2::IndexEntry>,
    ) -> Result<String, GitError> {
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
}
