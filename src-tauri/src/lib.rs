// Module declarations
mod commands;
mod models;
mod database;
mod git;
mod github;
pub mod agents;
mod utils;
pub mod parsers;
mod session;
mod templates;
mod config;
pub mod events;
pub mod shutdown;
pub mod watchers;
pub mod session_files;
pub mod ralph_loop;
pub mod file_storage;
pub mod plugins;
pub mod gsd;

// Re-export models for use in commands
pub use models::*;

use std::path::Path;
use std::sync::Arc;
use tauri::Emitter;
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

// Note: AgentManagerState doesn't have a Default impl because it requires a pty_data_tx channel

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logger
    env_logger::init();

    // Initialize shutdown state and register signal handlers
    let shutdown_state = shutdown::ShutdownState::new();
    if let Err(e) = shutdown::register_signal_handlers(shutdown_state.clone()) {
        log::warn!("Failed to register signal handlers: {}", e);
    }

    // Initialize database
    let db_path = std::env::var("RALPH_DB_PATH")
        .unwrap_or_else(|_| {
            let mut path = std::env::current_dir().unwrap();
            path.push("ralph-ui.db");
            path.to_str().unwrap().to_string()
        });

    let db = database::Database::new(&db_path)
        .expect("Failed to open database");

    db.init().expect("Failed to initialize database");

    // Perform auto-recovery on startup
    // Check all known project paths for stale sessions that need recovery
    perform_auto_recovery(&db);

    // Initialize git state
    let git_state = commands::git::GitState::new();

    // Initialize config state
    let config_state = commands::config::ConfigState::new();

    // Initialize model cache state for dynamic model discovery
    let model_cache_state = commands::models::ModelCacheState::new();

    // Create rate limit event channel for forwarding to frontend
    let (rate_limit_tx, rate_limit_rx) = mpsc::unbounded_channel::<agents::RateLimitEvent>();
    let rate_limit_state = RateLimitEventState::new(rate_limit_tx);

    // Create agent completion event channel for forwarding to frontend
    let (completion_tx, completion_rx) = mpsc::unbounded_channel::<agents::AgentCompletionEvent>();
    let completion_state = CompletionEventState::new(completion_tx);

    // Create PRD file watcher event channel for forwarding to frontend
    let (prd_file_tx, prd_file_rx) = mpsc::unbounded_channel::<watchers::PrdFileUpdate>();
    let prd_file_watcher_state = PrdFileWatcherState::new(prd_file_tx);

    // Create PTY data event channel for forwarding agent output to frontend
    let (pty_data_tx, pty_data_rx) = mpsc::unbounded_channel::<agents::AgentPtyDataEvent>();

    // Create subagent event channel for forwarding structured agent events to frontend
    let (subagent_tx, subagent_rx) = mpsc::unbounded_channel::<agents::SubagentEvent>();

    // Create tool call event channels for forwarding tool call events to frontend
    let (tool_call_tx, tool_call_rx) = mpsc::unbounded_channel::<agents::ToolCallStartEvent>();
    let (tool_call_complete_tx, tool_call_complete_rx) =
        mpsc::unbounded_channel::<agents::ToolCallCompleteEvent>();

    // Initialize AgentManager state for PTY tracking (with PTY data sender and tool call senders)
    let agent_manager_state =
        AgentManagerState::new(pty_data_tx, subagent_tx, tool_call_tx, tool_call_complete_tx);

    // Initialize Plugin Registry state
    let plugin_registry_state = PluginRegistryState::new();

    // Initialize Ralph loop state for external loop orchestration
    let ralph_loop_state = commands::ralph_loop::RalphLoopManagerState::new();

    // Log startup info
    log::info!("Ralph-UI starting up");
    log::info!("Database path: {}", db_path);

    tauri::Builder::default()
        .manage(std::sync::Mutex::new(db))
        .manage(git_state)
        .manage(config_state)
        .manage(shutdown_state)
        .manage(rate_limit_state)
        .manage(completion_state)
        .manage(model_cache_state)
        .manage(prd_file_watcher_state)
        .manage(agent_manager_state)
        .manage(plugin_registry_state)
        .manage(ralph_loop_state)
        .setup(move |app| {
            // Clone app handles for each event forwarder task
            let rate_limit_handle = app.handle().clone();
            let completion_handle = app.handle().clone();
            let prd_file_handle = app.handle().clone();
            let pty_data_handle = app.handle().clone();
            let subagent_handle = app.handle().clone();

            // Spawn task to forward rate limit events to Tauri frontend events
            tauri::async_runtime::spawn(async move {
                forward_rate_limit_events(rate_limit_handle, rate_limit_rx).await;
            });
            // Spawn task to forward agent completion events to Tauri frontend events
            tauri::async_runtime::spawn(async move {
                forward_completion_events(completion_handle, completion_rx).await;
            });
            // Spawn task to forward PRD file update events to Tauri frontend events
            tauri::async_runtime::spawn(async move {
                forward_prd_file_events(prd_file_handle, prd_file_rx).await;
            });
            // Spawn task to forward PTY data events to Tauri frontend events
            tauri::async_runtime::spawn(async move {
                forward_pty_data_events(pty_data_handle, pty_data_rx).await;
            });
            // Spawn task to forward subagent events to Tauri frontend events
            tauri::async_runtime::spawn(async move {
                forward_subagent_events(subagent_handle, subagent_rx).await;
            });
            // Spawn task to forward tool call start events to Tauri frontend events
            let tool_call_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                forward_tool_call_start_events(tool_call_handle, tool_call_rx).await;
            });
            // Spawn task to forward tool call complete events to Tauri frontend events
            let tool_call_complete_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                forward_tool_call_complete_events(tool_call_complete_handle, tool_call_complete_rx)
                    .await;
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_pty::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            commands::create_session,
            commands::get_sessions,
            commands::get_session,
            commands::update_session,
            commands::delete_session,
            commands::update_session_status,
            commands::create_task,
            commands::get_task,
            commands::get_tasks_for_session,
            commands::update_task,
            commands::delete_task,
            commands::update_task_status,
            commands::import_prd,
            commands::create_prd,
            commands::get_prd,
            commands::update_prd,
            commands::delete_prd,
            commands::list_prds,
            commands::scan_prd_files,
            commands::get_prd_file,
            commands::update_prd_file,
            commands::list_prd_templates,
            commands::export_prd,
            commands::analyze_prd_quality,
            // NOTE: execute_prd is deprecated - use convert_prd_file_to_ralph instead
            // commands::execute_prd,
            commands::create_agent,
            commands::get_agent,
            commands::get_agents_for_session,
            commands::get_agents_for_task,
            commands::get_active_agents,
            commands::get_all_active_agents,
            commands::update_agent_status,
            commands::update_agent_metrics,
            commands::update_agent_process_id,
            commands::delete_agent,
            commands::add_agent_log,
            commands::get_agent_logs,
            commands::cleanup_stale_agents,
            // Agent PTY commands
            commands::agent_has_pty,
            commands::get_agent_pty_id,
            commands::get_agent_pty_history,
            commands::register_agent_pty,
            commands::unregister_agent_pty,
            commands::process_agent_pty_data,
            commands::notify_agent_pty_exit,
            commands::get_agent_command_line,
            commands::git_create_branch,
            commands::git_create_branch_from_commit,
            commands::git_delete_branch,
            commands::git_list_branches,
            commands::git_get_current_branch,
            commands::git_checkout_branch,
            commands::git_create_worktree,
            commands::git_list_worktrees,
            commands::git_remove_worktree,
            commands::git_get_status,
            commands::git_get_commit_history,
            commands::git_get_commit,
            commands::git_create_commit,
            commands::git_stage_files,
            commands::git_stage_all,
            commands::git_get_diff,
            commands::git_get_working_diff,
            commands::git_is_repository,
            commands::git_init_repository,
            commands::git_merge_branch,
            commands::git_merge_abort,
            commands::git_check_merge_conflicts,
            commands::git_get_conflict_details,
            commands::git_resolve_conflict,
            commands::git_complete_merge,
            commands::git_push_branch,
            commands::git_resolve_conflicts_with_ai,
            // GitHub commands
            commands::github_create_pull_request,
            commands::github_get_pull_request,
            commands::github_list_pull_requests,
            commands::github_get_issue,
            commands::github_list_issues,
            commands::github_import_issues_to_prd,
            // Config commands
            commands::get_config,
            commands::set_config_project_path,
            commands::get_config_paths_cmd,
            commands::update_execution_config,
            commands::update_git_config,
            commands::update_validation_config,
            commands::update_fallback_config,
            commands::reload_config,
            commands::save_config,
            // Template commands
            commands::list_templates,
            commands::list_builtin_templates,
            commands::render_template,
            commands::render_task_prompt,
            commands::get_template_content,
            // Recovery commands
            commands::check_stale_sessions,
            commands::recover_stale_session,
            commands::recover_all_stale_sessions,
            commands::acquire_session_lock,
            commands::release_session_lock,
            commands::get_session_lock_info,
            commands::refresh_session_lock,
            // Trace commands
            commands::init_trace_parser,
            commands::parse_agent_output,
            commands::get_subagent_tree,
            commands::get_subagent_summary,
            commands::get_subagent_events,
            commands::clear_trace_data,
            commands::is_subagent_active,
            // PRD Chat commands
            commands::update_prd_chat_agent,
            commands::start_prd_chat_session,
            commands::send_prd_chat_message,
            commands::get_prd_chat_history,
            commands::list_prd_chat_sessions,
            commands::delete_prd_chat_session,
            commands::assess_prd_quality,
            commands::get_guided_questions,
            commands::preview_prd_extraction,
            commands::check_agent_availability,
            commands::get_extracted_structure,
            commands::set_structured_mode,
            commands::clear_extracted_structure,
            // Project commands
            commands::register_project,
            commands::get_project,
            commands::get_project_by_path,
            commands::get_all_projects,
            commands::get_recent_projects,
            commands::get_favorite_projects,
            commands::update_project_name,
            commands::toggle_project_favorite,
            commands::set_project_favorite,
            commands::touch_project,
            commands::delete_project,
            // Mission Control commands
            commands::get_activity_feed,
            commands::get_global_stats,
            // Model discovery commands
            commands::get_available_models,
            commands::refresh_models,
            // PRD file watcher commands
            commands::start_watching_prd_file,
            commands::stop_watching_prd_file,
            commands::get_prd_plan_content,
            // Ralph loop commands
            commands::init_ralph_prd,
            commands::get_ralph_prd,
            commands::get_ralph_prd_status,
            commands::mark_ralph_story_passing,
            commands::mark_ralph_story_failing,
            commands::add_ralph_story,
            commands::remove_ralph_story,
            commands::get_ralph_progress,
            commands::get_ralph_progress_summary,
            commands::add_ralph_progress_note,
            commands::clear_ralph_progress,
            commands::get_ralph_prompt,
            commands::set_ralph_prompt,
            commands::start_ralph_loop,
            commands::stop_ralph_loop,
            commands::get_ralph_loop_state,
            commands::get_ralph_loop_metrics,
            commands::list_ralph_loop_executions,
            commands::get_ralph_loop_current_agent,
            commands::get_ralph_loop_worktree_path,
            commands::cleanup_ralph_worktree,
            commands::list_ralph_worktrees,
            commands::convert_prd_to_ralph,
            commands::convert_prd_file_to_ralph,
            commands::has_ralph_files,
            commands::get_ralph_files,
            commands::get_ralph_config,
            commands::set_ralph_config,
            commands::init_ralph_config,
            commands::update_ralph_config,
            // Ralph iteration history commands
            commands::get_ralph_iteration_history,
            commands::get_ralph_iteration_stats,
            commands::get_all_ralph_iterations,
            commands::save_ralph_iteration,
            commands::update_ralph_iteration,
            commands::save_ralph_execution_state,
            commands::update_ralph_heartbeat,
            commands::get_ralph_execution_state,
            commands::check_stale_ralph_executions,
            commands::recover_stale_ralph_iterations,
            commands::delete_ralph_iteration_history,
            commands::get_ralph_loop_snapshot,
            commands::cleanup_ralph_iteration_history,
            // Notification commands (US-005)
            commands::send_test_notification,
            // GSD workflow commands
            commands::start_gsd_session,
            commands::get_gsd_state,
            commands::update_gsd_phase,
            commands::update_questioning_context,
            commands::generate_project_document,
            commands::start_research,
            commands::get_research_results,
            commands::synthesize_research_cmd,
            commands::generate_requirements_from_research,
            commands::scope_requirements,
            commands::validate_requirements,
            commands::save_requirements,
            commands::load_requirements,
            commands::create_roadmap,
            commands::load_roadmap,
            commands::verify_gsd_plans,
            commands::export_gsd_to_ralph,
            commands::save_planning_file,
            commands::read_gsd_planning_file,
            commands::list_gsd_sessions,
            commands::delete_gsd_session,
            commands::add_requirement,
            commands::get_verification_history,
            commands::clear_verification_history,
            commands::get_available_research_agents,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Perform automatic recovery of stale sessions on startup
