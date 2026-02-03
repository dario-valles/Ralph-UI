// Ultra Research Mode models for multi-agent deep research

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use super::AgentType;

// ============================================================================
// Research Agent Configuration
// ============================================================================

/// Role that an agent plays in ultra research
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchAgentRole {
    Researcher,
    Moderator,
    Synthesizer,
}

impl ResearchAgentRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            ResearchAgentRole::Researcher => "researcher",
            ResearchAgentRole::Moderator => "moderator",
            ResearchAgentRole::Synthesizer => "synthesizer",
        }
    }
}

impl std::fmt::Display for ResearchAgentRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for ResearchAgentRole {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "researcher" => Ok(ResearchAgentRole::Researcher),
            "moderator" => Ok(ResearchAgentRole::Moderator),
            "synthesizer" => Ok(ResearchAgentRole::Synthesizer),
            _ => Err(format!(
                "Invalid research agent role: '{}'. Expected 'researcher', 'moderator', or 'synthesizer'",
                s
            )),
        }
    }
}

/// Status of a research agent during execution
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchAgentStatus {
    Idle,
    Researching,
    Discussing,
    Complete,
    Error,
}

impl ResearchAgentStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ResearchAgentStatus::Idle => "idle",
            ResearchAgentStatus::Researching => "researching",
            ResearchAgentStatus::Discussing => "discussing",
            ResearchAgentStatus::Complete => "complete",
            ResearchAgentStatus::Error => "error",
        }
    }
}

impl std::fmt::Display for ResearchAgentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl Default for ResearchAgentStatus {
    fn default() -> Self {
        ResearchAgentStatus::Idle
    }
}

/// Configuration for a single research agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchAgent {
    /// Unique identifier for the agent
    pub id: String,
    /// Display name for the agent
    pub name: String,
    /// Agent type (claude, opencode, cursor, etc.)
    pub agent_type: AgentType,
    /// Provider ID for Claude agents (e.g., "zai", "minimax")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    /// Role in the research process
    pub role: ResearchAgentRole,
    /// Research focus area (e.g., "Security", "UX/DX", "Performance")
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub angle: Option<String>,
    /// Current status during execution
    #[serde(default)]
    pub status: ResearchAgentStatus,
}

impl ResearchAgent {
    /// Create a new researcher agent with default settings
    pub fn new_researcher(id: String, agent_type: AgentType, provider_id: Option<String>) -> Self {
        Self {
            id,
            name: format!("{}", agent_type),
            agent_type,
            provider_id,
            role: ResearchAgentRole::Researcher,
            angle: None,
            status: ResearchAgentStatus::Idle,
        }
    }

    /// Get the composite agent string (e.g., "claude:zai" or "cursor")
    pub fn composite_agent_string(&self) -> String {
        match &self.provider_id {
            Some(provider) if provider != "anthropic" => {
                format!("{}:{}", self.agent_type, provider)
            }
            _ => self.agent_type.to_string(),
        }
    }
}

// ============================================================================
// Research Configuration
// ============================================================================

/// Execution mode for ultra research
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchExecutionMode {
    /// All agents research simultaneously on different angles
    Parallel,
    /// Agents take turns, each building on previous findings
    Sequential,
}

impl ResearchExecutionMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            ResearchExecutionMode::Parallel => "parallel",
            ResearchExecutionMode::Sequential => "sequential",
        }
    }
}

impl Default for ResearchExecutionMode {
    fn default() -> Self {
        ResearchExecutionMode::Parallel
    }
}

impl std::fmt::Display for ResearchExecutionMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for ResearchExecutionMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "parallel" => Ok(ResearchExecutionMode::Parallel),
            "sequential" => Ok(ResearchExecutionMode::Sequential),
            _ => Err(format!(
                "Invalid research execution mode: '{}'. Expected 'parallel' or 'sequential'",
                s
            )),
        }
    }
}

/// Configuration for an ultra research session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UltraResearchConfig {
    /// Unique identifier for the config
    pub id: String,
    /// Whether ultra research is enabled
    pub enabled: bool,
    /// Execution mode: parallel (faster) or sequential (deeper)
    #[serde(default)]
    pub mode: ResearchExecutionMode,
    /// List of research agents (max 5)
    pub agents: Vec<ResearchAgent>,
    /// Number of discussion rounds (0-3)
    pub discussion_rounds: u8,
    /// Model/agent to use for final synthesis
    pub synthesize_model: String,
}

impl Default for UltraResearchConfig {
    fn default() -> Self {
        Self {
            id: String::new(),
            enabled: false,
            mode: ResearchExecutionMode::Parallel,
            agents: Vec::new(),
            discussion_rounds: 1,
            synthesize_model: "claude".to_string(),
        }
    }
}

