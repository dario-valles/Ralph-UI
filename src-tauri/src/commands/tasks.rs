// Task-related Tauri commands

use crate::database::{self, Database};
use crate::models::{Task, TaskStatus};
use tauri::State;
use uuid::Uuid;

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
    task_id: String,
    status: TaskStatus,
    db: State<'_, std::sync::Mutex<Database>>,
) -> Result<(), String> {
    // First validate the state transition
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    let current_task = database::tasks::get_task(conn, &task_id)
        .map_err(|e| format!("Failed to get task: {}", e))?;

    // Validate state transition
    crate::models::state_machine::transition_state(current_task.status, status)
        .map_err(|e| format!("Invalid state transition: {}", e))?;

    database::tasks::update_task_status(conn, &task_id, status)
        .map_err(|e| format!("Failed to update task status: {}", e))
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
