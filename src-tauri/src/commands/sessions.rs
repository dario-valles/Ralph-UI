// Session-related Tauri commands

use crate::database::{self, Database};
use crate::events::{emit_session_status_changed, SessionStatusChangedPayload};
use crate::models::{AgentType, Session, SessionConfig, SessionStatus};
use crate::session_files;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub async fn create_session(
    name: String,
    project_path: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Session, String> {
    let session = Session {
        id: Uuid::new_v4().to_string(),
        name,
        project_path: project_path.clone(),
        created_at: Utc::now(),
        last_resumed_at: None,
        status: SessionStatus::Active,
        config: SessionConfig {
            max_parallel: 3,
            max_iterations: 10,
            max_retries: 3,
            agent_type: AgentType::Claude,
            auto_create_prs: true,
            draft_prs: false,
            run_tests: true,
            run_lint: true,
        },
        tasks: vec![],
        total_cost: 0.0,
        total_tokens: 0,
    };

    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    database::sessions::create_session(conn, &session)
        .map_err(|e| format!("Failed to create session: {}", e))?;

    // Enforce single-active-session-per-project: pause any other active sessions
    if let Err(e) = database::sessions::pause_other_sessions_in_project(conn, &project_path, &session.id) {
        log::warn!("Failed to pause other sessions: {}", e);
    }

    // Export session to file immediately after creation for git tracking
    // This provides a safety net for all session creation paths
    if let Err(e) = session_files::export_session_to_file(conn, &session.id, None) {
        log::warn!("Failed to export session to file: {}", e);
    }

    Ok(session)
}

#[tauri::command]
pub async fn get_sessions(
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Vec<Session>, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    database::sessions::get_all_sessions(conn)
        .map_err(|e| format!("Failed to get sessions: {}", e))
}

#[tauri::command]
pub async fn get_session(
    id: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Session, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    database::sessions::get_session_with_tasks(conn, &id)
        .map_err(|e| format!("Failed to get session: {}", e))
}

#[tauri::command]
pub async fn update_session(
    session: Session,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Session, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    database::sessions::update_session(conn, &session)
        .map_err(|e| format!("Failed to update session: {}", e))?;

    // Export session to file on update (for persistence)
    if let Err(e) = session_files::export_session_to_file(conn, &session.id, None) {
        log::warn!("Failed to export session to file: {}", e);
    }

    Ok(session)
}

#[tauri::command]
pub async fn delete_session(
    id: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    // Get session to find project path before deletion
    let session = database::sessions::get_session(conn, &id)
        .map_err(|e| format!("Failed to get session: {}", e))?;

    // Delete from database
    database::sessions::delete_session(conn, &id)
        .map_err(|e| format!("Failed to delete session: {}", e))?;

    // Delete session file to prevent re-import on next startup
    let project_path = std::path::Path::new(&session.project_path);
    if let Err(e) = session_files::delete_session_file(project_path, &id) {
        log::warn!("Failed to delete session file: {}", e);
        // Don't fail the command - database deletion succeeded
    }

    Ok(())
}

#[tauri::command]
pub async fn update_session_status(
    app_handle: tauri::AppHandle,
    session_id: String,
    status: SessionStatus,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    // Get the current session to capture the old status
    let current_session = database::sessions::get_session(conn, &session_id)
        .map_err(|e| format!("Failed to get session: {}", e))?;

    let old_status = format!("{:?}", current_session.status).to_lowercase();
    let new_status = format!("{:?}", status).to_lowercase();

    database::sessions::update_session_status(conn, &session_id, status.clone())
        .map_err(|e| format!("Failed to update session status: {}", e))?;

    // If activating a session, pause any other active sessions in the same project
    if matches!(status, SessionStatus::Active) {
        if let Err(e) = database::sessions::pause_other_sessions_in_project(
            conn,
            &current_session.project_path,
            &session_id,
        ) {
            log::warn!("Failed to pause other sessions: {}", e);
        }
    }

    // Export session to file on status change (for persistence)
    // This ensures session state is saved to .ralph-ui/sessions/ for git tracking
    if let Err(e) = session_files::export_session_to_file(conn, &session_id, None) {
        log::warn!("Failed to export session to file: {}", e);
        // Don't fail the command - this is a secondary operation
    }

    // Emit the status changed event
    let payload = SessionStatusChangedPayload {
        session_id: session_id.clone(),
        old_status,
        new_status,
    };

    // Log any event emission errors but don't fail the command
    if let Err(e) = emit_session_status_changed(&app_handle, payload) {
        log::warn!("Failed to emit session status changed event: {}", e);
    }

    Ok(())
}

// ============================================================================
// Phase 6: Session Management Features
// ============================================================================

/// Export session to JSON format
#[tauri::command]
pub async fn export_session_json(
    session_id: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<String, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    let session = database::sessions::get_session_with_tasks(conn, &session_id)
        .map_err(|e| format!("Failed to get session: {}", e))?;

    serde_json::to_string_pretty(&session)
        .map_err(|e| format!("Failed to serialize session: {}", e))
}

/// Session template structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub config: SessionConfig,
    pub created_at: chrono::DateTime<Utc>,
}

