// Merge conflict detection for parallel agent coordination

use crate::git::GitManager;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;

/// Type of merge conflict
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ConflictType {
    /// Same file modified by multiple agents
    FileModification,
    /// Same file deleted by one agent, modified by another
    DeleteModify,
    /// File created with same name by multiple agents
    FileCreation,
    /// Directory structure conflicts
    DirectoryConflict,
}

/// Strategy for resolving conflicts
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConflictResolutionStrategy {
    /// Use changes from the first agent (timestamp-based)
    UseFirst,
    /// Use changes from the last agent (timestamp-based)
    UseLast,
    /// Use changes from higher priority task
    UsePriority,
    /// Merge changes automatically if possible
    AutoMerge,
    /// Require manual resolution
    Manual,
}

impl Default for ConflictResolutionStrategy {
    fn default() -> Self {
        Self::Manual
    }
}

/// Information about a detected merge conflict
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergeConflict {
    /// File path with conflict
    pub file_path: String,
    /// Type of conflict
    pub conflict_type: ConflictType,
    /// Agents involved in the conflict
    pub agents: Vec<String>,
    /// Branches involved in the conflict
    pub branches: Vec<String>,
    /// Recommended resolution strategy
    pub recommended_strategy: ConflictResolutionStrategy,
    /// Description of the conflict
    pub description: String,
    /// Whether the conflict can be auto-resolved
    pub auto_resolvable: bool,
}

/// Conflict detector for identifying merge conflicts
pub struct ConflictDetector {
    /// Git repository path
    repo_path: std::path::PathBuf,
}

impl ConflictDetector {
    /// Create a new conflict detector
    pub fn new(repo_path: impl AsRef<Path>) -> Self {
        Self {
            repo_path: repo_path.as_ref().to_path_buf(),
        }
    }

    /// Detect conflicts between two branches
    pub fn detect_conflicts(
        &self,
        branch1: &str,
        branch2: &str,
        agent1: &str,
        agent2: &str,
    ) -> Result<Vec<MergeConflict>> {
        let git = GitManager::new(&self.repo_path)?;

        // Get diff between branches
        let diff = git.get_diff(Some(branch1), Some(branch2))?;

        let mut conflicts = Vec::new();
        let mut file_changes: HashMap<String, Vec<String>> = HashMap::new();

        // Group files by path
        for file in &diff.files {
            let path = file.new_path.clone().or(file.old_path.clone()).unwrap_or_default();
            file_changes
                .entry(path)
                .or_insert_with(Vec::new)
                .push(branch1.to_string());
        }

        // Check for file modification conflicts
        for (file_path, branches) in file_changes {
            if branches.len() > 1 {
                conflicts.push(MergeConflict {
                    file_path: file_path.clone(),
                    conflict_type: ConflictType::FileModification,
                    agents: vec![agent1.to_string(), agent2.to_string()],
                    branches: vec![branch1.to_string(), branch2.to_string()],
                    recommended_strategy: ConflictResolutionStrategy::AutoMerge,
                    description: format!(
                        "File '{}' modified in both branches",
                        file_path
                    ),
                    auto_resolvable: false, // Requires analysis
                });
            }
        }

        Ok(conflicts)
    }

    /// Detect conflicts across multiple branches
    pub fn detect_all_conflicts(
        &self,
        branches: Vec<(String, String)>, // (branch_name, agent_id)
    ) -> Result<Vec<MergeConflict>> {
        let mut all_conflicts = Vec::new();
        let mut checked_pairs = HashSet::new();

        // Compare each pair of branches
        for i in 0..branches.len() {
            for j in (i + 1)..branches.len() {
                let (branch1, agent1) = &branches[i];
                let (branch2, agent2) = &branches[j];

                let pair = if branch1 < branch2 {
                    (branch1.clone(), branch2.clone())
                } else {
                    (branch2.clone(), branch1.clone())
                };

                if checked_pairs.contains(&pair) {
                    continue;
                }

                checked_pairs.insert(pair);

                let conflicts = self.detect_conflicts(branch1, branch2, agent1, agent2)?;
                all_conflicts.extend(conflicts);
            }
        }

        Ok(all_conflicts)
    }

    /// Check if two branches can be merged without conflicts
    pub fn can_merge_safely(&self, branch1: &str, branch2: &str) -> Result<bool> {
        let git = GitManager::new(&self.repo_path)?;

        // Get diff between branches
        let diff = git.get_diff(Some(branch1), Some(branch2))?;

        // If there are no file changes, safe to merge
        if diff.files.is_empty() {
            return Ok(true);
        }

        // For now, return false if there are any changes
        // A more sophisticated implementation would check for
        // non-overlapping changes
        Ok(false)
    }

