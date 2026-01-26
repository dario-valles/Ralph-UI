// Agent management commands
// Uses file-based storage in .ralph-ui/agents/

use crate::agents::{AgentManager, AgentSpawnConfig, AgentSpawnMode};
use crate::file_storage::agents as agent_storage;
use crate::models::{Agent, AgentStatus, AgentType, LogEntry};
use crate::utils::as_path;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::{Arc, Mutex};
use sysinfo::{Pid, System};

/// Create a new agent
pub fn create_agent(agent: Agent, project_path: String) -> Result<(), String> {
    let path = as_path(&project_path);
    agent_storage::save_agent_state(path, &agent)?;
    Ok(())
}

/// Get an agent by ID
pub fn get_agent(agent_id: String, project_path: String) -> Result<Option<Agent>, String> {
    let path = as_path(&project_path);
    match agent_storage::read_agent_with_logs(path, &agent_id) {
        Ok(agent) => Ok(Some(agent)),
        Err(_) => Ok(None),
    }
}

/// Get all agents for a session
pub fn get_agents_for_session(
    session_id: String,
    project_path: String,
) -> Result<Vec<Agent>, String> {
    let path = as_path(&project_path);
    agent_storage::list_agents_for_session(path, &session_id)
}

/// Get all agents for a task
pub fn get_agents_for_task(task_id: String, project_path: String) -> Result<Vec<Agent>, String> {
    let path = as_path(&project_path);
    let agent_ids = agent_storage::list_agent_ids(path)?;
    let mut agents = Vec::new();

    for agent_id in agent_ids {
        if let Ok(agent) = agent_storage::read_agent_with_logs(path, &agent_id) {
            if agent.task_id == task_id {
                agents.push(agent);
            }
        }
    }

    Ok(agents)
}

/// Get active agents for a session
pub fn get_active_agents(session_id: String, project_path: String) -> Result<Vec<Agent>, String> {
    let path = as_path(&project_path);
    let agents = agent_storage::list_agents_for_session(path, &session_id)?;
    Ok(agents
        .into_iter()
        .filter(|a| a.status != AgentStatus::Idle)
        .collect())
}

/// Get ALL active agents across all sessions (for Mission Control dashboard)
pub fn get_all_active_agents(project_path: String) -> Result<Vec<Agent>, String> {
    let path = as_path(&project_path);
    agent_storage::get_all_active_agents(path)
}

/// Update agent status and return old/new status for event emission
/// Event emission is handled by the proxy layer
pub fn update_agent_status_internal(
    project_path: &Path,
    agent_id: &str,
    status: AgentStatus,
) -> Result<(String, String, String), String> {
    // Get the current agent to capture old status and session_id
    let agent = agent_storage::read_agent_with_logs(project_path, agent_id)
        .map_err(|e| format!("Agent not found: {}", e))?;

    let old_status = format!("{:?}", agent.status).to_lowercase();
    let new_status = format!("{:?}", status).to_lowercase();

    // Update the status
    agent_storage::update_agent_status(project_path, agent_id, status)?;

    Ok((agent.session_id, old_status, new_status))
}

/// Update agent metrics (tokens, cost, iterations)
pub fn update_agent_metrics(
    agent_id: String,
    tokens: i32,
    cost: f64,
    iteration_count: i32,
    project_path: String,
) -> Result<(), String> {
    let path = as_path(&project_path);
    agent_storage::update_agent_metrics(path, &agent_id, tokens, cost, iteration_count)
}

/// Update agent process ID
pub fn update_agent_process_id(
    agent_id: String,
    process_id: Option<u32>,
    project_path: String,
) -> Result<(), String> {
    let path = as_path(&project_path);
    agent_storage::update_agent_process_id(path, &agent_id, process_id)
}

/// Delete an agent
pub fn delete_agent(agent_id: String, project_path: String) -> Result<(), String> {
    let path = as_path(&project_path);
    agent_storage::delete_agent_files(path, &agent_id)
}