/// Create a session template from an existing session
#[tauri::command]
pub async fn create_session_template(
    session_id: String,
    template_name: String,
    description: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<SessionTemplate, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    let session = database::sessions::get_session(conn, &session_id)
        .map_err(|e| format!("Failed to get session: {}", e))?;

    let template = SessionTemplate {
        id: Uuid::new_v4().to_string(),
        name: template_name,
        description,
        config: session.config,
        created_at: Utc::now(),
    };

    // Store template in database
    conn.execute(
        "INSERT INTO session_templates (id, name, description, config, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![
            template.id,
            template.name,
            template.description,
            serde_json::to_string(&template.config).unwrap_or_default(),
            template.created_at.to_rfc3339(),
        ],
    )
    .map_err(|e| format!("Failed to create template: {}", e))?;

    Ok(template)
}

/// Get all session templates
#[tauri::command]
pub async fn get_session_templates(
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Vec<SessionTemplate>, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    let mut stmt = conn
        .prepare("SELECT id, name, description, config, created_at FROM session_templates ORDER BY created_at DESC")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let templates = stmt
        .query_map([], |row| {
            let config_str: String = row.get(3)?;
            let config: SessionConfig = serde_json::from_str(&config_str)
                .unwrap_or_else(|_| SessionConfig {
                    max_parallel: 3,
                    max_iterations: 10,
                    max_retries: 3,
                    agent_type: AgentType::Claude,
                    auto_create_prs: true,
                    draft_prs: false,
                    run_tests: true,
                    run_lint: true,
                });

            let created_at: String = row.get(4)?;

            Ok(SessionTemplate {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                config,
                created_at: created_at.parse().unwrap_or_else(|_| Utc::now()),
            })
        })
        .map_err(|e| format!("Failed to query templates: {}", e))?;

    templates
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect templates: {}", e))
}

/// Create session from template
#[tauri::command]
pub async fn create_session_from_template(
    template_id: String,
    name: String,
    project_path: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Session, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    // Get template
    let template: SessionTemplate = conn
        .query_row(
            "SELECT id, name, description, config, created_at FROM session_templates WHERE id = ?1",
            rusqlite::params![template_id],
            |row| {
                let config_str: String = row.get(3)?;
                let config: SessionConfig = serde_json::from_str(&config_str)
                    .unwrap_or_else(|_| SessionConfig {
                        max_parallel: 3,
                        max_iterations: 10,
                        max_retries: 3,
                        agent_type: AgentType::Claude,
                        auto_create_prs: true,
                        draft_prs: false,
                        run_tests: true,
                        run_lint: true,
                    });

                let created_at: String = row.get(4)?;

                Ok(SessionTemplate {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    config,
                    created_at: created_at.parse().unwrap_or_else(|_| Utc::now()),
                })
            },
        )
        .map_err(|e| format!("Template not found: {}", e))?;

    // Create new session with template config
    let session = Session {
        id: Uuid::new_v4().to_string(),
        name,
        project_path: project_path.clone(),
        created_at: Utc::now(),
        last_resumed_at: None,
        status: SessionStatus::Active,
        config: template.config,
        tasks: vec![],
        total_cost: 0.0,
        total_tokens: 0,
    };

    database::sessions::create_session(conn, &session)
        .map_err(|e| format!("Failed to create session: {}", e))?;

    // Enforce single-active-session-per-project: pause any other active sessions
    if let Err(e) = database::sessions::pause_other_sessions_in_project(conn, &project_path, &session.id) {
        log::warn!("Failed to pause other sessions: {}", e);
    }

    Ok(session)
}

