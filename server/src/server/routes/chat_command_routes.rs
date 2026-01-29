//! Chat command routing
//!
//! Handles chat command management commands:
//! list_chat_commands, update_chat_command, create_chat_command,
//! delete_chat_command, reset_chat_command, is_chat_command_modified

use crate::commands;
use crate::models::{
    ChatCommandScope, CreateChatCommandRequest, DeleteChatCommandRequest, ResetChatCommandRequest,
    UpdateChatCommandRequest,
};
use serde_json::Value;

use super::{get_arg, get_opt_arg, route_async, route_unit_async, ServerAppState};

/// Check if a command is a chat command route
pub fn is_chat_command_route(cmd: &str) -> bool {
    matches!(
        cmd,
        "list_chat_commands"
            | "update_chat_command"
            | "create_chat_command"
            | "delete_chat_command"
            | "reset_chat_command"
            | "is_chat_command_modified"
    )
}

/// Route chat command management commands
pub async fn route_chat_command(
    cmd: &str,
    args: Value,
    _state: &ServerAppState,
) -> Result<Value, String> {
    match cmd {
        "list_chat_commands" => {
            let project_path: Option<String> = get_opt_arg(&args, "projectPath")?;
            route_async!(cmd, commands::list_chat_commands(project_path))
        }

        "update_chat_command" => {
            let project_path: Option<String> = get_opt_arg(&args, "projectPath")?;
            let id: String = get_arg(&args, "id")?;
            let enabled: Option<bool> = get_opt_arg(&args, "enabled")?;
            let favorite: Option<bool> = get_opt_arg(&args, "favorite")?;
            let template: Option<String> = get_opt_arg(&args, "template")?;
            let label: Option<String> = get_opt_arg(&args, "label")?;
            let description: Option<String> = get_opt_arg(&args, "description")?;
            let save_scope: Option<ChatCommandScope> = get_opt_arg(&args, "saveScope")?;

            let request = UpdateChatCommandRequest {
                id,
                enabled,
                favorite,
                template,
                label,
                description,
                save_scope,
            };

            route_unit_async!(commands::update_chat_command(project_path, request))
        }

        "create_chat_command" => {
            let project_path: Option<String> = get_opt_arg(&args, "projectPath")?;
            let id: String = get_arg(&args, "id")?;
            let label: String = get_arg(&args, "label")?;
            let description: String = get_arg(&args, "description")?;
            let template: String = get_arg(&args, "template")?;
            let scope: ChatCommandScope =
                get_opt_arg(&args, "scope")?.unwrap_or(ChatCommandScope::Global);

            let request = CreateChatCommandRequest {
                id,
                label,
                description,
                template,
                scope,
            };

            route_unit_async!(commands::create_chat_command(project_path, request))
        }

        "delete_chat_command" => {
            let project_path: Option<String> = get_opt_arg(&args, "projectPath")?;
            let id: String = get_arg(&args, "id")?;
            let scope: ChatCommandScope = get_arg(&args, "scope")?;

            let request = DeleteChatCommandRequest { id, scope };

            route_unit_async!(commands::delete_chat_command(project_path, request))
        }

        "reset_chat_command" => {
            let project_path: Option<String> = get_opt_arg(&args, "projectPath")?;
            let id: String = get_arg(&args, "id")?;
            let scope: Option<ChatCommandScope> = get_opt_arg(&args, "scope")?;

            let request = ResetChatCommandRequest { id, scope };

            route_unit_async!(commands::reset_chat_command(project_path, request))
        }

        "is_chat_command_modified" => {
            let project_path: Option<String> = get_opt_arg(&args, "projectPath")?;
            let command_id: String = get_arg(&args, "commandId")?;

            route_async!(
                cmd,
                commands::is_chat_command_modified(project_path, command_id)
            )
        }

        _ => Err(format!("Unknown chat command route: {}", cmd)),
    }
}
