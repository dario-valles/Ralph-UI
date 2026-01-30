// Project Context Models - Types for project-level context files
//
// Context files provide AI agents with consistent understanding of a project's
// product vision, tech stack, conventions, and workflow preferences.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

// ============================================================================
// Context Mode
// ============================================================================

/// Mode for context file organization
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum ContextMode {
    /// Single context.md file for simple projects
    #[default]
    Single,
    /// Multiple files (product.md, tech-stack.md, etc.) for complex projects
    Multi,
}

impl ContextMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            ContextMode::Single => "single",
            ContextMode::Multi => "multi",
        }
    }
}

impl std::fmt::Display for ContextMode {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl std::str::FromStr for ContextMode {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "single" => Ok(ContextMode::Single),
            "multi" => Ok(ContextMode::Multi),
            _ => Err(format!(
                "Invalid context mode: '{}'. Expected 'single' or 'multi'",
                s
            )),
        }
    }
}

// ============================================================================
// Context Configuration
// ============================================================================

/// Configuration for context injection behavior
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextConfig {
    /// Whether context injection is enabled
    pub enabled: bool,
    /// Organization mode (single file vs multiple files)
    pub mode: ContextMode,
    /// Include context in PRD Chat prompts
    pub include_in_prd_chat: bool,
    /// Include context in Ralph Loop prompts
    pub include_in_ralph_loop: bool,
    /// List of enabled context files (for multi-file mode)
    /// Values: "product", "tech-stack", "workflow", "conventions"
    #[serde(default)]
    pub enabled_files: Vec<String>,
    /// When context was last updated
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_updated: Option<DateTime<Utc>>,
}

impl Default for ContextConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            mode: ContextMode::Single,
            include_in_prd_chat: true,
            include_in_ralph_loop: true,
            enabled_files: vec![
                "product".to_string(),
                "tech-stack".to_string(),
                "workflow".to_string(),
                "conventions".to_string(),
            ],
            last_updated: None,
        }
    }
}

// ============================================================================
// Context File Types
// ============================================================================

/// Names of supported multi-file context files
pub const CONTEXT_FILE_NAMES: &[&str] = &["product", "tech-stack", "workflow", "conventions"];

/// A single context file with its content
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextFile {
    /// File name (without .md extension)
    pub name: String,
    /// File content (markdown)
    pub content: String,
    /// When file was last modified
    pub updated_at: DateTime<Utc>,
    /// Estimated token count for this file
    pub token_count: u32,
}

/// Complete project context state
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectContext {
    /// Configuration for context behavior
    pub config: ContextConfig,
    /// Context files (single "context" or multiple files depending on mode)
    pub files: Vec<ContextFile>,
    /// Whether user has dismissed the setup prompt
    pub setup_dismissed: bool,
}

impl Default for ProjectContext {
    fn default() -> Self {
        Self {
            config: ContextConfig::default(),
            files: vec![],
            setup_dismissed: false,
        }
    }
}

impl ProjectContext {
    /// Check if context has been configured (has any files)
    pub fn is_configured(&self) -> bool {
        !self.files.is_empty()
    }

    /// Get total token count across all files
    pub fn total_token_count(&self) -> u32 {
        self.files.iter().map(|f| f.token_count).sum()
    }

    /// Get combined content for prompt injection
    pub fn get_combined_content(&self) -> String {
        if !self.config.enabled {
            return String::new();
        }

        match self.config.mode {
            ContextMode::Single => {
                // Return content of context.md if it exists
                self.files
                    .iter()
                    .find(|f| f.name == "context")
                    .map(|f| f.content.clone())
                    .unwrap_or_default()
            }
            ContextMode::Multi => {
                // Combine enabled files with section headers
                let mut combined = String::new();
                for file in &self.files {
                    if self.config.enabled_files.contains(&file.name) {
                        if !combined.is_empty() {
                            combined.push_str("\n\n");
                        }
                        combined.push_str(&format!("## {}\n\n", capitalize_name(&file.name)));
                        combined.push_str(&file.content);
                    }
                }
                combined
            }
        }
    }
}

/// Capitalize a file name for display (e.g., "tech-stack" -> "Tech Stack")
fn capitalize_name(name: &str) -> String {
    name.split('-')
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().chain(chars).collect(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

// ============================================================================
// Project Analysis Types (for Context Chat)
// ============================================================================

/// Detected tech stack information from project files
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TechStackInfo {
    /// Primary programming languages
    pub languages: Vec<String>,
    /// Frameworks detected
    pub frameworks: Vec<String>,
    /// Key dependencies (top ~15)
    pub dependencies: Vec<DependencyInfo>,
    /// Build/dev tools
    pub tools: Vec<String>,
    /// Package manager used
    pub package_manager: Option<String>,
}

/// Information about a detected dependency
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyInfo {
    /// Package name
    pub name: String,
    /// Version (if detected)
    pub version: Option<String>,
    /// Category (framework, testing, tooling, etc.)
    pub category: String,
    /// Whether it's a dev dependency
    pub is_dev: bool,
}

/// Analysis of project structure for context generation
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectAnalysis {
    /// Summary extracted from CLAUDE.md if present
    pub claude_md_summary: Option<String>,
    /// Detected tech stack from package.json, Cargo.toml, etc.
    pub detected_stack: TechStackInfo,
    /// Summary of key directory structure
    pub file_structure_summary: String,
    /// Existing context content (if updating)
    pub existing_context: Option<String>,
    /// Whether CLAUDE.md exists (for import suggestion)
    pub has_claude_md: bool,
    /// Project name (from package.json, Cargo.toml, or directory)
    pub project_name: Option<String>,
}

// ============================================================================
// Context Chat Session
// ============================================================================

/// A chat session specifically for context generation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextChatSession {
    /// Unique session ID
    pub id: String,
    /// Project path this context is for
    pub project_path: String,
    /// Agent type being used
    pub agent_type: String,
    /// Project analysis performed at session start
    pub analysis: ProjectAnalysis,
    /// Extracted context content (from <context> blocks in AI responses)
    pub extracted_context: Option<String>,
    /// Whether context has been saved
    pub context_saved: bool,
    /// Session creation time
    pub created_at: DateTime<Utc>,
    /// Last update time
    pub updated_at: DateTime<Utc>,
    /// Number of messages in the session
    pub message_count: i32,
    /// External session ID for CLI agent session resumption
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_session_id: Option<String>,
}

/// A message in a context chat session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextChatMessage {
    /// Unique message ID
    pub id: String,
    /// Session this message belongs to
    pub session_id: String,
    /// Message role (user/assistant/system)
    pub role: crate::models::prd_chat::MessageRole,
    /// Message content
    pub content: String,
    /// When message was created
    pub created_at: DateTime<Utc>,
}

