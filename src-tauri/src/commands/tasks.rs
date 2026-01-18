// Task-related Tauri commands

use crate::database::{self, Database};
use crate::events::{emit_task_status_changed, TaskStatusChangedPayload};
use crate::models::{Task, TaskStatus};
use crate::session::{ProgressStatus, ProgressTracker};
use std::path::Path;
use tauri::State;
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

#[tauri::command]
pub async fn create_task(
    session_id: String,
    task: Task,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Task, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    database::tasks::create_task(conn, &session_id, &task)
        .map_err(|e| format!("Failed to create task: {}", e))?;

    Ok(task)
}

#[tauri::command]
pub async fn get_task(
    task_id: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Task, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    database::tasks::get_task(conn, &task_id)
        .map_err(|e| format!("Failed to get task: {}", e))
}

#[tauri::command]
pub async fn get_tasks_for_session(
    session_id: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Vec<Task>, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    database::tasks::get_tasks_for_session(conn, &session_id)
        .map_err(|e| format!("Failed to get tasks: {}", e))
}

#[tauri::command]
pub async fn update_task(
    task: Task,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Task, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    database::tasks::update_task(conn, &task)
        .map_err(|e| format!("Failed to update task: {}", e))?;

    Ok(task)
}

#[tauri::command]
pub async fn delete_task(
    task_id: String,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    database::tasks::delete_task(conn, &task_id)
        .map_err(|e| format!("Failed to delete task: {}", e))
}

#[tauri::command]
pub async fn update_task_status(
    app_handle: tauri::AppHandle,
    task_id: String,
    status: TaskStatus,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<(), String> {
    // First validate the state transition
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    let current_task = database::tasks::get_task(conn, &task_id)
        .map_err(|e| format!("Failed to get task: {}", e))?;

    let old_status = format!("{:?}", current_task.status).to_lowercase();
    let new_status = format!("{:?}", status).to_lowercase();

    // Validate state transition
    crate::models::state_machine::transition_state(current_task.status, status)
        .map_err(|e| format!("Invalid state transition: {}", e))?;

    database::tasks::update_task_status(conn, &task_id, status)
        .map_err(|e| format!("Failed to update task status: {}", e))?;

    // Get the session_id for this task
    let session_id = database::tasks::get_session_id_for_task(conn, &task_id)
        .unwrap_or_else(|_| "unknown".to_string());

    // Write to progress file for session recovery
    // Get the project path from the session
    if let Ok(session) = database::sessions::get_session(conn, &session_id) {
        let project_path = Path::new(&session.project_path);
        let tracker = ProgressTracker::new(project_path);
        let progress_status = task_status_to_progress_status(status);

        if let Err(e) = tracker.append_progress(
            &session_id,
            &task_id,
            progress_status,
            None,
        ) {
            log::warn!("Failed to write progress file: {}", e);
        }
    }

    // Emit the status changed event
    let payload = TaskStatusChangedPayload {
        task_id: task_id.clone(),
        session_id,
        old_status,
        new_status,
    };

    // Log any event emission errors but don't fail the command
    if let Err(e) = emit_task_status_changed(&app_handle, payload) {
        log::warn!("Failed to emit task status changed event: {}", e);
    }

    Ok(())
}

#[tauri::command]
pub async fn import_prd(
    session_id: String,
    content: String,
    format: Option<String>,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<Vec<Task>, String> {
    use crate::parsers::{parse_prd, parse_prd_auto, PRDFormat};

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

    // Convert PRD tasks to database tasks
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

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

        database::tasks::create_task(conn, &session_id, &task)
            .map_err(|e| format!("Failed to create task: {}", e))?;

        tasks.push(task);
    }

    Ok(tasks)
}
