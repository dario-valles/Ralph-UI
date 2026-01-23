// Session-related Tauri commands
// Uses file-based storage in .ralph-ui/sessions/

use crate::commands::config::ConfigState;
use crate::events::{emit_session_status_changed, SessionStatusChangedPayload};
use crate::file_storage::sessions as session_storage;
use crate::models::{Session, SessionConfig, SessionStatus};
use crate::utils::as_path;
use chrono::Utc;
use std::path::Path;
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

    let path = as_path(&project_path);

    // Pause any other active sessions in the same project
    pause_other_sessions_in_project(path, &session.id)?;

    // Save session to file storage
    session_storage::save_session(path, &session)?;

    Ok(session)
}

/// Pause all other active sessions in a project (except the specified one)
fn pause_other_sessions_in_project(project_path: &Path, except_session_id: &str) -> Result<(), String> {
    let sessions = session_storage::list_sessions(project_path)?;

    for session in sessions {
        if session.id != except_session_id && session.status == SessionStatus::Active {
            session_storage::update_session_status(project_path, &session.id, SessionStatus::Paused)?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn get_sessions(
    project_path: String,
) -> Result<Vec<Session>, String> {
    session_storage::list_sessions(as_path(&project_path))
}

#[tauri::command]
pub async fn get_session(
    id: String,
    project_path: String,
) -> Result<Session, String> {
    session_storage::read_session(as_path(&project_path), &id)
}

#[tauri::command]
pub async fn update_session(
    session: Session,
) -> Result<Session, String> {
    session_storage::save_session(as_path(&session.project_path), &session)?;
    Ok(session)
}

#[tauri::command]
pub async fn delete_session(
    id: String,
    project_path: String,
) -> Result<(), String> {
    session_storage::delete_session(as_path(&project_path), &id)
}

#[tauri::command]
pub async fn update_session_status(
    app_handle: tauri::AppHandle,
    session_id: String,
    status: SessionStatus,
    project_path: String,
) -> Result<(), String> {
    let path = as_path(&project_path);

    // Get the current session to capture the old status
    let current_session = session_storage::read_session(path, &session_id)?;

    let old_status = format!("{:?}", current_session.status).to_lowercase();
    let new_status = format!("{:?}", status).to_lowercase();

    // Update session status
    session_storage::update_session_status(path, &session_id, status.clone())?;

    // If activating a session, pause any other active sessions in the same project
    if matches!(status, SessionStatus::Active) {
        if let Err(e) = pause_other_sessions_in_project(path, &session_id) {
            log::warn!("Failed to pause other sessions: {}", e);
        }
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
