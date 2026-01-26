// Event types and payload structures for real-time updates
// These are broadcast via WebSocket to connected clients

use serde::{Deserialize, Serialize};

// Event name constants
pub const EVENT_AGENT_STATUS_CHANGED: &str = "agent:status_changed";
pub const EVENT_TASK_STATUS_CHANGED: &str = "task:status_changed";
pub const EVENT_SESSION_STATUS_CHANGED: &str = "session:status_changed";
pub const EVENT_MISSION_CONTROL_REFRESH: &str = "mission_control:refresh";
pub const EVENT_RATE_LIMIT_DETECTED: &str = "agent:rate_limit_detected";
pub const EVENT_PRD_FILE_UPDATED: &str = "prd:file_updated";
pub const EVENT_PRD_CHAT_CHUNK: &str = "prd:chat_chunk";
pub const EVENT_AGENT_COMPLETED: &str = "agent:completed";
pub const EVENT_AGENT_FAILED: &str = "agent:failed";

// Subagent events (for real-time tree visualization)
pub const EVENT_SUBAGENT_SPAWNED: &str = "subagent:spawned";
pub const EVENT_SUBAGENT_PROGRESS: &str = "subagent:progress";
pub const EVENT_SUBAGENT_COMPLETED: &str = "subagent:completed";
pub const EVENT_SUBAGENT_FAILED: &str = "subagent:failed";

// Ralph Loop execution events (for real-time progress streaming)
pub const EVENT_RALPH_PROGRESS: &str = "ralph:progress";
pub const EVENT_RALPH_ITERATION_STARTED: &str = "ralph:iteration_started";
pub const EVENT_RALPH_ITERATION_COMPLETED: &str = "ralph:iteration_completed";
pub const EVENT_RALPH_LOOP_COMPLETED: &str = "ralph:loop_completed";
pub const EVENT_RALPH_LOOP_ERROR: &str = "ralph:loop_error";

// Multi-agent assignment events (US-2.2: Avoid File Conflicts)
pub const EVENT_ASSIGNMENT_CHANGED: &str = "assignment:changed";
pub const EVENT_FILE_CONFLICT_DETECTED: &str = "assignment:file_conflict";

// Merge events (US-5.1: Collaborative Mode with Merges)
pub const EVENT_MERGE_ATTEMPTED: &str = "merge:attempted";
pub const EVENT_MERGE_CONFLICT_DETECTED: &str = "merge:conflict_detected";

// Tool call events (for collapsible tool call display)
pub const EVENT_TOOL_CALL_STARTED: &str = "tool:started";
pub const EVENT_TOOL_CALL_COMPLETED: &str = "tool:completed";

/// Payload for agent status change events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatusChangedPayload {
    pub agent_id: String,
    pub session_id: String,
    pub old_status: String,
    pub new_status: String,
}

/// Payload for task status change events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskStatusChangedPayload {
    pub task_id: String,
    pub session_id: String,
    pub old_status: String,
    pub new_status: String,
}

/// Payload for session status change events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionStatusChangedPayload {
    pub session_id: String,
    pub old_status: String,
    pub new_status: String,
}

/// Payload for rate limit detected events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RateLimitDetectedPayload {
    pub agent_id: String,
    pub session_id: String,
    pub limit_type: String, // "claude_rate_limit", "http_429", etc.
    pub retry_after_ms: Option<u64>,
    pub matched_pattern: Option<String>,
}

/// Payload for PRD file update events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdFileUpdatedPayload {
    pub session_id: String,
    pub content: String,
    pub path: String,
}

/// Payload for PRD chat streaming chunk events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdChatChunkPayload {
    pub session_id: String,
    pub content: String,
}

/// Payload for agent completed events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCompletedPayload {
    pub agent_id: String,
    pub task_id: String,
    pub session_id: String,
    pub exit_code: Option<i32>,
}

/// Payload for agent failed events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFailedPayload {
    pub agent_id: String,
    pub task_id: String,
    pub session_id: String,
    pub exit_code: Option<i32>,
    pub error: String,
}

// ============================================================================
// Subagent Events (for real-time tree visualization)
// ============================================================================

/// Type of subagent event
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SubagentEventType {
    /// Subagent was spawned
    Spawned,
    /// Subagent made progress
    Progress,
    /// Subagent completed successfully
    Completed,
    /// Subagent failed
    Failed,
}

