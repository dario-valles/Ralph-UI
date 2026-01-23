use clap::Parser;
use ralph_ui_lib::agents::AgentManager;
use ralph_ui_lib::server::{self, generate_auth_token, ServerAppState};
use std::sync::Arc;
use tokio::sync::mpsc;

/// Ralph UI - HTTP/WebSocket server for autonomous AI agents
#[derive(Parser, Debug)]
#[command(name = "ralph-ui")]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Port to bind the server to
    #[arg(long, default_value = "3420")]
    port: u16,

    /// Address to bind the server to
    #[arg(long, default_value = "0.0.0.0")]
    bind: String,

    /// Fixed auth token (or set RALPH_SERVER_TOKEN env var)
    /// If not provided, a random token is generated on each startup
    #[arg(long, env = "RALPH_SERVER_TOKEN")]
    token: Option<String>,
}

fn main() {
    let cli = Cli::parse();
    run_server(cli.port, &cli.bind, cli.token);
}

fn run_server(port: u16, bind: &str, token: Option<String>) {
    // Initialize logger
    env_logger::init();

    // Create the tokio runtime
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");

    rt.block_on(async {
        // Initialize shutdown state
        let shutdown_state = ralph_ui_lib::shutdown::ShutdownState::new();
        if let Err(e) = ralph_ui_lib::shutdown::register_signal_handlers(shutdown_state.clone()) {
            log::warn!("Failed to register signal handlers: {}", e);
        }

        // Perform auto-recovery on startup
        ralph_ui_lib::perform_auto_recovery();

        // Initialize git state
        let git_state = ralph_ui_lib::commands::git::GitState::new();

        // Initialize config state
        let config_state = ralph_ui_lib::commands::config::ConfigState::new();

        // Initialize model cache state
        let model_cache_state = ralph_ui_lib::commands::models::ModelCacheState::new();

        // Create event channels (for potential future forwarding to WebSocket)
        let (rate_limit_tx, _rate_limit_rx) =
            mpsc::unbounded_channel::<ralph_ui_lib::agents::RateLimitEvent>();
        let (completion_tx, _completion_rx) =
            mpsc::unbounded_channel::<ralph_ui_lib::agents::AgentCompletionEvent>();

        // Create PTY and subagent channels
        let (pty_data_tx, pty_data_rx) =
            mpsc::unbounded_channel::<ralph_ui_lib::agents::AgentPtyDataEvent>();
        let (pty_exit_tx, pty_exit_rx) =
            mpsc::unbounded_channel::<ralph_ui_lib::agents::AgentPtyExitEvent>();
        let (subagent_tx, subagent_rx) =
            mpsc::unbounded_channel::<ralph_ui_lib::agents::SubagentEvent>();
        let (tool_call_tx, tool_call_rx) =
            mpsc::unbounded_channel::<ralph_ui_lib::agents::ToolCallStartEvent>();
        let (tool_call_complete_tx, tool_call_complete_rx) =
            mpsc::unbounded_channel::<ralph_ui_lib::agents::ToolCallCompleteEvent>();

        // Initialize AgentManager
        let mut agent_manager = AgentManager::new();
        agent_manager.set_pty_data_sender(pty_data_tx);
        agent_manager.set_pty_exit_sender(pty_exit_tx);
        agent_manager.set_subagent_sender(subagent_tx);
        agent_manager.set_tool_call_sender(tool_call_tx);
        agent_manager.set_tool_call_complete_sender(tool_call_complete_tx);
        let agent_manager = Arc::new(std::sync::Mutex::new(agent_manager));

        // Initialize Plugin Registry
        let plugin_registry =
            Arc::new(std::sync::Mutex::new(ralph_ui_lib::plugins::PluginRegistry::new()));

        // Initialize Ralph loop state
        let ralph_loop_state = ralph_ui_lib::commands::ralph_loop::RalphLoopManagerState::new();

        // Use provided token or generate a random one
        let auth_token = token.unwrap_or_else(generate_auth_token);

        // Create server state
        let state = ServerAppState::new(
            auth_token,
            git_state,
            config_state,
            shutdown_state,
            model_cache_state,
            agent_manager,
            plugin_registry,
            ralph_loop_state,
            rate_limit_tx,
            completion_tx,
        );

        // Spawn event forwarders to broadcast agent events to WebSocket clients
        let broadcaster = state.broadcaster.clone();
        tokio::spawn(forward_pty_data_events(broadcaster, pty_data_rx));

        let broadcaster = state.broadcaster.clone();
        tokio::spawn(forward_pty_exit_events(broadcaster, pty_exit_rx));

        let broadcaster = state.broadcaster.clone();
        tokio::spawn(forward_subagent_events(broadcaster, subagent_rx));

        let broadcaster = state.broadcaster.clone();
        tokio::spawn(forward_tool_call_events(broadcaster, tool_call_rx));

        let broadcaster = state.broadcaster.clone();
        tokio::spawn(forward_tool_call_complete_events(broadcaster, tool_call_complete_rx));

        // Run the server
        if let Err(e) = server::run_server(port, bind, state).await {
            eprintln!("Server error: {}", e);
            std::process::exit(1);
        }
    });
}

