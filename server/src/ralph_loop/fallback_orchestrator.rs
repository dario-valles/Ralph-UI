//! Fallback Orchestrator for Ralph Loop
//!
//! Manages agent fallback logic when rate limits or errors are encountered.
//! Coordinates between multiple agents in a fallback chain.

use crate::models::AgentType;
use crate::ralph_loop::types::FallbackChainConfig;
use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;

/// State of an agent in the fallback chain
#[derive(Debug, Clone)]
struct AgentState {
    /// Whether the agent is currently rate-limited
    is_rate_limited: bool,
    /// When the rate limit was detected
    rate_limited_at: Option<DateTime<Utc>>,
    /// When we can retry the agent
    retry_at: Option<DateTime<Utc>>,
    /// Number of consecutive rate limit hits
    consecutive_limits: u32,
    /// Total successful iterations
    successful_iterations: u32,
    /// Total failed iterations
    failed_iterations: u32,
}

impl Default for AgentState {
    fn default() -> Self {
        Self {
            is_rate_limited: false,
            rate_limited_at: None,
            retry_at: None,
            consecutive_limits: 0,
            successful_iterations: 0,
            failed_iterations: 0,
        }
    }
}

/// The Fallback Orchestrator coordinates agent selection based on rate limits
/// and implements recovery testing for primary agents.
pub struct FallbackOrchestrator {
    /// Configuration for fallback behavior
    config: FallbackChainConfig,
    /// State of each agent in the chain
    agent_states: HashMap<AgentType, AgentState>,
    /// Index of the current agent in the fallback chain
    current_agent_index: usize,
    /// Iterations since we last tested primary recovery
    iterations_since_recovery_test: u32,
    /// Total iterations run through this orchestrator
    total_iterations: u32,
}

impl FallbackOrchestrator {
    /// Create a new FallbackOrchestrator with the given configuration
    pub fn new(config: FallbackChainConfig) -> Self {
        let mut agent_states = HashMap::new();

        // Initialize state for all agents in the chain
        for agent in &config.fallback_chain {
            agent_states.insert(*agent, AgentState::default());
        }

        Self {
            config,
            agent_states,
            current_agent_index: 0,
            iterations_since_recovery_test: 0,
            total_iterations: 0,
        }
    }

    /// Get the agent to use for the current iteration
    ///
    /// Returns the best available agent considering rate limits and recovery.
    pub fn get_agent_for_iteration(&mut self) -> AgentType {
        if !self.config.enabled || self.config.fallback_chain.is_empty() {
            // Fallback disabled - return primary or Claude as default
            return self.config.fallback_chain.first().copied().unwrap_or(AgentType::Claude);
        }

        self.total_iterations += 1;
        self.iterations_since_recovery_test += 1;

        // Check if we should test primary recovery
        if self.should_test_primary_recovery() {
            let primary = self.config.fallback_chain[0];
            if let Some(state) = self.agent_states.get_mut(&primary) {
                if state.is_rate_limited {
                    // Check if backoff period has passed
                    if let Some(retry_at) = state.retry_at {
                        if Utc::now() >= retry_at {
                            log::info!(
                                "[FallbackOrchestrator] Testing primary agent {:?} recovery",
                                primary
                            );
                            self.iterations_since_recovery_test = 0;
                            self.current_agent_index = 0;
                            return primary;
                        }
                    }
                }
            }
        }

        // Find the first non-rate-limited agent
        for (index, agent) in self.config.fallback_chain.iter().enumerate() {
            if let Some(state) = self.agent_states.get(agent) {
                if !state.is_rate_limited {
                    self.current_agent_index = index;
                    return *agent;
                }

                // Check if rate limit has expired
                if let Some(retry_at) = state.retry_at {
                    if Utc::now() >= retry_at {
                        // Clear rate limit and use this agent
                        if let Some(state) = self.agent_states.get_mut(agent) {
                            state.is_rate_limited = false;
                            state.consecutive_limits = 0;
                        }
                        self.current_agent_index = index;
                        return *agent;
                    }
                }
            }
        }

        // All agents are rate-limited - return the one with the soonest retry time
        let mut best_agent = self.config.fallback_chain[0];
        let mut soonest_retry = None;

        for agent in &self.config.fallback_chain {
            if let Some(state) = self.agent_states.get(agent) {
                if let Some(retry_at) = state.retry_at {
                    if soonest_retry.is_none() || retry_at < soonest_retry.unwrap() {
                        soonest_retry = Some(retry_at);
                        best_agent = *agent;
                    }
                }
            }
        }

        log::warn!(
            "[FallbackOrchestrator] All agents rate-limited, using {:?} with soonest retry",
            best_agent
        );

        best_agent
    }