/// Session recovery state
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecoveryState {
    pub session_id: String,
    pub timestamp: chrono::DateTime<Utc>,
    pub active_tasks: Vec<String>,
    pub active_agents: Vec<String>,
}

/// Save session recovery state
#[tauri::command]
pub async fn save_recovery_state(
    session_id: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    // Get active tasks
    let mut task_stmt = conn
        .prepare("SELECT id FROM tasks WHERE session_id = ?1 AND (status = 'InProgress' OR status = 'Pending')")
        .map_err(|e| format!("Failed to prepare task query: {}", e))?;

    let active_tasks: Vec<String> = task_stmt
        .query_map(rusqlite::params![session_id], |row| row.get(0))
        .map_err(|e| format!("Failed to query tasks: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect tasks: {}", e))?;

    // Get active agents
    let mut agent_stmt = conn
        .prepare("SELECT id FROM agents WHERE session_id = ?1 AND status != 'idle'")
        .map_err(|e| format!("Failed to prepare agent query: {}", e))?;

    let active_agents: Vec<String> = agent_stmt
        .query_map(rusqlite::params![session_id], |row| row.get(0))
        .map_err(|e| format!("Failed to query agents: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to collect agents: {}", e))?;

    let recovery_state = SessionRecoveryState {
        session_id: session_id.clone(),
        timestamp: Utc::now(),
        active_tasks,
        active_agents,
    };

    // Save recovery state
    conn.execute(
        "INSERT OR REPLACE INTO session_recovery (session_id, timestamp, state)
         VALUES (?1, ?2, ?3)",
        rusqlite::params![
            session_id,
            recovery_state.timestamp.to_rfc3339(),
            serde_json::to_string(&recovery_state).unwrap_or_default(),
        ],
    )
    .map_err(|e| format!("Failed to save recovery state: {}", e))?;

    Ok(())
}

/// Get session recovery state
#[tauri::command]
pub async fn get_recovery_state(
    session_id: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Option<SessionRecoveryState>, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    let result = conn.query_row(
        "SELECT state FROM session_recovery WHERE session_id = ?1",
        rusqlite::params![session_id],
        |row| {
            let state_str: String = row.get(0)?;
            Ok(state_str)
        },
    );

    match result {
        Ok(state_str) => {
            let state: SessionRecoveryState = serde_json::from_str(&state_str)
                .map_err(|e| format!("Failed to deserialize recovery state: {}", e))?;
            Ok(Some(state))
        }
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(format!("Failed to get recovery state: {}", e)),
    }
}

/// Session comparison result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionComparison {
    pub session1_id: String,
    pub session2_id: String,
    pub session1_name: String,
    pub session2_name: String,
    pub tasks_completed_diff: i32,
    pub total_cost_diff: f64,
    pub total_tokens_diff: i64,
    pub config_differences: Vec<String>,
    pub performance_summary: String,
}

