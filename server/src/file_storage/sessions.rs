//! Session file storage
//!
//! Stores sessions with embedded tasks in `.ralph-ui/sessions/{id}.json`
//! This replaces SQLite storage for sessions and tasks.

use super::index::{read_index, update_index_entry, write_index, IndexFile, SessionIndexEntry};
use super::{atomic_write, ensure_dir, get_ralph_ui_dir, read_json, FileResult};
use crate::models::{Session, SessionConfig, SessionStatus, Task, TaskStatus};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Version of the session file format
const SESSION_FILE_VERSION: u32 = 2;

/// Session file structure with embedded tasks
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionFile {
    /// File format version
    pub version: u32,
    /// When this file was last updated
    pub updated_at: DateTime<Utc>,
    /// The session data
    pub session: SessionData,
    /// Tasks associated with this session
    pub tasks: Vec<TaskData>,
    /// Optional PRD ID if session was created from a PRD
    pub prd_id: Option<String>,
}

/// Session data stored in file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionData {
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

/// Task data stored in file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskData {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: TaskStatus,
    pub priority: i32,
    pub dependencies: Vec<String>,
    pub assigned_agent: Option<String>,
    pub estimated_tokens: Option<i32>,
    pub actual_tokens: Option<i32>,
    pub started_at: Option<DateTime<Utc>>,
    pub completed_at: Option<DateTime<Utc>>,
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
    pub error: Option<String>,
}

impl From<&Session> for SessionData {
    fn from(session: &Session) -> Self {
        Self {
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

impl From<&Task> for TaskData {
    fn from(task: &Task) -> Self {
        Self {
            id: task.id.clone(),
            title: task.title.clone(),
            description: task.description.clone(),
            status: task.status,
            priority: task.priority,
            dependencies: task.dependencies.clone(),
            assigned_agent: task.assigned_agent.clone(),
            estimated_tokens: task.estimated_tokens,
            actual_tokens: task.actual_tokens,
            started_at: task.started_at,
            completed_at: task.completed_at,
            branch: task.branch.clone(),
            worktree_path: task.worktree_path.clone(),
            error: task.error.clone(),
        }
    }
}

impl TaskData {
    pub fn to_task(&self) -> Task {
        Task {
            id: self.id.clone(),
            title: self.title.clone(),
            description: self.description.clone(),
            status: self.status,
            priority: self.priority,
            dependencies: self.dependencies.clone(),
            assigned_agent: self.assigned_agent.clone(),
            estimated_tokens: self.estimated_tokens,
            actual_tokens: self.actual_tokens,
            started_at: self.started_at,
            completed_at: self.completed_at,
            branch: self.branch.clone(),
            worktree_path: self.worktree_path.clone(),
            error: self.error.clone(),
        }
    }
}

impl SessionFile {
    /// Convert to Session model with embedded tasks
    pub fn to_session(&self) -> Session {
        Session {
            id: self.session.id.clone(),
            name: self.session.name.clone(),
            project_path: self.session.project_path.clone(),
            created_at: self.session.created_at,
            last_resumed_at: self.session.last_resumed_at,
            status: self.session.status,
            config: self.session.config.clone(),
            tasks: self.tasks.iter().map(|t| t.to_task()).collect(),
            total_cost: self.session.total_cost,
            total_tokens: self.session.total_tokens,
        }
    }

    /// Create index entry from this session file
    pub fn to_index_entry(&self) -> SessionIndexEntry {
        let completed_count = self
            .tasks
            .iter()
            .filter(|t| t.status == TaskStatus::Completed)
            .count();
        SessionIndexEntry {
            id: self.session.id.clone(),
            name: self.session.name.clone(),
            status: format!("{:?}", self.session.status).to_lowercase(),
            updated_at: self.updated_at,
            task_count: self.tasks.len() as u32,
            completed_task_count: completed_count as u32,
        }
    }
}

/// Get the sessions directory path for a project
pub fn get_sessions_dir(project_path: &Path) -> PathBuf {
    get_ralph_ui_dir(project_path).join("sessions")
}

/// Get the file path for a session
pub fn get_session_file_path(project_path: &Path, session_id: &str) -> PathBuf {
    get_sessions_dir(project_path).join(format!("{}.json", session_id))
}

/// Save a session with its tasks to file
pub fn save_session(project_path: &Path, session: &Session) -> FileResult<PathBuf> {
    let sessions_dir = get_sessions_dir(project_path);
    ensure_dir(&sessions_dir)?;

    let file_path = get_session_file_path(project_path, &session.id);

    let session_file = SessionFile {
        version: SESSION_FILE_VERSION,
        updated_at: Utc::now(),
        session: SessionData::from(session),
        tasks: session.tasks.iter().map(TaskData::from).collect(),
        prd_id: None, // Can be set separately if needed
    };

    let content = serde_json::to_string_pretty(&session_file)
        .map_err(|e| format!("Failed to serialize session: {}", e))?;

    atomic_write(&file_path, &content)?;

    // Update the index
    let index_entry = session_file.to_index_entry();
    update_index_entry::<SessionIndexEntry, _>(project_path, "sessions", &session.id, |_| {
        Some(index_entry)
    })?;

    log::debug!("Saved session {} to {:?}", session.id, file_path);
    Ok(file_path)
}

/// Read a session from file
pub fn read_session(project_path: &Path, session_id: &str) -> FileResult<Session> {
    let file_path = get_session_file_path(project_path, session_id);
    let session_file: SessionFile = read_json(&file_path)?;
    Ok(session_file.to_session())
}

/// Read a session file (raw)
pub fn read_session_file(project_path: &Path, session_id: &str) -> FileResult<SessionFile> {
    let file_path = get_session_file_path(project_path, session_id);
    read_json(&file_path)
}

/// Check if a session file exists
pub fn session_exists(project_path: &Path, session_id: &str) -> bool {
    get_session_file_path(project_path, session_id).exists()
}

/// Delete a session file
pub fn delete_session(project_path: &Path, session_id: &str) -> FileResult<()> {
    let file_path = get_session_file_path(project_path, session_id);

    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| format!("Failed to delete session file: {}", e))?;
        log::info!("Deleted session file: {:?}", file_path);
    }

    // Update the index
    super::index::remove_index_entry::<SessionIndexEntry>(project_path, "sessions", session_id)?;

    Ok(())
}

/// List all sessions from files (legacy - reads all files)
/// Use `list_sessions_from_index()` for better performance.
pub fn list_sessions(project_path: &Path) -> FileResult<Vec<Session>> {
    let sessions_dir = get_sessions_dir(project_path);

    if !sessions_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&sessions_dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

    let mut sessions = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Skip non-JSON files and index.json
        if path.extension().map_or(true, |ext| ext != "json") {
            continue;
        }
        if path.file_name().map_or(false, |name| name == "index.json") {
            continue;
        }

        match read_json::<SessionFile>(&path) {
            Ok(file) => sessions.push(file.to_session()),
            Err(e) => {
                log::warn!("Failed to read session file {:?}: {}", path, e);
            }
        }
    }

