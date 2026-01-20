// Agent fallback management for rate limiting
#![allow(dead_code)]

use crate::models::AgentType;
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Configuration for fallback behavior
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FallbackConfig {
    /// Base backoff time in milliseconds (default: 5000)
    pub base_backoff_ms: u64,
    /// Maximum backoff time in milliseconds (default: 300000 = 5 minutes)
    pub max_backoff_ms: u64,
    /// Backoff multiplier (default: 3 for exponential backoff)
    pub backoff_multiplier: u32,
    /// Fallback agent type when primary is rate-limited
    pub fallback_agent: Option<AgentType>,
    /// Whether to enable automatic fallback
    pub enable_fallback: bool,
}

impl Default for FallbackConfig {
    fn default() -> Self {
        Self {
            base_backoff_ms: 5000,
            max_backoff_ms: 300_000, // 5 minutes
            backoff_multiplier: 3,
            fallback_agent: None,
            enable_fallback: true,
        }
    }
}

/// Information about a rate-limited agent
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RateLimitedAgent {
    /// The agent type that was rate-limited
    pub agent_type: AgentType,
    /// When the rate limit was detected
    pub detected_at: DateTime<Utc>,
    /// Number of consecutive rate limit hits
    pub attempt_count: u32,
    /// When the agent can be retried
    pub retry_at: DateTime<Utc>,
    /// The task that was being processed when rate limited
    pub task_id: String,
}

/// Manages agent fallback logic when rate limits are encountered
pub struct AgentFallbackManager {
    config: FallbackConfig,
    /// Map of agent type to their rate limit status
    rate_limited: HashMap<AgentType, RateLimitedAgent>,
    /// Set of task IDs that have experienced rate limits
    affected_tasks: HashSet<String>,
    /// History of fallbacks for debugging/monitoring
    fallback_history: Vec<FallbackEvent>,
}

/// Record of a fallback event
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FallbackEvent {
    pub timestamp: DateTime<Utc>,
    pub from_agent: AgentType,
    pub to_agent: Option<AgentType>,
    pub task_id: String,
    pub reason: String,
}

impl AgentFallbackManager {
    /// Create a new fallback manager with default configuration
    pub fn new() -> Self {
        Self::with_config(FallbackConfig::default())
    }

    /// Create a new fallback manager with custom configuration
    pub fn with_config(config: FallbackConfig) -> Self {
        Self {
            config,
            rate_limited: HashMap::new(),
            affected_tasks: HashSet::new(),
            fallback_history: Vec::new(),
        }
    }

    /// Calculate exponential backoff: base_ms * multiplier^attempt
    pub fn calculate_backoff(&self, attempt: u32) -> u64 {
        let backoff = self.config.base_backoff_ms
            * (self.config.backoff_multiplier as u64).pow(attempt);
        backoff.min(self.config.max_backoff_ms)
    }

    /// Mark an agent as rate-limited for a specific task
    pub fn mark_rate_limited(&mut self, agent_type: AgentType, task_id: &str) {
        let now = Utc::now();

        // Get current attempt count for this agent type
        let attempt_count = self
            .rate_limited
            .get(&agent_type)
            .map(|info| info.attempt_count + 1)
            .unwrap_or(1);

        let backoff_ms = self.calculate_backoff(attempt_count - 1);
        let retry_at = now + Duration::milliseconds(backoff_ms as i64);

        let info = RateLimitedAgent {
            agent_type,
            detected_at: now,
            attempt_count,
            retry_at,
            task_id: task_id.to_string(),
        };

        self.rate_limited.insert(agent_type, info);
        self.affected_tasks.insert(task_id.to_string());
    }

    /// Check if an agent type is currently rate-limited
    pub fn is_rate_limited(&self, agent_type: AgentType) -> bool {
        if let Some(info) = self.rate_limited.get(&agent_type) {
            Utc::now() < info.retry_at
        } else {
            false
        }
    }

    /// Get the retry time for a rate-limited agent
    pub fn get_retry_time(&self, agent_type: AgentType) -> Option<DateTime<Utc>> {
        self.rate_limited.get(&agent_type).map(|info| info.retry_at)
    }

    /// Get time until an agent can be retried (in milliseconds)
    pub fn get_time_until_retry(&self, agent_type: AgentType) -> Option<i64> {
        self.rate_limited.get(&agent_type).map(|info| {
            let now = Utc::now();
            let diff = info.retry_at - now;
            diff.num_milliseconds().max(0)
        })
    }

    /// Try to recover (clear rate limit) for an agent if backoff period has passed
    pub fn try_recover(&mut self, agent_type: AgentType) -> bool {
        if let Some(info) = self.rate_limited.get(&agent_type) {
            if Utc::now() >= info.retry_at {
                self.rate_limited.remove(&agent_type);
                return true;
            }
        }
        false
    }