/// Add a log entry for an agent
pub fn add_agent_log(agent_id: String, log: LogEntry, project_path: String) -> Result<(), String> {
    let path = as_path(&project_path);
    agent_storage::append_agent_log(path, &agent_id, &log)
}

/// Get all logs for an agent
pub fn get_agent_logs(agent_id: String, project_path: String) -> Result<Vec<LogEntry>, String> {
    let path = as_path(&project_path);
    agent_storage::read_agent_logs(path, &agent_id)
}

/// Result of cleaning up stale agents
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaleAgentCleanupResult {
    pub agent_id: String,
    pub session_id: String,
    pub process_id: Option<u32>,
    pub was_zombie: bool,
    pub old_status: String,
}

/// Cleanup stale agents whose processes are no longer running
/// Returns list of cleaned up agents with their old status for event emission
/// Event emission is handled by the proxy layer
pub fn cleanup_stale_agents_internal(
    project_path: &Path,
) -> Result<Vec<StaleAgentCleanupResult>, String> {
    log::info!("[Agents] cleanup_stale_agents called");

    // Get all active agents
    let active_agents = agent_storage::get_all_active_agents(project_path)?;

    if active_agents.is_empty() {
        log::debug!("[Agents] No active agents to cleanup");
        return Ok(vec![]);
    }

    log::info!(
        "[Agents] Found {} active agents to check",
        active_agents.len()
    );

    // Initialize sysinfo to check processes
    let mut system = System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut cleaned_up = Vec::new();

    for agent in active_agents {
        let should_cleanup = match agent.process_id {
            Some(pid) => {
                // Check if process is still running
                let process = system.process(Pid::from_u32(pid));
                let is_alive = process
                    .map(|p| {
                        !matches!(p.status(), sysinfo::ProcessStatus::Zombie)
                            && p.status() != sysinfo::ProcessStatus::Dead
                    })
                    .unwrap_or(false);

                if !is_alive {
                    log::info!(
                        "[Agents] Agent {} (PID {}) process is not running",
                        agent.id,
                        pid
                    );
                    true
                } else {
                    log::debug!("[Agents] Agent {} (PID {}) is still running", agent.id, pid);
                    false
                }
            }
            None => {
                // No process ID - the agent spawn likely failed or the app restarted
                log::info!(
                    "[Agents] Agent {} has no process ID with status {:?}, marking as stale",
                    agent.id,
                    agent.status
                );
                true
            }
        };

        if should_cleanup {
            let old_status = format!("{:?}", agent.status).to_lowercase();

            // Update agent status to idle
            if let Err(e) =
                agent_storage::update_agent_status(project_path, &agent.id, AgentStatus::Idle)
            {
                log::error!("[Agents] Failed to update agent {} status: {}", agent.id, e);
                continue;
            }

            cleaned_up.push(StaleAgentCleanupResult {
                agent_id: agent.id,
                session_id: agent.session_id,
                process_id: agent.process_id,
                was_zombie: agent.process_id.is_some(),
                old_status,
            });
        }
    }

    log::info!("[Agents] Cleaned up {} stale agents", cleaned_up.len());
    Ok(cleaned_up)
}

// ============================================================================
// Agent PTY Commands - for interactive terminal support
// ============================================================================

/// Acquire lock on AgentManager with consistent error handling
fn lock_manager(
    agent_manager: &Arc<Mutex<AgentManager>>,
) -> Result<std::sync::MutexGuard<'_, AgentManager>, String> {
    agent_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))
}

/// Check if an agent has an associated PTY
pub fn agent_has_pty(
    agent_manager: &Arc<Mutex<AgentManager>>,
    agent_id: String,
) -> Result<bool, String> {
    Ok(lock_manager(agent_manager)?.has_pty(&agent_id))
}

