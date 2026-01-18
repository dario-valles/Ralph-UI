// Tauri command handlers for IPC communication

pub mod sessions;
pub mod tasks;
pub mod agents;
pub mod git;
pub mod github;
pub mod parallel;
pub mod prd;
pub mod prd_chat;
pub mod config;
pub mod templates;
pub mod recovery;
pub mod traces;
pub mod projects;
pub mod mission_control;

// Re-export all commands for easy registration
pub use sessions::*;
pub use tasks::*;
pub use agents::*;
pub use git::*;
pub use github::*;
pub use parallel::*;
pub use prd::*;
pub use config::*;
pub use templates::*;
pub use recovery::*;
pub use traces::*;
pub use prd_chat::*;
pub use projects::*;
pub use mission_control::*;

#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}