impl UltraResearchConfig {
    /// Validate the configuration
    pub fn validate(&self) -> Result<(), String> {
        if self.agents.is_empty() {
            return Err("At least one research agent is required".to_string());
        }
        if self.agents.len() > MAX_RESEARCH_AGENTS {
            return Err(format!(
                "Maximum {} research agents allowed",
                MAX_RESEARCH_AGENTS
            ));
        }
        if self.discussion_rounds > MAX_DISCUSSION_ROUNDS {
            return Err(format!(
                "Maximum {} discussion rounds allowed",
                MAX_DISCUSSION_ROUNDS
            ));
        }
        Ok(())
    }
}

// ============================================================================
// Research Findings
// ============================================================================

/// A finding from a research agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchFinding {
    /// ID of the agent that produced this finding
    pub agent_id: String,
    /// Research angle/focus area
    pub angle: String,
    /// The actual research content
    pub content: String,
    /// Optional sources/references
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sources: Option<Vec<String>>,
    /// Confidence level (0-100)
    pub confidence: u8,
    /// When this finding was produced
    pub timestamp: DateTime<Utc>,
}

// ============================================================================
// Discussion Types
// ============================================================================

/// Type of discussion entry
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiscussionEntryType {
    Feedback,
    Challenge,
    Agreement,
    Addition,
}

impl DiscussionEntryType {
    pub fn as_str(&self) -> &'static str {
        match self {
            DiscussionEntryType::Feedback => "feedback",
            DiscussionEntryType::Challenge => "challenge",
            DiscussionEntryType::Agreement => "agreement",
            DiscussionEntryType::Addition => "addition",
        }
    }
}

impl std::fmt::Display for DiscussionEntryType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// An entry in the agent discussion
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscussionEntry {
    /// Discussion round number (1-based)
    pub round: u8,
    /// ID of the agent making this entry
    pub agent_id: String,
    /// ID of the agent being responded to (optional)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_agent_id: Option<String>,
    /// Type of discussion contribution
    #[serde(rename = "type")]
    pub entry_type: DiscussionEntryType,
    /// The discussion content
    pub content: String,
    /// When this entry was made
    pub timestamp: DateTime<Utc>,
}

// ============================================================================
// Research Session
// ============================================================================

/// Status of the overall research session
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchSessionStatus {
    Planning,
    Researching,
    Discussing,
    Synthesizing,
    Complete,
    Error,
    Cancelled,
}

impl ResearchSessionStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            ResearchSessionStatus::Planning => "planning",
            ResearchSessionStatus::Researching => "researching",
            ResearchSessionStatus::Discussing => "discussing",
            ResearchSessionStatus::Synthesizing => "synthesizing",
            ResearchSessionStatus::Complete => "complete",
            ResearchSessionStatus::Error => "error",
            ResearchSessionStatus::Cancelled => "cancelled",
        }
    }

    pub fn is_terminal(&self) -> bool {
        matches!(
            self,
            ResearchSessionStatus::Complete
                | ResearchSessionStatus::Error
                | ResearchSessionStatus::Cancelled
        )
    }
}

impl Default for ResearchSessionStatus {
    fn default() -> Self {
        ResearchSessionStatus::Planning
    }
}

impl std::fmt::Display for ResearchSessionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

/// A complete ultra research session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSession {
    /// Unique identifier for the session
    pub id: String,
    /// ID of the chat session that initiated this research
    pub chat_session_id: String,
    /// Configuration used for this session
    pub config: UltraResearchConfig,
    /// The original user query that started the research
    pub query: String,
    /// Project path for context
    pub project_path: String,
    /// Research angles assigned by the orchestrator
    pub angles: Vec<String>,
    /// Findings from all agents
    pub findings: Vec<ResearchFinding>,
    /// Discussion entries from all rounds
    pub discussion_log: Vec<DiscussionEntry>,
    /// Final synthesized PRD content
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub synthesized_prd: Option<String>,
    /// Current status of the session
    #[serde(default)]
    pub status: ResearchSessionStatus,
    /// Error message if status is 'error'
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    /// When the session was created
    pub created_at: DateTime<Utc>,
    /// When the session was last updated
    pub updated_at: DateTime<Utc>,
}

impl ResearchSession {
    /// Create a new research session
    pub fn new(
        id: String,
        chat_session_id: String,
        config: UltraResearchConfig,
        query: String,
        project_path: String,
    ) -> Self {
        let now = Utc::now();
        Self {
            id,
            chat_session_id,
            config,
            query,
            project_path,
            angles: Vec::new(),
            findings: Vec::new(),
            discussion_log: Vec::new(),
            synthesized_prd: None,
            status: ResearchSessionStatus::Planning,
            error: None,
            created_at: now,
            updated_at: now,
        }
    }

