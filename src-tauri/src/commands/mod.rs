// Tauri command handlers for IPC communication

pub mod sessions;
pub mod tasks;
pub mod agents;
pub mod git;
pub mod github;
pub mod parallel;
pub mod prd;

// Re-export all commands for easy registration
pub use sessions::*;
pub use tasks::*;
pub use agents::*;
pub use git::*;
pub use github::*;
pub use parallel::*;
pub use prd::*;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
