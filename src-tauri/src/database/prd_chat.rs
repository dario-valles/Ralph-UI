// PRD Chat database operations
#![allow(dead_code)]

use crate::models::{ChatMessage, ChatSession, MessageRole};
use rusqlite::{params, Result};

impl super::Database {
    // Chat Session operations

    pub fn create_chat_session(&self, session: &ChatSession) -> Result<()> {
        self.get_connection().execute(
            "INSERT INTO chat_sessions (
                id, prd_id, agent_type, project_path, title, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                session.id,
                session.prd_id,
                session.agent_type,
                session.project_path,
                session.title,
                session.created_at,
                session.updated_at,
            ],
        )?;
        Ok(())
    }

    pub fn get_chat_session(&self, id: &str) -> Result<ChatSession> {
        self.get_connection().query_row(
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

    pub fn list_chat_sessions(&self) -> Result<Vec<ChatSession>> {
        let conn = self.get_connection();
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

    pub fn update_chat_session(&self, session: &ChatSession) -> Result<()> {
        self.get_connection().execute(
            "UPDATE chat_sessions SET
                prd_id = ?1, agent_type = ?2, project_path = ?3, title = ?4, updated_at = ?5
             WHERE id = ?6",
            params![
                session.prd_id,
                session.agent_type,
                session.project_path,
                session.title,
                session.updated_at,
                session.id,
            ],
        )?;
        Ok(())
    }

    pub fn delete_chat_session(&self, id: &str) -> Result<()> {
        self.get_connection().execute(
            "DELETE FROM chat_sessions WHERE id = ?1",
            params![id],
        )?;
        Ok(())
    }

    // Chat Message operations

    pub fn create_chat_message(&self, message: &ChatMessage) -> Result<()> {
        self.get_connection().execute(
            "INSERT INTO chat_messages (
                id, session_id, role, content, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5)",
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

    pub fn get_messages_by_session(&self, session_id: &str) -> Result<Vec<ChatMessage>> {
        let conn = self.get_connection();
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

    pub fn delete_messages_by_session(&self, session_id: &str) -> Result<()> {
        self.get_connection().execute(
            "DELETE FROM chat_messages WHERE session_id = ?1",
            params![session_id],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;

    // Helper function to create a test database with chat tables
    fn create_test_db() -> Database {
        let db = Database::new(":memory:").unwrap();
        db.init().unwrap();
        db
    }

    // Helper function to create a sample chat session (without prd_id to avoid FK constraint)
    fn sample_chat_session(id: &str) -> ChatSession {
        ChatSession {
            id: id.to_string(),
            agent_type: "prd_writer".to_string(),
            project_path: Some("/test/project".to_string()),
            prd_id: None, // Use None to avoid FK constraint issues in tests
            title: None,
            created_at: "2026-01-17T10:00:00Z".to_string(),
            updated_at: "2026-01-17T10:00:00Z".to_string(),
            message_count: None,
        }
    }

    // Helper function to create a sample chat message
    fn sample_chat_message(id: &str, session_id: &str, role: MessageRole) -> ChatMessage {
        ChatMessage {
            id: id.to_string(),
            session_id: session_id.to_string(),
            role,
            content: format!("Test message from {}", role.as_str()),
            created_at: "2026-01-17T10:00:00Z".to_string(),
        }
    }

    // ==================== ChatSession Tests ====================

    #[test]
    fn test_create_chat_session() {
        let db = create_test_db();
        let session = sample_chat_session("session-1");

        let result = db.create_chat_session(&session);
        assert!(result.is_ok(), "Failed to create chat session: {:?}", result.err());
    }

    #[test]
    fn test_create_chat_session_with_null_fields() {
        let db = create_test_db();
        let session = ChatSession {
            id: "session-null".to_string(),
            agent_type: "general".to_string(),
            project_path: None,
            prd_id: None,
            title: None,
            created_at: "2026-01-17T10:00:00Z".to_string(),
            updated_at: "2026-01-17T10:00:00Z".to_string(),
            message_count: None,
        };

        let result = db.create_chat_session(&session);
        assert!(result.is_ok(), "Failed to create session with null fields: {:?}", result.err());

        let retrieved = db.get_chat_session("session-null").unwrap();
        assert!(retrieved.prd_id.is_none());
        assert!(retrieved.project_path.is_none());
    }

    #[test]
    fn test_get_chat_session() {
        let db = create_test_db();
        let session = sample_chat_session("session-get");

        db.create_chat_session(&session).unwrap();
        let retrieved = db.get_chat_session("session-get").unwrap();

        assert_eq!(retrieved.id, session.id);
        assert_eq!(retrieved.prd_id, session.prd_id);
        assert_eq!(retrieved.agent_type, session.agent_type);
        assert_eq!(retrieved.project_path, session.project_path);
        assert_eq!(retrieved.created_at, session.created_at);
        assert_eq!(retrieved.updated_at, session.updated_at);
    }

    #[test]
    fn test_get_chat_session_not_found() {
        let db = create_test_db();

        let result = db.get_chat_session("nonexistent");
        assert!(result.is_err(), "Should fail for nonexistent session");
    }

    #[test]
    fn test_list_chat_sessions_empty() {
        let db = create_test_db();

        let sessions = db.list_chat_sessions().unwrap();
        assert!(sessions.is_empty(), "Should return empty list when no sessions exist");
    }

    #[test]
    fn test_list_chat_sessions() {
        let db = create_test_db();

        // Create multiple sessions with different timestamps
        let mut session1 = sample_chat_session("session-1");
        session1.updated_at = "2026-01-17T09:00:00Z".to_string();

        let mut session2 = sample_chat_session("session-2");
        session2.updated_at = "2026-01-17T11:00:00Z".to_string();

        let mut session3 = sample_chat_session("session-3");
        session3.updated_at = "2026-01-17T10:00:00Z".to_string();

        db.create_chat_session(&session1).unwrap();
        db.create_chat_session(&session2).unwrap();
        db.create_chat_session(&session3).unwrap();

        let sessions = db.list_chat_sessions().unwrap();

        assert_eq!(sessions.len(), 3);
        // Should be ordered by updated_at DESC
        assert_eq!(sessions[0].id, "session-2");
        assert_eq!(sessions[1].id, "session-3");
        assert_eq!(sessions[2].id, "session-1");
    }

    #[test]
    fn test_update_chat_session() {
        let db = create_test_db();
        let session = sample_chat_session("session-update");

        db.create_chat_session(&session).unwrap();

        // Update the session (keeping prd_id as None to avoid FK constraint)
        let updated_session = ChatSession {
            id: "session-update".to_string(),
            agent_type: "task_decomposer".to_string(),
            project_path: Some("/updated/path".to_string()),
            prd_id: None, // Keep None to avoid FK constraint issues
            title: Some("Updated Title".to_string()),
            created_at: session.created_at.clone(),
            updated_at: "2026-01-17T12:00:00Z".to_string(),
            message_count: None,
        };

        let result = db.update_chat_session(&updated_session);
        assert!(result.is_ok(), "Failed to update chat session: {:?}", result.err());

        let retrieved = db.get_chat_session("session-update").unwrap();
        assert_eq!(retrieved.prd_id, None);
        assert_eq!(retrieved.agent_type, "task_decomposer");
        assert_eq!(retrieved.project_path, Some("/updated/path".to_string()));
        assert_eq!(retrieved.updated_at, "2026-01-17T12:00:00Z");
    }

    #[test]
    fn test_delete_chat_session() {
        let db = create_test_db();
        let session = sample_chat_session("session-delete");

        db.create_chat_session(&session).unwrap();

        // Verify it exists
        let retrieved = db.get_chat_session("session-delete");
        assert!(retrieved.is_ok());

        // Delete it
        let result = db.delete_chat_session("session-delete");
        assert!(result.is_ok(), "Failed to delete chat session: {:?}", result.err());

        // Verify it's gone
        let retrieved = db.get_chat_session("session-delete");
        assert!(retrieved.is_err(), "Session should be deleted");
    }

    #[test]
    fn test_delete_nonexistent_session() {
        let db = create_test_db();

        // Deleting nonexistent session should succeed (SQLite DELETE is idempotent)
        let result = db.delete_chat_session("nonexistent");
        assert!(result.is_ok());
    }

    // ==================== ChatMessage Tests ====================

    #[test]
    fn test_create_chat_message() {
        let db = create_test_db();

        // First create a session
        let session = sample_chat_session("session-msg");
        db.create_chat_session(&session).unwrap();

        // Create a message
        let message = sample_chat_message("msg-1", "session-msg", MessageRole::User);

        let result = db.create_chat_message(&message);
        assert!(result.is_ok(), "Failed to create chat message: {:?}", result.err());
    }

    #[test]
    fn test_create_chat_message_different_roles() {
        let db = create_test_db();
        let session = sample_chat_session("session-roles");
        db.create_chat_session(&session).unwrap();

        // Test all valid roles
        let user_msg = sample_chat_message("msg-user", "session-roles", MessageRole::User);
        let assistant_msg = sample_chat_message("msg-assistant", "session-roles", MessageRole::Assistant);
        let system_msg = sample_chat_message("msg-system", "session-roles", MessageRole::System);

        assert!(db.create_chat_message(&user_msg).is_ok());
        assert!(db.create_chat_message(&assistant_msg).is_ok());
        assert!(db.create_chat_message(&system_msg).is_ok());

        let messages = db.get_messages_by_session("session-roles").unwrap();
        assert_eq!(messages.len(), 3);

        let roles: Vec<&str> = messages.iter().map(|m| m.role.as_str()).collect();
        assert!(roles.contains(&"user"));
        assert!(roles.contains(&"assistant"));
        assert!(roles.contains(&"system"));
    }

    #[test]
    fn test_get_messages_by_session_empty() {
        let db = create_test_db();
        let session = sample_chat_session("session-empty");
        db.create_chat_session(&session).unwrap();

        let messages = db.get_messages_by_session("session-empty").unwrap();
        assert!(messages.is_empty(), "Should return empty list when no messages exist");
    }

    #[test]
    fn test_get_messages_by_session() {
        let db = create_test_db();
        let session = sample_chat_session("session-multi");
        db.create_chat_session(&session).unwrap();

        // Create messages with different timestamps (simulating conversation order)
        let mut msg1 = sample_chat_message("msg-1", "session-multi", MessageRole::User);
        msg1.created_at = "2026-01-17T10:01:00Z".to_string();
        msg1.content = "Hello, I need help with my PRD".to_string();

        let mut msg2 = sample_chat_message("msg-2", "session-multi", MessageRole::Assistant);
        msg2.created_at = "2026-01-17T10:02:00Z".to_string();
        msg2.content = "Of course! What would you like to work on?".to_string();

        let mut msg3 = sample_chat_message("msg-3", "session-multi", MessageRole::User);
        msg3.created_at = "2026-01-17T10:03:00Z".to_string();
        msg3.content = "I want to add a new feature".to_string();

        db.create_chat_message(&msg1).unwrap();
        db.create_chat_message(&msg3).unwrap(); // Insert out of order
        db.create_chat_message(&msg2).unwrap();

        let messages = db.get_messages_by_session("session-multi").unwrap();

        assert_eq!(messages.len(), 3);
        // Should be ordered by created_at ASC (chronological order)
        assert_eq!(messages[0].id, "msg-1");
        assert_eq!(messages[1].id, "msg-2");
        assert_eq!(messages[2].id, "msg-3");
    }

    #[test]
    fn test_get_messages_by_session_isolation() {
        let db = create_test_db();

        // Create two sessions
        let session1 = sample_chat_session("session-iso-1");
        let session2 = sample_chat_session("session-iso-2");
        db.create_chat_session(&session1).unwrap();
        db.create_chat_session(&session2).unwrap();

        // Create messages in both sessions
        let msg1 = sample_chat_message("msg-s1-1", "session-iso-1", MessageRole::User);
        let msg2 = sample_chat_message("msg-s1-2", "session-iso-1", MessageRole::Assistant);
        let msg3 = sample_chat_message("msg-s2-1", "session-iso-2", MessageRole::User);

        db.create_chat_message(&msg1).unwrap();
        db.create_chat_message(&msg2).unwrap();
        db.create_chat_message(&msg3).unwrap();

        // Verify session isolation
        let messages1 = db.get_messages_by_session("session-iso-1").unwrap();
        let messages2 = db.get_messages_by_session("session-iso-2").unwrap();

        assert_eq!(messages1.len(), 2);
        assert_eq!(messages2.len(), 1);
        assert!(messages1.iter().all(|m| m.session_id == "session-iso-1"));
        assert!(messages2.iter().all(|m| m.session_id == "session-iso-2"));
    }

    #[test]
    fn test_delete_messages_by_session() {
        let db = create_test_db();
        let session = sample_chat_session("session-del-msgs");
        db.create_chat_session(&session).unwrap();

        // Create messages
        let msg1 = sample_chat_message("msg-del-1", "session-del-msgs", MessageRole::User);
        let msg2 = sample_chat_message("msg-del-2", "session-del-msgs", MessageRole::Assistant);
        db.create_chat_message(&msg1).unwrap();
        db.create_chat_message(&msg2).unwrap();

        // Verify messages exist
        let messages = db.get_messages_by_session("session-del-msgs").unwrap();
        assert_eq!(messages.len(), 2);

        // Delete messages
        let result = db.delete_messages_by_session("session-del-msgs");
        assert!(result.is_ok(), "Failed to delete messages: {:?}", result.err());

        // Verify messages are gone
        let messages = db.get_messages_by_session("session-del-msgs").unwrap();
        assert!(messages.is_empty(), "Messages should be deleted");

        // Session should still exist
        let session = db.get_chat_session("session-del-msgs");
        assert!(session.is_ok(), "Session should still exist after deleting messages");
    }

    #[test]
    fn test_delete_messages_by_nonexistent_session() {
        let db = create_test_db();

        // Should succeed (no messages to delete)
        let result = db.delete_messages_by_session("nonexistent");
        assert!(result.is_ok());
    }

    // ==================== Foreign Key Tests ====================

    #[test]
    fn test_chat_session_with_prd_reference() {
        use crate::database::prd::PRDDocument;

        let db = create_test_db();

        // First create a PRD document
        let prd = PRDDocument {
            id: "prd-for-chat".to_string(),
            title: "Test PRD".to_string(),
            description: Some("A test PRD for chat".to_string()),
            template_id: None,
            content: "{}".to_string(),
            quality_score_completeness: None,
            quality_score_clarity: None,
            quality_score_actionability: None,
            quality_score_overall: None,
            created_at: "2026-01-17T10:00:00Z".to_string(),
            updated_at: "2026-01-17T10:00:00Z".to_string(),
            version: 1,
            project_path: Some("/test/project".to_string()),
        };
        db.create_prd(&prd).unwrap();

        // Now create a chat session linked to the PRD
        let session = ChatSession {
            id: "session-with-prd".to_string(),
            agent_type: "prd_writer".to_string(),
            project_path: Some("/test/project".to_string()),
            prd_id: Some("prd-for-chat".to_string()),
            title: None,
            created_at: "2026-01-17T10:00:00Z".to_string(),
            updated_at: "2026-01-17T10:00:00Z".to_string(),
            message_count: None,
        };

        let result = db.create_chat_session(&session);
        assert!(result.is_ok(), "Should create session with valid PRD reference");

        let retrieved = db.get_chat_session("session-with-prd").unwrap();
        assert_eq!(retrieved.prd_id, Some("prd-for-chat".to_string()));
    }

    #[test]
    fn test_chat_session_with_invalid_prd_reference() {
        let db = create_test_db();

        // Try to create a chat session with a non-existent PRD reference
        let session = ChatSession {
            id: "session-invalid-prd".to_string(),
            agent_type: "prd_writer".to_string(),
            project_path: None,
            prd_id: Some("nonexistent-prd".to_string()),
            title: None,
            created_at: "2026-01-17T10:00:00Z".to_string(),
            updated_at: "2026-01-17T10:00:00Z".to_string(),
            message_count: None,
        };

        let result = db.create_chat_session(&session);
        assert!(result.is_err(), "Should fail with invalid PRD reference due to FK constraint");
    }

    // ==================== Integration Tests ====================

    #[test]
    fn test_full_chat_workflow() {
        let db = create_test_db();

        // 1. Create a chat session (without prd_id to avoid FK constraint)
        let session = ChatSession {
            id: "workflow-session".to_string(),
            agent_type: "prd_writer".to_string(),
            project_path: Some("/my/project".to_string()),
            prd_id: None, // No prd_id initially
            title: None,
            created_at: "2026-01-17T10:00:00Z".to_string(),
            updated_at: "2026-01-17T10:00:00Z".to_string(),
            message_count: None,
        };
        db.create_chat_session(&session).unwrap();

        // 2. Add a system message
        let system_msg = ChatMessage {
            id: "msg-sys".to_string(),
            session_id: "workflow-session".to_string(),
            role: MessageRole::System,
            content: "You are a PRD writing assistant.".to_string(),
            created_at: "2026-01-17T10:00:01Z".to_string(),
        };
        db.create_chat_message(&system_msg).unwrap();

        // 3. Add user message
        let user_msg = ChatMessage {
            id: "msg-usr".to_string(),
            session_id: "workflow-session".to_string(),
            role: MessageRole::User,
            content: "Help me write a PRD for a todo app".to_string(),
            created_at: "2026-01-17T10:01:00Z".to_string(),
        };
        db.create_chat_message(&user_msg).unwrap();

        // 4. Add assistant response
        let assistant_msg = ChatMessage {
            id: "msg-ast".to_string(),
            session_id: "workflow-session".to_string(),
            role: MessageRole::Assistant,
            content: "I'd be happy to help! Let's start with the problem statement.".to_string(),
            created_at: "2026-01-17T10:01:30Z".to_string(),
        };
        db.create_chat_message(&assistant_msg).unwrap();

        // 5. Update session timestamp
        let updated_session = ChatSession {
            updated_at: "2026-01-17T10:01:30Z".to_string(),
            ..session.clone()
        };
        db.update_chat_session(&updated_session).unwrap();

        // 6. Verify all messages are retrievable
        let messages = db.get_messages_by_session("workflow-session").unwrap();
        assert_eq!(messages.len(), 3);
        assert_eq!(messages[0].role, MessageRole::System);
        assert_eq!(messages[1].role, MessageRole::User);
        assert_eq!(messages[2].role, MessageRole::Assistant);

        // 7. Verify session is in list
        let sessions = db.list_chat_sessions().unwrap();
        assert!(sessions.iter().any(|s| s.id == "workflow-session"));

        // 8. Clear conversation (delete messages only)
        db.delete_messages_by_session("workflow-session").unwrap();
        let messages = db.get_messages_by_session("workflow-session").unwrap();
        assert!(messages.is_empty());

        // 9. Delete the entire session
        db.delete_chat_session("workflow-session").unwrap();
        let result = db.get_chat_session("workflow-session");
        assert!(result.is_err());
    }

    #[test]
    fn test_large_message_content() {
        let db = create_test_db();
        let session = sample_chat_session("session-large");
        db.create_chat_session(&session).unwrap();

        // Create a message with large content (simulating a long PRD)
        let large_content = "A".repeat(100_000); // 100KB of content
        let message = ChatMessage {
            id: "msg-large".to_string(),
            session_id: "session-large".to_string(),
            role: MessageRole::Assistant,
            content: large_content.clone(),
            created_at: "2026-01-17T10:00:00Z".to_string(),
        };

        let result = db.create_chat_message(&message);
        assert!(result.is_ok(), "Should handle large message content");

        let messages = db.get_messages_by_session("session-large").unwrap();
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0].content.len(), 100_000);
    }

    #[test]
    fn test_special_characters_in_content() {
        let db = create_test_db();
        let session = sample_chat_session("session-special");
        db.create_chat_session(&session).unwrap();

        let special_content = r#"
            Here's some code:
            ```rust
            fn main() {
                println!("Hello, world!");
            }
            ```

            And some special chars: <>&"'
            Unicode: 日本語 emoji: 🚀🎉
            SQL injection attempt: '; DROP TABLE users; --
        "#;

        let message = ChatMessage {
            id: "msg-special".to_string(),
            session_id: "session-special".to_string(),
            role: MessageRole::User,
            content: special_content.to_string(),
            created_at: "2026-01-17T10:00:00Z".to_string(),
        };

        db.create_chat_message(&message).unwrap();

        let messages = db.get_messages_by_session("session-special").unwrap();
        assert_eq!(messages[0].content, special_content);
    }
}
