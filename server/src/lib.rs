// Clippy allows for reasonable defaults
// These suppress warnings that would require refactoring across many files
// or where the suggested change doesn't improve readability
#![allow(clippy::too_many_arguments)] // Command handlers often need many params
#![allow(clippy::new_without_default)] // Default not always appropriate for stateful types
#![allow(clippy::derivable_impls)] // Explicit Default impls can be clearer
#![allow(clippy::field_reassign_with_default)] // Builder pattern is clearer
#![allow(clippy::unnecessary_map_or)] // map_or can be clearer than alternatives
#![allow(clippy::single_char_add_str)] // push_str("\n") reads better than push('\n')
#![allow(clippy::needless_borrow)] // Explicit borrows can clarify ownership
#![allow(clippy::useless_conversion)] // .into() can clarify type boundaries
#![allow(clippy::clone_on_copy)] // .clone() can be clearer than implicit copy
#![allow(clippy::collapsible_if)] // Separate ifs can be more readable
#![allow(clippy::needless_question_mark)] // Explicit ? can clarify error propagation
#![allow(clippy::manual_flatten)] // Explicit iteration can be clearer
#![allow(clippy::double_ended_iterator_last)] // .last() on chains can be clearer
#![allow(clippy::redundant_closure)] // |x| f(x) can be clearer than f
#![allow(clippy::needless_borrows_for_generic_args)] // Explicit borrows clarify intent
#![allow(clippy::unwrap_or_default)] // unwrap_or_else(Default::default) can be clearer
#![allow(clippy::format_in_format_args)] // Nested format! can be clearer for complex strings
#![allow(clippy::manual_strip)] // Manual prefix stripping can be clearer
#![allow(clippy::unnecessary_mut_passed)] // Explicit mut can clarify intent

// Module declarations
pub mod agents;
pub mod commands;
mod config;
pub mod events;
pub mod file_storage;
mod git;
mod github;
mod models;
pub mod parsers;
pub mod plugins;
pub mod prd_workflow;
pub mod push;
pub mod ralph_loop;
mod session;
pub mod shutdown;
mod templates;
mod utils;
pub mod watchers;

// Server module (HTTP/WebSocket API)
pub mod server;

// Re-export models for use in commands
pub use models::*;
pub use utils::as_path;

use std::sync::Arc;
use tokio::sync::mpsc;

/// State for rate limit event forwarding to the frontend
pub struct RateLimitEventState {
    /// Sender for rate limit events (used by AgentPool/Manager)
    pub sender: mpsc::UnboundedSender<agents::RateLimitEvent>,
}

impl RateLimitEventState {
    pub fn new(sender: mpsc::UnboundedSender<agents::RateLimitEvent>) -> Self {
        Self { sender }
    }

    /// Get a clone of the sender for passing to scheduler/pool
    pub fn get_sender(&self) -> mpsc::UnboundedSender<agents::RateLimitEvent> {
        self.sender.clone()
    }
}

/// State for agent completion event forwarding to the frontend
pub struct CompletionEventState {
    /// Sender for completion events (used by AgentManager)
    pub sender: mpsc::UnboundedSender<agents::AgentCompletionEvent>,
}

impl CompletionEventState {
    pub fn new(sender: mpsc::UnboundedSender<agents::AgentCompletionEvent>) -> Self {
        Self { sender }
    }

    /// Get a clone of the sender for passing to scheduler/pool
    pub fn get_sender(&self) -> mpsc::UnboundedSender<agents::AgentCompletionEvent> {
        self.sender.clone()
    }
}

/// State for PRD file watcher manager
pub struct PrdFileWatcherState {
    /// Manager for PRD file watchers
    pub manager: std::sync::Mutex<Option<watchers::PrdFileWatcherManager>>,
    /// Sender for PRD file updates
    pub sender: mpsc::UnboundedSender<watchers::PrdFileUpdate>,
}

impl PrdFileWatcherState {
    pub fn new(sender: mpsc::UnboundedSender<watchers::PrdFileUpdate>) -> Self {
        let manager = watchers::PrdFileWatcherManager::new(sender.clone());
        Self {
            manager: std::sync::Mutex::new(Some(manager)),
            sender,
        }
    }
}

/// State for AgentManager - manages PTY associations and output processing for agents
pub struct AgentManagerState {
    /// The agent manager instance (Arc-wrapped for sharing with Ralph loop)
    pub manager: Arc<std::sync::Mutex<agents::AgentManager>>,
}

