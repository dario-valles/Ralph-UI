// Subagent trace Tauri commands

use crate::agents::{
    SubagentTraceParser, SubagentEvent, SubagentEventType, SubagentTree,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::RwLock;

/// State for tracking subagent traces per agent
pub struct TraceState {
    /// Parsers per agent ID
    parsers: RwLock<HashMap<String, SubagentTraceParser>>,
    /// Trees per agent ID
    trees: RwLock<HashMap<String, SubagentTree>>,
}

impl TraceState {
    pub fn new() -> Self {
        Self {
            parsers: RwLock::new(HashMap::new()),
            trees: RwLock::new(HashMap::new()),
        }
    }

    /// Initialize parser for an agent
    pub fn init_parser(&self, agent_id: &str) -> Result<(), String> {
        let mut parsers = self.parsers.write()
            .map_err(|e| format!("Lock error: {}", e))?;
        let mut trees = self.trees.write()
            .map_err(|e| format!("Lock error: {}", e))?;

        parsers.insert(agent_id.to_string(), SubagentTraceParser::new(agent_id));
        trees.insert(agent_id.to_string(), SubagentTree::new());
        Ok(())
    }

    /// Parse output and get events
    pub fn parse_output(&self, agent_id: &str, output: &str) -> Result<Vec<SubagentEvent>, String> {
        let mut parsers = self.parsers.write()
            .map_err(|e| format!("Lock error: {}", e))?;
        let mut trees = self.trees.write()
            .map_err(|e| format!("Lock error: {}", e))?;

        let parser = parsers.get_mut(agent_id)
            .ok_or_else(|| format!("No parser for agent: {}", agent_id))?;
        let tree = trees.get_mut(agent_id)
            .ok_or_else(|| format!("No tree for agent: {}", agent_id))?;

        let events = parser.parse_output(output);
        for event in &events {
            tree.add_event(event.clone());
        }

        Ok(events)
    }

    /// Get tree for agent
    pub fn get_tree(&self, agent_id: &str) -> Result<Option<SubagentTree>, String> {
        let trees = self.trees.read()
            .map_err(|e| format!("Lock error: {}", e))?;

        Ok(trees.get(agent_id).cloned())
    }

    /// Clear parser/tree for agent
    pub fn clear(&self, agent_id: &str) -> Result<(), String> {
        let mut parsers = self.parsers.write()
            .map_err(|e| format!("Lock error: {}", e))?;
        let mut trees = self.trees.write()
            .map_err(|e| format!("Lock error: {}", e))?;

        parsers.remove(agent_id);
        trees.remove(agent_id);
        Ok(())
    }
}

impl Default for TraceState {
    fn default() -> Self {
        Self::new()
    }
}

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

/// Initialize trace parser for an agent
#[tauri::command]
pub async fn init_trace_parser(
    agent_id: String,
    trace_state: tauri::State<'_, TraceState>,
) -> Result<(), String> {
    trace_state.init_parser(&agent_id)
}

/// Parse agent output for subagent events
#[tauri::command]
pub async fn parse_agent_output(
    agent_id: String,
    output: String,
    trace_state: tauri::State<'_, TraceState>,
) -> Result<Vec<SubagentEvent>, String> {
    trace_state.parse_output(&agent_id, &output)
}

/// Get subagent tree for an agent
#[tauri::command]
pub async fn get_subagent_tree(
    agent_id: String,
    trace_state: tauri::State<'_, TraceState>,
) -> Result<Option<SubagentTree>, String> {
    trace_state.get_tree(&agent_id)
}

/// Get subagent tree summary
#[tauri::command]
pub async fn get_subagent_summary(
    agent_id: String,
    trace_state: tauri::State<'_, TraceState>,
) -> Result<Option<SubagentTreeSummary>, String> {
    let tree = trace_state.get_tree(&agent_id)?;

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
    trace_state: tauri::State<'_, TraceState>,
) -> Result<Vec<SubagentEvent>, String> {
    let tree = trace_state.get_tree(&agent_id)?;

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
    trace_state: tauri::State<'_, TraceState>,
) -> Result<(), String> {
    trace_state.clear(&agent_id)
}

/// Check if a subagent is active
#[tauri::command]
pub async fn is_subagent_active(
    agent_id: String,
    subagent_id: String,
    trace_state: tauri::State<'_, TraceState>,
) -> Result<bool, String> {
    let tree = trace_state.get_tree(&agent_id)?;

    Ok(tree
        .map(|t| t.is_active(&subagent_id))
        .unwrap_or(false))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_trace_state_lifecycle() {
        let state = TraceState::new();

        // Init parser
        state.init_parser("agent-1").unwrap();

        // Parse some output
        let output = "⠋ Task: Search for files\n✓ Task completed\n";
        let events = state.parse_output("agent-1", output).unwrap();
        assert_eq!(events.len(), 2);

        // Get tree
        let tree = state.get_tree("agent-1").unwrap();
        assert!(tree.is_some());
        let tree = tree.unwrap();
        assert_eq!(tree.events.len(), 2);

        // Clear
        state.clear("agent-1").unwrap();
        let tree = state.get_tree("agent-1").unwrap();
        assert!(tree.is_none());
    }
}