    /// Update the session status and timestamp
    pub fn update_status(&mut self, status: ResearchSessionStatus) {
        self.status = status;
        self.updated_at = Utc::now();
    }

    /// Set error status with message
    pub fn set_error(&mut self, error: String) {
        self.status = ResearchSessionStatus::Error;
        self.error = Some(error);
        self.updated_at = Utc::now();
    }

    /// Add a research finding
    pub fn add_finding(&mut self, finding: ResearchFinding) {
        self.findings.push(finding);
        self.updated_at = Utc::now();
    }

    /// Add a discussion entry
    pub fn add_discussion_entry(&mut self, entry: DiscussionEntry) {
        self.discussion_log.push(entry);
        self.updated_at = Utc::now();
    }

    /// Get the number of completed agents
    pub fn completed_agent_count(&self) -> usize {
        self.config
            .agents
            .iter()
            .filter(|a| a.status == ResearchAgentStatus::Complete)
            .count()
    }

    /// Check if all agents have completed
    pub fn all_agents_complete(&self) -> bool {
        self.config
            .agents
            .iter()
            .all(|a| a.status == ResearchAgentStatus::Complete)
    }
}

// ============================================================================
// Progress & Events
// ============================================================================

/// Progress information for the research session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchProgress {
    /// Current status
    pub status: ResearchSessionStatus,
    /// Overall completion percentage (0-100)
    pub overall_progress: u8,
    /// Current phase description
    pub current_phase: String,
    /// Number of agents completed
    pub agents_completed: usize,
    /// Total number of agents
    pub total_agents: usize,
    /// Current discussion round (if in discussing phase)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub current_round: Option<u8>,
    /// Total discussion rounds configured
    pub total_rounds: u8,
    /// Per-agent status
    pub agent_statuses: std::collections::HashMap<String, ResearchAgentStatus>,
}

impl ResearchProgress {
    /// Create progress from a research session
    pub fn from_session(session: &ResearchSession) -> Self {
        let agents_completed = session.completed_agent_count();
        let total_agents = session.config.agents.len();

        // Calculate overall progress based on phase
        let overall_progress = match session.status {
            ResearchSessionStatus::Planning => 5,
            ResearchSessionStatus::Researching => {
                let research_pct = if total_agents > 0 {
                    (agents_completed as f32 / total_agents as f32 * 50.0) as u8
                } else {
                    0
                };
                10 + research_pct
            }
            ResearchSessionStatus::Discussing => {
                let discussion_entries = session.discussion_log.len();
                let expected_entries = total_agents * session.config.discussion_rounds as usize;
                let discuss_pct = if expected_entries > 0 {
                    (discussion_entries as f32 / expected_entries as f32 * 20.0).min(20.0) as u8
                } else {
                    20
                };
                60 + discuss_pct
            }
            ResearchSessionStatus::Synthesizing => 85,
            ResearchSessionStatus::Complete => 100,
            ResearchSessionStatus::Error | ResearchSessionStatus::Cancelled => 0,
        };

        let current_phase = match session.status {
            ResearchSessionStatus::Planning => "Decomposing query into research angles".to_string(),
            ResearchSessionStatus::Researching => {
                format!("Researching ({}/{} agents)", agents_completed, total_agents)
            }
            ResearchSessionStatus::Discussing => {
                let current_round = session.discussion_log.last().map(|e| e.round).unwrap_or(1);
                format!(
                    "Discussion round {}/{}",
                    current_round, session.config.discussion_rounds
                )
            }
            ResearchSessionStatus::Synthesizing => "Synthesizing findings into PRD".to_string(),
            ResearchSessionStatus::Complete => "Research complete".to_string(),
            ResearchSessionStatus::Error => "Error occurred".to_string(),
            ResearchSessionStatus::Cancelled => "Cancelled".to_string(),
        };

        let current_round = if session.status == ResearchSessionStatus::Discussing {
            session.discussion_log.last().map(|e| e.round)
        } else {
            None
        };

        let agent_statuses = session
            .config
            .agents
            .iter()
            .map(|a| (a.id.clone(), a.status))
            .collect();

        Self {
            status: session.status,
            overall_progress,
            current_phase,
            agents_completed,
            total_agents,
            current_round,
            total_rounds: session.config.discussion_rounds,
            agent_statuses,
        }
    }
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/// Request to start an ultra research session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartUltraResearchRequest {
    /// Configuration for the research
    pub config: UltraResearchConfig,
    /// The research query/topic
    pub query: String,
    /// Project path for context
    pub project_path: String,
    /// Chat session ID to associate with
    pub chat_session_id: String,
}

