// PRD Chat request/response types

use crate::models::{attachment_limits, ChatAttachment, ChatMessage};
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
    /// Whether to use GSD workflow mode
    pub gsd_mode: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub session_id: String,
    pub content: String,
    /// Project path for file-based storage (required)
    pub project_path: String,
    /// Optional image attachments
    #[serde(default)]
    pub attachments: Option<Vec<ChatAttachment>>,
}

impl SendMessageRequest {
    /// Validate the request, including attachment constraints
    pub fn validate(&self) -> Result<(), String> {
        if let Some(attachments) = &self.attachments {
            // Check max attachments count
            if attachments.len() > attachment_limits::MAX_ATTACHMENTS_PER_MESSAGE {
                return Err(format!(
                    "Too many attachments: {} (max {})",
                    attachments.len(),
                    attachment_limits::MAX_ATTACHMENTS_PER_MESSAGE
                ));
            }

            // Check each attachment size
            for (i, attachment) in attachments.iter().enumerate() {
                if attachment.size > attachment_limits::MAX_ATTACHMENT_SIZE {
                    return Err(format!(
                        "Attachment {} is too large: {} bytes (max {} bytes)",
                        i + 1,
                        attachment.size,
                        attachment_limits::MAX_ATTACHMENT_SIZE
                    ));
                }
            }
        }

        Ok(())
    }
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
