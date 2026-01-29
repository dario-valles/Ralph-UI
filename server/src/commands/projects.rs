// Backend commands for project management
//
// Uses file-based storage in ~/.ralph-ui/projects.json (global registry)

use crate::file_storage::projects::{self as file_projects, ApiFolder, ApiProject};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Directory entry for remote folder browsing
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub is_hidden: bool,
}

/// List directory contents for remote folder browsing
/// Only returns directories (not files) for project selection
pub fn list_directory(path: Option<String>) -> Result<Vec<DirectoryEntry>, String> {
    // Default to home directory if no path provided
    let dir_path = match path {
        Some(p) if !p.is_empty() => std::path::PathBuf::from(p),
        _ => dirs::home_dir().ok_or_else(|| "Could not determine home directory".to_string())?,
    };

    // Check if path exists and is a directory
    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", dir_path.display()));
    }
    if !dir_path.is_dir() {
        return Err(format!("Path is not a directory: {}", dir_path.display()));
    }

    // Read directory entries
    let entries =
        std::fs::read_dir(&dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut results: Vec<DirectoryEntry> = entries
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let path = entry.path();

            // Only include directories
            if !path.is_dir() {
                return None;
            }

            let name = entry.file_name().to_string_lossy().to_string();
            let is_hidden = name.starts_with('.');

            Some(DirectoryEntry {
                name,
                path: path.to_string_lossy().to_string(),
                is_directory: true,
                is_hidden,
            })
        })
        .collect();

    // Sort: non-hidden first, then alphabetically
    results.sort_by(|a, b| match (a.is_hidden, b.is_hidden) {
        (true, false) => std::cmp::Ordering::Greater,
        (false, true) => std::cmp::Ordering::Less,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(results)
}

/// Get the home directory path
pub fn get_home_directory() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Could not determine home directory".to_string())
}

/// Register (or get existing) project from a folder path
/// Also imports any sessions from the project's .ralph-ui/sessions/ directory
pub fn register_project(path: String, name: Option<String>) -> Result<ApiProject, String> {
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

/// Register a project and assign it to a folder
pub async fn register_project_with_folder(
    path: String,
    name: Option<String>,
    folder_id: Option<String>,
) -> Result<ApiProject, String> {
    let entry = file_projects::register_project(&path, name.as_deref())?;

    // Assign to folder if specified
    if let Some(fid) = &folder_id {
        file_projects::assign_project_to_folder(&entry.id, Some(fid))?;
    }

    // Import any sessions from the project's .ralph-ui/sessions/ directory
    let project_path = Path::new(&path);
    if project_path.exists() {
        if let Err(e) = crate::file_storage::init_ralph_ui_dir(project_path) {
            log::warn!("Failed to initialize .ralph-ui directory: {}", e);
        }
    }

    // Get the updated project (now with folder_id if assigned)
    let updated = file_projects::get_project(&entry.id)?
        .ok_or_else(|| format!("Project disappeared after registration: {}", entry.id))?;

    Ok(updated.to_api_project())
}

/// Get a project by ID
pub fn get_project(project_id: String) -> Result<ApiProject, String> {
    file_projects::get_project(&project_id)?
        .map(|e| e.to_api_project())
        .ok_or_else(|| format!("Project not found: {}", project_id))
}

/// Get a project by path
pub fn get_project_by_path(path: String) -> Result<ApiProject, String> {
    file_projects::get_project_by_path(&path)?
        .map(|e| e.to_api_project())
        .ok_or_else(|| format!("Project not found for path: {}", path))
}

/// Get all projects
pub fn get_all_projects() -> Result<Vec<ApiProject>, String> {
    let entries = file_projects::get_all_projects()?;
    Ok(entries.into_iter().map(|e| e.to_api_project()).collect())
}

/// Get recent projects (limited)
pub fn get_recent_projects(limit: Option<i32>) -> Result<Vec<ApiProject>, String> {
    let entries = file_projects::get_recent_projects(limit.unwrap_or(5) as usize)?;
    Ok(entries.into_iter().map(|e| e.to_api_project()).collect())
}

/// Get favorite projects
pub fn get_favorite_projects() -> Result<Vec<ApiProject>, String> {
    let entries = file_projects::get_favorite_projects()?;
    Ok(entries.into_iter().map(|e| e.to_api_project()).collect())
}

/// Update project name
pub fn update_project_name(project_id: String, name: String) -> Result<(), String> {
    file_projects::update_project_name(&project_id, &name)
}

/// Toggle project favorite status
pub fn toggle_project_favorite(project_id: String) -> Result<bool, String> {
    file_projects::toggle_project_favorite(&project_id)
}

/// Set project favorite status explicitly
pub fn set_project_favorite(project_id: String, is_favorite: bool) -> Result<(), String> {
    file_projects::set_project_favorite(&project_id, is_favorite)
}

/// Touch project (update last_used_at)
pub fn touch_project(project_id: String) -> Result<(), String> {
    file_projects::touch_project(&project_id)
}

/// Delete a project
pub fn delete_project(project_id: String) -> Result<(), String> {
    file_projects::delete_project(&project_id)
}

/// Create a new folder
pub fn create_folder(name: String) -> Result<ApiFolder, String> {
    let folder = file_projects::create_folder(&name)?;
    Ok(folder.to_api_folder())
}

/// Get all folders
pub fn get_all_folders() -> Result<Vec<ApiFolder>, String> {
    let folders = file_projects::get_all_folders()?;
    Ok(folders.into_iter().map(|f| f.to_api_folder()).collect())
}

/// Assign a project to a folder (or unassign by passing null)
pub fn assign_project_to_folder(
    project_id: String,
    folder_id: Option<String>,
) -> Result<(), String> {
    file_projects::assign_project_to_folder(&project_id, folder_id.as_deref())
}

/// Create a new filesystem directory
/// This creates an actual directory on the filesystem, not a project folder category
pub fn create_filesystem_directory(path: String) -> Result<DirectoryEntry, String> {
    let dir_path = std::path::PathBuf::from(&path);

    // Validate the path doesn't already exist
    if dir_path.exists() {
        return Err(format!("Path already exists: {}", path));
    }

    // Validate the parent directory exists
    if let Some(parent) = dir_path.parent() {
        if !parent.exists() {
            return Err(format!(
                "Parent directory does not exist: {}",
                parent.display()
            ));
        }
        if !parent.is_dir() {
            return Err(format!(
                "Parent path is not a directory: {}",
                parent.display()
            ));
        }
    } else {
        return Err("Invalid path: no parent directory".to_string());
    }

    // Extract the directory name for validation
    let name = dir_path
        .file_name()
        .ok_or_else(|| "Invalid path: no directory name".to_string())?
        .to_string_lossy()
        .to_string();

    // Validate the name doesn't contain path separators
    if name.contains('/') || name.contains('\\') {
        return Err("Directory name cannot contain path separators".to_string());
    }

    // Create the directory
    std::fs::create_dir(&dir_path).map_err(|e| format!("Failed to create directory: {}", e))?;

    let is_hidden = name.starts_with('.');

    Ok(DirectoryEntry {
        name,
        path,
        is_directory: true,
        is_hidden,
    })
}
