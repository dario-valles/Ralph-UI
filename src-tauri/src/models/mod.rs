// Data models matching the frontend TypeScript types

pub mod prd_chat;
pub mod state_machine;

pub use prd_chat::{
    ChatMessage, ChatSession, ExtractedPRDContent, GuidedQuestion, MessageRole,
    PRDType, QualityAssessment, QuestionType,
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
            _ => Err(format!("Invalid effort size: '{}'. Expected 'small', 'medium', or 'large'", s)),
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
