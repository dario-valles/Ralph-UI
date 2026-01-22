// Event types and helper functions for Tauri event emission
// Used for real-time Mission Control updates

use crate::utils::ResultExt;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

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

/// Emit an agent status changed event
pub fn emit_agent_status_changed(
    app_handle: &tauri::AppHandle,
    payload: AgentStatusChangedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_AGENT_STATUS_CHANGED, payload)
        .with_context("Failed to emit agent status changed event")
}

/// Emit a task status changed event
pub fn emit_task_status_changed(
    app_handle: &tauri::AppHandle,
    payload: TaskStatusChangedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_TASK_STATUS_CHANGED, payload)
        .with_context("Failed to emit task status changed event")
}

/// Emit a session status changed event
pub fn emit_session_status_changed(
    app_handle: &tauri::AppHandle,
    payload: SessionStatusChangedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_SESSION_STATUS_CHANGED, payload)
        .with_context("Failed to emit session status changed event")
}

/// Emit a mission control refresh event (general refresh signal)
pub fn emit_mission_control_refresh(app_handle: &tauri::AppHandle) -> Result<(), String> {
    app_handle
        .emit(EVENT_MISSION_CONTROL_REFRESH, ())
        .with_context("Failed to emit mission control refresh event")
}

/// Emit a rate limit detected event
pub fn emit_rate_limit_detected(
    app_handle: &tauri::AppHandle,
    payload: RateLimitDetectedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_RATE_LIMIT_DETECTED, payload)
        .with_context("Failed to emit rate limit detected event")
}

/// Emit a PRD file updated event
pub fn emit_prd_file_updated(
    app_handle: &tauri::AppHandle,
    payload: PrdFileUpdatedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_PRD_FILE_UPDATED, payload)
        .with_context("Failed to emit PRD file updated event")
}

/// Emit a PRD chat streaming chunk event
pub fn emit_prd_chat_chunk(
    app_handle: &tauri::AppHandle,
    payload: PrdChatChunkPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_PRD_CHAT_CHUNK, payload)
        .with_context("Failed to emit PRD chat chunk event")
}

/// Emit an agent completed event
pub fn emit_agent_completed(
    app_handle: &tauri::AppHandle,
    payload: AgentCompletedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_AGENT_COMPLETED, payload)
        .with_context("Failed to emit agent completed event")
}

/// Emit an agent failed event
pub fn emit_agent_failed(
    app_handle: &tauri::AppHandle,
    payload: AgentFailedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_AGENT_FAILED, payload)
        .with_context("Failed to emit agent failed event")
}

// ============================================================================
// Subagent Event Emitters
// ============================================================================

/// Emit a subagent spawned event
pub fn emit_subagent_spawned(
    app_handle: &tauri::AppHandle,
    payload: SubagentSpawnedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_SUBAGENT_SPAWNED, payload)
        .with_context("Failed to emit subagent spawned event")
}

/// Emit a subagent progress event
pub fn emit_subagent_progress(
    app_handle: &tauri::AppHandle,
    payload: SubagentProgressPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_SUBAGENT_PROGRESS, payload)
        .with_context("Failed to emit subagent progress event")
}

/// Emit a subagent completed event
pub fn emit_subagent_completed(
    app_handle: &tauri::AppHandle,
    payload: SubagentCompletedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_SUBAGENT_COMPLETED, payload)
        .with_context("Failed to emit subagent completed event")
}

/// Emit a subagent failed event
pub fn emit_subagent_failed(
    app_handle: &tauri::AppHandle,
    payload: SubagentFailedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_SUBAGENT_FAILED, payload)
        .with_context("Failed to emit subagent failed event")
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

/// Emit a Ralph Loop progress event
pub fn emit_ralph_progress(
    app_handle: &tauri::AppHandle,
    payload: RalphProgressPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_RALPH_PROGRESS, payload)
        .with_context("Failed to emit Ralph progress event")
}

/// Emit a Ralph Loop iteration started event
pub fn emit_ralph_iteration_started(
    app_handle: &tauri::AppHandle,
    payload: RalphIterationStartedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_RALPH_ITERATION_STARTED, payload)
        .with_context("Failed to emit Ralph iteration started event")
}

/// Emit a Ralph Loop iteration completed event
pub fn emit_ralph_iteration_completed(
    app_handle: &tauri::AppHandle,
    payload: RalphIterationCompletedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_RALPH_ITERATION_COMPLETED, payload)
        .with_context("Failed to emit Ralph iteration completed event")
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

/// Emit a tool call started event
pub fn emit_tool_call_started(
    app_handle: &tauri::AppHandle,
    payload: ToolCallStartedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_TOOL_CALL_STARTED, payload)
        .with_context("Failed to emit tool call started event")
}

