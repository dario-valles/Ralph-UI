// Event types and helper functions for Tauri event emission
// Used for real-time Mission Control updates

use serde::{Deserialize, Serialize};
use tauri::Emitter;

// Event name constants
pub const EVENT_AGENT_STATUS_CHANGED: &str = "agent:status_changed";
pub const EVENT_TASK_STATUS_CHANGED: &str = "task:status_changed";
pub const EVENT_SESSION_STATUS_CHANGED: &str = "session:status_changed";
pub const EVENT_MISSION_CONTROL_REFRESH: &str = "mission_control:refresh";

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

/// Emit an agent status changed event
pub fn emit_agent_status_changed(
    app_handle: &tauri::AppHandle,
    payload: AgentStatusChangedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_AGENT_STATUS_CHANGED, payload)
        .map_err(|e| format!("Failed to emit agent status changed event: {}", e))
}

/// Emit a task status changed event
pub fn emit_task_status_changed(
    app_handle: &tauri::AppHandle,
    payload: TaskStatusChangedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_TASK_STATUS_CHANGED, payload)
        .map_err(|e| format!("Failed to emit task status changed event: {}", e))
}

/// Emit a session status changed event
pub fn emit_session_status_changed(
    app_handle: &tauri::AppHandle,
    payload: SessionStatusChangedPayload,
) -> Result<(), String> {
    app_handle
        .emit(EVENT_SESSION_STATUS_CHANGED, payload)
        .map_err(|e| format!("Failed to emit session status changed event: {}", e))
}

/// Emit a mission control refresh event (general refresh signal)
pub fn emit_mission_control_refresh(app_handle: &tauri::AppHandle) -> Result<(), String> {
    app_handle
        .emit(EVENT_MISSION_CONTROL_REFRESH, ())
        .map_err(|e| format!("Failed to emit mission control refresh event: {}", e))
}