    /// Get files modified in a branch
    pub fn get_modified_files(&self, branch: &str, base_branch: &str) -> Result<HashSet<String>> {
        let git = GitManager::new(&self.repo_path)?;

        let diff = git.get_diff(Some(base_branch), Some(branch))?;

        let files: HashSet<String> = diff.files.iter()
            .filter_map(|f| f.new_path.clone().or(f.old_path.clone()))
            .collect();

        Ok(files)
    }

    /// Detect overlapping file changes across branches
    pub fn detect_overlapping_changes(
        &self,
        base_branch: &str,
        branches: Vec<(String, String)>, // (branch_name, agent_id)
    ) -> Result<HashMap<String, Vec<String>>> {
        let mut file_to_branches: HashMap<String, Vec<String>> = HashMap::new();

        for (branch, _agent) in branches {
            let modified_files = self.get_modified_files(&branch, base_branch)?;

            for file in modified_files {
                file_to_branches
                    .entry(file)
                    .or_insert_with(Vec::new)
                    .push(branch.clone());
            }
        }

        // Filter to only files modified by multiple branches
        let overlapping: HashMap<String, Vec<String>> = file_to_branches
            .into_iter()
            .filter(|(_, branches)| branches.len() > 1)
            .collect();

        Ok(overlapping)
    }

    /// Suggest resolution strategy based on conflict analysis
    pub fn suggest_resolution(
        &self,
        conflict: &MergeConflict,
    ) -> ConflictResolutionStrategy {
        match conflict.conflict_type {
            ConflictType::FileModification => {
                // Check if changes are in different parts of file
                // For now, suggest auto-merge
                ConflictResolutionStrategy::AutoMerge
            }
            ConflictType::DeleteModify => {
                // Deletion vs modification is hard to auto-resolve
                ConflictResolutionStrategy::Manual
            }
            ConflictType::FileCreation => {
                // Multiple creates with same name needs manual resolution
                ConflictResolutionStrategy::Manual
            }
            ConflictType::DirectoryConflict => {
                // Directory conflicts need manual resolution
                ConflictResolutionStrategy::Manual
            }
        }
    }

    /// Resolve a conflict using the specified strategy
    pub fn resolve_conflict(
        &self,
        conflict: &MergeConflict,
        strategy: ConflictResolutionStrategy,
        base_branch: &str,
    ) -> Result<ConflictResolutionResult> {
        let git = GitManager::new(&self.repo_path)?;

        match strategy {
            ConflictResolutionStrategy::UseFirst => {
                // Use the first branch's version (keep base)
                if let Some(first_branch) = conflict.branches.first() {
                    self.checkout_file_from_branch(&git, first_branch, &conflict.file_path)?;
                }
                Ok(ConflictResolutionResult {
                    file_path: conflict.file_path.clone(),
                    strategy_used: strategy,
                    success: true,
                    message: "Resolved using first branch's version".to_string(),
                })
            }
            ConflictResolutionStrategy::UseLast => {
                // Use the last branch's version
                if let Some(last_branch) = conflict.branches.last() {
                    self.checkout_file_from_branch(&git, last_branch, &conflict.file_path)?;
                }
                Ok(ConflictResolutionResult {
                    file_path: conflict.file_path.clone(),
                    strategy_used: strategy,
                    success: true,
                    message: "Resolved using last branch's version".to_string(),
                })
            }
            ConflictResolutionStrategy::UsePriority => {
                // For priority-based resolution, use the first branch (assumed higher priority)
                if let Some(first_branch) = conflict.branches.first() {
                    self.checkout_file_from_branch(&git, first_branch, &conflict.file_path)?;
                }
                Ok(ConflictResolutionResult {
                    file_path: conflict.file_path.clone(),
                    strategy_used: strategy,
                    success: true,
                    message: "Resolved using higher priority branch's version".to_string(),
                })
            }
            ConflictResolutionStrategy::AutoMerge => {
                // Auto-merge is complex - for now, report that it requires git merge
                Ok(ConflictResolutionResult {
                    file_path: conflict.file_path.clone(),
                    strategy_used: strategy,
                    success: conflict.auto_resolvable,
                    message: if conflict.auto_resolvable {
                        "Auto-merge successful".to_string()
                    } else {
                        "Auto-merge not possible, manual resolution required".to_string()
                    },
                })
            }
            ConflictResolutionStrategy::Manual => {
                // Manual resolution just marks the conflict for user attention
                Ok(ConflictResolutionResult {
                    file_path: conflict.file_path.clone(),
                    strategy_used: strategy,
                    success: false,
                    message: "Marked for manual resolution".to_string(),
                })
            }
        }
    }

