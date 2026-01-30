//! Context file storage operations
//!
//! Provides storage for project context files in `{project}/.ralph-ui/context/`
//! Context files provide AI agents with consistent understanding of project
//! product vision, tech stack, conventions, and workflow preferences.

use super::{atomic_write, ensure_dir, get_ralph_ui_dir, read_json, write_json, FileResult};
use crate::models::context::{
    estimate_tokens, ContextChatMessage, ContextChatSession, ContextConfig, ContextFile,
    ContextMode, ProjectContext, DEFAULT_CONTEXT_TEMPLATE, MAX_CONTEXT_FILE_SIZE,
};
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};

// ============================================================================
// Path Helpers
// ============================================================================

/// Get the context directory for a project
pub fn get_context_dir(project_path: &Path) -> PathBuf {
    get_ralph_ui_dir(project_path).join("context")
}

/// Get the context config file path
pub fn get_context_config_path(project_path: &Path) -> PathBuf {
    get_ralph_ui_dir(project_path).join("context-config.json")
}

/// Get the context chat directory
pub fn get_context_chat_dir(project_path: &Path) -> PathBuf {
    get_ralph_ui_dir(project_path).join("context-chat")
}

/// Get path for a specific context file
pub fn get_context_file_path(project_path: &Path, name: &str) -> PathBuf {
    get_context_dir(project_path).join(format!("{}.md", name))
}

/// Get path for a context chat session file
pub fn get_context_chat_file_path(project_path: &Path, session_id: &str) -> PathBuf {
    get_context_chat_dir(project_path).join(format!("{}.json", session_id))
}

// ============================================================================
// Context Config Operations
// ============================================================================

/// Read context configuration, returning default if not exists
pub fn read_context_config(project_path: &Path) -> FileResult<ContextConfig> {
    let config_path = get_context_config_path(project_path);
    if config_path.exists() {
        read_json(&config_path)
    } else {
        Ok(ContextConfig::default())
    }
}

/// Save context configuration
pub fn save_context_config(project_path: &Path, config: &ContextConfig) -> FileResult<()> {
    let config_path = get_context_config_path(project_path);
    write_json(&config_path, config)
}

// ============================================================================
// Context File Operations
// ============================================================================

/// Check if context directory exists
pub fn context_dir_exists(project_path: &Path) -> bool {
    get_context_dir(project_path).exists()
}

/// Check if a specific context file exists
pub fn context_file_exists(project_path: &Path, name: &str) -> bool {
    get_context_file_path(project_path, name).exists()
}

/// Read a single context file
pub fn read_context_file(project_path: &Path, name: &str) -> FileResult<ContextFile> {
    let file_path = get_context_file_path(project_path, name);
    let content = fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read context file '{}': {}", name, e))?;

    let metadata = fs::metadata(&file_path)
        .map_err(|e| format!("Failed to get metadata for '{}': {}", name, e))?;

    let updated_at = metadata
        .modified()
        .map(|t| chrono::DateTime::<Utc>::from(t))
        .unwrap_or_else(|_| Utc::now());

    Ok(ContextFile {
        name: name.to_string(),
        content: content.clone(),
        updated_at,
        token_count: estimate_tokens(&content),
    })
}

/// Read all context files
pub fn read_all_context_files(project_path: &Path) -> FileResult<Vec<ContextFile>> {
    let context_dir = get_context_dir(project_path);
    if !context_dir.exists() {
        return Ok(vec![]);
    }

    let mut files = Vec::new();
    let entries =
        fs::read_dir(&context_dir).map_err(|e| format!("Failed to read context dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "md") {
            if let Some(name) = path.file_stem().and_then(|s| s.to_str()) {
                match read_context_file(project_path, name) {
                    Ok(file) => files.push(file),
                    Err(e) => log::warn!("Failed to read context file '{}': {}", name, e),
                }
            }
        }
    }

    // Sort by name for consistent ordering
    files.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(files)
}

/// Save a context file
pub fn save_context_file(project_path: &Path, name: &str, content: &str) -> FileResult<()> {
    // Validate file size
    if content.len() > MAX_CONTEXT_FILE_SIZE {
        return Err(format!(
            "Context file '{}' exceeds maximum size of {} bytes (got {} bytes)",
            name,
            MAX_CONTEXT_FILE_SIZE,
            content.len()
        ));
    }

    let context_dir = get_context_dir(project_path);
    ensure_dir(&context_dir)?;

    let file_path = get_context_file_path(project_path, name);
    atomic_write(&file_path, content)
}

/// Delete a context file
pub fn delete_context_file(project_path: &Path, name: &str) -> FileResult<()> {
    let file_path = get_context_file_path(project_path, name);
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete context file '{}': {}", name, e))?;
    }
    Ok(())
}

