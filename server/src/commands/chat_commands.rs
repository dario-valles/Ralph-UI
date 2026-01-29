//! Chat command management commands
//!
//! Backend commands for managing customizable slash commands in PRD Chat.

use crate::file_storage::chat_command_ops;
use crate::models::{
    ChatCommandConfig, ChatCommandPreference, ChatCommandScope, ChatCommandsResponse,
    CreateChatCommandRequest, DeleteChatCommandRequest, ResetChatCommandRequest,
    UpdateChatCommandRequest,
};
use std::path::Path;

/// List all available chat commands (merged from builtin + project + global)
///
/// Returns commands with their current enabled/favorite state and scope information.
pub async fn list_chat_commands(
    project_path: Option<String>,
) -> Result<ChatCommandsResponse, String> {
    let project = project_path.as_ref().map(|p| Path::new(p));
    let commands = chat_command_ops::merge_commands(project);

    Ok(ChatCommandsResponse { commands })
}

/// Update a chat command's properties
///
/// For builtin commands, this creates/updates a preference override.
/// For custom commands, this updates the command directly.
pub async fn update_chat_command(
    project_path: Option<String>,
    request: UpdateChatCommandRequest,
) -> Result<(), String> {
    let project = project_path.as_ref().map(|p| Path::new(p));

    // Determine the save scope (default to global if not specified)
    let save_scope = request.save_scope.unwrap_or(ChatCommandScope::Global);

    // Check if this is a builtin command
    let builtins = chat_command_ops::get_builtin_commands();
    let is_builtin = builtins.iter().any(|b| b.id == request.id);

    if is_builtin {
        // Update builtin preference
        let pref = ChatCommandPreference {
            enabled: request.enabled,
            favorite: request.favorite,
            template: request.template,
            label: request.label,
            description: request.description,
        };

        chat_command_ops::update_builtin_preference(project, save_scope, &request.id, pref)
    } else {
        // Update custom command
        let pref = ChatCommandPreference {
            enabled: request.enabled,
            favorite: request.favorite,
            template: request.template,
            label: request.label,
            description: request.description,
        };

        chat_command_ops::update_custom_command(project, save_scope, &request.id, pref)
    }
}

/// Create a new custom chat command
///
/// The command ID must not conflict with any builtin command.
pub async fn create_chat_command(
    project_path: Option<String>,
    request: CreateChatCommandRequest,
) -> Result<(), String> {
    // Validate command ID format (lowercase, alphanumeric, hyphens, underscores)
    if !is_valid_command_id(&request.id) {
        return Err(format!(
            "Invalid command ID '{}'. Use lowercase letters, numbers, hyphens, and underscores only.",
            request.id
        ));
    }

    let project = project_path.as_ref().map(|p| Path::new(p));

    let command = ChatCommandConfig {
        id: request.id,
        label: request.label,
        description: request.description,
        template: request.template,
        enabled: true,
        favorite: false,
        scope: request.scope,
    };

    chat_command_ops::create_custom_command(project, request.scope, command)
}

/// Delete a custom chat command
///
/// Cannot delete builtin commands.
pub async fn delete_chat_command(
    project_path: Option<String>,
    request: DeleteChatCommandRequest,
) -> Result<(), String> {
    // Check if this is a builtin command
    let builtins = chat_command_ops::get_builtin_commands();
    if builtins.iter().any(|b| b.id == request.id) {
        return Err(format!(
            "Cannot delete builtin command '{}'. You can disable it instead.",
            request.id
        ));
    }

    let project = project_path.as_ref().map(|p| Path::new(p));
    chat_command_ops::delete_custom_command(project, request.scope, &request.id)
}

/// Reset a builtin command to its default state
///
/// Removes any preference overrides for the specified builtin command.
pub async fn reset_chat_command(
    project_path: Option<String>,
    request: ResetChatCommandRequest,
) -> Result<(), String> {
    let project = project_path.as_ref().map(|p| Path::new(p));
    chat_command_ops::reset_builtin_command(project, &request.id, request.scope)
}

/// Check if a command ID has been modified from its builtin default
pub async fn is_chat_command_modified(
    project_path: Option<String>,
    command_id: String,
) -> Result<bool, String> {
    let project = project_path.as_ref().map(|p| Path::new(p));
    Ok(chat_command_ops::is_command_modified(project, &command_id))
}

