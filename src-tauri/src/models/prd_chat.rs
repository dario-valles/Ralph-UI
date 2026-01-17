// PRD Chat Models - Canonical type definitions for chat sessions and messages

use serde::{Deserialize, Serialize};

// ============================================================================
// Message Role Enum
// ============================================================================

/// Enum for chat message roles with compile-time validation.
/// Serializes/deserializes as lowercase strings to match TypeScript union type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
}

impl MessageRole {
    /// Convert to lowercase string representation
    pub fn as_str(&self) -> &'static str {
        match self {
            MessageRole::User => "user",
            MessageRole::Assistant => "assistant",
            MessageRole::System => "system",
        }
    }
}

impl std::fmt::Display for MessageRole {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for MessageRole {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "user" => Ok(MessageRole::User),
            "assistant" => Ok(MessageRole::Assistant),
            "system" => Ok(MessageRole::System),
            _ => Err(format!("Invalid message role: '{}'. Expected 'user', 'assistant', or 'system'", s)),
        }
    }
}

// ============================================================================
// Database Models
// ============================================================================

/// A chat session for AI-assisted PRD creation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatSession {
    pub id: String,
    pub agent_type: String,
    pub project_path: Option<String>,
    pub prd_id: Option<String>,
    pub title: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_deserializing)]
    pub message_count: Option<i32>,
}

/// A message in a chat session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub session_id: String,
    pub role: MessageRole,
    pub content: String,
    pub created_at: String,
}
