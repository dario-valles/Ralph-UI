//! Chat command storage operations
//!
//! Provides file-based storage for custom chat commands and preferences.
//! Commands are stored in:
//! - Project: `{project}/.ralph-ui/chat-commands.json`
//! - Global: `~/.ralph-ui/chat-commands.json`

use super::{get_global_ralph_ui_dir, get_ralph_ui_dir, read_json, write_json};
use crate::models::{ChatCommandConfig, ChatCommandPreference, ChatCommandScope, ChatCommandsFile};
use std::path::Path;

/// Get the path to the project chat commands file
fn get_project_commands_path(project_path: &Path) -> std::path::PathBuf {
    get_ralph_ui_dir(project_path).join("chat-commands.json")
}

/// Get the path to the global chat commands file
fn get_global_commands_path() -> std::path::PathBuf {
    get_global_ralph_ui_dir().join("chat-commands.json")
}

/// Load chat commands file from a specific path
fn load_commands_file(path: &Path) -> ChatCommandsFile {
    if path.exists() {
        read_json(path).unwrap_or_default()
    } else {
        ChatCommandsFile::default()
    }
}

/// Save chat commands file to a specific path
fn save_commands_file(path: &Path, file: &ChatCommandsFile) -> Result<(), String> {
    // Don't save empty files
    if file.is_empty() {
        // If file exists and we're saving empty, delete it
        if path.exists() {
            std::fs::remove_file(path)
                .map_err(|e| format!("Failed to remove empty commands file: {}", e))?;
        }
        return Ok(());
    }
    write_json(path, file)
}

/// Load project-specific chat commands
pub fn load_project_commands(project_path: &Path) -> ChatCommandsFile {
    load_commands_file(&get_project_commands_path(project_path))
}

/// Load global chat commands
pub fn load_global_commands() -> ChatCommandsFile {
    load_commands_file(&get_global_commands_path())
}

/// Save project-specific chat commands
pub fn save_project_commands(project_path: &Path, file: &ChatCommandsFile) -> Result<(), String> {
    save_commands_file(&get_project_commands_path(project_path), file)
}

/// Save global chat commands
pub fn save_global_commands(file: &ChatCommandsFile) -> Result<(), String> {
    save_commands_file(&get_global_commands_path(), file)
}

