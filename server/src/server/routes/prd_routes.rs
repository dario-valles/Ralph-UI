//! PRD and Chat command routing
//!
//! Handles PRD file operations and PRD chat commands including:
//! scan_prd_files, get_prd_file, update_prd_file, delete_prd_file, get_prd_count,
//! start_prd_chat_session, send_prd_chat_message, list_prd_chat_sessions,
//! get_prd_chat_history, delete_prd_chat_session, update_prd_chat_agent,
//! assess_prd_quality, preview_prd_extraction, check_agent_availability,
//! get_guided_questions, set_structured_mode, clear_extracted_structure,
//! get_prd_plan_content, start_watching_prd_file, stop_watching_prd_file

use crate::commands;
use crate::file_storage::chat_ops;
use crate::utils::as_path;
use serde_json::Value;

use super::{get_arg, get_opt_arg, route_async, route_unit_async, ServerAppState};

/// Route PRD-related commands
pub async fn route_prd_command(
    cmd: &str,
    args: Value,
    state: &ServerAppState,
) -> Result<Value, String> {
    match cmd {
        // PRD File Commands
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

        "get_prd_count" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let result = commands::prd::get_prd_count(&project_path)?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        // PRD Chat Commands
        "start_prd_chat_session" => {
            let request: commands::prd_chat::StartChatSessionRequest = get_arg(&args, "request")?;
            route_async!(cmd, commands::prd_chat::start_prd_chat_session(request))
        }

        "send_prd_chat_message" => {
            let request: commands::prd_chat::SendMessageRequest = get_arg(&args, "request")?;
            // Use server-compatible version with EventBroadcaster for streaming
            let response = super::send_prd_chat_message_server(request, &state.broadcaster).await?;
            serde_json::to_value(response).map_err(|e| e.to_string())
        }

        "list_prd_chat_sessions" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::prd_chat::list_prd_chat_sessions(project_path)
            )
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
            let provider_id: Option<String> = get_opt_arg(&args, "providerId")?;
            route_unit_async!(commands::prd_chat::update_prd_chat_agent(
                session_id,
                project_path,
                agent_type,
                provider_id
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
            route_async!(
                cmd,
                commands::prd_chat::check_agent_availability(agent_type)
            )
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

            let session = chat_ops::get_chat_session(as_path(&project_path), &session_id)
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

        _ => Err(format!("Unknown PRD command: {}", cmd)),
    }
}

/// Check if a command is a PRD command
pub fn is_prd_command(cmd: &str) -> bool {
    matches!(
        cmd,
        "scan_prd_files"
            | "get_prd_file"
            | "update_prd_file"
            | "delete_prd_file"
            | "get_prd_count"
            | "start_prd_chat_session"
            | "send_prd_chat_message"
            | "list_prd_chat_sessions"
            | "get_prd_chat_history"
            | "delete_prd_chat_session"
            | "update_prd_chat_agent"
            | "assess_prd_quality"
            | "preview_prd_extraction"
            | "check_agent_availability"
            | "get_guided_questions"
            | "set_structured_mode"
            | "clear_extracted_structure"
            | "get_prd_plan_content"
            | "start_watching_prd_file"
            | "stop_watching_prd_file"
    )
}
