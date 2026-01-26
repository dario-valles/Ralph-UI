// PRD Chat Models - Canonical type definitions for chat sessions and messages

use serde::{Deserialize, Serialize};

// ============================================================================
// Attachment Types
// ============================================================================

/// Supported MIME types for chat attachments
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AttachmentMimeType {
    #[serde(rename = "image/png")]
    ImagePng,
    #[serde(rename = "image/jpeg")]
    ImageJpeg,
    #[serde(rename = "image/gif")]
    ImageGif,
    #[serde(rename = "image/webp")]
    ImageWebp,
}

impl AttachmentMimeType {
    pub fn as_str(&self) -> &'static str {
        match self {
            AttachmentMimeType::ImagePng => "image/png",
            AttachmentMimeType::ImageJpeg => "image/jpeg",
            AttachmentMimeType::ImageGif => "image/gif",
            AttachmentMimeType::ImageWebp => "image/webp",
        }
    }

    /// Get file extension for this MIME type
    pub fn extension(&self) -> &'static str {
        match self {
            AttachmentMimeType::ImagePng => "png",
            AttachmentMimeType::ImageJpeg => "jpg",
            AttachmentMimeType::ImageGif => "gif",
            AttachmentMimeType::ImageWebp => "webp",
        }
    }
}

impl std::fmt::Display for AttachmentMimeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for AttachmentMimeType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "image/png" => Ok(AttachmentMimeType::ImagePng),
            "image/jpeg" | "image/jpg" => Ok(AttachmentMimeType::ImageJpeg),
            "image/gif" => Ok(AttachmentMimeType::ImageGif),
            "image/webp" => Ok(AttachmentMimeType::ImageWebp),
            _ => Err(format!(
                "Invalid attachment MIME type: '{}'. Expected 'image/png', 'image/jpeg', 'image/gif', or 'image/webp'",
                s
            )),
        }
    }
}

/// An attachment (image) in a chat message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatAttachment {
    /// Unique identifier for the attachment
    pub id: String,
    /// MIME type of the attachment
    pub mime_type: AttachmentMimeType,
    /// Base64-encoded data (without data URL prefix)
    pub data: String,
    /// Original filename (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename: Option<String>,
    /// Size in bytes
    pub size: u64,
    /// Image width in pixels (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    /// Image height in pixels (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

/// Validation constants for attachments
pub mod attachment_limits {
    /// Maximum file size per attachment (10 MB)
    pub const MAX_ATTACHMENT_SIZE: u64 = 10 * 1024 * 1024;
    /// Maximum number of attachments per message
    pub const MAX_ATTACHMENTS_PER_MESSAGE: usize = 5;
}

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
            _ => Err(format!(
                "Invalid message role: '{}'. Expected 'user', 'assistant', or 'system'",
                s
            )),
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
    /// Type of PRD being created (new_feature, bug_fix, etc.)
    pub prd_type: Option<String>,
    /// Whether guided interview mode is enabled
    pub guided_mode: bool,
    /// Latest quality score (0-100)
    pub quality_score: Option<i32>,
    /// Template ID if using a template
    pub template_id: Option<String>,
    /// Whether structured output mode is enabled
    pub structured_mode: bool,
    /// Extracted PRD structure (JSON-serialized ExtractedPRDStructure)
    pub extracted_structure: Option<String>,
    /// Whether GSD (Get Stuff Done) workflow mode is enabled
    #[serde(default)]
    pub gsd_mode: bool,
    /// GSD workflow state (JSON-serialized GsdWorkflowState)
    #[serde(default)]
    pub gsd_state: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_deserializing)]
    pub message_count: Option<i32>,
    /// Timestamp when a pending operation (agent execution) started
    /// Used to restore "thinking" state after page reload
    #[serde(default)]
    pub pending_operation_started_at: Option<String>,
    /// External session ID for CLI agent session resumption
    /// This allows resuming agent sessions without resending full history
    #[serde(default)]
    pub external_session_id: Option<String>,
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
    /// Optional attachments (images) for this message
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<ChatAttachment>>,
}

