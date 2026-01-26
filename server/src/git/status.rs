//! Status and file tracking operations for GitManager
//!
//! Contains methods for getting repository status

use git2::{Error as GitError, Status, StatusOptions};

use crate::git::types::FileStatus;
use crate::git::GitManager;

impl GitManager {
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

    /// Convert a Status to a string representation
    pub(crate) fn status_to_string(&self, status: Status) -> String {
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
}
