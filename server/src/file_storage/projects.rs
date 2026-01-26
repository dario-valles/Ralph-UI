//! Global projects registry
//!
//! Stores the cross-workspace project list in `~/.ralph-ui/projects.json`
//! This file is user-specific and not tracked in git.

use super::{ensure_dir, get_global_ralph_ui_dir, read_json, write_json, FileResult};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// Version of the projects registry format
const PROJECTS_FILE_VERSION: u32 = 1;

/// Global projects registry file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectsRegistry {
    /// File format version
    pub version: u32,
    /// When this registry was last updated
    pub updated_at: DateTime<Utc>,
    /// Registered projects
    pub projects: Vec<ProjectEntry>,
}

impl Default for ProjectsRegistry {
    fn default() -> Self {
        Self {
            version: PROJECTS_FILE_VERSION,
            updated_at: Utc::now(),
            projects: Vec::new(),
        }
    }
}

/// A project entry in the registry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectEntry {
    /// Unique project ID
    pub id: String,
    /// Absolute path to the project
    pub path: String,
    /// Display name for the project
    pub name: String,
    /// When the project was last used
    pub last_used_at: DateTime<Utc>,
    /// Whether this project is marked as favorite
    pub is_favorite: bool,
    /// When the project was first registered
    pub created_at: DateTime<Utc>,
}

impl ProjectEntry {
    /// Create a new project entry
    pub fn new(path: &str, name: Option<&str>) -> Self {
        let derived_name = name.unwrap_or_else(|| path.split(['/', '\\']).last().unwrap_or(path));

        let id = format!(
            "proj_{}",
            &Uuid::new_v4().to_string().replace("-", "")[..12]
        );

        let now = Utc::now();

        Self {
            id,
            path: path.to_string(),
            name: derived_name.to_string(),
            last_used_at: now,
            is_favorite: false,
            created_at: now,
        }
    }

    /// Convert to API-compatible Project format (with RFC3339 strings)
    pub fn to_api_project(&self) -> ApiProject {
        ApiProject {
            id: self.id.clone(),
            path: self.path.clone(),
            name: self.name.clone(),
            last_used_at: self.last_used_at.to_rfc3339(),
            is_favorite: self.is_favorite,
            created_at: self.created_at.to_rfc3339(),
        }
    }
}

/// API-compatible Project format (matches frontend expectations)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiProject {
    pub id: String,
    pub path: String,
    pub name: String,
    pub last_used_at: String,
    pub is_favorite: bool,
    pub created_at: String,
}

/// Get the path to the global projects registry file
pub fn get_projects_file_path() -> PathBuf {
    get_global_ralph_ui_dir().join("projects.json")
}

/// Get the path to the projects registry file in a specific directory
fn get_projects_file_path_in(base_dir: &Path) -> PathBuf {
    base_dir.join("projects.json")
}

/// Read the global projects registry
pub fn read_projects_registry() -> FileResult<ProjectsRegistry> {
    read_projects_registry_from(&get_global_ralph_ui_dir())
}

/// Read projects registry from a specific directory
fn read_projects_registry_from(base_dir: &Path) -> FileResult<ProjectsRegistry> {
    let file_path = get_projects_file_path_in(base_dir);

    if !file_path.exists() {
        return Ok(ProjectsRegistry::default());
    }

    read_json(&file_path)
}

/// Write the global projects registry
pub fn write_projects_registry(registry: &ProjectsRegistry) -> FileResult<()> {
    write_projects_registry_to(&get_global_ralph_ui_dir(), registry)
}

/// Write projects registry to a specific directory
fn write_projects_registry_to(base_dir: &Path, registry: &ProjectsRegistry) -> FileResult<()> {
    ensure_dir(base_dir)?;
    let file_path = get_projects_file_path_in(base_dir);
    write_json(&file_path, registry)
}

/// Register a project (upsert - update last_used_at if exists, create if not)
pub fn register_project(path: &str, name: Option<&str>) -> FileResult<ProjectEntry> {
    register_project_in(&get_global_ralph_ui_dir(), path, name)
}

