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
    /// Discovery phase progress tracking
    #[serde(default)]
    pub discovery_progress: Option<DiscoveryProgress>,
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
// Specific Quality Check Types
// ============================================================================

/// Severity level for quality check issues
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum QualityCheckSeverity {
    Error,
    Warning,
    Info,
}

/// A specific quality check issue found in PRD content
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityCheck {
    /// Unique identifier for this check type (e.g., "vague-language", "missing-acceptance-criteria")
    pub id: String,
    /// Human-readable name for the check
    pub name: String,
    /// Severity level (error, warning, info)
    pub severity: QualityCheckSeverity,
    /// Specific message describing the issue
    pub message: String,
    /// Location reference (line number, section name, or specific text)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
    /// The specific text that triggered this check (for highlighting)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_text: Option<String>,
    /// Suggested fix or improvement
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
}

/// Extended quality assessment with specific checks
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DetailedQualityAssessment {
    /// Base quality assessment (backwards compatible)
    #[serde(flatten)]
    pub base: QualityAssessment,
    /// Specific quality checks performed
    pub quality_checks: Vec<QualityCheck>,
    /// Summary counts by severity
    pub error_count: usize,
    pub warning_count: usize,
    pub info_count: usize,
}

impl Default for DetailedQualityAssessment {
    fn default() -> Self {
        Self {
            base: QualityAssessment::default(),
            quality_checks: vec![],
            error_count: 0,
            warning_count: 0,
            info_count: 0,
        }
    }
}

// ============================================================================
// Discovery Progress Types
// ============================================================================

/// Tracks which discovery areas have been covered in the conversation
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryProgress {
    /// WHAT - Problem statement / core idea has been discussed
    pub problem_covered: bool,
    /// WHO - Target users have been identified
    pub users_covered: bool,
    /// WHY - Motivation / value proposition is clear
    pub motivation_covered: bool,
    /// DONE - Success criteria have been defined
    pub success_covered: bool,
    /// TECH - Technical constraints have been discussed (optional for quick PRDs)
    pub tech_covered: bool,
    /// SCOPE - Boundaries / out-of-scope items defined (optional)
    pub scope_covered: bool,
    /// Summary of what's been gathered so far
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<DiscoverySummary>,
}

/// Summary of discovered requirements
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoverySummary {
    /// Summarized "what" from the conversation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub what: Option<String>,
    /// Summarized "who" (target users)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub who: Option<String>,
    /// Summarized "why" (motivation)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub why: Option<String>,
    /// Summarized "done" (success criteria)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub done: Option<String>,
}

impl DiscoveryProgress {
    /// Returns true if the minimum required areas are covered
    /// (problem, users, motivation, success)
    pub fn is_ready_for_prd(&self) -> bool {
        self.problem_covered
            && self.users_covered
            && self.motivation_covered
            && self.success_covered
    }

    /// Returns the completion percentage (0-100)
    pub fn completion_percentage(&self) -> u8 {
        let required_covered = [
            self.problem_covered,
            self.users_covered,
            self.motivation_covered,
            self.success_covered,
        ]
        .iter()
        .filter(|&&x| x)
        .count();

        let optional_covered = [self.tech_covered, self.scope_covered]
            .iter()
            .filter(|&&x| x)
            .count();

        // Required areas count for 80%, optional for 20%
        let required_pct = (required_covered as f32 / 4.0) * 80.0;
        let optional_pct = (optional_covered as f32 / 2.0) * 20.0;

        (required_pct + optional_pct) as u8
    }

