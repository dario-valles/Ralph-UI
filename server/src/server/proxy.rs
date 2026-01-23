//! Command proxy handler that routes HTTP requests to Tauri commands
//!
//! This implements the Command Proxy Pattern - a single /api/invoke endpoint
//! that routes to existing command functions without modifying them.

use super::events::EventBroadcaster;
use super::ServerAppState;
use crate::utils::as_path;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;

// Re-export types needed for proxy commands
use crate::commands::ralph_loop::RalphStoryInput;
use crate::ralph_loop::{ConflictResolution, ExecutionSnapshot, MergeStrategy, RalphConfig};

/// Request body for /api/invoke endpoint
#[derive(Debug, Deserialize)]
pub struct InvokeRequest {
    /// Command name (e.g., "get_sessions", "create_task")
    pub cmd: String,
    /// Command arguments as JSON object
    #[serde(default)]
    pub args: Value,
}

/// Response body for /api/invoke endpoint
#[derive(Debug, Serialize)]
pub struct InvokeResponse {
    /// Whether the command succeeded
    pub success: bool,
    /// Result data (on success)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    /// Error message (on failure)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Error type for invoke handler
pub struct InvokeError {
    status: StatusCode,
    message: String,
}

impl IntoResponse for InvokeError {
    fn into_response(self) -> Response {
        let body = InvokeResponse {
            success: false,
            data: None,
            error: Some(self.message),
        };
        (self.status, Json(body)).into_response()
    }
}

// =============================================================================
// Argument Extraction Helpers
// =============================================================================

/// Extract a required argument from JSON args
fn get_arg<T: serde::de::DeserializeOwned>(args: &Value, name: &str) -> Result<T, String> {
    serde_json::from_value(
        args.get(name)
            .ok_or_else(|| format!("Missing argument: {}", name))?
            .clone(),
    )
    .map_err(|e| format!("Invalid argument {}: {}", name, e))
}

/// Extract an optional argument from JSON args
fn get_opt_arg<T: serde::de::DeserializeOwned>(args: &Value, name: &str) -> Result<Option<T>, String> {
    match args.get(name) {
        Some(v) if !v.is_null() => serde_json::from_value(v.clone())
            .map(Some)
            .map_err(|e| format!("Invalid argument {}: {}", name, e)),
        _ => Ok(None),
    }
}

/// Extract a field from an ExecutionSnapshot by execution ID
fn get_snapshot_field<T, F>(
    state: &ServerAppState,
    args: &Value,
    extractor: F,
) -> Result<Value, String>
where
    T: Serialize,
    F: FnOnce(&ExecutionSnapshot) -> T,
{
    let execution_id: String = get_arg(args, "executionId")?;
    match state.ralph_loop_state.get_snapshot(&execution_id) {
        Some(snapshot) => serde_json::to_value(extractor(&snapshot)).map_err(|e| e.to_string()),
        None => Err(format!("Execution {} not found", execution_id)),
    }
}

// =============================================================================
// Command Routing Macros
// =============================================================================

/// Routes a simple async command: extracts args, calls handler, serializes result
macro_rules! route_async {
    ($cmd:expr, $handler:expr) => {{
        let result = $handler.await?;
        serde_json::to_value(result).map_err(|e| e.to_string())
    }};
}

/// Routes a sync command
macro_rules! route_sync {
    ($handler:expr) => {{
        let result = $handler?;
        serde_json::to_value(result).map_err(|e| e.to_string())
    }};
}

/// Routes a command that returns ()
macro_rules! route_unit {
    ($handler:expr) => {{
        $handler?;
        Ok(Value::Null)
    }};
}

/// Routes an async command that returns ()
macro_rules! route_unit_async {
    ($handler:expr) => {{
        $handler.await?;
        Ok(Value::Null)
    }};
}

// =============================================================================
// Main Handler
// =============================================================================

/// Main invoke handler - routes commands to their implementations
pub async fn invoke_handler(
    State(state): State<ServerAppState>,
    Json(req): Json<InvokeRequest>,
) -> Result<Json<InvokeResponse>, InvokeError> {
    log::debug!("Invoke command: {} with args: {:?}", req.cmd, req.args);

    let result = route_command(&req.cmd, req.args, &state).await;

    match result {
        Ok(data) => Ok(Json(InvokeResponse {
            success: true,
            data: Some(data),
            error: None,
        })),
        Err(e) => {
            log::warn!("Command {} failed: {}", req.cmd, e);
            Err(InvokeError {
                status: StatusCode::BAD_REQUEST,
                message: e,
            })
        }
    }
}

/// Route a command to its implementation
async fn route_command(cmd: &str, args: Value, state: &ServerAppState) -> Result<Value, String> {
    use crate::commands;
    use crate::file_storage;
    use crate::models::*;

    match cmd {
        // =====================================================================
        // Session Commands
        // =====================================================================
        "create_session" => {
            let name: String = get_arg(&args, "name")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            let config: Option<SessionConfig> = get_opt_arg(&args, "config")?;

            let session_config = config.unwrap_or_else(|| {
                state
                    .config_state
                    .get_config()
                    .map(|c| (&c).into())
                    .unwrap_or_default()
            });
            session_config.validate()?;

            let session = Session {
                id: uuid::Uuid::new_v4().to_string(),
                name,
                project_path: project_path.clone(),
                created_at: chrono::Utc::now(),
                last_resumed_at: None,
                status: SessionStatus::Active,
                config: session_config,
                tasks: vec![],
                total_cost: 0.0,
                total_tokens: 0,
            };

            file_storage::sessions::save_session(as_path(&project_path), &session)?;
            serde_json::to_value(session).map_err(|e| e.to_string())
        }

        "get_sessions" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::sessions::get_sessions(project_path))
        }