/// Register a project in a specific directory (for testing)
fn register_project_in(
    base_dir: &Path,
    path: &str,
    name: Option<&str>,
) -> FileResult<ProjectEntry> {
    let mut registry = read_projects_registry_from(base_dir)?;

    // Check if project with this path already exists
    if let Some(project) = registry.projects.iter_mut().find(|p| p.path == path) {
        // Update last_used_at
        project.last_used_at = Utc::now();
        if let Some(new_name) = name {
            project.name = new_name.to_string();
        }
        let updated_project = project.clone();

        registry.updated_at = Utc::now();
        write_projects_registry_to(base_dir, &registry)?;

        return Ok(updated_project);
    }

    // Create new project entry
    let project = ProjectEntry::new(path, name);
    let result = project.clone();

    registry.projects.push(project);
    registry.updated_at = Utc::now();
    write_projects_registry_to(base_dir, &registry)?;

    Ok(result)
}

/// Get a project by ID
pub fn get_project(project_id: &str) -> FileResult<Option<ProjectEntry>> {
    get_project_in(&get_global_ralph_ui_dir(), project_id)
}

/// Get a project by ID from a specific directory
fn get_project_in(base_dir: &Path, project_id: &str) -> FileResult<Option<ProjectEntry>> {
    let registry = read_projects_registry_from(base_dir)?;
    Ok(registry.projects.into_iter().find(|p| p.id == project_id))
}

/// Get a project by path
pub fn get_project_by_path(path: &str) -> FileResult<Option<ProjectEntry>> {
    get_project_by_path_in(&get_global_ralph_ui_dir(), path)
}

/// Get a project by path from a specific directory
fn get_project_by_path_in(base_dir: &Path, path: &str) -> FileResult<Option<ProjectEntry>> {
    let registry = read_projects_registry_from(base_dir)?;
    Ok(registry.projects.into_iter().find(|p| p.path == path))
}

/// Get all projects sorted by last_used_at descending
pub fn get_all_projects() -> FileResult<Vec<ProjectEntry>> {
    get_all_projects_in(&get_global_ralph_ui_dir())
}

/// Get all projects from a specific directory
fn get_all_projects_in(base_dir: &Path) -> FileResult<Vec<ProjectEntry>> {
    let registry = read_projects_registry_from(base_dir)?;
    let mut projects = registry.projects;
    projects.sort_by(|a, b| b.last_used_at.cmp(&a.last_used_at));
    Ok(projects)
}

/// Get recent projects (limited)
pub fn get_recent_projects(limit: usize) -> FileResult<Vec<ProjectEntry>> {
    let mut projects = get_all_projects()?;
    projects.truncate(limit);
    Ok(projects)
}

/// Get recent projects from a specific directory
#[allow(dead_code)]
fn get_recent_projects_in(base_dir: &Path, limit: usize) -> FileResult<Vec<ProjectEntry>> {
    let mut projects = get_all_projects_in(base_dir)?;
    projects.truncate(limit);
    Ok(projects)
}

/// Get favorite projects
pub fn get_favorite_projects() -> FileResult<Vec<ProjectEntry>> {
    get_favorite_projects_in(&get_global_ralph_ui_dir())
}

/// Get favorite projects from a specific directory
fn get_favorite_projects_in(base_dir: &Path) -> FileResult<Vec<ProjectEntry>> {
    let registry = read_projects_registry_from(base_dir)?;
    let mut favorites: Vec<_> = registry
        .projects
        .into_iter()
        .filter(|p| p.is_favorite)
        .collect();
    favorites.sort_by(|a, b| b.last_used_at.cmp(&a.last_used_at));
    Ok(favorites)
}

/// Update project name
pub fn update_project_name(project_id: &str, name: &str) -> FileResult<()> {
    update_project_name_in(&get_global_ralph_ui_dir(), project_id, name)
}

/// Update project name in a specific directory
fn update_project_name_in(base_dir: &Path, project_id: &str, name: &str) -> FileResult<()> {
    let mut registry = read_projects_registry_from(base_dir)?;

    if let Some(project) = registry.projects.iter_mut().find(|p| p.id == project_id) {
        project.name = name.to_string();
        registry.updated_at = Utc::now();
        write_projects_registry_to(base_dir, &registry)?;
    }

    Ok(())
}

