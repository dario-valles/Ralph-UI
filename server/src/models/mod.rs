// Data models matching the frontend TypeScript types

pub mod prd_chat;
pub mod state_machine;

pub use prd_chat::{
    attachment_limits, AttachmentMimeType, ChatAttachment, ChatMessage, ChatSession,
    ExtractedPRDContent, GuidedQuestion, MessageRole, PRDType, QualityAssessment, QuestionType,
};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Pending,
    InProgress,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: i32,
    pub dependencies: Vec<String>,
    pub assigned_agent: Option<String>,
    pub estimated_tokens: Option<i32>,
    pub actual_tokens: Option<i32>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Active,
    Paused,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum AgentType {
    Claude,
    Opencode,
    Cursor,
    Codex,
    Qwen,
    Droid,
}

impl AgentType {
    /// Returns all available agent types
    pub fn all() -> &'static [AgentType] {
        &[
            AgentType::Claude,
            AgentType::Opencode,
            AgentType::Cursor,
            AgentType::Codex,
            AgentType::Qwen,
            AgentType::Droid,
        ]
    }

    /// Returns the string representation of this agent type
    pub fn as_str(&self) -> &'static str {
        match self {
            AgentType::Claude => "claude",
            AgentType::Opencode => "opencode",
            AgentType::Cursor => "cursor",
            AgentType::Codex => "codex",
            AgentType::Qwen => "qwen",
            AgentType::Droid => "droid",
        }
    }
}

impl std::fmt::Display for AgentType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for AgentType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "claude" => Ok(AgentType::Claude),
            "opencode" => Ok(AgentType::Opencode),
            "cursor" => Ok(AgentType::Cursor),
            "codex" => Ok(AgentType::Codex),
            "qwen" => Ok(AgentType::Qwen),
            "droid" => Ok(AgentType::Droid),
            _ => Err(format!(
                "Unknown agent type: '{}'. Expected one of: claude, opencode, cursor, codex, qwen, droid",
                s
            )),
        }
    }
}