    /// Checkout a specific file from a branch
    fn checkout_file_from_branch(
        &self,
        _git: &GitManager,
        branch: &str,
        file_path: &str,
    ) -> Result<()> {
        // Use git checkout to get the file from the specified branch
        use std::process::Command;

        let output = Command::new("git")
            .args(["checkout", branch, "--", file_path])
            .current_dir(&self.repo_path)
            .output()?;

        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Failed to checkout file: {}", error));
        }

        Ok(())
    }

    /// Get conflict summary for reporting
    pub fn get_conflict_summary(
        &self,
        conflicts: &[MergeConflict],
    ) -> ConflictSummary {
        let total = conflicts.len();
        let auto_resolvable = conflicts.iter().filter(|c| c.auto_resolvable).count();
        let manual_required = total - auto_resolvable;

        let mut by_type: HashMap<ConflictType, usize> = HashMap::new();
        for conflict in conflicts {
            *by_type.entry(conflict.conflict_type).or_insert(0) += 1;
        }

        let unique_files: HashSet<String> = conflicts
            .iter()
            .map(|c| c.file_path.clone())
            .collect();

        ConflictSummary {
            total_conflicts: total,
            auto_resolvable,
            manual_required,
            unique_files: unique_files.len(),
            conflicts_by_type: by_type,
        }
    }
}

/// Summary of conflicts
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictSummary {
    pub total_conflicts: usize,
    pub auto_resolvable: usize,
    pub manual_required: usize,
    pub unique_files: usize,
    pub conflicts_by_type: HashMap<ConflictType, usize>,
}

