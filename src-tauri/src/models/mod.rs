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
