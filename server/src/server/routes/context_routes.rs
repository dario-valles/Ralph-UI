//! Context-related command routing
//!
//! Handles: get_project_context, save_context_file, delete_context_file,
//! start_context_chat_session, send_context_chat_message, etc.

use crate::commands;
use crate::models::context::ContextConfig;
use serde_json::Value;

use super::{get_arg, get_opt_arg, route_async, route_unit_async, ServerAppState};

/// Route context-related commands
pub async fn route_context_command(
    cmd: &str,
    args: Value,
    state: &ServerAppState,
) -> Result<Value, String> {
    match cmd {
        // =========================================================================
        // Context File Commands
        // =========================================================================
        "get_project_context" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::context::get_project_context(project_path))
        }

        "get_context_config" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::context::get_context_config(project_path))
        }

        "save_context_config" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let config: ContextConfig = get_arg(&args, "config")?;
            route_unit_async!(commands::context::save_context_config(project_path, config))
        }

        "get_context_file" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let name: String = get_arg(&args, "name")?;
            route_async!(cmd, commands::context::get_context_file(project_path, name))
        }

        "get_context_files" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::context::get_context_files(project_path))
        }

        "save_context_file" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let name: String = get_arg(&args, "name")?;
            let content: String = get_arg(&args, "content")?;
            let mode: Option<String> = get_opt_arg(&args, "mode")?;
            route_async!(
                cmd,
                commands::context::save_context_file(project_path, name, content, mode)
            )
        }

        "delete_context_file" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let name: String = get_arg(&args, "name")?;
            route_unit_async!(commands::context::delete_context_file(project_path, name))
        }

        "delete_all_context_files" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit_async!(commands::context::delete_all_context_files(project_path))
        }

        "dismiss_context_setup" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit_async!(commands::context::dismiss_context_setup(project_path))
        }

        "clear_context_setup_dismissal" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit_async!(commands::context::clear_context_setup_dismissal(
                project_path
            ))
        }

        "get_default_context_template" => {
            route_async!(cmd, commands::context::get_default_context_template())
        }

        "has_context_files" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::context::has_context_files(project_path))
        }

        "get_context_for_injection" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let for_prd_chat: bool = get_opt_arg(&args, "forPrdChat")?.unwrap_or(true);
            route_async!(
                cmd,
                commands::context::get_context_for_injection(project_path, for_prd_chat)
            )
        }

        // =========================================================================
        // Context Chat Commands
        // =========================================================================
        "start_context_chat_session" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let agent_type: String = get_arg(&args, "agentType")?;

            let request = commands::context_chat::StartContextChatRequest {
                project_path,
                agent_type,
            };

            route_async!(
                cmd,
                commands::context_chat::start_context_chat_session(request)
            )
        }

        "list_context_chat_sessions" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::context_chat::list_context_chat_sessions(project_path)
            )
        }

        "get_context_chat_session" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::context_chat::get_context_chat_session(session_id, project_path)
            )
        }

        "delete_context_chat_session" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_unit_async!(commands::context_chat::delete_context_chat_session(
                session_id,
                project_path
            ))
        }

        "get_context_chat_messages" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::context_chat::get_context_chat_messages(session_id, project_path)
            )
        }

        "send_context_chat_message" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            let content: String = get_arg(&args, "content")?;

            let request = commands::context_chat::SendContextChatMessageRequest {
                session_id,
                project_path,
                content,
            };

            route_async!(
                cmd,
                commands::context_chat::send_context_chat_message(
                    state.broadcaster.clone(),
                    request
                )
            )
        }

        "save_context_from_chat" => {
            let session_id: String = get_arg(&args, "sessionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;
            let content: Option<String> = get_opt_arg(&args, "content")?;
            route_unit_async!(commands::context_chat::save_context_from_chat(
                session_id,
                project_path,
                content
            ))
        }

        _ => Err(format!("Unknown context command: {}", cmd)),
    }
}

/// Check if a command is a context command
pub fn is_context_command(cmd: &str) -> bool {
    matches!(
        cmd,
        // Context file commands
        "get_project_context"
            | "get_context_config"
            | "save_context_config"
            | "get_context_file"
            | "get_context_files"
            | "save_context_file"
            | "delete_context_file"
            | "delete_all_context_files"
            | "dismiss_context_setup"
            | "clear_context_setup_dismissal"
            | "get_default_context_template"
            | "has_context_files"
            | "get_context_for_injection"
            // Context chat commands
            | "start_context_chat_session"
            | "list_context_chat_sessions"
            | "get_context_chat_session"
            | "delete_context_chat_session"
            | "get_context_chat_messages"
            | "send_context_chat_message"
            | "save_context_from_chat"
    )
}
