//! Chat session file storage
//!
//! Stores chat sessions with embedded messages in `.ralph-ui/chat/{id}.json`

use super::index::{update_index_entry, ChatIndexEntry};
use super::{atomic_write, ensure_dir, get_ralph_ui_dir, read_json, FileResult};
use crate::models::{ChatMessage, ChatSession, MessageRole};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Version of the chat file format
const CHAT_FILE_VERSION: u32 = 1;

/// Chat file structure with embedded messages
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatFile {
    /// File format version
    pub version: u32,
    /// Chat session ID
    pub id: String,
    /// Chat title (optional)
    pub title: Option<String>,
    /// Associated PRD ID (optional)
    pub prd_id: Option<String>,
    /// Agent type used
    pub agent_type: String,
    /// Project path (optional)
    pub project_path: Option<String>,
    /// PRD type (optional)
    pub prd_type: Option<String>,
    /// Whether guided mode is enabled
    pub guided_mode: bool,
    /// Quality score (optional)
    pub quality_score: Option<i32>,
    /// Template ID (optional)
    pub template_id: Option<String>,
    /// Structured mode enabled
    pub structured_mode: bool,
    /// Extracted structure JSON (optional)
    pub extracted_structure: Option<String>,
    /// Whether GSD (Get Stuff Done) workflow mode is enabled
    #[serde(default)]
    pub gsd_mode: bool,
    /// GSD workflow state (JSON-serialized GsdWorkflowState)
    #[serde(default)]
    pub gsd_state: Option<String>,
    /// When the chat was created
    pub created_at: DateTime<Utc>,
    /// When the chat was last updated
    pub updated_at: DateTime<Utc>,
    /// Messages in this chat session
    pub messages: Vec<ChatMessageEntry>,
}

/// Message entry in chat file
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageEntry {
    pub id: String,
    pub role: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
}

impl From<&ChatMessage> for ChatMessageEntry {
    fn from(msg: &ChatMessage) -> Self {
        Self {
            id: msg.id.clone(),
            role: msg.role.as_str().to_string(),
            content: msg.content.clone(),
            created_at: DateTime::parse_from_rfc3339(&msg.created_at)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now()),
        }
    }
}

impl From<&ChatMessageEntry> for ChatMessage {
    fn from(entry: &ChatMessageEntry) -> Self {
        Self {
            id: entry.id.clone(),
            session_id: String::new(), // Will be set by caller
            role: entry.role.parse().unwrap_or(MessageRole::User),
            content: entry.content.clone(),
            created_at: entry.created_at.to_rfc3339(),
        }
    }
}

impl From<&ChatSession> for ChatFile {
    fn from(session: &ChatSession) -> Self {
        let created_at = DateTime::parse_from_rfc3339(&session.created_at)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());
        let updated_at = DateTime::parse_from_rfc3339(&session.updated_at)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());

        Self {
            version: CHAT_FILE_VERSION,
            id: session.id.clone(),
            title: session.title.clone(),
            prd_id: session.prd_id.clone(),
            agent_type: session.agent_type.clone(),
            project_path: session.project_path.clone(),
            prd_type: session.prd_type.clone(),
            guided_mode: session.guided_mode,
            quality_score: session.quality_score,
            template_id: session.template_id.clone(),
            structured_mode: session.structured_mode,
            extracted_structure: session.extracted_structure.clone(),
            gsd_mode: session.gsd_mode,
            gsd_state: session.gsd_state.clone(),
            created_at,
            updated_at,
            messages: Vec::new(),
        }
    }
}

impl ChatFile {
    /// Convert to ChatSession model
    pub fn to_session(&self) -> ChatSession {
        ChatSession {
            id: self.id.clone(),
            agent_type: self.agent_type.clone(),
            project_path: self.project_path.clone(),
            prd_id: self.prd_id.clone(),
            title: self.title.clone(),
            prd_type: self.prd_type.clone(),
            guided_mode: self.guided_mode,
            quality_score: self.quality_score,
            template_id: self.template_id.clone(),
            structured_mode: self.structured_mode,
            extracted_structure: self.extracted_structure.clone(),
            gsd_mode: self.gsd_mode,
            gsd_state: self.gsd_state.clone(),
            created_at: self.created_at.to_rfc3339(),
            updated_at: self.updated_at.to_rfc3339(),
            message_count: Some(self.messages.len() as i32),
        }
    }

