//! Context-related commands
//!
//! Commands for managing project context files that provide AI agents
//! with consistent understanding of project vision, tech stack, conventions, and workflow.

use crate::file_storage::context_ops;
use crate::models::context::{ContextConfig, ContextFile, ContextMode, ProjectContext};
use crate::utils::as_path;

/// Get the full project context state
pub async fn get_project_context(project_path: String) -> Result<ProjectContext, String> {
    context_ops::get_project_context(as_path(&project_path))
}

/// Get context configuration
pub async fn get_context_config(project_path: String) -> Result<ContextConfig, String> {
    context_ops::read_context_config(as_path(&project_path))
}

/// Save context configuration
pub async fn save_context_config(
    project_path: String,
    config: ContextConfig,
) -> Result<(), String> {
    context_ops::save_context_config(as_path(&project_path), &config)
}

/// Get a specific context file
pub async fn get_context_file(project_path: String, name: String) -> Result<ContextFile, String> {
    context_ops::read_context_file(as_path(&project_path), &name)
}

/// Get all context files
pub async fn get_context_files(project_path: String) -> Result<Vec<ContextFile>, String> {
    context_ops::read_all_context_files(as_path(&project_path))
}

/// Save a context file
pub async fn save_context_file(
    project_path: String,
    name: String,
    content: String,
    mode: Option<String>,
) -> Result<ContextFile, String> {
    let context_mode = mode
        .map(|m| m.parse::<ContextMode>())
        .transpose()?
        .unwrap_or(ContextMode::Single);

    context_ops::save_context_content(as_path(&project_path), &name, &content, context_mode)
}

/// Delete a context file
pub async fn delete_context_file(project_path: String, name: String) -> Result<(), String> {
    context_ops::delete_context_file(as_path(&project_path), &name)
}

/// Delete all context files
pub async fn delete_all_context_files(project_path: String) -> Result<(), String> {
    context_ops::delete_all_context_files(as_path(&project_path))
}

/// Dismiss the context setup prompt
pub async fn dismiss_context_setup(project_path: String) -> Result<(), String> {
    context_ops::dismiss_context_setup(as_path(&project_path))
}

/// Clear the context setup dismissal (show prompt again)
pub async fn clear_context_setup_dismissal(project_path: String) -> Result<(), String> {
    context_ops::clear_context_setup_dismissal(as_path(&project_path))
}

/// Get the default context template
pub async fn get_default_context_template() -> Result<String, String> {
    Ok(context_ops::get_default_context_template().to_string())
}

/// Check if context files exist for a project
pub async fn has_context_files(project_path: String) -> Result<bool, String> {
    let context = context_ops::get_project_context(as_path(&project_path))?;
    Ok(context.is_configured())
}

/// Get context content formatted for prompt injection
pub async fn get_context_for_injection(
    project_path: String,
    for_prd_chat: bool,
) -> Result<Option<String>, String> {
    Ok(context_ops::get_context_for_injection(
        as_path(&project_path),
        for_prd_chat,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_get_project_context_empty() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let context = get_project_context(temp_dir.path().to_string_lossy().to_string())
            .await
            .unwrap();

        assert!(!context.is_configured());
        assert!(context.config.enabled);
    }

    #[tokio::test]
    async fn test_save_and_get_context_file() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let project_path = temp_dir.path().to_string_lossy().to_string();
        let content = "# My Project\n\nThis is a test.";

        let saved = save_context_file(
            project_path.clone(),
            "context".to_string(),
            content.to_string(),
            None,
        )
        .await
        .unwrap();

        assert_eq!(saved.name, "context");
        assert_eq!(saved.content, content);

        let retrieved = get_context_file(project_path, "context".to_string())
            .await
            .unwrap();

        assert_eq!(retrieved.name, "context");
        assert_eq!(retrieved.content, content);
    }

    #[tokio::test]
    async fn test_context_config_persistence() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let project_path = temp_dir.path().to_string_lossy().to_string();

        let mut config = ContextConfig::default();
        config.enabled = false;
        config.include_in_prd_chat = false;

        save_context_config(project_path.clone(), config)
            .await
            .unwrap();

        let loaded = get_context_config(project_path).await.unwrap();
        assert!(!loaded.enabled);
        assert!(!loaded.include_in_prd_chat);
    }

    #[tokio::test]
    async fn test_has_context_files() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let project_path = temp_dir.path().to_string_lossy().to_string();

        assert!(!has_context_files(project_path.clone()).await.unwrap());

        save_context_file(
            project_path.clone(),
            "context".to_string(),
            "# Test".to_string(),
            None,
        )
        .await
        .unwrap();

        assert!(has_context_files(project_path).await.unwrap());
    }

    #[tokio::test]
    async fn test_get_default_template() {
        let template = get_default_context_template().await.unwrap();
        assert!(template.contains("# Project Context"));
        assert!(template.contains("## Product"));
        assert!(template.contains("## Tech Stack"));
    }

    #[tokio::test]
    async fn test_dismiss_context_setup() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let project_path = temp_dir.path().to_string_lossy().to_string();

        let context = get_project_context(project_path.clone()).await.unwrap();
        assert!(!context.setup_dismissed);

        dismiss_context_setup(project_path.clone()).await.unwrap();

        let context = get_project_context(project_path.clone()).await.unwrap();
        assert!(context.setup_dismissed);

        clear_context_setup_dismissal(project_path.clone())
            .await
            .unwrap();

        let context = get_project_context(project_path).await.unwrap();
        assert!(!context.setup_dismissed);
    }
}
