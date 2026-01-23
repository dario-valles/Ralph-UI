// Task-related commands
// Uses file-based storage in .ralph-ui/sessions/

use crate::file_storage::sessions as session_storage;
use crate::models::{Task, TaskStatus};
use crate::session::{ProgressStatus, ProgressTracker};
use crate::utils::as_path;
use std::path::Path;
use uuid::Uuid;

/// Convert TaskStatus to ProgressStatus for progress file tracking
fn task_status_to_progress_status(status: TaskStatus) -> ProgressStatus {
    match status {
        TaskStatus::Pending => ProgressStatus::Paused,
        TaskStatus::InProgress => ProgressStatus::InProgress,
        TaskStatus::Completed => ProgressStatus::Completed,
        TaskStatus::Failed => ProgressStatus::Failed,
    }
}

/// Create a new task in a session
pub async fn create_task(
    session_id: String,
    task: Task,
    project_path: String,
) -> Result<Task, String> {
    session_storage::create_task(as_path(&project_path), &session_id, &task)?;
    Ok(task)
}

/// Get a specific task by ID
pub async fn get_task(
    task_id: String,
    session_id: String,
    project_path: String,
) -> Result<Task, String> {
    session_storage::get_task(as_path(&project_path), &session_id, &task_id)
}

/// Get all tasks for a session
pub async fn get_tasks_for_session(
    session_id: String,
    project_path: String,
) -> Result<Vec<Task>, String> {
    session_storage::get_tasks(as_path(&project_path), &session_id)
}

/// Update a task
pub async fn update_task(
    task: Task,
    session_id: String,
    project_path: String,
) -> Result<Task, String> {
    session_storage::update_task(as_path(&project_path), &session_id, &task)?;
    Ok(task)
}

/// Delete a task
pub async fn delete_task(
    task_id: String,
    session_id: String,
    project_path: String,
) -> Result<(), String> {
    session_storage::delete_task(as_path(&project_path), &session_id, &task_id)
}

/// Update task status and return old/new status for event emission
/// Event emission is handled by the proxy layer
pub fn update_task_status_internal(
    project_path: &Path,
    session_id: &str,
    task_id: &str,
    status: TaskStatus,
) -> Result<(String, String), String> {
    // Get the current task to validate the transition
    let current_task = session_storage::get_task(project_path, session_id, task_id)?;

    let old_status = format!("{:?}", current_task.status).to_lowercase();
    let new_status = format!("{:?}", status).to_lowercase();

    // Validate state transition
    crate::models::state_machine::transition_state(current_task.status, status)
        .map_err(|e| format!("Invalid state transition: {:?}", e))?;

    // Update task status
    session_storage::update_task_status(project_path, session_id, task_id, status)?;

    // Write to progress file for session recovery
    let tracker = ProgressTracker::new(project_path);
    let progress_status = task_status_to_progress_status(status);

    if let Err(e) = tracker.append_progress(session_id, task_id, progress_status, None) {
        log::warn!("Failed to write progress file: {}", e);
    }

    Ok((old_status, new_status))
}

/// Import PRD content and create tasks
pub async fn import_prd(
    session_id: String,
    content: String,
    format: Option<String>,
    project_path: String,
) -> Result<Vec<Task>, String> {
    use crate::parsers::{parse_prd, parse_prd_auto, PRDFormat};

    let path = as_path(&project_path);

    // Parse the PRD
    let prd = if let Some(fmt) = format {
        let format = match fmt.to_lowercase().as_str() {
            "json" => PRDFormat::Json,
            "yaml" | "yml" => PRDFormat::Yaml,
            "markdown" | "md" => PRDFormat::Markdown,
            _ => return Err(format!("Unsupported format: {}", fmt)),
        };
        parse_prd(&content, format)
    } else {
        parse_prd_auto(&content)
    }
    .map_err(|e| format!("Failed to parse PRD: {}", e))?;

    let mut tasks = Vec::new();

    for (index, prd_task) in prd.tasks.iter().enumerate() {
        let task = Task {
            id: Uuid::new_v4().to_string(),
            title: prd_task.title.clone(),
            description: prd_task.description.clone(),
            status: TaskStatus::Pending,
            priority: prd_task.priority.unwrap_or(index as i32 + 1),
            dependencies: prd_task.dependencies.clone(),
            assigned_agent: None,
            estimated_tokens: prd_task.estimated_tokens,
            actual_tokens: None,
            started_at: None,
            completed_at: None,
            branch: None,
            worktree_path: None,
            error: None,
        };

        session_storage::create_task(path, &session_id, &task)?;
        tasks.push(task);
    }

    Ok(tasks)
}