/// Payload for subagent spawned events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentSpawnedPayload {
    /// Unique ID of the subagent
    pub subagent_id: String,
    /// ID of the parent agent that spawned this subagent
    pub parent_agent_id: String,
    /// Description of what the subagent is doing
    pub description: String,
    /// Timestamp when spawned
    pub timestamp: String,
    /// Depth in the tree (0 = top-level agent)
    pub depth: u32,
    /// Subagent type (e.g., "Task", "Explore", "Plan")
    pub subagent_type: Option<String>,
}

/// Payload for subagent progress events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentProgressPayload {
    /// ID of the subagent
    pub subagent_id: String,
    /// ID of the parent agent
    pub parent_agent_id: String,
    /// Progress message
    pub message: String,
    /// Timestamp
    pub timestamp: String,
}

/// Payload for subagent completed events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentCompletedPayload {
    /// ID of the subagent
    pub subagent_id: String,
    /// ID of the parent agent
    pub parent_agent_id: String,
    /// Duration in seconds
    pub duration_secs: f64,
    /// Timestamp when completed
    pub timestamp: String,
    /// Summary of what was accomplished (optional)
    pub summary: Option<String>,
}

/// Payload for subagent failed events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentFailedPayload {
    /// ID of the subagent
    pub subagent_id: String,
    /// ID of the parent agent
    pub parent_agent_id: String,
    /// Duration in seconds
    pub duration_secs: f64,
    /// Timestamp when failed
    pub timestamp: String,
    /// Error message
    pub error: String,
}

// ============================================================================
// Ralph Loop Progress Events (for real-time streaming feedback)
// ============================================================================

/// Phase of the Ralph Loop execution
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RalphPhase {
    /// Starting up the execution
    Starting,
    /// Analyzing current state
    Analyzing,
    /// Agent is implementing
    Implementing,
    /// Running tests
    Testing,
    /// Committing changes
    Committing,
    /// Evaluating results
    Evaluating,
    /// Iteration complete
    Complete,
    /// Execution stopped
    Stopped,
    /// Execution failed
    Failed,
}

/// Payload for Ralph Loop progress events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphProgressPayload {
    /// Execution ID
    pub execution_id: String,
    /// PRD name
    pub prd_name: String,
    /// Current phase
    pub phase: RalphPhase,
    /// Current iteration number
    pub iteration: u32,
    /// Total stories in PRD
    pub total_stories: u32,
    /// Number of passing stories
    pub passing_stories: u32,
    /// Progress within current phase (0.0 - 1.0)
    pub progress: f32,
    /// Current file being processed (if any)
    pub current_file: Option<String>,
    /// Human-readable message
    pub message: String,
    /// Timestamp
    pub timestamp: String,
}

/// Payload for Ralph Loop iteration started events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphIterationStartedPayload {
    /// Execution ID
    pub execution_id: String,
    /// PRD name
    pub prd_name: String,
    /// Iteration number
    pub iteration: u32,
    /// Story being worked on
    pub current_story: Option<String>,
    /// Timestamp
    pub timestamp: String,
}

/// Payload for Ralph Loop iteration completed events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphIterationCompletedPayload {
    /// Execution ID
    pub execution_id: String,
    /// PRD name
    pub prd_name: String,
    /// Iteration number
    pub iteration: u32,
    /// Whether the iteration was successful
    pub success: bool,
    /// Stories that passed after this iteration
    pub passing_stories: u32,
    /// Duration in seconds
    pub duration_secs: f64,
    /// Timestamp
    pub timestamp: String,
    /// Summary message
    pub summary: Option<String>,
}

/// Payload for Ralph Loop completion events (when all stories pass)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphLoopCompletedPayload {
    /// Execution ID
    pub execution_id: String,
    /// PRD name (session name)
    pub prd_name: String,
    /// Total iterations taken to complete
    pub total_iterations: u32,
    /// Total stories completed
    pub completed_stories: u32,
    /// Total stories in PRD
    pub total_stories: u32,
    /// Total duration in seconds
    pub duration_secs: f64,
    /// Total cost in dollars
    pub total_cost: f64,
    /// Timestamp of completion
    pub timestamp: String,
}

/// Type of error that occurred in the Ralph Loop
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RalphLoopErrorType {
    /// Agent crashed or exited with non-zero code
    AgentCrash,
    /// Failed to parse PRD or other files
    ParseError,
    /// Git merge conflict detected
    GitConflict,
    /// Rate limit hit
    RateLimit,
    /// Maximum iterations reached
    MaxIterations,
    /// Maximum cost exceeded
    MaxCost,
    /// Agent timed out
    Timeout,
    /// Generic/unknown error
    Unknown,
}

