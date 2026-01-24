//! Competitive execution manager for US-5.3
//!
//! Manages parallel execution attempts, scoring, and selection of the winning solution.

use crate::models::AgentType;
use crate::ralph_loop::types::{CompetitiveAttempt, CompetitiveSelectionStrategy, PrdExecution};

/// Manager for competitive execution scenarios
pub struct CompetitiveExecutionManager {
    selection_strategy: CompetitiveSelectionStrategy,
    timeout_secs: u64,
}

impl CompetitiveExecutionManager {
    /// Create a new competitive execution manager
    pub fn new(strategy: CompetitiveSelectionStrategy, timeout_secs: u64) -> Self {
        Self {
            selection_strategy: strategy,
            timeout_secs,
        }
    }

    /// Create a competitive attempt for a given number
    pub fn create_attempt(
        &self,
        attempt_number: u32,
        agent_type: AgentType,
        model: Option<String>,
    ) -> CompetitiveAttempt {
        CompetitiveAttempt::new(attempt_number, agent_type, model)
    }

    /// Score all completed attempts and return the best one according to strategy
    pub fn select_best_attempt(
        &self,
        execution: &mut PrdExecution,
    ) -> Result<(), String> {
        let completed = execution.get_completed_attempts();

        if completed.is_empty() {
            return Err("No completed attempts to select from".to_string());
        }

        // For HumanReview, don't auto-select
        if self.selection_strategy == CompetitiveSelectionStrategy::HumanReview {
            return Err("Selection strategy is HumanReview - manual selection required".to_string());
        }

        // Score all attempts and find the best one
        let mut scored: Vec<(f64, String)> = completed
            .iter()
            .map(|a| {
                let score = a.calculate_score(self.selection_strategy);
                (score, a.id.clone())
            })
            .collect();

        // Sort by score based on strategy
        // All strategies: higher score is better
        match self.selection_strategy {
            CompetitiveSelectionStrategy::FirstComplete => {
                // Earliest completion = most negative timestamp = lower/worse score
                // So sort ascending to get earliest
                scored.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
            }
            CompetitiveSelectionStrategy::BestCoverage => {
                // Higher coverage % = higher score, so sort descending
                scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
            }
            CompetitiveSelectionStrategy::MinimalCode => {
                // Fewer changes = less negative score = higher score, so sort descending
                scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
            }
            CompetitiveSelectionStrategy::HumanReview => {
                // Unreachable - handled above
                unreachable!()
            }
        }

        // Select the first (best) attempt
        if let Some((_, attempt_id)) = scored.first() {
            let reason = match self.selection_strategy {
                CompetitiveSelectionStrategy::FirstComplete => "First Complete",
                CompetitiveSelectionStrategy::BestCoverage => "Best Coverage",
                CompetitiveSelectionStrategy::MinimalCode => "Minimal Code",
                CompetitiveSelectionStrategy::HumanReview => "Human Review",
            };

            execution.select_competitive_attempt(attempt_id, reason)?;
            Ok(())
        } else {
            Err("Failed to select attempt".to_string())
        }
    }

    /// Check if selection timeout has been exceeded
    pub fn should_force_selection(&self, attempts: &[CompetitiveAttempt]) -> bool {
        if self.timeout_secs == 0 {
            return false; // No timeout
        }

        if let Some(first_attempt) = attempts.first() {
            if let Ok(started) = chrono::DateTime::parse_from_rfc3339(&first_attempt.started_at) {
                let elapsed_secs = chrono::Utc::now()
                    .signed_duration_since(started)
                    .num_seconds() as u64;
                elapsed_secs >= self.timeout_secs
            } else {
                false
            }
        } else {
            false
        }
    }