/// Get the PTY ID for an agent
pub fn get_agent_pty_id(
    agent_manager: &Arc<Mutex<AgentManager>>,
    agent_id: String,
) -> Result<Option<String>, String> {
    Ok(lock_manager(agent_manager)?.get_pty_id(&agent_id))
}

/// Get the PTY history (raw output) for an agent
pub fn get_agent_pty_history(
    agent_manager: &Arc<Mutex<AgentManager>>,
    agent_id: String,
) -> Result<Vec<u8>, String> {
    Ok(lock_manager(agent_manager)?.get_pty_history(&agent_id))
}

/// Register a PTY association for an agent
pub fn register_agent_pty(
    agent_manager: &Arc<Mutex<AgentManager>>,
    agent_id: String,
    pty_id: String,
) -> Result<(), String> {
    lock_manager(agent_manager)?.register_pty(&agent_id, &pty_id);
    Ok(())
}

/// Unregister a PTY association for an agent
pub fn unregister_agent_pty(
    agent_manager: &Arc<Mutex<AgentManager>>,
    agent_id: String,
) -> Result<(), String> {
    lock_manager(agent_manager)?.unregister_pty(&agent_id);
    Ok(())
}

/// Process PTY data from an agent
pub fn process_agent_pty_data(
    agent_manager: &Arc<Mutex<AgentManager>>,
    agent_id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    lock_manager(agent_manager)?.process_pty_data(&agent_id, &data);
    Ok(())
}

/// Notify that an agent's PTY has exited
pub fn notify_agent_pty_exit(
    agent_manager: &Arc<Mutex<AgentManager>>,
    agent_id: String,
    exit_code: i32,
) -> Result<(), String> {
    lock_manager(agent_manager)?.notify_pty_exit(&agent_id, exit_code);
    Ok(())
}

// ============================================================================
// Internal PTY functions for use with pre-locked AgentManager
// Used by proxy.rs via with_agent_manager() to avoid double-locking
// ============================================================================

/// Check if an agent has an associated PTY (for pre-locked manager)
pub fn agent_has_pty_internal(manager: &AgentManager, agent_id: &str) -> Result<bool, String> {
    Ok(manager.has_pty(agent_id))
}

/// Get the PTY ID for an agent (for pre-locked manager)
pub fn get_agent_pty_id_internal(
    manager: &AgentManager,
    agent_id: &str,
) -> Result<Option<String>, String> {
    Ok(manager.get_pty_id(agent_id))
}

/// Get the PTY history for an agent (for pre-locked manager)
pub fn get_agent_pty_history_internal(
    manager: &AgentManager,
    agent_id: &str,
) -> Result<Vec<u8>, String> {
    Ok(manager.get_pty_history(agent_id))
}

/// Process PTY data from an agent (for pre-locked manager)
pub fn process_agent_pty_data_internal(
    manager: &AgentManager,
    agent_id: &str,
    data: Vec<u8>,
) -> Result<(), String> {
    manager.process_pty_data(agent_id, &data);
    Ok(())
}

/// Notify that an agent's PTY has exited (for pre-locked manager)
pub fn notify_agent_pty_exit_internal(
    manager: &AgentManager,
    agent_id: &str,
    exit_code: i32,
) -> Result<(), String> {
    manager.notify_pty_exit(agent_id, exit_code);
    Ok(())
}

/// Build command line for spawning an agent in PTY mode
/// Returns (program, args, cwd)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentCommandLine {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: String,
}

