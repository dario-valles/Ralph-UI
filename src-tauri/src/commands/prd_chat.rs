// PRD Chat Tauri commands - AI-assisted PRD creation through conversation

use crate::database::Database;
use crate::models::{AgentType, ChatMessage, ChatSession, MessageRole};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

// ============================================================================
// Request/Response Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartChatSessionRequest {
    pub agent_type: String,
    pub project_path: Option<String>,
    pub prd_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub session_id: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportToPRDRequest {
    pub session_id: String,
    pub title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageResponse {
    pub user_message: ChatMessage,
    pub assistant_message: ChatMessage,
}

// ============================================================================
// Tauri Commands
// ============================================================================

/// Start a new PRD chat session
#[tauri::command]
pub async fn start_prd_chat_session(
    request: StartChatSessionRequest,
    db: State<'_, Mutex<Database>>,
) -> Result<ChatSession, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    // Ensure chat tables exist
    init_chat_tables(db.get_connection())
        .map_err(|e| format!("Failed to initialize chat tables: {}", e))?;

    // Validate agent type
    let _agent_type = parse_agent_type(&request.agent_type)?;

    let now = chrono::Utc::now().to_rfc3339();
    let session_id = Uuid::new_v4().to_string();

    let session = ChatSession {
        id: session_id,
        agent_type: request.agent_type,
        project_path: request.project_path,
        prd_id: request.prd_id,
        title: None, // Will be set when user starts typing or explicitly sets it
        created_at: now.clone(),
        updated_at: now,
        message_count: Some(0),
    };

    create_chat_session(db.get_connection(), &session)
        .map_err(|e| format!("Failed to create chat session: {}", e))?;

    Ok(session)
}

/// Send a message to the chat and get an AI response
#[tauri::command]
pub async fn send_prd_chat_message(
    request: SendMessageRequest,
    db: State<'_, Mutex<Database>>,
) -> Result<SendMessageResponse, String> {
    // First phase: read data and store user message (hold mutex briefly)
    let (session, history, user_message, prompt) = {
        let db_guard = db.lock().map_err(|e| e.to_string())?;

        // Get the session
        let session = get_chat_session_by_id(db_guard.get_connection(), &request.session_id)
            .map_err(|e| format!("Session not found: {}", e))?;

        let now = chrono::Utc::now().to_rfc3339();

        // Store user message
        let user_message = ChatMessage {
            id: Uuid::new_v4().to_string(),
            session_id: request.session_id.clone(),
            role: MessageRole::User,
            content: request.content.clone(),
            created_at: now.clone(),
        };

        create_chat_message(db_guard.get_connection(), &user_message)
            .map_err(|e| format!("Failed to store user message: {}", e))?;

        // Get chat history for context
        let history = get_messages_for_session(db_guard.get_connection(), &request.session_id)
            .map_err(|e| format!("Failed to get chat history: {}", e))?;

        // Build prompt with PRD context
        let prompt = build_prd_chat_prompt(&session, &history, &request.content);

        (session, history, user_message, prompt)
        // db_guard dropped here
    };

    // Parse agent type (no db access needed)
    let agent_type = parse_agent_type(&session.agent_type)?;

    // Execute CLI agent and get response (no mutex held)
    let response_content = execute_chat_agent(agent_type, &prompt, session.project_path.as_deref())
        .await
        .map_err(|e| format!("Agent execution failed: {}", e))?;

    // Second phase: store response (hold mutex briefly)
    let assistant_message = {
        let db_guard = db.lock().map_err(|e| e.to_string())?;

        let response_now = chrono::Utc::now().to_rfc3339();

        // Store assistant message
        let assistant_message = ChatMessage {
            id: Uuid::new_v4().to_string(),
            session_id: request.session_id.clone(),
            role: MessageRole::Assistant,
            content: response_content,
            created_at: response_now.clone(),
        };

        create_chat_message(db_guard.get_connection(), &assistant_message)
            .map_err(|e| format!("Failed to store assistant message: {}", e))?;

        // Update session timestamp
        update_chat_session_timestamp(db_guard.get_connection(), &request.session_id, &response_now)
            .map_err(|e| format!("Failed to update session: {}", e))?;

        assistant_message
        // db_guard dropped here
    };

    // Suppress unused variable warning
    let _ = history;

    Ok(SendMessageResponse {
        user_message,
        assistant_message,
    })
}

/// Get all messages for a chat session
#[tauri::command]
pub async fn get_prd_chat_history(
    session_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<Vec<ChatMessage>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    // Ensure chat tables exist
    init_chat_tables(db.get_connection())
        .map_err(|e| format!("Failed to initialize chat tables: {}", e))?;

    get_messages_for_session(db.get_connection(), &session_id)
        .map_err(|e| format!("Failed to get chat history: {}", e))
}