    /// Clear all rate limit state for an agent (e.g., after successful request)
    pub fn clear_rate_limit(&mut self, agent_type: AgentType) {
        self.rate_limited.remove(&agent_type);
    }

    /// Get the fallback agent if the primary is rate-limited
    pub fn get_fallback(&mut self, primary: AgentType, task_id: &str) -> Option<AgentType> {
        if !self.config.enable_fallback {
            return None;
        }

        if !self.is_rate_limited(primary) {
            return None;
        }

        // Get configured fallback or use default fallback chain
        let fallback = self.config.fallback_agent.or_else(|| {
            match primary {
                AgentType::Claude => Some(AgentType::Opencode),
                AgentType::Opencode => Some(AgentType::Claude),
                AgentType::Cursor => Some(AgentType::Claude),
                AgentType::Codex => Some(AgentType::Claude), // Codex falls back to Claude
                AgentType::Qwen => Some(AgentType::Claude),  // Qwen falls back to Claude
                AgentType::Droid => Some(AgentType::Claude), // Droid falls back to Claude
            }
        });

        // Check if fallback is also rate-limited
        if let Some(fb) = fallback {
            if self.is_rate_limited(fb) {
                // Record fallback attempt that failed
                self.fallback_history.push(FallbackEvent {
                    timestamp: Utc::now(),
                    from_agent: primary,
                    to_agent: None,
                    task_id: task_id.to_string(),
                    reason: format!("Fallback agent {:?} also rate-limited", fb),
                });
                return None;
            }

            // Record successful fallback
            self.fallback_history.push(FallbackEvent {
                timestamp: Utc::now(),
                from_agent: primary,
                to_agent: Some(fb),
                task_id: task_id.to_string(),
                reason: format!("Primary {:?} rate-limited, using fallback", primary),
            });

            return Some(fb);
        }

        None
    }

    /// Get the best agent to use (either primary or fallback)
    pub fn get_available_agent(&mut self, preferred: AgentType, task_id: &str) -> AgentType {
        if self.is_rate_limited(preferred) {
            self.get_fallback(preferred, task_id).unwrap_or(preferred)
        } else {
            preferred
        }
    }

    /// Check if a task has been affected by rate limiting
    pub fn is_task_affected(&self, task_id: &str) -> bool {
        self.affected_tasks.contains(task_id)
    }

    /// Get rate limit information for an agent
    pub fn get_rate_limit_info(&self, agent_type: AgentType) -> Option<&RateLimitedAgent> {
        self.rate_limited.get(&agent_type)
    }

    /// Get all currently rate-limited agents
    pub fn get_all_rate_limited(&self) -> Vec<&RateLimitedAgent> {
        self.rate_limited.values().collect()
    }

    /// Get fallback history for monitoring
    pub fn get_fallback_history(&self) -> &[FallbackEvent] {
        &self.fallback_history
    }

    /// Clear fallback history
    pub fn clear_history(&mut self) {
        self.fallback_history.clear();
    }

    /// Update configuration
    pub fn set_config(&mut self, config: FallbackConfig) {
        self.config = config;
    }

    /// Get current configuration
    pub fn get_config(&self) -> &FallbackConfig {
        &self.config
    }
}

impl Default for AgentFallbackManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calculates_exponential_backoff() {
        let manager = AgentFallbackManager::new();

