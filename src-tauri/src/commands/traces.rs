// Subagent trace Tauri commands

use crate::agents::{
    StreamingParser, SubagentEvent, SubagentEventType, SubagentTree,
};
use crate::AgentManagerState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;

// TraceState struct removed - functionality moved to AgentManager

/// Subagent tree summary for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentTreeSummary {
    pub total_events: usize,
    pub active_subagents: Vec<String>,
    pub max_depth: u32,
    pub spawn_count: usize,
    pub complete_count: usize,
    pub fail_count: usize,
}

// TraceState is no longer used, define a placeholder type or remove usage
// Since other files might import TraceState, we can keep a dummy type or alias if needed,
// but better to remove it and fix call sites.
// For now, I'll remove it.

/// Initialize trace parser for an agent
#[tauri::command]
pub async fn init_trace_parser(
    agent_id: String,
    agent_manager: tauri::State<'_, AgentManagerState>,
) -> Result<(), String> {
    let manager = agent_manager.manager.lock().map_err(|e| e.to_string())?;
    manager.init_trace_parser(&agent_id);
    Ok(())
}

/// Parse agent output for subagent events
#[tauri::command]
pub async fn parse_agent_output(
    agent_id: String,
    output: String,
    agent_manager: tauri::State<'_, AgentManagerState>,
) -> Result<Vec<SubagentEvent>, String> {
    let manager = agent_manager.manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.parse_text_output(&agent_id, &output))
}

/// Get subagent tree for an agent
#[tauri::command]
pub async fn get_subagent_tree(
    agent_id: String,
    agent_manager: tauri::State<'_, AgentManagerState>,
) -> Result<Option<SubagentTree>, String> {
    let manager = agent_manager.manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.get_subagent_tree(&agent_id))
}

/// Get subagent tree summary
#[tauri::command]
pub async fn get_subagent_summary(
    agent_id: String,
    agent_manager: tauri::State<'_, AgentManagerState>,
) -> Result<Option<SubagentTreeSummary>, String> {
    let manager = agent_manager.manager.lock().map_err(|e| e.to_string())?;
    let tree = manager.get_subagent_tree(&agent_id);

    Ok(tree.map(|t| {
        let spawn_count = t.events.iter()
            .filter(|e| e.event_type == SubagentEventType::Spawned)
            .count();
        let complete_count = t.events.iter()
            .filter(|e| e.event_type == SubagentEventType::Completed)
            .count();
        let fail_count = t.events.iter()
            .filter(|e| e.event_type == SubagentEventType::Failed)
            .count();

        SubagentTreeSummary {
            total_events: t.events.len(),
            active_subagents: t.active.clone(),
            max_depth: t.max_depth(),
            spawn_count,
            complete_count,
            fail_count,
        }
    }))
}

/// Get all events for a specific subagent
#[tauri::command]
pub async fn get_subagent_events(
    agent_id: String,
    subagent_id: String,
    agent_manager: tauri::State<'_, AgentManagerState>,
) -> Result<Vec<SubagentEvent>, String> {
    let manager = agent_manager.manager.lock().map_err(|e| e.to_string())?;
    let tree = manager.get_subagent_tree(&agent_id);

    Ok(tree
        .map(|t| t.get_subagent_events(&subagent_id)
            .into_iter()
            .cloned()
            .collect())
        .unwrap_or_default())
}

/// Clear trace data for an agent
#[tauri::command]
pub async fn clear_trace_data(
    agent_id: String,
    agent_manager: tauri::State<'_, AgentManagerState>,
) -> Result<(), String> {
    let manager = agent_manager.manager.lock().map_err(|e| e.to_string())?;
    manager.clear_trace_data(&agent_id);
    Ok(())
}

/// Check if a subagent is active
#[tauri::command]
pub async fn is_subagent_active(
    agent_id: String,
    subagent_id: String,
    agent_manager: tauri::State<'_, AgentManagerState>,
) -> Result<bool, String> {
    let manager = agent_manager.manager.lock().map_err(|e| e.to_string())?;
    let tree = manager.get_subagent_tree(&agent_id);

    Ok(tree
        .map(|t| t.is_active(&subagent_id))
        .unwrap_or(false))
}
