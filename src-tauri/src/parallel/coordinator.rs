// Worktree isolation coordinator for parallel agents

use crate::git::GitManager;
use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Information about an allocated worktree
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorktreeAllocation {
    pub agent_id: String,
    pub task_id: String,
    pub worktree_path: String,
    pub branch: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}

/// Coordinator for managing worktree isolation across parallel agents
pub struct WorktreeCoordinator {
    /// Base repository path
    repo_path: PathBuf,
    /// Base worktree directory
    worktree_base: PathBuf,
    /// Active worktree allocations (worktree_path -> allocation)
    allocations: HashMap<String, WorktreeAllocation>,
}

impl WorktreeCoordinator {
    /// Create a new worktree coordinator
    pub fn new(repo_path: impl AsRef<Path>) -> Self {
        let repo_path = repo_path.as_ref().to_path_buf();
        let mut worktree_base = repo_path.clone();
        worktree_base.push("worktrees");

        Self {
            repo_path,
            worktree_base,
            allocations: HashMap::new(),
        }
    }

    /// Set custom worktree base directory
    pub fn with_worktree_base(mut self, base: impl AsRef<Path>) -> Self {
        self.worktree_base = base.as_ref().to_path_buf();
        self
    }

    /// Allocate a new worktree for an agent
    pub fn allocate_worktree(
        &mut self,
        agent_id: &str,
        task_id: &str,
        branch_name: &str,
    ) -> Result<WorktreeAllocation> {
        // Check if agent already has a worktree
        if self.get_allocation_by_agent(agent_id).is_some() {
            return Err(anyhow!("Agent {} already has a worktree allocated", agent_id));
        }

        // Create worktree path
        let worktree_path = self.worktree_base.join(task_id);
        let worktree_path_str = worktree_path
            .to_str()
            .ok_or_else(|| anyhow!("Invalid worktree path"))?
            .to_string();

        // Check if worktree path already exists
        if self.allocations.contains_key(&worktree_path_str) {
            return Err(anyhow!("Worktree path already allocated: {}", worktree_path_str));
        }

        // Create worktree using git
        let git = GitManager::new(&self.repo_path)?;
        git.create_worktree(&worktree_path_str, branch_name)?;

        // Create allocation record
        let allocation = WorktreeAllocation {
            agent_id: agent_id.to_string(),
            task_id: task_id.to_string(),
            worktree_path: worktree_path_str.clone(),
            branch: branch_name.to_string(),
            created_at: chrono::Utc::now(),
        };

        self.allocations.insert(worktree_path_str, allocation.clone());

        Ok(allocation)
    }

    /// Deallocate a worktree
    pub fn deallocate_worktree(&mut self, worktree_path: &str) -> Result<()> {
        // Check if allocation exists
        if !self.allocations.contains_key(worktree_path) {
            return Err(anyhow!("Worktree not allocated: {}", worktree_path));
        }

        // Remove worktree using git
        let git = GitManager::new(&self.repo_path)?;
        git.remove_worktree(worktree_path)?;

        // Remove allocation record
        self.allocations.remove(worktree_path);

        Ok(())
    }

    /// Deallocate worktree by agent ID
    pub fn deallocate_by_agent(&mut self, agent_id: &str) -> Result<()> {
        let allocation = self
            .get_allocation_by_agent(agent_id)
            .ok_or_else(|| anyhow!("No worktree allocated for agent: {}", agent_id))?;

        let worktree_path = allocation.worktree_path.clone();
        self.deallocate_worktree(&worktree_path)
    }

    /// Deallocate all worktrees
    pub fn deallocate_all(&mut self) -> Result<()> {
        let paths: Vec<String> = self.allocations.keys().cloned().collect();

        for path in paths {
            let _ = self.deallocate_worktree(&path); // Best effort
        }

        Ok(())
    }

    /// Get allocation by agent ID
    pub fn get_allocation_by_agent(&self, agent_id: &str) -> Option<WorktreeAllocation> {
        self.allocations
            .values()
            .find(|a| a.agent_id == agent_id)
            .cloned()
    }

    /// Get allocation by task ID
    pub fn get_allocation_by_task(&self, task_id: &str) -> Option<WorktreeAllocation> {
        self.allocations
            .values()
            .find(|a| a.task_id == task_id)
            .cloned()
    }

    /// Get allocation by worktree path
    pub fn get_allocation(&self, worktree_path: &str) -> Option<WorktreeAllocation> {
        self.allocations.get(worktree_path).cloned()
    }

    /// Get all allocations
    pub fn get_all_allocations(&self) -> Vec<WorktreeAllocation> {
        self.allocations.values().cloned().collect()
    }

    /// Get number of active allocations
    pub fn allocation_count(&self) -> usize {
        self.allocations.len()
    }

    /// Check if an agent has a worktree allocated
    pub fn is_allocated(&self, agent_id: &str) -> bool {
        self.get_allocation_by_agent(agent_id).is_some()
    }