        // base_ms * 3^attempt
        // Default base is 5000ms
        assert_eq!(manager.calculate_backoff(0), 5000);  // 5000 * 3^0 = 5000
        assert_eq!(manager.calculate_backoff(1), 15000); // 5000 * 3^1 = 15000
        assert_eq!(manager.calculate_backoff(2), 45000); // 5000 * 3^2 = 45000
    }

    #[test]
    fn test_backoff_respects_max_limit() {
        let config = FallbackConfig {
            base_backoff_ms: 5000,
            max_backoff_ms: 30000,
            backoff_multiplier: 3,
            ..Default::default()
        };
        let manager = AgentFallbackManager::with_config(config);

        // Should cap at max_backoff_ms
        assert_eq!(manager.calculate_backoff(0), 5000);
        assert_eq!(manager.calculate_backoff(1), 15000);
        assert_eq!(manager.calculate_backoff(2), 30000); // Capped at 30000
        assert_eq!(manager.calculate_backoff(3), 30000); // Still capped
    }

    #[test]
    fn test_tracks_rate_limited_agents_per_task() {
        let mut manager = AgentFallbackManager::new();

        manager.mark_rate_limited(AgentType::Claude, "task-1");

        assert!(manager.is_rate_limited(AgentType::Claude));
        assert!(manager.is_task_affected("task-1"));
        assert!(!manager.is_task_affected("task-2"));
    }

    #[test]
    fn test_switches_to_fallback_agent() {
        let mut manager = AgentFallbackManager::new();

        manager.mark_rate_limited(AgentType::Claude, "task-1");

        let fallback = manager.get_fallback(AgentType::Claude, "task-1");
        assert_eq!(fallback, Some(AgentType::Opencode));
    }

    #[test]
    fn test_no_fallback_when_not_rate_limited() {
        let mut manager = AgentFallbackManager::new();

        let fallback = manager.get_fallback(AgentType::Claude, "task-1");
        assert!(fallback.is_none());
    }

    #[test]
    fn test_no_fallback_when_fallback_also_limited() {
        let mut manager = AgentFallbackManager::new();

        manager.mark_rate_limited(AgentType::Claude, "task-1");
        manager.mark_rate_limited(AgentType::Opencode, "task-1");

        let fallback = manager.get_fallback(AgentType::Claude, "task-1");
        assert!(fallback.is_none());
    }

    #[test]
    fn test_prevents_retry_loop_on_rate_limited_agent() {
        let mut manager = AgentFallbackManager::new();

        manager.mark_rate_limited(AgentType::Claude, "task-1");

        // Agent should be rate-limited
        assert!(manager.is_rate_limited(AgentType::Claude));

        // Getting available agent should return fallback
        let available = manager.get_available_agent(AgentType::Claude, "task-1");
        assert_eq!(available, AgentType::Opencode);
    }

    #[test]
    fn test_recovers_after_backoff_period() {
        let config = FallbackConfig {
            base_backoff_ms: 1, // Very short for testing
            ..Default::default()
        };
        let mut manager = AgentFallbackManager::with_config(config);

        manager.mark_rate_limited(AgentType::Claude, "task-1");

        // Wait a tiny bit (in real use this would be longer)
        std::thread::sleep(std::time::Duration::from_millis(10));

        // Should be able to recover
        let recovered = manager.try_recover(AgentType::Claude);
        assert!(recovered);
        assert!(!manager.is_rate_limited(AgentType::Claude));
    }

    #[test]
    fn test_clear_rate_limit() {
        let mut manager = AgentFallbackManager::new();

        manager.mark_rate_limited(AgentType::Claude, "task-1");
        assert!(manager.is_rate_limited(AgentType::Claude));

        manager.clear_rate_limit(AgentType::Claude);
        assert!(!manager.is_rate_limited(AgentType::Claude));
    }

    #[test]
    fn test_fallback_disabled() {
        let config = FallbackConfig {
            enable_fallback: false,
            ..Default::default()
        };
        let mut manager = AgentFallbackManager::with_config(config);

        manager.mark_rate_limited(AgentType::Claude, "task-1");

        let fallback = manager.get_fallback(AgentType::Claude, "task-1");
        assert!(fallback.is_none());
    }

    #[test]
    fn test_increment_attempt_count() {
        let mut manager = AgentFallbackManager::new();

        manager.mark_rate_limited(AgentType::Claude, "task-1");
        let info1 = manager.get_rate_limit_info(AgentType::Claude).unwrap();
        assert_eq!(info1.attempt_count, 1);

        manager.mark_rate_limited(AgentType::Claude, "task-2");
        let info2 = manager.get_rate_limit_info(AgentType::Claude).unwrap();
        assert_eq!(info2.attempt_count, 2);
    }

    #[test]
    fn test_fallback_history() {
        let mut manager = AgentFallbackManager::new();

        manager.mark_rate_limited(AgentType::Claude, "task-1");
        let _ = manager.get_fallback(AgentType::Claude, "task-1");

        let history = manager.get_fallback_history();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].from_agent, AgentType::Claude);
        assert_eq!(history[0].to_agent, Some(AgentType::Opencode));
    }

    #[test]
    fn test_get_time_until_retry() {
        let mut manager = AgentFallbackManager::new();

        manager.mark_rate_limited(AgentType::Claude, "task-1");

        let time = manager.get_time_until_retry(AgentType::Claude);
        assert!(time.is_some());
        assert!(time.unwrap() > 0);
    }

    #[test]
    fn test_configured_fallback_agent() {
        let config = FallbackConfig {
            fallback_agent: Some(AgentType::Cursor),
            ..Default::default()
        };
        let mut manager = AgentFallbackManager::with_config(config);

        manager.mark_rate_limited(AgentType::Claude, "task-1");

        let fallback = manager.get_fallback(AgentType::Claude, "task-1");
        assert_eq!(fallback, Some(AgentType::Cursor));
    }
}