/// Payload for Ralph Loop error events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphLoopErrorPayload {
    /// Execution ID
    pub execution_id: String,
    /// PRD name (session name)
    pub prd_name: String,
    /// Type of error
    pub error_type: RalphLoopErrorType,
    /// Error message (truncated to 200 chars for notification)
    pub message: String,
    /// Current iteration when error occurred
    pub iteration: u32,
    /// Timestamp of error
    pub timestamp: String,
    /// Number of stories remaining (for max_iterations error)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stories_remaining: Option<u32>,
    /// Total number of stories (for max_iterations error)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_stories: Option<u32>,
}

// ============================================================================
// Multi-Agent Assignment Events (US-2.2: Avoid File Conflicts)
// ============================================================================

/// Type of assignment change
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AssignmentChangeType {
    /// New assignment created
    Created,
    /// Assignment completed
    Completed,
    /// Assignment failed
    Failed,
    /// Assignment released
    Released,
    /// Estimated files updated
    FilesUpdated,
}

/// Payload for assignment changed events
/// Sent when any agent's assignment changes, allowing real-time conflict zone updates
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignmentChangedPayload {
    /// Type of change
    pub change_type: AssignmentChangeType,
    /// Agent ID that owns this assignment
    pub agent_id: String,
    /// Agent type (claude, opencode, etc.)
    pub agent_type: String,
    /// Story ID being worked on
    pub story_id: String,
    /// PRD name
    pub prd_name: String,
    /// Estimated files this assignment may modify
    pub estimated_files: Vec<String>,
    /// Timestamp of the change
    pub timestamp: String,
}

/// Payload for file conflict detection events
/// Sent when potential file conflicts are detected between agents
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConflictDetectedPayload {
    /// Files with potential conflicts
    pub conflicting_files: Vec<FileConflictInfo>,
    /// PRD name
    pub prd_name: String,
    /// Timestamp
    pub timestamp: String,
}

/// Information about a single file conflict
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConflictInfo {
    /// Path to the conflicting file
    pub path: String,
    /// Agents that are trying to modify this file
    pub agents: Vec<AgentFileUse>,
}

/// Information about an agent using a file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFileUse {
    /// Agent ID
    pub agent_id: String,
    /// Agent type
    pub agent_type: String,
    /// Story being worked on
    pub story_id: String,
}

// ============================================================================
// Merge Events (US-5.1: Collaborative Mode with Merges)
// ============================================================================

/// Payload for merge attempted events
/// Sent when the system attempts to merge an execution branch
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeAttemptedPayload {
    /// Execution ID
    pub execution_id: String,
    /// PRD name
    pub prd_name: String,
    /// Source branch (execution branch)
    pub source_branch: String,
    /// Target branch (merge target)
    pub target_branch: String,
    /// Whether merge was successful
    pub success: bool,
    /// Number of conflicting files (0 if success)
    pub conflict_count: usize,
    /// Message describing the result
    pub message: String,
    /// Timestamp
    pub timestamp: String,
}

/// Payload for merge conflict detected events
/// Sent when merge conflicts are found
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeConflictDetectedPayload {
    /// Execution ID
    pub execution_id: String,
    /// PRD name
    pub prd_name: String,
    /// Files that have conflicts
    pub conflicting_files: Vec<String>,
    /// Iteration number when conflict detected
    pub iteration: u32,
    /// Merge strategy configured
    pub merge_strategy: String,
    /// Conflict resolution strategy (stop or continue)
    pub resolution_strategy: String,
    /// Timestamp
    pub timestamp: String,
}

// ============================================================================
// Tool Call Events (for collapsible tool call display)
// ============================================================================

/// Payload for tool call started events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallStartedPayload {
    /// Agent ID that made the tool call
    pub agent_id: String,
    /// Unique tool call ID (from Claude's tool_use_id)
    pub tool_id: String,
    /// Name of the tool being called
    pub tool_name: String,
    /// Tool input parameters (JSON value)
    pub input: Option<serde_json::Value>,
    /// Timestamp when tool call started
    pub timestamp: String,
}