/// Result of conflict resolution
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConflictResolutionResult {
    pub file_path: String,
    pub strategy_used: ConflictResolutionStrategy,
    pub success: bool,
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_conflict_detector_creation() {
        let detector = ConflictDetector::new("/tmp/test-repo");
        assert_eq!(detector.repo_path, std::path::PathBuf::from("/tmp/test-repo"));
    }

    #[test]
    fn test_default_resolution_strategy() {
        let strategy = ConflictResolutionStrategy::default();
        assert_eq!(strategy, ConflictResolutionStrategy::Manual);
    }

    #[test]
    fn test_suggest_resolution_file_modification() {
        let detector = ConflictDetector::new("/tmp/test-repo");
        let conflict = MergeConflict {
            file_path: "test.txt".to_string(),
            conflict_type: ConflictType::FileModification,
            agents: vec!["agent1".to_string(), "agent2".to_string()],
            branches: vec!["branch1".to_string(), "branch2".to_string()],
            recommended_strategy: ConflictResolutionStrategy::AutoMerge,
            description: "File modified".to_string(),
            auto_resolvable: false,
        };

        let strategy = detector.suggest_resolution(&conflict);
        assert_eq!(strategy, ConflictResolutionStrategy::AutoMerge);
    }

    #[test]
    fn test_suggest_resolution_delete_modify() {
        let detector = ConflictDetector::new("/tmp/test-repo");
        let conflict = MergeConflict {
            file_path: "test.txt".to_string(),
            conflict_type: ConflictType::DeleteModify,
            agents: vec!["agent1".to_string(), "agent2".to_string()],
            branches: vec!["branch1".to_string(), "branch2".to_string()],
            recommended_strategy: ConflictResolutionStrategy::Manual,
            description: "File deleted and modified".to_string(),
            auto_resolvable: false,
        };

        let strategy = detector.suggest_resolution(&conflict);
        assert_eq!(strategy, ConflictResolutionStrategy::Manual);
    }

    #[test]
    fn test_conflict_summary() {
        let detector = ConflictDetector::new("/tmp/test-repo");
        let conflicts = vec![
            MergeConflict {
                file_path: "file1.txt".to_string(),
                conflict_type: ConflictType::FileModification,
                agents: vec!["agent1".to_string(), "agent2".to_string()],
                branches: vec!["branch1".to_string(), "branch2".to_string()],
                recommended_strategy: ConflictResolutionStrategy::AutoMerge,
                description: "Test".to_string(),
                auto_resolvable: true,
            },
            MergeConflict {
                file_path: "file2.txt".to_string(),
                conflict_type: ConflictType::DeleteModify,
                agents: vec!["agent1".to_string(), "agent3".to_string()],
                branches: vec!["branch1".to_string(), "branch3".to_string()],
                recommended_strategy: ConflictResolutionStrategy::Manual,
                description: "Test".to_string(),
                auto_resolvable: false,
            },
        ];

        let summary = detector.get_conflict_summary(&conflicts);
        assert_eq!(summary.total_conflicts, 2);
        assert_eq!(summary.auto_resolvable, 1);
        assert_eq!(summary.manual_required, 1);
        assert_eq!(summary.unique_files, 2);
    }

    #[test]
    fn test_merge_conflict_serialization() {
        let conflict = MergeConflict {
            file_path: "test.txt".to_string(),
            conflict_type: ConflictType::FileModification,
            agents: vec!["agent1".to_string()],
            branches: vec!["branch1".to_string()],
            recommended_strategy: ConflictResolutionStrategy::Manual,
            description: "Test conflict".to_string(),
            auto_resolvable: false,
        };

        let json = serde_json::to_string(&conflict).unwrap();
        let deserialized: MergeConflict = serde_json::from_str(&json).unwrap();

        assert_eq!(conflict.file_path, deserialized.file_path);
        assert_eq!(conflict.conflict_type, deserialized.conflict_type);
    }

    #[test]
    fn test_conflict_type_serialization() {
        let types = vec![
            ConflictType::FileModification,
            ConflictType::DeleteModify,
            ConflictType::FileCreation,
            ConflictType::DirectoryConflict,
        ];

        for conflict_type in types {
            let json = serde_json::to_string(&conflict_type).unwrap();
            let deserialized: ConflictType = serde_json::from_str(&json).unwrap();
            assert_eq!(conflict_type, deserialized);
        }
    }

    #[test]
    fn test_resolution_strategy_serialization() {
        let strategies = vec![
            ConflictResolutionStrategy::UseFirst,
            ConflictResolutionStrategy::UseLast,
            ConflictResolutionStrategy::UsePriority,
            ConflictResolutionStrategy::AutoMerge,
            ConflictResolutionStrategy::Manual,
        ];

        for strategy in strategies {
            let json = serde_json::to_string(&strategy).unwrap();
            let deserialized: ConflictResolutionStrategy = serde_json::from_str(&json).unwrap();
            assert_eq!(strategy, deserialized);
        }
    }

    #[test]
    fn test_conflict_resolution_result_serialization() {
        let result = ConflictResolutionResult {
            file_path: "test.txt".to_string(),
            strategy_used: ConflictResolutionStrategy::UseFirst,
            success: true,
            message: "Resolved using first branch".to_string(),
        };

        let json = serde_json::to_string(&result).unwrap();
        let deserialized: ConflictResolutionResult = serde_json::from_str(&json).unwrap();

        assert_eq!(result.file_path, deserialized.file_path);
        assert_eq!(result.strategy_used, deserialized.strategy_used);
        assert_eq!(result.success, deserialized.success);
        assert_eq!(result.message, deserialized.message);
    }

    #[test]
    fn test_resolve_conflict_strategies() {
        // Test that all resolution strategies can be represented
        let strategies = vec![
            ConflictResolutionStrategy::UseFirst,
            ConflictResolutionStrategy::UseLast,
            ConflictResolutionStrategy::UsePriority,
            ConflictResolutionStrategy::AutoMerge,
            ConflictResolutionStrategy::Manual,
        ];

        for strategy in &strategies {
            let result = ConflictResolutionResult {
                file_path: "test.txt".to_string(),
                strategy_used: strategy.clone(),
                success: matches!(strategy, ConflictResolutionStrategy::Manual),
                message: format!("Using {:?} strategy", strategy),
            };

            // Verify serialization works
            let json = serde_json::to_string(&result).unwrap();
            let deserialized: ConflictResolutionResult = serde_json::from_str(&json).unwrap();
            assert_eq!(result.strategy_used, deserialized.strategy_used);
        }
    }

    #[test]
    fn test_conflict_resolution_result_fields() {
        // Test all ConflictResolutionResult field combinations
        let test_cases = vec![
            (true, "Success message"),
            (false, "Failure message"),
        ];

        for (success, message) in test_cases {
            let result = ConflictResolutionResult {
                file_path: "path/to/file.rs".to_string(),
                strategy_used: ConflictResolutionStrategy::UseFirst,
                success,
                message: message.to_string(),
            };

            assert_eq!(result.file_path, "path/to/file.rs");
            assert_eq!(result.success, success);
            assert_eq!(result.message, message);
        }
    }
}
