// Tauri commands for agent management

use crate::database::Database;
use crate::events::{emit_agent_status_changed, AgentStatusChangedPayload};
use crate::models::{Agent, AgentStatus, LogEntry};
use crate::utils::lock_db;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use sysinfo::{System, Pid};
use tauri::State;

/// Create a new agent
#[tauri::command]
pub fn create_agent(
    db: State<Mutex<Database>>,
    agent: Agent,
) -> Result<(), String> {
    let db = lock_db(&db)?;
    db.create_agent(&agent)
        .map_err(|e| format!("Failed to create agent: {}", e))
}

/// Get an agent by ID
#[tauri::command]
pub fn get_agent(
    db: State<Mutex<Database>>,
    agent_id: String,
) -> Result<Option<Agent>, String> {
    let db = lock_db(&db)?;
    db.get_agent(&agent_id)
        .map_err(|e| format!("Failed to get agent: {}", e))
}

/// Get all agents for a session
#[tauri::command]
pub fn get_agents_for_session(
    db: State<Mutex<Database>>,
    session_id: String,
) -> Result<Vec<Agent>, String> {
    let db = lock_db(&db)?;
    db.get_agents_for_session(&session_id)
        .map_err(|e| format!("Failed to get agents for session: {}", e))
}

/// Get all agents for a task
#[tauri::command]
pub fn get_agents_for_task(
    db: State<Mutex<Database>>,
    task_id: String,
) -> Result<Vec<Agent>, String> {
    let db = lock_db(&db)?;
    db.get_agents_for_task(&task_id)
        .map_err(|e| format!("Failed to get agents for task: {}", e))
}

/// Get active agents for a session
#[tauri::command]
pub fn get_active_agents(
    db: State<Mutex<Database>>,
    session_id: String,
) -> Result<Vec<Agent>, String> {
    let db = lock_db(&db)?;
    db.get_active_agents(&session_id)
        .map_err(|e| format!("Failed to get active agents: {}", e))
}

/// Get ALL active agents across all sessions (for Mission Control dashboard)
#[tauri::command]
pub fn get_all_active_agents(
    db: State<Mutex<Database>>,
) -> Result<Vec<Agent>, String> {
    let db = lock_db(&db)?;
    db.get_all_active_agents()
        .map_err(|e| format!("Failed to get all active agents: {}", e))
}

/// Update agent status
#[tauri::command]
pub fn update_agent_status(
    app_handle: tauri::AppHandle,
    db: State<Mutex<Database>>,
    agent_id: String,
    status: AgentStatus,
) -> Result<(), String> {
    let db = lock_db(&db)?;

    // Get the current agent to capture old status and session_id
    let agent = db
        .get_agent(&agent_id)
        .map_err(|e| format!("Failed to get agent: {}", e))?
        .ok_or_else(|| format!("Agent not found: {}", agent_id))?;

    let old_status = format!("{:?}", agent.status).to_lowercase();
    let new_status = format!("{:?}", status).to_lowercase();

    // Update the status in the database
    db.update_agent_status(&agent_id, &status)
        .map_err(|e| format!("Failed to update agent status: {}", e))?;

    // Emit the status changed event
    let payload = AgentStatusChangedPayload {
        agent_id: agent_id.clone(),
        session_id: agent.session_id.clone(),
        old_status,
        new_status,
    };

    // Log any event emission errors but don't fail the command
    if let Err(e) = emit_agent_status_changed(&app_handle, payload) {
        log::warn!("Failed to emit agent status changed event: {}", e);
    }

    Ok(())
}

/// Update agent metrics (tokens, cost, iterations)
#[tauri::command]
pub fn update_agent_metrics(
    db: State<Mutex<Database>>,
    agent_id: String,
    tokens: i32,
    cost: f64,
    iteration_count: i32,
) -> Result<(), String> {
    let db = lock_db(&db)?;
    db.update_agent_metrics(&agent_id, tokens, cost, iteration_count)
        .map_err(|e| format!("Failed to update agent metrics: {}", e))
}

/// Update agent process ID
#[tauri::command]
pub fn update_agent_process_id(
    db: State<Mutex<Database>>,
    agent_id: String,
    process_id: Option<u32>,
) -> Result<(), String> {
    let db = lock_db(&db)?;
    db.update_agent_process_id(&agent_id, process_id)
        .map_err(|e| format!("Failed to update agent process ID: {}", e))
}

/// Delete an agent
#[tauri::command]
pub fn delete_agent(
    db: State<Mutex<Database>>,
    agent_id: String,
) -> Result<(), String> {
    let db = lock_db(&db)?;
    db.delete_agent(&agent_id)
        .map_err(|e| format!("Failed to delete agent: {}", e))
}

