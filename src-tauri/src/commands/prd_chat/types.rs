// PRD Chat request/response types

use crate::database::prd::PRDDocument;
use crate::models::ChatMessage;
use serde::{Deserialize, Serialize};

// ============================================================================
// Request Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartChatSessionRequest {
    pub agent_type: String,
    pub project_path: Option<String>,
    pub prd_id: Option<String>,
    /// Type of PRD being created (new_feature, bug_fix, refactoring, api_integration, general)
    pub prd_type: Option<String>,
    /// Whether to use guided interview mode
    pub guided_mode: Option<bool>,
    /// Template ID to use for structure
    pub template_id: Option<String>,
    /// Whether to use structured output mode (JSON blocks)
    pub structured_mode: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub session_id: String,
    pub content: String,
    /// Project path for file-based storage (required)
    pub project_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportToPRDRequest {
    pub session_id: String,
    pub title: String,
    /// Project path for file-based storage (required)
    pub project_path: String,
}

// ============================================================================
// Response Types
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageResponse {
    pub user_message: ChatMessage,
    pub assistant_message: ChatMessage,
}

/// Result of exporting a PRD chat session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub prd: PRDDocument,
    /// Session ID if tasks were created (for navigation to Tasks page)
    pub session_id: Option<String>,
    /// Number of tasks created from the PRD
    pub task_count: usize,
}
