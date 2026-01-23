//! GSD workflow configuration
//!
//! Configuration options for the GSD PRD generation workflow.

use crate::models::AgentType;
use serde::{Deserialize, Serialize};

/// Configuration for the GSD workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GsdConfig {
    /// Agent type to use for research (default: claude)
    pub research_agent_type: String,

    /// Model to use for research agents
    pub research_model: Option<String>,

    /// Maximum number of research agents to run in parallel
    pub max_parallel_research: u32,

    /// Timeout for each research agent in seconds
    pub research_timeout_secs: u64,

    /// Whether to auto-advance after each phase
    pub auto_advance: bool,

    /// Minimum context items required before allowing proceed (0-4)
    pub min_context_items: u8,

    /// Whether to include codebase analysis in research
    pub include_codebase_analysis: bool,

    /// Custom prompts for research agents
    pub custom_prompts: Option<GsdCustomPrompts>,
}

impl Default for GsdConfig {
    fn default() -> Self {
        Self {
            research_agent_type: "claude".to_string(),
            research_model: None,
            max_parallel_research: 4,
            research_timeout_secs: 300, // 5 minutes
            auto_advance: false,
            min_context_items: 3,
            include_codebase_analysis: true,
            custom_prompts: None,
        }
    }
}

impl GsdConfig {
    /// Parse the research_agent_type string into an AgentType
    pub fn get_agent_type(&self) -> AgentType {
        self.research_agent_type
            .parse()
            .unwrap_or_default()
    }
}

/// Get all available agent types as strings
pub fn all_agent_type_strings() -> Vec<&'static str> {
    AgentType::all().iter().map(|t| t.as_str()).collect()
}

/// Custom prompts for GSD workflow phases
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GsdCustomPrompts {
    /// Custom prompt for deep questioning phase (discovery coach)
    pub deep_questioning: Option<String>,
    /// Custom prompt for architecture research
    pub architecture: Option<String>,
    /// Custom prompt for codebase analysis
    pub codebase: Option<String>,
    /// Custom prompt for best practices research
    pub best_practices: Option<String>,
    /// Custom prompt for risks research
    pub risks: Option<String>,
}

/// Research agent type for parallel research
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResearchAgentType {
    /// Architecture and design patterns
    Architecture,
    /// Existing codebase analysis
    Codebase,
    /// Industry best practices
    BestPractices,
    /// Risks and challenges
    Risks,
}

impl ResearchAgentType {
    /// Get all research agent types
    pub fn all() -> &'static [ResearchAgentType] {
        &[
            ResearchAgentType::Architecture,
            ResearchAgentType::Codebase,
            ResearchAgentType::BestPractices,
            ResearchAgentType::Risks,
        ]
    }

    /// Get the display name for this agent type
    pub fn display_name(&self) -> &'static str {
        match self {
            ResearchAgentType::Architecture => "Architecture Research",
            ResearchAgentType::Codebase => "Codebase Analysis",
            ResearchAgentType::BestPractices => "Best Practices",
            ResearchAgentType::Risks => "Risks & Challenges",
        }
    }

    /// Get the output filename for this agent type
    pub fn output_filename(&self) -> &'static str {
        match self {
            ResearchAgentType::Architecture => "architecture.md",
            ResearchAgentType::Codebase => "codebase.md",
            ResearchAgentType::BestPractices => "best_practices.md",
            ResearchAgentType::Risks => "risks.md",
        }
    }
}

/// Requirement category for organizing features
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequirementCategory {
    /// Core functionality
    Core,
    /// User interface
    Ui,
    /// Data and storage
    Data,
    /// Integration with external services
    Integration,
    /// Security features
    Security,
    /// Performance requirements
    Performance,
    /// Testing requirements
    Testing,
    /// Documentation
    Documentation,
    /// Other/misc
    Other,
}

impl RequirementCategory {
    /// Get the prefix for REQ-IDs in this category
    pub fn prefix(&self) -> &'static str {
        match self {
            RequirementCategory::Core => "CORE",
            RequirementCategory::Ui => "UI",
            RequirementCategory::Data => "DATA",
            RequirementCategory::Integration => "INT",
            RequirementCategory::Security => "SEC",
            RequirementCategory::Performance => "PERF",
            RequirementCategory::Testing => "TEST",
            RequirementCategory::Documentation => "DOC",
            RequirementCategory::Other => "OTHER",
        }
    }

    /// Get the display name for this category
    pub fn display_name(&self) -> &'static str {
        match self {
            RequirementCategory::Core => "Core Functionality",
            RequirementCategory::Ui => "User Interface",
            RequirementCategory::Data => "Data & Storage",
            RequirementCategory::Integration => "Integrations",
            RequirementCategory::Security => "Security",
            RequirementCategory::Performance => "Performance",
            RequirementCategory::Testing => "Testing",
            RequirementCategory::Documentation => "Documentation",
            RequirementCategory::Other => "Other",
        }
    }

    /// Parse from string prefix
    pub fn from_prefix(prefix: &str) -> Option<Self> {
        match prefix.to_uppercase().as_str() {
            "CORE" => Some(RequirementCategory::Core),
            "UI" => Some(RequirementCategory::Ui),
            "DATA" => Some(RequirementCategory::Data),
            "INT" => Some(RequirementCategory::Integration),
            "SEC" => Some(RequirementCategory::Security),
            "PERF" => Some(RequirementCategory::Performance),
            "TEST" => Some(RequirementCategory::Testing),
            "DOC" => Some(RequirementCategory::Documentation),
            "OTHER" => Some(RequirementCategory::Other),
            _ => None,
        }
    }
}

/// Scope level for requirements
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScopeLevel {
    /// Must have for v1
    V1,
    /// Nice to have for v2
    V2,
    /// Explicitly out of scope
    OutOfScope,
    /// Not yet categorized
    Unscoped,
}

impl ScopeLevel {
    /// Get the display name for this scope level
    pub fn display_name(&self) -> &'static str {
        match self {
            ScopeLevel::V1 => "V1 (Must Have)",
            ScopeLevel::V2 => "V2 (Nice to Have)",
            ScopeLevel::OutOfScope => "Out of Scope",
            ScopeLevel::Unscoped => "Not Yet Scoped",
        }
    }
}

impl Default for ScopeLevel {
    fn default() -> Self {
        ScopeLevel::Unscoped
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_config() {
        let config = GsdConfig::default();
        assert_eq!(config.research_agent_type, "claude");
        assert_eq!(config.max_parallel_research, 4);
        assert!(!config.auto_advance);
    }

    #[test]
    fn test_research_agent_types() {
        let types = ResearchAgentType::all();
        assert_eq!(types.len(), 4);

        assert_eq!(
            ResearchAgentType::Architecture.output_filename(),
            "architecture.md"
        );
    }

    #[test]
    fn test_requirement_category_prefix() {
        assert_eq!(RequirementCategory::Core.prefix(), "CORE");
        assert_eq!(RequirementCategory::Ui.prefix(), "UI");
        assert_eq!(
            RequirementCategory::from_prefix("CORE"),
            Some(RequirementCategory::Core)
        );
        assert_eq!(RequirementCategory::from_prefix("invalid"), None);
    }

    #[test]
    fn test_scope_level_default() {
        let scope: ScopeLevel = Default::default();
        assert_eq!(scope, ScopeLevel::Unscoped);
    }
}