/// Delete all context files
pub fn delete_all_context_files(project_path: &Path) -> FileResult<()> {
    let context_dir = get_context_dir(project_path);
    if context_dir.exists() {
        fs::remove_dir_all(&context_dir)
            .map_err(|e| format!("Failed to delete context directory: {}", e))?;
    }
    Ok(())
}

// ============================================================================
// ProjectContext Operations (Combined)
// ============================================================================

/// Get the full project context state
pub fn get_project_context(project_path: &Path) -> FileResult<ProjectContext> {
    let config = read_context_config(project_path)?;
    let files = read_all_context_files(project_path)?;

    // Check if setup was dismissed
    let setup_dismissed_path = get_ralph_ui_dir(project_path).join("context-dismissed");
    let setup_dismissed = setup_dismissed_path.exists();

    Ok(ProjectContext {
        config,
        files,
        setup_dismissed,
    })
}

/// Save project context (config and files)
pub fn save_project_context(project_path: &Path, context: &ProjectContext) -> FileResult<()> {
    // Save config
    save_context_config(project_path, &context.config)?;

    // Save files
    for file in &context.files {
        save_context_file(project_path, &file.name, &file.content)?;
    }

    Ok(())
}

/// Save a single context file and update config
pub fn save_context_content(
    project_path: &Path,
    name: &str,
    content: &str,
    mode: ContextMode,
) -> FileResult<ContextFile> {
    // Save the file
    save_context_file(project_path, name, content)?;

    // Update config with last_updated and mode
    let mut config = read_context_config(project_path)?;
    config.mode = mode;
    config.last_updated = Some(Utc::now());
    save_context_config(project_path, &config)?;

    // Return the saved file
    read_context_file(project_path, name)
}

/// Dismiss the context setup prompt
pub fn dismiss_context_setup(project_path: &Path) -> FileResult<()> {
    let dismissed_path = get_ralph_ui_dir(project_path).join("context-dismissed");
    ensure_dir(&get_ralph_ui_dir(project_path))?;
    fs::write(&dismissed_path, "").map_err(|e| format!("Failed to dismiss setup: {}", e))
}

/// Clear the context setup dismissal
pub fn clear_context_setup_dismissal(project_path: &Path) -> FileResult<()> {
    let dismissed_path = get_ralph_ui_dir(project_path).join("context-dismissed");
    if dismissed_path.exists() {
        fs::remove_file(&dismissed_path)
            .map_err(|e| format!("Failed to clear dismissal: {}", e))?;
    }
    Ok(())
}

/// Get the default context template
pub fn get_default_context_template() -> &'static str {
    DEFAULT_CONTEXT_TEMPLATE
}

// ============================================================================
// Context Chat Session Operations
// ============================================================================

/// File format for context chat sessions
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextChatFile {
    pub version: u32,
    pub session: ContextChatSession,
    pub messages: Vec<ContextChatMessage>,
}

impl ContextChatFile {
    pub fn new(session: ContextChatSession) -> Self {
        Self {
            version: 1,
            session,
            messages: vec![],
        }
    }
}

/// Create a new context chat session
pub fn create_context_chat_session(
    project_path: &Path,
    session: &ContextChatSession,
) -> FileResult<()> {
    let chat_dir = get_context_chat_dir(project_path);
    ensure_dir(&chat_dir)?;

    let file = ContextChatFile::new(session.clone());
    let file_path = get_context_chat_file_path(project_path, &session.id);
    write_json(&file_path, &file)
}

/// Get a context chat session by ID
pub fn get_context_chat_session(
    project_path: &Path,
    session_id: &str,
) -> FileResult<ContextChatSession> {
    let file_path = get_context_chat_file_path(project_path, session_id);
    let file: ContextChatFile = read_json(&file_path)?;
    Ok(file.session)
}

/// Get a context chat session if it exists
pub fn get_context_chat_session_opt(
    project_path: &Path,
    session_id: &str,
) -> FileResult<Option<ContextChatSession>> {
    let file_path = get_context_chat_file_path(project_path, session_id);
    if file_path.exists() {
        let file: ContextChatFile = read_json(&file_path)?;
        Ok(Some(file.session))
    } else {
        Ok(None)
    }
}

/// List all context chat sessions
pub fn list_context_chat_sessions(project_path: &Path) -> FileResult<Vec<ContextChatSession>> {
    let chat_dir = get_context_chat_dir(project_path);
    if !chat_dir.exists() {
        return Ok(vec![]);
    }

    let mut sessions = Vec::new();
    let entries =
        fs::read_dir(&chat_dir).map_err(|e| format!("Failed to read context chat dir: {}", e))?;

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "json") {
            match read_json::<ContextChatFile>(&path) {
                Ok(file) => sessions.push(file.session),
                Err(e) => log::warn!("Failed to read context chat file {:?}: {}", path, e),
            }
        }
    }

    // Sort by created_at descending (newest first)
    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(sessions)
}