/// List all chat sessions
#[tauri::command]
pub async fn list_prd_chat_sessions(
    db: State<'_, Mutex<Database>>,
) -> Result<Vec<ChatSession>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    // Ensure chat tables exist
    init_chat_tables(db.get_connection())
        .map_err(|e| format!("Failed to initialize chat tables: {}", e))?;

    list_chat_sessions(db.get_connection())
        .map_err(|e| format!("Failed to list chat sessions: {}", e))
}

/// Delete a chat session and all its messages
#[tauri::command]
pub async fn delete_prd_chat_session(
    session_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    // Delete messages first (foreign key constraint)
    delete_messages_for_session(db.get_connection(), &session_id)
        .map_err(|e| format!("Failed to delete messages: {}", e))?;

    // Delete session
    delete_chat_session(db.get_connection(), &session_id)
        .map_err(|e| format!("Failed to delete session: {}", e))
}

/// Export chat conversation to a new PRD document
#[tauri::command]
pub async fn export_chat_to_prd(
    request: ExportToPRDRequest,
    db: State<'_, Mutex<Database>>,
) -> Result<crate::database::prd::PRDDocument, String> {
    let db_guard = db.lock().map_err(|e| e.to_string())?;

    // Get session
    let session = get_chat_session_by_id(db_guard.get_connection(), &request.session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    // Get all messages
    let messages = get_messages_for_session(db_guard.get_connection(), &request.session_id)
        .map_err(|e| format!("Failed to get messages: {}", e))?;

    // Convert conversation to PRD content
    let content = convert_chat_to_prd_content(&messages);

    let now = chrono::Utc::now().to_rfc3339();
    let prd_id = Uuid::new_v4().to_string();

    let prd = crate::database::prd::PRDDocument {
        id: prd_id,
        title: request.title,
        description: Some("Generated from PRD chat conversation".to_string()),
        template_id: None,
        content,
        quality_score_completeness: None,
        quality_score_clarity: None,
        quality_score_actionability: None,
        quality_score_overall: None,
        created_at: now.clone(),
        updated_at: now,
        version: 1,
        project_path: session.project_path,
    };

    db_guard.create_prd(&prd)
        .map_err(|e| format!("Failed to create PRD: {}", e))?;

    Ok(prd)
}

// ============================================================================
// Helper Functions
// ============================================================================

fn parse_agent_type(agent_type: &str) -> Result<AgentType, String> {
    match agent_type.to_lowercase().as_str() {
        "claude" => Ok(AgentType::Claude),
        "opencode" => Ok(AgentType::Opencode),
        "cursor" => Ok(AgentType::Cursor),
        _ => Err(format!("Unknown agent type: {}", agent_type)),
    }
}

fn build_prd_chat_prompt(
    session: &ChatSession,
    history: &[ChatMessage],
    current_message: &str,
) -> String {
    let mut prompt = String::new();

    // System context for PRD creation
    prompt.push_str("You are an expert product manager helping to create a Product Requirements Document (PRD). ");
    prompt.push_str("Your goal is to help the user articulate their product requirements clearly and comprehensively.\n\n");

    prompt.push_str("Focus on:\n");
    prompt.push_str("- Understanding the problem being solved\n");
    prompt.push_str("- Defining clear user stories and acceptance criteria\n");
    prompt.push_str("- Breaking down features into actionable tasks\n");
    prompt.push_str("- Identifying technical requirements and constraints\n");
    prompt.push_str("- Suggesting success metrics and validation criteria\n\n");

    // Include project context if available
    if let Some(ref project_path) = session.project_path {
        prompt.push_str(&format!("Project path: {}\n\n", project_path));
    }

    // Include conversation history
    if !history.is_empty() {
        prompt.push_str("=== Conversation History ===\n\n");
        for msg in history {
            let role_label = match msg.role {
                MessageRole::User => "User",
                MessageRole::Assistant => "Assistant",
                MessageRole::System => "System",
            };
            prompt.push_str(&format!("{}: {}\n\n", role_label, msg.content));
        }
        prompt.push_str("=== End History ===\n\n");
    }

    // Current user message
    prompt.push_str(&format!("User: {}\n\nAssistant:", current_message));

    prompt
}

async fn execute_chat_agent(
    agent_type: AgentType,
    prompt: &str,
    working_dir: Option<&str>,
) -> Result<String, String> {
    use std::process::Stdio;
    use tokio::process::Command;

    let (program, args) = match agent_type {
        AgentType::Claude => {
            // Use claude CLI in print mode for single response
            ("claude", vec!["-p".to_string(), prompt.to_string()])
        }
        AgentType::Opencode => {
            // Use opencode CLI
            ("opencode", vec!["chat".to_string(), prompt.to_string()])
        }
        AgentType::Cursor => {
            // Use cursor agent CLI
            ("cursor-agent", vec!["--prompt".to_string(), prompt.to_string()])
        }
    };

    let mut cmd = Command::new(program);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(dir) = working_dir {
        cmd.current_dir(dir);
    }

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to execute {}: {}", program, e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Agent returned error: {}", stderr));
    }

    let response = String::from_utf8_lossy(&output.stdout).to_string();

    // Clean up response (remove any trailing whitespace)
    Ok(response.trim().to_string())
}

