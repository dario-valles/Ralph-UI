//! Command proxy handler that routes HTTP requests to Tauri commands
//!
//! This implements the Command Proxy Pattern - a single /api/invoke endpoint
//! that routes to existing command functions without modifying them.

use super::events::EventBroadcaster;
use super::ServerAppState;
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

/// Server-compatible version of send_prd_chat_message that uses EventBroadcaster
/// instead of Tauri's app_handle for streaming events.
async fn send_prd_chat_message_server(
    request: crate::commands::prd_chat::SendMessageRequest,
    broadcaster: &Arc<EventBroadcaster>,
) -> Result<crate::commands::prd_chat::SendMessageResponse, String> {
    use crate::file_storage::chat_ops;
    use crate::models::{AgentType, ChatMessage, MessageRole};
    use crate::parsers::structured_output;
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;
    use tokio::time::{timeout, Duration};
    use uuid::Uuid;

    const AGENT_TIMEOUT_SECS: u64 = 1500;

    let project_path_obj = Path::new(&request.project_path);

    // Get session
    let session = chat_ops::get_chat_session(project_path_obj, &request.session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();

    // Store user message
    let user_message = ChatMessage {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id.clone(),
        role: MessageRole::User,
        content: request.content.clone(),
        created_at: now.clone(),
    };

    chat_ops::create_chat_message(project_path_obj, &user_message)
        .map_err(|e| format!("Failed to store user message: {}", e))?;

    // Get chat history for context
    let history = chat_ops::get_messages_by_session(project_path_obj, &request.session_id)
        .map_err(|e| format!("Failed to get chat history: {}", e))?;

    // Build prompt (simplified version - uses chat context)
    let prompt = build_server_chat_prompt(&session, &history, &request.content);

    // Parse agent type
    let agent_type: AgentType = session
        .agent_type
        .parse()
        .map_err(|e| format!("Invalid agent type: {}", e))?;

    // Build command args based on agent type
    let (program, args) = match agent_type {
        AgentType::Claude => (
            "claude",
            vec![
                "-p".to_string(),
                "--dangerously-skip-permissions".to_string(),
                prompt.clone(),
            ],
        ),
        AgentType::Opencode => ("opencode", vec!["run".to_string(), prompt.clone()]),
        AgentType::Cursor => (
            "cursor-agent",
            vec!["--prompt".to_string(), prompt.clone()],
        ),
        AgentType::Codex => ("codex", vec!["--prompt".to_string(), prompt.clone()]),
        AgentType::Qwen => ("qwen", vec!["--prompt".to_string(), prompt.clone()]),
        AgentType::Droid => (
            "droid",
            vec!["chat".to_string(), "--prompt".to_string(), prompt.clone()],
        ),
    };

    // Execute agent
    let mut cmd = Command::new(program);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(ref dir) = session.project_path {
        cmd.current_dir(dir);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn {}: {}", program, e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;

    let mut reader = BufReader::new(stdout).lines();
    let mut accumulated = String::new();

    let session_id_clone = request.session_id.clone();
    let broadcaster_clone = broadcaster.clone();

    // Stream lines with timeout
    let stream_result = timeout(Duration::from_secs(AGENT_TIMEOUT_SECS), async {
        while let Some(line) = reader
            .next_line()
            .await
            .map_err(|e| format!("Read error: {}", e))?
        {
            if !accumulated.is_empty() {
                accumulated.push('\n');
            }
            accumulated.push_str(&line);

            // Emit streaming chunk via WebSocket broadcaster
            broadcaster_clone.broadcast(
                "prd:chat:chunk",
                serde_json::json!({
                    "sessionId": session_id_clone,
                    "content": line,
                }),
            );
        }
        Ok::<(), String>(())
    })
    .await;

    if stream_result.is_err() {
        let _ = child.kill().await;
        return Err(format!(
            "Agent timed out after {} seconds",
            AGENT_TIMEOUT_SECS
        ));
    }

    stream_result
        .unwrap()
        .map_err(|e| format!("Streaming error: {}", e))?;

    // Wait for process to complete
    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for process: {}", e))?;

    if !status.success() && accumulated.is_empty() {
        return Err(format!("Agent process failed with status: {}", status));
    }

    let response_content = accumulated;

    // Store assistant message
    let response_now = chrono::Utc::now().to_rfc3339();
    let assistant_message = ChatMessage {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id.clone(),
        role: MessageRole::Assistant,
        content: response_content.clone(),
        created_at: response_now.clone(),
    };

    chat_ops::create_chat_message(project_path_obj, &assistant_message)
        .map_err(|e| format!("Failed to store assistant message: {}", e))?;

    // Update session timestamp
    chat_ops::update_chat_session_timestamp(project_path_obj, &request.session_id, &response_now)
        .map_err(|e| format!("Failed to update session: {}", e))?;

    // Auto-generate title if not set
    if session.title.is_none() {
        let title = generate_session_title_server(&request.content, session.prd_type.as_deref());
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

/// Build a chat prompt for server mode (simplified version)
fn build_server_chat_prompt(
    session: &crate::models::ChatSession,
    history: &[crate::models::ChatMessage],
    user_message: &str,
) -> String {
    let mut prompt = String::new();

    // Add system context
    prompt.push_str("You are a helpful AI assistant helping to create a PRD (Product Requirements Document).\n\n");

    if let Some(ref prd_type) = session.prd_type {
        prompt.push_str(&format!("PRD Type: {}\n\n", prd_type));
    }

    // Add conversation history
    if !history.is_empty() {
        prompt.push_str("Previous conversation:\n");
        for msg in history.iter().take(20) {
            // Limit context
            let role = match msg.role {
                crate::models::MessageRole::User => "User",
                crate::models::MessageRole::Assistant => "Assistant",
                crate::models::MessageRole::System => "System",
            };
            prompt.push_str(&format!("{}: {}\n", role, msg.content));
        }
        prompt.push('\n');
    }

    prompt.push_str(&format!("User: {}\n\nAssistant:", user_message));
    prompt
}

/// Generate a session title from the first message (server version)
fn generate_session_title_server(first_message: &str, prd_type: Option<&str>) -> String {
    let prefix = prd_type
        .map(|t| match t {
            "new_feature" => "Feature: ",
            "bug_fix" => "Bug Fix: ",
            "refactoring" => "Refactor: ",
            "api_integration" => "API: ",
            "full_new_app" => "New App: ",
            _ => "",
        })
        .unwrap_or("");

    let summary: String = first_message.chars().take(50).collect();
    let summary = summary.split_whitespace().take(6).collect::<Vec<_>>().join(" ");

    format!("{}{}", prefix, summary)
}

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

    // Helper macro to extract args
    macro_rules! get_arg {
        ($args:expr, $name:expr, $type:ty) => {
            serde_json::from_value::<$type>(
                $args
                    .get($name)
                    .ok_or_else(|| format!("Missing argument: {}", $name))?
                    .clone(),
            )
            .map_err(|e| format!("Invalid argument {}: {}", $name, e))?
        };
    }

    macro_rules! get_opt_arg {
        ($args:expr, $name:expr, $type:ty) => {
            $args
                .get($name)
                .map(|v| serde_json::from_value::<$type>(v.clone()))
                .transpose()
                .map_err(|e| format!("Invalid argument {}: {}", $name, e))?
        };
    }

    match cmd {
        // =====================================================================
        // Session Commands
        // =====================================================================
        "create_session" => {
            let name: String = get_arg!(args, "name", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let config: Option<SessionConfig> = get_opt_arg!(args, "config", SessionConfig);

            // For server mode, we call the storage directly
            let session_config = match config {
                Some(explicit_config) => explicit_config,
                None => {
                    match state.config_state.get_config() {
                        Ok(ralph_config) => (&ralph_config).into(),
                        Err(_) => SessionConfig::default(),
                    }
                }
            };

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

            let path = Path::new(&project_path);
            file_storage::sessions::save_session(path, &session)?;
            serde_json::to_value(session).map_err(|e| e.to_string())
        }

        "get_sessions" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let sessions = commands::sessions::get_sessions(project_path).await?;
            serde_json::to_value(sessions).map_err(|e| e.to_string())
        }

        "get_session" => {
            let id: String = get_arg!(args, "id", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let session = commands::sessions::get_session(id, project_path).await?;
            serde_json::to_value(session).map_err(|e| e.to_string())
        }

        "update_session" => {
            let session: Session = get_arg!(args, "session", Session);
            let session = commands::sessions::update_session(session).await?;
            serde_json::to_value(session).map_err(|e| e.to_string())
        }

        "delete_session" => {
            let id: String = get_arg!(args, "id", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            commands::sessions::delete_session(id, project_path).await?;
            Ok(Value::Null)
        }

        // =====================================================================
        // Task Commands
        // =====================================================================
        "create_task" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let task: Task = get_arg!(args, "task", Task);
            let project_path: String = get_arg!(args, "projectPath", String);
            let task = commands::tasks::create_task(session_id, task, project_path).await?;
            serde_json::to_value(task).map_err(|e| e.to_string())
        }

        "get_task" => {
            let task_id: String = get_arg!(args, "taskId", String);
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let task = commands::tasks::get_task(task_id, session_id, project_path).await?;
            serde_json::to_value(task).map_err(|e| e.to_string())
        }

        "get_tasks_for_session" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let tasks = commands::tasks::get_tasks_for_session(session_id, project_path).await?;
            serde_json::to_value(tasks).map_err(|e| e.to_string())
        }

        "update_task" => {
            let task: Task = get_arg!(args, "task", Task);
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let task = commands::tasks::update_task(task, session_id, project_path).await?;
            serde_json::to_value(task).map_err(|e| e.to_string())
        }

        "delete_task" => {
            let task_id: String = get_arg!(args, "taskId", String);
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            commands::tasks::delete_task(task_id, session_id, project_path).await?;
            Ok(Value::Null)
        }

        "import_prd" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let content: String = get_arg!(args, "content", String);
            let format: Option<String> = get_opt_arg!(args, "format", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let tasks =
                commands::tasks::import_prd(session_id, content, format, project_path).await?;
            serde_json::to_value(tasks).map_err(|e| e.to_string())
        }

        // =====================================================================
        // Agent Commands
        // =====================================================================
        "create_agent" => {
            let agent: Agent = get_arg!(args, "agent", Agent);
            let project_path: String = get_arg!(args, "projectPath", String);
            commands::agents::create_agent(agent, project_path)?;
            Ok(Value::Null)
        }

        "get_agent" => {
            let agent_id: String = get_arg!(args, "agentId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let agent = commands::agents::get_agent(agent_id, project_path)?;
            serde_json::to_value(agent).map_err(|e| e.to_string())
        }

        "get_agents_for_session" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let agents = commands::agents::get_agents_for_session(session_id, project_path)?;
            serde_json::to_value(agents).map_err(|e| e.to_string())
        }

        "get_agents_for_task" => {
            let task_id: String = get_arg!(args, "taskId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let agents = commands::agents::get_agents_for_task(task_id, project_path)?;
            serde_json::to_value(agents).map_err(|e| e.to_string())
        }

        "get_active_agents" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let agents = commands::agents::get_active_agents(session_id, project_path)?;
            serde_json::to_value(agents).map_err(|e| e.to_string())
        }

        "get_all_active_agents" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let agents = commands::agents::get_all_active_agents(project_path)?;
            serde_json::to_value(agents).map_err(|e| e.to_string())
        }

        "update_agent_metrics" => {
            let agent_id: String = get_arg!(args, "agentId", String);
            let tokens: i32 = get_arg!(args, "tokens", i32);
            let cost: f64 = get_arg!(args, "cost", f64);
            let iteration_count: i32 = get_arg!(args, "iterationCount", i32);
            let project_path: String = get_arg!(args, "projectPath", String);
            commands::agents::update_agent_metrics(
                agent_id,
                tokens,
                cost,
                iteration_count,
                project_path,
            )?;
            Ok(Value::Null)
        }

        "update_agent_process_id" => {
            let agent_id: String = get_arg!(args, "agentId", String);
            let process_id: Option<u32> = get_opt_arg!(args, "processId", u32);
            let project_path: String = get_arg!(args, "projectPath", String);
            commands::agents::update_agent_process_id(agent_id, process_id, project_path)?;
            Ok(Value::Null)
        }

        "delete_agent" => {
            let agent_id: String = get_arg!(args, "agentId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            commands::agents::delete_agent(agent_id, project_path)?;
            Ok(Value::Null)
        }

        // =====================================================================
        // PRD Commands (File-based)
        // =====================================================================
        "scan_prd_files" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let files = commands::prd::scan_prd_files(project_path).await?;
            serde_json::to_value(files).map_err(|e| e.to_string())
        }

        "get_prd_file" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let prd_name: String = get_arg!(args, "prdName", String);
            let file = commands::prd::get_prd_file(project_path, prd_name).await?;
            serde_json::to_value(file).map_err(|e| e.to_string())
        }

        "update_prd_file" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let prd_name: String = get_arg!(args, "prdName", String);
            let content: String = get_arg!(args, "content", String);
            let file = commands::prd::update_prd_file(project_path, prd_name, content).await?;
            serde_json::to_value(file).map_err(|e| e.to_string())
        }

        "delete_prd_file" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let prd_name: String = get_arg!(args, "prdName", String);
            let result = commands::prd::delete_prd_file(project_path, prd_name).await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        // =====================================================================
        // Project Commands
        // =====================================================================
        "register_project" => {
            let path: String = get_arg!(args, "path", String);
            let name: Option<String> = get_opt_arg!(args, "name", String);
            let project = commands::projects::register_project(path, name)?;
            serde_json::to_value(project).map_err(|e| e.to_string())
        }

        "get_project" => {
            let project_id: String = get_arg!(args, "projectId", String);
            let project = commands::projects::get_project(project_id)?;
            serde_json::to_value(project).map_err(|e| e.to_string())
        }

        "get_project_by_path" => {
            let path: String = get_arg!(args, "path", String);
            let project = commands::projects::get_project_by_path(path)?;
            serde_json::to_value(project).map_err(|e| e.to_string())
        }

        "get_all_projects" => {
            let projects = commands::projects::get_all_projects()?;
            serde_json::to_value(projects).map_err(|e| e.to_string())
        }

        "get_recent_projects" => {
            let limit: Option<i32> = get_opt_arg!(args, "limit", i32);
            let projects = commands::projects::get_recent_projects(limit)?;
            serde_json::to_value(projects).map_err(|e| e.to_string())
        }

        "get_favorite_projects" => {
            let projects = commands::projects::get_favorite_projects()?;
            serde_json::to_value(projects).map_err(|e| e.to_string())
        }

        "update_project_name" => {
            let project_id: String = get_arg!(args, "projectId", String);
            let name: String = get_arg!(args, "name", String);
            commands::projects::update_project_name(project_id, name)?;
            Ok(Value::Null)
        }

        "toggle_project_favorite" => {
            let project_id: String = get_arg!(args, "projectId", String);
            let is_favorite = commands::projects::toggle_project_favorite(project_id)?;
            serde_json::to_value(is_favorite).map_err(|e| e.to_string())
        }

        "set_project_favorite" => {
            let project_id: String = get_arg!(args, "projectId", String);
            let is_favorite: bool = get_arg!(args, "isFavorite", bool);
            commands::projects::set_project_favorite(project_id, is_favorite)?;
            Ok(Value::Null)
        }

        "touch_project" => {
            let project_id: String = get_arg!(args, "projectId", String);
            commands::projects::touch_project(project_id)?;
            Ok(Value::Null)
        }

        "delete_project" => {
            let project_id: String = get_arg!(args, "projectId", String);
            commands::projects::delete_project(project_id)?;
            Ok(Value::Null)
        }

        // =====================================================================
        // Git Commands
        // Call git operations directly via GitManager
        // =====================================================================
        "git_list_branches" => {
            let repo_path: String = get_arg!(args, "repoPath", String);
            let branches = state.git_state.with_manager(&repo_path, |mgr| {
                mgr.list_branches()
            })?;
            serde_json::to_value(branches).map_err(|e| e.to_string())
        }

        "git_get_current_branch" => {
            let repo_path: String = get_arg!(args, "repoPath", String);
            let branch = state.git_state.with_manager(&repo_path, |mgr| {
                mgr.get_current_branch()
            })?;
            serde_json::to_value(branch).map_err(|e| e.to_string())
        }

        "git_get_status" => {
            let repo_path: String = get_arg!(args, "repoPath", String);
            let status = state.git_state.with_manager(&repo_path, |mgr| {
                mgr.get_status()
            })?;
            serde_json::to_value(status).map_err(|e| e.to_string())
        }

        "git_get_commit_history" => {
            let repo_path: String = get_arg!(args, "repoPath", String);
            let limit: Option<usize> = get_opt_arg!(args, "limit", usize);
            let commits = state.git_state.with_manager(&repo_path, |mgr| {
                mgr.get_commit_history(limit.unwrap_or(50))
            })?;
            serde_json::to_value(commits).map_err(|e| e.to_string())
        }

        "git_is_repository" => {
            let path: String = get_arg!(args, "path", String);
            let git_path = Path::new(&path).join(".git");
            let is_repo = git_path.exists();
            serde_json::to_value(is_repo).map_err(|e| e.to_string())
        }

        "git_create_branch" => {
            let repo_path: String = get_arg!(args, "repoPath", String);
            let branch_name: String = get_arg!(args, "branchName", String);
            let force: bool = get_opt_arg!(args, "force", bool).unwrap_or(false);
            let branch = state.git_state.with_manager(&repo_path, |mgr| {
                mgr.create_branch(&branch_name, force)
            })?;
            serde_json::to_value(branch).map_err(|e| e.to_string())
        }

        "git_checkout_branch" => {
            let repo_path: String = get_arg!(args, "repoPath", String);
            let branch_name: String = get_arg!(args, "branchName", String);
            state.git_state.with_manager(&repo_path, |mgr| {
                mgr.checkout_branch(&branch_name)
            })?;
            Ok(Value::Null)
        }

        "git_delete_branch" => {
            let repo_path: String = get_arg!(args, "repoPath", String);
            let branch_name: String = get_arg!(args, "branchName", String);
            state.git_state.with_manager(&repo_path, |mgr| {
                mgr.delete_branch(&branch_name)
            })?;
            Ok(Value::Null)
        }

        // =====================================================================
        // Config Commands
        // Call ConfigState methods directly
        // =====================================================================
        "get_config" => {
            let config = state.config_state.get_config()?;
            serde_json::to_value(config).map_err(|e| e.to_string())
        }

        "set_config_project_path" => {
            let project_path: Option<String> = get_opt_arg!(args, "projectPath", String);
            let path = project_path.map(std::path::PathBuf::from);
            state.config_state.set_project_path(path)?;
            let config = state.config_state.get_config()?;
            serde_json::to_value(config).map_err(|e| e.to_string())
        }

        "reload_config" => {
            let config = state.config_state.get_config()?;
            serde_json::to_value(config).map_err(|e| e.to_string())
        }

        // =====================================================================
        // Mission Control Commands
        // =====================================================================
        "get_activity_feed" => {
            let limit: Option<i32> = get_opt_arg!(args, "limit", i32);
            let offset: Option<i32> = get_opt_arg!(args, "offset", i32);
            let feed = commands::mission_control::get_activity_feed(limit, offset)?;
            serde_json::to_value(feed).map_err(|e| e.to_string())
        }

        "get_global_stats" => {
            let stats = commands::mission_control::get_global_stats()?;
            serde_json::to_value(stats).map_err(|e| e.to_string())
        }

        // =====================================================================
        // Ralph Loop Commands
        // =====================================================================
        "get_ralph_prd" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let prd_name: String = get_arg!(args, "prdName", String);
            let prd = commands::ralph_loop::get_ralph_prd(project_path, prd_name)?;
            serde_json::to_value(prd).map_err(|e| e.to_string())
        }

        "get_ralph_prd_status" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let prd_name: String = get_arg!(args, "prdName", String);
            let status = commands::ralph_loop::get_ralph_prd_status(project_path, prd_name)?;
            serde_json::to_value(status).map_err(|e| e.to_string())
        }

        "get_ralph_progress" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let prd_name: String = get_arg!(args, "prdName", String);
            let progress = commands::ralph_loop::get_ralph_progress(project_path, prd_name)?;
            serde_json::to_value(progress).map_err(|e| e.to_string())
        }

        "get_ralph_progress_summary" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let prd_name: String = get_arg!(args, "prdName", String);
            let summary =
                commands::ralph_loop::get_ralph_progress_summary(project_path, prd_name)?;
            serde_json::to_value(summary).map_err(|e| e.to_string())
        }

        "get_ralph_prompt" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let prd_name: String = get_arg!(args, "prdName", String);
            let prompt = commands::ralph_loop::get_ralph_prompt(project_path, prd_name)?;
            serde_json::to_value(prompt).map_err(|e| e.to_string())
        }

        "has_ralph_files" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let has_files = commands::ralph_loop::has_ralph_files(project_path);
            serde_json::to_value(has_files).map_err(|e| e.to_string())
        }

        "get_ralph_files" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let files = commands::ralph_loop::get_ralph_files(project_path)?;
            serde_json::to_value(files).map_err(|e| e.to_string())
        }

        "get_ralph_config" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let config = commands::ralph_loop::get_ralph_config(project_path)?;
            serde_json::to_value(config).map_err(|e| e.to_string())
        }

        "list_ralph_loop_executions" => {
            // For server mode, we'd need to track this differently
            // For now, return empty list
            let executions: Vec<String> = vec![];
            serde_json::to_value(executions).map_err(|e| e.to_string())
        }

        "get_ralph_iteration_history" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let execution_id: String = get_arg!(args, "executionId", String);
            let history = commands::ralph_loop::get_ralph_iteration_history(project_path, execution_id)?;
            serde_json::to_value(history).map_err(|e| e.to_string())
        }

        "get_ralph_iteration_stats" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let execution_id: String = get_arg!(args, "executionId", String);
            let stats = commands::ralph_loop::get_ralph_iteration_stats(project_path, execution_id)?;
            serde_json::to_value(stats).map_err(|e| e.to_string())
        }

        "check_stale_ralph_executions" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let threshold_secs: Option<i64> = get_opt_arg!(args, "thresholdSecs", i64);
            let stale = commands::ralph_loop::check_stale_ralph_executions(project_path, threshold_secs)?;
            serde_json::to_value(stale).map_err(|e| e.to_string())
        }

        "recover_stale_ralph_iterations" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let execution_id: String = get_arg!(args, "executionId", String);
            let count = commands::ralph_loop::recover_stale_ralph_iterations(project_path, execution_id)?;
            serde_json::to_value(count).map_err(|e| e.to_string())
        }

        "cleanup_ralph_iteration_history" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let days_to_keep: Option<i64> = get_opt_arg!(args, "daysToKeep", i64);
            let count = commands::ralph_loop::cleanup_ralph_iteration_history(project_path, days_to_keep)?;
            serde_json::to_value(count).map_err(|e| e.to_string())
        }

        // =====================================================================
        // Template Commands
        // =====================================================================
        "list_templates" => {
            let project_path: Option<String> = get_opt_arg!(args, "projectPath", String);
            let templates = commands::templates::list_templates(project_path).await?;
            serde_json::to_value(templates).map_err(|e| e.to_string())
        }

        "list_builtin_templates" => {
            let templates = commands::templates::list_builtin_templates().await?;
            serde_json::to_value(templates).map_err(|e| e.to_string())
        }

        "get_template_content" => {
            let name: String = get_arg!(args, "name", String);
            let project_path: Option<String> = get_opt_arg!(args, "projectPath", String);
            let content = commands::templates::get_template_content(name, project_path).await?;
            serde_json::to_value(content).map_err(|e| e.to_string())
        }

        "save_template" => {
            let name: String = get_arg!(args, "name", String);
            let content: String = get_arg!(args, "content", String);
            let scope: String = get_arg!(args, "scope", String);
            let project_path: Option<String> = get_opt_arg!(args, "projectPath", String);
            commands::templates::save_template(name, content, scope, project_path).await?;
            Ok(Value::Null)
        }

        "delete_template" => {
            let name: String = get_arg!(args, "name", String);
            let scope: String = get_arg!(args, "scope", String);
            let project_path: Option<String> = get_opt_arg!(args, "projectPath", String);
            commands::templates::delete_template(name, scope, project_path).await?;
            Ok(Value::Null)
        }

        // =====================================================================
        // Model Discovery Commands
        // Call ModelCache directly
        // =====================================================================
        "get_available_models" => {
            let agent_type: AgentType = get_arg!(args, "agentType", AgentType);
            let models = state.model_cache_state.cache.get_or_fetch(agent_type);
            serde_json::to_value(models).map_err(|e| e.to_string())
        }

        "refresh_models" => {
            let agent_type: Option<AgentType> = get_opt_arg!(args, "agentType", AgentType);
            state.model_cache_state.cache.invalidate(agent_type);
            Ok(Value::Null)
        }

        // =====================================================================
        // Recovery Commands
        // =====================================================================
        "check_stale_sessions" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let stale = commands::recovery::check_stale_sessions(project_path).await?;
            serde_json::to_value(stale).map_err(|e| e.to_string())
        }

        "recover_stale_session" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let result = commands::recovery::recover_stale_session(session_id, project_path).await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        "recover_all_stale_sessions" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let results = commands::recovery::recover_all_stale_sessions(project_path).await?;
            serde_json::to_value(results).map_err(|e| e.to_string())
        }

        // =====================================================================
        // GSD Workflow Commands
        // =====================================================================
        "start_gsd_session" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let chat_session_id: String = get_arg!(args, "chatSessionId", String);
            let state_result = commands::gsd::start_gsd_session(project_path, chat_session_id).await?;
            serde_json::to_value(state_result).map_err(|e| e.to_string())
        }

        "get_gsd_state" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let session_id: String = get_arg!(args, "sessionId", String);
            let state_result = commands::gsd::get_gsd_state(project_path, session_id).await?;
            serde_json::to_value(state_result).map_err(|e| e.to_string())
        }

        "list_gsd_sessions" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let sessions = commands::gsd::list_gsd_sessions(project_path).await?;
            serde_json::to_value(sessions).map_err(|e| e.to_string())
        }

        "delete_gsd_session" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let session_id: String = get_arg!(args, "sessionId", String);
            commands::gsd::delete_gsd_session(project_path, session_id).await?;
            Ok(Value::Null)
        }

        "get_available_research_agents" => {
            let agents = commands::gsd::get_available_research_agents();
            serde_json::to_value(agents).map_err(|e| e.to_string())
        }

        // =====================================================================
        // PRD Chat Commands
        // =====================================================================
        "start_prd_chat_session" => {
            let request: commands::prd_chat::StartChatSessionRequest =
                get_arg!(args, "request", commands::prd_chat::StartChatSessionRequest);
            let session = commands::prd_chat::start_prd_chat_session(request).await?;
            serde_json::to_value(session).map_err(|e| e.to_string())
        }

        "send_prd_chat_message" => {
            let request: commands::prd_chat::SendMessageRequest =
                get_arg!(args, "request", commands::prd_chat::SendMessageRequest);
            // Use server-compatible version with EventBroadcaster for streaming
            let response = send_prd_chat_message_server(request, &state.broadcaster).await?;
            serde_json::to_value(response).map_err(|e| e.to_string())
        }

        "list_prd_chat_sessions" => {
            let project_path: String = get_arg!(args, "projectPath", String);
            let sessions = commands::prd_chat::list_prd_chat_sessions(project_path).await?;
            serde_json::to_value(sessions).map_err(|e| e.to_string())
        }

        "get_prd_chat_history" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let history = commands::prd_chat::get_prd_chat_history(session_id, project_path).await?;
            serde_json::to_value(history).map_err(|e| e.to_string())
        }

        "delete_prd_chat_session" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            commands::prd_chat::delete_prd_chat_session(session_id, project_path).await?;
            Ok(Value::Null)
        }

        "update_prd_chat_agent" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let agent_type: String = get_arg!(args, "agentType", String);
            commands::prd_chat::update_prd_chat_agent(session_id, project_path, agent_type).await?;
            Ok(Value::Null)
        }

        "assess_prd_quality" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let assessment = commands::prd_chat::assess_prd_quality(session_id, project_path).await?;
            serde_json::to_value(assessment).map_err(|e| e.to_string())
        }

        "preview_prd_extraction" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let content = commands::prd_chat::preview_prd_extraction(session_id, project_path).await?;
            serde_json::to_value(content).map_err(|e| e.to_string())
        }

        "check_agent_availability" => {
            let agent_type: String = get_arg!(args, "agentType", String);
            let result = commands::prd_chat::check_agent_availability(agent_type).await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        "get_guided_questions" => {
            let prd_type: String = get_arg!(args, "prdType", String);
            let questions = commands::prd_chat::get_guided_questions(prd_type).await?;
            serde_json::to_value(questions).map_err(|e| e.to_string())
        }

        "set_structured_mode" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let enabled: bool = get_arg!(args, "enabled", bool);
            commands::prd_chat::set_structured_mode(session_id, project_path, enabled).await?;
            Ok(Value::Null)
        }

        "clear_extracted_structure" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            commands::prd_chat::clear_extracted_structure(session_id, project_path).await?;
            Ok(Value::Null)
        }

        "get_prd_plan_content" => {
            let session_id: String = get_arg!(args, "sessionId", String);
            let project_path: String = get_arg!(args, "projectPath", String);
            let content = commands::prd_chat::get_prd_plan_content(session_id, project_path).await?;
            serde_json::to_value(content).map_err(|e| e.to_string())
        }

        // File watching stubs for browser mode (desktop-only functionality)
        // These return success but don't actually watch files in server mode
        "start_watching_prd_file" => {
            // In server mode, file watching is not supported
            // Return a stub response indicating the feature is unavailable
            let response = serde_json::json!({
                "success": false,
                "path": "",
                "initial_content": null,
                "error": "File watching is not available in browser mode"
            });
            Ok(response)
        }

        "stop_watching_prd_file" => {
            // In server mode, file watching is not supported
            // Return true to indicate "stopped" (no-op)
            serde_json::to_value(true).map_err(|e| e.to_string())
        }

        // =====================================================================
        // Default: Unknown command
        // =====================================================================
        _ => Err(format!("Unknown command: {}", cmd)),
    }
}

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
}