/// Get builtin commands (hardcoded defaults)
pub fn get_builtin_commands() -> Vec<ChatCommandConfig> {
    vec![
        ChatCommandConfig::builtin(
            "ideas",
            "Ideas",
            "Analyze codebase and suggest improvements",
            r#"Please analyze the codebase and suggest improvements in the following categories:

## Quick Wins (< 1 hour)
- TODOs, dead code, missing docs

## Refactoring Opportunities (1-8 hours)
- Code duplication, complexity, better abstractions

## Architecture Improvements (> 1 day)
- Patterns, performance, scalability

## Feature Ideas
- Natural extensions based on existing code patterns

Focus on actionable, specific suggestions with file paths where relevant."#,
        ),
        ChatCommandConfig::builtin(
            "research",
            "Research",
            "Research and analyze requirements",
            r#"Please research and analyze the requirements we've discussed. Consider:

## Architecture
- System design and component structure
- Integration points and data flow

## Best Practices
- Industry patterns for similar features
- Security and performance considerations

## Risks & Challenges
- Technical complexity
- Potential blockers
- Edge cases to consider

Provide a comprehensive analysis to inform the implementation plan."#,
        ),
        ChatCommandConfig::builtin(
            "agents",
            "AGENTS.md",
            "Generate AGENTS.md for AI coding agents",
            r#"Please generate an AGENTS.md file for this project. Include:

## Setup
- Build commands
- Test commands
- Lint commands

## Code Conventions
- Framework patterns (e.g., React, Vue)
- State management approach
- Component organization

## Architecture
- Frontend/Backend structure
- Key directories and their purposes

## Testing
- Test framework
- Test organization
- Coverage requirements

Format as a valid AGENTS.md that AI coding agents can use for context."#,
        ),
        ChatCommandConfig::builtin(
            "criteria",
            "Criteria",
            "Generate BDD acceptance criteria",
            r#"Please generate BDD-style acceptance criteria for the feature we're discussing. Use Given/When/Then format:

```gherkin
Feature: [Feature Name]

Scenario: Happy path
  Given [precondition]
  When [action]
  Then [expected result]

Scenario: Error handling
  Given [precondition]
  When [error condition]
  Then [error handling]
```

Include scenarios for:
- Happy path
- Error handling
- Edge cases
- Validation rules"#,
        ),
        ChatCommandConfig::builtin(
            "spec",
            "Spec",
            "Analyze current vs desired state",
            r#"Please analyze the current state vs desired state for this feature:

## Current State
- What exists today
- Current user flow
- Existing code patterns

## Desired State
- What should exist after implementation
- New user flow
- Required code changes

## Gap Analysis
- What needs to change
- New components/modules needed
- Data model changes
- API changes

This will help clarify the implementation scope."#,
        ),
        ChatCommandConfig::builtin(
            "critique",
            "Critique",
            "Ask for a critique of the current PRD",
            "Please critique the current requirements for clarity, completeness, and feasibility.",
        ),
        ChatCommandConfig::builtin(
            "epic",
            "Epic",
            "Insert an Epic template",
            "### Epic: [Title]\n**Description:** [Description]\n",
        ),
        ChatCommandConfig::builtin(
            "story",
            "User Story",
            "Insert a User Story template",
            "#### US-X.X: [Title]\n**As a** [user],\n**I want** [action],\n**So that** [benefit].\n\n**Acceptance Criteria:**\n- [Criterion 1]\n",
        ),
        ChatCommandConfig::builtin(
            "story-dep",
            "Story with Dependencies",
            "Insert a User Story template with dependency syntax",
            r#"#### US-X.X: [Title]
**Depends on:** [US-1.1, US-1.2]
**As a** [user],
**I want** [action],
**So that** [benefit].

**Acceptance Criteria:**
- [Criterion 1]
- [Criterion 2]

**Effort:** [S/M/L/XL]
"#,
        ),
        ChatCommandConfig::builtin(
            "task",
            "Task",
            "Insert a Task template",
            "- [ ] Task: [Title]\n",
        ),
    ]
}

/// Merge commands from all sources: builtin, global, project
/// Resolution order: Project overrides > Global overrides > Builtin defaults
pub fn merge_commands(project_path: Option<&Path>) -> Vec<ChatCommandConfig> {
    let builtins = get_builtin_commands();
    let global_file = load_global_commands();
    let project_file = project_path.map(load_project_commands).unwrap_or_default();

    let mut result: Vec<ChatCommandConfig> = Vec::new();

    // First, process builtin commands with any overrides
    for mut builtin in builtins {
        // Apply global preferences first
        if let Some(pref) = global_file.builtin_preferences.get(&builtin.id) {
            apply_preference(&mut builtin, pref);
        }

        // Apply project preferences (higher priority)
        if let Some(pref) = project_file.builtin_preferences.get(&builtin.id) {
            apply_preference(&mut builtin, pref);
        }

        result.push(builtin);
    }

    // Add global custom commands
    for mut cmd in global_file.custom_commands {
        cmd.scope = ChatCommandScope::Global;
        result.push(cmd);
    }

    // Add project custom commands (may override global with same ID)
    for mut cmd in project_file.custom_commands {
        cmd.scope = ChatCommandScope::Project;
        // Remove any global command with the same ID
        result.retain(|c| c.id != cmd.id || c.scope == ChatCommandScope::Builtin);
        result.push(cmd);
    }

    result
}

