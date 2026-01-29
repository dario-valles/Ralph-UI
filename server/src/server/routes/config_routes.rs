//! Configuration command routing
//!
//! Handles configuration and settings commands including:
//! get_config, set_config_project_path, reload_config, get_config_paths_cmd,
//! update_execution_config, update_git_config, update_validation_config,
//! update_fallback_config, save_config
//!
//! Also handles project commands: register_project, get_project, get_project_by_path,
//! get_all_projects, get_recent_projects, get_favorite_projects, update_project_name,
//! toggle_project_favorite, set_project_favorite, touch_project, delete_project,
//! list_directory, get_home_directory
//!
//! Also handles template commands: list_templates, list_builtin_templates,
//! get_template_content, save_template, delete_template, preview_template,
//! render_template, render_task_prompt
//!
//! Also handles mission control commands: get_activity_feed, get_global_stats
//!
//! Also handles model discovery: get_available_models, refresh_models
//!
//! Also handles recovery commands: check_stale_sessions, recover_stale_session,
//! recover_all_stale_sessions, acquire_session_lock, release_session_lock,
//! get_session_lock_info, refresh_session_lock
//!
//! Also handles terminal commands: save_project_commands, load_project_commands,
//! save_global_commands, load_global_commands
//!
//! Also handles push notification commands: get_vapid_public_key, subscribe_push,
//! unsubscribe_push, get_push_settings, update_push_settings, test_push,
//! list_push_subscriptions, get_push_subscription_count
//!
//! Also handles API provider commands: get_api_providers, get_active_provider,
//! set_active_provider, set_provider_token, delete_provider_token, test_provider_connection

use crate::commands;
use crate::models::AgentType;
use serde_json::Value;

use super::{
    get_arg, get_opt_arg, route_async, route_sync, route_unit, route_unit_async, ServerAppState,
};

