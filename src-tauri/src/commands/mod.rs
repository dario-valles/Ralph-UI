// Tauri command handlers for IPC communication

use crate::models::{Session, Task};

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Session commands
#[tauri::command]
pub async fn create_session(name: String, project_path: String) -> Result<Session, String> {
    // TODO: Implement session creation
    Err("Not implemented yet".to_string())
}

#[tauri::command]
pub async fn get_sessions() -> Result<Vec<Session>, String> {
    // TODO: Implement getting all sessions
    Err("Not implemented yet".to_string())
}

#[tauri::command]
pub async fn get_session(id: String) -> Result<Session, String> {
    // TODO: Implement getting a specific session
    Err("Not implemented yet".to_string())
}

// Task commands
#[tauri::command]
pub async fn create_task(session_id: String, task: Task) -> Result<Task, String> {
    // TODO: Implement task creation
    Err("Not implemented yet".to_string())
}

#[tauri::command]
pub async fn update_task(session_id: String, task_id: String, task: Task) -> Result<Task, String> {
    // TODO: Implement task update
    Err("Not implemented yet".to_string())
}

#[tauri::command]
pub async fn delete_task(session_id: String, task_id: String) -> Result<(), String> {
    // TODO: Implement task deletion
    Err("Not implemented yet".to_string())
}
