//! Chat operations wrapper for file storage
//!
//! Provides the same interface as database operations but using file storage.
//! Chat sessions are stored in `{project}/.ralph-ui/chat/{id}.json`

use super::chat::{
    add_message_to_chat, chat_file_exists, clear_chat_messages, delete_chat_file, list_chat_files,
    read_chat_file, save_chat_file, ChatFile,
};
use crate::models::{ChatMessage, ChatSession};
use chrono::Utc;
use std::path::Path;

/// Create a new chat session
pub fn create_chat_session(project_path: &Path, session: &ChatSession) -> Result<(), String> {
    let chat_file = ChatFile::from(session);
    save_chat_file(project_path, &chat_file)?;
    Ok(())
}

/// Get a chat session by ID
pub fn get_chat_session(project_path: &Path, session_id: &str) -> Result<ChatSession, String> {
    let chat_file = read_chat_file(project_path, session_id)?;
    Ok(chat_file.to_session())
}

/// Get a chat session if it exists
pub fn get_chat_session_opt(
    project_path: &Path,
    session_id: &str,
) -> Result<Option<ChatSession>, String> {
    if !chat_file_exists(project_path, session_id) {
        return Ok(None);
    }
    let chat_file = read_chat_file(project_path, session_id)?;
    Ok(Some(chat_file.to_session()))
}

/// List all chat sessions for a project
pub fn list_chat_sessions(project_path: &Path) -> Result<Vec<ChatSession>, String> {
    let chat_files = list_chat_files(project_path)?;
    Ok(chat_files.into_iter().map(|f| f.to_session()).collect())
}

/// Create a chat message
pub fn create_chat_message(project_path: &Path, message: &ChatMessage) -> Result<(), String> {
    add_message_to_chat(project_path, &message.session_id, message)
}

/// Get all messages for a chat session
pub fn get_messages_by_session(
    project_path: &Path,
    session_id: &str,
) -> Result<Vec<ChatMessage>, String> {
    let chat_file = read_chat_file(project_path, session_id)?;
    Ok(chat_file.get_messages())
}

/// Delete all messages for a chat session
pub fn delete_messages_by_session(project_path: &Path, session_id: &str) -> Result<(), String> {
    if chat_file_exists(project_path, session_id) {
        clear_chat_messages(project_path, session_id)?;
    }
    Ok(())
}

/// Delete a chat session and all its messages
pub fn delete_chat_session(project_path: &Path, session_id: &str) -> Result<(), String> {
    delete_chat_file(project_path, session_id)
}

/// Update chat session timestamp
pub fn update_chat_session_timestamp(
    project_path: &Path,
    session_id: &str,
    timestamp: &str,
) -> Result<(), String> {
    let mut chat_file = read_chat_file(project_path, session_id)?;

    chat_file.updated_at = chrono::DateTime::parse_from_rfc3339(timestamp)
        .map(|dt| dt.with_timezone(&Utc))
        .unwrap_or_else(|_| Utc::now());

    save_chat_file(project_path, &chat_file)?;
    Ok(())
}

/// Update chat session title
pub fn update_chat_session_title(
    project_path: &Path,
    session_id: &str,
    title: &str,
) -> Result<(), String> {
    let mut chat_file = read_chat_file(project_path, session_id)?;

    chat_file.title = Some(title.to_string());
    chat_file.updated_at = Utc::now();

    save_chat_file(project_path, &chat_file)?;
    Ok(())
}

/// Update chat session quality score
pub fn update_chat_session_quality_score(
    project_path: &Path,
    session_id: &str,
    score: i32,
) -> Result<(), String> {
    let mut chat_file = read_chat_file(project_path, session_id)?;

    chat_file.quality_score = Some(score);
    chat_file.updated_at = Utc::now();

    save_chat_file(project_path, &chat_file)?;
    Ok(())
}

/// Update chat session structured mode
pub fn update_chat_session_structured_mode(
    project_path: &Path,
    session_id: &str,
    enabled: bool,
) -> Result<(), String> {
    let mut chat_file = read_chat_file(project_path, session_id)?;

    chat_file.structured_mode = enabled;
    chat_file.updated_at = Utc::now();

    save_chat_file(project_path, &chat_file)?;
    Ok(())
}

/// Update chat session extracted structure
pub fn update_chat_session_extracted_structure(
    project_path: &Path,
    session_id: &str,
    structure: Option<&str>,
) -> Result<(), String> {
    let mut chat_file = read_chat_file(project_path, session_id)?;

    chat_file.extracted_structure = structure.map(|s| s.to_string());
    chat_file.updated_at = Utc::now();

    save_chat_file(project_path, &chat_file)?;
    Ok(())
}

/// Update chat session agent type
pub fn update_chat_session_agent(
    project_path: &Path,
    session_id: &str,
    agent_type: &str,
) -> Result<(), String> {
    let mut chat_file = read_chat_file(project_path, session_id)?;

    chat_file.agent_type = agent_type.to_string();
    chat_file.updated_at = Utc::now();

    save_chat_file(project_path, &chat_file)?;
    Ok(())
}

