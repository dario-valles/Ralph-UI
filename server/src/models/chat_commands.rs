//! Chat command configuration models
//!
//! These models support customizable slash commands in the PRD Chat interface,
//! allowing users to edit, create, disable, and organize commands.

use serde::{Deserialize, Serialize};

/// Scope of a chat command configuration
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ChatCommandScope {
    /// Built-in command (read-only template, but can override enabled/favorite)
    Builtin,
    /// Project-specific command (stored in .ralph-ui/chat-commands.json)
    Project,
    /// Global user command (stored in ~/.ralph-ui/chat-commands.json)
    Global,
}

impl Default for ChatCommandScope {
    fn default() -> Self {
        ChatCommandScope::Builtin
    }
}

impl std::fmt::Display for ChatCommandScope {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ChatCommandScope::Builtin => write!(f, "builtin"),
            ChatCommandScope::Project => write!(f, "project"),
            ChatCommandScope::Global => write!(f, "global"),
        }
    }
}

/// Configuration for a single chat command
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatCommandConfig {
    /// Unique command identifier (e.g., "ideas", "research", "my-custom")
    pub id: String,

    /// Display label for the command (e.g., "Ideas", "Research")
    pub label: String,

    /// Brief description of what the command does
    pub description: String,

    /// Template text to insert when command is selected
    pub template: String,

    /// Whether the command is enabled (shown in menu)
    #[serde(default = "default_true")]
    pub enabled: bool,

    /// Whether the command is marked as favorite
    #[serde(default)]
    pub favorite: bool,

    /// Scope of the command (where it came from)
    #[serde(default)]
    pub scope: ChatCommandScope,
}

fn default_true() -> bool {
    true
}

impl ChatCommandConfig {
    /// Create a new custom command
    pub fn new(id: String, label: String, description: String, template: String) -> Self {
        Self {
            id,
            label,
            description,
            template,
            enabled: true,
            favorite: false,
            scope: ChatCommandScope::Global,
        }
    }

    /// Create a builtin command definition
    pub fn builtin(id: &str, label: &str, description: &str, template: &str) -> Self {
        Self {
            id: id.to_string(),
            label: label.to_string(),
            description: description.to_string(),
            template: template.to_string(),
            enabled: true,
            favorite: false,
            scope: ChatCommandScope::Builtin,
        }
    }
}

/// User preferences for a command (stored in project/global config)
/// This is a subset of ChatCommandConfig for overriding builtin commands
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatCommandPreference {
    /// Whether the command is enabled (shown in menu)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub enabled: Option<bool>,

    /// Whether the command is marked as favorite
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favorite: Option<bool>,

    /// Custom template override (for builtin commands)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template: Option<String>,

    /// Custom label override
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,

    /// Custom description override
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

/// File format for storing chat command configurations
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatCommandsFile {
    /// Custom commands created by the user
    #[serde(default)]
    pub custom_commands: Vec<ChatCommandConfig>,

    /// Preferences for builtin commands (keyed by command ID)
    #[serde(default)]
    pub builtin_preferences: std::collections::HashMap<String, ChatCommandPreference>,
}

impl ChatCommandsFile {
    /// Check if there are any custom commands or preferences
    pub fn is_empty(&self) -> bool {
        self.custom_commands.is_empty() && self.builtin_preferences.is_empty()
    }
}

/// Response type for list_chat_commands
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatCommandsResponse {
    /// All available commands (merged from builtin + project + global)
    pub commands: Vec<ChatCommandConfig>,
}

/// Request type for update_chat_command
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateChatCommandRequest {
    /// Command ID to update
    pub id: String,

    /// New enabled state
    #[serde(default)]
    pub enabled: Option<bool>,

    /// New favorite state
    #[serde(default)]
    pub favorite: Option<bool>,

    /// New template (for custom commands or overriding builtins)
    #[serde(default)]
    pub template: Option<String>,

    /// New label
    #[serde(default)]
    pub label: Option<String>,

    /// New description
    #[serde(default)]
    pub description: Option<String>,

    /// Scope to save to (project or global)
    #[serde(default)]
    pub save_scope: Option<ChatCommandScope>,
}

/// Request type for create_chat_command
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateChatCommandRequest {
    /// Unique command ID (must not conflict with builtins)
    pub id: String,

    /// Display label
    pub label: String,

    /// Brief description
    pub description: String,

    /// Template text
    pub template: String,

    /// Scope to save to (project or global)
    #[serde(default = "default_global_scope")]
    pub scope: ChatCommandScope,
}

fn default_global_scope() -> ChatCommandScope {
    ChatCommandScope::Global
}

/// Request type for delete_chat_command
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteChatCommandRequest {
    /// Command ID to delete
    pub id: String,

    /// Scope to delete from (project or global)
    pub scope: ChatCommandScope,
}

/// Request type for reset_chat_command
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResetChatCommandRequest {
    /// Command ID to reset
    pub id: String,

    /// Scope to reset from (project or global, or both if not specified)
    #[serde(default)]
    pub scope: Option<ChatCommandScope>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_command_config_new() {
        let cmd = ChatCommandConfig::new(
            "my-cmd".to_string(),
            "My Command".to_string(),
            "Does something".to_string(),
            "Hello {{ name }}".to_string(),
        );

        assert_eq!(cmd.id, "my-cmd");
        assert_eq!(cmd.label, "My Command");
        assert!(cmd.enabled);
        assert!(!cmd.favorite);
        assert_eq!(cmd.scope, ChatCommandScope::Global);
    }

    #[test]
    fn test_chat_command_config_builtin() {
        let cmd = ChatCommandConfig::builtin("ideas", "Ideas", "Generate ideas", "Analyze...");

        assert_eq!(cmd.id, "ideas");
        assert_eq!(cmd.scope, ChatCommandScope::Builtin);
        assert!(cmd.enabled);
    }

    #[test]
    fn test_chat_commands_file_is_empty() {
        let file = ChatCommandsFile::default();
        assert!(file.is_empty());

        let mut file_with_cmd = ChatCommandsFile::default();
        file_with_cmd.custom_commands.push(ChatCommandConfig::new(
            "test".to_string(),
            "Test".to_string(),
            "Test".to_string(),
            "Test".to_string(),
        ));
        assert!(!file_with_cmd.is_empty());
    }

    #[test]
    fn test_serialization_roundtrip() {
        let cmd = ChatCommandConfig::builtin("ideas", "Ideas", "Generate ideas", "Analyze...");
        let json = serde_json::to_string(&cmd).unwrap();
        let parsed: ChatCommandConfig = serde_json::from_str(&json).unwrap();

        assert_eq!(cmd.id, parsed.id);
        assert_eq!(cmd.label, parsed.label);
        assert_eq!(cmd.scope, parsed.scope);
    }

    #[test]
    fn test_preference_serialization() {
        let pref = ChatCommandPreference {
            enabled: Some(false),
            favorite: Some(true),
            template: None,
            label: None,
            description: None,
        };

        let json = serde_json::to_string(&pref).unwrap();
        // Should not include None fields
        assert!(!json.contains("template"));
        assert!(json.contains("enabled"));
        assert!(json.contains("favorite"));
    }
}