    /// Returns list of uncovered areas that still need discussion
    pub fn uncovered_areas(&self) -> Vec<&'static str> {
        let mut areas = vec![];
        if !self.problem_covered {
            areas.push("Problem Statement (WHAT)");
        }
        if !self.users_covered {
            areas.push("Target Users (WHO)");
        }
        if !self.motivation_covered {
            areas.push("Value Proposition (WHY)");
        }
        if !self.success_covered {
            areas.push("Success Criteria (DONE)");
        }
        if !self.tech_covered {
            areas.push("Technical Constraints (optional)");
        }
        if !self.scope_covered {
            areas.push("Scope Boundaries (optional)");
        }
        areas
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

// ============================================================================
// Enhanced Quality Check Types (13-Check System)
// ============================================================================

/// A single quality check result with pass/fail status and scoring
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnhancedQualityCheck {
    /// Unique identifier for this check (e.g., "executive_summary", "smart_goals")
    pub id: String,
    /// Human-readable name for the check
    pub name: String,
    /// Whether this check passed
    pub passed: bool,
    /// Points earned for this check (0 if failed, max_score if passed)
    pub score: u8,
    /// Maximum points possible for this check
    pub max_score: u8,
    /// Result message (success or failure description)
    pub message: String,
    /// Suggested fix if the check failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub suggestion: Option<String>,
    /// Location in the PRD where the issue was found
    #[serde(skip_serializing_if = "Option::is_none")]
    pub location: Option<String>,
}

/// A warning about vague language that should be made specific
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VagueLanguageWarning {
    /// The vague term found (e.g., "fast", "secure")
    pub term: String,
    /// Location in the PRD (section name or line excerpt)
    pub location: String,
    /// Specific replacement suggestion
    pub suggestion: String,
}

/// Quality grade based on total score
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum QualityGrade {
    Excellent,  // 90-100%
    Good,       // 75-89%
    Acceptable, // 60-74%
    NeedsWork,  // < 60%
}

impl QualityGrade {
    pub fn from_percentage(pct: u8) -> Self {
        match pct {
            90..=100 => QualityGrade::Excellent,
            75..=89 => QualityGrade::Good,
            60..=74 => QualityGrade::Acceptable,
            _ => QualityGrade::NeedsWork,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            QualityGrade::Excellent => "EXCELLENT",
            QualityGrade::Good => "GOOD",
            QualityGrade::Acceptable => "ACCEPTABLE",
            QualityGrade::NeedsWork => "NEEDS_WORK",
        }
    }
}

/// Comprehensive quality report with 13 checks and vague language detection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnhancedQualityReport {
    /// Individual quality check results
    pub checks: Vec<EnhancedQualityCheck>,
    /// Vague language warnings
    pub vague_warnings: Vec<VagueLanguageWarning>,
    /// Total score earned across all checks
    pub total_score: u8,
    /// Maximum possible score
    pub max_score: u8,
    /// Score as percentage (0-100)
    pub percentage: u8,
    /// Quality grade based on percentage
    pub grade: QualityGrade,
    /// Number of checks that passed
    pub passed_count: u8,
    /// Total number of checks
    pub total_checks: u8,
    /// Whether the PRD is ready for export (grade >= Acceptable and no critical failures)
    pub ready_for_export: bool,
    /// Summary of issues to fix
    pub summary: String,
}

impl Default for EnhancedQualityReport {
    fn default() -> Self {
        Self {
            checks: vec![],
            vague_warnings: vec![],
            total_score: 0,
            max_score: 0,
            percentage: 0,
            grade: QualityGrade::NeedsWork,
            passed_count: 0,
            total_checks: 0,
            ready_for_export: false,
            summary: "No quality checks performed yet".to_string(),
        }
    }
}

// ============================================================================
// Unified Quality Report (Consolidates Basic + Enhanced)
// ============================================================================

/// Unified quality report that combines the 13-check system with 3D dimension scores.
/// This consolidates the previous separate Basic (QualityAssessment) and Enhanced
/// (EnhancedQualityReport) systems into a single comprehensive report.
///
/// The 3D dimension scores are derived from the 13 checks:
/// - Completeness: Checks #1, #5, #6, #10, #13 (content coverage)
/// - Clarity: Checks #2, #3, #4, #8 (communication quality)
/// - Actionability: Checks #7, #9, #11, #12 (execution readiness)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UnifiedQualityReport {
    // === 13-Point Checklist ===
    /// Individual quality check results
    pub checks: Vec<EnhancedQualityCheck>,
    /// Number of checks that passed
    pub passed_count: u8,
    /// Total number of checks
    pub total_checks: u8,

    // === 3D Dimension Scores (derived from checks) ===
    /// Completeness score (0-100) - from checks #1, #5, #6, #10, #13
    pub completeness: u8,
    /// Clarity score (0-100) - from checks #2, #3, #4, #8
    pub clarity: u8,
    /// Actionability score (0-100) - from checks #7, #9, #11, #12
    pub actionability: u8,
    /// Overall quality score (0-100)
    pub overall: u8,

    // === Issue Detection ===
    /// Vague language warnings
    pub vague_warnings: Vec<VagueLanguageWarning>,
    /// List of missing sections (kept for backwards compat with QualityAssessment)
    pub missing_sections: Vec<String>,

    // === Summary ===
    /// Quality grade based on overall percentage
    pub grade: QualityGrade,
    /// Whether the PRD is ready for export
    pub ready_for_export: bool,
    /// Summary of quality assessment
    pub summary: String,
    /// Suggestions for improving the PRD
    pub suggestions: Vec<String>,
}

impl Default for UnifiedQualityReport {
    fn default() -> Self {
        Self {
            checks: vec![],
            passed_count: 0,
            total_checks: 0,
            completeness: 0,
            clarity: 0,
            actionability: 0,
            overall: 0,
            vague_warnings: vec![],
            missing_sections: vec![],
            grade: QualityGrade::NeedsWork,
            ready_for_export: false,
            summary: "No quality checks performed yet".to_string(),
            suggestions: vec![],
        }
    }
}

impl UnifiedQualityReport {
    /// Convert to the legacy QualityAssessment for backwards compatibility
    pub fn to_quality_assessment(&self) -> QualityAssessment {
        QualityAssessment {
            completeness: self.completeness,
            clarity: self.clarity,
            actionability: self.actionability,
            overall: self.overall,
            missing_sections: self.missing_sections.clone(),
            suggestions: self.suggestions.clone(),
            ready_for_export: self.ready_for_export,
        }
    }
}

// ============================================================================
// Structured Discovery Question Types
// ============================================================================