    /// Report an error (rate limit) for an agent
    ///
    /// Marks the agent as rate-limited and calculates backoff.
    /// Returns the next agent in the fallback chain.
    pub fn report_error(&mut self, agent: AgentType, is_rate_limit: bool) -> Option<AgentType> {
        if let Some(state) = self.agent_states.get_mut(&agent) {
            state.failed_iterations += 1;

            if is_rate_limit {
                state.is_rate_limited = true;
                state.rate_limited_at = Some(Utc::now());
                state.consecutive_limits += 1;

                // Calculate exponential backoff (need to read consecutive_limits first)
                let consecutive = state.consecutive_limits;
                let backoff_ms = self.calculate_backoff(consecutive);

                // Get mutable reference again after calculate_backoff
                if let Some(state) = self.agent_states.get_mut(&agent) {
                    state.retry_at = Some(Utc::now() + Duration::milliseconds(backoff_ms as i64));
                }

                log::info!(
                    "[FallbackOrchestrator] Agent {:?} rate-limited, retry in {}ms",
                    agent,
                    backoff_ms
                );
            }
        }

        // Get next available agent
        self.get_next_fallback_agent(agent)
    }

    /// Report successful completion for an agent
    ///
    /// Clears rate limit state and resets consecutive limit counter.
    pub fn report_success(&mut self, agent: AgentType) {
        if let Some(state) = self.agent_states.get_mut(&agent) {
            state.is_rate_limited = false;
            state.consecutive_limits = 0;
            state.successful_iterations += 1;
        }

        // If this was a recovery test that succeeded, stay with primary
        if self.config.fallback_chain.first() == Some(&agent) {
            self.current_agent_index = 0;
        }
    }

    /// Check if we should test if the primary agent has recovered
    pub fn should_test_primary_recovery(&self) -> bool {
        if !self.config.test_primary_recovery {
            return false;
        }

        // Only test if we're not already on the primary
        if self.current_agent_index == 0 {
            return false;
        }

        // Check if enough iterations have passed
        self.iterations_since_recovery_test >= self.config.recovery_test_interval
    }

    /// Try to recover the primary agent
    ///
    /// Returns true if primary is available to use.
    pub fn try_recover_primary(&mut self) -> bool {
        if self.config.fallback_chain.is_empty() {
            return false;
        }

        let primary = self.config.fallback_chain[0];
        if let Some(state) = self.agent_states.get(&primary) {
            if !state.is_rate_limited {
                return true;
            }

            if let Some(retry_at) = state.retry_at {
                if Utc::now() >= retry_at {
                    // Clear rate limit
                    if let Some(state) = self.agent_states.get_mut(&primary) {
                        state.is_rate_limited = false;
                        state.consecutive_limits = 0;
                    }
                    self.current_agent_index = 0;
                    return true;
                }
            }
        }

        false
    }

    /// Get the next fallback agent after the given one
    fn get_next_fallback_agent(&self, current: AgentType) -> Option<AgentType> {
        let current_index = self.config.fallback_chain.iter().position(|a| *a == current)?;

        // Try each subsequent agent
        for i in (current_index + 1)..self.config.fallback_chain.len() {
            let agent = self.config.fallback_chain[i];
            if let Some(state) = self.agent_states.get(&agent) {
                if !state.is_rate_limited {
                    return Some(agent);
                }

                // Check if rate limit has expired
                if let Some(retry_at) = state.retry_at {
                    if Utc::now() >= retry_at {
                        return Some(agent);
                    }
                }
            }
        }

        None
    }

    /// Calculate exponential backoff duration
    fn calculate_backoff(&self, consecutive_limits: u32) -> u64 {
        let base = self.config.base_backoff_ms;
        let multiplier = 2u64.pow(consecutive_limits.saturating_sub(1));
        let backoff = base.saturating_mul(multiplier);
        backoff.min(self.config.max_backoff_ms)
    }

    /// Get current agent type being used
    pub fn current_agent(&self) -> AgentType {
        self.config.fallback_chain.get(self.current_agent_index)
            .copied()
            .unwrap_or(AgentType::Claude)
    }

    /// Check if a specific agent is rate-limited
    pub fn is_agent_rate_limited(&self, agent: AgentType) -> bool {
        self.agent_states.get(&agent)
            .map(|s| s.is_rate_limited)
            .unwrap_or(false)
    }

    /// Get time until an agent can be retried (in milliseconds)
    pub fn get_time_until_retry(&self, agent: AgentType) -> Option<i64> {
        self.agent_states.get(&agent).and_then(|state| {
            state.retry_at.map(|retry_at| {
                let now = Utc::now();
                let diff = retry_at - now;
                diff.num_milliseconds().max(0)
            })
        })
    }

    /// Get statistics for monitoring
    pub fn get_stats(&self) -> FallbackStats {
        let mut total_successful = 0;
        let mut total_failed = 0;
        let mut agents_rate_limited = 0;

        for (_, state) in &self.agent_states {
            total_successful += state.successful_iterations;
            total_failed += state.failed_iterations;
            if state.is_rate_limited {
                agents_rate_limited += 1;
            }
        }

        FallbackStats {
            current_agent: self.current_agent(),
            total_iterations: self.total_iterations,
            total_successful,
            total_failed,
            agents_rate_limited,
            fallback_chain_length: self.config.fallback_chain.len(),
        }
    }
}