        "get_session" => {
            let id: String = get_arg(&args, "id")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::sessions::get_session(id, project_path))
        }

        "update_session" => {
            let session: Session = get_arg(&args, "session")?;
            route_async!(cmd, commands::sessions::update_session(session))
        }

        "delete_session" => {
            let id: String = get_arg(&args, "id")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit_async!(commands::sessions::delete_session(id, project_path))
        }

        // =====================================================================
        // Task Commands
        // =====================================================================
        "create_task" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let task: Task = get_arg(&args, "task")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::tasks::create_task(session_id, task, project_path)
            )
        }

        "get_task" => {
            let task_id: String = get_arg(&args, "taskId")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::tasks::get_task(task_id, session_id, project_path)
            )
        }

        "get_tasks_for_session" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::tasks::get_tasks_for_session(session_id, project_path)
            )
        }

        "update_task" => {
            let task: Task = get_arg(&args, "task")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::tasks::update_task(task, session_id, project_path)
            )
        }

        "delete_task" => {
            let task_id: String = get_arg(&args, "taskId")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit_async!(commands::tasks::delete_task(task_id, session_id, project_path))
        }

        "import_prd" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let content: String = get_arg(&args, "content")?;
            let format: Option<String> = get_opt_arg(&args, "format")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::tasks::import_prd(session_id, content, format, project_path)
            )
        }

        // =====================================================================
        // Agent Commands
        // =====================================================================
        "create_agent" => {
            let agent: Agent = get_arg(&args, "agent")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit!(commands::agents::create_agent(agent, project_path))
        }

        "get_agent" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::agents::get_agent(agent_id, project_path))
        }

        "get_agents_for_session" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::agents::get_agents_for_session(
                session_id,
                project_path
            ))
        }

        "get_agents_for_task" => {
            let task_id: String = get_arg(&args, "taskId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::agents::get_agents_for_task(task_id, project_path))
        }

        "get_active_agents" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::agents::get_active_agents(session_id, project_path))
        }

        "get_all_active_agents" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::agents::get_all_active_agents(project_path))
        }

        "update_agent_metrics" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let tokens: i32 = get_arg(&args, "tokens")?;
            let cost: f64 = get_arg(&args, "cost")?;
            let iteration_count: i32 = get_arg(&args, "iterationCount")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit!(commands::agents::update_agent_metrics(
                agent_id,
                tokens,
                cost,
                iteration_count,
                project_path,
            ))
        }

        "update_agent_process_id" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let process_id: Option<u32> = get_opt_arg(&args, "processId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit!(commands::agents::update_agent_process_id(
                agent_id,
                process_id,
                project_path
            ))
        }

        "delete_agent" => {
            let agent_id: String = get_arg(&args, "agentId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit!(commands::agents::delete_agent(agent_id, project_path))
        }

        // =====================================================================
        // PRD Commands (File-based)
        // =====================================================================
        "scan_prd_files" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::prd::scan_prd_files(project_path))
        }

        "get_prd_file" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_async!(cmd, commands::prd::get_prd_file(project_path, prd_name))
        }

        "update_prd_file" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let content: String = get_arg(&args, "content")?;
            route_async!(
                cmd,
                commands::prd::update_prd_file(project_path, prd_name, content)
            )
        }

        "delete_prd_file" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_async!(cmd, commands::prd::delete_prd_file(project_path, prd_name))
        }

        // =====================================================================
        // Project Commands
        // =====================================================================
        "register_project" => {
            let path: String = get_arg(&args, "path")?;
            let name: Option<String> = get_opt_arg(&args, "name")?;
            route_sync!(commands::projects::register_project(path, name))
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

        // =====================================================================
        // Git Commands (use state.git_state)
        // =====================================================================
        "git_list_branches" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.list_branches()))
        }

        "git_get_current_branch" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.get_current_branch()))
        }

        "git_get_status" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.get_status()))
        }

        "git_get_commit_history" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let limit: Option<usize> = get_opt_arg(&args, "limit")?;
            route_sync!(state.git_state.with_manager(&repo_path, |mgr| mgr
                .get_commit_history(limit.unwrap_or(50))))
        }

        "git_is_repository" => {
            let path: String = get_arg(&args, "path")?;
            let is_repo = Path::new(&path).join(".git").exists();
            serde_json::to_value(is_repo).map_err(|e| e.to_string())
        }

        "git_create_branch" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let branch_name: String = get_arg(&args, "branchName")?;
            let force: bool = get_opt_arg(&args, "force")?.unwrap_or(false);
            route_sync!(state.git_state.with_manager(&repo_path, |mgr| mgr
                .create_branch(&branch_name, force)))
        }

        "git_checkout_branch" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let branch_name: String = get_arg(&args, "branchName")?;
            route_unit!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.checkout_branch(&branch_name)))
        }

        "git_delete_branch" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            let branch_name: String = get_arg(&args, "branchName")?;
            route_unit!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.delete_branch(&branch_name)))
        }

        "git_list_worktrees" => {
            let repo_path: String = get_arg(&args, "repoPath")?;
            route_sync!(state
                .git_state
                .with_manager(&repo_path, |mgr| mgr.list_worktrees()))
        }

        // =====================================================================
        // Config Commands (use state.config_state)
        // =====================================================================
        "get_config" => route_sync!(state.config_state.get_config()),

        "set_config_project_path" => {
            let project_path: Option<String> = get_opt_arg(&args, "projectPath")?;
            let path = project_path.map(std::path::PathBuf::from);
            state.config_state.set_project_path(path)?;
            route_sync!(state.config_state.get_config())
        }

        "reload_config" => route_sync!(state.config_state.get_config()),

        // =====================================================================
        // Mission Control Commands
        // =====================================================================
        "get_activity_feed" => {
            let limit: Option<i32> = get_opt_arg(&args, "limit")?;
            let offset: Option<i32> = get_opt_arg(&args, "offset")?;
            route_sync!(commands::mission_control::get_activity_feed(limit, offset))
        }

        "get_global_stats" => route_sync!(commands::mission_control::get_global_stats()),

        // =====================================================================
        // Ralph Loop Commands
        // =====================================================================
        "get_ralph_prd" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_prd(project_path, prd_name))
        }

        "get_ralph_prd_status" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_prd_status(
                project_path,
                prd_name
            ))
        }

        "get_ralph_progress" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_progress(
                project_path,
                prd_name
            ))
        }

        "get_ralph_progress_summary" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_progress_summary(
                project_path,
                prd_name
            ))
        }

        "get_ralph_prompt" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_prompt(
                project_path,
                prd_name
            ))
        }

        "has_ralph_files" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let has_files = commands::ralph_loop::has_ralph_files(project_path);
            serde_json::to_value(has_files).map_err(|e| e.to_string())
        }

        "get_ralph_files" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::ralph_loop::get_ralph_files(project_path))
        }

        "get_ralph_config" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::ralph_loop::get_ralph_config(project_path))
        }

        // US-2.3: View Parallel Progress - Assignment Commands
        "get_ralph_assignments" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_assignments(
                project_path,
                prd_name
            ))
        }

        "get_ralph_files_in_use" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_files_in_use(
                project_path,
                prd_name
            ))
        }

        // US-4.1: Priority-Based Assignment - Manual Override
        "manual_assign_ralph_story" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let input: commands::ralph_loop::ManualAssignStoryInput = get_arg(&args, "input")?;
            route_sync!(commands::ralph_loop::manual_assign_ralph_story(
                project_path,
                prd_name,
                input
            ))
        }

        "release_ralph_story_assignment" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let story_id: String = get_arg(&args, "storyId")?;
            route_sync!(commands::ralph_loop::release_ralph_story_assignment(
                project_path,
                prd_name,
                story_id
            ))
        }

        // US-6.1: View Current Brief
        "get_ralph_brief" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_brief(
                project_path,
                prd_name
            ))
        }

        "regenerate_ralph_brief" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::regenerate_ralph_brief(
                project_path,
                prd_name
            ))
        }

        "get_ralph_historical_briefs" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_historical_briefs(
                project_path,
                prd_name
            ))
        }

        // US-5.3: Competitive Execution
        "get_ralph_competitive_attempts" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let execution_id: String = get_arg(&args, "executionId")?;
            route_sync!(commands::ralph_loop::get_ralph_competitive_attempts(
                project_path,
                prd_name,
                execution_id
            ))
        }

        "select_ralph_competitive_attempt" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let execution_id: String = get_arg(&args, "executionId")?;
            let attempt_id: String = get_arg(&args, "attemptId")?;
            let reason: String = get_arg(&args, "reason")?;
            route_unit!(commands::ralph_loop::select_ralph_competitive_attempt(
                project_path,
                prd_name,
                execution_id,
                attempt_id,
                reason
            ))
        }

        "get_ralph_selected_competitive_attempt" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let execution_id: String = get_arg(&args, "executionId")?;
            route_sync!(commands::ralph_loop::get_ralph_selected_competitive_attempt(
                project_path,
                prd_name,
                execution_id
            ))
        }

        // US-3.3: Manual Learning Entry
        "get_ralph_learnings" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_learnings(
                project_path,
                prd_name
            ))
        }

        "add_ralph_learning" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let input: commands::ralph_loop::AddLearningInput = get_arg(&args, "input")?;
            route_sync!(commands::ralph_loop::add_ralph_learning(
                project_path,
                prd_name,
                input
            ))
        }

        "update_ralph_learning" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let input: commands::ralph_loop::UpdateLearningInput = get_arg(&args, "input")?;
            route_sync!(commands::ralph_loop::update_ralph_learning(
                project_path,
                prd_name,
                input
            ))
        }

        "delete_ralph_learning" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let learning_id: String = get_arg(&args, "learningId")?;
            route_sync!(commands::ralph_loop::delete_ralph_learning(
                project_path,
                prd_name,
                learning_id
            ))
        }

        "list_ralph_loop_executions" => {
            // For server mode, return empty list (would need different tracking)
            serde_json::to_value(Vec::<String>::new()).map_err(|e| e.to_string())
        }

        "get_ralph_iteration_history" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let execution_id: String = get_arg(&args, "executionId")?;
            route_sync!(commands::ralph_loop::get_ralph_iteration_history(
                project_path,
                execution_id
            ))
        }

        "get_ralph_iteration_stats" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let execution_id: String = get_arg(&args, "executionId")?;
            route_sync!(commands::ralph_loop::get_ralph_iteration_stats(
                project_path,
                execution_id
            ))
        }

        "check_stale_ralph_executions" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let threshold_secs: Option<i64> = get_opt_arg(&args, "thresholdSecs")?;
            route_sync!(commands::ralph_loop::check_stale_ralph_executions(
                project_path,
                threshold_secs
            ))
        }

        "recover_stale_ralph_iterations" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let execution_id: String = get_arg(&args, "executionId")?;
            route_sync!(commands::ralph_loop::recover_stale_ralph_iterations(
                project_path,
                execution_id
            ))
        }

        "cleanup_ralph_iteration_history" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let days_to_keep: Option<i64> = get_opt_arg(&args, "daysToKeep")?;
            route_sync!(commands::ralph_loop::cleanup_ralph_iteration_history(
                project_path,
                days_to_keep
            ))
        }

        "init_ralph_prd" => {
            let request: commands::ralph_loop::InitRalphPrdRequest = get_arg(&args, "request")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::init_ralph_prd(request, prd_name))
        }

        "set_ralph_prompt" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let content: String = get_arg(&args, "content")?;
            route_unit!(commands::ralph_loop::set_ralph_prompt(
                project_path,
                prd_name,
                content
            ))
        }

        "set_ralph_config" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let config: RalphConfig = get_arg(&args, "config")?;
            route_unit!(commands::ralph_loop::set_ralph_config(project_path, config))
        }

        "init_ralph_config" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::ralph_loop::init_ralph_config(project_path))
        }

        "update_ralph_config" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let max_iterations: Option<u32> = get_opt_arg(&args, "maxIterations")?;
            let max_cost: Option<f64> = get_opt_arg(&args, "maxCost")?;
            let agent: Option<String> = get_opt_arg(&args, "agent")?;
            let model: Option<String> = get_opt_arg(&args, "model")?;
            let test_command: Option<String> = get_opt_arg(&args, "testCommand")?;
            let lint_command: Option<String> = get_opt_arg(&args, "lintCommand")?;
            let build_command: Option<String> = get_opt_arg(&args, "buildCommand")?;
            route_sync!(commands::ralph_loop::update_ralph_config(
                project_path,
                max_iterations,
                max_cost,
                agent,
                model,
                test_command,
                lint_command,
                build_command
            ))
        }

        "add_ralph_story" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let story: RalphStoryInput = get_arg(&args, "story")?;
            route_unit!(commands::ralph_loop::add_ralph_story(
                project_path,
                prd_name,
                story
            ))
        }

        "remove_ralph_story" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let story_id: String = get_arg(&args, "storyId")?;
            route_sync!(commands::ralph_loop::remove_ralph_story(
                project_path,
                prd_name,
                story_id
            ))
        }

        "mark_ralph_story_passing" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let story_id: String = get_arg(&args, "storyId")?;
            route_sync!(commands::ralph_loop::mark_ralph_story_passing(
                project_path,
                prd_name,
                story_id
            ))
        }

        "mark_ralph_story_failing" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let story_id: String = get_arg(&args, "storyId")?;
            route_sync!(commands::ralph_loop::mark_ralph_story_failing(
                project_path,
                prd_name,
                story_id
            ))
        }

        "add_ralph_progress_note" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let iteration: u32 = get_arg(&args, "iteration")?;
            let note: String = get_arg(&args, "note")?;
            route_unit!(commands::ralph_loop::add_ralph_progress_note(
                project_path,
                prd_name,
                iteration,
                note
            ))
        }

        "clear_ralph_progress" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_unit!(commands::ralph_loop::clear_ralph_progress(
                project_path,
                prd_name
            ))
        }

        "convert_prd_file_to_ralph" => {
            let request: commands::ralph_loop::ConvertPrdFileToRalphRequest =
                get_arg(&args, "request")?;
            route_sync!(commands::ralph_loop::convert_prd_file_to_ralph(request))
        }

        "cleanup_ralph_worktree" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let worktree_path: String = get_arg(&args, "worktreePath")?;
            let delete_directory: Option<bool> = get_opt_arg(&args, "deleteDirectory")?;
            route_unit!(commands::ralph_loop::cleanup_ralph_worktree(
                project_path,
                worktree_path,
                delete_directory
            ))
        }

        "list_ralph_worktrees" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::ralph_loop::list_ralph_worktrees(project_path))
        }

        "get_all_ralph_iterations" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let execution_id: Option<String> = get_opt_arg(&args, "executionId")?;
            let outcome_filter: Option<String> = get_opt_arg(&args, "outcomeFilter")?;
            let limit: Option<u32> = get_opt_arg(&args, "limit")?;
            route_sync!(commands::ralph_loop::get_all_ralph_iterations(
                project_path,
                execution_id,
                outcome_filter,
                limit
            ))
        }

        "delete_ralph_iteration_history" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let execution_id: String = get_arg(&args, "executionId")?;
            route_sync!(commands::ralph_loop::delete_ralph_iteration_history(
                project_path,
                execution_id
            ))
        }

        "regenerate_ralph_prd_acceptance" => {
            let request: commands::ralph_loop::RegenerateAcceptanceRequest =
                get_arg(&args, "request")?;
            route_sync!(commands::ralph_loop::regenerate_ralph_prd_acceptance(
                request
            ))
        }

        "regenerate_ralph_prd_stories" => {
            let request: commands::ralph_loop::RegenerateStoriesRequest =
                get_arg(&args, "request")?;
            // Use server-compatible version with EventBroadcaster for streaming
            let response = regenerate_ralph_prd_stories_server(request, &state.broadcaster).await?;
            serde_json::to_value(response).map_err(|e| e.to_string())
        }

        // Ralph Loop execution commands
        "start_ralph_loop" => {
            let request: commands::ralph_loop::StartRalphLoopRequest = get_arg(&args, "request")?;
            let execution_id = start_ralph_loop_server(request, &state).await?;
            serde_json::to_value(execution_id).map_err(|e| e.to_string())
        }

        "stop_ralph_loop" => {
            let execution_id: String = get_arg(&args, "executionId")?;
            stop_ralph_loop_server(execution_id, &state).await?;
            Ok(serde_json::Value::Null)
        }

        "get_ralph_loop_state" => get_snapshot_field(state, &args, |s| s.state.clone()),
        "get_ralph_loop_metrics" => get_snapshot_field(state, &args, |s| s.metrics.clone()),
        "get_ralph_loop_current_agent" => get_snapshot_field(state, &args, |s| s.current_agent_id.clone()),
        "get_ralph_loop_worktree_path" => get_snapshot_field(state, &args, |s| s.worktree_path.clone()),

        "get_ralph_loop_snapshot" => {
            let execution_id: String = get_arg(&args, "executionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;

            // Try in-memory snapshot first
            if let Some(snapshot) = state.ralph_loop_state.get_snapshot(&execution_id) {
                return Ok(serde_json::json!({
                    "state": snapshot.state,
                    "metrics": snapshot.metrics,
                    "worktreePath": snapshot.worktree_path,
                    "currentAgentId": snapshot.current_agent_id,
                }));
            }

            // Fall back to file-based snapshot
            let path = crate::utils::ralph_ui_dir(&project_path)
                .join("iterations")
                .join(format!("{}_snapshot.json", execution_id));

            if path.exists() {
                let content = std::fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read snapshot: {}", e))?;
                return serde_json::from_str(&content)
                    .map_err(|e| format!("Failed to parse snapshot: {}", e));
            }

            Err(format!("Execution {} not found", execution_id))
        }

        // =====================================================================
        // Template Commands
        // =====================================================================
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

        // =====================================================================
        // Model Discovery Commands
        // =====================================================================
        "get_available_models" => {
            let agent_type: AgentType = get_arg(&args, "agentType")?;
            let models = state.model_cache_state.cache.get_or_fetch(agent_type);
            serde_json::to_value(models).map_err(|e| e.to_string())
        }

        "refresh_models" => {
            let agent_type: Option<AgentType> = get_opt_arg(&args, "agentType")?;
            state.model_cache_state.cache.invalidate(agent_type);
            Ok(Value::Null)
        }

        // =====================================================================
        // Recovery Commands
        // =====================================================================
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

        // =====================================================================
        // GSD Workflow Commands
        // =====================================================================
        "start_gsd_session" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let chat_session_id: String = get_arg(&args, "chatSessionId")?;
            route_async!(
                cmd,
                commands::gsd::start_gsd_session(project_path, chat_session_id)
            )
        }

        "get_gsd_state" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(cmd, commands::gsd::get_gsd_state(project_path, session_id))
        }

        "list_gsd_sessions" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::gsd::list_gsd_sessions(project_path))
        }

        "delete_gsd_session" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_unit_async!(commands::gsd::delete_gsd_session(project_path, session_id))
        }

        "get_available_research_agents" => {
            let agents = commands::gsd::get_available_research_agents();
            serde_json::to_value(agents).map_err(|e| e.to_string())
        }

        "update_gsd_phase" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let phase: crate::gsd::state::GsdPhase = get_arg(&args, "phase")?;
            route_async!(
                cmd,
                commands::gsd::update_gsd_phase(project_path, session_id, phase)
            )
        }

        "update_questioning_context" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let context: crate::gsd::state::QuestioningContext = get_arg(&args, "context")?;
            route_async!(
                cmd,
                commands::gsd::update_questioning_context(project_path, session_id, context)
            )
        }

        "generate_project_document" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::generate_project_document(project_path, session_id)
            )
        }

        "start_research" => {
            Err("Research with streaming progress is not supported in browser mode. Use the desktop app.".to_string())
        }

        "get_research_results" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::get_research_results(project_path, session_id)
            )
        }

        "synthesize_research_cmd" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::synthesize_research_cmd(project_path, session_id)
            )
        }

        "generate_requirements_from_research" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::generate_requirements_from_research(project_path, session_id)
            )
        }

        "scope_requirements" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let selections: crate::gsd::requirements::ScopeSelection = get_arg(&args, "selections")?;
            route_async!(
                cmd,
                commands::gsd::scope_requirements(project_path, session_id, selections)
            )
        }

        "validate_requirements" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::validate_requirements(project_path, session_id)
            )
        }

        "add_requirement" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let category: String = get_arg(&args, "category")?;
            let title: String = get_arg(&args, "title")?;
            let description: String = get_arg(&args, "description")?;
            route_async!(
                cmd,
                commands::gsd::add_requirement(
                    project_path,
                    session_id,
                    category,
                    title,
                    description
                )
            )
        }

        "save_requirements" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let requirements: crate::gsd::requirements::RequirementsDoc =
                get_arg(&args, "requirements")?;
            route_unit_async!(commands::gsd::save_requirements(
                project_path,
                session_id,
                requirements
            ))
        }

        "load_requirements" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::load_requirements(project_path, session_id)
            )
        }

        "create_roadmap" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(cmd, commands::gsd::create_roadmap(project_path, session_id))
        }

        "load_roadmap" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(cmd, commands::gsd::load_roadmap(project_path, session_id))
        }

        "verify_gsd_plans" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::verify_gsd_plans(project_path, session_id)
            )
        }

        "get_verification_history" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::get_verification_history(project_path, session_id)
            )
        }

        "clear_verification_history" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_unit_async!(commands::gsd::clear_verification_history(
                project_path,
                session_id
            ))
        }

        "export_gsd_to_ralph" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let branch: String = get_arg(&args, "branch")?;
            let include_v2: Option<bool> = get_opt_arg(&args, "includeV2")?;
            let execution_config: Option<crate::ralph_loop::PrdExecutionConfig> =
                get_opt_arg(&args, "executionConfig")?;
            route_async!(
                cmd,
                commands::gsd::export_gsd_to_ralph(
                    project_path,
                    session_id,
                    prd_name,
                    branch,
                    include_v2,
                    execution_config
                )
            )
        }

        "save_planning_file" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let file_type: String = get_arg(&args, "fileType")?;
            let content: String = get_arg(&args, "content")?;
            route_async!(
                cmd,
                commands::gsd::save_planning_file(project_path, session_id, file_type, content)
            )
        }

        "read_gsd_planning_file" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let file_type: String = get_arg(&args, "fileType")?;
            route_async!(
                cmd,
                commands::gsd::read_gsd_planning_file(project_path, session_id, file_type)
            )
        }

        // =====================================================================
        // PRD Chat Commands
        // =====================================================================
        "start_prd_chat_session" => {
            let request: commands::prd_chat::StartChatSessionRequest = get_arg(&args, "request")?;
            route_async!(cmd, commands::prd_chat::start_prd_chat_session(request))
        }

        "send_prd_chat_message" => {
            let request: commands::prd_chat::SendMessageRequest = get_arg(&args, "request")?;
            // Use server-compatible version with EventBroadcaster for streaming
            let response = send_prd_chat_message_server(request, &state.broadcaster).await?;
            serde_json::to_value(response).map_err(|e| e.to_string())
        }

        "list_prd_chat_sessions" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::prd_chat::list_prd_chat_sessions(project_path))
        }

        "get_prd_chat_history" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::prd_chat::get_prd_chat_history(session_id, project_path)
            )
        }

        "delete_prd_chat_session" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit_async!(commands::prd_chat::delete_prd_chat_session(
                session_id,
                project_path
            ))
        }

        "update_prd_chat_agent" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            let agent_type: String = get_arg(&args, "agentType")?;
            route_unit_async!(commands::prd_chat::update_prd_chat_agent(
                session_id,
                project_path,
                agent_type
            ))
        }

        "assess_prd_quality" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::prd_chat::assess_prd_quality(session_id, project_path)
            )
        }

        "preview_prd_extraction" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::prd_chat::preview_prd_extraction(session_id, project_path)
            )
        }

        "check_agent_availability" => {
            let agent_type: String = get_arg(&args, "agentType")?;
            route_async!(cmd, commands::prd_chat::check_agent_availability(agent_type))
        }

        "get_guided_questions" => {
            let prd_type: String = get_arg(&args, "prdType")?;
            route_async!(cmd, commands::prd_chat::get_guided_questions(prd_type))
        }

        "set_structured_mode" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            let enabled: bool = get_arg(&args, "enabled")?;
            route_unit_async!(commands::prd_chat::set_structured_mode(
                session_id,
                project_path,
                enabled
            ))
        }

        "clear_extracted_structure" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit_async!(commands::prd_chat::clear_extracted_structure(
                session_id,
                project_path
            ))
        }

        "get_prd_plan_content" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::prd_chat::get_prd_plan_content(session_id, project_path)
            )
        }

        // File watching for browser mode
        "start_watching_prd_file" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;

            let session = crate::file_storage::chat_ops::get_chat_session(
                as_path(&project_path),
                &session_id,
            )
            .map_err(|e| format!("Failed to get session: {}", e))?;

            let file_path = crate::watchers::get_prd_plan_file_path(
                &project_path,
                &session_id,
                session.title.as_deref(),
                session.prd_id.as_deref(),
            );

            let response = state.file_watcher.watch_file(&session_id, file_path);
            serde_json::to_value(response).map_err(|e| e.to_string())
        }

        "stop_watching_prd_file" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let stopped = state.file_watcher.unwatch_file(&session_id);
            serde_json::to_value(stopped).map_err(|e| e.to_string())
        }

        // =====================================================================
        // Unknown command
        // =====================================================================
        _ => Err(format!("Unknown command: {}", cmd)),
    }
}

