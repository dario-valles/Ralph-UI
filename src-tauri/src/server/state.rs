//! Server application state shared across handlers

use super::events::EventBroadcaster;
use crate::agents::AgentManager;
use crate::commands::config::ConfigState;
use crate::commands::git::GitState;
use crate::commands::models::ModelCacheState;
use crate::commands::ralph_loop::RalphLoopManagerState;
use crate::plugins::PluginRegistry;
use crate::shutdown::ShutdownState;
use std::sync::Arc;

/// Shared state for the server, containing all the managers and state
/// that would normally be managed by Tauri's state system.
#[derive(Clone)]
pub struct ServerAppState {
    /// Authentication token for this session
    pub auth_token: String,

    /// Git manager state
    pub git_state: Arc<GitState>,

    /// Configuration state
    pub config_state: Arc<ConfigState>,

    /// Shutdown state
    pub shutdown_state: ShutdownState,

    /// Model cache state
    pub model_cache_state: Arc<ModelCacheState>,

    /// Event broadcaster for WebSocket clients
    pub broadcaster: Arc<EventBroadcaster>,

    /// Agent manager state (shared with Ralph loop)
    pub agent_manager: Arc<std::sync::Mutex<AgentManager>>,

    /// Plugin registry
    pub plugin_registry: Arc<std::sync::Mutex<PluginRegistry>>,

    /// Ralph loop manager state
    pub ralph_loop_state: Arc<RalphLoopManagerState>,

    /// Rate limit event sender
    pub rate_limit_sender: tokio::sync::mpsc::UnboundedSender<crate::agents::RateLimitEvent>,

    /// Completion event sender
    pub completion_sender: tokio::sync::mpsc::UnboundedSender<crate::agents::AgentCompletionEvent>,
}

impl ServerAppState {
    /// Create a new server application state with all necessary managers initialized
    pub fn new(
        auth_token: String,
        git_state: GitState,
        config_state: ConfigState,
        shutdown_state: ShutdownState,
        model_cache_state: ModelCacheState,
        agent_manager: Arc<std::sync::Mutex<AgentManager>>,
        plugin_registry: Arc<std::sync::Mutex<PluginRegistry>>,
        ralph_loop_state: RalphLoopManagerState,
        rate_limit_sender: tokio::sync::mpsc::UnboundedSender<crate::agents::RateLimitEvent>,
        completion_sender: tokio::sync::mpsc::UnboundedSender<crate::agents::AgentCompletionEvent>,
    ) -> Self {
        Self {
            auth_token,
            git_state: Arc::new(git_state),
            config_state: Arc::new(config_state),
            shutdown_state,
            model_cache_state: Arc::new(model_cache_state),
            broadcaster: Arc::new(EventBroadcaster::new()),
            agent_manager,
            plugin_registry,
            ralph_loop_state: Arc::new(ralph_loop_state),
            rate_limit_sender,
            completion_sender,
        }
    }
}