/// Response from starting an ultra research session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartUltraResearchResponse {
    /// The created research session
    pub session: ResearchSession,
}

/// Request to cancel a research session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelResearchRequest {
    /// Session ID to cancel
    pub session_id: String,
}

/// Request to get research progress
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetResearchProgressRequest {
    /// Session ID
    pub session_id: String,
}

// ============================================================================
// WebSocket Event Payloads
// ============================================================================

/// Event payload for agent progress updates
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchAgentProgressPayload {
    /// Session ID
    pub session_id: String,
    /// Agent ID
    pub agent_id: String,
    /// Streaming content chunk
    pub content: String,
}

/// Event payload for research session updates
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSessionUpdatePayload {
    /// Session ID
    pub session_id: String,
    /// Updated progress information
    pub progress: ResearchProgress,
}

/// Event payload for research errors
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchErrorPayload {
    /// Session ID
    pub session_id: String,
    /// Error message
    pub error: String,
    /// Agent ID if error is agent-specific
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent_id: Option<String>,
}

/// Event payload for discussion entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscussionEntryPayload {
    /// Session ID
    pub session_id: String,
    /// The discussion entry
    pub entry: DiscussionEntry,
}

/// Event payload for synthesis progress
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SynthesisProgressPayload {
    /// Session ID
    pub session_id: String,
    /// Streaming content chunk
    pub content: String,
}

// ============================================================================
// Constants
// ============================================================================

/// Maximum number of agents allowed
pub const MAX_RESEARCH_AGENTS: usize = 5;

/// Maximum number of discussion rounds
pub const MAX_DISCUSSION_ROUNDS: u8 = 3;

/// Default research angles
pub const DEFAULT_RESEARCH_ANGLES: &[&str] = &[
    "Security & Compliance",
    "User Experience",
    "Performance & Scalability",
    "Architecture & Maintainability",
    "Testing & Quality",
];

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_research_agent_composite_string() {
        let agent = ResearchAgent::new_researcher(
            "agent-1".to_string(),
            AgentType::Claude,
            Some("zai".to_string()),
        );
        assert_eq!(agent.composite_agent_string(), "claude:zai");

        let agent2 = ResearchAgent::new_researcher("agent-2".to_string(), AgentType::Cursor, None);
        assert_eq!(agent2.composite_agent_string(), "cursor");

        let agent3 = ResearchAgent::new_researcher(
            "agent-3".to_string(),
            AgentType::Claude,
            Some("anthropic".to_string()),
        );
        assert_eq!(agent3.composite_agent_string(), "claude");
    }

    #[test]
    fn test_config_validation() {
        let mut config = UltraResearchConfig::default();

        // Should fail with no agents
        assert!(config.validate().is_err());

        // Add an agent
        config.agents.push(ResearchAgent::new_researcher(
            "agent-1".to_string(),
            AgentType::Claude,
            None,
        ));
        assert!(config.validate().is_ok());

        // Add too many agents
        for i in 2..=6 {
            config.agents.push(ResearchAgent::new_researcher(
                format!("agent-{}", i),
                AgentType::Claude,
                None,
            ));
        }
        assert!(config.validate().is_err());
    }

    #[test]
    fn test_session_status_is_terminal() {
        assert!(!ResearchSessionStatus::Planning.is_terminal());
        assert!(!ResearchSessionStatus::Researching.is_terminal());
        assert!(ResearchSessionStatus::Complete.is_terminal());
        assert!(ResearchSessionStatus::Error.is_terminal());
        assert!(ResearchSessionStatus::Cancelled.is_terminal());
    }

    #[test]
    fn test_research_progress_calculation() {
        let config = UltraResearchConfig {
            id: "config-1".to_string(),
            enabled: true,
            mode: ResearchExecutionMode::Parallel,
            agents: vec![
                ResearchAgent::new_researcher("a1".to_string(), AgentType::Claude, None),
                ResearchAgent::new_researcher("a2".to_string(), AgentType::Cursor, None),
            ],
            discussion_rounds: 2,
            synthesize_model: "claude".to_string(),
        };

        let session = ResearchSession::new(
            "session-1".to_string(),
            "chat-1".to_string(),
            config,
            "Test query".to_string(),
            "/test/project".to_string(),
        );

        let progress = ResearchProgress::from_session(&session);
        assert_eq!(progress.status, ResearchSessionStatus::Planning);
        assert_eq!(progress.overall_progress, 5);
        assert_eq!(progress.total_agents, 2);
    }
}