// ============================================================================
// Constants
// ============================================================================

/// Maximum size for a single context file (2KB to keep prompts manageable)
pub const MAX_CONTEXT_FILE_SIZE: usize = 2048;

/// Approximate tokens per character (rough estimate for display)
pub const TOKENS_PER_CHAR: f32 = 0.25;

/// Default template for single-file context
pub const DEFAULT_CONTEXT_TEMPLATE: &str = r#"# Project Context

## Product
<!-- What is this product? Who is it for? What problems does it solve? -->

## Tech Stack
<!-- Key technologies, frameworks, languages, architecture patterns -->

## Conventions
<!-- Coding style, naming conventions, file organization patterns -->

## Workflow
<!-- Development process preferences (TDD, PR requirements, etc.) -->
"#;

/// Estimate token count for content
pub fn estimate_tokens(content: &str) -> u32 {
    (content.len() as f32 * TOKENS_PER_CHAR) as u32
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_mode_serialization() {
        assert_eq!(ContextMode::Single.as_str(), "single");
        assert_eq!(ContextMode::Multi.as_str(), "multi");
    }

    #[test]
    fn test_context_mode_from_str() {
        assert_eq!(
            "single".parse::<ContextMode>().unwrap(),
            ContextMode::Single
        );
        assert_eq!("multi".parse::<ContextMode>().unwrap(), ContextMode::Multi);
        assert!("invalid".parse::<ContextMode>().is_err());
    }

    #[test]
    fn test_capitalize_name() {
        assert_eq!(capitalize_name("product"), "Product");
        assert_eq!(capitalize_name("tech-stack"), "Tech Stack");
        assert_eq!(capitalize_name("conventions"), "Conventions");
    }

    #[test]
    fn test_project_context_is_configured() {
        let mut context = ProjectContext::default();
        assert!(!context.is_configured());

        context.files.push(ContextFile {
            name: "context".to_string(),
            content: "# Test".to_string(),
            updated_at: Utc::now(),
            token_count: 10,
        });
        assert!(context.is_configured());
    }

    #[test]
    fn test_project_context_total_token_count() {
        let mut context = ProjectContext::default();
        context.files.push(ContextFile {
            name: "context".to_string(),
            content: "# Test".to_string(),
            updated_at: Utc::now(),
            token_count: 100,
        });
        context.files.push(ContextFile {
            name: "tech-stack".to_string(),
            content: "# Stack".to_string(),
            updated_at: Utc::now(),
            token_count: 50,
        });
        assert_eq!(context.total_token_count(), 150);
    }

    #[test]
    fn test_get_combined_content_single_mode() {
        let mut context = ProjectContext::default();
        context.config.mode = ContextMode::Single;
        context.files.push(ContextFile {
            name: "context".to_string(),
            content: "Single file content".to_string(),
            updated_at: Utc::now(),
            token_count: 10,
        });

        let combined = context.get_combined_content();
        assert_eq!(combined, "Single file content");
    }

    #[test]
    fn test_get_combined_content_multi_mode() {
        let mut context = ProjectContext::default();
        context.config.mode = ContextMode::Multi;
        context.config.enabled_files = vec!["product".to_string(), "tech-stack".to_string()];
        context.files.push(ContextFile {
            name: "product".to_string(),
            content: "Product info".to_string(),
            updated_at: Utc::now(),
            token_count: 10,
        });
        context.files.push(ContextFile {
            name: "tech-stack".to_string(),
            content: "Tech info".to_string(),
            updated_at: Utc::now(),
            token_count: 10,
        });

        let combined = context.get_combined_content();
        assert!(combined.contains("## Product"));
        assert!(combined.contains("Product info"));
        assert!(combined.contains("## Tech Stack"));
        assert!(combined.contains("Tech info"));
    }

    #[test]
    fn test_get_combined_content_disabled() {
        let mut context = ProjectContext::default();
        context.config.enabled = false;
        context.files.push(ContextFile {
            name: "context".to_string(),
            content: "Some content".to_string(),
            updated_at: Utc::now(),
            token_count: 10,
        });

        let combined = context.get_combined_content();
        assert!(combined.is_empty());
    }

    #[test]
    fn test_estimate_tokens() {
        // 100 characters should be approximately 25 tokens
        let content = "a".repeat(100);
        let tokens = estimate_tokens(&content);
        assert_eq!(tokens, 25);
    }

    #[test]
    fn test_default_context_config() {
        let config = ContextConfig::default();
        assert!(config.enabled);
        assert_eq!(config.mode, ContextMode::Single);
        assert!(config.include_in_prd_chat);
        assert!(config.include_in_ralph_loop);
        assert_eq!(config.enabled_files.len(), 4);
    }
}