    /// Get configuration summary
    pub fn get_summary(&self) -> String {
        let strategy = match self.selection_strategy {
            CompetitiveSelectionStrategy::FirstComplete => "First Complete",
            CompetitiveSelectionStrategy::BestCoverage => "Best Coverage",
            CompetitiveSelectionStrategy::MinimalCode => "Minimal Code",
            CompetitiveSelectionStrategy::HumanReview => "Human Review",
        };

        let timeout = if self.timeout_secs == 0 {
            "unlimited".to_string()
        } else {
            format!("{}s", self.timeout_secs)
        };

        format!("Competitive execution: {} selection, {} timeout", strategy, timeout)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_competitive_execution_manager() {
        let manager = CompetitiveExecutionManager::new(CompetitiveSelectionStrategy::FirstComplete, 300);
        assert_eq!(manager.selection_strategy, CompetitiveSelectionStrategy::FirstComplete);
        assert_eq!(manager.timeout_secs, 300);
    }

    #[test]
    fn test_create_attempt() {
        let manager = CompetitiveExecutionManager::new(CompetitiveSelectionStrategy::FirstComplete, 300);
        let attempt = manager.create_attempt(1, AgentType::Claude, Some("claude-opus-4-5".to_string()));

        assert_eq!(attempt.attempt_number, 1);
        assert_eq!(attempt.agent_type, AgentType::Claude);
        assert_eq!(attempt.model, Some("claude-opus-4-5".to_string()));
        assert!(!attempt.id.is_empty());
    }

    #[test]
    fn test_select_best_attempt_first_complete() {
        let manager = CompetitiveExecutionManager::new(CompetitiveSelectionStrategy::FirstComplete, 0);
        let mut execution = PrdExecution::new("exec-1", AgentType::Claude);

        let mut attempt1 = CompetitiveAttempt::new(1, AgentType::Claude, None);
        attempt1.stories_completed = 5;
        attempt1.mark_completed(5, 0);
        let attempt1_id = attempt1.id.clone();

        let mut attempt2 = CompetitiveAttempt::new(2, AgentType::Opencode, None);
        attempt2.stories_completed = 4;
        attempt2.mark_completed(4, 1);

        execution.add_competitive_attempt(attempt1);
        execution.add_competitive_attempt(attempt2);

        let result = manager.select_best_attempt(&mut execution);
        assert!(result.is_ok());
        assert_eq!(execution.selected_attempt_id, Some(attempt1_id));
    }

    #[test]
    fn test_select_best_attempt_best_coverage() {
        let manager = CompetitiveExecutionManager::new(CompetitiveSelectionStrategy::BestCoverage, 0);
        let mut execution = PrdExecution::new("exec-1", AgentType::Claude);

        let mut attempt1 = CompetitiveAttempt::new(1, AgentType::Claude, None);
        attempt1.stories_completed = 5;
        attempt1.coverage_percent = 75.0;
        attempt1.mark_completed(5, 0);

        let mut attempt2 = CompetitiveAttempt::new(2, AgentType::Opencode, None);
        attempt2.stories_completed = 4;
        attempt2.coverage_percent = 85.0;
        attempt2.mark_completed(4, 1);
        let attempt2_id = attempt2.id.clone();

        execution.add_competitive_attempt(attempt1);
        execution.add_competitive_attempt(attempt2);

        let result = manager.select_best_attempt(&mut execution);
        assert!(result.is_ok());
        assert_eq!(execution.selected_attempt_id, Some(attempt2_id));
    }

    #[test]
    fn test_select_best_attempt_minimal_code() {
        let manager = CompetitiveExecutionManager::new(CompetitiveSelectionStrategy::MinimalCode, 0);
        let mut execution = PrdExecution::new("exec-1", AgentType::Claude);

        let mut attempt1 = CompetitiveAttempt::new(1, AgentType::Claude, None);
        attempt1.lines_changed = 500;
        attempt1.stories_completed = 5;
        attempt1.mark_completed(5, 0);
        let attempt1_id = attempt1.id.clone();

        let mut attempt2 = CompetitiveAttempt::new(2, AgentType::Opencode, None);
        attempt2.lines_changed = 1500;
        attempt2.stories_completed = 4;
        attempt2.mark_completed(4, 1);

        execution.add_competitive_attempt(attempt1);
        execution.add_competitive_attempt(attempt2);

        let result = manager.select_best_attempt(&mut execution);
        assert!(result.is_ok());
        assert_eq!(execution.selected_attempt_id, Some(attempt1_id));
    }

    #[test]
    fn test_select_best_attempt_human_review() {
        let manager = CompetitiveExecutionManager::new(CompetitiveSelectionStrategy::HumanReview, 0);
        let mut execution = PrdExecution::new("exec-1", AgentType::Claude);

        let mut attempt1 = CompetitiveAttempt::new(1, AgentType::Claude, None);
        attempt1.stories_completed = 5;
        attempt1.mark_completed(5, 0);

        execution.add_competitive_attempt(attempt1);

        let result = manager.select_best_attempt(&mut execution);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("HumanReview"));
    }

    #[test]
    fn test_no_completed_attempts() {
        let manager = CompetitiveExecutionManager::new(CompetitiveSelectionStrategy::FirstComplete, 0);
        let mut execution = PrdExecution::new("exec-1", AgentType::Claude);

        let attempt1 = CompetitiveAttempt::new(1, AgentType::Claude, None);
        execution.add_competitive_attempt(attempt1);

        let result = manager.select_best_attempt(&mut execution);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No completed attempts"));
    }

    #[test]
    fn test_timeout_check_exceeded() {
        let manager = CompetitiveExecutionManager::new(CompetitiveSelectionStrategy::FirstComplete, 1);

        let attempt = CompetitiveAttempt::new(1, AgentType::Claude, None);
        std::thread::sleep(std::time::Duration::from_secs(2));

        let should_force = manager.should_force_selection(&[attempt]);
        assert!(should_force);
    }

    #[test]
    fn test_timeout_check_not_exceeded() {
        let manager = CompetitiveExecutionManager::new(CompetitiveSelectionStrategy::FirstComplete, 100);

        let attempt = CompetitiveAttempt::new(1, AgentType::Claude, None);

        let should_force = manager.should_force_selection(&[attempt]);
        assert!(!should_force);
    }

    #[test]
    fn test_timeout_disabled() {
        let manager = CompetitiveExecutionManager::new(CompetitiveSelectionStrategy::FirstComplete, 0);

        let attempt = CompetitiveAttempt::new(1, AgentType::Claude, None);
        std::thread::sleep(std::time::Duration::from_millis(100));

        let should_force = manager.should_force_selection(&[attempt]);
        assert!(!should_force); // Never forces when timeout is 0
    }

    #[test]
    fn test_manager_summary() {
        let manager = CompetitiveExecutionManager::new(CompetitiveSelectionStrategy::BestCoverage, 600);
        let summary = manager.get_summary();

        assert!(summary.contains("Best Coverage"));
        assert!(summary.contains("600s"));
    }

    #[test]
    fn test_manager_summary_unlimited_timeout() {
        let manager = CompetitiveExecutionManager::new(CompetitiveSelectionStrategy::FirstComplete, 0);
        let summary = manager.get_summary();

        assert!(summary.contains("First Complete"));
        assert!(summary.contains("unlimited"));
    }
}
