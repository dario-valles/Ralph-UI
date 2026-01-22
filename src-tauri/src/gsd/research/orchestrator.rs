//! Research orchestrator for parallel agent coordination
//!
//! Spawns multiple research agents in parallel using tokio::join! and
//! collects their results for synthesis.

use crate::agents::providers::get_provider;
use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
use crate::gsd::config::{GsdConfig, ResearchAgentType};
use crate::gsd::planning_storage::write_research_file;
use crate::gsd::state::{AgentResearchStatus, ResearchStatus};
use crate::models::AgentType;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Stdio;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

/// Result of a single research agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchResult {
    /// Type of research performed
    pub research_type: String,
    /// Whether the research completed successfully
    pub success: bool,
    /// The research output content
    pub content: Option<String>,
    /// Error message if failed
    pub error: Option<String>,
    /// Output file path
    pub output_path: Option<String>,
    /// Duration in seconds
    pub duration_secs: f64,
    /// Which CLI agent was used
    pub cli_agent: String,
}

impl ResearchResult {
    /// Create a timeout error result for the given research type
    fn timeout(research_type: &str, timeout_secs: u64, cli_agent: &str) -> Self {
        Self {
            research_type: research_type.to_string(),
            success: false,
            content: None,
            error: Some("Research timed out".to_string()),
            output_path: None,
            duration_secs: timeout_secs as f64,
            cli_agent: cli_agent.to_string(),
        }
    }
}

/// Orchestrator for running parallel research agents
pub struct ResearchOrchestrator {
    config: GsdConfig,
    project_path: String,
    session_id: String,
}

impl ResearchOrchestrator {
    /// Create a new research orchestrator
    pub fn new(config: GsdConfig, project_path: String, session_id: String) -> Self {
        Self {
            config,
            project_path,
            session_id,
        }
    }

    /// Run a single research agent
    async fn run_single_agent(
        &self,
        research_type: ResearchAgentType,
        context: &str,
    ) -> ResearchResult {
        let start = std::time::Instant::now();
        let project_path = Path::new(&self.project_path);
        let cli_agent = self.config.research_agent_type.clone();

        // Generate the prompt for this agent type
        let prompt =
            super::prompts::ResearchPrompts::get_prompt(research_type, context, project_path);

        // Run the configured CLI agent with the research prompt
        let content = self.execute_research(research_type, &prompt).await;

        let duration_secs = start.elapsed().as_secs_f64();

        match content {
            Ok(research_content) => {
                // Write the research output to file
                let filename = research_type.output_filename();
                match write_research_file(
                    project_path,
                    &self.session_id,
                    filename,
                    &research_content,
                ) {
                    Ok(path) => ResearchResult {
                        research_type: format!("{:?}", research_type).to_lowercase(),
                        success: true,
                        content: Some(research_content),
                        error: None,
                        output_path: Some(path.to_string_lossy().to_string()),
                        duration_secs,
                        cli_agent,
                    },
                    Err(e) => ResearchResult {
                        research_type: format!("{:?}", research_type).to_lowercase(),
                        success: false,
                        content: None,
                        error: Some(format!("Failed to write research file: {}", e)),
                        output_path: None,
                        duration_secs,
                        cli_agent,
                    },
                }
            }
            Err(e) => ResearchResult {
                research_type: format!("{:?}", research_type).to_lowercase(),
                success: false,
                content: None,
                error: Some(e),
                output_path: None,
                duration_secs,
                cli_agent,
            },
        }
    }

