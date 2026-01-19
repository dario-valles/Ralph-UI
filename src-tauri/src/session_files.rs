// Session file export/import for per-project storage
//
// This module implements the hybrid storage model where sessions are exported
// to per-project `.ralph-ui/sessions/` directories for:
// - Git-trackable session state
// - Machine portability (same state on any machine with the repo)
// - Team visibility (others can see session history)
// - Philosophy alignment ("progress persists in files")

use crate::database::{sessions, tasks};
use crate::models::{Session, SessionConfig, SessionStatus, Task, TaskStatus};
use chrono::{DateTime, Utc};
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Version of the session file format
const SESSION_FILE_VERSION: u32 = 1;

/// Exported session file structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionFile {
    /// File format version
    pub version: u32,
    /// When this file was exported
    pub exported_at: DateTime<Utc>,
    /// The session data
    pub session: ExportedSession,
    /// Tasks associated with this session
    pub tasks: Vec<ExportedTask>,
    /// Optional PRD ID if session was created from a PRD
    pub prd_id: Option<String>,
}

/// Session data for export (subset of fields that should persist)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedSession {
    pub id: String,
    pub name: String,
    pub project_path: String,
    pub created_at: DateTime<Utc>,
    pub last_resumed_at: Option<DateTime<Utc>>,
    pub status: SessionStatus,
    pub config: SessionConfig,
    pub total_cost: f64,
    pub total_tokens: i32,
}

/// Task data for export
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedTask {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: i32,
    pub dependencies: Vec<String>,
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub error: Option<String>,
}

impl From<&Session> for ExportedSession {
    fn from(session: &Session) -> Self {
        ExportedSession {
            id: session.id.clone(),
            name: session.name.clone(),
            project_path: session.project_path.clone(),
            created_at: session.created_at,
            last_resumed_at: session.last_resumed_at,
            status: session.status,
            config: session.config.clone(),
            total_cost: session.total_cost,
            total_tokens: session.total_tokens,
        }
    }
}

impl From<&Task> for ExportedTask {
    fn from(task: &Task) -> Self {
        ExportedTask {
            id: task.id.clone(),
            title: task.title.clone(),
            description: task.description.clone(),
            status: task.status,
            priority: task.priority,
            dependencies: task.dependencies.clone(),
            branch: task.branch.clone(),
            worktree_path: task.worktree_path.clone(),
            started_at: task.started_at,
            completed_at: task.completed_at,
            error: task.error.clone(),
        }
    }
}

impl From<ExportedTask> for Task {
    fn from(task: ExportedTask) -> Self {
        Task {
            id: task.id,
            title: task.title,
            description: task.description,
            status: task.status,
            priority: task.priority,
            dependencies: task.dependencies,
            assigned_agent: None, // Not exported
            estimated_tokens: None, // Not exported
            actual_tokens: None, // Not exported
            started_at: task.started_at,
            completed_at: task.completed_at,
            branch: task.branch,
            worktree_path: task.worktree_path,
            error: task.error,
        }
    }
}

/// Get the sessions directory path for a project
pub fn get_sessions_dir(project_path: &Path) -> PathBuf {
    project_path.join(".ralph-ui").join("sessions")
}

/// Get the file path for a session export
pub fn get_session_file_path(project_path: &Path, session_id: &str) -> PathBuf {
    get_sessions_dir(project_path).join(format!("{}.json", session_id))
}

/// Ensure the sessions directory exists
fn ensure_sessions_dir(project_path: &Path) -> Result<(), String> {
    let sessions_dir = get_sessions_dir(project_path);
    if !sessions_dir.exists() {
        fs::create_dir_all(&sessions_dir)
            .map_err(|e| format!("Failed to create sessions directory: {}", e))?;
    }
    Ok(())
}

/// Export a session to a JSON file in the project's .ralph-ui/sessions/ directory
pub fn export_session_to_file(
    conn: &Connection,
    session_id: &str,
    prd_id: Option<String>,
) -> Result<PathBuf, String> {
    // Get session with tasks
    let session = sessions::get_session_with_tasks(conn, session_id)
        .map_err(|e| format!("Failed to get session: {}", e))?;

    let project_path = Path::new(&session.project_path);

    // Ensure directory exists
    ensure_sessions_dir(project_path)?;

    // Build the export structure
    let session_file = SessionFile {
        version: SESSION_FILE_VERSION,
        exported_at: Utc::now(),
        session: ExportedSession::from(&session),
        tasks: session.tasks.iter().map(ExportedTask::from).collect(),
        prd_id,
    };

    // Serialize to JSON
    let json = serde_json::to_string_pretty(&session_file)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;

    // Write to temp file first, then atomic rename for safety
    let file_path = get_session_file_path(project_path, session_id);
    let temp_path = file_path.with_extension("json.tmp");

    fs::write(&temp_path, &json)
        .map_err(|e| format!("Failed to write session file: {}", e))?;

    fs::rename(&temp_path, &file_path)
        .map_err(|e| format!("Failed to rename session file: {}", e))?;

    log::info!("Exported session {} to {:?}", session_id, file_path);

    Ok(file_path)
}