/// This checks all known project paths for sessions that were left in Active state
/// but have stale lock files (indicating a crash), and transitions them to Paused.
/// It also imports any sessions from per-project .ralph-ui/sessions/ directories.
fn perform_auto_recovery(db: &database::Database) {
    let conn = db.get_connection();

    // Get all unique project paths from existing sessions
    let project_paths = match database::sessions::get_unique_project_paths(conn) {
        Ok(paths) => paths,
        Err(e) => {
            log::warn!("Failed to get project paths for auto-recovery: {}", e);
            return;
        }
    };

    if project_paths.is_empty() {
        log::debug!("No sessions found, skipping auto-recovery");
        return;
    }

    log::info!("Checking {} project paths for stale sessions and file imports", project_paths.len());

    let mut total_recovered = 0;
    let mut total_imported = 0;

    for project_path in project_paths {
        let path = Path::new(&project_path);

        // Skip if path doesn't exist (project may have been moved/deleted)
        if !path.exists() {
            log::debug!("Skipping non-existent project path: {}", project_path);
            continue;
        }

        // Import sessions from .ralph-ui/sessions/ directory
        match session_files::import_sessions_from_project(conn, path) {
            Ok(imported) => {
                total_imported += imported.len();
            }
            Err(e) => {
                log::warn!(
                    "Session file import failed for project '{}': {}",
                    project_path,
                    e
                );
            }
        }

        // Perform stale session recovery
        match session::auto_recover_on_startup(conn, path) {
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
                log::warn!(
                    "Auto-recovery failed for project '{}': {}",
                    project_path,
                    e
                );
            }
        }
    }

    if total_imported > 0 {
        log::info!("Imported {} sessions from project files", total_imported);
    }

    if total_recovered > 0 {
        log::info!("Auto-recovery complete: {} sessions recovered", total_recovered);
    } else {
        log::debug!("Auto-recovery complete: no stale sessions found");
    }

    // Recover stale Ralph loop executions (crash recovery)
    recover_stale_ralph_executions(conn);
}

