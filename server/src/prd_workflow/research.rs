//! Configurable research agents for PRD workflow
//!
//! This module provides data-driven research agent configuration.
//! Default agents are defined as data, not enum variants, making them
//! easy to modify at runtime or extend via configuration.

use serde::{Deserialize, Serialize};

/// Configuration for a single research agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchAgentConfig {
    /// Unique identifier for this agent
    pub id: String,
    /// Display name
    pub name: String,
    /// Description of what this agent researches
    pub description: String,
    /// Output filename (e.g., "architecture.md")
    pub output_filename: String,
    /// Template name for the agent's prompt
    pub template_name: String,
    /// Whether this agent is enabled
    pub enabled: bool,
    /// Whether this agent requires a codebase (skip for greenfield projects)
    pub requires_codebase: bool,
}

impl ResearchAgentConfig {
    /// Create a new research agent config
    pub fn new(
        id: impl Into<String>,
        name: impl Into<String>,
        description: impl Into<String>,
        output_filename: impl Into<String>,
        template_name: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            name: name.into(),
            description: description.into(),
            output_filename: output_filename.into(),
            template_name: template_name.into(),
            enabled: true,
            requires_codebase: false,
        }
    }

    /// Mark this agent as requiring a codebase
    pub fn with_requires_codebase(mut self) -> Self {
        self.requires_codebase = true;
        self
    }

    /// Disable this agent
    pub fn disabled(mut self) -> Self {
        self.enabled = false;
        self
    }
}

/// Get the default research agents
///
/// Returns a vector of pre-configured research agents:
/// - Architecture: Research architecture patterns and system design
/// - Codebase: Analyze existing codebase (requires existing code)
/// - Best Practices: Research industry best practices
/// - Risks: Identify potential risks and challenges
///
/// Note: The Ideas agent is not included by default as it's intended
/// for existing codebases and should be explicitly added.
pub fn default_research_agents() -> Vec<ResearchAgentConfig> {
    vec![
        ResearchAgentConfig::new(
            "architecture",
            "Architecture Research",
            "Research architecture patterns, system design, and technical approaches",
            "architecture.md",
            "research_architecture",
        ),
        ResearchAgentConfig::new(
            "codebase",
            "Codebase Analysis",
            "Analyze existing codebase structure, patterns, and conventions",
            "codebase.md",
            "research_codebase",
        )
        .with_requires_codebase(),
        ResearchAgentConfig::new(
            "best_practices",
            "Best Practices",
            "Research industry best practices and recommended approaches",
            "best_practices.md",
            "research_best_practices",
        ),
        ResearchAgentConfig::new(
            "risks",
            "Risks & Challenges",
            "Identify potential risks, challenges, and mitigation strategies",
            "risks.md",
            "research_risks",
        ),
    ]
}

/// Get the Ideas research agent configuration
///
/// This agent analyzes the codebase and suggests improvements,
/// quick wins, and feature ideas. It requires an existing codebase.
pub fn ideas_research_agent() -> ResearchAgentConfig {
    ResearchAgentConfig::new(
        "ideas",
        "Ideas & Improvements",
        "Analyze codebase and suggest improvements, quick wins, and feature ideas",
        "ideas.md",
        "ideas_analysis",
    )
    .with_requires_codebase()
}

/// Complete research configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchConfig {
    /// Configured research agents
    pub agents: Vec<ResearchAgentConfig>,
    /// Whether to run agents in parallel
    pub parallel: bool,
    /// Timeout for each agent in seconds
    pub timeout_secs: u64,
    /// Whether to skip agents that fail (vs. aborting the whole research)
    pub skip_on_failure: bool,
    /// CLI agent type to use (e.g., "claude", "cursor")
    pub cli_agent_type: String,
    /// Model to use for research agents
    pub model: Option<String>,
}

impl Default for ResearchConfig {
    fn default() -> Self {
        Self {
            agents: default_research_agents(),
            parallel: true,
            timeout_secs: 600, // 10 minutes
            skip_on_failure: true,
            cli_agent_type: "claude".to_string(),
            model: None,
        }
    }
}

impl ResearchConfig {
    /// Create a config with only the specified agents
    pub fn with_agents(agents: Vec<ResearchAgentConfig>) -> Self {
        Self {
            agents,
            ..Default::default()
        }
    }

    /// Add the Ideas agent for existing codebase analysis
    pub fn with_ideas_agent(mut self) -> Self {
        self.agents.push(ideas_research_agent());
        self
    }

    /// Filter agents based on mode (remove codebase-requiring agents for new projects)
    pub fn filter_for_mode(mut self, has_codebase: bool) -> Self {
        if !has_codebase {
            self.agents.retain(|a| !a.requires_codebase);
        }
        self
    }

    /// Get enabled agents only
    pub fn enabled_agents(&self) -> Vec<&ResearchAgentConfig> {
        self.agents.iter().filter(|a| a.enabled).collect()
    }