/// Apply a preference to a command config
fn apply_preference(cmd: &mut ChatCommandConfig, pref: &ChatCommandPreference) {
    if let Some(enabled) = pref.enabled {
        cmd.enabled = enabled;
    }
    if let Some(favorite) = pref.favorite {
        cmd.favorite = favorite;
    }
    if let Some(ref template) = pref.template {
        cmd.template = template.clone();
    }
    if let Some(ref label) = pref.label {
        cmd.label = label.clone();
    }
    if let Some(ref description) = pref.description {
        cmd.description = description.clone();
    }
}

/// Update a builtin command preference
pub fn update_builtin_preference(
    project_path: Option<&Path>,
    save_scope: ChatCommandScope,
    command_id: &str,
    update: ChatCommandPreference,
) -> Result<(), String> {
    match save_scope {
        ChatCommandScope::Project => {
            let project_path = project_path.ok_or("Project path required for project scope")?;
            let mut file = load_project_commands(project_path);

            // Merge with existing preference
            let pref = file
                .builtin_preferences
                .entry(command_id.to_string())
                .or_default();
            merge_preference(pref, &update);

            save_project_commands(project_path, &file)
        }
        ChatCommandScope::Global => {
            let mut file = load_global_commands();

            let pref = file
                .builtin_preferences
                .entry(command_id.to_string())
                .or_default();
            merge_preference(pref, &update);

            save_global_commands(&file)
        }
        ChatCommandScope::Builtin => Err("Cannot save to builtin scope".to_string()),
    }
}

/// Merge an update into an existing preference
fn merge_preference(existing: &mut ChatCommandPreference, update: &ChatCommandPreference) {
    if update.enabled.is_some() {
        existing.enabled = update.enabled;
    }
    if update.favorite.is_some() {
        existing.favorite = update.favorite;
    }
    if update.template.is_some() {
        existing.template = update.template.clone();
    }
    if update.label.is_some() {
        existing.label = update.label.clone();
    }
    if update.description.is_some() {
        existing.description = update.description.clone();
    }
}

/// Create a new custom command
pub fn create_custom_command(
    project_path: Option<&Path>,
    scope: ChatCommandScope,
    command: ChatCommandConfig,
) -> Result<(), String> {
    // Check if ID conflicts with builtin
    let builtins = get_builtin_commands();
    if builtins.iter().any(|b| b.id == command.id) {
        return Err(format!(
            "Command ID '{}' conflicts with a builtin command",
            command.id
        ));
    }

    match scope {
        ChatCommandScope::Project => {
            let project_path = project_path.ok_or("Project path required for project scope")?;
            let mut file = load_project_commands(project_path);

            // Check for duplicate in project
            if file.custom_commands.iter().any(|c| c.id == command.id) {
                return Err(format!(
                    "Command '{}' already exists in project",
                    command.id
                ));
            }

            file.custom_commands.push(command);
            save_project_commands(project_path, &file)
        }
        ChatCommandScope::Global => {
            let mut file = load_global_commands();

            // Check for duplicate in global
            if file.custom_commands.iter().any(|c| c.id == command.id) {
                return Err(format!("Command '{}' already exists globally", command.id));
            }

            file.custom_commands.push(command);
            save_global_commands(&file)
        }
        ChatCommandScope::Builtin => Err("Cannot create builtin commands".to_string()),
    }
}

/// Update a custom command
pub fn update_custom_command(
    project_path: Option<&Path>,
    scope: ChatCommandScope,
    command_id: &str,
    update: ChatCommandPreference,
) -> Result<(), String> {
    match scope {
        ChatCommandScope::Project => {
            let project_path = project_path.ok_or("Project path required for project scope")?;
            let mut file = load_project_commands(project_path);

            let cmd = file
                .custom_commands
                .iter_mut()
                .find(|c| c.id == command_id)
                .ok_or_else(|| format!("Command '{}' not found in project", command_id))?;

            if let Some(enabled) = update.enabled {
                cmd.enabled = enabled;
            }
            if let Some(favorite) = update.favorite {
                cmd.favorite = favorite;
            }
            if let Some(template) = update.template {
                cmd.template = template;
            }
            if let Some(label) = update.label {
                cmd.label = label;
            }
            if let Some(description) = update.description {
                cmd.description = description;
            }

            save_project_commands(project_path, &file)
        }
        ChatCommandScope::Global => {
            let mut file = load_global_commands();

            let cmd = file
                .custom_commands
                .iter_mut()
                .find(|c| c.id == command_id)
                .ok_or_else(|| format!("Command '{}' not found globally", command_id))?;

            if let Some(enabled) = update.enabled {
                cmd.enabled = enabled;
            }
            if let Some(favorite) = update.favorite {
                cmd.favorite = favorite;
            }
            if let Some(template) = update.template {
                cmd.template = template;
            }
            if let Some(label) = update.label {
                cmd.label = label;
            }
            if let Some(description) = update.description {
                cmd.description = description;
            }

            save_global_commands(&file)
        }
        ChatCommandScope::Builtin => Err("Cannot update builtin commands directly".to_string()),
    }
}