/// Add a log entry for an agent
#[tauri::command]
pub fn add_agent_log(
    db: State<Mutex<Database>>,
    agent_id: String,
    log: LogEntry,
) -> Result<(), String> {
    let db = lock_db(&db)?;
    db.add_log(&agent_id, &log)
        .map_err(|e| format!("Failed to add log: {}", e))
}

/// Get all logs for an agent
#[tauri::command]
pub fn get_agent_logs(
    db: State<Mutex<Database>>,
    agent_id: String,
) -> Result<Vec<LogEntry>, String> {
    let db = lock_db(&db)?;
    db.get_logs_for_agent(&agent_id)
        .map_err(|e| format!("Failed to get logs: {}", e))
}

/// Result of cleaning up stale agents
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaleAgentCleanupResult {
    pub agent_id: String,
    pub session_id: String,
    pub process_id: Option<u32>,
    pub was_zombie: bool,
}

/// Cleanup stale agents whose processes are no longer running
/// This is useful after app restart when the scheduler is not initialized
/// but agents in the database are still marked as active.
#[tauri::command]
pub fn cleanup_stale_agents(
    app_handle: tauri::AppHandle,
    db: State<Mutex<Database>>,
) -> Result<Vec<StaleAgentCleanupResult>, String> {
    log::info!("[Agents] cleanup_stale_agents called");

    let db = lock_db(&db)?;

    // Get all active agents
    let active_agents = db.get_all_active_agents()
        .map_err(|e| format!("Failed to get active agents: {}", e))?;

    if active_agents.is_empty() {
        log::debug!("[Agents] No active agents to cleanup");
        return Ok(vec![]);
    }

    log::info!("[Agents] Found {} active agents to check", active_agents.len());

    // Initialize sysinfo to check processes
    let mut system = System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut cleaned_up = Vec::new();

    for agent in active_agents {
        let should_cleanup = match agent.process_id {
            Some(pid) => {
                // Check if process is still running
                let process = system.process(Pid::from_u32(pid));
                let is_alive = process.map(|p| {
                    !matches!(p.status(), sysinfo::ProcessStatus::Zombie)
                        && p.status() != sysinfo::ProcessStatus::Dead
                }).unwrap_or(false);

                if !is_alive {
                    log::info!("[Agents] Agent {} (PID {}) process is not running", agent.id, pid);
                    true
                } else {
                    log::debug!("[Agents] Agent {} (PID {}) is still running", agent.id, pid);
                    false
                }
            }
            None => {
                // No process ID means the agent was never properly started or is stale
                log::info!("[Agents] Agent {} has no process ID, marking as stale", agent.id);
                true
            }
        };

        if should_cleanup {
            // Update agent status to idle
            if let Err(e) = db.update_agent_status(&agent.id, &AgentStatus::Idle) {
                log::error!("[Agents] Failed to update agent {} status: {}", agent.id, e);
                continue;
            }

            // Emit status changed event
            let payload = AgentStatusChangedPayload {
                agent_id: agent.id.clone(),
                session_id: agent.session_id.clone(),
                old_status: format!("{:?}", agent.status).to_lowercase(),
                new_status: "idle".to_string(),
            };
            let _ = emit_agent_status_changed(&app_handle, payload);

            cleaned_up.push(StaleAgentCleanupResult {
                agent_id: agent.id,
                session_id: agent.session_id,
                process_id: agent.process_id,
                was_zombie: agent.process_id.is_some(),
            });
        }
    }

    log::info!("[Agents] Cleaned up {} stale agents", cleaned_up.len());
    Ok(cleaned_up)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use crate::models::{AgentType, SessionConfig, SessionStatus, Session, Task, TaskStatus, LogLevel};
    use chrono::Utc;
    use std::sync::Mutex;
    use uuid::Uuid;

    fn create_test_db() -> Mutex<Database> {
        let db = Database::new(":memory:").unwrap();
        db.init().unwrap();

        // Create a test session
        let session = Session {
            id: "test-session".to_string(),
            name: "Test Session".to_string(),
            project_path: "/tmp/test".to_string(),
            created_at: Utc::now(),
            last_resumed_at: None,
            status: SessionStatus::Active,
            config: SessionConfig {
                max_parallel: 1,
                max_iterations: 10,
                max_retries: 3,
                agent_type: AgentType::Claude,
                auto_create_prs: false,
                draft_prs: false,
                run_tests: false,
                run_lint: false,
            },
            tasks: Vec::new(),
            total_cost: 0.0,
            total_tokens: 0,
        };
        crate::database::sessions::create_session(db.get_connection(), &session).unwrap();

        // Create a test task
        let task = Task {
            id: "test-task".to_string(),
            title: "Test Task".to_string(),
            description: "A test task".to_string(),
            status: TaskStatus::Pending,
            priority: 1,
            dependencies: Vec::new(),
            assigned_agent: None,
            estimated_tokens: None,
            actual_tokens: None,
            started_at: None,
            completed_at: None,
            branch: None,
            worktree_path: None,
            error: None,
        };
        crate::database::tasks::create_task(db.get_connection(), "test-session", &task).unwrap();

        Mutex::new(db)
    }

    fn create_test_agent() -> Agent {
        Agent {
            id: Uuid::new_v4().to_string(),
            session_id: "test-session".to_string(),
            task_id: "test-task".to_string(),
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
    fn test_create_agent_command() {
        let db = create_test_db();
        let agent = create_test_agent();
        let agent_id = agent.id.clone();

        let db_lock = db.lock().unwrap();
        let result = db_lock.create_agent(&agent);
        assert!(result.is_ok());

        let retrieved = db_lock.get_agent(&agent_id).unwrap();
        assert!(retrieved.is_some());
    }

    #[test]
    fn test_get_agents_for_session_command() {
        let db = create_test_db();
        let agent = create_test_agent();

        {
            let db_lock = db.lock().unwrap();
            db_lock.create_agent(&agent).unwrap();
            let agents = db_lock.get_agents_for_session("test-session").unwrap();
            assert_eq!(agents.len(), 1);
        }
    }

    #[test]
    fn test_update_agent_status_command() {
        let db = create_test_db();
        let agent = create_test_agent();
        let agent_id = agent.id.clone();

        {
            let db_lock = db.lock().unwrap();
            db_lock.create_agent(&agent).unwrap();
            let result = db_lock.update_agent_status(&agent_id, &AgentStatus::Thinking);
            assert!(result.is_ok());

            let updated = db_lock.get_agent(&agent_id).unwrap().unwrap();
            assert_eq!(updated.status, AgentStatus::Thinking);
        }
    }

    #[test]
    fn test_update_agent_metrics_command() {
        let db = create_test_db();
        let agent = create_test_agent();
        let agent_id = agent.id.clone();

        {
            let db_lock = db.lock().unwrap();
            db_lock.create_agent(&agent).unwrap();
            let result = db_lock.update_agent_metrics(&agent_id, 1000, 0.05, 5);
            assert!(result.is_ok());

            let updated = db_lock.get_agent(&agent_id).unwrap().unwrap();
            assert_eq!(updated.tokens, 1000);
            assert_eq!(updated.cost, 0.05);
            assert_eq!(updated.iteration_count, 5);
        }
    }

    #[test]
    fn test_add_agent_log_command() {
        let db = create_test_db();
        let agent = create_test_agent();
        let agent_id = agent.id.clone();

        {
            let db_lock = db.lock().unwrap();
            db_lock.create_agent(&agent).unwrap();

            let log = LogEntry {
                timestamp: Utc::now(),
                level: LogLevel::Info,
                message: "Test log".to_string(),
            };

            let result = db_lock.add_log(&agent_id, &log);
            assert!(result.is_ok());

            let logs = db_lock.get_logs_for_agent(&agent_id).unwrap();
            assert_eq!(logs.len(), 1);
            assert_eq!(logs[0].message, "Test log");
        }
    }

    #[test]
    fn test_delete_agent_command() {
        let db = create_test_db();
        let agent = create_test_agent();
        let agent_id = agent.id.clone();

        {
            let db_lock = db.lock().unwrap();
            db_lock.create_agent(&agent).unwrap();
            let result = db_lock.delete_agent(&agent_id);
            assert!(result.is_ok());

            let retrieved = db_lock.get_agent(&agent_id).unwrap();
            assert!(retrieved.is_none());
        }
    }

    #[test]
    fn test_get_active_agents_command() {
        let db = create_test_db();

        {
            let db_lock = db.lock().unwrap();

            let mut agent1 = create_test_agent();
            agent1.status = AgentStatus::Thinking;
            db_lock.create_agent(&agent1).unwrap();

            let mut agent2 = create_test_agent();
            agent2.status = AgentStatus::Idle;
            db_lock.create_agent(&agent2).unwrap();

            let active = db_lock.get_active_agents("test-session").unwrap();
            assert_eq!(active.len(), 1);
        }
    }
}