impl AgentManagerState {
    pub fn new(
        pty_data_tx: mpsc::UnboundedSender<agents::AgentPtyDataEvent>,
        subagent_tx: mpsc::UnboundedSender<agents::SubagentEvent>,
        tool_call_tx: mpsc::UnboundedSender<agents::ToolCallStartEvent>,
        tool_call_complete_tx: mpsc::UnboundedSender<agents::ToolCallCompleteEvent>,
    ) -> Self {
        let mut manager = agents::AgentManager::new();
        manager.set_pty_data_sender(pty_data_tx);
        manager.set_subagent_sender(subagent_tx);
        manager.set_tool_call_sender(tool_call_tx);
        manager.set_tool_call_complete_sender(tool_call_complete_tx);
        Self {
            manager: Arc::new(std::sync::Mutex::new(manager)),
        }
    }

    /// Get a clone of the Arc for sharing with async tasks
    pub fn clone_manager(&self) -> Arc<std::sync::Mutex<agents::AgentManager>> {
        self.manager.clone()
    }
}

/// State for Plugin Registry
pub struct PluginRegistryState {
    pub registry: std::sync::Mutex<plugins::PluginRegistry>,
}

impl PluginRegistryState {
    pub fn new() -> Self {
        Self {
            registry: std::sync::Mutex::new(plugins::PluginRegistry::new()),
        }
    }
}

impl Default for PluginRegistryState {
    fn default() -> Self {
        Self::new()
    }
}

/// Perform automatic recovery of stale sessions on startup
/// This checks all registered project paths for sessions that were left in Active state
/// but have stale lock files (indicating a crash), and transitions them to Paused.
///
/// Note: This uses file-based storage via the project registry.
pub fn perform_auto_recovery() {
    // Get all registered project paths from file-based project storage
    let project_paths: Vec<String> = match file_storage::projects::get_all_projects() {
        Ok(projects) => projects.into_iter().map(|p| p.path).collect(),
        Err(e) => {
            log::warn!("Failed to get project paths for auto-recovery: {}", e);
            return;
        }
    };

    if project_paths.is_empty() {
        log::debug!("No projects found, skipping auto-recovery");
        return;
    }

    log::info!(
        "Checking {} project paths for stale sessions",
        project_paths.len()
    );

    let mut total_recovered = 0;

    for project_path in project_paths {
        let path = as_path(&project_path);

        // Skip if path doesn't exist (project may have been moved/deleted)
        if !path.exists() {
            log::debug!("Skipping non-existent project path: {}", project_path);
            continue;
        }

        // Perform stale session recovery using file-based storage
        match session::auto_recover_on_startup(path) {
            Ok(results) => {
                for result in &results {
                    log::info!(
                        "Auto-recovered session '{}': {} tasks unassigned",
                        result.session_id,
                        result.tasks_unassigned
                    );
                }
                total_recovered += results.len();
            }
            Err(e) => {
                log::warn!("Auto-recovery failed for project '{}': {}", project_path, e);
            }
        }

        // Recover stale Ralph loop executions using file-based storage
        recover_stale_ralph_executions(&project_path);
    }

    if total_recovered > 0 {
        log::info!(
            "Auto-recovery complete: {} sessions recovered",
            total_recovered
        );
    } else {
        log::debug!("Auto-recovery complete: no stale sessions found");
    }
}

/// Recover Ralph loop executions that were left running after a crash
/// This checks for executions with stale heartbeats and marks their in-progress
/// iterations as interrupted.
fn recover_stale_ralph_executions(project_path: &str) {
    // Default threshold: 2 minutes (heartbeat interval is 30 seconds)
    const STALE_THRESHOLD_SECS: i64 = 120;

    let path = as_path(project_path);
    let stale_executions =
        match file_storage::iterations::get_stale_executions(path, STALE_THRESHOLD_SECS) {
            Ok(executions) => executions,
            Err(e) => {
                log::warn!(
                    "Failed to check for stale Ralph loop executions in {}: {}",
                    project_path,
                    e
                );
                return;
            }
        };

    if stale_executions.is_empty() {
        return;
    }

    log::info!(
        "Found {} stale Ralph loop executions to recover in {}",
        stale_executions.len(),
        project_path
    );

    for snapshot in stale_executions {
        let completed_at = chrono::Utc::now().to_rfc3339();

        // Mark in-progress iterations as interrupted
        match file_storage::iterations::mark_interrupted_iterations(
            path,
            &snapshot.execution_id,
            &completed_at,
        ) {
            Ok(count) => {
                if count > 0 {
                    log::info!(
                        "Recovered Ralph loop execution {}: {} iterations marked as interrupted",
                        snapshot.execution_id,
                        count
                    );
                }
            }
            Err(e) => {
                log::warn!(
                    "Failed to recover iterations for execution {}: {}",
                    snapshot.execution_id,
                    e
                );
            }
        }

        // Clean up the execution state
        if let Err(e) =
            file_storage::iterations::delete_execution_state(path, &snapshot.execution_id)
        {
            log::warn!(
                "Failed to delete execution state for {}: {}",
                snapshot.execution_id,
                e
            );
        }
    }
}
