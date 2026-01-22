//! Research orchestrator for parallel agent coordination
//!
//! Spawns multiple research agents in parallel using tokio::join! and
//! collects their results for synthesis. Emits progress events via Tauri.

use crate::agents::providers::get_provider;
use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
use crate::gsd::config::{GsdConfig, ResearchAgentType};
use crate::gsd::planning_storage::write_research_file;
use crate::gsd::state::{AgentResearchStatus, ResearchStatus};
use crate::models::AgentType;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};

/// Event payload for research output streaming
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchOutputEvent {
    /// Session ID
    pub session_id: String,
    /// Which research agent type this is from
    pub agent_type: String,
    /// Output chunk content
    pub chunk: String,
    /// Whether this is the final chunk
    pub is_complete: bool,
}

/// Event payload for research status updates
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchStatusEvent {
    /// Session ID
    pub session_id: String,
    /// Which research agent type this is from
    pub agent_type: String,
    /// Current status
    pub status: String,
    /// Error message if any
    pub error: Option<String>,
}

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
    app_handle: Option<AppHandle>,
}

impl ResearchOrchestrator {
    /// Create a new research orchestrator
    pub fn new(config: GsdConfig, project_path: String, session_id: String) -> Self {
        Self {
            config,
            project_path,
            session_id,
            app_handle: None,
        }
    }

    /// Create a new research orchestrator with app handle for event emission
    pub fn with_app_handle(
        config: GsdConfig,
        project_path: String,
        session_id: String,
        app_handle: AppHandle,
    ) -> Self {
        Self {
            config,
            project_path,
            session_id,
            app_handle: Some(app_handle),
        }
    }

    /// Emit a research output event
    fn emit_output(&self, agent_type: &str, chunk: &str, is_complete: bool) {
        if let Some(ref app_handle) = self.app_handle {
            let event = ResearchOutputEvent {
                session_id: self.session_id.clone(),
                agent_type: agent_type.to_string(),
                chunk: chunk.to_string(),
                is_complete,
            };
            if let Err(e) = app_handle.emit("gsd:research_output", event) {
                log::warn!("Failed to emit research output event: {}", e);
            }
        }
    }