/// Export a session using direct Session and Task data (avoids double DB lookup)
pub fn export_session_to_file_direct(
    session: &Session,
    tasks: &[Task],
    prd_id: Option<String>,
) -> Result<PathBuf, String> {
    let project_path = Path::new(&session.project_path);

    // Ensure directory exists
    ensure_sessions_dir(project_path)?;

    // Build the export structure
    let session_file = SessionFile {
        version: SESSION_FILE_VERSION,
        exported_at: Utc::now(),
        session: ExportedSession::from(session),
        tasks: tasks.iter().map(ExportedTask::from).collect(),
        prd_id,
    };

    // Serialize to JSON
    let json = serde_json::to_string_pretty(&session_file)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;

    // Write to temp file first, then atomic rename for safety
    let file_path = get_session_file_path(project_path, &session.id);
    let temp_path = file_path.with_extension("json.tmp");

    fs::write(&temp_path, &json)
        .map_err(|e| format!("Failed to write session file: {}", e))?;

    fs::rename(&temp_path, &file_path)
        .map_err(|e| format!("Failed to rename session file: {}", e))?;

    log::debug!("Exported session {} to {:?}", session.id, file_path);

    Ok(file_path)
}

/// Read a session file from disk
pub fn read_session_file(file_path: &Path) -> Result<SessionFile, String> {
    let content = fs::read_to_string(file_path)
        .map_err(|e| format!("Failed to read session file: {}", e))?;

    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse session file: {}", e))
}

/// Import a single session from a file into the database
/// Returns the session ID if imported, or None if already exists (with newer data)
pub fn import_session_from_file(
    conn: &Connection,
    file_path: &Path,
) -> Result<Option<String>, String> {
    let session_file = read_session_file(file_path)?;

    // Check if session already exists in DB
    match sessions::get_session(conn, &session_file.session.id) {
        Ok(existing) => {
            // Session exists - compare timestamps
            let existing_updated = existing.last_resumed_at.unwrap_or(existing.created_at);
            let file_exported = session_file.exported_at;

            if file_exported > existing_updated {
                // File is newer - update the session
                log::info!(
                    "Session {} exists but file is newer, updating from file",
                    session_file.session.id
                );

                // Convert to Session and update
                let session = Session {
                    id: session_file.session.id.clone(),
                    name: session_file.session.name,
                    project_path: session_file.session.project_path,
                    created_at: session_file.session.created_at,
                    last_resumed_at: session_file.session.last_resumed_at,
                    status: session_file.session.status,
                    config: session_file.session.config,
                    tasks: vec![], // Will be handled separately
                    total_cost: session_file.session.total_cost,
                    total_tokens: session_file.session.total_tokens,
                };

                sessions::update_session(conn, &session)
                    .map_err(|e| format!("Failed to update session: {}", e))?;

                // Update tasks
                import_tasks_from_file(conn, &session_file.session.id, &session_file.tasks)?;

                Ok(Some(session_file.session.id))
            } else {
                // DB has newer or equal data - skip
                log::debug!(
                    "Session {} already exists with newer data, skipping import",
                    session_file.session.id
                );
                Ok(None)
            }
        }
        Err(_) => {
            // Session doesn't exist - import it
            log::info!(
                "Importing session {} from file",
                session_file.session.id
            );

            let session = Session {
                id: session_file.session.id.clone(),
                name: session_file.session.name,
                project_path: session_file.session.project_path,
                created_at: session_file.session.created_at,
                last_resumed_at: session_file.session.last_resumed_at,
                status: session_file.session.status,
                config: session_file.session.config,
                tasks: vec![],
                total_cost: session_file.session.total_cost,
                total_tokens: session_file.session.total_tokens,
            };

            sessions::create_session(conn, &session)
                .map_err(|e| format!("Failed to create session: {}", e))?;

            // Import tasks
            import_tasks_from_file(conn, &session_file.session.id, &session_file.tasks)?;

            Ok(Some(session_file.session.id))
        }
    }
}

/// Import tasks from a session file
fn import_tasks_from_file(
    conn: &Connection,
    session_id: &str,
    exported_tasks: &[ExportedTask],
) -> Result<(), String> {
    for exported_task in exported_tasks {
        let task: Task = exported_task.clone().into();

        // Check if task exists
        match tasks::get_task(conn, &task.id) {
            Ok(_) => {
                // Task exists - update it
                tasks::update_task(conn, &task)
                    .map_err(|e| format!("Failed to update task: {}", e))?;
            }
            Err(_) => {
                // Task doesn't exist - create it
                tasks::create_task(conn, session_id, &task)
                    .map_err(|e| format!("Failed to create task: {}", e))?;
            }
        }
    }

    Ok(())
}