// =============================================================================
// Server-specific PRD Chat Implementation
// =============================================================================

/// Server-compatible version of send_prd_chat_message that uses EventBroadcaster
/// instead of Tauri's app_handle for streaming events.
///
/// Uses the shared agent_executor module for unified chat agent execution.
async fn send_prd_chat_message_server(
    request: crate::commands::prd_chat::SendMessageRequest,
    broadcaster: &Arc<EventBroadcaster>,
) -> Result<crate::commands::prd_chat::SendMessageResponse, String> {
    use crate::commands::prd_chat::agent_executor::{
        execute_chat_agent, generate_session_title, BroadcastEmitter,
    };
    use crate::file_storage::chat_ops;
    use crate::models::{AgentType, ChatMessage, MessageRole};
    use crate::parsers::structured_output;
    use uuid::Uuid;

    let project_path_obj = Path::new(&request.project_path);

    // Get session
    let session = chat_ops::get_chat_session(project_path_obj, &request.session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();

    // Validate request (including attachment constraints)
    request.validate()?;

    // Store user message with any attachments
    let user_message = ChatMessage {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id.clone(),
        role: MessageRole::User,
        content: request.content.clone(),
        created_at: now.clone(),
        attachments: request.attachments.clone(),
    };

    chat_ops::create_chat_message(project_path_obj, &user_message)
        .map_err(|e| format!("Failed to store user message: {}", e))?;

    // Get chat history for context
    let history = chat_ops::get_messages_by_session(project_path_obj, &request.session_id)
        .map_err(|e| format!("Failed to get chat history: {}", e))?;

    // Build prompt using the server helper
    let prompt = build_server_chat_prompt(&session, &history, &request.content);

    // Parse agent type
    let agent_type: AgentType = session
        .agent_type
        .parse()
        .map_err(|e| format!("Invalid agent type: {}", e))?;

    // Execute agent using the shared executor with BroadcastEmitter
    let emitter = BroadcastEmitter::new(broadcaster.clone());
    let response_content = execute_chat_agent(
        &emitter,
        &request.session_id,
        agent_type,
        &prompt,
        session.project_path.as_deref(),
    )
    .await
    .map_err(|e| format!("Agent execution failed: {}", e))?;

    // Store assistant message
    let response_now = chrono::Utc::now().to_rfc3339();
    let assistant_message = ChatMessage {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id.clone(),
        role: MessageRole::Assistant,
        content: response_content.clone(),
        created_at: response_now.clone(),
        attachments: None,
    };

    chat_ops::create_chat_message(project_path_obj, &assistant_message)
        .map_err(|e| format!("Failed to store assistant message: {}", e))?;

    // Update session timestamp
    chat_ops::update_chat_session_timestamp(project_path_obj, &request.session_id, &response_now)
        .map_err(|e| format!("Failed to update session: {}", e))?;

    // Auto-generate title if not set
    if session.title.is_none() {
        let title = generate_session_title(&request.content, session.prd_type.as_deref());
        chat_ops::update_chat_session_title(project_path_obj, &request.session_id, &title).ok();
    }

    // Handle structured mode
    if session.structured_mode {
        let new_items = structured_output::extract_items(&response_content);
        if !new_items.is_empty() {
            let mut structure: crate::models::ExtractedPRDStructure = session
                .extracted_structure
                .as_ref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default();

            structured_output::merge_items(&mut structure, new_items);

            let structure_json = serde_json::to_string(&structure)
                .map_err(|e| format!("Failed to serialize structure: {}", e))?;
            chat_ops::update_chat_session_extracted_structure(
                project_path_obj,
                &request.session_id,
                Some(&structure_json),
            )
            .map_err(|e| format!("Failed to update structure: {}", e))?;
        }
    }

    Ok(crate::commands::prd_chat::SendMessageResponse {
        user_message,
        assistant_message,
    })
}

/// Build a chat prompt for server mode
fn build_server_chat_prompt(
    session: &crate::models::ChatSession,
    history: &[crate::models::ChatMessage],
    user_message: &str,
) -> String {
    use crate::models::MessageRole;

    let mut prompt = String::from(
        "You are a helpful AI assistant helping to create a PRD (Product Requirements Document).\n\n",
    );

    if let Some(ref prd_type) = session.prd_type {
        prompt.push_str(&format!("PRD Type: {}\n\n", prd_type));
    }

    // Add conversation history (limited to last 20 messages)
    if !history.is_empty() {
        prompt.push_str("Previous conversation:\n");
        for msg in history.iter().take(20) {
            let role = match msg.role {
                MessageRole::User => "User",
                MessageRole::Assistant => "Assistant",
                MessageRole::System => "System",
            };
            prompt.push_str(&format!("{}: {}\n", role, msg.content));
        }
        prompt.push('\n');
    }

    prompt.push_str(&format!("User: {}\n\nAssistant:", user_message));
    prompt
}

// Note: generate_session_title has been moved to the shared agent_executor module.

// =============================================================================
// Server-specific Story Regeneration Implementation
// =============================================================================

/// Server-compatible version of regenerate_ralph_prd_stories that uses EventBroadcaster
/// instead of Tauri's app_handle for streaming events.
async fn regenerate_ralph_prd_stories_server(
    request: crate::commands::ralph_loop::RegenerateStoriesRequest,
    broadcaster: &Arc<EventBroadcaster>,
) -> Result<crate::ralph_loop::RalphPrd, String> {
    use crate::commands::prd_chat::agent_executor::{execute_chat_agent, BroadcastEmitter};
    use crate::models::AgentType;
    use crate::ralph_loop::{PrdExecutor, RalphStory};
    use std::fs;

    let project_path = std::path::PathBuf::from(&request.project_path);
    let prds_dir = project_path.join(".ralph-ui").join("prds");

    // Read the existing PRD JSON
    let executor = PrdExecutor::new(&project_path, &request.prd_name);
    let mut prd = executor.read_prd()?;

    // Read the markdown file
    let md_path = prds_dir.join(format!("{}.md", request.prd_name));
    let content = if md_path.exists() {
        fs::read_to_string(&md_path)
            .map_err(|e| format!("Failed to read PRD markdown file: {}", e))?
    } else {
        return Err(
            "No PRD markdown file found. Cannot regenerate stories without source content."
                .to_string(),
        );
    };

    // Parse agent type
    let agent_type: AgentType = request
        .agent_type
        .parse()
        .map_err(|_| format!("Invalid agent type: {}", request.agent_type))?;

    // Build prompt for AI extraction
    let prompt = build_story_extraction_prompt(&content);

    // Execute AI agent to extract stories using BroadcastEmitter
    let emitter = BroadcastEmitter::new(broadcaster.clone());
    let session_id = format!("story-regen-{}", uuid::Uuid::new_v4());

    let response = execute_chat_agent(
        &emitter,
        &session_id,
        agent_type,
        &prompt,
        Some(&request.project_path),
    )
    .await?;

    // Parse the AI response to extract stories
    let extracted_stories = parse_ai_story_response(&response)?;

    if extracted_stories.is_empty() {
        return Err(
            "AI did not extract any valid user stories. The PRD may need manual formatting."
                .to_string(),
        );
    }

    // Replace stories in the PRD, preserving any pass/fail status for matching IDs
    let old_status: std::collections::HashMap<String, bool> = prd
        .stories
        .iter()
        .map(|s| (s.id.clone(), s.passes))
        .collect();

    prd.stories = extracted_stories
        .into_iter()
        .map(|es| {
            let passes = old_status.get(&es.id).copied().unwrap_or(false);
            let acceptance = if es.acceptance_criteria.is_empty() {
                format!("Implement: {}", es.title)
            } else {
                es.acceptance_criteria
                    .iter()
                    .map(|c| format!("- {}", c))
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            let mut story = RalphStory::new(&es.id, &es.title, &acceptance);
            story.passes = passes;
            story
        })
        .collect();

    // Write the updated PRD
    executor.write_prd(&prd)?;

    log::info!(
        "[RalphLoop] Regenerated {} stories using AI for PRD '{}' (server mode)",
        prd.stories.len(),
        request.prd_name
    );

    Ok(prd)
}

/// Build prompt for AI to extract user stories from PRD content
fn build_story_extraction_prompt(prd_content: &str) -> String {
    format!(
        r#"Analyze this PRD document and extract all user stories in a structured format.

## PRD Content:
{}

## Instructions:
1. Identify all user stories, features, or tasks that should be implemented
2. Assign each a unique ID in the format US-X.X (e.g., US-1.1, US-1.2, US-2.1)
3. Extract or create clear acceptance criteria for each story

## Output Format:
Return ONLY a JSON array with no additional text. Each story should have:
- "id": string (US-X.X format)
- "title": string (brief, actionable title)
- "acceptance_criteria": array of strings

Example:
```json
[
  {{
    "id": "US-1.1",
    "title": "User Login",
    "acceptance_criteria": [
      "User can enter email and password",
      "Form validates inputs before submission",
      "Shows error message on invalid credentials"
    ]
  }},
  {{
    "id": "US-1.2",
    "title": "User Registration",
    "acceptance_criteria": [
      "User can create account with email",
      "Password must meet security requirements"
    ]
  }}
]
```

Extract the stories now and return ONLY the JSON array:"#,
        prd_content
    )
}

/// Parse AI response to extract stories
fn parse_ai_story_response(
    response: &str,
) -> Result<Vec<crate::commands::ralph_loop::ExtractedStory>, String> {
    // Try to find JSON array in the response
    let json_start = response.find('[');
    let json_end = response.rfind(']');

    match (json_start, json_end) {
        (Some(start), Some(end)) if start < end => {
            let json_str = &response[start..=end];
            serde_json::from_str::<Vec<crate::commands::ralph_loop::ExtractedStory>>(json_str)
                .map_err(|e| format!("Failed to parse AI response as JSON: {}", e))
        }
        _ => {
            // Try parsing the whole response as JSON
            serde_json::from_str::<Vec<crate::commands::ralph_loop::ExtractedStory>>(
                response.trim(),
            )
            .map_err(|e| format!("No valid JSON array found in AI response: {}", e))
        }
    }
}

// =============================================================================
// Server-specific Ralph Loop Implementation
// =============================================================================
//
// NOTE: This implementation mirrors `start_ralph_loop` in commands/ralph_loop.rs
// with the following differences:
// - Uses EventBroadcaster instead of Tauri's app_handle for event emission
// - Uses tokio::spawn instead of tokio::spawn
// - Accesses state via ServerAppState instead of Tauri State<>
// - Skips desktop notifications (server clients handle their own notifications)
//
// If you modify the Ralph loop logic, remember to update both implementations.
// Consider extracting shared logic into a trait-based abstraction if changes
// become frequent.
// =============================================================================

/// Server-compatible version of start_ralph_loop that uses EventBroadcaster
/// instead of Tauri's app_handle for events.
async fn start_ralph_loop_server(
    request: crate::commands::ralph_loop::StartRalphLoopRequest,
    state: &ServerAppState,
) -> Result<String, String> {
    use crate::events::{
        RalphLoopCompletedPayload, RalphLoopErrorPayload, RalphLoopErrorType,
        EVENT_RALPH_LOOP_COMPLETED, EVENT_RALPH_LOOP_ERROR,
    };
    use crate::file_storage::iterations as iteration_storage;
    use crate::models::AgentType;
    use crate::ralph_loop::{
        ErrorStrategy, ExecutionStateSnapshot, FallbackChainConfig, PrdExecutor, PrdMetadata,
        RalphLoopConfig, RalphLoopOrchestrator, RalphLoopState as RalphLoopExecutionState,
        RetryConfig,
    };
    use std::path::PathBuf;

    const HEARTBEAT_INTERVAL_SECS: u64 = 5;

    // Read PRD to get stored execution config
    let project_path_buf = PathBuf::from(&request.project_path);
    let executor = PrdExecutor::new(&project_path_buf, &request.prd_name);
    let prd = executor.read_prd()?;
    let prd_config = prd.execution_config.as_ref();

    // Get global config
    let user_config = state.config_state.get_config().ok();

    log::info!(
        "[start_ralph_loop_server] Config sources: request={}, prd_stored={}, global_config={}",
        "explicit",
        if prd_config.is_some() {
            "present"
        } else {
            "absent"
        },
        if user_config.is_some() {
            "present"
        } else {
            "absent"
        }
    );

    // Parse agent type
    let agent_type = match request.agent_type.to_lowercase().as_str() {
        "claude" => AgentType::Claude,
        "opencode" => AgentType::Opencode,
        "cursor" => AgentType::Cursor,
        "codex" => AgentType::Codex,
        _ => return Err(format!("Unknown agent type: {}", request.agent_type)),
    };

    // Resolve config values with precedence: request > prd > global > default
    let resolved_model = request
        .model
        .clone()
        .or_else(|| prd_config.and_then(|c| c.model.clone()))
        .or_else(|| {
            user_config
                .as_ref()
                .and_then(|c| c.execution.model.clone())
        });

    let resolved_max_iterations = request
        .max_iterations
        .or_else(|| prd_config.and_then(|c| c.max_iterations))
        .or_else(|| user_config.as_ref().map(|c| c.execution.max_iterations as u32))
        .unwrap_or(50);

    let resolved_max_cost = request
        .max_cost
        .or_else(|| prd_config.and_then(|c| c.max_cost));

    let resolved_run_tests = request
        .run_tests
        .or_else(|| prd_config.and_then(|c| c.run_tests))
        .or_else(|| user_config.as_ref().map(|c| c.validation.run_tests))
        .unwrap_or(true);

    let resolved_run_lint = request
        .run_lint
        .or_else(|| prd_config.and_then(|c| c.run_lint))
        .or_else(|| user_config.as_ref().map(|c| c.validation.run_lint))
        .unwrap_or(true);

    let resolved_use_worktree = request
        .use_worktree
        .or_else(|| prd_config.and_then(|c| c.use_worktree))
        .unwrap_or(true);

    let resolved_agent_timeout = request
        .agent_timeout_secs
        .or_else(|| prd_config.and_then(|c| c.agent_timeout_secs))
        .unwrap_or(0);

    let resolved_template = request
        .template_name
        .clone()
        .or_else(|| prd_config.and_then(|c| c.template_name.clone()));

    log::info!(
        "[start_ralph_loop_server] Resolved config: agent={:?}, model={:?}, max_iterations={}, max_cost={:?}, run_tests={}, run_lint={}, use_worktree={}, agent_timeout={}",
        agent_type,
        resolved_model,
        resolved_max_iterations,
        resolved_max_cost,
        resolved_run_tests,
        resolved_run_lint,
        resolved_use_worktree,
        resolved_agent_timeout
    );

    // Get fallback config from user settings
    let fallback_config = user_config.as_ref().and_then(|config| {
        if config.fallback.enabled {
            #[allow(deprecated)]
            let fallback_chain = config
                .fallback
                .fallback_chain
                .clone()
                .map(|chain| {
                    chain
                        .into_iter()
                        .filter_map(|s| match s.to_lowercase().as_str() {
                            "claude" => Some(AgentType::Claude),
                            "opencode" => Some(AgentType::Opencode),
                            "cursor" => Some(AgentType::Cursor),
                            "codex" => Some(AgentType::Codex),
                            _ => None,
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_else(|| {
                    let mut chain = vec![agent_type];
                    #[allow(deprecated)]
                    if let Some(ref fallback_str) = config.fallback.fallback_agent {
                        log::warn!(
                            "[start_ralph_loop_server] DEPRECATED: Config uses 'fallback_agent' field. \
                             Migrating to 'fallback_chain'. Please update your config to use \
                             'fallback_chain' instead."
                        );
                        let legacy_fallback = match fallback_str.to_lowercase().as_str() {
                            "claude" => Some(AgentType::Claude),
                            "opencode" => Some(AgentType::Opencode),
                            "cursor" => Some(AgentType::Cursor),
                            "codex" => Some(AgentType::Codex),
                            _ => None,
                        };
                        if let Some(agent) = legacy_fallback {
                            if agent != agent_type {
                                chain.push(agent);
                            }
                        }
                    }
                    chain
                });

            Some(FallbackChainConfig {
                fallback_chain,
                test_primary_recovery: config.fallback.test_primary_recovery.unwrap_or(true),
                recovery_test_interval: config.fallback.recovery_test_interval.unwrap_or(5),
                base_backoff_ms: config.fallback.base_backoff_ms,
                max_backoff_ms: config.fallback.max_backoff_ms,
                enabled: true,
            })
        } else {
            None
        }
    });

    // Convert ErrorStrategyConfig from user settings to ErrorStrategy
    let error_strategy = user_config
        .and_then(|c| c.fallback.error_strategy)
        .map(|es| {
            use crate::config::ErrorStrategyConfig;
            match es {
                ErrorStrategyConfig::Retry {
                    max_attempts,
                    backoff_ms,
                } => ErrorStrategy::Retry {
                    max_attempts,
                    backoff_ms,
                },
                ErrorStrategyConfig::Skip => ErrorStrategy::Skip,
                ErrorStrategyConfig::Abort => ErrorStrategy::Abort,
            }
        })
        .unwrap_or_default();

    // Build RalphLoopConfig
    let config = RalphLoopConfig {
        project_path: PathBuf::from(&request.project_path),
        agent_type,
        model: resolved_model,
        max_iterations: resolved_max_iterations,
        run_tests: resolved_run_tests,
        run_lint: resolved_run_lint,
        branch: request.branch,
        completion_promise: request.completion_promise,
        max_cost: resolved_max_cost,
        use_worktree: resolved_use_worktree,
        retry_config: RetryConfig::default(),
        error_strategy,
        fallback_config,
        agent_timeout_secs: resolved_agent_timeout,
        prd_name: request.prd_name.clone(),
        template_name: resolved_template,
        merge_strategy: MergeStrategy::default(),
        merge_interval: 0,
        conflict_resolution: ConflictResolution::default(),
        merge_target_branch: "main".to_string(),
    };

    // Create orchestrator
    let mut orchestrator = RalphLoopOrchestrator::new(config.clone());
    let execution_id = orchestrator.execution_id().to_string();

    // Get shared snapshots Arc and pass to orchestrator
    let snapshots_arc = state.ralph_loop_state.snapshots_arc();
    orchestrator.set_snapshot_store(snapshots_arc.clone());

    // Initialize snapshot with idle state
    {
        let mut snapshots = snapshots_arc
            .lock()
            .map_err(|e| format!("Snapshot lock error: {}", e))?;
        snapshots.insert(
            execution_id.clone(),
            ExecutionSnapshot {
                state: Some(RalphLoopExecutionState::Idle),
                metrics: None,
                current_agent_id: None,
                worktree_path: None,
            },
        );
    }

    // Update PRD metadata with current execution ID
    let mut prd = prd;
    if let Some(ref mut meta) = prd.metadata {
        meta.last_execution_id = Some(execution_id.clone());
        meta.updated_at = Some(chrono::Utc::now().to_rfc3339());
    } else {
        prd.metadata = Some(PrdMetadata {
            last_execution_id: Some(execution_id.clone()),
            created_at: Some(chrono::Utc::now().to_rfc3339()),
            updated_at: None,
            source_chat_id: None,
            total_iterations: 0,
            last_worktree_path: None,
        });
    }

    orchestrator.initialize(&prd)?;

    // Save initial execution state for crash recovery
    {
        let initial_state = ExecutionStateSnapshot {
            execution_id: execution_id.clone(),
            state: serde_json::to_string(&RalphLoopExecutionState::Idle).unwrap_or_default(),
            last_heartbeat: chrono::Utc::now().to_rfc3339(),
        };
        iteration_storage::save_execution_state(&project_path_buf, &initial_state)
            .map_err(|e| format!("Failed to save initial execution state: {}", e))?;
    }

    // Store orchestrator in state
    let orchestrator_arc = Arc::new(tokio::sync::Mutex::new(orchestrator));
    state
        .ralph_loop_state
        .insert_execution(execution_id.clone(), orchestrator_arc.clone())?;

    // Clone the agent manager Arc for the spawned task
    let agent_manager_arc = state.agent_manager.clone();

    log::info!(
        "[RalphLoop] Spawning background task for execution {} (server mode)",
        execution_id
    );

    // Clone for heartbeat task
    let execution_id_for_heartbeat = execution_id.clone();
    let project_path_for_heartbeat = project_path_buf.clone();
    let orchestrator_arc_for_heartbeat = orchestrator_arc.clone();

    // Spawn heartbeat task
    tokio::spawn(async move {
        let mut interval =
            tokio::time::interval(std::time::Duration::from_secs(HEARTBEAT_INTERVAL_SECS));

        loop {
            interval.tick().await;

            let is_running = {
                let orchestrator = orchestrator_arc_for_heartbeat.lock().await;
                matches!(
                    orchestrator.state(),
                    RalphLoopExecutionState::Running { .. }
                        | RalphLoopExecutionState::Retrying { .. }
                )
            };

            if !is_running {
                log::info!(
                    "[Heartbeat] Execution {} no longer running, stopping heartbeat",
                    execution_id_for_heartbeat
                );
                break;
            }

            let heartbeat = chrono::Utc::now().to_rfc3339();
            if let Err(e) = iteration_storage::update_heartbeat(
                &project_path_for_heartbeat,
                &execution_id_for_heartbeat,
                &heartbeat,
            ) {
                log::warn!(
                    "[Heartbeat] Failed to update heartbeat for {}: {}",
                    execution_id_for_heartbeat,
                    e
                );
            }
        }
    });

    // Clone for main loop task
    let execution_id_for_loop = execution_id.clone();
    let project_path_for_loop = project_path_buf.clone();
    let prd_name_for_loop = request.prd_name.clone();
    let broadcaster = state.broadcaster.clone();

    tokio::spawn(async move {
        log::info!(
            "[RalphLoop] Background task started for {} (server mode)",
            execution_id_for_loop
        );

        let mut orchestrator = orchestrator_arc.lock().await;
        let result = orchestrator.run(agent_manager_arc).await;

        // Clean up execution state from file storage
        if let Err(e) =
            iteration_storage::delete_execution_state(&project_path_for_loop, &execution_id_for_loop)
        {
            log::warn!(
                "[RalphLoop] Failed to delete execution state for {}: {}",
                execution_id_for_loop,
                e
            );
        }

        match result {
            Ok(metrics) => {
                log::info!(
                    "[RalphLoop] Loop {} completed: {} iterations, ${:.2} total cost (server mode)",
                    execution_id_for_loop,
                    metrics.total_iterations,
                    metrics.total_cost
                );

                let final_state = orchestrator.state().clone();

                match &final_state {
                    RalphLoopExecutionState::Completed { .. } => {
                        // Emit loop completed event via broadcaster
                        let payload = RalphLoopCompletedPayload {
                            execution_id: execution_id_for_loop.clone(),
                            prd_name: prd_name_for_loop.clone(),
                            total_iterations: metrics.total_iterations,
                            completed_stories: metrics.stories_completed,
                            total_stories: metrics.stories_completed + metrics.stories_remaining,
                            duration_secs: metrics.total_duration_secs,
                            total_cost: metrics.total_cost,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        };
                        broadcaster.broadcast(EVENT_RALPH_LOOP_COMPLETED, payload);
                    }
                    RalphLoopExecutionState::Failed { iteration, reason } => {
                        let error_type = if reason.contains("Max iterations") {
                            RalphLoopErrorType::MaxIterations
                        } else if reason.contains("Max cost") {
                            RalphLoopErrorType::MaxCost
                        } else {
                            RalphLoopErrorType::Unknown
                        };

                        let (stories_remaining, total_stories) =
                            if error_type == RalphLoopErrorType::MaxIterations {
                                (
                                    Some(metrics.stories_remaining),
                                    Some(metrics.stories_completed + metrics.stories_remaining),
                                )
                            } else {
                                (None, None)
                            };

                        let payload = RalphLoopErrorPayload {
                            execution_id: execution_id_for_loop.clone(),
                            prd_name: prd_name_for_loop.clone(),
                            error_type,
                            message: reason.clone(),
                            iteration: *iteration,
                            stories_remaining,
                            total_stories,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        };
                        broadcaster.broadcast(EVENT_RALPH_LOOP_ERROR, payload);
                    }
                    RalphLoopExecutionState::Cancelled { iteration } => {
                        log::info!(
                            "[RalphLoop] Loop {} was cancelled at iteration {} (server mode)",
                            execution_id_for_loop,
                            iteration
                        );
                    }
                    _ => {
                        log::warn!(
                            "[RalphLoop] Loop {} ended with unexpected state: {:?} (server mode)",
                            execution_id_for_loop,
                            final_state
                        );
                    }
                }
            }
            Err(e) => {
                log::error!(
                    "[RalphLoop] Loop {} failed: {} (server mode)",
                    execution_id_for_loop,
                    e
                );

                let metrics = orchestrator.metrics();
                let iteration = metrics.total_iterations;

                let error_str = e.to_lowercase();
                let error_type = if error_str.contains("rate limit")
                    || error_str.contains("429")
                    || error_str.contains("too many requests")
                {
                    RalphLoopErrorType::RateLimit
                } else if error_str.contains("max iterations") {
                    RalphLoopErrorType::MaxIterations
                } else if error_str.contains("max cost") {
                    RalphLoopErrorType::MaxCost
                } else if error_str.contains("timeout") || error_str.contains("timed out") {
                    RalphLoopErrorType::Timeout
                } else if error_str.contains("parse")
                    || error_str.contains("json")
                    || error_str.contains("deserialize")
                {
                    RalphLoopErrorType::ParseError
                } else if error_str.contains("conflict") || error_str.contains("merge") {
                    RalphLoopErrorType::GitConflict
                } else if error_str.contains("agent")
                    || error_str.contains("exit")
                    || error_str.contains("spawn")
                    || error_str.contains("crash")
                {
                    RalphLoopErrorType::AgentCrash
                } else {
                    RalphLoopErrorType::Unknown
                };

                let (stories_remaining, total_stories) =
                    if error_type == RalphLoopErrorType::MaxIterations {
                        (
                            Some(metrics.stories_remaining),
                            Some(metrics.stories_completed + metrics.stories_remaining),
                        )
                    } else {
                        (None, None)
                    };

                let payload = RalphLoopErrorPayload {
                    execution_id: execution_id_for_loop.clone(),
                    prd_name: prd_name_for_loop.clone(),
                    error_type,
                    message: e,
                    iteration,
                    stories_remaining,
                    total_stories,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                };
                broadcaster.broadcast(EVENT_RALPH_LOOP_ERROR, payload);
            }
        }
    });

    Ok(execution_id)
}

/// Server-compatible version of stop_ralph_loop
async fn stop_ralph_loop_server(execution_id: String, state: &ServerAppState) -> Result<(), String> {
    let orchestrator_arc = state.ralph_loop_state.get_execution(&execution_id)?;

    if let Some(orchestrator_arc) = orchestrator_arc {
        let mut orchestrator = orchestrator_arc.lock().await;
        orchestrator.cancel();
        Ok(())
    } else {
        Err(format!("No execution found with ID: {}", execution_id))
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_invoke_request_deserialization() {
        let json = r#"{"cmd": "get_sessions", "args": {"projectPath": "/tmp/test"}}"#;
        let req: InvokeRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.cmd, "get_sessions");
        assert_eq!(req.args["projectPath"], "/tmp/test");
    }

    #[test]
    fn test_invoke_response_serialization() {
        let resp = InvokeResponse {
            success: true,
            data: Some(serde_json::json!({"count": 5})),
            error: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"count\":5"));
        assert!(!json.contains("error"));
    }

    #[test]
    fn test_get_arg_success() {
        let args = serde_json::json!({"name": "test", "count": 42});
        let name: String = get_arg(&args, "name").unwrap();
        let count: i32 = get_arg(&args, "count").unwrap();
        assert_eq!(name, "test");
        assert_eq!(count, 42);
    }

    #[test]
    fn test_get_arg_missing() {
        let args = serde_json::json!({"name": "test"});
        let result: Result<i32, String> = get_arg(&args, "missing");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing argument"));
    }

    #[test]
    fn test_get_opt_arg() {
        let args = serde_json::json!({"name": "test"});
        let name: Option<String> = get_opt_arg(&args, "name").unwrap();
        let missing: Option<String> = get_opt_arg(&args, "missing").unwrap();
        assert_eq!(name, Some("test".to_string()));
        assert_eq!(missing, None);
    }

    // Note: generate_session_title tests are now in agent_executor module
}
