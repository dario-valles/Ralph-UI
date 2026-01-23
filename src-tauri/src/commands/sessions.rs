// Session-related Tauri commands

use crate::commands::config::ConfigState;
use crate::database::{self, Database};
use crate::events::{emit_session_status_changed, SessionStatusChangedPayload};
use crate::models::{Session, SessionConfig, SessionStatus};
use crate::session_files;
use crate::utils::{lock_db, ResultExt};
use chrono::Utc;
use tauri::State;
use uuid::Uuid;

/// Create a new session with optional configuration.
///
/// # Parameters
/// - `name`: The session name
/// - `project_path`: Path to the project directory
/// - `config`: Optional session configuration. If not provided, inherits from the current
///   merged configuration (global + project config). If the merged config is unavailable,
///   defaults are used.
///
/// # Config Inheritance
/// When `config` is `None`, the session config is derived from:
/// 1. Project-level config (`.ralph-ui/config.toml`) if it exists
/// 2. Global config (`~/.config/ralph-ui/config.toml`) if it exists
/// 3. Built-in defaults if no config files exist
///
/// # Validation
/// - `max_parallel` must be greater than 0
/// - `max_iterations` must be greater than 0
/// - `max_retries` must be non-negative (>= 0)
#[tauri::command]
pub async fn create_session(
    name: String,
    project_path: String,
    config: Option<SessionConfig>,
    db: State<'_, std::sync::Mutex<Database>>,
    config_state: State<'_, ConfigState>,
) -> Result<Session, String> {
    // Determine the session config: use explicit config, or inherit from ConfigState
    let session_config = match config {
        Some(explicit_config) => {
            log::info!(
                "[create_session] Using explicit config: max_parallel={}, max_iterations={}, max_retries={}, agent_type={:?}",
                explicit_config.max_parallel,
                explicit_config.max_iterations,
                explicit_config.max_retries,
                explicit_config.agent_type
            );
            explicit_config
        }
        None => {
            // Inherit from current merged configuration
            match config_state.get_config() {
                Ok(ralph_config) => {
                    let inherited: SessionConfig = (&ralph_config).into();
                    log::info!(
                        "[create_session] Inheriting config from RalphConfig: max_parallel={}, max_iterations={}, max_retries={}, agent_type={:?}",
                        inherited.max_parallel,
                        inherited.max_iterations,
                        inherited.max_retries,
                        inherited.agent_type
                    );
                    inherited
                }
                Err(e) => {
                    // Gracefully fall back to defaults if config loading fails
                    log::warn!(
                        "[create_session] Failed to load config, using defaults: {}",
                        e
                    );
                    SessionConfig::default()
                }
            }
        }
    };

    // Validate the config
    session_config.validate()?;

    log::info!(
        "[create_session] Final session config: max_parallel={}, max_iterations={}, max_retries={}, agent_type={:?}, auto_create_prs={}, draft_prs={}, run_tests={}, run_lint={}",
        session_config.max_parallel,
        session_config.max_iterations,
        session_config.max_retries,
        session_config.agent_type,
        session_config.auto_create_prs,
        session_config.draft_prs,
        session_config.run_tests,
        session_config.run_lint
    );

    let session = Session {
        id: Uuid::new_v4().to_string(),
        name,
        project_path: project_path.clone(),
        created_at: Utc::now(),
        last_resumed_at: None,
        status: SessionStatus::Active,
        config: session_config,
        tasks: vec![],
        total_cost: 0.0,
        total_tokens: 0,
    };

    let db = lock_db(&db)?;
    let conn = db.get_connection();

    // Use a transaction to ensure atomicity of session creation + pause other sessions
    conn.execute("BEGIN IMMEDIATE", [])
        .with_context("Failed to begin transaction")?;

    let result = (|| -> Result<(), String> {
        database::sessions::create_session(conn, &session)
            .with_context("Failed to create session")?;

        // Enforce single-active-session-per-project: pause any other active sessions
        database::sessions::pause_other_sessions_in_project(conn, &project_path, &session.id)
            .with_context("Failed to pause other sessions")?;

        Ok(())
    })();

    match result {
        Ok(()) => {
            conn.execute("COMMIT", [])
                .with_context("Failed to commit transaction")?;
        }
        Err(e) => {
            // Rollback on error
            let _ = conn.execute("ROLLBACK", []);
            return Err(e);
        }
    }

    // Export session to file immediately after creation for git tracking
    // This is outside the transaction since it's a file operation, not DB
    if let Err(e) = session_files::export_session_to_file(conn, &session.id, None) {
        log::warn!("Failed to export session to file: {}", e);
    }

    Ok(session)
}

#[tauri::command]
pub async fn get_sessions(
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Vec<Session>, String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    database::sessions::get_all_sessions(conn)
        .with_context("Failed to get sessions")
}

#[tauri::command]
pub async fn get_session(
    id: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Session, String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    database::sessions::get_session_with_tasks(conn, &id)
        .with_context("Failed to get session")
}

#[tauri::command]
pub async fn update_session(
    session: Session,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Session, String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    database::sessions::update_session(conn, &session)
        .with_context("Failed to update session")?;

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
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    // Get session to find project path before deletion
    let session = database::sessions::get_session(conn, &id)
        .with_context("Failed to get session")?;

    // Delete from database
    database::sessions::delete_session(conn, &id)
        .with_context("Failed to delete session")?;

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
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    // Get the current session to capture the old status
    let current_session = database::sessions::get_session(conn, &session_id)
        .with_context("Failed to get session")?;

    let old_status = format!("{:?}", current_session.status).to_lowercase();
    let new_status = format!("{:?}", status).to_lowercase();

    database::sessions::update_session_status(conn, &session_id, status.clone())
        .with_context("Failed to update session status")?;

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
