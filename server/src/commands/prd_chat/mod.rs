// PRD Chat Backend commands - AI-assisted PRD creation through conversation
//
// This module is organized into submodules:
// - types: Request/response types for the API
// - agent_executor: Unified chat agent execution with trait-based event emission
// - session: Session CRUD operations (start, delete, list, get, update)
// - messaging: Message handling (send, get_history, prompt building)
// - quality: Quality assessment and guided questions
// - extraction: PRD content extraction and parsing
// - file_watch: File watching and plan content operations
//
// Storage: Chat sessions are stored in {project}/.ralph-ui/chat/{id}.json

pub mod agent_executor;
mod extraction;
mod file_watch;
mod messaging;
mod quality;
mod session;
mod types;

// Re-export from agent_executor (public API)
pub use agent_executor::{
    build_agent_command, generate_session_title, ChatAgentResult, ChatEventEmitter,
};

// Re-export all types
pub use types::*;

// Re-export file_watch types and functions
pub use file_watch::{
    get_prd_plan_content, start_watching_prd_file, stop_watching_prd_file, WatchFileResponse,
};

// Re-export session functions
pub use session::{
    check_agent_availability, clear_extracted_structure, delete_prd_chat_session,
    get_extracted_structure, list_prd_chat_sessions, set_structured_mode, start_prd_chat_session,
    update_prd_chat_agent,
};

// Re-export messaging functions
pub use messaging::{get_prd_chat_history, send_prd_chat_message};

// Re-export quality functions
pub use quality::{assess_prd_quality, get_guided_questions};

// Re-export extraction functions
pub use extraction::preview_prd_extraction;

use crate::models::{AgentType, PRDType};
use serde::{Deserialize, Serialize};

// ============================================================================
// Shared Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAvailabilityResult {
    pub available: bool,
    pub agent: String,
    pub path: Option<String>,
    pub error: Option<String>,
}

// ============================================================================
// Shared Helper Functions
// ============================================================================

/// Parse agent type string to enum
pub fn parse_agent_type(agent_type: &str) -> Result<AgentType, String> {
    match agent_type.to_lowercase().as_str() {
        "claude" => Ok(AgentType::Claude),
        "opencode" => Ok(AgentType::Opencode),
        "cursor" => Ok(AgentType::Cursor),
        _ => Err(format!("Unknown agent type: {}", agent_type)),
    }
}

/// Get a default title for a PRD type
pub fn get_prd_type_title(prd_type: &PRDType) -> String {
    match prd_type {
        PRDType::NewFeature => "New Feature PRD".to_string(),
        PRDType::BugFix => "Bug Fix PRD".to_string(),
        PRDType::Refactoring => "Refactoring PRD".to_string(),
        PRDType::ApiIntegration => "API Integration PRD".to_string(),
        PRDType::General => "General PRD".to_string(),
        PRDType::FullNewApp => "Full New App PRD".to_string(),
    }
}

/// Generate a welcome message with the first guided question based on PRD type
pub fn generate_welcome_message(prd_type: Option<&PRDType>) -> String {
    let type_context = match prd_type {
        Some(PRDType::NewFeature) => "new feature",
        Some(PRDType::BugFix) => "bug fix",
        Some(PRDType::Refactoring) => "refactoring effort",
        Some(PRDType::ApiIntegration) => "API integration",
        Some(PRDType::FullNewApp) => "new application",
        Some(PRDType::General) | None => "project",
    };

    let first_question = match prd_type {
        Some(PRDType::NewFeature) =>
            "What problem are you trying to solve with this new feature? Who are the target users, and what pain points are they currently experiencing?",
        Some(PRDType::BugFix) =>
            "Can you describe the bug you're trying to fix? What is the expected behavior vs. the actual behavior you're seeing?",
        Some(PRDType::Refactoring) =>
            "What part of the codebase are you looking to refactor? What are the main issues with the current implementation (e.g., performance, maintainability, technical debt)?",
        Some(PRDType::ApiIntegration) =>
            "Which API or service are you integrating with? What functionality do you need from this integration?",
        Some(PRDType::FullNewApp) =>
            "What kind of application are you planning to build? Please describe the main purpose and the problem it will solve for users.",
        Some(PRDType::General) | None =>
            "What would you like to build or accomplish? Please describe your project idea and its main goals.",
    };

    format!(
        "👋 Welcome! I'll help you create a comprehensive PRD for your {}.\n\n\
        I'll guide you through a series of questions to capture all the important details. \
        Feel free to provide as much context as you can - the more details, the better the PRD!\n\n\
        **Let's start:**\n\n{}",
        type_context, first_question
    )
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ChatMessage, ChatSession, MessageRole};

    // Helper to create a test session with default new fields
    fn make_test_session(id: &str) -> ChatSession {
        ChatSession {
            id: id.to_string(),
            agent_type: "claude".to_string(),
            project_path: None,
            prd_id: None,
            title: None,
            prd_type: None,
            guided_mode: true,
            quality_score: None,
            template_id: None,
            structured_mode: false,
            extracted_structure: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
            gsd_mode: false,
            gsd_state: None,
            pending_operation_started_at: None,
            external_session_id: None,
        }
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
        assert_eq!(
            "assistant".parse::<MessageRole>().unwrap(),
            MessageRole::Assistant
        );
        assert_eq!(
            "system".parse::<MessageRole>().unwrap(),
            MessageRole::System
        );
    }

    #[test]
    fn test_message_role_from_str_case_insensitive() {
        assert_eq!("USER".parse::<MessageRole>().unwrap(), MessageRole::User);
        assert_eq!(
            "Assistant".parse::<MessageRole>().unwrap(),
            MessageRole::Assistant
        );
        assert_eq!(
            "SYSTEM".parse::<MessageRole>().unwrap(),
            MessageRole::System
        );
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
            attachments: None,
        };

        let serialized = serde_json::to_string(&message).unwrap();
        let deserialized: ChatMessage = serde_json::from_str(&serialized).unwrap();

        assert_eq!(deserialized.id, message.id);
        assert_eq!(deserialized.session_id, message.session_id);
        assert_eq!(deserialized.role, message.role);
        assert_eq!(deserialized.content, message.content);
        assert_eq!(deserialized.created_at, message.created_at);
    }

    // -------------------------------------------------------------------------
    // PRD Type Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_prd_type_parsing() {
        assert_eq!(
            "new_feature".parse::<PRDType>().unwrap(),
            PRDType::NewFeature
        );
        assert_eq!("bug_fix".parse::<PRDType>().unwrap(), PRDType::BugFix);
        assert_eq!(
            "refactoring".parse::<PRDType>().unwrap(),
            PRDType::Refactoring
        );
        assert_eq!(
            "api_integration".parse::<PRDType>().unwrap(),
            PRDType::ApiIntegration
        );
        assert_eq!("general".parse::<PRDType>().unwrap(), PRDType::General);
    }

    #[test]
    fn test_prd_type_display() {
        assert_eq!(PRDType::NewFeature.as_str(), "new_feature");
        assert_eq!(PRDType::BugFix.display_name(), "Bug Fix");
    }

    #[test]
    fn test_prd_type_invalid() {
        let result = "invalid_type".parse::<PRDType>();
        assert!(result.is_err());
    }

    // Suppress unused variable warning for test helper
    #[allow(dead_code)]
    fn _use_test_session() {
        let _ = make_test_session("test");
    }
}