    /// Get worktree path for an agent
    pub fn get_worktree_path(&self, agent_id: &str) -> Option<String> {
        self.get_allocation_by_agent(agent_id)
            .map(|a| a.worktree_path)
    }

    /// Get branch name for an agent
    pub fn get_branch(&self, agent_id: &str) -> Option<String> {
        self.get_allocation_by_agent(agent_id)
            .map(|a| a.branch)
    }

    /// Ensure worktree base directory exists
    pub fn ensure_base_directory(&self) -> Result<()> {
        if !self.worktree_base.exists() {
            std::fs::create_dir_all(&self.worktree_base)
                .map_err(|e| anyhow!("Failed to create worktree base directory: {}", e))?;
        }
        Ok(())
    }

    /// Clean up orphaned worktrees (worktrees without allocations)
    pub fn cleanup_orphaned(&mut self) -> Result<Vec<String>> {
        let git = GitManager::new(&self.repo_path)?;
        let all_worktrees = git.list_worktrees()?;

        let mut cleaned = Vec::new();

        for worktree in all_worktrees {
            // Skip main worktree
            if worktree.path == self.repo_path.to_string_lossy() {
                continue;
            }

            // Check if worktree is in our base directory
            if !worktree.path.starts_with(&self.worktree_base.to_string_lossy().to_string()) {
                continue;
            }

            // Check if we have an allocation for this worktree
            if !self.allocations.contains_key(&worktree.path) {
                // This is an orphaned worktree, clean it up
                if let Err(e) = git.remove_worktree(&worktree.path) {
                    eprintln!("Failed to remove orphaned worktree {}: {}", worktree.path, e);
                } else {
                    cleaned.push(worktree.path);
                }
            }
        }

        Ok(cleaned)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn test_coordinator_creation() {
        let coordinator = WorktreeCoordinator::new("/tmp/test-repo");
        assert_eq!(coordinator.allocation_count(), 0);
    }

    #[test]
    fn test_with_worktree_base() {
        let coordinator = WorktreeCoordinator::new("/tmp/test-repo")
            .with_worktree_base("/tmp/custom-worktrees");

        assert_eq!(
            coordinator.worktree_base,
            PathBuf::from("/tmp/custom-worktrees")
        );
    }

    #[test]
    fn test_allocation_count() {
        let coordinator = WorktreeCoordinator::new("/tmp/test-repo");
        assert_eq!(coordinator.allocation_count(), 0);
    }

    #[test]
    fn test_is_allocated() {
        let coordinator = WorktreeCoordinator::new("/tmp/test-repo");
        assert!(!coordinator.is_allocated("agent1"));
    }

    #[test]
    fn test_get_allocation_by_agent_none() {
        let coordinator = WorktreeCoordinator::new("/tmp/test-repo");
        assert!(coordinator.get_allocation_by_agent("agent1").is_none());
    }

    #[test]
    fn test_get_allocation_by_task_none() {
        let coordinator = WorktreeCoordinator::new("/tmp/test-repo");
        assert!(coordinator.get_allocation_by_task("task1").is_none());
    }

    #[test]
    fn test_get_all_allocations_empty() {
        let coordinator = WorktreeCoordinator::new("/tmp/test-repo");
        assert_eq!(coordinator.get_all_allocations().len(), 0);
    }

    #[test]
    fn test_get_worktree_path_none() {
        let coordinator = WorktreeCoordinator::new("/tmp/test-repo");
        assert!(coordinator.get_worktree_path("agent1").is_none());
    }

    #[test]
    fn test_get_branch_none() {
        let coordinator = WorktreeCoordinator::new("/tmp/test-repo");
        assert!(coordinator.get_branch("agent1").is_none());
    }

    #[test]
    fn test_ensure_base_directory() {
        let temp_dir = env::temp_dir().join(format!("ralph-test-{}", uuid::Uuid::new_v4()));
        let coordinator = WorktreeCoordinator::new(&temp_dir);

        let result = coordinator.ensure_base_directory();
        assert!(result.is_ok());

        // Cleanup
        let _ = std::fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_worktree_allocation_serialization() {
        use chrono::Utc;

        let allocation = WorktreeAllocation {
            agent_id: "agent1".to_string(),
            task_id: "task1".to_string(),
            worktree_path: "/tmp/worktree1".to_string(),
            branch: "feature/task1".to_string(),
            created_at: Utc::now(),
        };

        let json = serde_json::to_string(&allocation).unwrap();
        let deserialized: WorktreeAllocation = serde_json::from_str(&json).unwrap();

        assert_eq!(allocation.agent_id, deserialized.agent_id);
        assert_eq!(allocation.task_id, deserialized.task_id);
    }

    // Note: Tests that involve actual git operations are not included here
    // as they require a real git repository. Those would be integration tests.
}