/// Import all sessions from a project's .ralph-ui/sessions/ directory
/// Returns the number of sessions imported
pub fn import_sessions_from_project(
    conn: &Connection,
    project_path: &Path,
) -> Result<Vec<String>, String> {
    let sessions_dir = get_sessions_dir(project_path);

    if !sessions_dir.exists() {
        log::debug!("No sessions directory found for project: {:?}", project_path);
        return Ok(vec![]);
    }

    let entries = fs::read_dir(&sessions_dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

    let mut imported = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Only process .json files
        if path.extension().map_or(false, |ext| ext == "json") {
            match import_session_from_file(conn, &path) {
                Ok(Some(session_id)) => {
                    imported.push(session_id);
                }
                Ok(None) => {
                    // Already exists with newer data
                }
                Err(e) => {
                    log::warn!("Failed to import session from {:?}: {}", path, e);
                    // Continue with other files
                }
            }
        }
    }

    if !imported.is_empty() {
        log::info!(
            "Imported {} sessions from project {:?}",
            imported.len(),
            project_path
        );
    }

    Ok(imported)
}

/// Delete the session file for a given session
pub fn delete_session_file(project_path: &Path, session_id: &str) -> Result<(), String> {
    let file_path = get_session_file_path(project_path, session_id);

    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete session file: {}", e))?;
        log::info!("Deleted session file: {:?}", file_path);
    }

    Ok(())
}

/// Check if a session file exists for a given session
pub fn session_file_exists(project_path: &Path, session_id: &str) -> bool {
    get_session_file_path(project_path, session_id).exists()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AgentType, SessionConfig, SessionStatus, TaskStatus};
    use tempfile::TempDir;

    fn create_test_session(id: &str, project_path: &str) -> Session {
        Session {
            id: id.to_string(),
            name: "Test Session".to_string(),
            project_path: project_path.to_string(),
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
        }
    }

    fn create_test_task(id: &str) -> Task {
        Task {
            id: id.to_string(),
            title: "Test Task".to_string(),
            description: "Test description".to_string(),
            status: TaskStatus::Pending,
            priority: 1,
            dependencies: vec![],
            assigned_agent: None,
            estimated_tokens: None,
            actual_tokens: None,
            started_at: None,
            completed_at: None,
            branch: Some("feature/test".to_string()),
            worktree_path: None,
            error: None,
        }
    }

    #[test]
    fn test_export_session_direct() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();

        let session = create_test_session("session-1", project_path.to_str().unwrap());
        let tasks = vec![
            create_test_task("task-1"),
            create_test_task("task-2"),
        ];

        let result = export_session_to_file_direct(&session, &tasks, None);
        assert!(result.is_ok());

        let file_path = result.unwrap();
        assert!(file_path.exists());

        // Verify file contents
        let content = fs::read_to_string(&file_path).unwrap();
        let session_file: SessionFile = serde_json::from_str(&content).unwrap();

        assert_eq!(session_file.version, SESSION_FILE_VERSION);
        assert_eq!(session_file.session.id, "session-1");
        assert_eq!(session_file.tasks.len(), 2);
    }

    #[test]
    fn test_read_session_file() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();

        let session = create_test_session("session-1", project_path.to_str().unwrap());
        let tasks = vec![create_test_task("task-1")];

        let file_path = export_session_to_file_direct(&session, &tasks, Some("prd-123".to_string()))
            .unwrap();

        let session_file = read_session_file(&file_path).unwrap();

        assert_eq!(session_file.session.id, "session-1");
        assert_eq!(session_file.tasks.len(), 1);
        assert_eq!(session_file.prd_id, Some("prd-123".to_string()));
    }

    #[test]
    fn test_sessions_dir_path() {
        let project_path = Path::new("/home/user/my-project");
        let sessions_dir = get_sessions_dir(project_path);

        assert_eq!(
            sessions_dir,
            PathBuf::from("/home/user/my-project/.ralph-ui/sessions")
        );
    }

    #[test]
    fn test_session_file_path() {
        let project_path = Path::new("/home/user/my-project");
        let file_path = get_session_file_path(project_path, "session-123");

        assert_eq!(
            file_path,
            PathBuf::from("/home/user/my-project/.ralph-ui/sessions/session-123.json")
        );
    }

    #[test]
    fn test_session_file_exists() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();

        assert!(!session_file_exists(project_path, "session-1"));

        let session = create_test_session("session-1", project_path.to_str().unwrap());
        export_session_to_file_direct(&session, &[], None).unwrap();

        assert!(session_file_exists(project_path, "session-1"));
    }

    #[test]
    fn test_delete_session_file() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();

        let session = create_test_session("session-1", project_path.to_str().unwrap());
        export_session_to_file_direct(&session, &[], None).unwrap();

        assert!(session_file_exists(project_path, "session-1"));

        delete_session_file(project_path, "session-1").unwrap();

        assert!(!session_file_exists(project_path, "session-1"));
    }
}