    /// Get messages with session_id populated
    pub fn get_messages(&self) -> Vec<ChatMessage> {
        self.messages
            .iter()
            .map(|entry| {
                let mut msg = ChatMessage::from(entry);
                msg.session_id = self.id.clone();
                msg
            })
            .collect()
    }

    /// Create index entry from this chat file
    pub fn to_index_entry(&self) -> ChatIndexEntry {
        ChatIndexEntry {
            id: self.id.clone(),
            title: self.title.clone(),
            prd_id: self.prd_id.clone(),
            updated_at: self.updated_at,
            message_count: self.messages.len() as u32,
        }
    }
}

/// Get the chat directory path for a project
pub fn get_chat_dir(project_path: &Path) -> PathBuf {
    get_ralph_ui_dir(project_path).join("chat")
}

/// Get the file path for a chat session
pub fn get_chat_file_path(project_path: &Path, chat_id: &str) -> PathBuf {
    get_chat_dir(project_path).join(format!("{}.json", chat_id))
}

/// Save a chat session with messages to file
pub fn save_chat_file(project_path: &Path, chat_file: &ChatFile) -> FileResult<PathBuf> {
    let chat_dir = get_chat_dir(project_path);
    ensure_dir(&chat_dir)?;

    let file_path = get_chat_file_path(project_path, &chat_file.id);

    let content = serde_json::to_string_pretty(chat_file)
        .map_err(|e| format!("Failed to serialize chat file: {}", e))?;

    atomic_write(&file_path, &content)?;

    // Update the index
    let index_entry = chat_file.to_index_entry();
    update_index_entry::<ChatIndexEntry, _>(project_path, "chat", &chat_file.id, |_| {
        Some(index_entry)
    })?;

    log::debug!("Saved chat {} to {:?}", chat_file.id, file_path);
    Ok(file_path)
}

/// Read a chat session from file
pub fn read_chat_file(project_path: &Path, chat_id: &str) -> FileResult<ChatFile> {
    let file_path = get_chat_file_path(project_path, chat_id);
    read_json(&file_path)
}

/// Check if a chat file exists
pub fn chat_file_exists(project_path: &Path, chat_id: &str) -> bool {
    get_chat_file_path(project_path, chat_id).exists()
}

/// Delete a chat file
pub fn delete_chat_file(project_path: &Path, chat_id: &str) -> FileResult<()> {
    let file_path = get_chat_file_path(project_path, chat_id);

    if file_path.exists() {
        fs::remove_file(&file_path)
            .map_err(|e| format!("Failed to delete chat file: {}", e))?;
        log::info!("Deleted chat file: {:?}", file_path);
    }

    // Update the index
    super::index::remove_index_entry::<ChatIndexEntry>(project_path, "chat", chat_id)?;

    Ok(())
}

/// List all chat sessions from files
pub fn list_chat_files(project_path: &Path) -> FileResult<Vec<ChatFile>> {
    let chat_dir = get_chat_dir(project_path);

    if !chat_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&chat_dir)
        .map_err(|e| format!("Failed to read chat directory: {}", e))?;

    let mut chats = Vec::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        // Skip non-JSON files and index.json
        if path.extension().map_or(true, |ext| ext != "json") {
            continue;
        }
        if path.file_name().map_or(false, |name| name == "index.json") {
            continue;
        }

        match read_json::<ChatFile>(&path) {
            Ok(chat) => chats.push(chat),
            Err(e) => {
                log::warn!("Failed to read chat file {:?}: {}", path, e);
            }
        }
    }

    // Sort by updated_at descending
    chats.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));

    Ok(chats)
}

/// Add a message to a chat session file
pub fn add_message_to_chat(
    project_path: &Path,
    chat_id: &str,
    message: &ChatMessage,
) -> FileResult<()> {
    let mut chat_file = read_chat_file(project_path, chat_id)?;

    chat_file.messages.push(ChatMessageEntry::from(message));
    chat_file.updated_at = Utc::now();

    save_chat_file(project_path, &chat_file)?;

    Ok(())
}

/// Clear all messages from a chat session file
pub fn clear_chat_messages(project_path: &Path, chat_id: &str) -> FileResult<()> {
    let mut chat_file = read_chat_file(project_path, chat_id)?;

    chat_file.messages.clear();
    chat_file.updated_at = Utc::now();

    save_chat_file(project_path, &chat_file)?;

    Ok(())
}