// ============================================================================
// PRD Type Enum
// ============================================================================

/// Enum for PRD types to guide the interview flow
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PRDType {
    NewFeature,
    BugFix,
    Refactoring,
    ApiIntegration,
    General,
    FullNewApp,
}

impl PRDType {
    pub fn as_str(&self) -> &'static str {
        match self {
            PRDType::NewFeature => "new_feature",
            PRDType::BugFix => "bug_fix",
            PRDType::Refactoring => "refactoring",
            PRDType::ApiIntegration => "api_integration",
            PRDType::General => "general",
            PRDType::FullNewApp => "full_new_app",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            PRDType::NewFeature => "New Feature",
            PRDType::BugFix => "Bug Fix",
            PRDType::Refactoring => "Refactoring",
            PRDType::ApiIntegration => "API Integration",
            PRDType::General => "General",
            PRDType::FullNewApp => "Full New App",
        }
    }
}

impl std::fmt::Display for PRDType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for PRDType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().replace('-', "_").as_str() {
            "new_feature" | "newfeature" => Ok(PRDType::NewFeature),
            "bug_fix" | "bugfix" => Ok(PRDType::BugFix),
            "refactoring" => Ok(PRDType::Refactoring),
            "api_integration" | "apiintegration" => Ok(PRDType::ApiIntegration),
            "general" => Ok(PRDType::General),
            "full_new_app" | "fullnewapp" => Ok(PRDType::FullNewApp),
            _ => Err(format!("Invalid PRD type: '{}'. Expected 'new_feature', 'bug_fix', 'refactoring', 'api_integration', 'general', or 'full_new_app'", s)),
        }
    }
}

// ============================================================================
// Quality Assessment Types
// ============================================================================

/// Quality assessment scores for a PRD chat session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityAssessment {
    /// Completeness score (0-100)
    pub completeness: u8,
    /// Clarity score (0-100)
    pub clarity: u8,
    /// Actionability score (0-100)
    pub actionability: u8,
    /// Overall quality score (0-100)
    pub overall: u8,
    /// List of missing sections that need to be filled
    pub missing_sections: Vec<String>,
    /// Suggestions for improving the PRD
    pub suggestions: Vec<String>,
    /// Whether the PRD is ready for export
    pub ready_for_export: bool,
}

impl Default for QualityAssessment {
    fn default() -> Self {
        Self {
            completeness: 0,
            clarity: 0,
            actionability: 0,
            overall: 0,
            missing_sections: vec![],
            suggestions: vec![],
            ready_for_export: false,
        }
    }
}

// ============================================================================
// Guided Question Types
// ============================================================================

/// Type of input expected for a guided question
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuestionType {
    MultipleChoice,
    FreeText,
    Confirmation,
}

/// A guided question for structured PRD interview flow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GuidedQuestion {
    /// Unique identifier for the question
    pub id: String,
    /// The question text to display
    pub question: String,
    /// Type of input expected
    pub question_type: QuestionType,
    /// Options for multiple choice questions
    pub options: Option<Vec<String>>,
    /// Whether this question is required
    pub required: bool,
    /// Hint or helper text
    pub hint: Option<String>,
}

/// Extracted content from chat for PRD generation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedPRDContent {
    /// Problem statement / Overview
    pub overview: String,
    /// User stories extracted from conversation
    pub user_stories: Vec<String>,
    /// Functional requirements
    pub functional_requirements: Vec<String>,
    /// Non-functional requirements
    pub non_functional_requirements: Vec<String>,
    /// Technical constraints
    pub technical_constraints: Vec<String>,
    /// Success metrics
    pub success_metrics: Vec<String>,
    /// Tasks to implement
    pub tasks: Vec<String>,
    /// Acceptance criteria
    pub acceptance_criteria: Vec<String>,
    /// Out of scope items
    pub out_of_scope: Vec<String>,
}