/// Toggle project favorite status
pub fn toggle_project_favorite(project_id: &str) -> FileResult<bool> {
    toggle_project_favorite_in(&get_global_ralph_ui_dir(), project_id)
}

/// Toggle project favorite status in a specific directory
fn toggle_project_favorite_in(base_dir: &Path, project_id: &str) -> FileResult<bool> {
    let mut registry = read_projects_registry_from(base_dir)?;

    if let Some(project) = registry.projects.iter_mut().find(|p| p.id == project_id) {
        project.is_favorite = !project.is_favorite;
        let new_status = project.is_favorite;
        registry.updated_at = Utc::now();
        write_projects_registry_to(base_dir, &registry)?;
        return Ok(new_status);
    }

    Err(format!("Project not found: {}", project_id))
}

/// Set project favorite status explicitly
pub fn set_project_favorite(project_id: &str, is_favorite: bool) -> FileResult<()> {
    set_project_favorite_in(&get_global_ralph_ui_dir(), project_id, is_favorite)
}

/// Set project favorite status in a specific directory
fn set_project_favorite_in(base_dir: &Path, project_id: &str, is_favorite: bool) -> FileResult<()> {
    let mut registry = read_projects_registry_from(base_dir)?;

    if let Some(project) = registry.projects.iter_mut().find(|p| p.id == project_id) {
        project.is_favorite = is_favorite;
        registry.updated_at = Utc::now();
        write_projects_registry_to(base_dir, &registry)?;
    }

    Ok(())
}

/// Touch project (update last_used_at)
pub fn touch_project(project_id: &str) -> FileResult<()> {
    touch_project_in(&get_global_ralph_ui_dir(), project_id)
}

/// Touch project in a specific directory
fn touch_project_in(base_dir: &Path, project_id: &str) -> FileResult<()> {
    let mut registry = read_projects_registry_from(base_dir)?;

    if let Some(project) = registry.projects.iter_mut().find(|p| p.id == project_id) {
        project.last_used_at = Utc::now();
        registry.updated_at = Utc::now();
        write_projects_registry_to(base_dir, &registry)?;
    }

    Ok(())
}

/// Delete a project from the registry
pub fn delete_project(project_id: &str) -> FileResult<()> {
    delete_project_in(&get_global_ralph_ui_dir(), project_id)
}