/// Payload for tool call completed events
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallCompletedPayload {
    /// Agent ID that made the tool call
    pub agent_id: String,
    /// Unique tool call ID (from Claude's tool_use_id)
    pub tool_id: String,
    /// Tool output/result (truncated for large outputs)
    pub output: Option<String>,
    /// Duration in milliseconds
    pub duration_ms: Option<u64>,
    /// Timestamp when tool call completed
    pub timestamp: String,
    /// Whether the tool call was successful
    pub is_error: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    // =========================================================================
    // Event constant tests
    // =========================================================================

    #[test]
    fn test_event_constants() {
        assert_eq!(EVENT_AGENT_STATUS_CHANGED, "agent:status_changed");
        assert_eq!(EVENT_TASK_STATUS_CHANGED, "task:status_changed");
        assert_eq!(EVENT_SESSION_STATUS_CHANGED, "session:status_changed");
        assert_eq!(EVENT_MISSION_CONTROL_REFRESH, "mission_control:refresh");
        assert_eq!(EVENT_RATE_LIMIT_DETECTED, "agent:rate_limit_detected");
        assert_eq!(EVENT_PRD_FILE_UPDATED, "prd:file_updated");
        assert_eq!(EVENT_PRD_CHAT_CHUNK, "prd:chat_chunk");
    }

    #[test]
    fn test_subagent_event_constants() {
        assert_eq!(EVENT_SUBAGENT_SPAWNED, "subagent:spawned");
        assert_eq!(EVENT_SUBAGENT_PROGRESS, "subagent:progress");
        assert_eq!(EVENT_SUBAGENT_COMPLETED, "subagent:completed");
        assert_eq!(EVENT_SUBAGENT_FAILED, "subagent:failed");
    }

    #[test]
    fn test_subagent_event_type_serialization() {
        assert_eq!(
            serde_json::to_string(&SubagentEventType::Spawned).unwrap(),
            "\"spawned\""
        );
        assert_eq!(
            serde_json::to_string(&SubagentEventType::Progress).unwrap(),
            "\"progress\""
        );
        assert_eq!(
            serde_json::to_string(&SubagentEventType::Completed).unwrap(),
            "\"completed\""
        );
        assert_eq!(
            serde_json::to_string(&SubagentEventType::Failed).unwrap(),
            "\"failed\""
        );
    }

    #[test]
    fn test_subagent_spawned_payload_serialization() {
        let payload = SubagentSpawnedPayload {
            subagent_id: "sub-123".to_string(),
            parent_agent_id: "agent-456".to_string(),
            description: "Searching codebase".to_string(),
            timestamp: "2024-01-01T00:00:00Z".to_string(),
            depth: 1,
            subagent_type: Some("Explore".to_string()),
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"subagentId\":\"sub-123\""));
        assert!(json.contains("\"parentAgentId\":\"agent-456\""));
        assert!(json.contains("\"depth\":1"));
        assert!(json.contains("\"subagentType\":\"Explore\""));
    }

    #[test]
    fn test_subagent_completed_payload_serialization() {
        let payload = SubagentCompletedPayload {
            subagent_id: "sub-123".to_string(),
            parent_agent_id: "agent-456".to_string(),
            duration_secs: 45.5,
            timestamp: "2024-01-01T00:00:45Z".to_string(),
            summary: Some("Found 3 matching files".to_string()),
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"durationSecs\":45.5"));
        assert!(json.contains("\"summary\":\"Found 3 matching files\""));
    }

    #[test]
    fn test_subagent_failed_payload_serialization() {
        let payload = SubagentFailedPayload {
            subagent_id: "sub-123".to_string(),
            parent_agent_id: "agent-456".to_string(),
            duration_secs: 10.0,
            timestamp: "2024-01-01T00:00:10Z".to_string(),
            error: "Network timeout".to_string(),
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"error\":\"Network timeout\""));
    }

    // =========================================================================
    // Payload serialization tests
    // =========================================================================

    #[test]
    fn test_agent_status_changed_payload_serialization() {
        let payload = AgentStatusChangedPayload {
            agent_id: "agent-123".to_string(),
            session_id: "session-456".to_string(),
            old_status: "idle".to_string(),
            new_status: "thinking".to_string(),
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"agentId\":\"agent-123\""));
        assert!(json.contains("\"sessionId\":\"session-456\""));
        assert!(json.contains("\"oldStatus\":\"idle\""));
        assert!(json.contains("\"newStatus\":\"thinking\""));
    }

    #[test]
    fn test_agent_status_changed_payload_deserialization() {
        let json = r#"{
            "agentId": "agent-123",
            "sessionId": "session-456",
            "oldStatus": "idle",
            "newStatus": "thinking"
        }"#;

        let payload: AgentStatusChangedPayload = serde_json::from_str(json).unwrap();
        assert_eq!(payload.agent_id, "agent-123");
        assert_eq!(payload.session_id, "session-456");
        assert_eq!(payload.old_status, "idle");
        assert_eq!(payload.new_status, "thinking");
    }

    #[test]
    fn test_task_status_changed_payload_serialization() {
        let payload = TaskStatusChangedPayload {
            task_id: "task-789".to_string(),
            session_id: "session-456".to_string(),
            old_status: "pending".to_string(),
            new_status: "in_progress".to_string(),
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"taskId\":\"task-789\""));
        assert!(json.contains("\"sessionId\":\"session-456\""));
        assert!(json.contains("\"oldStatus\":\"pending\""));
        assert!(json.contains("\"newStatus\":\"in_progress\""));
    }

    #[test]
    fn test_session_status_changed_payload_serialization() {
        let payload = SessionStatusChangedPayload {
            session_id: "session-123".to_string(),
            old_status: "active".to_string(),
            new_status: "paused".to_string(),
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"sessionId\":\"session-123\""));
        assert!(json.contains("\"oldStatus\":\"active\""));
        assert!(json.contains("\"newStatus\":\"paused\""));
    }

    #[test]
    fn test_rate_limit_detected_payload_serialization() {
        let payload = RateLimitDetectedPayload {
            agent_id: "agent-123".to_string(),
            session_id: "session-456".to_string(),
            limit_type: "claude_rate_limit".to_string(),
            retry_after_ms: Some(30000),
            matched_pattern: Some("rate limit exceeded".to_string()),
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"agentId\":\"agent-123\""));
        assert!(json.contains("\"sessionId\":\"session-456\""));
        assert!(json.contains("\"limitType\":\"claude_rate_limit\""));
        assert!(json.contains("\"retryAfterMs\":30000"));
        assert!(json.contains("\"matchedPattern\":\"rate limit exceeded\""));
    }

    #[test]
    fn test_tool_call_event_constants() {
        assert_eq!(EVENT_TOOL_CALL_STARTED, "tool:started");
        assert_eq!(EVENT_TOOL_CALL_COMPLETED, "tool:completed");
    }

    #[test]
    fn test_tool_call_started_payload_serialization() {
        let payload = ToolCallStartedPayload {
            agent_id: "agent-123".to_string(),
            tool_id: "toolu_01abc".to_string(),
            tool_name: "Read".to_string(),
            input: Some(serde_json::json!({"file_path": "/test/file.txt"})),
            timestamp: "2024-01-01T00:00:00Z".to_string(),
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"agentId\":\"agent-123\""));
        assert!(json.contains("\"toolId\":\"toolu_01abc\""));
        assert!(json.contains("\"toolName\":\"Read\""));
        assert!(json.contains("\"input\":{\"file_path\":\"/test/file.txt\"}"));
    }

    #[test]
    fn test_tool_call_completed_payload_serialization() {
        let payload = ToolCallCompletedPayload {
            agent_id: "agent-123".to_string(),
            tool_id: "toolu_01abc".to_string(),
            output: Some("File contents here...".to_string()),
            duration_ms: Some(150),
            timestamp: "2024-01-01T00:00:01Z".to_string(),
            is_error: false,
        };

        let json = serde_json::to_string(&payload).unwrap();
        assert!(json.contains("\"agentId\":\"agent-123\""));
        assert!(json.contains("\"toolId\":\"toolu_01abc\""));
        assert!(json.contains("\"durationMs\":150"));
        assert!(json.contains("\"isError\":false"));
    }

    #[test]
    fn test_payloads_are_clonable() {
        let agent_payload = AgentStatusChangedPayload {
            agent_id: "agent-1".to_string(),
            session_id: "session-1".to_string(),
            old_status: "idle".to_string(),
            new_status: "thinking".to_string(),
        };
        let cloned = agent_payload.clone();
        assert_eq!(agent_payload.agent_id, cloned.agent_id);

        let task_payload = TaskStatusChangedPayload {
            task_id: "task-1".to_string(),
            session_id: "session-1".to_string(),
            old_status: "pending".to_string(),
            new_status: "in_progress".to_string(),
        };
        let cloned = task_payload.clone();
        assert_eq!(task_payload.task_id, cloned.task_id);
    }
}