pub fn get_agent_command_line(
    agent_manager: &Arc<Mutex<AgentManager>>,
    agent_type: String,
    task_id: String,
    worktree_path: String,
    branch: String,
    max_iterations: i32,
    prompt: Option<String>,
    model: Option<String>,
    plugin_config: Option<std::collections::HashMap<String, serde_json::Value>>,
) -> Result<AgentCommandLine, String> {
    // Parse agent type string to enum
    let agent_type_enum = match agent_type.to_lowercase().as_str() {
        "claude" => AgentType::Claude,
        "opencode" => AgentType::Opencode,
        "cursor" => AgentType::Cursor,
        "codex" => AgentType::Codex,
        "qwen" => AgentType::Qwen,
        "droid" => AgentType::Droid,
        _ => return Err(format!("Unknown agent type: {}", agent_type)),
    };

    let config = AgentSpawnConfig {
        agent_type: agent_type_enum,
        task_id,
        worktree_path: worktree_path.clone(),
        branch,
        max_iterations,
        prompt,
        model,
        spawn_mode: AgentSpawnMode::Pty,
        plugin_config,
    };

    let manager = agent_manager
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    let (program, args, cwd) = manager
        .build_agent_command_line(&config)
        .map_err(|e| e.to_string())?;

    Ok(AgentCommandLine { program, args, cwd })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::LogLevel;
    use chrono::Utc;
    use tempfile::TempDir;

    fn create_test_agent(id: &str, session_id: &str) -> Agent {
        Agent {
            id: id.to_string(),
            session_id: session_id.to_string(),
            task_id: "task-1".to_string(),
            status: AgentStatus::Idle,
            process_id: None,
            worktree_path: "/tmp/worktree".to_string(),
            branch: "feature/test".to_string(),
            iteration_count: 0,
            tokens: 0,
            cost: 0.0,
            logs: Vec::new(),
            subagents: Vec::new(),
        }
    }

    #[test]
    fn test_create_and_get_agent() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path().to_str().unwrap().to_string();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let agent = create_test_agent("agent-1", "session-1");
        create_agent(agent.clone(), project_path.clone()).unwrap();

        let retrieved = get_agent("agent-1".to_string(), project_path).unwrap();
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().id, "agent-1");
    }

    #[test]
    fn test_get_agents_for_session() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path().to_str().unwrap().to_string();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let agent1 = create_test_agent("agent-1", "session-1");
        let agent2 = create_test_agent("agent-2", "session-1");
        let agent3 = create_test_agent("agent-3", "session-2");

        create_agent(agent1, project_path.clone()).unwrap();
        create_agent(agent2, project_path.clone()).unwrap();
        create_agent(agent3, project_path.clone()).unwrap();

        let agents = get_agents_for_session("session-1".to_string(), project_path).unwrap();
        assert_eq!(agents.len(), 2);
    }

    #[test]
    fn test_update_agent_metrics() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path().to_str().unwrap().to_string();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let agent = create_test_agent("agent-1", "session-1");
        create_agent(agent, project_path.clone()).unwrap();

        update_agent_metrics("agent-1".to_string(), 1000, 0.05, 5, project_path.clone()).unwrap();

        let retrieved = get_agent("agent-1".to_string(), project_path)
            .unwrap()
            .unwrap();
        assert_eq!(retrieved.tokens, 1000);
        assert_eq!(retrieved.cost, 0.05);
        assert_eq!(retrieved.iteration_count, 5);
    }

    #[test]
    fn test_add_and_get_agent_logs() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path().to_str().unwrap().to_string();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let agent = create_test_agent("agent-1", "session-1");
        create_agent(agent, project_path.clone()).unwrap();

        let log = LogEntry {
            timestamp: Utc::now(),
            level: LogLevel::Info,
            message: "Test log".to_string(),
        };
        add_agent_log("agent-1".to_string(), log, project_path.clone()).unwrap();

        let logs = get_agent_logs("agent-1".to_string(), project_path).unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].message, "Test log");
    }

    #[test]
    fn test_delete_agent() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path().to_str().unwrap().to_string();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let agent = create_test_agent("agent-1", "session-1");
        create_agent(agent, project_path.clone()).unwrap();

        delete_agent("agent-1".to_string(), project_path.clone()).unwrap();

        let retrieved = get_agent("agent-1".to_string(), project_path).unwrap();
        assert!(retrieved.is_none());
    }
}
