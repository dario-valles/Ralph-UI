// Session-related commands
// Uses file-based storage in .ralph-ui/sessions/

use crate::file_storage::index::SessionIndexEntry;
use crate::file_storage::sessions as session_storage;
use crate::models::{Session, SessionStatus};
use crate::utils::as_path;
use std::path::Path;

/// Get all sessions for a project (full session data)
/// For lightweight listing, use `get_sessions_index` instead.
pub async fn get_sessions(project_path: String) -> Result<Vec<Session>, String> {
    session_storage::list_sessions(as_path(&project_path))
}

/// Get session index entries for a project (lightweight, for listings)
/// Use this for session lists where you don't need full task details.
/// Returns: id, name, status, updated_at, task_count, completed_task_count
pub async fn get_sessions_index(project_path: String) -> Result<Vec<SessionIndexEntry>, String> {
    session_storage::list_sessions_from_index(as_path(&project_path))
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
/// Uses index for efficient listing (only needs id and status).
pub fn pause_other_sessions_in_project(
    project_path: &Path,
    except_session_id: &str,
) -> Result<(), String> {
    // Use index for efficient listing - we only need id and status
    let session_entries = session_storage::list_sessions_from_index(project_path)?;

    for entry in session_entries {
        // Index stores status as lowercase string (e.g., "active")
        if entry.id != except_session_id && entry.status == "active" {
            session_storage::update_session_status(project_path, &entry.id, SessionStatus::Paused)?;
        }
    }

    Ok(())
}