fn convert_chat_to_prd_content(messages: &[ChatMessage]) -> String {
    // Extract key information from conversation to build PRD structure
    let mut sections = vec![];

    // Overview section from conversation
    let overview = extract_overview_from_messages(messages);
    sections.push(serde_json::json!({
        "id": "overview",
        "title": "Overview",
        "content": overview,
        "required": true
    }));

    // Requirements section
    let requirements = extract_requirements_from_messages(messages);
    sections.push(serde_json::json!({
        "id": "requirements",
        "title": "Requirements",
        "content": requirements,
        "required": true
    }));

    // Tasks section
    let tasks = extract_tasks_from_messages(messages);
    sections.push(serde_json::json!({
        "id": "tasks",
        "title": "Tasks",
        "content": tasks,
        "required": true
    }));

    // Full conversation for reference
    let conversation = messages
        .iter()
        .map(|m| {
            let role_label = match m.role {
                MessageRole::User => "User",
                MessageRole::Assistant => "Assistant",
                MessageRole::System => "System",
            };
            format!("**{}**: {}", role_label, m.content)
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    sections.push(serde_json::json!({
        "id": "conversation",
        "title": "Original Conversation",
        "content": conversation,
        "required": false
    }));

    serde_json::json!({ "sections": sections }).to_string()
}

fn extract_overview_from_messages(messages: &[ChatMessage]) -> String {
    // Get the first few exchanges to establish context
    let early_messages: Vec<_> = messages.iter().take(4).collect();

    if early_messages.is_empty() {
        return String::new();
    }

    // Combine early messages for overview
    early_messages
        .iter()
        .filter(|m| m.role == MessageRole::Assistant)
        .map(|m| m.content.clone())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn extract_requirements_from_messages(messages: &[ChatMessage]) -> String {
    // Look for messages that contain requirement-like content
    let requirement_keywords = ["must", "should", "need", "require", "feature", "functionality"];

    messages
        .iter()
        .filter(|m| {
            let content_lower = m.content.to_lowercase();
            requirement_keywords.iter().any(|kw| content_lower.contains(kw))
        })
        .map(|m| format!("- {}", m.content.lines().next().unwrap_or(&m.content)))
        .collect::<Vec<_>>()
        .join("\n")
}

fn extract_tasks_from_messages(messages: &[ChatMessage]) -> String {
    // Look for task-like content in assistant messages
    let task_indicators = ["implement", "create", "build", "add", "update", "fix", "refactor"];

    messages
        .iter()
        .filter(|m| m.role == MessageRole::Assistant)
        .filter(|m| {
            let content_lower = m.content.to_lowercase();
            task_indicators.iter().any(|ind| content_lower.contains(ind))
        })
        .map(|m| {
            // Extract first line or sentence as task summary
            m.content.lines().next().unwrap_or(&m.content).to_string()
        })
        .take(10) // Limit to 10 tasks
        .enumerate()
        .map(|(i, task)| format!("{}. {}", i + 1, task))
        .collect::<Vec<_>>()
        .join("\n")
}

// ============================================================================
// Database Operations
// ============================================================================

use rusqlite::{params, Connection, Result};

pub fn init_chat_tables(conn: &Connection) -> Result<()> {
    conn.execute(
        "CREATE TABLE IF NOT EXISTS chat_sessions (
            id TEXT PRIMARY KEY,
            agent_type TEXT NOT NULL,
            project_path TEXT,
            prd_id TEXT,
            title TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (prd_id) REFERENCES prd_documents(id)
        )",
        [],
    )?;

    // Add title column if it doesn't exist (migration for existing databases)
    let _ = conn.execute("ALTER TABLE chat_sessions ADD COLUMN title TEXT", []);

    conn.execute(
        "CREATE TABLE IF NOT EXISTS chat_messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            role TEXT NOT NULL,
            content TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)",
        [],
    )?;

    Ok(())
}

fn create_chat_session(conn: &Connection, session: &ChatSession) -> Result<()> {
    conn.execute(
        "INSERT INTO chat_sessions (id, agent_type, project_path, prd_id, title, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            session.id,
            session.agent_type,
            session.project_path,
            session.prd_id,
            session.title,
            session.created_at,
            session.updated_at,
        ],
    )?;
    Ok(())
}

