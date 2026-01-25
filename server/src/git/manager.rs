//! Core GitManager implementation
//!
//! Contains the GitManager struct and its basic operations

use git2::{Error as GitError, Repository};
use std::path::{Path, PathBuf};

/// Git manager for repository operations
pub struct GitManager {
    pub(crate) repo: Repository,
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

    /// Get a reference to the underlying repository
    pub(crate) fn repo(&self) -> &Repository {
        &self.repo
    }
}
