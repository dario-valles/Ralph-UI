// Session-related commands
// Uses file-based storage in .ralph-ui/sessions/

use crate::file_storage::sessions as session_storage;
use crate::models::{Session, SessionStatus};
use crate::utils::as_path;
use std::path::Path;

/// Get all sessions for a project
pub async fn get_sessions(project_path: String) -> Result<Vec<Session>, String> {
    session_storage::list_sessions(as_path(&project_path))
}

/// Get a specific session by ID
pub async fn get_session(id: String, project_path: String) -> Result<Session, String> {
    session_storage::read_session(as_path(&project_path), &id)
}

/// Update a session (save to storage)
pub async fn update_session(session: Session) -> Result<Session, String> {
    session_storage::save_session(as_path(&session.project_path), &session)?;
    Ok(session)
}

/// Delete a session
pub async fn delete_session(id: String, project_path: String) -> Result<(), String> {
    session_storage::delete_session(as_path(&project_path), &id)
}

/// Update session status
/// Note: Event emission is handled by the proxy layer
pub fn update_session_status_internal(
    project_path: &Path,
    session_id: &str,
    status: SessionStatus,
) -> Result<(String, String), String> {
    // Get the current session to capture the old status
    let current_session = session_storage::read_session(project_path, session_id)?;

    let old_status = format!("{:?}", current_session.status).to_lowercase();
    let new_status = format!("{:?}", status).to_lowercase();

    // Update session status
    session_storage::update_session_status(project_path, session_id, status.clone())?;

    // If activating a session, pause any other active sessions in the same project
    if matches!(status, SessionStatus::Active) {
        if let Err(e) = pause_other_sessions_in_project(project_path, session_id) {
            log::warn!("Failed to pause other sessions: {}", e);
        }
    }

    Ok((old_status, new_status))
}

/// Pause all other active sessions in a project (except the specified one)
pub fn pause_other_sessions_in_project(
    project_path: &Path,
    except_session_id: &str,
) -> Result<(), String> {
    let sessions = session_storage::list_sessions(project_path)?;

    for session in sessions {
        if session.id != except_session_id && session.status == SessionStatus::Active {
            session_storage::update_session_status(project_path, &session.id, SessionStatus::Paused)?;
        }
    }

    Ok(())
}