/// Import a chat session from database format to file
pub fn import_chat_session(
    project_path: &Path,
    session: &ChatSession,
    messages: &[ChatMessage],
) -> FileResult<PathBuf> {
    let mut chat_file = ChatFile::from(session);
    chat_file.messages = messages.iter().map(ChatMessageEntry::from).collect();

    save_chat_file(project_path, &chat_file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_chat_file(id: &str) -> ChatFile {
        ChatFile {
            version: CHAT_FILE_VERSION,
            id: id.to_string(),
            title: Some("Test Chat".to_string()),
            prd_id: None,
            agent_type: "prd_writer".to_string(),
            project_path: None,
            prd_type: None,
            guided_mode: true,
            quality_score: None,
            template_id: None,
            structured_mode: false,
            extracted_structure: None,
            gsd_mode: false,
            gsd_state: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            messages: vec![
                ChatMessageEntry {
                    id: "msg-1".to_string(),
                    role: "user".to_string(),
                    content: "Hello".to_string(),
                    created_at: Utc::now(),
                },
                ChatMessageEntry {
                    id: "msg-2".to_string(),
                    role: "assistant".to_string(),
                    content: "Hi there!".to_string(),
                    created_at: Utc::now(),
                },
            ],
        }
    }

    #[test]
    fn test_save_and_read_chat_file() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let chat = create_test_chat_file("chat-123");
        let file_path = save_chat_file(temp_dir.path(), &chat).unwrap();

        assert!(file_path.exists());

        let read_chat = read_chat_file(temp_dir.path(), "chat-123").unwrap();
        assert_eq!(read_chat.id, "chat-123");
        assert_eq!(read_chat.messages.len(), 2);
    }

    #[test]
    fn test_chat_file_exists() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        assert!(!chat_file_exists(temp_dir.path(), "chat-123"));

        let chat = create_test_chat_file("chat-123");
        save_chat_file(temp_dir.path(), &chat).unwrap();

        assert!(chat_file_exists(temp_dir.path(), "chat-123"));
    }

    #[test]
    fn test_delete_chat_file() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let chat = create_test_chat_file("chat-123");
        save_chat_file(temp_dir.path(), &chat).unwrap();

        assert!(chat_file_exists(temp_dir.path(), "chat-123"));

        delete_chat_file(temp_dir.path(), "chat-123").unwrap();

        assert!(!chat_file_exists(temp_dir.path(), "chat-123"));
    }

    #[test]
    fn test_list_chat_files() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        // Create multiple chat files
        for i in 1..=3 {
            let mut chat = create_test_chat_file(&format!("chat-{}", i));
            chat.updated_at = Utc::now()
                - chrono::Duration::try_hours(3 - i as i64).unwrap_or_default();
            save_chat_file(temp_dir.path(), &chat).unwrap();
        }

        let chats = list_chat_files(temp_dir.path()).unwrap();
        assert_eq!(chats.len(), 3);
        // Should be sorted by updated_at descending
        assert_eq!(chats[0].id, "chat-3");
    }

    #[test]
    fn test_add_message_to_chat() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let chat = create_test_chat_file("chat-123");
        save_chat_file(temp_dir.path(), &chat).unwrap();

        let message = ChatMessage {
            id: "msg-3".to_string(),
            session_id: "chat-123".to_string(),
            role: MessageRole::User,
            content: "New message".to_string(),
            created_at: Utc::now().to_rfc3339(),
        };

        add_message_to_chat(temp_dir.path(), "chat-123", &message).unwrap();

        let read_chat = read_chat_file(temp_dir.path(), "chat-123").unwrap();
        assert_eq!(read_chat.messages.len(), 3);
        assert_eq!(read_chat.messages[2].content, "New message");
    }

    #[test]
    fn test_clear_chat_messages() {
        let temp_dir = TempDir::new().unwrap();
        super::super::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let chat = create_test_chat_file("chat-123");
        save_chat_file(temp_dir.path(), &chat).unwrap();

        clear_chat_messages(temp_dir.path(), "chat-123").unwrap();

        let read_chat = read_chat_file(temp_dir.path(), "chat-123").unwrap();
        assert!(read_chat.messages.is_empty());
    }

    #[test]
    fn test_to_session_conversion() {
        let chat = create_test_chat_file("chat-123");
        let session = chat.to_session();

        assert_eq!(session.id, "chat-123");
        assert_eq!(session.title, Some("Test Chat".to_string()));
        assert_eq!(session.message_count, Some(2));
    }

    #[test]
    fn test_get_messages() {
        let chat = create_test_chat_file("chat-123");
        let messages = chat.get_messages();

        assert_eq!(messages.len(), 2);
        assert_eq!(messages[0].session_id, "chat-123");
        assert_eq!(messages[0].content, "Hello");
    }
}