/// Validate command ID format
fn is_valid_command_id(id: &str) -> bool {
    if id.is_empty() || id.len() > 50 {
        return false;
    }

    id.chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' || c == '_')
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_list_chat_commands() {
        let result = list_chat_commands(None).await.unwrap();
        assert!(!result.commands.is_empty());

        // Should contain builtin commands
        assert!(result.commands.iter().any(|c| c.id == "ideas"));
        assert!(result.commands.iter().any(|c| c.id == "research"));
    }

    #[tokio::test]
    async fn test_list_chat_commands_with_project() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let result = list_chat_commands(Some(temp_dir.path().to_string_lossy().to_string()))
            .await
            .unwrap();

        assert!(!result.commands.is_empty());
    }

    #[tokio::test]
    async fn test_create_chat_command() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let request = CreateChatCommandRequest {
            id: "my-test-cmd".to_string(),
            label: "My Test".to_string(),
            description: "Test command".to_string(),
            template: "Hello world".to_string(),
            scope: ChatCommandScope::Project,
        };

        create_chat_command(Some(temp_dir.path().to_string_lossy().to_string()), request)
            .await
            .unwrap();

        // Verify it was created
        let result = list_chat_commands(Some(temp_dir.path().to_string_lossy().to_string()))
            .await
            .unwrap();

        let cmd = result.commands.iter().find(|c| c.id == "my-test-cmd");
        assert!(cmd.is_some());
        assert_eq!(cmd.unwrap().label, "My Test");
    }

    #[tokio::test]
    async fn test_create_chat_command_invalid_id() {
        let request = CreateChatCommandRequest {
            id: "Invalid ID!".to_string(),
            label: "Test".to_string(),
            description: "Test".to_string(),
            template: "Test".to_string(),
            scope: ChatCommandScope::Global,
        };

        let result = create_chat_command(None, request).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid command ID"));
    }

    #[tokio::test]
    async fn test_update_builtin_command() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        // Disable the "ideas" command
        let request = UpdateChatCommandRequest {
            id: "ideas".to_string(),
            enabled: Some(false),
            favorite: Some(true),
            template: None,
            label: None,
            description: None,
            save_scope: Some(ChatCommandScope::Project),
        };

        update_chat_command(Some(temp_dir.path().to_string_lossy().to_string()), request)
            .await
            .unwrap();

        // Verify the update
        let result = list_chat_commands(Some(temp_dir.path().to_string_lossy().to_string()))
            .await
            .unwrap();

        let cmd = result.commands.iter().find(|c| c.id == "ideas").unwrap();
        assert!(!cmd.enabled);
        assert!(cmd.favorite);
    }

    #[tokio::test]
    async fn test_delete_builtin_command_fails() {
        let request = DeleteChatCommandRequest {
            id: "ideas".to_string(),
            scope: ChatCommandScope::Global,
        };

        let result = delete_chat_command(None, request).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Cannot delete builtin"));
    }

    #[tokio::test]
    async fn test_delete_custom_command() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        // Create a custom command first
        let create_request = CreateChatCommandRequest {
            id: "to-delete".to_string(),
            label: "Delete Me".to_string(),
            description: "Will be deleted".to_string(),
            template: "Template".to_string(),
            scope: ChatCommandScope::Project,
        };

        create_chat_command(Some(project_path.clone()), create_request)
            .await
            .unwrap();

        // Delete it
        let delete_request = DeleteChatCommandRequest {
            id: "to-delete".to_string(),
            scope: ChatCommandScope::Project,
        };

        delete_chat_command(Some(project_path.clone()), delete_request)
            .await
            .unwrap();

        // Verify it's gone
        let result = list_chat_commands(Some(project_path)).await.unwrap();
        assert!(!result.commands.iter().any(|c| c.id == "to-delete"));
    }

    #[tokio::test]
    async fn test_reset_chat_command() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        // Modify a builtin command
        let update_request = UpdateChatCommandRequest {
            id: "ideas".to_string(),
            enabled: Some(false),
            favorite: None,
            template: Some("Custom template".to_string()),
            label: None,
            description: None,
            save_scope: Some(ChatCommandScope::Project),
        };

        update_chat_command(Some(project_path.clone()), update_request)
            .await
            .unwrap();

        // Verify it's modified
        let is_modified = is_chat_command_modified(Some(project_path.clone()), "ideas".to_string())
            .await
            .unwrap();
        assert!(is_modified);

        // Reset it
        let reset_request = ResetChatCommandRequest {
            id: "ideas".to_string(),
            scope: Some(ChatCommandScope::Project),
        };

        reset_chat_command(Some(project_path.clone()), reset_request)
            .await
            .unwrap();

        // Verify it's back to default
        let result = list_chat_commands(Some(project_path.clone()))
            .await
            .unwrap();
        let cmd = result.commands.iter().find(|c| c.id == "ideas").unwrap();
        assert!(cmd.enabled); // Back to default
    }

    #[test]
    fn test_is_valid_command_id() {
        assert!(is_valid_command_id("my-command"));
        assert!(is_valid_command_id("my_command"));
        assert!(is_valid_command_id("cmd123"));
        assert!(is_valid_command_id("a"));

        assert!(!is_valid_command_id("")); // Empty
        assert!(!is_valid_command_id("My-Command")); // Uppercase
        assert!(!is_valid_command_id("my command")); // Space
        assert!(!is_valid_command_id("cmd!@#")); // Special chars
    }
}