fn get_chat_session_by_id(conn: &Connection, id: &str) -> Result<ChatSession> {
    conn.query_row(
        "SELECT s.id, s.agent_type, s.project_path, s.prd_id, s.title, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id) as message_count
         FROM chat_sessions s WHERE s.id = ?1",
        params![id],
        |row| {
            Ok(ChatSession {
                id: row.get(0)?,
                agent_type: row.get(1)?,
                project_path: row.get(2)?,
                prd_id: row.get(3)?,
                title: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                message_count: row.get(7)?,
            })
        },
    )
}

fn list_chat_sessions(conn: &Connection) -> Result<Vec<ChatSession>> {
    let mut stmt = conn.prepare(
        "SELECT s.id, s.agent_type, s.project_path, s.prd_id, s.title, s.created_at, s.updated_at,
                (SELECT COUNT(*) FROM chat_messages WHERE session_id = s.id) as message_count
         FROM chat_sessions s
         ORDER BY s.updated_at DESC",
    )?;

    let sessions = stmt.query_map([], |row| {
        Ok(ChatSession {
            id: row.get(0)?,
            agent_type: row.get(1)?,
            project_path: row.get(2)?,
            prd_id: row.get(3)?,
            title: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
            message_count: row.get(7)?,
        })
    })?;

    sessions.collect()
}

fn delete_chat_session(conn: &Connection, id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM chat_sessions WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

fn update_chat_session_timestamp(conn: &Connection, id: &str, timestamp: &str) -> Result<()> {
    conn.execute(
        "UPDATE chat_sessions SET updated_at = ?1 WHERE id = ?2",
        params![timestamp, id],
    )?;
    Ok(())
}

fn create_chat_message(conn: &Connection, message: &ChatMessage) -> Result<()> {
    conn.execute(
        "INSERT INTO chat_messages (id, session_id, role, content, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            message.id,
            message.session_id,
            message.role.as_str(),
            message.content,
            message.created_at,
        ],
    )?;
    Ok(())
}

fn get_messages_for_session(conn: &Connection, session_id: &str) -> Result<Vec<ChatMessage>> {
    let mut stmt = conn.prepare(
        "SELECT id, session_id, role, content, created_at
         FROM chat_messages
         WHERE session_id = ?1
         ORDER BY created_at ASC",
    )?;

    let messages = stmt.query_map(params![session_id], |row| {
        let role_str: String = row.get(2)?;
        let role = role_str.parse::<MessageRole>().map_err(|e| {
            rusqlite::Error::FromSqlConversionFailure(
                2,
                rusqlite::types::Type::Text,
                Box::new(std::io::Error::new(std::io::ErrorKind::InvalidData, e)),
            )
        })?;
        Ok(ChatMessage {
            id: row.get(0)?,
            session_id: row.get(1)?,
            role,
            content: row.get(3)?,
            created_at: row.get(4)?,
        })
    })?;

    messages.collect()
}