/// Set pending operation timestamp (called before agent execution)
pub fn set_pending_operation(project_path: &Path, session_id: &str) -> Result<(), String> {
    let mut chat_file = read_chat_file(project_path, session_id)?;

    chat_file.pending_operation_started_at = Some(Utc::now());
    // Don't update updated_at since this is internal state

    save_chat_file(project_path, &chat_file)?;
    Ok(())
}

/// Clear pending operation timestamp (called after agent execution completes or fails)
pub fn clear_pending_operation(project_path: &Path, session_id: &str) -> Result<(), String> {
    let mut chat_file = read_chat_file(project_path, session_id)?;

    chat_file.pending_operation_started_at = None;
    // Don't update updated_at since this is internal state

    save_chat_file(project_path, &chat_file)?;
    Ok(())
}

/// Update external session ID for CLI agent session resumption
/// This enables 67-90% token savings by allowing the CLI agent to maintain its own context
pub fn update_chat_session_external_id(
    project_path: &Path,
    session_id: &str,
    external_id: Option<&str>,
) -> Result<(), String> {
    let mut chat_file = read_chat_file(project_path, session_id)?;

    chat_file.external_session_id = external_id.map(|s| s.to_string());
    // Don't update updated_at since this is internal state for optimization

    save_chat_file(project_path, &chat_file)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::MessageRole;
    use tempfile::TempDir;

    fn create_test_session(id: &str) -> ChatSession {
        ChatSession {
            id: id.to_string(),
            agent_type: "prd_writer".to_string(),
            project_path: None,
            prd_id: None,
            title: Some("Test Chat".to_string()),
            prd_type: None,
            guided_mode: true,
            quality_score: None,
            template_id: None,
            structured_mode: false,
            extracted_structure: None,
            created_at: Utc::now().to_rfc3339(),
            updated_at: Utc::now().to_rfc3339(),
            message_count: Some(0),
            gsd_mode: false,
            gsd_state: None,
            pending_operation_started_at: None,
            external_session_id: None,
        }
    }

    #[test]
    fn test_create_and_get_session() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("chat-123");
        create_chat_session(temp_dir.path(), &session).unwrap();

        let retrieved = get_chat_session(temp_dir.path(), "chat-123").unwrap();
        assert_eq!(retrieved.id, "chat-123");
        assert_eq!(retrieved.title, Some("Test Chat".to_string()));
    }

    #[test]
    fn test_create_and_get_messages() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("chat-123");
        create_chat_session(temp_dir.path(), &session).unwrap();

        let message = ChatMessage {
            id: "msg-1".to_string(),
            session_id: "chat-123".to_string(),
            role: MessageRole::User,
            content: "Hello".to_string(),
            created_at: Utc::now().to_rfc3339(),
            attachments: None,
        };

        create_chat_message(temp_dir.path(), &message).unwrap();

        let messages = get_messages_by_session(temp_dir.path(), "chat-123").unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].content, "Hello");
    }

    #[test]
    fn test_list_sessions() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        create_chat_session(temp_dir.path(), &create_test_session("chat-1")).unwrap();
        create_chat_session(temp_dir.path(), &create_test_session("chat-2")).unwrap();

        let sessions = list_chat_sessions(temp_dir.path()).unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn test_delete_session() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("chat-123");
        create_chat_session(temp_dir.path(), &session).unwrap();

        delete_chat_session(temp_dir.path(), "chat-123").unwrap();

        let result = get_chat_session_opt(temp_dir.path(), "chat-123").unwrap();
        assert!(result.is_none());
    }

    #[test]
    fn test_update_title() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("chat-123");
        create_chat_session(temp_dir.path(), &session).unwrap();

        update_chat_session_title(temp_dir.path(), "chat-123", "New Title").unwrap();

        let retrieved = get_chat_session(temp_dir.path(), "chat-123").unwrap();
        assert_eq!(retrieved.title, Some("New Title".to_string()));
    }

    #[test]
    fn test_update_structured_mode() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("chat-123");
        create_chat_session(temp_dir.path(), &session).unwrap();

        update_chat_session_structured_mode(temp_dir.path(), "chat-123", true).unwrap();

        let retrieved = get_chat_session(temp_dir.path(), "chat-123").unwrap();
        assert!(retrieved.structured_mode);
    }

    #[test]
    fn test_set_and_clear_pending_operation() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("chat-123");
        create_chat_session(temp_dir.path(), &session).unwrap();

        // Initially no pending operation
        let retrieved = get_chat_session(temp_dir.path(), "chat-123").unwrap();
        assert!(retrieved.pending_operation_started_at.is_none());

        // Set pending operation
        set_pending_operation(temp_dir.path(), "chat-123").unwrap();
        let retrieved = get_chat_session(temp_dir.path(), "chat-123").unwrap();
        assert!(retrieved.pending_operation_started_at.is_some());

        // Clear pending operation
        clear_pending_operation(temp_dir.path(), "chat-123").unwrap();
        let retrieved = get_chat_session(temp_dir.path(), "chat-123").unwrap();
        assert!(retrieved.pending_operation_started_at.is_none());
    }
}
