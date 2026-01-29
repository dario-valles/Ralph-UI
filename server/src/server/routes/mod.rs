//! Command routing modules
//!
//! This module organizes command routing into focused sub-modules by domain:
//! - session_routes: Session management commands
//! - task_routes: Task management commands
//! - agent_routes: Agent management commands
//! - git_routes: Git and GitHub commands
//! - ralph_loop_routes: Ralph Loop execution commands
//! - prd_routes: PRD and chat commands
//! - prd_workflow_routes: PRD workflow commands (centralized PRD creation system)
//! - config_routes: Configuration and misc commands
//! - parallel_routes: Parallel execution commands (reserved for future use)

pub mod agent_routes;
pub mod config_routes;
pub mod git_routes;
pub mod parallel_routes;
pub mod prd_routes;
pub mod prd_workflow_routes;
pub mod ralph_loop_routes;
pub mod session_routes;
pub mod task_routes;

use serde::Serialize;
use serde_json::Value;

use super::ServerAppState;

// =============================================================================
// Re-export helper functions for use by route modules
// =============================================================================

/// Extract a required argument from JSON args
pub fn get_arg<T: serde::de::DeserializeOwned>(args: &Value, name: &str) -> Result<T, String> {
    serde_json::from_value(
        args.get(name)
            .ok_or_else(|| format!("Missing argument: {}", name))?
            .clone(),
    )
    .map_err(|e| format!("Invalid argument {}: {}", name, e))
}

/// Extract an optional argument from JSON args
pub fn get_opt_arg<T: serde::de::DeserializeOwned>(
    args: &Value,
    name: &str,
) -> Result<Option<T>, String> {
    match args.get(name) {
        Some(v) if !v.is_null() => serde_json::from_value(v.clone())
            .map(Some)
            .map_err(|e| format!("Invalid argument {}: {}", name, e)),
        _ => Ok(None),
    }
}

/// Execute a closure with a locked agent manager, serializing the result
pub fn with_agent_manager<T, F>(state: &ServerAppState, f: F) -> Result<Value, String>
where
    T: Serialize,
    F: FnOnce(&crate::agents::AgentManager) -> Result<T, String>,
{
    let manager = state.agent_manager.lock().map_err(|e| e.to_string())?;
    let result = f(&manager)?;
    serde_json::to_value(result).map_err(|e| e.to_string())
}

// =============================================================================
// Command Routing Macros
// =============================================================================

/// Routes a simple async command: extracts args, calls handler, serializes result
#[macro_export]
macro_rules! route_async {
    ($cmd:expr, $handler:expr) => {{
        let result = $handler.await?;
        serde_json::to_value(result).map_err(|e| e.to_string())
    }};
}

/// Routes a sync command
#[macro_export]
macro_rules! route_sync {
    ($handler:expr) => {{
        let result = $handler?;
        serde_json::to_value(result).map_err(|e| e.to_string())
    }};
}

/// Routes a command that returns ()
#[macro_export]
macro_rules! route_unit {
    ($handler:expr) => {{
        $handler?;
        Ok(serde_json::Value::Null)
    }};
}

/// Routes an async command that returns ()
#[macro_export]
macro_rules! route_unit_async {
    ($handler:expr) => {{
        $handler.await?;
        Ok(serde_json::Value::Null)
    }};
}

// Re-export macros for use in route modules
pub use route_async;
pub use route_sync;
pub use route_unit;
pub use route_unit_async;

// =============================================================================
// Main Command Dispatcher
// =============================================================================

/// Route a command to its implementation by dispatching to the appropriate sub-router
pub async fn route_command(
    cmd: &str,
    args: Value,
    state: &ServerAppState,
) -> Result<Value, String> {
    // Dispatch to the appropriate sub-router based on command name/prefix

    if session_routes::is_session_command(cmd) {
        return session_routes::route_session_command(cmd, args, state).await;
    }

    if task_routes::is_task_command(cmd) {
        return task_routes::route_task_command(cmd, args, state).await;
    }

    if agent_routes::is_agent_command(cmd) {
        return agent_routes::route_agent_command(cmd, args, state).await;
    }

    if git_routes::is_git_command(cmd) {
        return git_routes::route_git_command(cmd, args, state).await;
    }

    if ralph_loop_routes::is_ralph_loop_command(cmd) {
        return ralph_loop_routes::route_ralph_loop_command(cmd, args, state).await;
    }

    if prd_routes::is_prd_command(cmd) {
        return prd_routes::route_prd_command(cmd, args, state).await;
    }

    if prd_workflow_routes::is_prd_workflow_command(cmd) {
        return prd_workflow_routes::route_prd_workflow_command(cmd, args, state).await;
    }

    if config_routes::is_config_command(cmd) {
        return config_routes::route_config_command(cmd, args, state).await;
    }

    if parallel_routes::is_parallel_command(cmd) {
        return parallel_routes::route_parallel_command(cmd, args, state).await;
    }

    Err(format!("Unknown command: {}", cmd))
}

// =============================================================================
// Server-specific implementations (re-exported for route modules)
// =============================================================================

pub use super::proxy::{
    regenerate_ralph_prd_stories_server, send_prd_chat_message_server, start_ralph_loop_server,
    stop_ralph_loop_server,
};