fn delete_messages_for_session(conn: &Connection, session_id: &str) -> Result<()> {
    conn.execute(
        "DELETE FROM chat_messages WHERE session_id = ?1",
        params![session_id],
    )?;
    Ok(())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;

    fn create_test_db() -> Database {
        let db = Database::new(":memory:").unwrap();
        db.init().unwrap();

        // Initialize chat tables
        init_chat_tables(db.get_connection()).unwrap();

        db
    }

    // -------------------------------------------------------------------------
    // Database Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_create_chat_session() {
        let db = create_test_db();

        let session = ChatSession {
            id: "test-session-1".to_string(),
            agent_type: "claude".to_string(),
            project_path: Some("/test/project".to_string()),
            prd_id: None,
            title: Some("Test Session".to_string()),
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };

        let result = create_chat_session(db.get_connection(), &session);
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_chat_session_by_id() {
        let db = create_test_db();

        let session = ChatSession {
            id: "test-session-2".to_string(),
            agent_type: "opencode".to_string(),
            project_path: Some("/test/path".to_string()),
            prd_id: None, // No PRD reference for this test
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };

        create_chat_session(db.get_connection(), &session).unwrap();
        let retrieved = get_chat_session_by_id(db.get_connection(), "test-session-2").unwrap();

        assert_eq!(retrieved.id, "test-session-2");
        assert_eq!(retrieved.agent_type, "opencode");
        assert_eq!(retrieved.project_path, Some("/test/path".to_string()));
        assert_eq!(retrieved.prd_id, None);
    }

    #[test]
    fn test_list_chat_sessions() {
        let db = create_test_db();

        let session1 = ChatSession {
            id: "session-1".to_string(),
            agent_type: "claude".to_string(),
            project_path: None,
            prd_id: None,
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T01:00:00Z".to_string(),
            message_count: None,
        };

        let session2 = ChatSession {
            id: "session-2".to_string(),
            agent_type: "cursor".to_string(),
            project_path: None,
            prd_id: None,
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T02:00:00Z".to_string(),
            message_count: None,
        };

        create_chat_session(db.get_connection(), &session1).unwrap();
        create_chat_session(db.get_connection(), &session2).unwrap();

        let sessions = list_chat_sessions(db.get_connection()).unwrap();

        assert_eq!(sessions.len(), 2);
        // Should be ordered by updated_at DESC
        assert_eq!(sessions[0].id, "session-2");
        assert_eq!(sessions[1].id, "session-1");
    }

    #[test]
    fn test_delete_chat_session() {
        let db = create_test_db();

        let session = ChatSession {
            id: "delete-test".to_string(),
            agent_type: "claude".to_string(),
            project_path: None,
            prd_id: None,
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };

        create_chat_session(db.get_connection(), &session).unwrap();
        delete_chat_session(db.get_connection(), "delete-test").unwrap();

        let result = get_chat_session_by_id(db.get_connection(), "delete-test");
        assert!(result.is_err());
    }

    #[test]
    fn test_update_chat_session_timestamp() {
        let db = create_test_db();

        let session = ChatSession {
            id: "timestamp-test".to_string(),
            agent_type: "claude".to_string(),
            project_path: None,
            prd_id: None,
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };

        create_chat_session(db.get_connection(), &session).unwrap();
        update_chat_session_timestamp(db.get_connection(), "timestamp-test", "2026-01-17T12:00:00Z").unwrap();

        let retrieved = get_chat_session_by_id(db.get_connection(), "timestamp-test").unwrap();
        assert_eq!(retrieved.updated_at, "2026-01-17T12:00:00Z");
    }

    #[test]
    fn test_create_chat_message() {
        let db = create_test_db();

        // Create session first
        let session = ChatSession {
            id: "msg-session".to_string(),
            agent_type: "claude".to_string(),
            project_path: None,
            prd_id: None,
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };
        create_chat_session(db.get_connection(), &session).unwrap();

        let message = ChatMessage {
            id: "msg-1".to_string(),
            session_id: "msg-session".to_string(),
            role: MessageRole::User,
            content: "Help me create a PRD".to_string(),
            created_at: "2026-01-17T00:01:00Z".to_string(),
        };

        let result = create_chat_message(db.get_connection(), &message);
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_messages_for_session() {
        let db = create_test_db();

        let session = ChatSession {
            id: "history-session".to_string(),
            agent_type: "claude".to_string(),
            project_path: None,
            prd_id: None,
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };
        create_chat_session(db.get_connection(), &session).unwrap();

        let msg1 = ChatMessage {
            id: "msg-1".to_string(),
            session_id: "history-session".to_string(),
            role: MessageRole::User,
            content: "Hello".to_string(),
            created_at: "2026-01-17T00:01:00Z".to_string(),
        };

        let msg2 = ChatMessage {
            id: "msg-2".to_string(),
            session_id: "history-session".to_string(),
            role: MessageRole::Assistant,
            content: "Hi! How can I help?".to_string(),
            created_at: "2026-01-17T00:02:00Z".to_string(),
        };

        let msg3 = ChatMessage {
            id: "msg-3".to_string(),
            session_id: "history-session".to_string(),
            role: MessageRole::User,
            content: "I need a PRD".to_string(),
            created_at: "2026-01-17T00:03:00Z".to_string(),
        };

        create_chat_message(db.get_connection(), &msg1).unwrap();
        create_chat_message(db.get_connection(), &msg2).unwrap();
        create_chat_message(db.get_connection(), &msg3).unwrap();

        let messages = get_messages_for_session(db.get_connection(), "history-session").unwrap();

        assert_eq!(messages.len(), 3);
        // Should be ordered by created_at ASC
        assert_eq!(messages[0].id, "msg-1");
        assert_eq!(messages[0].role, MessageRole::User);
        assert_eq!(messages[1].id, "msg-2");
        assert_eq!(messages[1].role, MessageRole::Assistant);
        assert_eq!(messages[2].id, "msg-3");
    }

    #[test]
    fn test_delete_messages_for_session() {
        let db = create_test_db();

        let session = ChatSession {
            id: "delete-msgs-session".to_string(),
            agent_type: "claude".to_string(),
            project_path: None,
            prd_id: None,
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };
        create_chat_session(db.get_connection(), &session).unwrap();

        let msg = ChatMessage {
            id: "to-delete".to_string(),
            session_id: "delete-msgs-session".to_string(),
            role: MessageRole::User,
            content: "Delete me".to_string(),
            created_at: "2026-01-17T00:01:00Z".to_string(),
        };
        create_chat_message(db.get_connection(), &msg).unwrap();

        delete_messages_for_session(db.get_connection(), "delete-msgs-session").unwrap();

        let messages = get_messages_for_session(db.get_connection(), "delete-msgs-session").unwrap();
        assert_eq!(messages.len(), 0);
    }

    // -------------------------------------------------------------------------
    // Helper Function Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_parse_agent_type_claude() {
        let result = parse_agent_type("claude");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), AgentType::Claude);
    }

    #[test]
    fn test_parse_agent_type_opencode() {
        let result = parse_agent_type("opencode");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), AgentType::Opencode);
    }

    #[test]
    fn test_parse_agent_type_cursor() {
        let result = parse_agent_type("cursor");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), AgentType::Cursor);
    }

    #[test]
    fn test_parse_agent_type_case_insensitive() {
        assert!(parse_agent_type("CLAUDE").is_ok());
        assert!(parse_agent_type("Claude").is_ok());
        assert!(parse_agent_type("OPENCODE").is_ok());
    }

    #[test]
    fn test_parse_agent_type_invalid() {
        let result = parse_agent_type("invalid_agent");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown agent type"));
    }

    #[test]
    fn test_build_prd_chat_prompt_empty_history() {
        let session = ChatSession {
            id: "test".to_string(),
            agent_type: "claude".to_string(),
            project_path: None,
            prd_id: None,
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };

        let history: Vec<ChatMessage> = vec![];
        let prompt = build_prd_chat_prompt(&session, &history, "Create a PRD for a todo app");

        assert!(prompt.contains("expert product manager"));
        assert!(prompt.contains("Create a PRD for a todo app"));
        assert!(!prompt.contains("Conversation History"));
    }

    #[test]
    fn test_build_prd_chat_prompt_with_history() {
        let session = ChatSession {
            id: "test".to_string(),
            agent_type: "claude".to_string(),
            project_path: Some("/my/project".to_string()),
            prd_id: None,
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };

        let history = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "I want to build a todo app".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Great! Let me help you define the requirements.".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
        ];

        let prompt = build_prd_chat_prompt(&session, &history, "Add a due date feature");

        assert!(prompt.contains("Project path: /my/project"));
        assert!(prompt.contains("Conversation History"));
        assert!(prompt.contains("I want to build a todo app"));
        assert!(prompt.contains("Let me help you define"));
        assert!(prompt.contains("Add a due date feature"));
    }

    #[test]
    fn test_convert_chat_to_prd_content() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "I need a todo app that must support multiple lists".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "I'll help you create a todo app. We should implement task creation first.".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
        ];

        let content = convert_chat_to_prd_content(&messages);

        // Verify it's valid JSON
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        // Verify structure
        assert!(parsed.get("sections").is_some());
        let sections = parsed["sections"].as_array().unwrap();

        // Should have overview, requirements, tasks, and conversation sections
        assert!(sections.len() >= 4);

        let section_ids: Vec<_> = sections
            .iter()
            .filter_map(|s| s["id"].as_str())
            .collect();

        assert!(section_ids.contains(&"overview"));
        assert!(section_ids.contains(&"requirements"));
        assert!(section_ids.contains(&"tasks"));
        assert!(section_ids.contains(&"conversation"));
    }

    #[test]
    fn test_extract_overview_from_messages() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "User question".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "This is the overview content from assistant.".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
        ];

        let overview = extract_overview_from_messages(&messages);

        assert!(overview.contains("overview content from assistant"));
        assert!(!overview.contains("User question")); // Should only include assistant messages
    }

    #[test]
    fn test_extract_requirements_from_messages() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "The app must support offline mode".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Users should be able to sync when online".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
            ChatMessage {
                id: "3".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "Just a regular message".to_string(),
                created_at: "2026-01-17T00:02:00Z".to_string(),
            },
        ];

        let requirements = extract_requirements_from_messages(&messages);

        assert!(requirements.contains("must support offline"));
        assert!(requirements.contains("should be able to sync"));
        // Regular message without keywords should not be included
    }

    #[test]
    fn test_extract_tasks_from_messages() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "We should implement the login flow first".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Then we need to create the database schema".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
            ChatMessage {
                id: "3".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "User message should not be a task".to_string(),
                created_at: "2026-01-17T00:02:00Z".to_string(),
            },
        ];

        let tasks = extract_tasks_from_messages(&messages);

        assert!(tasks.contains("1."));
        assert!(tasks.contains("2."));
        assert!(tasks.contains("implement"));
        assert!(tasks.contains("create"));
        assert!(!tasks.contains("User message")); // User messages should not be tasks
    }

    // -------------------------------------------------------------------------
    // Integration Tests (without actual CLI execution)
    // -------------------------------------------------------------------------

    #[test]
    fn test_full_session_workflow() {
        let db = create_test_db();
        let conn = db.get_connection();

        // 1. Create session
        let session = ChatSession {
            id: "workflow-session".to_string(),
            agent_type: "claude".to_string(),
            project_path: Some("/project".to_string()),
            prd_id: None,
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };
        create_chat_session(conn, &session).unwrap();

        // 2. Add messages
        let user_msg = ChatMessage {
            id: "u1".to_string(),
            session_id: "workflow-session".to_string(),
            role: MessageRole::User,
            content: "Create a PRD for a task manager".to_string(),
            created_at: "2026-01-17T00:01:00Z".to_string(),
        };
        create_chat_message(conn, &user_msg).unwrap();

        let assistant_msg = ChatMessage {
            id: "a1".to_string(),
            session_id: "workflow-session".to_string(),
            role: MessageRole::Assistant,
            content: "I'll help you create a comprehensive PRD for a task manager.".to_string(),
            created_at: "2026-01-17T00:02:00Z".to_string(),
        };
        create_chat_message(conn, &assistant_msg).unwrap();

        // 3. Verify history
        let history = get_messages_for_session(conn, "workflow-session").unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].role, MessageRole::User);
        assert_eq!(history[1].role, MessageRole::Assistant);

        // 4. Update timestamp
        update_chat_session_timestamp(conn, "workflow-session", "2026-01-17T00:02:00Z").unwrap();

        // 5. Verify session list
        let sessions = list_chat_sessions(conn).unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].updated_at, "2026-01-17T00:02:00Z");

        // 6. Delete and verify
        delete_messages_for_session(conn, "workflow-session").unwrap();
        delete_chat_session(conn, "workflow-session").unwrap();

        let sessions = list_chat_sessions(conn).unwrap();
        assert_eq!(sessions.len(), 0);
    }

    #[test]
    fn test_session_with_prd_reference() {
        let db = create_test_db();
        let conn = db.get_connection();

        // Create a PRD first
        let prd = crate::database::prd::PRDDocument {
            id: "prd-ref".to_string(),
            title: "Linked PRD".to_string(),
            description: None,
            template_id: None,
            content: "{}".to_string(),
            quality_score_completeness: None,
            quality_score_clarity: None,
            quality_score_actionability: None,
            quality_score_overall: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            version: 1,
            project_path: None,
        };
        db.create_prd(&prd).unwrap();

        // Create session linked to PRD
        let session = ChatSession {
            id: "linked-session".to_string(),
            agent_type: "claude".to_string(),
            project_path: None,
            prd_id: Some("prd-ref".to_string()),
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };
        create_chat_session(conn, &session).unwrap();

        let retrieved = get_chat_session_by_id(conn, "linked-session").unwrap();
        assert_eq!(retrieved.prd_id, Some("prd-ref".to_string()));
    }

    #[test]
    fn test_multiple_sessions_isolation() {
        let db = create_test_db();
        let conn = db.get_connection();

        // Create two sessions
        let session1 = ChatSession {
            id: "session-a".to_string(),
            agent_type: "claude".to_string(),
            project_path: None,
            prd_id: None,
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };
        let session2 = ChatSession {
            id: "session-b".to_string(),
            agent_type: "opencode".to_string(),
            project_path: None,
            prd_id: None,
            title: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };

        create_chat_session(conn, &session1).unwrap();
        create_chat_session(conn, &session2).unwrap();

        // Add messages to each session
        let msg_a = ChatMessage {
            id: "msg-a".to_string(),
            session_id: "session-a".to_string(),
            role: MessageRole::User,
            content: "Message for session A".to_string(),
            created_at: "2026-01-17T00:01:00Z".to_string(),
        };
        let msg_b = ChatMessage {
            id: "msg-b".to_string(),
            session_id: "session-b".to_string(),
            role: MessageRole::User,
            content: "Message for session B".to_string(),
            created_at: "2026-01-17T00:01:00Z".to_string(),
        };

        create_chat_message(conn, &msg_a).unwrap();
        create_chat_message(conn, &msg_b).unwrap();

        // Verify isolation
        let messages_a = get_messages_for_session(conn, "session-a").unwrap();
        let messages_b = get_messages_for_session(conn, "session-b").unwrap();

        assert_eq!(messages_a.len(), 1);
        assert_eq!(messages_b.len(), 1);
        assert_eq!(messages_a[0].content, "Message for session A");
        assert_eq!(messages_b[0].content, "Message for session B");
    }

    #[test]
    fn test_export_generates_valid_prd_structure() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "I need a user authentication feature".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Let's implement OAuth2 with Google and GitHub support".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
        ];

        let content = convert_chat_to_prd_content(&messages);

        // Verify valid JSON structure matching PRD format
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        // Check required sections exist
        let sections = parsed["sections"].as_array().unwrap();

        let has_overview = sections.iter().any(|s| s["id"] == "overview" && s["required"] == true);
        let has_requirements = sections.iter().any(|s| s["id"] == "requirements" && s["required"] == true);
        let has_tasks = sections.iter().any(|s| s["id"] == "tasks" && s["required"] == true);

        assert!(has_overview, "Missing required overview section");
        assert!(has_requirements, "Missing required requirements section");
        assert!(has_tasks, "Missing required tasks section");
    }

    // -------------------------------------------------------------------------
    // MessageRole Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_message_role_as_str() {
        assert_eq!(MessageRole::User.as_str(), "user");
        assert_eq!(MessageRole::Assistant.as_str(), "assistant");
        assert_eq!(MessageRole::System.as_str(), "system");
    }

    #[test]
    fn test_message_role_from_str() {
        assert_eq!("user".parse::<MessageRole>().unwrap(), MessageRole::User);
        assert_eq!("assistant".parse::<MessageRole>().unwrap(), MessageRole::Assistant);
        assert_eq!("system".parse::<MessageRole>().unwrap(), MessageRole::System);
    }

    #[test]
    fn test_message_role_from_str_case_insensitive() {
        assert_eq!("USER".parse::<MessageRole>().unwrap(), MessageRole::User);
        assert_eq!("Assistant".parse::<MessageRole>().unwrap(), MessageRole::Assistant);
        assert_eq!("SYSTEM".parse::<MessageRole>().unwrap(), MessageRole::System);
    }

    #[test]
    fn test_message_role_from_str_invalid() {
        let result = "invalid".parse::<MessageRole>();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid message role"));
    }

    #[test]
    fn test_message_role_display() {
        assert_eq!(format!("{}", MessageRole::User), "user");
        assert_eq!(format!("{}", MessageRole::Assistant), "assistant");
        assert_eq!(format!("{}", MessageRole::System), "system");
    }

    #[test]
    fn test_message_role_serde_serialize() {
        let user = MessageRole::User;
        let serialized = serde_json::to_string(&user).unwrap();
        assert_eq!(serialized, "\"user\"");

        let assistant = MessageRole::Assistant;
        let serialized = serde_json::to_string(&assistant).unwrap();
        assert_eq!(serialized, "\"assistant\"");

        let system = MessageRole::System;
        let serialized = serde_json::to_string(&system).unwrap();
        assert_eq!(serialized, "\"system\"");
    }

    #[test]
    fn test_message_role_serde_deserialize() {
        let user: MessageRole = serde_json::from_str("\"user\"").unwrap();
        assert_eq!(user, MessageRole::User);

        let assistant: MessageRole = serde_json::from_str("\"assistant\"").unwrap();
        assert_eq!(assistant, MessageRole::Assistant);

        let system: MessageRole = serde_json::from_str("\"system\"").unwrap();
        assert_eq!(system, MessageRole::System);
    }

    #[test]
    fn test_chat_message_serde_roundtrip() {
        let message = ChatMessage {
            id: "test-id".to_string(),
            session_id: "session-id".to_string(),
            role: MessageRole::Assistant,
            content: "Hello, world!".to_string(),
            created_at: "2026-01-17T00:00:00Z".to_string(),
        };

        let serialized = serde_json::to_string(&message).unwrap();
        let deserialized: ChatMessage = serde_json::from_str(&serialized).unwrap();

        assert_eq!(deserialized.id, message.id);
        assert_eq!(deserialized.session_id, message.session_id);
        assert_eq!(deserialized.role, message.role);
        assert_eq!(deserialized.content, message.content);
        assert_eq!(deserialized.created_at, message.created_at);
    }
}
