// Tauri commands for project management

use crate::database::{Database, projects};
use crate::session_files;
use crate::utils::{lock_db, ResultExt};
use std::path::Path;
use std::sync::Mutex;
use tauri::State;

pub type DbState = Mutex<Database>;

/// Register (or get existing) project from a folder path
/// Also imports any sessions from the project's .ralph-ui/sessions/ directory
#[tauri::command]
pub fn register_project(
    db: State<DbState>,
    path: String,
    name: Option<String>,
) -> Result<projects::Project, String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    let project = projects::upsert_project(conn, &path, name.as_deref())
        .with_context("Failed to register project")?;

    // Import any sessions from the project's .ralph-ui/sessions/ directory
    // This ensures sessions saved to files are available in the database
    let project_path = Path::new(&path);
    if project_path.exists() {
        match session_files::import_sessions_from_project(conn, project_path) {
            Ok(imported) => {
                if !imported.is_empty() {
                    log::info!(
                        "Imported {} sessions from project '{}': {:?}",
                        imported.len(),
                        path,
                        imported
                    );
                }
            }
            Err(e) => {
                log::warn!("Failed to import sessions from project '{}': {}", path, e);
                // Don't fail the command - this is a secondary operation
            }
        }
    }

    Ok(project)
}

/// Get a project by ID
#[tauri::command]
pub fn get_project(
    db: State<DbState>,
    project_id: String,
) -> Result<projects::Project, String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    projects::get_project(conn, &project_id)
        .with_context("Failed to get project")
}

/// Get a project by path
#[tauri::command]
pub fn get_project_by_path(
    db: State<DbState>,
    path: String,
) -> Result<projects::Project, String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    projects::get_project_by_path(conn, &path)
        .with_context("Failed to get project by path")
}

/// Get all projects
#[tauri::command]
pub fn get_all_projects(
    db: State<DbState>,
) -> Result<Vec<projects::Project>, String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    projects::get_all_projects(conn)
        .with_context("Failed to get all projects")
}

/// Get recent projects (limited)
#[tauri::command]
pub fn get_recent_projects(
    db: State<DbState>,
    limit: Option<i32>,
) -> Result<Vec<projects::Project>, String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    projects::get_recent_projects(conn, limit.unwrap_or(5))
        .with_context("Failed to get recent projects")
}

/// Get favorite projects
#[tauri::command]
pub fn get_favorite_projects(
    db: State<DbState>,
) -> Result<Vec<projects::Project>, String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    projects::get_favorite_projects(conn)
        .with_context("Failed to get favorite projects")
}

/// Update project name
#[tauri::command]
pub fn update_project_name(
    db: State<DbState>,
    project_id: String,
    name: String,
) -> Result<(), String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    projects::update_project_name(conn, &project_id, &name)
        .with_context("Failed to update project name")
}

/// Toggle project favorite status
#[tauri::command]
pub fn toggle_project_favorite(
    db: State<DbState>,
    project_id: String,
) -> Result<bool, String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    projects::toggle_project_favorite(conn, &project_id)
        .with_context("Failed to toggle project favorite")
}

/// Set project favorite status explicitly
#[tauri::command]
pub fn set_project_favorite(
    db: State<DbState>,
    project_id: String,
    is_favorite: bool,
) -> Result<(), String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    projects::set_project_favorite(conn, &project_id, is_favorite)
        .with_context("Failed to set project favorite")
}

/// Touch project (update last_used_at)
#[tauri::command]
pub fn touch_project(
    db: State<DbState>,
    project_id: String,
) -> Result<(), String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    projects::touch_project(conn, &project_id)
        .with_context("Failed to touch project")
}

/// Delete a project
#[tauri::command]
pub fn delete_project(
    db: State<DbState>,
    project_id: String,
) -> Result<(), String> {
    let db = lock_db(&db)?;
    let conn = db.get_connection();

    projects::delete_project(conn, &project_id)
        .with_context("Failed to delete project")
}