/// Delete a custom command
pub fn delete_custom_command(
    project_path: Option<&Path>,
    scope: ChatCommandScope,
    command_id: &str,
) -> Result<(), String> {
    match scope {
        ChatCommandScope::Project => {
            let project_path = project_path.ok_or("Project path required for project scope")?;
            let mut file = load_project_commands(project_path);

            let initial_len = file.custom_commands.len();
            file.custom_commands.retain(|c| c.id != command_id);

            if file.custom_commands.len() == initial_len {
                return Err(format!("Command '{}' not found in project", command_id));
            }

            save_project_commands(project_path, &file)
        }
        ChatCommandScope::Global => {
            let mut file = load_global_commands();

            let initial_len = file.custom_commands.len();
            file.custom_commands.retain(|c| c.id != command_id);

            if file.custom_commands.len() == initial_len {
                return Err(format!("Command '{}' not found globally", command_id));
            }

            save_global_commands(&file)
        }
        ChatCommandScope::Builtin => Err("Cannot delete builtin commands".to_string()),
    }
}

/// Reset a builtin command to its default state
pub fn reset_builtin_command(
    project_path: Option<&Path>,
    command_id: &str,
    scope: Option<ChatCommandScope>,
) -> Result<(), String> {
    // Verify it's a builtin command
    let builtins = get_builtin_commands();
    if !builtins.iter().any(|b| b.id == command_id) {
        return Err(format!("'{}' is not a builtin command", command_id));
    }

    match scope {
        Some(ChatCommandScope::Project) => {
            let project_path = project_path.ok_or("Project path required for project scope")?;
            let mut file = load_project_commands(project_path);
            file.builtin_preferences.remove(command_id);
            save_project_commands(project_path, &file)
        }
        Some(ChatCommandScope::Global) => {
            let mut file = load_global_commands();
            file.builtin_preferences.remove(command_id);
            save_global_commands(&file)
        }
        None => {
            // Reset from both scopes
            if let Some(project_path) = project_path {
                let mut file = load_project_commands(project_path);
                file.builtin_preferences.remove(command_id);
                save_project_commands(project_path, &file)?;
            }

            let mut file = load_global_commands();
            file.builtin_preferences.remove(command_id);
            save_global_commands(&file)
        }
        Some(ChatCommandScope::Builtin) => Err("Cannot reset from builtin scope".to_string()),
    }
}