/// Statistics about fallback orchestration
#[derive(Debug, Clone)]
pub struct FallbackStats {
    pub current_agent: AgentType,
    pub total_iterations: u32,
    pub total_successful: u32,
    pub total_failed: u32,
    pub agents_rate_limited: u32,
    pub fallback_chain_length: usize,
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_config() -> FallbackChainConfig {
        FallbackChainConfig {
            fallback_chain: vec![AgentType::Claude, AgentType::Opencode, AgentType::Cursor],
            test_primary_recovery: true,
            recovery_test_interval: 5,
            base_backoff_ms: 1000,
            max_backoff_ms: 60000,
            enabled: true,
        }
    }

    #[test]
    fn test_get_agent_returns_primary_initially() {
        let mut orchestrator = FallbackOrchestrator::new(default_config());
        let agent = orchestrator.get_agent_for_iteration();
        assert_eq!(agent, AgentType::Claude);
    }

    #[test]
    fn test_report_error_switches_to_fallback() {
        let mut orchestrator = FallbackOrchestrator::new(default_config());

        // Report rate limit on primary
        let next = orchestrator.report_error(AgentType::Claude, true);

        // Should suggest fallback
        assert_eq!(next, Some(AgentType::Opencode));
        assert!(orchestrator.is_agent_rate_limited(AgentType::Claude));
    }

    #[test]
    fn test_get_agent_skips_rate_limited() {
        let mut orchestrator = FallbackOrchestrator::new(default_config());

        // Rate limit primary
        orchestrator.report_error(AgentType::Claude, true);

        // Next iteration should use fallback
        let agent = orchestrator.get_agent_for_iteration();
        assert_eq!(agent, AgentType::Opencode);
    }

    #[test]
    fn test_report_success_clears_rate_limit() {
        let mut orchestrator = FallbackOrchestrator::new(default_config());

        // Rate limit then succeed
        orchestrator.report_error(AgentType::Claude, true);
        assert!(orchestrator.is_agent_rate_limited(AgentType::Claude));

        orchestrator.report_success(AgentType::Claude);
        assert!(!orchestrator.is_agent_rate_limited(AgentType::Claude));
    }

    #[test]
    fn test_exponential_backoff() {
        let orchestrator = FallbackOrchestrator::new(default_config());

        // First limit: 1000ms
        assert_eq!(orchestrator.calculate_backoff(1), 1000);
        // Second limit: 2000ms
        assert_eq!(orchestrator.calculate_backoff(2), 2000);
        // Third limit: 4000ms
        assert_eq!(orchestrator.calculate_backoff(3), 4000);
        // Max limit: 60000ms
        assert_eq!(orchestrator.calculate_backoff(10), 60000);
    }

    #[test]
    fn test_all_agents_rate_limited() {
        let mut orchestrator = FallbackOrchestrator::new(default_config());

        // Rate limit all agents
        orchestrator.report_error(AgentType::Claude, true);
        orchestrator.report_error(AgentType::Opencode, true);
        orchestrator.report_error(AgentType::Cursor, true);

        // Should still return something (the one with soonest retry)
        let agent = orchestrator.get_agent_for_iteration();
        // All were rate limited at roughly the same time, so it should be first
        assert!(orchestrator.is_agent_rate_limited(agent));
    }

    #[test]
    fn test_fallback_disabled() {
        let config = FallbackChainConfig {
            enabled: false,
            ..default_config()
        };
        let mut orchestrator = FallbackOrchestrator::new(config);

        // Even after rate limit, should return primary
        orchestrator.report_error(AgentType::Claude, true);
        let agent = orchestrator.get_agent_for_iteration();
        assert_eq!(agent, AgentType::Claude);
    }

    #[test]
    fn test_recovery_test_interval() {
        let config = FallbackChainConfig {
            recovery_test_interval: 3,
            ..default_config()
        };
        let mut orchestrator = FallbackOrchestrator::new(config);

        // Rate limit primary and use fallback
        orchestrator.report_error(AgentType::Claude, true);
        orchestrator.current_agent_index = 1; // Simulate using fallback

        // After 3 iterations, should test recovery
        for _ in 0..2 {
            orchestrator.get_agent_for_iteration();
            assert!(!orchestrator.should_test_primary_recovery());
        }

        orchestrator.iterations_since_recovery_test = 3;
        assert!(orchestrator.should_test_primary_recovery());
    }

    #[test]
    fn test_get_stats() {
        let mut orchestrator = FallbackOrchestrator::new(default_config());

        // Run some iterations
        orchestrator.get_agent_for_iteration();
        orchestrator.report_success(AgentType::Claude);
        orchestrator.get_agent_for_iteration();
        orchestrator.report_error(AgentType::Claude, true);

        let stats = orchestrator.get_stats();
        assert_eq!(stats.total_iterations, 2);
        assert_eq!(stats.total_successful, 1);
        assert_eq!(stats.total_failed, 1);
        assert_eq!(stats.agents_rate_limited, 1);
    }
}