/// Delete a project from a specific directory
fn delete_project_in(base_dir: &Path, project_id: &str) -> FileResult<()> {
    let mut registry = read_projects_registry_from(base_dir)?;
    let initial_len = registry.projects.len();

    registry.projects.retain(|p| p.id != project_id);

    if registry.projects.len() != initial_len {
        registry.updated_at = Utc::now();
        write_projects_registry_to(base_dir, &registry)?;
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_register_new_project() {
        let temp_dir = TempDir::new().unwrap();
        let project = register_project_in(temp_dir.path(), "/test/my-project", None).unwrap();

        assert!(!project.id.is_empty());
        assert_eq!(project.path, "/test/my-project");
        assert_eq!(project.name, "my-project");
        assert!(!project.is_favorite);
    }

    #[test]
    fn test_register_project_with_name() {
        let temp_dir = TempDir::new().unwrap();
        let project =
            register_project_in(temp_dir.path(), "/test/my-project", Some("My Custom Name"))
                .unwrap();

        assert_eq!(project.name, "My Custom Name");
    }

    #[test]
    fn test_register_existing_project() {
        let temp_dir = TempDir::new().unwrap();
        let project1 = register_project_in(temp_dir.path(), "/test/my-project", None).unwrap();
        let project2 = register_project_in(temp_dir.path(), "/test/my-project", None).unwrap();

        // Should have same ID (upsert behavior)
        assert_eq!(project1.id, project2.id);
        // last_used_at should be updated
        assert!(project2.last_used_at >= project1.last_used_at);
    }

    #[test]
    fn test_get_project() {
        let temp_dir = TempDir::new().unwrap();
        let project = register_project_in(temp_dir.path(), "/test/my-project", None).unwrap();

        let found = get_project_in(temp_dir.path(), &project.id).unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().path, "/test/my-project");

        let not_found = get_project_in(temp_dir.path(), "nonexistent").unwrap();
        assert!(not_found.is_none());
    }

    #[test]
    fn test_get_project_by_path() {
        let temp_dir = TempDir::new().unwrap();
        register_project_in(temp_dir.path(), "/test/my-project", None).unwrap();

        let found = get_project_by_path_in(temp_dir.path(), "/test/my-project").unwrap();
        assert!(found.is_some());

        let not_found = get_project_by_path_in(temp_dir.path(), "/nonexistent").unwrap();
        assert!(not_found.is_none());
    }

    #[test]
    fn test_get_all_projects() {
        let temp_dir = TempDir::new().unwrap();
        register_project_in(temp_dir.path(), "/test/project1", None).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        register_project_in(temp_dir.path(), "/test/project2", None).unwrap();
        std::thread::sleep(std::time::Duration::from_millis(10));
        register_project_in(temp_dir.path(), "/test/project3", None).unwrap();

        let projects = get_all_projects_in(temp_dir.path()).unwrap();
        assert_eq!(projects.len(), 3);
        // Should be sorted by last_used_at descending
        assert_eq!(projects[0].path, "/test/project3");
    }

    #[test]
    fn test_get_recent_projects() {
        let temp_dir = TempDir::new().unwrap();
        for i in 1..=5 {
            register_project_in(temp_dir.path(), &format!("/test/project{}", i), None).unwrap();
        }

        let projects = get_recent_projects_in(temp_dir.path(), 3).unwrap();
        assert_eq!(projects.len(), 3);
    }

    #[test]
    fn test_toggle_favorite() {
        let temp_dir = TempDir::new().unwrap();
        let project = register_project_in(temp_dir.path(), "/test/my-project", None).unwrap();
        assert!(!project.is_favorite);

        let is_fav = toggle_project_favorite_in(temp_dir.path(), &project.id).unwrap();
        assert!(is_fav);

        let is_fav = toggle_project_favorite_in(temp_dir.path(), &project.id).unwrap();
        assert!(!is_fav);
    }

    #[test]
    fn test_get_favorite_projects() {
        let temp_dir = TempDir::new().unwrap();
        let p1 = register_project_in(temp_dir.path(), "/test/project1", None).unwrap();
        let _p2 = register_project_in(temp_dir.path(), "/test/project2", None).unwrap();
        let p3 = register_project_in(temp_dir.path(), "/test/project3", None).unwrap();

        set_project_favorite_in(temp_dir.path(), &p1.id, true).unwrap();
        set_project_favorite_in(temp_dir.path(), &p3.id, true).unwrap();

        let favorites = get_favorite_projects_in(temp_dir.path()).unwrap();
        assert_eq!(favorites.len(), 2);
    }

    #[test]
    fn test_update_project_name() {
        let temp_dir = TempDir::new().unwrap();
        let project = register_project_in(temp_dir.path(), "/test/my-project", None).unwrap();

        update_project_name_in(temp_dir.path(), &project.id, "New Name").unwrap();

        let updated = get_project_in(temp_dir.path(), &project.id)
            .unwrap()
            .unwrap();
        assert_eq!(updated.name, "New Name");
    }

    #[test]
    fn test_delete_project() {
        let temp_dir = TempDir::new().unwrap();
        let project = register_project_in(temp_dir.path(), "/test/my-project", None).unwrap();

        delete_project_in(temp_dir.path(), &project.id).unwrap();

        let found = get_project_in(temp_dir.path(), &project.id).unwrap();
        assert!(found.is_none());
    }

    #[test]
    fn test_touch_project() {
        let temp_dir = TempDir::new().unwrap();
        let project = register_project_in(temp_dir.path(), "/test/my-project", None).unwrap();
        let original_time = project.last_used_at;

        std::thread::sleep(std::time::Duration::from_millis(10));
        touch_project_in(temp_dir.path(), &project.id).unwrap();

        let touched = get_project_in(temp_dir.path(), &project.id)
            .unwrap()
            .unwrap();
        assert!(touched.last_used_at > original_time);
    }
}