/// Route configuration and misc commands
pub async fn route_config_command(
    cmd: &str,
    args: Value,
    state: &ServerAppState,
) -> Result<Value, String> {
    match cmd {
        // Config Commands
        "get_config" => route_sync!(state.config_state.get_config()),

        "set_config_project_path" => {
            let project_path: Option<String> = get_opt_arg(&args, "projectPath")?;
            let path = project_path.map(std::path::PathBuf::from);
            state.config_state.set_project_path(path)?;
            route_sync!(state.config_state.get_config())
        }

        "reload_config" => route_sync!(state.config_state.get_config()),

        "get_config_paths_cmd" => {
            route_async!(
                cmd,
                commands::config::get_config_paths_cmd(&state.config_state)
            )
        }

        "update_execution_config" => {
            let max_parallel: Option<i32> = get_opt_arg(&args, "maxParallel")?;
            let max_iterations: Option<i32> = get_opt_arg(&args, "maxIterations")?;
            let max_retries: Option<i32> = get_opt_arg(&args, "maxRetries")?;
            let agent_type: Option<String> = get_opt_arg(&args, "agentType")?;
            let strategy: Option<String> = get_opt_arg(&args, "strategy")?;
            let model: Option<String> = get_opt_arg(&args, "model")?;
            route_async!(
                cmd,
                commands::config::update_execution_config(
                    max_parallel,
                    max_iterations,
                    max_retries,
                    agent_type,
                    strategy,
                    model,
                    &state.config_state
                )
            )
        }

        "update_git_config" => {
            let auto_create_prs: Option<bool> = get_opt_arg(&args, "autoCreatePrs")?;
            let draft_prs: Option<bool> = get_opt_arg(&args, "draftPrs")?;
            let branch_pattern: Option<String> = get_opt_arg(&args, "branchPattern")?;
            route_async!(
                cmd,
                commands::config::update_git_config(
                    auto_create_prs,
                    draft_prs,
                    branch_pattern,
                    &state.config_state
                )
            )
        }

        "update_validation_config" => {
            let run_tests: Option<bool> = get_opt_arg(&args, "runTests")?;
            let run_lint: Option<bool> = get_opt_arg(&args, "runLint")?;
            let test_command: Option<String> = get_opt_arg(&args, "testCommand")?;
            let lint_command: Option<String> = get_opt_arg(&args, "lintCommand")?;
            route_async!(
                cmd,
                commands::config::update_validation_config(
                    run_tests,
                    run_lint,
                    test_command,
                    lint_command,
                    &state.config_state
                )
            )
        }

        "update_fallback_config" => {
            let enabled: Option<bool> = get_opt_arg(&args, "enabled")?;
            let base_backoff_ms: Option<u64> = get_opt_arg(&args, "baseBackoffMs")?;
            let max_backoff_ms: Option<u64> = get_opt_arg(&args, "maxBackoffMs")?;
            let fallback_model: Option<String> = get_opt_arg(&args, "fallbackModel")?;
            let fallback_api_provider: Option<String> = get_opt_arg(&args, "fallbackApiProvider")?;
            let error_strategy: Option<serde_json::Value> = get_opt_arg(&args, "errorStrategy")?;
            let fallback_chain: Option<Vec<String>> = get_opt_arg(&args, "fallbackChain")?;
            let test_primary_recovery: Option<bool> = get_opt_arg(&args, "testPrimaryRecovery")?;
            let recovery_test_interval: Option<u32> = get_opt_arg(&args, "recoveryTestInterval")?;
            route_async!(
                cmd,
                commands::config::update_fallback_config(
                    enabled,
                    base_backoff_ms,
                    max_backoff_ms,
                    fallback_model,
                    fallback_api_provider,
                    error_strategy,
                    fallback_chain,
                    test_primary_recovery,
                    recovery_test_interval,
                    &state.config_state
                )
            )
        }

        "save_config" => {
            route_async!(cmd, commands::config::save_config(&state.config_state))
        }

        // Project Commands
        "register_project" => {
            let path: String = get_arg(&args, "path")?;
            let name: Option<String> = get_opt_arg(&args, "name")?;
            let folder_id: Option<String> = get_opt_arg(&args, "folderId")?;
            route_async!(
                cmd,
                commands::projects::register_project_with_folder(path, name, folder_id)
            )
        }

        "get_project" => {
            let project_id: String = get_arg(&args, "projectId")?;
            route_sync!(commands::projects::get_project(project_id))
        }

        "get_project_by_path" => {
            let path: String = get_arg(&args, "path")?;
            route_sync!(commands::projects::get_project_by_path(path))
        }

        "get_all_projects" => route_sync!(commands::projects::get_all_projects()),

        "get_recent_projects" => {
            let limit: Option<i32> = get_opt_arg(&args, "limit")?;
            route_sync!(commands::projects::get_recent_projects(limit))
        }

        "get_favorite_projects" => route_sync!(commands::projects::get_favorite_projects()),

        "update_project_name" => {
            let project_id: String = get_arg(&args, "projectId")?;
            let name: String = get_arg(&args, "name")?;
            route_unit!(commands::projects::update_project_name(project_id, name))
        }

        "toggle_project_favorite" => {
            let project_id: String = get_arg(&args, "projectId")?;
            route_sync!(commands::projects::toggle_project_favorite(project_id))
        }

        "set_project_favorite" => {
            let project_id: String = get_arg(&args, "projectId")?;
            let is_favorite: bool = get_arg(&args, "isFavorite")?;
            route_unit!(commands::projects::set_project_favorite(
                project_id,
                is_favorite
            ))
        }

        "touch_project" => {
            let project_id: String = get_arg(&args, "projectId")?;
            route_unit!(commands::projects::touch_project(project_id))
        }

        "delete_project" => {
            let project_id: String = get_arg(&args, "projectId")?;
            route_unit!(commands::projects::delete_project(project_id))
        }

        "list_directory" => {
            let path: Option<String> = get_opt_arg(&args, "path")?;
            route_sync!(commands::projects::list_directory(path))
        }

        "get_home_directory" => {
            route_sync!(commands::projects::get_home_directory())
        }

        "create_folder" => {
            let name: String = get_arg(&args, "name")?;
            route_sync!(commands::projects::create_folder(name))
        }

        "get_all_folders" => {
            route_sync!(commands::projects::get_all_folders())
        }

        "assign_project_to_folder" => {
            let project_id: String = get_arg(&args, "projectId")?;
            let folder_id: Option<String> = get_opt_arg(&args, "folderId")?;
            route_unit!(commands::projects::assign_project_to_folder(
                project_id, folder_id
            ))
        }

        "create_filesystem_directory" => {
            let path: String = get_arg(&args, "path")?;
            route_sync!(commands::projects::create_filesystem_directory(path))
        }

        // Mission Control Commands
        "get_activity_feed" => {
            let limit: Option<i32> = get_opt_arg(&args, "limit")?;
            let offset: Option<i32> = get_opt_arg(&args, "offset")?;
            route_sync!(commands::mission_control::get_activity_feed(limit, offset))
        }

        "get_global_stats" => route_sync!(commands::mission_control::get_global_stats()),

        // Template Commands
        "list_templates" => {
            let project_path: Option<String> = get_opt_arg(&args, "projectPath")?;
            route_async!(cmd, commands::templates::list_templates(project_path))
        }

        "list_builtin_templates" => {
            route_async!(cmd, commands::templates::list_builtin_templates())
        }

        "get_template_content" => {
            let name: String = get_arg(&args, "name")?;
            let project_path: Option<String> = get_opt_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::templates::get_template_content(name, project_path)
            )
        }

        "save_template" => {
            let name: String = get_arg(&args, "name")?;
            let content: String = get_arg(&args, "content")?;
            let scope: String = get_arg(&args, "scope")?;
            let project_path: Option<String> = get_opt_arg(&args, "projectPath")?;
            route_unit_async!(commands::templates::save_template(
                name,
                content,
                scope,
                project_path
            ))
        }

        "delete_template" => {
            let name: String = get_arg(&args, "name")?;
            let scope: String = get_arg(&args, "scope")?;
            let project_path: Option<String> = get_opt_arg(&args, "projectPath")?;
            route_unit_async!(commands::templates::delete_template(
                name,
                scope,
                project_path
            ))
        }

        "preview_template" => {
            let content: String = get_arg(&args, "content")?;
            let project_path: Option<String> = get_opt_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::templates::preview_template(content, project_path)
            )
        }

        "render_template" => {
            let request: commands::templates::RenderRequest = get_arg(&args, "request")?;
            route_async!(cmd, commands::templates::render_template(request))
        }

        "render_task_prompt" => {
            let task_id: String = get_arg(&args, "taskId")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let template_name: Option<String> = get_opt_arg(&args, "templateName")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            // Get the task first
            let task = commands::tasks::get_task(task_id, session_id, project_path).await?;
            // Render using templates module
            let result = crate::templates::render_task_prompt(&task, template_name.as_deref())
                .map_err(|e| e.to_string())?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        // Trace Parser Commands
        "init_trace_parser" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            super::with_agent_manager(state, |mgr| {
                mgr.init_trace_parser(&agent_id);
                Ok(())
            })
        }

        "parse_agent_output" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let output: String = get_arg(&args, "output")?;
            super::with_agent_manager(state, |mgr| Ok(mgr.parse_text_output(&agent_id, &output)))
        }

        "get_subagent_tree" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            super::with_agent_manager(state, |mgr| Ok(mgr.get_subagent_tree(&agent_id)))
        }

        "get_subagent_summary" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            super::with_agent_manager(state, |mgr| {
                let summary = mgr
                    .get_subagent_tree(&agent_id)
                    .map(|t| commands::traces::build_subagent_summary(&t));
                Ok(summary)
            })
        }

        "get_subagent_events" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let subagent_id: String = get_arg(&args, "subagentId")?;
            super::with_agent_manager(state, |mgr| {
                let events: Vec<_> = mgr
                    .get_subagent_tree(&agent_id)
                    .map(|t| {
                        t.get_subagent_events(&subagent_id)
                            .into_iter()
                            .cloned()
                            .collect()
                    })
                    .unwrap_or_default();
                Ok(events)
            })
        }

        "clear_trace_data" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            super::with_agent_manager(state, |mgr| {
                mgr.clear_trace_data(&agent_id);
                Ok(())
            })
        }

        "is_subagent_active" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let subagent_id: String = get_arg(&args, "subagentId")?;
            super::with_agent_manager(state, |mgr| {
                let is_active = mgr
                    .get_subagent_tree(&agent_id)
                    .map(|t| t.is_active(&subagent_id))
                    .unwrap_or(false);
                Ok(is_active)
            })
        }

        // Model Discovery Commands
        "get_available_models" => {
            let agent_type: AgentType = get_arg(&args, "agentType")?;
            let provider_id: Option<String> = get_opt_arg(&args, "providerId")?;
            let models = commands::models::get_available_models(
                agent_type,
                provider_id.as_deref(),
                &state.model_cache_state,
            )
            .await
            .map_err(|e| e.to_string())?;
            serde_json::to_value(models).map_err(|e| e.to_string())
        }

        "refresh_models" => {
            let agent_type: Option<AgentType> = get_opt_arg(&args, "agentType")?;
            state.model_cache_state.cache.invalidate(agent_type);
            Ok(Value::Null)
        }

        // Recovery Commands
        "check_stale_sessions" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::recovery::check_stale_sessions(project_path))
        }

        "recover_stale_session" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::recovery::recover_stale_session(session_id, project_path)
            )
        }

        "recover_all_stale_sessions" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::recovery::recover_all_stale_sessions(project_path)
            )
        }

        "acquire_session_lock" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::recovery::acquire_session_lock(project_path, session_id)
            )
        }

        "release_session_lock" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::recovery::release_session_lock(project_path, session_id)
            )
        }

        "get_session_lock_info" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::recovery::get_session_lock_info(project_path, session_id)
            )
        }

        "refresh_session_lock" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::recovery::refresh_session_lock(project_path, session_id)
            )
        }

        // Terminal Commands
        "save_project_commands" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let commands: Vec<serde_json::Value> = get_arg(&args, "commands")?;
            route_async!(
                cmd,
                commands::terminal::save_project_commands(project_path, commands)
            )
        }

        "load_project_commands" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::terminal::load_project_commands(project_path))
        }

        "save_global_commands" => {
            let commands: Vec<serde_json::Value> = get_arg(&args, "commands")?;
            route_async!(cmd, commands::terminal::save_global_commands(commands))
        }

        "load_global_commands" => {
            route_async!(cmd, commands::terminal::load_global_commands())
        }

        // Push Notification Commands
        "get_vapid_public_key" => {
            route_async!(cmd, commands::push::get_vapid_public_key())
        }

        "subscribe_push" => {
            let input: commands::push::SubscribePushInput = serde_json::from_value(args.clone())
                .map_err(|e| format!("Invalid input: {}", e))?;
            route_async!(
                cmd,
                commands::push::subscribe_push(input, &state.push_state)
            )
        }

        "unsubscribe_push" => {
            let input: commands::push::UnsubscribePushInput = serde_json::from_value(args.clone())
                .map_err(|e| format!("Invalid input: {}", e))?;
            route_async!(
                cmd,
                commands::push::unsubscribe_push(input, &state.push_state)
            )
        }

        "get_push_settings" => {
            let subscription_id: String = get_arg(&args, "subscriptionId")?;
            route_async!(cmd, commands::push::get_push_settings(subscription_id))
        }

        "update_push_settings" => {
            let input: commands::push::UpdatePushSettingsInput =
                serde_json::from_value(args.clone())
                    .map_err(|e| format!("Invalid input: {}", e))?;
            route_async!(
                cmd,
                commands::push::update_push_settings(input, &state.push_state)
            )
        }

        "test_push" => {
            let subscription_id: String = get_arg(&args, "subscriptionId")?;
            route_unit_async!(commands::push::test_push(
                subscription_id,
                &state.push_state
            ))
        }

        "list_push_subscriptions" => {
            route_async!(cmd, commands::push::list_push_subscriptions())
        }

        "get_push_subscription_count" => {
            route_async!(
                cmd,
                commands::push::get_push_subscription_count(&state.push_state)
            )
        }

        // API Provider Commands
        "get_api_providers" => {
            route_sync!(commands::providers::get_api_providers(&state.config_state))
        }

        "get_active_provider" => {
            route_sync!(commands::providers::get_active_provider(
                &state.config_state
            ))
        }

        "set_active_provider" => {
            let provider_id: String = get_arg(&args, "providerId")?;
            route_unit_async!(commands::providers::set_active_provider(
                provider_id,
                &state.config_state
            ))
        }

        "set_provider_token" => {
            let provider_id: String = get_arg(&args, "providerId")?;
            let token: String = get_arg(&args, "token")?;
            route_unit!(commands::providers::set_provider_token(
                &provider_id,
                &token
            ))
        }

        "delete_provider_token" => {
            let provider_id: String = get_arg(&args, "providerId")?;
            route_unit!(commands::providers::delete_provider_token(&provider_id))
        }

        "test_provider_connection" => {
            let provider_id: String = get_arg(&args, "providerId")?;
            route_sync!(commands::providers::test_provider_connection(&provider_id))
        }

        _ => Err(format!("Unknown config command: {}", cmd)),
    }
}

