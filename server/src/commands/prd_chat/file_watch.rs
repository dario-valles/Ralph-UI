// PRD Chat file watching and plan content operations

use crate::file_storage::chat_ops;
use crate::utils::as_path;
use crate::PrdFileWatcherState;
use serde::{Deserialize, Serialize};

// ============================================================================
// Response Types
// ============================================================================

/// Response for starting a file watch
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchFileResponse {
    pub success: bool,
    pub path: String,
    pub initial_content: Option<String>,
    pub error: Option<String>,
}

// ============================================================================
// File Watch Commands
// ============================================================================

/// Start watching a PRD plan file for changes
pub async fn start_watching_prd_file(
    session_id: String,
    project_path: String,
    watcher_state: &PrdFileWatcherState,
) -> Result<WatchFileResponse, String> {
    let project_path_obj = as_path(&project_path);

    // Get the session to determine the title for file naming
    let session = chat_ops::get_chat_session(project_path_obj, &session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    // Calculate the plan file path
    let plan_path = crate::watchers::get_prd_plan_file_path(
        &project_path,
        &session_id,
        session.title.as_deref(),
        session.prd_id.as_deref(),
    );

    // Get the watcher manager and start watching
    let manager = watcher_state
        .manager
        .lock()
        .map_err(|e| format!("Failed to lock watcher manager: {}", e))?;

    if let Some(ref manager) = *manager {
        let result = manager.watch_file(&session_id, &plan_path);
        Ok(WatchFileResponse {
            success: result.success,
            path: result.path,
            initial_content: result.initial_content,
            error: result.error,
        })
    } else {
        Err("Watcher manager not initialized".to_string())
    }
}

/// Stop watching a PRD plan file
pub async fn stop_watching_prd_file(
    session_id: String,
    watcher_state: &PrdFileWatcherState,
) -> Result<bool, String> {
    let manager = watcher_state
        .manager
        .lock()
        .map_err(|e| format!("Failed to lock watcher manager: {}", e))?;

    if let Some(ref manager) = *manager {
        Ok(manager.unwatch_file(&session_id))
    } else {
        Err("Watcher manager not initialized".to_string())
    }
}

/// Get the current content of a PRD plan file
pub async fn get_prd_plan_content(
    session_id: String,
    project_path: String,
) -> Result<Option<String>, String> {
    let project_path_obj = as_path(&project_path);

    // Get the session to determine the title for file naming
    let session = chat_ops::get_chat_session(project_path_obj, &session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    // Calculate the plan file path
    let plan_path = crate::watchers::get_prd_plan_file_path(
        &project_path,
        &session_id,
        session.title.as_deref(),
        session.prd_id.as_deref(),
    );

    // Read the file content if it exists
    if plan_path.exists() {
        match std::fs::read_to_string(&plan_path) {
            Ok(content) => Ok(Some(content)),
            Err(e) => {
                log::warn!("Failed to read PRD plan file: {}", e);
                Ok(None)
            }
        }
    } else {
        Ok(None)
    }
}