    // Sort by created_at descending
    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(sessions)
}

/// List sessions using the index (fast path - single file read)
/// Falls back to rebuilding index if empty but directory has files.
pub fn list_sessions_from_index(project_path: &Path) -> FileResult<Vec<SessionIndexEntry>> {
    let index: IndexFile<SessionIndexEntry> = read_index(project_path, "sessions")?;

    // If index is empty, check if we need to rebuild it
    if index.entries.is_empty() {
        let sessions_dir = get_sessions_dir(project_path);
        if sessions_dir.exists() {
            // Check if there are any session files
            let has_files = fs::read_dir(&sessions_dir)
                .map(|entries| {
                    entries.filter_map(Result::ok).any(|e| {
                        let path = e.path();
                        path.extension().map_or(false, |ext| ext == "json")
                            && path.file_name().map_or(true, |name| name != "index.json")
                    })
                })
                .unwrap_or(false);

            if has_files {
                log::info!(
                    "Index empty but session files exist, rebuilding index for {:?}",
                    project_path
                );
                return rebuild_session_index(project_path);
            }
        }
    }

    let mut entries = index.entries;
    // Sort by updated_at descending (most recent first)
    entries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(entries)
}

/// Rebuild the session index from individual session files
/// Used when index is missing/corrupted or after external file changes
pub fn rebuild_session_index(project_path: &Path) -> FileResult<Vec<SessionIndexEntry>> {
    let sessions_dir = get_sessions_dir(project_path);

    if !sessions_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&sessions_dir)
        .map_err(|e| format!("Failed to read sessions directory: {}", e))?;

    let mut index_entries = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Skip non-JSON files and index.json
        if path.extension().map_or(true, |ext| ext != "json") {
            continue;
        }
        if path.file_name().map_or(false, |name| name == "index.json") {
            continue;
        }

        match read_json::<SessionFile>(&path) {
            Ok(file) => {
                index_entries.push(file.to_index_entry());
            }
            Err(e) => {
                log::warn!("Failed to read session file {:?}: {}", path, e);
            }
        }
    }

    // Sort by updated_at descending
    index_entries.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    // Write the rebuilt index
    write_index(project_path, "sessions", index_entries.clone())?;

    log::info!(
        "Rebuilt session index for {:?}: {} entries",
        project_path,
        index_entries.len()
    );

    Ok(index_entries)
}