/// Add a message to a context chat session
pub fn add_context_chat_message(
    project_path: &Path,
    session_id: &str,
    message: &ContextChatMessage,
) -> FileResult<()> {
    let file_path = get_context_chat_file_path(project_path, session_id);
    let mut file: ContextChatFile = read_json(&file_path)?;

    file.messages.push(message.clone());
    file.session.message_count = file.messages.len() as i32;
    file.session.updated_at = Utc::now();

    write_json(&file_path, &file)
}

/// Get all messages for a context chat session
pub fn get_context_chat_messages(
    project_path: &Path,
    session_id: &str,
) -> FileResult<Vec<ContextChatMessage>> {
    let file_path = get_context_chat_file_path(project_path, session_id);
    let file: ContextChatFile = read_json(&file_path)?;
    Ok(file.messages)
}

/// Update context chat session with extracted context
pub fn update_context_chat_extracted(
    project_path: &Path,
    session_id: &str,
    extracted_context: Option<String>,
) -> FileResult<()> {
    let file_path = get_context_chat_file_path(project_path, session_id);
    let mut file: ContextChatFile = read_json(&file_path)?;

    file.session.extracted_context = extracted_context;
    file.session.updated_at = Utc::now();

    write_json(&file_path, &file)
}

/// Mark context as saved for a context chat session
pub fn mark_context_chat_saved(project_path: &Path, session_id: &str) -> FileResult<()> {
    let file_path = get_context_chat_file_path(project_path, session_id);
    let mut file: ContextChatFile = read_json(&file_path)?;

    file.session.context_saved = true;
    file.session.updated_at = Utc::now();

    write_json(&file_path, &file)
}

/// Update external session ID for CLI agent session resumption
pub fn update_context_chat_external_id(
    project_path: &Path,
    session_id: &str,
    external_id: Option<String>,
) -> FileResult<()> {
    let file_path = get_context_chat_file_path(project_path, session_id);
    let mut file: ContextChatFile = read_json(&file_path)?;

    file.session.external_session_id = external_id;

    write_json(&file_path, &file)
}

/// Delete a context chat session
pub fn delete_context_chat_session(project_path: &Path, session_id: &str) -> FileResult<()> {
    let file_path = get_context_chat_file_path(project_path, session_id);
    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete context chat session: {}", e))?;
    }
    Ok(())
}

// ============================================================================
// Context Injection Helper
// ============================================================================

