// Tauri command handlers for IPC communication

pub mod sessions;
pub mod tasks;
pub mod agents;

// Re-export all commands for easy registration
pub use sessions::*;
pub use tasks::*;
pub use agents::*;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