/// Forward PTY data events from agents to WebSocket clients
async fn forward_pty_data_events(
    broadcaster: std::sync::Arc<ralph_ui_lib::server::EventBroadcaster>,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<ralph_ui_lib::agents::AgentPtyDataEvent>,
) {
    log::debug!("Server PTY data event forwarder started");

    while let Some(event) = rx.recv().await {
        log::trace!(
            "Broadcasting PTY data event for agent {} ({} bytes)",
            event.agent_id,
            event.data.len()
        );
        broadcaster.broadcast(
            "agent-pty-data",
            serde_json::json!({
                "agentId": event.agent_id,
                "data": event.data,
            }),
        );
    }

    log::debug!("Server PTY data event forwarder stopped");
}

/// Forward PTY exit events from agents to WebSocket clients
async fn forward_pty_exit_events(
    broadcaster: std::sync::Arc<ralph_ui_lib::server::EventBroadcaster>,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<ralph_ui_lib::agents::AgentPtyExitEvent>,
) {
    log::debug!("Server PTY exit event forwarder started");

    while let Some(event) = rx.recv().await {
        log::trace!(
            "Broadcasting PTY exit event for agent {} (code {})",
            event.agent_id,
            event.exit_code
        );
        broadcaster.broadcast(
            "agent-pty-exit",
            serde_json::json!({
                "agentId": event.agent_id,
                "exitCode": event.exit_code,
            }),
        );
    }

    log::debug!("Server PTY exit event forwarder stopped");
}

/// Forward subagent events to WebSocket clients
async fn forward_subagent_events(
    broadcaster: std::sync::Arc<ralph_ui_lib::server::EventBroadcaster>,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<ralph_ui_lib::agents::SubagentEvent>,
) {
    use ralph_ui_lib::agents::SubagentEventType;

    log::debug!("Server subagent event forwarder started");

    while let Some(event) = rx.recv().await {
        let event_name = match event.event_type {
            SubagentEventType::Spawned => "subagent-spawned",
            SubagentEventType::Completed => "subagent-completed",
            SubagentEventType::Failed => "subagent-failed",
            SubagentEventType::Progress => "subagent-progress",
        };

        broadcaster.broadcast(
            event_name,
            serde_json::json!({
                "parentAgentId": event.parent_agent_id,
                "subagentId": event.subagent_id,
                "description": event.description,
                "eventType": format!("{:?}", event.event_type),
            }),
        );
    }

    log::debug!("Server subagent event forwarder stopped");
}

/// Forward tool call start events to WebSocket clients
async fn forward_tool_call_events(
    broadcaster: std::sync::Arc<ralph_ui_lib::server::EventBroadcaster>,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<ralph_ui_lib::agents::ToolCallStartEvent>,
) {
    log::debug!("Server tool call event forwarder started");

    while let Some(event) = rx.recv().await {
        broadcaster.broadcast(
            "tool-call-start",
            serde_json::json!({
                "agentId": event.agent_id,
                "toolName": event.tool_name,
                "toolId": event.tool_id,
                "input": event.input,
                "timestamp": event.timestamp,
            }),
        );
    }

    log::debug!("Server tool call event forwarder stopped");
}

/// Forward tool call complete events to WebSocket clients
async fn forward_tool_call_complete_events(
    broadcaster: std::sync::Arc<ralph_ui_lib::server::EventBroadcaster>,
    mut rx: tokio::sync::mpsc::UnboundedReceiver<ralph_ui_lib::agents::ToolCallCompleteEvent>,
) {
    log::debug!("Server tool call complete event forwarder started");

    while let Some(event) = rx.recv().await {
        broadcaster.broadcast(
            "tool-call-complete",
            serde_json::json!({
                "agentId": event.agent_id,
                "toolId": event.tool_id,
                "output": event.output,
                "isError": event.is_error,
                "timestamp": event.timestamp,
            }),
        );
    }

    log::debug!("Server tool call complete event forwarder stopped");
}