/// Get all unique project paths from session files
/// This is needed for startup recovery - walks all known paths
pub fn get_unique_project_paths(project_path: &Path) -> FileResult<Vec<String>> {
    let sessions = list_sessions(project_path)?;
    let mut paths: Vec<String> = sessions.iter().map(|s| s.project_path.clone()).collect();
    paths.sort();
    paths.dedup();
    Ok(paths)
}

/// Update session status
pub fn update_session_status(
    project_path: &Path,
    session_id: &str,
    status: SessionStatus,
) -> FileResult<()> {
    let mut session = read_session(project_path, session_id)?;
    session.status = status;
    session.last_resumed_at = Some(Utc::now());
    save_session(project_path, &session)?;
    Ok(())
}

/// Update session metrics (cost and tokens)
pub fn update_session_metrics(
    project_path: &Path,
    session_id: &str,
    cost: f64,
    tokens: i32,
) -> FileResult<()> {
    let mut session = read_session(project_path, session_id)?;
    session.total_cost = cost;
    session.total_tokens = tokens;
    save_session(project_path, &session)?;
    Ok(())
}

// ============================================================================
// Task operations (tasks are embedded in session files)
// ============================================================================

/// Create a task in a session
pub fn create_task(project_path: &Path, session_id: &str, task: &Task) -> FileResult<()> {
    let mut session = read_session(project_path, session_id)?;

    // Check if task already exists
    if session.tasks.iter().any(|t| t.id == task.id) {
        return Err(format!(
            "Task {} already exists in session {}",
            task.id, session_id
        ));
    }

    session.tasks.push(task.clone());
    save_session(project_path, &session)?;
    Ok(())
}

/// Get a task from a session
pub fn get_task(project_path: &Path, session_id: &str, task_id: &str) -> FileResult<Task> {
    let session = read_session(project_path, session_id)?;
    session
        .tasks
        .iter()
        .find(|t| t.id == task_id)
        .cloned()
        .ok_or_else(|| format!("Task {} not found in session {}", task_id, session_id))
}

/// Get all tasks for a session
pub fn get_tasks(project_path: &Path, session_id: &str) -> FileResult<Vec<Task>> {
    let session = read_session(project_path, session_id)?;
    Ok(session.tasks)
}

/// Update a task in a session
pub fn update_task(project_path: &Path, session_id: &str, task: &Task) -> FileResult<()> {
    let mut session = read_session(project_path, session_id)?;

    if let Some(existing) = session.tasks.iter_mut().find(|t| t.id == task.id) {
        *existing = task.clone();
        save_session(project_path, &session)?;
        Ok(())
    } else {
        Err(format!(
            "Task {} not found in session {}",
            task.id, session_id
        ))
    }
}

/// Delete a task from a session
pub fn delete_task(project_path: &Path, session_id: &str, task_id: &str) -> FileResult<()> {
    let mut session = read_session(project_path, session_id)?;
    let initial_len = session.tasks.len();
    session.tasks.retain(|t| t.id != task_id);

    if session.tasks.len() == initial_len {
        return Err(format!(
            "Task {} not found in session {}",
            task_id, session_id
        ));
    }

    save_session(project_path, &session)?;
    Ok(())
}

/// Update task status
pub fn update_task_status(
    project_path: &Path,
    session_id: &str,
    task_id: &str,
    status: TaskStatus,
) -> FileResult<()> {
    let mut session = read_session(project_path, session_id)?;

    if let Some(task) = session.tasks.iter_mut().find(|t| t.id == task_id) {
        task.status = status;
        if status == TaskStatus::InProgress && task.started_at.is_none() {
            task.started_at = Some(Utc::now());
        }
        if status == TaskStatus::Completed && task.completed_at.is_none() {
            task.completed_at = Some(Utc::now());
        }
        save_session(project_path, &session)?;
        Ok(())
    } else {
        Err(format!(
            "Task {} not found in session {}",
            task_id, session_id
        ))
    }
}

/// Find task across all sessions in a project
/// Returns (session_id, task) if found
pub fn find_task_in_project(
    project_path: &Path,
    task_id: &str,
) -> FileResult<Option<(String, Task)>> {
    let sessions = list_sessions(project_path)?;
    for session in sessions {
        if let Some(task) = session.tasks.iter().find(|t| t.id == task_id) {
            return Ok(Some((session.id, task.clone())));
        }
    }
    Ok(None)
}