/// Check if a command has been modified from its builtin default
pub fn is_command_modified(project_path: Option<&Path>, command_id: &str) -> bool {
    let global_file = load_global_commands();
    let project_file = project_path.map(load_project_commands).unwrap_or_default();

    global_file.builtin_preferences.contains_key(command_id)
        || project_file.builtin_preferences.contains_key(command_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_get_builtin_commands() {
        let builtins = get_builtin_commands();
        assert!(!builtins.is_empty());
        assert!(builtins.iter().any(|c| c.id == "ideas"));
        assert!(builtins.iter().any(|c| c.id == "research"));
        assert!(builtins.iter().any(|c| c.id == "epic"));
    }

    #[test]
    fn test_merge_commands_no_overrides() {
        let commands = merge_commands(None);
        let builtins = get_builtin_commands();

        assert_eq!(commands.len(), builtins.len());
        for cmd in &commands {
            assert!(cmd.enabled);
            assert!(!cmd.favorite);
            assert_eq!(cmd.scope, ChatCommandScope::Builtin);
        }
    }

    #[test]
    fn test_create_custom_command() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();

        // Initialize .ralph-ui directory
        super::super::init_ralph_ui_dir(project_path).unwrap();

        let cmd = ChatCommandConfig::new(
            "my-cmd".to_string(),
            "My Command".to_string(),
            "Does something".to_string(),
            "Hello world".to_string(),
        );

        create_custom_command(Some(project_path), ChatCommandScope::Project, cmd).unwrap();

        let commands = merge_commands(Some(project_path));
        let my_cmd = commands.iter().find(|c| c.id == "my-cmd");
        assert!(my_cmd.is_some());
        assert_eq!(my_cmd.unwrap().scope, ChatCommandScope::Project);
    }

    #[test]
    fn test_create_command_conflicts_with_builtin() {
        let cmd = ChatCommandConfig::new(
            "ideas".to_string(), // Conflicts with builtin
            "Ideas".to_string(),
            "Custom ideas".to_string(),
            "Custom template".to_string(),
        );

        let result = create_custom_command(None, ChatCommandScope::Global, cmd);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("conflicts with a builtin"));
    }

    #[test]
    fn test_update_builtin_preference() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();

        // Initialize .ralph-ui directory
        super::super::init_ralph_ui_dir(project_path).unwrap();

        // Disable the "ideas" command
        update_builtin_preference(
            Some(project_path),
            ChatCommandScope::Project,
            "ideas",
            ChatCommandPreference {
                enabled: Some(false),
                favorite: Some(true),
                ..Default::default()
            },
        )
        .unwrap();

        let commands = merge_commands(Some(project_path));
        let ideas_cmd = commands.iter().find(|c| c.id == "ideas").unwrap();

        assert!(!ideas_cmd.enabled);
        assert!(ideas_cmd.favorite);
    }

    #[test]
    fn test_delete_custom_command() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();

        // Initialize .ralph-ui directory
        super::super::init_ralph_ui_dir(project_path).unwrap();

        // Create a command
        let cmd = ChatCommandConfig::new(
            "to-delete".to_string(),
            "Delete Me".to_string(),
            "Will be deleted".to_string(),
            "Template".to_string(),
        );

        create_custom_command(Some(project_path), ChatCommandScope::Project, cmd).unwrap();

        // Verify it exists
        let commands = merge_commands(Some(project_path));
        assert!(commands.iter().any(|c| c.id == "to-delete"));

        // Delete it
        delete_custom_command(Some(project_path), ChatCommandScope::Project, "to-delete").unwrap();

        // Verify it's gone
        let commands = merge_commands(Some(project_path));
        assert!(!commands.iter().any(|c| c.id == "to-delete"));
    }

    #[test]
    fn test_reset_builtin_command() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();

        // Initialize .ralph-ui directory
        super::super::init_ralph_ui_dir(project_path).unwrap();

        // Modify the "ideas" command
        update_builtin_preference(
            Some(project_path),
            ChatCommandScope::Project,
            "ideas",
            ChatCommandPreference {
                enabled: Some(false),
                template: Some("Custom template".to_string()),
                ..Default::default()
            },
        )
        .unwrap();

        // Verify it's modified
        assert!(is_command_modified(Some(project_path), "ideas"));

        // Reset it
        reset_builtin_command(Some(project_path), "ideas", Some(ChatCommandScope::Project))
            .unwrap();

        // Verify it's back to default
        let commands = merge_commands(Some(project_path));
        let ideas_cmd = commands.iter().find(|c| c.id == "ideas").unwrap();
        assert!(ideas_cmd.enabled);
        assert!(!is_command_modified(Some(project_path), "ideas"));
    }
}