/// Recover Ralph loop executions that were left running after a crash
/// This checks for executions with stale heartbeats and marks their in-progress
/// iterations as interrupted.
fn recover_stale_ralph_executions(conn: &rusqlite::Connection) {
    // Default threshold: 2 minutes (heartbeat interval is 30 seconds)
    const STALE_THRESHOLD_SECS: i64 = 120;

    let stale_executions = match database::ralph_iterations::get_stale_executions(conn, STALE_THRESHOLD_SECS) {
        Ok(executions) => executions,
        Err(e) => {
            log::warn!("Failed to check for stale Ralph loop executions: {}", e);
            return;
        }
    };

    if stale_executions.is_empty() {
        log::debug!("No stale Ralph loop executions found");
        return;
    }

    log::info!("Found {} stale Ralph loop executions to recover", stale_executions.len());

    for snapshot in stale_executions {
        let completed_at = chrono::Utc::now().to_rfc3339();

        // Mark in-progress iterations as interrupted
        match database::ralph_iterations::mark_interrupted_iterations(
            conn,
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
        if let Err(e) = database::ralph_iterations::delete_execution_state(conn, &snapshot.execution_id) {
            log::warn!(
                "Failed to delete execution state for {}: {}",
                snapshot.execution_id,
                e
            );
        }
    }
}

/// Forward rate limit events from the AgentManager to Tauri frontend events
/// This runs as a background task that listens for rate limit events on the channel
/// and emits them to the frontend via Tauri's event system.
async fn forward_rate_limit_events(
    app_handle: tauri::AppHandle,
    mut rx: mpsc::UnboundedReceiver<agents::RateLimitEvent>,
) {
    use crate::agents::rate_limiter::RateLimitType;

    log::debug!("Rate limit event forwarder started");

    while let Some(event) = rx.recv().await {
        // Convert RateLimitType to string for the frontend
        let limit_type_str = match event.rate_limit_info.limit_type {
            Some(RateLimitType::Http429) => "http_429",
            Some(RateLimitType::RateLimit) => "rate_limit",
            Some(RateLimitType::QuotaExceeded) => "quota_exceeded",
            Some(RateLimitType::Overloaded) => "overloaded",
            Some(RateLimitType::ClaudeRateLimit) => "claude_rate_limit",
            Some(RateLimitType::OpenAiRateLimit) => "openai_rate_limit",
            None => "unknown",
        };

        let payload = events::RateLimitDetectedPayload {
            agent_id: event.agent_id.clone(),
            session_id: String::new(), // Session ID not available from RateLimitEvent
            limit_type: limit_type_str.to_string(),
            retry_after_ms: event.rate_limit_info.retry_after_ms,
            matched_pattern: event.rate_limit_info.matched_pattern.clone(),
        };

        if let Err(e) = events::emit_rate_limit_detected(&app_handle, payload) {
            log::warn!("Failed to emit rate limit event: {}", e);
        } else {
            log::info!(
                "Rate limit detected for agent {}: {:?}",
                event.agent_id,
                limit_type_str
            );
        }
    }

    log::debug!("Rate limit event forwarder stopped");
}

/// Forward agent completion events to Tauri frontend events
/// This runs as a background task that listens for completion events on the channel
/// and emits them to the frontend via Tauri's event system.
async fn forward_completion_events(
    app_handle: tauri::AppHandle,
    mut rx: mpsc::UnboundedReceiver<agents::AgentCompletionEvent>,
) {
    log::debug!("Completion event forwarder started");

    while let Some(event) = rx.recv().await {
        if event.success {
            let payload = events::AgentCompletedPayload {
                agent_id: event.agent_id.clone(),
                task_id: event.task_id.clone(),
                session_id: String::new(), // Session ID not available from AgentCompletionEvent
                exit_code: event.exit_code,
            };

            if let Err(e) = events::emit_agent_completed(&app_handle, payload) {
                log::warn!("Failed to emit agent completed event: {}", e);
            } else {
                log::info!(
                    "Agent {} completed successfully (task {})",
                    event.agent_id,
                    event.task_id
                );
            }
        } else {
            let payload = events::AgentFailedPayload {
                agent_id: event.agent_id.clone(),
                task_id: event.task_id.clone(),
                session_id: String::new(), // Session ID not available from AgentCompletionEvent
                exit_code: event.exit_code,
                error: event.error.unwrap_or_else(|| "Unknown error".to_string()),
            };

            if let Err(e) = events::emit_agent_failed(&app_handle, payload) {
                log::warn!("Failed to emit agent failed event: {}", e);
            } else {
                log::info!(
                    "Agent {} failed (task {}): exit code {:?}",
                    event.agent_id,
                    event.task_id,
                    event.exit_code
                );
            }
        }
    }

    log::debug!("Completion event forwarder stopped");
}

/// Forward PRD file update events to Tauri frontend events
/// This runs as a background task that listens for file update events on the channel
/// and emits them to the frontend via Tauri's event system.
async fn forward_prd_file_events(
    app_handle: tauri::AppHandle,
    mut rx: mpsc::UnboundedReceiver<watchers::PrdFileUpdate>,
) {
    log::debug!("PRD file event forwarder started");

    while let Some(update) = rx.recv().await {
        let payload = events::PrdFileUpdatedPayload {
            session_id: update.session_id.clone(),
            content: update.content.clone(),
            path: update.path.clone(),
        };

        if let Err(e) = events::emit_prd_file_updated(&app_handle, payload) {
            log::warn!("Failed to emit PRD file update event: {}", e);
        } else {
            log::debug!(
                "PRD file updated for session {}: {}",
                update.session_id,
                update.path
            );
        }
    }

    log::debug!("PRD file event forwarder stopped");
}

/// Forward PTY data events to Tauri frontend events
/// This runs as a background task that listens for PTY output events on the channel
/// and emits them to the frontend via Tauri's event system for terminal display.
async fn forward_pty_data_events(
    app_handle: tauri::AppHandle,
    mut rx: mpsc::UnboundedReceiver<agents::AgentPtyDataEvent>,
) {
    log::debug!("PTY data event forwarder started");

    while let Some(event) = rx.recv().await {
        log::trace!("Forwarding PTY data event for agent {} ({} bytes)", event.agent_id, event.data.len());
        // Emit as Tauri event that the terminal component listens for
        if let Err(e) = app_handle.emit("agent-pty-data", serde_json::json!({
            "agentId": event.agent_id,
            "data": event.data,
        })) {
            log::warn!("Failed to emit PTY data event: {}", e);
        }
    }

    log::debug!("PTY data event forwarder stopped");
}

/// Forward subagent events to Tauri frontend events
/// This runs as a background task that listens for subagent events on the channel
/// and emits them to the frontend via Tauri's event system.
async fn forward_subagent_events(
    app_handle: tauri::AppHandle,
    mut rx: mpsc::UnboundedReceiver<agents::SubagentEvent>,
) {
    use crate::agents::SubagentEventType;

    log::debug!("Subagent event forwarder started");

    while let Some(event) = rx.recv().await {
        let event_name = match event.event_type {
            SubagentEventType::Spawned => "subagent:spawned",
            SubagentEventType::Progress => "subagent:progress",
            SubagentEventType::Completed => "subagent:completed",
            SubagentEventType::Failed => "subagent:failed",
        };

        if let Err(e) = app_handle.emit(event_name, &event) {
            log::warn!("Failed to emit {}: {}", event_name, e);
        } else {
            log::debug!("Emitted {} for agent {}", event_name, event.parent_agent_id);
        }
    }

    log::debug!("Subagent event forwarder stopped");
}

/// Forward tool call start events to Tauri frontend events
/// This runs as a background task that listens for tool call events on the channel
/// and emits them to the frontend via Tauri's event system for the tool call panel.
async fn forward_tool_call_start_events(
    app_handle: tauri::AppHandle,
    mut rx: mpsc::UnboundedReceiver<agents::ToolCallStartEvent>,
) {
    log::debug!("Tool call start event forwarder started");

    while let Some(event) = rx.recv().await {
        log::trace!(
            "Forwarding tool call start event for agent {} tool {}",
            event.agent_id,
            event.tool_name
        );

        let payload = events::ToolCallStartedPayload {
            agent_id: event.agent_id,
            tool_id: event.tool_id,
            tool_name: event.tool_name,
            input: event.input,
            timestamp: event.timestamp,
        };

        if let Err(e) = events::emit_tool_call_started(&app_handle, payload) {
            log::warn!("Failed to emit tool call started event: {}", e);
        }
    }

    log::debug!("Tool call start event forwarder stopped");
}

/// Forward tool call complete events to Tauri frontend events
/// This runs as a background task that listens for tool call completion events on the channel
/// and emits them to the frontend via Tauri's event system for the tool call panel.
async fn forward_tool_call_complete_events(
    app_handle: tauri::AppHandle,
    mut rx: mpsc::UnboundedReceiver<agents::ToolCallCompleteEvent>,
) {
    log::debug!("Tool call complete event forwarder started");

    while let Some(event) = rx.recv().await {
        log::trace!(
            "Forwarding tool call complete event for agent {} tool_id {}",
            event.agent_id,
            event.tool_id
        );

        let payload = events::ToolCallCompletedPayload {
            agent_id: event.agent_id,
            tool_id: event.tool_id,
            output: event.output,
            duration_ms: None, // Duration calculated on frontend
            timestamp: event.timestamp,
            is_error: event.is_error,
        };

        if let Err(e) = events::emit_tool_call_completed(&app_handle, payload) {
            log::warn!("Failed to emit tool call completed event: {}", e);
        }
    }

    log::debug!("Tool call complete event forwarder stopped");
}
