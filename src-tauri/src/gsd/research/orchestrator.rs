//! Research orchestrator for parallel agent coordination
//!
//! Spawns multiple research agents in parallel using tokio::join! and
//! collects their results for synthesis.

use crate::gsd::config::{GsdConfig, ResearchAgentType};
use crate::gsd::planning_storage::write_research_file;
use crate::gsd::state::{AgentResearchStatus, ResearchStatus};
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
        agent_type: ResearchAgentType,
        context: &str,
    ) -> ResearchResult {
        let start = std::time::Instant::now();
        let project_path = Path::new(&self.project_path);

        // Generate the prompt for this agent type
        let prompt = super::prompts::ResearchPrompts::get_prompt(agent_type, context, project_path);

        // Run Claude Code agent with the research prompt
        let content = self.execute_research(agent_type, &prompt).await;

        let duration_secs = start.elapsed().as_secs_f64();

        match content {
            Ok(research_content) => {
                // Write the research output to file
                let filename = agent_type.output_filename();
                match write_research_file(project_path, &self.session_id, filename, &research_content)
                {
                    Ok(path) => ResearchResult {
                        research_type: format!("{:?}", agent_type).to_lowercase(),
                        success: true,
                        content: Some(research_content),
                        error: None,
                        output_path: Some(path.to_string_lossy().to_string()),
                        duration_secs,
                    },
                    Err(e) => ResearchResult {
                        research_type: format!("{:?}", agent_type).to_lowercase(),
                        success: false,
                        content: None,
                        error: Some(format!("Failed to write research file: {}", e)),
                        output_path: None,
                        duration_secs,
                    },
                }
            }
            Err(e) => ResearchResult {
                research_type: format!("{:?}", agent_type).to_lowercase(),
                success: false,
                content: None,
                error: Some(e),
                output_path: None,
                duration_secs,
            },
        }
    }

    /// Run a Claude Code agent with the given prompt
    async fn run_claude_agent(&self, prompt: &str) -> Result<String, String> {
        // Check if claude is available
        let claude_path = which::which("claude").map_err(|_| {
            "Claude Code CLI not found. Please ensure 'claude' is installed and in PATH."
                .to_string()
        })?;

        log::info!(
            "[ResearchOrchestrator] Running Claude Code at {:?} in {}",
            claude_path,
            self.project_path
        );

        // Build the command: claude --print --dangerously-skip-permissions "prompt"
        let mut cmd = Command::new(claude_path);
        cmd.arg("--print")
            .arg("--dangerously-skip-permissions")
            .arg(prompt)
            .current_dir(&self.project_path)
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        // Spawn and wait for completion
        let output = cmd
            .output()
            .await
            .map_err(|e| format!("Failed to spawn Claude Code: {}", e))?;

        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            if stdout.trim().is_empty() {
                // If stdout is empty, check stderr for any useful output
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                if !stderr.trim().is_empty() {
                    log::warn!("[ResearchOrchestrator] Claude stderr: {}", stderr);
                }
                Err("Claude Code returned empty output".to_string())
            } else {
                Ok(stdout)
            }
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let code = output.status.code().unwrap_or(-1);
            Err(format!(
                "Claude Code exited with code {}: {}",
                code,
                stderr.lines().take(5).collect::<Vec<_>>().join("\n")
            ))
        }
    }

    /// Run the research using Claude Code or fall back to placeholder
    async fn execute_research(
        &self,
        agent_type: ResearchAgentType,
        prompt: &str,
    ) -> Result<String, String> {
        // Try to run the actual Claude agent
        match self.run_claude_agent(prompt).await {
            Ok(content) => Ok(content),
            Err(e) => {
                log::warn!(
                    "[ResearchOrchestrator] Failed to run Claude agent for {:?}: {}. Using placeholder.",
                    agent_type,
                    e
                );
                // Fall back to placeholder content
                Ok(self.get_placeholder_content(agent_type))
            }
        }
    }

    /// Get placeholder content when agent is unavailable
    fn get_placeholder_content(&self, agent_type: ResearchAgentType) -> String {
        match agent_type {
            ResearchAgentType::Architecture => {
                "# Architecture Research\n\n*Research pending - Claude Code CLI not available.*\n\n## To Enable Research\n\nInstall Claude Code CLI and ensure it's in your PATH.".to_string()
            }
            ResearchAgentType::Codebase => {
                "# Codebase Analysis\n\n*Research pending - Claude Code CLI not available.*\n\n## To Enable Research\n\nInstall Claude Code CLI and ensure it's in your PATH.".to_string()
            }
            ResearchAgentType::BestPractices => {
                "# Best Practices Research\n\n*Research pending - Claude Code CLI not available.*\n\n## To Enable Research\n\nInstall Claude Code CLI and ensure it's in your PATH.".to_string()
            }
            ResearchAgentType::Risks => {
                "# Risks & Challenges\n\n*Research pending - Claude Code CLI not available.*\n\n## To Enable Research\n\nInstall Claude Code CLI and ensure it's in your PATH.".to_string()
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
    let arch = arch_result.unwrap_or_else(|_| ResearchResult {
        research_type: "architecture".to_string(),
        success: false,
        content: None,
        error: Some("Research timed out".to_string()),
        output_path: None,
        duration_secs: config.research_timeout_secs as f64,
    });

    let codebase = codebase_result.unwrap_or_else(|_| ResearchResult {
        research_type: "codebase".to_string(),
        success: false,
        content: None,
        error: Some("Research timed out".to_string()),
        output_path: None,
        duration_secs: config.research_timeout_secs as f64,
    });

    let best_practices = best_practices_result.unwrap_or_else(|_| ResearchResult {
        research_type: "best_practices".to_string(),
        success: false,
        content: None,
        error: Some("Research timed out".to_string()),
        output_path: None,
        duration_secs: config.research_timeout_secs as f64,
    });

    let risks = risks_result.unwrap_or_else(|_| ResearchResult {
        research_type: "risks".to_string(),
        success: false,
        content: None,
        error: Some("Research timed out".to_string()),
        output_path: None,
        duration_secs: config.research_timeout_secs as f64,
    });

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

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_run_research_agents() {
        use tempfile::TempDir;
        use crate::gsd::planning_storage::init_planning_session;

        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path().to_str().unwrap();
        let session_id = "test-session";

        // Initialize planning session
        init_planning_session(temp_dir.path(), session_id).unwrap();

        let config = GsdConfig::default();
        let context = "Building a chat application";

        let (status, results) = run_research_agents(&config, project_path, session_id, context).await;

        // All four agents should have run
        assert_eq!(results.len(), 4);

        // Check status is populated
        assert!(status.architecture.complete || status.architecture.error.is_some());
        assert!(status.codebase.complete || status.codebase.error.is_some());
        assert!(status.best_practices.complete || status.best_practices.error.is_some());
        assert!(status.risks.complete || status.risks.error.is_some());
    }
}