impl Default for AgentType {
    fn default() -> Self {
        AgentType::Claude
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionConfig {
    pub max_parallel: i32,
    pub max_iterations: i32,
    pub max_retries: i32,
    pub agent_type: AgentType,
    pub auto_create_prs: bool,
    pub draft_prs: bool,
    pub run_tests: bool,
    pub run_lint: bool,
}

impl Default for SessionConfig {
    fn default() -> Self {
        SessionConfig {
            max_parallel: 3,
            max_iterations: 10,
            max_retries: 3,
            agent_type: AgentType::Claude,
            auto_create_prs: true,
            draft_prs: false,
            run_tests: true,
            run_lint: true,
        }
    }
}

impl SessionConfig {
    /// Validate the configuration values
    /// Returns Ok(()) if valid, or Err with a descriptive error message
    pub fn validate(&self) -> Result<(), String> {
        if self.max_parallel <= 0 {
            return Err("max_parallel must be greater than 0".to_string());
        }
        if self.max_iterations <= 0 {
            return Err("max_iterations must be greater than 0".to_string());
        }
        if self.max_retries < 0 {
            return Err("max_retries cannot be negative".to_string());
        }
        Ok(())
    }
}

/// Convert RalphConfig to SessionConfig
/// This allows sessions to inherit settings from the global/project configuration
impl From<&crate::config::RalphConfig> for SessionConfig {
    fn from(config: &crate::config::RalphConfig) -> Self {
        // Parse agent_type string to AgentType enum, defaulting to Claude if parsing fails
        let agent_type = config
            .execution
            .agent_type
            .parse::<AgentType>()
            .unwrap_or_else(|_| {
                log::warn!(
                    "Unknown agent type '{}' in config, defaulting to Claude",
                    config.execution.agent_type
                );
                AgentType::Claude
            });

        SessionConfig {
            max_parallel: config.execution.max_parallel,
            max_iterations: config.execution.max_iterations,
            max_retries: config.execution.max_retries,
            agent_type,
            auto_create_prs: config.git.auto_create_prs,
            draft_prs: config.git.draft_prs,
            run_tests: config.validation.run_tests,
            run_lint: config.validation.run_lint,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: String,
    pub name: String,
    pub project_path: String,
    pub created_at: DateTime<Utc>,
    pub last_resumed_at: Option<DateTime<Utc>>,
    pub status: SessionStatus,
    pub config: SessionConfig,
    pub tasks: Vec<Task>,
    pub total_cost: f64,
    pub total_tokens: i32,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AgentStatus {
    Idle,
    Thinking,
    Reading,
    Implementing,
    Testing,
    Committing,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Info,
    Warn,
    Error,
    Debug,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LogEntry {
    pub timestamp: DateTime<Utc>,
    pub level: LogLevel,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Agent {
    pub id: String,
    pub session_id: String,
    pub task_id: String,
    pub status: AgentStatus,
    pub process_id: Option<u32>,
    pub worktree_path: String,
    pub branch: String,
    pub iteration_count: i32,
    pub tokens: i32,
    pub cost: f64,
    pub logs: Vec<LogEntry>,
    pub subagents: Vec<Agent>,
}

// Activity Feed types for Mission Control
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ActivityEventType {
    TaskCompleted,
    TaskStarted,
    TaskFailed,
    SessionStarted,
    SessionCompleted,
    AgentSpawned,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityEvent {
    pub id: String,
    pub timestamp: DateTime<Utc>,
    pub event_type: ActivityEventType,
    pub project_path: String,
    pub project_name: String,
    pub session_name: String,
    pub description: String,
}

// Project type
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub path: String,
    pub name: String,
    pub last_used_at: DateTime<Utc>,
    pub is_favorite: bool,
    pub created_at: DateTime<Utc>,
}

// ============================================================================
// Structured PRD Output Types
// ============================================================================

/// Type of PRD item for structured output
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PRDItemType {
    Epic,
    UserStory,
    Task,
    AcceptanceCriteria,
}

impl PRDItemType {
    pub fn as_str(&self) -> &'static str {
        match self {
            PRDItemType::Epic => "epic",
            PRDItemType::UserStory => "user_story",
            PRDItemType::Task => "task",
            PRDItemType::AcceptanceCriteria => "acceptance_criteria",
        }
    }
}

impl std::fmt::Display for PRDItemType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for PRDItemType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().replace('-', "_").as_str() {
            "epic" => Ok(PRDItemType::Epic),
            "user_story" | "userstory" => Ok(PRDItemType::UserStory),
            "task" => Ok(PRDItemType::Task),
            "acceptance_criteria" | "acceptancecriteria" => Ok(PRDItemType::AcceptanceCriteria),
            _ => Err(format!("Invalid PRD item type: '{}'. Expected 'epic', 'user_story', 'task', or 'acceptance_criteria'", s)),
        }
    }
}

/// Effort size estimation for tasks
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EffortSize {
    Small,
    Medium,
    Large,
}

impl EffortSize {
    pub fn as_str(&self) -> &'static str {
        match self {
            EffortSize::Small => "small",
            EffortSize::Medium => "medium",
            EffortSize::Large => "large",
        }
    }
}

impl std::fmt::Display for EffortSize {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for EffortSize {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "small" | "s" => Ok(EffortSize::Small),
            "medium" | "m" => Ok(EffortSize::Medium),
            "large" | "l" => Ok(EffortSize::Large),
            _ => Err(format!(
                "Invalid effort size: '{}'. Expected 'small', 'medium', or 'large'",
                s
            )),
        }
    }
}

/// A structured PRD item extracted from agent output
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StructuredPRDItem {
    #[serde(rename = "type")]
    pub item_type: PRDItemType,
    pub id: String,
    pub parent_id: Option<String>,
    pub title: String,
    pub description: String,
    pub acceptance_criteria: Option<Vec<String>>,
    pub priority: Option<i32>,
    pub dependencies: Option<Vec<String>>,
    pub estimated_effort: Option<EffortSize>,
    pub tags: Option<Vec<String>>,
}

/// Collection of extracted PRD items grouped by type
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedPRDStructure {
    pub epics: Vec<StructuredPRDItem>,
    pub user_stories: Vec<StructuredPRDItem>,
    pub tasks: Vec<StructuredPRDItem>,
    pub acceptance_criteria: Vec<StructuredPRDItem>,
}

impl ExtractedPRDStructure {
    /// Returns true if any items have been extracted
    pub fn has_items(&self) -> bool {
        !self.epics.is_empty()
            || !self.user_stories.is_empty()
            || !self.tasks.is_empty()
            || !self.acceptance_criteria.is_empty()
    }

    /// Returns the total number of extracted items
    pub fn total_items(&self) -> usize {
        self.epics.len()
            + self.user_stories.len()
            + self.tasks.len()
            + self.acceptance_criteria.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::RalphConfig;

    #[test]
    fn test_session_config_from_ralph_config() {
        let mut ralph_config = RalphConfig::default();
        ralph_config.execution.max_parallel = 5;
        ralph_config.execution.max_iterations = 15;
        ralph_config.execution.max_retries = 2;
        ralph_config.execution.agent_type = "cursor".to_string();
        ralph_config.git.auto_create_prs = false;
        ralph_config.git.draft_prs = true;
        ralph_config.validation.run_tests = false;
        ralph_config.validation.run_lint = false;

        let session_config: SessionConfig = (&ralph_config).into();

        assert_eq!(session_config.max_parallel, 5);
        assert_eq!(session_config.max_iterations, 15);
        assert_eq!(session_config.max_retries, 2);
        assert_eq!(session_config.agent_type, AgentType::Cursor);
        assert!(!session_config.auto_create_prs);
        assert!(session_config.draft_prs);
        assert!(!session_config.run_tests);
        assert!(!session_config.run_lint);
    }

    #[test]
    fn test_session_config_from_ralph_config_unknown_agent_type() {
        let mut ralph_config = RalphConfig::default();
        ralph_config.execution.agent_type = "unknown_agent".to_string();

        let session_config: SessionConfig = (&ralph_config).into();

        // Should default to Claude for unknown agent types
        assert_eq!(session_config.agent_type, AgentType::Claude);
    }

    #[test]
    fn test_session_config_validate_success() {
        let config = SessionConfig::default();
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_session_config_validate_max_parallel_zero() {
        let mut config = SessionConfig::default();
        config.max_parallel = 0;
        let result = config.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("max_parallel"));
    }

    #[test]
    fn test_session_config_validate_max_parallel_negative() {
        let mut config = SessionConfig::default();
        config.max_parallel = -1;
        let result = config.validate();
        assert!(result.is_err());
    }

    #[test]
    fn test_session_config_validate_max_iterations_zero() {
        let mut config = SessionConfig::default();
        config.max_iterations = 0;
        let result = config.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("max_iterations"));
    }

    #[test]
    fn test_session_config_validate_max_retries_negative() {
        let mut config = SessionConfig::default();
        config.max_retries = -1;
        let result = config.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("max_retries"));
    }

    #[test]
    fn test_session_config_validate_max_retries_zero_allowed() {
        let mut config = SessionConfig::default();
        config.max_retries = 0;
        assert!(config.validate().is_ok());
    }
}
