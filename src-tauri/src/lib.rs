// Module declarations
mod commands;
mod models;
mod database;
mod git;
mod github;
mod agents;
mod utils;
pub mod parsers;
mod parallel;
mod session;
mod templates;
mod config;
pub mod events;
pub mod shutdown;

// Re-export models for use in commands
pub use models::*;

use std::path::Path;
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

    // Initialize parallel state
    let parallel_state = commands::parallel::ParallelState::new();

    // Initialize config state
    let config_state = commands::config::ConfigState::new();

    // Initialize trace state for subagent tracking
    let trace_state = commands::traces::TraceState::new();

    // Initialize model cache state for dynamic model discovery
    let model_cache_state = commands::models::ModelCacheState::new();

    // Create rate limit event channel for forwarding to frontend
    let (rate_limit_tx, rate_limit_rx) = mpsc::unbounded_channel::<agents::RateLimitEvent>();
    let rate_limit_state = RateLimitEventState::new(rate_limit_tx);

    // Log startup info
    log::info!("Ralph-UI starting up");
    log::info!("Database path: {}", db_path);

    tauri::Builder::default()
        .manage(std::sync::Mutex::new(db))
        .manage(git_state)
        .manage(parallel_state)
        .manage(config_state)
        .manage(trace_state)
        .manage(shutdown_state)
        .manage(rate_limit_state)
        .manage(model_cache_state)
        .setup(move |app| {
            // Spawn task to forward rate limit events to Tauri frontend events
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                forward_rate_limit_events(app_handle, rate_limit_rx).await;
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::greet,
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
            commands::list_prd_templates,
            commands::export_prd,
            commands::analyze_prd_quality,
            commands::execute_prd,
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
            commands::github_create_pull_request,
            commands::github_get_pull_request,
            commands::github_list_pull_requests,
            commands::github_get_issue,
            commands::github_list_issues,
            commands::init_parallel_scheduler,
            commands::parallel_add_task,
            commands::parallel_add_tasks,
            commands::parallel_schedule_next,
            commands::parallel_complete_task,
            commands::parallel_fail_task,
            commands::parallel_stop_all,
            commands::parallel_get_scheduler_stats,
            commands::parallel_get_pool_stats,
            commands::parallel_check_violations,
            commands::worktree_allocate,
            commands::worktree_deallocate,
            commands::worktree_deallocate_by_agent,
            commands::worktree_get_allocations,
            commands::worktree_cleanup_orphaned,
            commands::conflicts_detect,
            commands::conflicts_can_merge_safely,
            commands::conflicts_get_summary,
            commands::conflicts_resolve,
            commands::export_session_json,
            commands::create_session_template,
            commands::get_session_templates,
            commands::create_session_from_template,
            commands::save_recovery_state,
            commands::get_recovery_state,
            commands::compare_sessions,
            commands::get_session_analytics,
            // Config commands
            commands::get_config,
            commands::set_config_project_path,
            commands::get_config_paths_cmd,
            commands::update_execution_config,
            commands::update_git_config,
            commands::update_validation_config,
            commands::update_fallback_config,
            commands::reload_config,
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
            commands::start_prd_chat_session,
            commands::send_prd_chat_message,
            commands::get_prd_chat_history,
            commands::list_prd_chat_sessions,
            commands::delete_prd_chat_session,
            commands::export_chat_to_prd,
            commands::assess_prd_quality,
            commands::get_guided_questions,
            commands::preview_prd_extraction,
            commands::check_agent_availability,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Perform automatic recovery of stale sessions on startup
/// This checks all known project paths for sessions that were left in Active state
/// but have stale lock files (indicating a crash), and transitions them to Paused.
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

    log::info!("Checking {} project paths for stale sessions", project_paths.len());

    let mut total_recovered = 0;

    for project_path in project_paths {
        let path = Path::new(&project_path);

        // Skip if path doesn't exist (project may have been moved/deleted)
        if !path.exists() {
            log::debug!("Skipping non-existent project path: {}", project_path);
            continue;
        }

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

    if total_recovered > 0 {
        log::info!("Auto-recovery complete: {} sessions recovered", total_recovered);
    } else {
        log::debug!("Auto-recovery complete: no stale sessions found");
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
