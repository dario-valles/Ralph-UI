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