/// Emit a tool call completed event
pub fn emit_tool_call_completed(
    app_handle: &tauri::AppHandle,
    payload: ToolCallCompletedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_TOOL_CALL_COMPLETED, payload)
        .with_context("Failed to emit tool call completed event")
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
        assert_eq!(serde_json::to_string(&SubagentEventType::Spawned).unwrap(), "\"spawned\"");
        assert_eq!(serde_json::to_string(&SubagentEventType::Progress).unwrap(), "\"progress\"");
        assert_eq!(serde_json::to_string(&SubagentEventType::Completed).unwrap(), "\"completed\"");
        assert_eq!(serde_json::to_string(&SubagentEventType::Failed).unwrap(), "\"failed\"");
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
    fn test_task_status_changed_payload_deserialization() {
        let json = r#"{
            "taskId": "task-789",
            "sessionId": "session-456",
            "oldStatus": "pending",
            "newStatus": "completed"
        }"#;

        let payload: TaskStatusChangedPayload = serde_json::from_str(json).unwrap();
        assert_eq!(payload.task_id, "task-789");
        assert_eq!(payload.session_id, "session-456");
        assert_eq!(payload.old_status, "pending");
        assert_eq!(payload.new_status, "completed");
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
    fn test_session_status_changed_payload_deserialization() {
        let json = r#"{
            "sessionId": "session-123",
            "oldStatus": "active",
            "newStatus": "completed"
        }"#;

        let payload: SessionStatusChangedPayload = serde_json::from_str(json).unwrap();
        assert_eq!(payload.session_id, "session-123");
        assert_eq!(payload.old_status, "active");
        assert_eq!(payload.new_status, "completed");
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
    fn test_rate_limit_detected_payload_deserialization() {
        let json = r#"{
            "agentId": "agent-123",
            "sessionId": "session-456",
            "limitType": "http_429",
            "retryAfterMs": 60000,
            "matchedPattern": "429 Too Many Requests"
        }"#;

        let payload: RateLimitDetectedPayload = serde_json::from_str(json).unwrap();
        assert_eq!(payload.agent_id, "agent-123");
        assert_eq!(payload.session_id, "session-456");
        assert_eq!(payload.limit_type, "http_429");
        assert_eq!(payload.retry_after_ms, Some(60000));
        assert_eq!(payload.matched_pattern, Some("429 Too Many Requests".to_string()));
    }

    #[test]
    fn test_rate_limit_detected_payload_with_none_values() {
        let payload = RateLimitDetectedPayload {
            agent_id: "agent-123".to_string(),
            session_id: "session-456".to_string(),
            limit_type: "rate_limit".to_string(),
            retry_after_ms: None,
            matched_pattern: None,
        };

        let json = serde_json::to_string(&payload).unwrap();
        // Should serialize None as null
        assert!(json.contains("\"retryAfterMs\":null"));
        assert!(json.contains("\"matchedPattern\":null"));
    }

    // =========================================================================
    // Payload clone and debug tests
    // =========================================================================

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

        let session_payload = SessionStatusChangedPayload {
            session_id: "session-1".to_string(),
            old_status: "active".to_string(),
            new_status: "paused".to_string(),
        };
        let cloned = session_payload.clone();
        assert_eq!(session_payload.session_id, cloned.session_id);

        let rate_limit_payload = RateLimitDetectedPayload {
            agent_id: "agent-1".to_string(),
            session_id: "session-1".to_string(),
            limit_type: "http_429".to_string(),
            retry_after_ms: Some(30000),
            matched_pattern: Some("429".to_string()),
        };
        let cloned = rate_limit_payload.clone();
        assert_eq!(rate_limit_payload.agent_id, cloned.agent_id);
        assert_eq!(rate_limit_payload.limit_type, cloned.limit_type);
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
    fn test_payloads_are_debuggable() {
        let agent_payload = AgentStatusChangedPayload {
            agent_id: "agent-1".to_string(),
            session_id: "session-1".to_string(),
            old_status: "idle".to_string(),
            new_status: "thinking".to_string(),
        };
        let debug_str = format!("{:?}", agent_payload);
        assert!(debug_str.contains("agent-1"));

        let task_payload = TaskStatusChangedPayload {
            task_id: "task-1".to_string(),
            session_id: "session-1".to_string(),
            old_status: "pending".to_string(),
            new_status: "in_progress".to_string(),
        };
        let debug_str = format!("{:?}", task_payload);
        assert!(debug_str.contains("task-1"));

        let session_payload = SessionStatusChangedPayload {
            session_id: "session-1".to_string(),
            old_status: "active".to_string(),
            new_status: "paused".to_string(),
        };
        let debug_str = format!("{:?}", session_payload);
        assert!(debug_str.contains("session-1"));

        let rate_limit_payload = RateLimitDetectedPayload {
            agent_id: "agent-1".to_string(),
            session_id: "session-1".to_string(),
            limit_type: "http_429".to_string(),
            retry_after_ms: Some(30000),
            matched_pattern: Some("429".to_string()),
        };
        let debug_str = format!("{:?}", rate_limit_payload);
        assert!(debug_str.contains("agent-1"));
        assert!(debug_str.contains("http_429"));
    }
}
