// Tauri commands for project management
//
// Uses file-based storage in ~/.ralph-ui/projects.json (global registry)

use crate::file_storage::projects::{self as file_projects, ApiProject};
use std::path::Path;

/// Register (or get existing) project from a folder path
/// Also imports any sessions from the project's .ralph-ui/sessions/ directory
#[tauri::command]
pub fn register_project(
    path: String,
    name: Option<String>,
) -> Result<ApiProject, String> {
    let entry = file_projects::register_project(&path, name.as_deref())?;

    // Import any sessions from the project's .ralph-ui/sessions/ directory
    // This ensures sessions saved to files are available
    let project_path = Path::new(&path);
    if project_path.exists() {
        // Initialize the .ralph-ui directory for this project
        if let Err(e) = crate::file_storage::init_ralph_ui_dir(project_path) {
            log::warn!("Failed to initialize .ralph-ui directory: {}", e);
        }

        // Note: Session import will be handled by session_files module
        // which now reads from files directly
    }

    Ok(entry.to_api_project())
}

/// Get a project by ID
#[tauri::command]
pub fn get_project(
    project_id: String,
) -> Result<ApiProject, String> {
    file_projects::get_project(&project_id)?
        .map(|e| e.to_api_project())
        .ok_or_else(|| format!("Project not found: {}", project_id))
}

/// Get a project by path
#[tauri::command]
pub fn get_project_by_path(
    path: String,
) -> Result<ApiProject, String> {
    file_projects::get_project_by_path(&path)?
        .map(|e| e.to_api_project())
        .ok_or_else(|| format!("Project not found for path: {}", path))
}

/// Get all projects
#[tauri::command]
pub fn get_all_projects() -> Result<Vec<ApiProject>, String> {
    let entries = file_projects::get_all_projects()?;
    Ok(entries.into_iter().map(|e| e.to_api_project()).collect())
}

/// Get recent projects (limited)
#[tauri::command]
pub fn get_recent_projects(
    limit: Option<i32>,
) -> Result<Vec<ApiProject>, String> {
    let entries = file_projects::get_recent_projects(limit.unwrap_or(5) as usize)?;
    Ok(entries.into_iter().map(|e| e.to_api_project()).collect())
}

/// Get favorite projects
#[tauri::command]
pub fn get_favorite_projects() -> Result<Vec<ApiProject>, String> {
    let entries = file_projects::get_favorite_projects()?;
    Ok(entries.into_iter().map(|e| e.to_api_project()).collect())
}

/// Update project name
#[tauri::command]
pub fn update_project_name(
    project_id: String,
    name: String,
) -> Result<(), String> {
    file_projects::update_project_name(&project_id, &name)
}

/// Toggle project favorite status
#[tauri::command]
pub fn toggle_project_favorite(
    project_id: String,
) -> Result<bool, String> {
    file_projects::toggle_project_favorite(&project_id)
}

/// Set project favorite status explicitly
#[tauri::command]
pub fn set_project_favorite(
    project_id: String,
    is_favorite: bool,
) -> Result<(), String> {
    file_projects::set_project_favorite(&project_id, is_favorite)
}

/// Touch project (update last_used_at)
#[tauri::command]
pub fn touch_project(
    project_id: String,
) -> Result<(), String> {
    file_projects::touch_project(&project_id)
}

/// Delete a project
#[tauri::command]
pub fn delete_project(
    project_id: String,
) -> Result<(), String> {
    file_projects::delete_project(&project_id)
}
