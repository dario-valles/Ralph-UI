// Session-related Tauri commands

use crate::database::{self, Database};
use crate::models::{AgentType, Session, SessionConfig, SessionStatus};
use chrono::Utc;
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
        project_path,
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

    Ok(session)
}

#[tauri::command]
pub async fn delete_session(
    id: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    database::sessions::delete_session(conn, &id)
        .map_err(|e| format!("Failed to delete session: {}", e))
}

#[tauri::command]
pub async fn update_session_status(
    session_id: String,
    status: SessionStatus,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    database::sessions::update_session_status(conn, &session_id, status)
        .map_err(|e| format!("Failed to update session status: {}", e))
}