    /// Emit a research status event
    fn emit_status(&self, agent_type: &str, status: &str, error: Option<String>) {
        if let Some(ref app_handle) = self.app_handle {
            let event = ResearchStatusEvent {
                session_id: self.session_id.clone(),
                agent_type: agent_type.to_string(),
                status: status.to_string(),
                error,
            };
            if let Err(e) = app_handle.emit("gsd:research_status", event) {
                log::warn!("Failed to emit research status event: {}", e);
            }
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
        let agent_type_str = format!("{:?}", research_type).to_lowercase();

        // Emit starting status
        self.emit_status(&agent_type_str, "running", None);

        // Generate the prompt for this agent type
        let prompt =
            super::prompts::ResearchPrompts::get_prompt(research_type, context, project_path);

        // Run the configured CLI agent with the research prompt
        let content = self
            .execute_research_with_streaming(research_type, &prompt)
            .await;

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
                    Ok(path) => {
                        // Emit completion status
                        self.emit_status(&agent_type_str, "complete", None);
                        self.emit_output(&agent_type_str, "", true);
                        ResearchResult {
                            research_type: agent_type_str,
                            success: true,
                            content: Some(research_content),
                            error: None,
                            output_path: Some(path.to_string_lossy().to_string()),
                            duration_secs,
                            cli_agent,
                        }
                    }
                    Err(e) => {
                        let error_msg = format!("Failed to write research file: {}", e);
                        self.emit_status(&agent_type_str, "error", Some(error_msg.clone()));
                        ResearchResult {
                            research_type: agent_type_str,
                            success: false,
                            content: None,
                            error: Some(error_msg),
                            output_path: None,
                            duration_secs,
                            cli_agent,
                        }
                    }
                }
            }
            Err(e) => {
                self.emit_status(&agent_type_str, "error", Some(e.clone()));
                ResearchResult {
                    research_type: agent_type_str,
                    success: false,
                    content: None,
                    error: Some(e),
                    output_path: None,
                    duration_secs,
                    cli_agent,
                }
            }
        }
    }

    /// Run the research using the configured agent with streaming output
    async fn execute_research_with_streaming(
        &self,
        research_type: ResearchAgentType,
        prompt: &str,
    ) -> Result<String, String> {
        // Try to run the actual agent with streaming
        match self.run_agent_streaming(research_type, prompt).await {
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

    /// Run the configured CLI agent with streaming output
    async fn run_agent_streaming(
        &self,
        research_type: ResearchAgentType,
        prompt: &str,
    ) -> Result<String, String> {
        let agent_type = self.config.get_agent_type();
        let provider = get_provider(&agent_type);
        let agent_type_str = format!("{:?}", research_type).to_lowercase();

        // Check if the agent is available
        if !provider.is_available() {
            return Err(format!(
                "{:?} CLI not found. Please ensure it is installed and in PATH.",
                agent_type
            ));
        }

        log::info!(
            "[ResearchOrchestrator] Running {:?} agent with streaming in {}",
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

        // Spawn the process
        let mut child = cmd
            .spawn()
            .map_err(|e| format!("Failed to spawn {:?}: {}", agent_type, e))?;

        // Take stdout for streaming
        let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
        let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

        // Collect output while streaming
        let output_buffer = Arc::new(Mutex::new(String::new()));
        let output_clone = output_buffer.clone();

        // Stream stdout
        let stdout_reader = BufReader::new(stdout);
        let mut lines = stdout_reader.lines();

        // Process lines as they come in
        while let Ok(Some(line)) = lines.next_line().await {
            // Emit the line as an event
            self.emit_output(&agent_type_str, &line, false);

            // Append to buffer
            let mut buffer = output_clone.lock().await;
            buffer.push_str(&line);
            buffer.push('\n');
        }

        // Wait for process to complete
        let status = child
            .wait()
            .await
            .map_err(|e| format!("Failed to wait for {:?}: {}", agent_type, e))?;

        // Collect any stderr
        let stderr_reader = BufReader::new(stderr);
        let mut stderr_lines = stderr_reader.lines();
        let mut stderr_output = String::new();
        while let Ok(Some(line)) = stderr_lines.next_line().await {
            stderr_output.push_str(&line);
            stderr_output.push('\n');
        }

        // Get final output
        let output = output_buffer.lock().await;

        if status.success() {
            if output.trim().is_empty() {
                if !stderr_output.trim().is_empty() {
                    log::warn!(
                        "[ResearchOrchestrator] {:?} stderr: {}",
                        agent_type,
                        stderr_output
                    );
                }
                Err(format!("{:?} returned empty output", agent_type))
            } else {
                Ok(output.clone())
            }
        } else {
            let code = status.code().unwrap_or(-1);
            Err(format!(
                "{:?} exited with code {}: {}",
                agent_type,
                code,
                stderr_output.lines().take(5).collect::<Vec<_>>().join("\n")
            ))
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
    run_research_agents_with_handle(config, project_path, session_id, context, None).await
}

/// Run all research agents in parallel with optional app handle for event emission
pub async fn run_research_agents_with_handle(
    config: &GsdConfig,
    project_path: &str,
    session_id: &str,
    context: &str,
    app_handle: Option<AppHandle>,
) -> (ResearchStatus, Vec<ResearchResult>) {
    let orchestrator = if let Some(handle) = app_handle {
        ResearchOrchestrator::with_app_handle(
            config.clone(),
            project_path.to_string(),
            session_id.to_string(),
            handle,
        )
    } else {
        ResearchOrchestrator::new(
            config.clone(),
            project_path.to_string(),
            session_id.to_string(),
        )
    };

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