/// Check if a command is a config/misc command
pub fn is_config_command(cmd: &str) -> bool {
    matches!(
        cmd,
        // Config commands
        "get_config"
            | "set_config_project_path"
            | "reload_config"
            | "get_config_paths_cmd"
            | "update_execution_config"
            | "update_git_config"
            | "update_validation_config"
            | "update_fallback_config"
            | "save_config"
            // Project commands
            | "register_project"
            | "get_project"
            | "get_project_by_path"
            | "get_all_projects"
            | "get_recent_projects"
            | "get_favorite_projects"
            | "update_project_name"
            | "toggle_project_favorite"
            | "set_project_favorite"
            | "touch_project"
            | "delete_project"
            | "list_directory"
            | "get_home_directory"
            | "create_folder"
            | "get_all_folders"
            | "assign_project_to_folder"
            | "create_filesystem_directory"
            // Mission control
            | "get_activity_feed"
            | "get_global_stats"
            // Templates
            | "list_templates"
            | "list_builtin_templates"
            | "get_template_content"
            | "save_template"
            | "delete_template"
            | "preview_template"
            | "render_template"
            | "render_task_prompt"
            // Trace parser
            | "init_trace_parser"
            | "parse_agent_output"
            | "get_subagent_tree"
            | "get_subagent_summary"
            | "get_subagent_events"
            | "clear_trace_data"
            | "is_subagent_active"
            // Model discovery
            | "get_available_models"
            | "refresh_models"
            // Recovery
            | "check_stale_sessions"
            | "recover_stale_session"
            | "recover_all_stale_sessions"
            | "acquire_session_lock"
            | "release_session_lock"
            | "get_session_lock_info"
            | "refresh_session_lock"
            // Terminal
            | "save_project_commands"
            | "load_project_commands"
            | "save_global_commands"
            | "load_global_commands"
            // Push notifications
            | "get_vapid_public_key"
            | "subscribe_push"
            | "unsubscribe_push"
            | "get_push_settings"
            | "update_push_settings"
            | "test_push"
            | "list_push_subscriptions"
            | "get_push_subscription_count"
            // API providers
            | "get_api_providers"
            | "get_active_provider"
            | "set_active_provider"
            | "set_provider_token"
            | "delete_provider_token"
            | "test_provider_connection"
    )
}