/// Get context content formatted for prompt injection
/// Returns None if context is disabled or empty
pub fn get_context_for_injection(project_path: &Path, for_prd_chat: bool) -> Option<String> {
    let context = get_project_context(project_path).ok()?;

    // Check if injection is enabled for this use case
    if !context.config.enabled {
        return None;
    }
    if for_prd_chat && !context.config.include_in_prd_chat {
        return None;
    }
    if !for_prd_chat && !context.config.include_in_ralph_loop {
        return None;
    }

    let content = context.get_combined_content();
    if content.is_empty() {
        return None;
    }

    // Format with delimiters
    Some(format!(
        "=== PROJECT CONTEXT ===\n{}\n=== END CONTEXT ===",
        content
    ))
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::context::ProjectAnalysis;
    use crate::models::prd_chat::MessageRole;
    use tempfile::TempDir;

    #[test]
    fn test_context_dir_paths() {
        let project = Path::new("/home/user/my-project");
        assert_eq!(
            get_context_dir(project),
            PathBuf::from("/home/user/my-project/.ralph-ui/context")
        );
        assert_eq!(
            get_context_file_path(project, "product"),
            PathBuf::from("/home/user/my-project/.ralph-ui/context/product.md")
        );
    }

    #[test]
    fn test_save_and_read_context_file() {
        let temp_dir = TempDir::new().unwrap();
        let content = "# Product\n\nThis is the product description.";

        save_context_file(temp_dir.path(), "product", content).unwrap();
        let file = read_context_file(temp_dir.path(), "product").unwrap();

        assert_eq!(file.name, "product");
        assert_eq!(file.content, content);
        assert!(file.token_count > 0);
    }

    #[test]
    fn test_context_file_size_limit() {
        let temp_dir = TempDir::new().unwrap();
        let content = "x".repeat(MAX_CONTEXT_FILE_SIZE + 1);

        let result = save_context_file(temp_dir.path(), "test", &content);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("exceeds maximum size"));
    }

    #[test]
    fn test_read_all_context_files() {
        let temp_dir = TempDir::new().unwrap();

        save_context_file(temp_dir.path(), "product", "Product content").unwrap();
        save_context_file(temp_dir.path(), "tech-stack", "Tech stack content").unwrap();

        let files = read_all_context_files(temp_dir.path()).unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files[0].name, "product");
        assert_eq!(files[1].name, "tech-stack");
    }

    #[test]
    fn test_delete_context_file() {
        let temp_dir = TempDir::new().unwrap();

        save_context_file(temp_dir.path(), "test", "content").unwrap();
        assert!(context_file_exists(temp_dir.path(), "test"));

        delete_context_file(temp_dir.path(), "test").unwrap();
        assert!(!context_file_exists(temp_dir.path(), "test"));
    }

    #[test]
    fn test_context_config_persistence() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let mut config = ContextConfig::default();
        config.enabled = false;
        config.mode = ContextMode::Multi;

        save_context_config(temp_dir.path(), &config).unwrap();
        let loaded = read_context_config(temp_dir.path()).unwrap();

        assert!(!loaded.enabled);
        assert_eq!(loaded.mode, ContextMode::Multi);
    }

    #[test]
    fn test_project_context_full_workflow() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        // Initially empty
        let context = get_project_context(temp_dir.path()).unwrap();
        assert!(!context.is_configured());
        assert!(!context.setup_dismissed);

        // Save a context file
        save_context_content(
            temp_dir.path(),
            "context",
            "# Project\n\nDescription here",
            ContextMode::Single,
        )
        .unwrap();

        // Now configured
        let context = get_project_context(temp_dir.path()).unwrap();
        assert!(context.is_configured());
        assert_eq!(context.files.len(), 1);
        assert_eq!(context.config.mode, ContextMode::Single);
    }

    #[test]
    fn test_dismiss_context_setup() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let context = get_project_context(temp_dir.path()).unwrap();
        assert!(!context.setup_dismissed);

        dismiss_context_setup(temp_dir.path()).unwrap();

        let context = get_project_context(temp_dir.path()).unwrap();
        assert!(context.setup_dismissed);

        clear_context_setup_dismissal(temp_dir.path()).unwrap();

        let context = get_project_context(temp_dir.path()).unwrap();
        assert!(!context.setup_dismissed);
    }

    #[test]
    fn test_context_for_injection() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        // No context - should return None
        let injection = get_context_for_injection(temp_dir.path(), true);
        assert!(injection.is_none());

        // Add context
        save_context_content(
            temp_dir.path(),
            "context",
            "# My Project",
            ContextMode::Single,
        )
        .unwrap();

        // Should return formatted content
        let injection = get_context_for_injection(temp_dir.path(), true);
        assert!(injection.is_some());
        let content = injection.unwrap();
        assert!(content.contains("=== PROJECT CONTEXT ==="));
        assert!(content.contains("# My Project"));
        assert!(content.contains("=== END CONTEXT ==="));
    }

    #[test]
    fn test_context_chat_session_crud() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = ContextChatSession {
            id: "ctx-chat-123".to_string(),
            project_path: temp_dir.path().to_string_lossy().to_string(),
            agent_type: "claude".to_string(),
            analysis: ProjectAnalysis::default(),
            extracted_context: None,
            context_saved: false,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            message_count: 0,
            external_session_id: None,
        };

        // Create
        create_context_chat_session(temp_dir.path(), &session).unwrap();

        // Get
        let retrieved = get_context_chat_session(temp_dir.path(), "ctx-chat-123").unwrap();
        assert_eq!(retrieved.id, "ctx-chat-123");
        assert_eq!(retrieved.agent_type, "claude");

        // List
        let sessions = list_context_chat_sessions(temp_dir.path()).unwrap();
        assert_eq!(sessions.len(), 1);

        // Add message
        let message = ContextChatMessage {
            id: "msg-1".to_string(),
            session_id: "ctx-chat-123".to_string(),
            role: MessageRole::User,
            content: "Tell me about this project".to_string(),
            created_at: Utc::now(),
        };
        add_context_chat_message(temp_dir.path(), "ctx-chat-123", &message).unwrap();

        let messages = get_context_chat_messages(temp_dir.path(), "ctx-chat-123").unwrap();
        assert_eq!(messages.len(), 1);

        // Update extracted context
        update_context_chat_extracted(
            temp_dir.path(),
            "ctx-chat-123",
            Some("# Extracted".to_string()),
        )
        .unwrap();
        let retrieved = get_context_chat_session(temp_dir.path(), "ctx-chat-123").unwrap();
        assert_eq!(retrieved.extracted_context, Some("# Extracted".to_string()));

        // Mark saved
        mark_context_chat_saved(temp_dir.path(), "ctx-chat-123").unwrap();
        let retrieved = get_context_chat_session(temp_dir.path(), "ctx-chat-123").unwrap();
        assert!(retrieved.context_saved);

        // Delete
        delete_context_chat_session(temp_dir.path(), "ctx-chat-123").unwrap();
        let result = get_context_chat_session_opt(temp_dir.path(), "ctx-chat-123").unwrap();
        assert!(result.is_none());
    }
}
