// Module declarations
mod commands;
mod models;
mod database;
mod git;
mod github;
mod agents;
mod utils;
mod parsers;
mod parallel;

// Re-export models for use in commands
pub use models::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize logger
    env_logger::init();

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

    // Initialize git state
    let git_state = commands::git::GitState::new();

    // Initialize parallel state
    let parallel_state = commands::parallel::ParallelState::new();

    tauri::Builder::default()
        .manage(std::sync::Mutex::new(db))
        .manage(git_state)
        .manage(parallel_state)
        .plugin(tauri_plugin_opener::init())
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
            commands::create_agent,
            commands::get_agent,
            commands::get_agents_for_session,
            commands::get_agents_for_task,
            commands::get_active_agents,
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
