// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;

/// Ralph UI - Cross-platform desktop UI for autonomous AI agents
#[derive(Parser, Debug)]
#[command(name = "ralph-ui")]
#[command(author, version, about, long_about = None)]
struct Cli {
    /// Run in server mode (HTTP/WebSocket API instead of native GUI)
    #[arg(long)]
    server: bool,

    /// Port to bind the server to (only used with --server)
    #[arg(long, default_value = "3420")]
    port: u16,

    /// Address to bind the server to (only used with --server)
    #[arg(long, default_value = "0.0.0.0")]
    bind: String,
}

fn main() {
    let cli = Cli::parse();

    if cli.server {
        #[cfg(feature = "server")]
        {
            run_server_mode(cli.port, &cli.bind);
        }

        #[cfg(not(feature = "server"))]
        {
            eprintln!("Error: Server mode requires the 'server' feature to be enabled.");
            eprintln!("Rebuild with: cargo build --features server");
            std::process::exit(1);
        }
    } else {
        // Normal Tauri desktop mode
        ralph_ui_lib::run()
    }
}

#[cfg(feature = "server")]
fn run_server_mode(port: u16, bind: &str) {
    use ralph_ui_lib::agents::AgentManager;
    use ralph_ui_lib::server::{self, generate_auth_token, ServerAppState};
    use std::sync::Arc;
    use tokio::sync::mpsc;

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

        // Create PTY and subagent channels (not used in server mode but needed for AgentManager)
        let (pty_data_tx, _pty_data_rx) =
            mpsc::unbounded_channel::<ralph_ui_lib::agents::AgentPtyDataEvent>();
        let (subagent_tx, _subagent_rx) =
            mpsc::unbounded_channel::<ralph_ui_lib::agents::SubagentEvent>();
        let (tool_call_tx, _tool_call_rx) =
            mpsc::unbounded_channel::<ralph_ui_lib::agents::ToolCallStartEvent>();
        let (tool_call_complete_tx, _tool_call_complete_rx) =
            mpsc::unbounded_channel::<ralph_ui_lib::agents::ToolCallCompleteEvent>();

        // Initialize AgentManager
        let mut agent_manager = AgentManager::new();
        agent_manager.set_pty_data_sender(pty_data_tx);
        agent_manager.set_subagent_sender(subagent_tx);
        agent_manager.set_tool_call_sender(tool_call_tx);
        agent_manager.set_tool_call_complete_sender(tool_call_complete_tx);
        let agent_manager = Arc::new(std::sync::Mutex::new(agent_manager));

        // Initialize Plugin Registry
        let plugin_registry =
            Arc::new(std::sync::Mutex::new(ralph_ui_lib::plugins::PluginRegistry::new()));

        // Initialize Ralph loop state
        let ralph_loop_state = ralph_ui_lib::commands::ralph_loop::RalphLoopManagerState::new();

        // Generate auth token
        let auth_token = generate_auth_token();

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

        // Run the server
        if let Err(e) = server::run_server(port, bind, state).await {
            eprintln!("Server error: {}", e);
            std::process::exit(1);
        }
    });
}