/// Clear assigned_agent from all in-progress tasks in a session (for recovery)
pub fn unassign_in_progress_tasks(project_path: &Path, session_id: &str) -> FileResult<usize> {
    let mut session = read_session(project_path, session_id)?;
    let mut count = 0;

    for task in &mut session.tasks {
        if task.status == TaskStatus::InProgress {
            task.status = TaskStatus::Pending;
            task.assigned_agent = None;
            count += 1;
        }
    }

    if count > 0 {
        save_session(project_path, &session)?;
    }

    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::AgentType;
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
    fn test_save_and_read_session() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let mut session = create_test_session("session-1", temp_dir.path().to_str().unwrap());
        session.tasks.push(create_test_task("task-1"));
        session.tasks.push(create_test_task("task-2"));

        let file_path = save_session(temp_dir.path(), &session).unwrap();
        assert!(file_path.exists());

        let read_session = read_session(temp_dir.path(), "session-1").unwrap();
        assert_eq!(read_session.id, "session-1");
        assert_eq!(read_session.tasks.len(), 2);
    }

    #[test]
    fn test_session_exists() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        assert!(!session_exists(temp_dir.path(), "session-1"));

        let session = create_test_session("session-1", temp_dir.path().to_str().unwrap());
        save_session(temp_dir.path(), &session).unwrap();

        assert!(session_exists(temp_dir.path(), "session-1"));
    }

    #[test]
    fn test_delete_session() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("session-1", temp_dir.path().to_str().unwrap());
        save_session(temp_dir.path(), &session).unwrap();

        assert!(session_exists(temp_dir.path(), "session-1"));

        delete_session(temp_dir.path(), "session-1").unwrap();

        assert!(!session_exists(temp_dir.path(), "session-1"));
    }

    #[test]
    fn test_list_sessions() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        for i in 1..=3 {
            let session =
                create_test_session(&format!("session-{}", i), temp_dir.path().to_str().unwrap());
            save_session(temp_dir.path(), &session).unwrap();
        }

        let sessions = list_sessions(temp_dir.path()).unwrap();
        assert_eq!(sessions.len(), 3);
    }

    #[test]
    fn test_update_session_status() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("session-1", temp_dir.path().to_str().unwrap());
        save_session(temp_dir.path(), &session).unwrap();

        update_session_status(temp_dir.path(), "session-1", SessionStatus::Paused).unwrap();

        let read_session = read_session(temp_dir.path(), "session-1").unwrap();
        assert_eq!(read_session.status, SessionStatus::Paused);
    }

    #[test]
    fn test_create_task() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("session-1", temp_dir.path().to_str().unwrap());
        save_session(temp_dir.path(), &session).unwrap();

        let task = create_test_task("task-1");
        create_task(temp_dir.path(), "session-1", &task).unwrap();

        let read_session = read_session(temp_dir.path(), "session-1").unwrap();
        assert_eq!(read_session.tasks.len(), 1);
        assert_eq!(read_session.tasks[0].id, "task-1");
    }

    #[test]
    fn test_get_task() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let mut session = create_test_session("session-1", temp_dir.path().to_str().unwrap());
        session.tasks.push(create_test_task("task-1"));
        save_session(temp_dir.path(), &session).unwrap();

        let task = get_task(temp_dir.path(), "session-1", "task-1").unwrap();
        assert_eq!(task.id, "task-1");
    }

    #[test]
    fn test_update_task() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let mut session = create_test_session("session-1", temp_dir.path().to_str().unwrap());
        session.tasks.push(create_test_task("task-1"));
        save_session(temp_dir.path(), &session).unwrap();

        let mut task = create_test_task("task-1");
        task.title = "Updated Task".to_string();
        update_task(temp_dir.path(), "session-1", &task).unwrap();

        let read_task = get_task(temp_dir.path(), "session-1", "task-1").unwrap();
        assert_eq!(read_task.title, "Updated Task");
    }

    #[test]
    fn test_delete_task() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let mut session = create_test_session("session-1", temp_dir.path().to_str().unwrap());
        session.tasks.push(create_test_task("task-1"));
        session.tasks.push(create_test_task("task-2"));
        save_session(temp_dir.path(), &session).unwrap();

        delete_task(temp_dir.path(), "session-1", "task-1").unwrap();

        let read_session = read_session(temp_dir.path(), "session-1").unwrap();
        assert_eq!(read_session.tasks.len(), 1);
        assert_eq!(read_session.tasks[0].id, "task-2");
    }

    #[test]
    fn test_update_task_status() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let mut session = create_test_session("session-1", temp_dir.path().to_str().unwrap());
        session.tasks.push(create_test_task("task-1"));
        save_session(temp_dir.path(), &session).unwrap();

        update_task_status(
            temp_dir.path(),
            "session-1",
            "task-1",
            TaskStatus::InProgress,
        )
        .unwrap();

        let task = get_task(temp_dir.path(), "session-1", "task-1").unwrap();
        assert_eq!(task.status, TaskStatus::InProgress);
        assert!(task.started_at.is_some());
    }

    #[test]
    fn test_unassign_in_progress_tasks() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let mut session = create_test_session("session-1", temp_dir.path().to_str().unwrap());
        let mut task1 = create_test_task("task-1");
        task1.status = TaskStatus::InProgress;
        task1.assigned_agent = Some("agent-1".to_string());
        let mut task2 = create_test_task("task-2");
        task2.status = TaskStatus::InProgress;
        task2.assigned_agent = Some("agent-2".to_string());
        session.tasks.push(task1);
        session.tasks.push(task2);
        save_session(temp_dir.path(), &session).unwrap();

        let count = unassign_in_progress_tasks(temp_dir.path(), "session-1").unwrap();
        assert_eq!(count, 2);

        let read_session = read_session(temp_dir.path(), "session-1").unwrap();
        for task in &read_session.tasks {
            assert_eq!(task.status, TaskStatus::Pending);
            assert!(task.assigned_agent.is_none());
        }
    }

    // =========================================================================
    // Index-based listing tests
    // =========================================================================

    #[test]
    fn test_list_sessions_from_index_empty() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let entries = list_sessions_from_index(temp_dir.path()).unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn test_list_sessions_from_index_with_sessions() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        // Create sessions (save_session updates the index)
        for i in 1..=3 {
            let mut session =
                create_test_session(&format!("session-{}", i), temp_dir.path().to_str().unwrap());
            session.tasks.push(create_test_task(&format!("task-{}", i)));
            save_session(temp_dir.path(), &session).unwrap();
        }

        // List from index
        let entries = list_sessions_from_index(temp_dir.path()).unwrap();
        assert_eq!(entries.len(), 3);

        // Verify index entry fields
        for entry in &entries {
            assert!(entry.id.starts_with("session-"));
            assert_eq!(entry.name, "Test Session");
            assert_eq!(entry.status, "active");
            assert_eq!(entry.task_count, 1);
            assert_eq!(entry.completed_task_count, 0);
        }
    }

    #[test]
    fn test_rebuild_session_index() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        // Create sessions
        for i in 1..=2 {
            let session =
                create_test_session(&format!("session-{}", i), temp_dir.path().to_str().unwrap());
            save_session(temp_dir.path(), &session).unwrap();
        }

        // Delete the index file to simulate corruption
        let index_path = super::super::index::get_index_path(temp_dir.path(), "sessions");
        std::fs::remove_file(&index_path).unwrap();

        // Rebuild should recreate the index
        let entries = rebuild_session_index(temp_dir.path()).unwrap();
        assert_eq!(entries.len(), 2);

        // Verify index file was recreated
        assert!(index_path.exists());
    }

    #[test]
    fn test_list_sessions_from_index_auto_rebuild() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        // Create sessions
        for i in 1..=2 {
            let session =
                create_test_session(&format!("session-{}", i), temp_dir.path().to_str().unwrap());
            save_session(temp_dir.path(), &session).unwrap();
        }

        // Delete the index file
        let index_path = super::super::index::get_index_path(temp_dir.path(), "sessions");
        std::fs::remove_file(&index_path).unwrap();

        // list_sessions_from_index should auto-rebuild
        let entries = list_sessions_from_index(temp_dir.path()).unwrap();
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn test_index_updated_on_delete() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        // Create sessions
        let session1 = create_test_session("session-1", temp_dir.path().to_str().unwrap());
        let session2 = create_test_session("session-2", temp_dir.path().to_str().unwrap());
        save_session(temp_dir.path(), &session1).unwrap();
        save_session(temp_dir.path(), &session2).unwrap();

        // Verify both in index
        let entries = list_sessions_from_index(temp_dir.path()).unwrap();
        assert_eq!(entries.len(), 2);

        // Delete one session
        delete_session(temp_dir.path(), "session-1").unwrap();

        // Verify index updated
        let entries = list_sessions_from_index(temp_dir.path()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "session-2");
    }
}
