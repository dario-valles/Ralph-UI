// Backend command handlers for IPC communication

pub mod agents;
pub mod config;
pub mod git;
pub mod github;
pub mod mission_control;
pub mod models;
pub mod prd;
pub mod prd_chat;
pub mod prd_workflow;
pub mod projects;
pub mod providers;
pub mod push;
pub mod ralph_loop;
pub mod recovery;
pub mod sessions;
pub mod tasks;
pub mod templates;
pub mod terminal;
pub mod traces;

// Re-export all commands for easy registration
pub use agents::*;
pub use config::*;
pub use git::*;
pub use github::*;
pub use mission_control::*;
pub use models::*;
pub use prd::*;
pub use prd_chat::*;
pub use prd_workflow::*;
pub use projects::*;
pub use providers::*;
pub use push::*;
pub use ralph_loop::*;
pub use recovery::*;
pub use sessions::*;
pub use tasks::*;
pub use templates::*;
pub use terminal::*;
pub use traces::*;