    /// Disable an agent by ID
    pub fn disable_agent(&mut self, agent_id: &str) {
        if let Some(agent) = self.agents.iter_mut().find(|a| a.id == agent_id) {
            agent.enabled = false;
        }
    }

    /// Enable an agent by ID
    pub fn enable_agent(&mut self, agent_id: &str) {
        if let Some(agent) = self.agents.iter_mut().find(|a| a.id == agent_id) {
            agent.enabled = true;
        }
    }

    /// Set the CLI agent type
    pub fn with_cli_agent(mut self, agent_type: impl Into<String>) -> Self {
        self.cli_agent_type = agent_type.into();
        self
    }

    /// Set the model
    pub fn with_model(mut self, model: impl Into<String>) -> Self {
        self.model = Some(model.into());
        self
    }

    /// Set parallel mode
    pub fn with_parallel(mut self, parallel: bool) -> Self {
        self.parallel = parallel;
        self
    }

    /// Set timeout
    pub fn with_timeout(mut self, timeout_secs: u64) -> Self {
        self.timeout_secs = timeout_secs;
        self
    }
}

/// Result from running a research agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchAgentResult {
    /// Agent ID
    pub agent_id: String,
    /// Agent name
    pub agent_name: String,
    /// Whether the agent completed successfully
    pub success: bool,
    /// Output content (if successful)
    pub output: Option<String>,
    /// Output file path (if saved)
    pub output_path: Option<String>,
    /// Error message (if failed)
    pub error: Option<String>,
    /// Execution duration in milliseconds
    pub duration_ms: u64,
}

/// Aggregated result from all research agents
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchResult {
    /// Individual agent results
    pub agent_results: Vec<ResearchAgentResult>,
    /// Total execution duration in milliseconds
    pub total_duration_ms: u64,
    /// Number of successful agents
    pub successful_count: usize,
    /// Number of failed agents
    pub failed_count: usize,
}

impl ResearchResult {
    /// Check if all agents completed successfully
    pub fn all_successful(&self) -> bool {
        self.failed_count == 0
    }

    /// Get successful results only
    pub fn successful_results(&self) -> Vec<&ResearchAgentResult> {
        self.agent_results.iter().filter(|r| r.success).collect()
    }

    /// Get failed results only
    pub fn failed_results(&self) -> Vec<&ResearchAgentResult> {
        self.agent_results.iter().filter(|r| !r.success).collect()
    }
}

/// Synthesized research summary
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSynthesis {
    /// Summary of all research findings
    pub summary: String,
    /// Key insights extracted
    pub key_insights: Vec<String>,
    /// Recommended approach
    pub recommended_approach: Option<String>,
    /// Identified risks
    pub risks: Vec<String>,
    /// Technical recommendations
    pub technical_recommendations: Vec<String>,
    /// Generated at timestamp
    pub generated_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_research_config() {
        let config = ResearchConfig::default();
        assert_eq!(config.agents.len(), 4);
        assert!(config.parallel);
        assert_eq!(config.timeout_secs, 600);
    }

    #[test]
    fn test_default_research_agents() {
        let agents = default_research_agents();
        assert_eq!(agents.len(), 4);

        // Check architecture agent
        let arch = agents.iter().find(|a| a.id == "architecture").unwrap();
        assert_eq!(arch.name, "Architecture Research");
        assert_eq!(arch.output_filename, "architecture.md");
        assert!(!arch.requires_codebase);

        // Check codebase agent requires codebase
        let codebase = agents.iter().find(|a| a.id == "codebase").unwrap();
        assert!(codebase.requires_codebase);
    }

    #[test]
    fn test_ideas_agent() {
        let ideas = ideas_research_agent();
        assert_eq!(ideas.id, "ideas");
        assert_eq!(ideas.name, "Ideas & Improvements");
        assert!(ideas.requires_codebase);
    }

    #[test]
    fn test_filter_for_mode() {
        let config = ResearchConfig::default().with_ideas_agent();
        assert_eq!(config.agents.len(), 5);

        let filtered = config.filter_for_mode(false);
        // Should remove codebase and ideas (both require codebase)
        assert_eq!(filtered.agents.len(), 3);
    }

    #[test]
    fn test_research_agent_config() {
        let config = ResearchAgentConfig::new(
            "custom",
            "Custom Agent",
            "Custom description",
            "custom.md",
            "custom_template",
        );

        assert_eq!(config.id, "custom");
        assert!(config.enabled);
        assert!(!config.requires_codebase);

        let with_codebase = config.with_requires_codebase();
        assert!(with_codebase.requires_codebase);
    }

    #[test]
    fn test_disable_enable_agent() {
        let mut config = ResearchConfig::default();
        assert_eq!(config.enabled_agents().len(), 4);

        config.disable_agent("codebase");
        assert_eq!(config.enabled_agents().len(), 3);

        config.enable_agent("codebase");
        assert_eq!(config.enabled_agents().len(), 4);
    }
}