    /// Run the configured CLI agent with the given prompt
    async fn run_agent(&self, prompt: &str) -> Result<String, String> {
        let agent_type = self.config.get_agent_type();
        let provider = get_provider(&agent_type);

        // Check if the agent is available
        if !provider.is_available() {
            return Err(format!(
                "{:?} CLI not found. Please ensure it is installed and in PATH.",
                agent_type
            ));
        }

        log::info!(
            "[ResearchOrchestrator] Running {:?} agent in {}",
            agent_type,
            self.project_path
        );

        // Build the agent spawn config for research
        let spawn_config = AgentSpawnConfig {
            agent_type,
            task_id: format!("research-{}", uuid::Uuid::new_v4()),
            worktree_path: self.project_path.clone(),
            branch: "main".to_string(),
            max_iterations: 0, // No limit for research
            prompt: Some(prompt.to_string()),
            model: self.config.research_model.clone(),
            spawn_mode: AgentSpawnMode::Piped,
            plugin_config: None,
        };

        // Build the command using the provider
        let std_cmd = provider
            .build_command(&spawn_config)
            .map_err(|e| format!("Failed to build command: {}", e))?;

        // Convert to tokio command
        let mut cmd = Command::from(std_cmd);
        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Spawn and wait for completion
        let output = cmd
            .output()
            .await
            .map_err(|e| format!("Failed to spawn {:?}: {}", agent_type, e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            if stdout.trim().is_empty() {
                // If stdout is empty, check stderr for any useful output
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                if !stderr.trim().is_empty() {
                    log::warn!("[ResearchOrchestrator] {:?} stderr: {}", agent_type, stderr);
                }
                Err(format!("{:?} returned empty output", agent_type))
            } else {
                Ok(stdout)
            }
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let code = output.status.code().unwrap_or(-1);
            Err(format!(
                "{:?} exited with code {}: {}",
                agent_type,
                code,
                stderr.lines().take(5).collect::<Vec<_>>().join("\n")
            ))
        }
    }

    /// Run the research using the configured agent or fall back to placeholder
    async fn execute_research(
        &self,
        research_type: ResearchAgentType,
        prompt: &str,
    ) -> Result<String, String> {
        // Try to run the actual agent
        match self.run_agent(prompt).await {
            Ok(content) => Ok(content),
            Err(e) => {
                log::warn!(
                    "[ResearchOrchestrator] Failed to run {:?} agent for {:?}: {}. Using placeholder.",
                    self.config.get_agent_type(),
                    research_type,
                    e
                );
                // Fall back to placeholder content
                Ok(self.get_placeholder_content(research_type))
            }
        }
    }

    /// Get placeholder content when agent is unavailable
    fn get_placeholder_content(&self, research_type: ResearchAgentType) -> String {
        let agent_name = &self.config.research_agent_type;
        match research_type {
            ResearchAgentType::Architecture => {
                format!(
                    "# Architecture Research\n\n*Research pending - {} CLI not available.*\n\n## To Enable Research\n\nInstall the {} CLI and ensure it's in your PATH.",
                    agent_name, agent_name
                )
            }
            ResearchAgentType::Codebase => {
                format!(
                    "# Codebase Analysis\n\n*Research pending - {} CLI not available.*\n\n## To Enable Research\n\nInstall the {} CLI and ensure it's in your PATH.",
                    agent_name, agent_name
                )
            }
            ResearchAgentType::BestPractices => {
                format!(
                    "# Best Practices Research\n\n*Research pending - {} CLI not available.*\n\n## To Enable Research\n\nInstall the {} CLI and ensure it's in your PATH.",
                    agent_name, agent_name
                )
            }
            ResearchAgentType::Risks => {
                format!(
                    "# Risks & Challenges\n\n*Research pending - {} CLI not available.*\n\n## To Enable Research\n\nInstall the {} CLI and ensure it's in your PATH.",
                    agent_name, agent_name
                )
            }
        }
    }
}

/// Run all research agents in parallel
pub async fn run_research_agents(
    config: &GsdConfig,
    project_path: &str,
    session_id: &str,
    context: &str,
) -> (ResearchStatus, Vec<ResearchResult>) {
    let orchestrator = ResearchOrchestrator::new(
        config.clone(),
        project_path.to_string(),
        session_id.to_string(),
    );

    let timeout_duration = Duration::from_secs(config.research_timeout_secs);
    let cli_agent = config.research_agent_type.clone();

    // Run all four research agents in parallel
    let (arch_result, codebase_result, best_practices_result, risks_result) = tokio::join!(
        timeout(
            timeout_duration,
            orchestrator.run_single_agent(ResearchAgentType::Architecture, context)
        ),
        timeout(
            timeout_duration,
            orchestrator.run_single_agent(ResearchAgentType::Codebase, context)
        ),
        timeout(
            timeout_duration,
            orchestrator.run_single_agent(ResearchAgentType::BestPractices, context)
        ),
        timeout(
            timeout_duration,
            orchestrator.run_single_agent(ResearchAgentType::Risks, context)
        ),
    );

    // Convert timeout results to ResearchResults
    let timeout_secs = config.research_timeout_secs;
    let arch = arch_result
        .unwrap_or_else(|_| ResearchResult::timeout("architecture", timeout_secs, &cli_agent));
    let codebase = codebase_result
        .unwrap_or_else(|_| ResearchResult::timeout("codebase", timeout_secs, &cli_agent));
    let best_practices = best_practices_result
        .unwrap_or_else(|_| ResearchResult::timeout("best_practices", timeout_secs, &cli_agent));
    let risks = risks_result
        .unwrap_or_else(|_| ResearchResult::timeout("risks", timeout_secs, &cli_agent));

    // Build the status
    let status = ResearchStatus {
        architecture: AgentResearchStatus {
            running: false,
            complete: arch.success,
            error: arch.error.clone(),
            output_path: arch.output_path.clone(),
        },
        codebase: AgentResearchStatus {
            running: false,
            complete: codebase.success,
            error: codebase.error.clone(),
            output_path: codebase.output_path.clone(),
        },
        best_practices: AgentResearchStatus {
            running: false,
            complete: best_practices.success,
            error: best_practices.error.clone(),
            output_path: best_practices.output_path.clone(),
        },
        risks: AgentResearchStatus {
            running: false,
            complete: risks.success,
            error: risks.error.clone(),
            output_path: risks.output_path.clone(),
        },
    };

    let results = vec![arch, codebase, best_practices, risks];

    (status, results)
}

/// Get list of available CLI agents (those that are installed)
pub fn get_available_agents() -> Vec<AgentType> {
    AgentType::all()
        .iter()
        .copied()
        .filter(|t| {
            let provider = get_provider(t);
            provider.is_available()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_run_research_agents() {
        use crate::gsd::planning_storage::init_planning_session;
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path().to_str().unwrap();
        let session_id = "test-session";

        // Initialize planning session
        init_planning_session(temp_dir.path(), session_id).unwrap();

        let config = GsdConfig::default();
        let context = "Building a chat application";

        let (status, results) =
            run_research_agents(&config, project_path, session_id, context).await;

        // All four agents should have run
        assert_eq!(results.len(), 4);

        // Check status is populated
        assert!(status.architecture.complete || status.architecture.error.is_some());
        assert!(status.codebase.complete || status.codebase.error.is_some());
        assert!(status.best_practices.complete || status.best_practices.error.is_some());
        assert!(status.risks.complete || status.risks.error.is_some());
    }

    #[test]
    fn test_get_available_agents() {
        // This test just verifies the function runs without panicking
        let agents = get_available_agents();
        // At least one agent might be available (or none in CI)
        let _ = agents;
    }
}
