//! Agent-related command routing
//!
//! Handles: create_agent, get_agent, get_agents_for_session, get_agents_for_task,
//! get_active_agents, get_all_active_agents, update_agent_metrics, update_agent_process_id,
//! delete_agent, get_agent_pty_history, update_agent_status, add_agent_log, get_agent_logs,
//! cleanup_stale_agents, agent_has_pty, get_agent_pty_id, process_agent_pty_data,
//! notify_agent_pty_exit

use crate::commands;
use crate::models::*;
use crate::utils::as_path;
use serde::Serialize;
use serde_json::Value;

use super::{get_arg, get_opt_arg, route_sync, route_unit, ServerAppState};

/// Execute a closure with a locked agent manager, serializing the result
fn with_agent_manager<T, F>(state: &ServerAppState, f: F) -> Result<Value, String>
where
    T: Serialize,
    F: FnOnce(&crate::agents::AgentManager) -> Result<T, String>,
{
    let manager = state.agent_manager.lock().map_err(|e| e.to_string())?;
    let result = f(&manager)?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}

/// Route agent-related commands
pub async fn route_agent_command(
    cmd: &str,
    args: Value,
    state: &ServerAppState,
) -> Result<Value, String> {
    match cmd {
        "create_agent" => {
            let agent: Agent = get_arg(&args, "agent")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit!(commands::agents::create_agent(agent, project_path))
        }

        "get_agent" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::agents::get_agent(agent_id, project_path))
        }

        "get_agents_for_session" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::agents::get_agents_for_session(
                session_id,
                project_path
            ))
        }

        "get_agents_for_task" => {
            let task_id: String = get_arg(&args, "taskId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::agents::get_agents_for_task(task_id, project_path))
        }

        "get_active_agents" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::agents::get_active_agents(
                session_id,
                project_path
            ))
        }

        "get_all_active_agents" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::agents::get_all_active_agents(project_path))
        }

        "update_agent_metrics" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let tokens: i32 = get_arg(&args, "tokens")?;
            let cost: f64 = get_arg(&args, "cost")?;
            let iteration_count: i32 = get_arg(&args, "iterationCount")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit!(commands::agents::update_agent_metrics(
                agent_id,
                tokens,
                cost,
                iteration_count,
                project_path,
            ))
        }

        "update_agent_process_id" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let process_id: Option<u32> = get_opt_arg(&args, "processId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit!(commands::agents::update_agent_process_id(
                agent_id,
                process_id,
                project_path
            ))
        }

        "delete_agent" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit!(commands::agents::delete_agent(agent_id, project_path))
        }

        "get_agent_pty_history" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            with_agent_manager(state, |mgr| {
                commands::agents::get_agent_pty_history_internal(mgr, &agent_id)
            })
        }

        "update_agent_status" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let status: AgentStatus = get_arg(&args, "status")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            let path = as_path(&project_path);
            let result = commands::agents::update_agent_status_internal(path, &agent_id, status)?;
            // Emit event for status change
            let (session_id, old_status, new_status) = result;
            state.broadcaster.broadcast(
                "agent-status-changed",
                serde_json::json!({
                    "agentId": agent_id,
                    "sessionId": session_id,
                    "oldStatus": old_status,
                    "newStatus": new_status,
                }),
            );
            serde_json::to_value(()).map_err(|e| e.to_string())
        }

        "add_agent_log" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let log: LogEntry = get_arg(&args, "log")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit!(commands::agents::add_agent_log(agent_id, log, project_path))
        }

        "get_agent_logs" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::agents::get_agent_logs(agent_id, project_path))
        }

        "cleanup_stale_agents" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let path = as_path(&project_path);
            let results = commands::agents::cleanup_stale_agents_internal(path)?;
            // Emit events for each cleaned up agent
            for result in &results {
                state.broadcaster.broadcast(
                    "agent-status-changed",
                    serde_json::json!({
                        "agentId": result.agent_id,
                        "sessionId": result.session_id,
                        "oldStatus": result.old_status,
                        "newStatus": "idle",
                    }),
                );
            }
            serde_json::to_value(results).map_err(|e| e.to_string())
        }

        "agent_has_pty" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            with_agent_manager(state, |mgr| {
                commands::agents::agent_has_pty_internal(mgr, &agent_id)
            })
        }

        "get_agent_pty_id" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            with_agent_manager(state, |mgr| {
                commands::agents::get_agent_pty_id_internal(mgr, &agent_id)
            })
        }

        "process_agent_pty_data" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let data: Vec<u8> = get_arg(&args, "data")?;
            with_agent_manager(state, |mgr| {
                commands::agents::process_agent_pty_data_internal(mgr, &agent_id, data)
            })
        }

        "notify_agent_pty_exit" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let exit_code: i32 = get_arg(&args, "exitCode")?;
            with_agent_manager(state, |mgr| {
                commands::agents::notify_agent_pty_exit_internal(mgr, &agent_id, exit_code)
            })
        }

        _ => Err(format!("Unknown agent command: {}", cmd)),
    }
}

/// Check if a command is an agent command
pub fn is_agent_command(cmd: &str) -> bool {
    matches!(
        cmd,
        "create_agent"
            | "get_agent"
            | "get_agents_for_session"
            | "get_agents_for_task"
            | "get_active_agents"
            | "get_all_active_agents"
            | "update_agent_metrics"
            | "update_agent_process_id"
            | "delete_agent"
            | "get_agent_pty_history"
            | "update_agent_status"
            | "add_agent_log"
            | "get_agent_logs"
            | "cleanup_stale_agents"
            | "agent_has_pty"
            | "get_agent_pty_id"
            | "process_agent_pty_data"
            | "notify_agent_pty_exit"
    )
}