/// Compare two sessions
#[tauri::command]
pub async fn compare_sessions(
    session1_id: String,
    session2_id: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<SessionComparison, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    let session1 = database::sessions::get_session_with_tasks(conn, &session1_id)
        .map_err(|e| format!("Failed to get session 1: {}", e))?;

    let session2 = database::sessions::get_session_with_tasks(conn, &session2_id)
        .map_err(|e| format!("Failed to get session 2: {}", e))?;

    // Calculate completed tasks
    let tasks1_completed = session1
        .tasks
        .iter()
        .filter(|t| matches!(t.status, crate::models::TaskStatus::Completed))
        .count() as i32;

    let tasks2_completed = session2
        .tasks
        .iter()
        .filter(|t| matches!(t.status, crate::models::TaskStatus::Completed))
        .count() as i32;

    // Find config differences
    let mut config_differences = Vec::new();

    if session1.config.max_parallel != session2.config.max_parallel {
        config_differences.push(format!(
            "max_parallel: {} vs {}",
            session1.config.max_parallel, session2.config.max_parallel
        ));
    }

    if session1.config.max_iterations != session2.config.max_iterations {
        config_differences.push(format!(
            "max_iterations: {} vs {}",
            session1.config.max_iterations, session2.config.max_iterations
        ));
    }

    if session1.config.agent_type != session2.config.agent_type {
        config_differences.push(format!(
            "agent_type: {:?} vs {:?}",
            session1.config.agent_type, session2.config.agent_type
        ));
    }

    // Performance summary
    let cost_per_task1 = if tasks1_completed > 0 {
        session1.total_cost / tasks1_completed as f64
    } else {
        0.0
    };

    let cost_per_task2 = if tasks2_completed > 0 {
        session2.total_cost / tasks2_completed as f64
    } else {
        0.0
    };

    let performance_summary = format!(
        "Session 1: ${:.2}/task, Session 2: ${:.2}/task",
        cost_per_task1, cost_per_task2
    );

    Ok(SessionComparison {
        session1_id: session1.id,
        session2_id: session2.id,
        session1_name: session1.name,
        session2_name: session2.name,
        tasks_completed_diff: tasks1_completed - tasks2_completed,
        total_cost_diff: session1.total_cost - session2.total_cost,
        total_tokens_diff: (session1.total_tokens - session2.total_tokens) as i64,
        config_differences,
        performance_summary,
    })
}

/// Session analytics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionAnalytics {
    pub session_id: String,
    pub total_tasks: usize,
    pub completed_tasks: usize,
    pub failed_tasks: usize,
    pub in_progress_tasks: usize,
    pub completion_rate: f64,
    pub average_cost_per_task: f64,
    pub average_tokens_per_task: f64,
    pub total_duration_hours: f64,
}

/// Get session analytics
#[tauri::command]
pub async fn get_session_analytics(
    session_id: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<SessionAnalytics, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    let session = database::sessions::get_session_with_tasks(conn, &session_id)
        .map_err(|e| format!("Failed to get session: {}", e))?;

    let total_tasks = session.tasks.len();
    let completed_tasks = session
        .tasks
        .iter()
        .filter(|t| matches!(t.status, crate::models::TaskStatus::Completed))
        .count();

    let failed_tasks = session
        .tasks
        .iter()
        .filter(|t| matches!(t.status, crate::models::TaskStatus::Failed))
        .count();

    let in_progress_tasks = session
        .tasks
        .iter()
        .filter(|t| matches!(t.status, crate::models::TaskStatus::InProgress))
        .count();

    let completion_rate = if total_tasks > 0 {
        (completed_tasks as f64 / total_tasks as f64) * 100.0
    } else {
        0.0
    };

    let average_cost_per_task = if completed_tasks > 0 {
        session.total_cost / completed_tasks as f64
    } else {
        0.0
    };

    let average_tokens_per_task = if completed_tasks > 0 {
        session.total_tokens as f64 / completed_tasks as f64
    } else {
        0.0
    };

    let total_duration_hours = if let Some(last_resumed) = session.last_resumed_at {
        let duration = last_resumed.signed_duration_since(session.created_at);
        duration.num_seconds() as f64 / 3600.0
    } else {
        let duration = Utc::now().signed_duration_since(session.created_at);
        duration.num_seconds() as f64 / 3600.0
    };

    Ok(SessionAnalytics {
        session_id: session.id,
        total_tasks,
        completed_tasks,
        failed_tasks,
        in_progress_tasks,
        completion_rate,
        average_cost_per_task,
        average_tokens_per_task,
        total_duration_hours,
    })
}