/// Category for discovery questions
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DiscoveryCategory {
    /// Essential questions (problem, users, solution, metrics, constraints)
    Essential,
    /// Technical questions (codebase, stack, integrations, performance)
    Technical,
    /// Implementation questions (complexity, timeline, approach)
    Implementation,
}

impl DiscoveryCategory {
    pub fn as_str(&self) -> &'static str {
        match self {
            DiscoveryCategory::Essential => "essential",
            DiscoveryCategory::Technical => "technical",
            DiscoveryCategory::Implementation => "implementation",
        }
    }

    pub fn display_name(&self) -> &'static str {
        match self {
            DiscoveryCategory::Essential => "Essential",
            DiscoveryCategory::Technical => "Technical",
            DiscoveryCategory::Implementation => "Implementation",
        }
    }
}

/// A structured discovery question with category and follow-up hint
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveryQuestion {
    /// Unique identifier for the question
    pub id: String,
    /// Category of the question
    pub category: DiscoveryCategory,
    /// The question text
    pub question: String,
    /// Hint for follow-up probing
    pub follow_up_hint: String,
    /// Whether this question is required for PRD readiness
    pub required: bool,
}

/// Get all structured discovery questions (12 questions across 3 categories)
pub fn get_discovery_questions() -> Vec<DiscoveryQuestion> {
    vec![
        // Essential Questions (5) - Required for PRD readiness
        DiscoveryQuestion {
            id: "problem".to_string(),
            category: DiscoveryCategory::Essential,
            question:
                "What problem does this solve? What's the user pain point or business impact?"
                    .to_string(),
            follow_up_hint:
                "Dig deeper: How severe is this problem? How often do users encounter it?"
                    .to_string(),
            required: true,
        },
        DiscoveryQuestion {
            id: "users".to_string(),
            category: DiscoveryCategory::Essential,
            question: "Who is the target user or audience? Be specific about the persona."
                .to_string(),
            follow_up_hint: "Clarify: What's their role? Technical level? How many users?"
                .to_string(),
            required: true,
        },
        DiscoveryQuestion {
            id: "solution".to_string(),
            category: DiscoveryCategory::Essential,
            question: "What is the proposed solution or feature? Describe the core functionality."
                .to_string(),
            follow_up_hint: "Explore: What's the main workflow? Key interactions?".to_string(),
            required: true,
        },
        DiscoveryQuestion {
            id: "metrics".to_string(),
            category: DiscoveryCategory::Essential,
            question: "What are the key success metrics? How will you measure success?".to_string(),
            follow_up_hint: "Be specific: What numbers? What baseline? What target?".to_string(),
            required: true,
        },
        DiscoveryQuestion {
            id: "constraints".to_string(),
            category: DiscoveryCategory::Essential,
            question: "What constraints exist? (technical, timeline, budget, resources)"
                .to_string(),
            follow_up_hint: "Consider: Hard deadlines? Team size? Technical limitations?"
                .to_string(),
            required: true,
        },
        // Technical Questions (4) - Important for implementation clarity
        DiscoveryQuestion {
            id: "codebase".to_string(),
            category: DiscoveryCategory::Technical,
            question: "Is this for an existing codebase or a greenfield project?".to_string(),
            follow_up_hint: "If existing: What patterns are already established?".to_string(),
            required: false,
        },
        DiscoveryQuestion {
            id: "stack".to_string(),
            category: DiscoveryCategory::Technical,
            question: "What technology stack will be used? (languages, frameworks, databases)"
                .to_string(),
            follow_up_hint: "Any preferences or constraints on technology choices?".to_string(),
            required: false,
        },
        DiscoveryQuestion {
            id: "integrations".to_string(),
            category: DiscoveryCategory::Technical,
            question: "Any integration requirements? (third-party APIs, internal systems)"
                .to_string(),
            follow_up_hint: "Consider: Auth systems, data sources, external services".to_string(),
            required: false,
        },
        DiscoveryQuestion {
            id: "performance".to_string(),
            category: DiscoveryCategory::Technical,
            question: "What are the performance/scale requirements? (users, data volume, latency)"
                .to_string(),
            follow_up_hint: "Be specific: Concurrent users? Requests/second? Response time?"
                .to_string(),
            required: false,
        },
        // Implementation Questions (3) - Helpful for planning
        DiscoveryQuestion {
            id: "complexity".to_string(),
            category: DiscoveryCategory::Implementation,
            question:
                "What's the estimated complexity? (simple feature, typical project, complex system)"
                    .to_string(),
            follow_up_hint: "Consider: Number of components, integrations, unknowns".to_string(),
            required: false,
        },
        DiscoveryQuestion {
            id: "timeline".to_string(),
            category: DiscoveryCategory::Implementation,
            question: "What are the timeline expectations? Any hard deadlines?".to_string(),
            follow_up_hint: "Phases: MVP deadline? Full feature deadline?".to_string(),
            required: false,
        },
        DiscoveryQuestion {
            id: "other".to_string(),
            category: DiscoveryCategory::Implementation,
            question: "Anything else I should know? (edge cases, constraints, context)".to_string(),
            follow_up_hint: "Think about: What could go wrong? What's been tried before?"
                .to_string(),
            required: false,
        },
    ]
}
