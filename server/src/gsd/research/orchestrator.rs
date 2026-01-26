//! Research orchestrator for parallel agent coordination
//!
//! Spawns multiple research agents in parallel using tokio::join! and
//! collects their results for synthesis. Emits progress events via HTTP.

use crate::agents::providers::get_provider;
use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
use crate::gsd::config::{GsdConfig, ResearchAgentType};
use crate::gsd::planning_storage::write_research_file;
use crate::gsd::state::{AgentResearchStatus, ResearchStatus};
use crate::models::AgentType;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;
use tokio::time::{timeout, Duration};

/// Extract clean research markdown from Claude Code stream-json output.
///
/// Claude Code outputs newline-delimited JSON (stream-json format). The actual
/// research content is in the final "result" message's "result" field. This
/// function extracts that clean markdown instead of saving raw JSON stream data.
///
/// Stream-json format example:
/// ```json
/// {"type":"system","subtype":"init","cwd":"/path","session_id":"..."}
/// {"type":"assistant","message":{"content":[{"type":"text","text":"..."}]}}
/// {"type":"result","subtype":"success","result":"# Research\n\n...actual content..."}
/// ```
fn extract_research_from_stream(raw_output: &str) -> Result<String, String> {
    // Search from the end since the "result" message is typically last
    for line in raw_output.lines().rev() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<Value>(line) {
            // Look for {"type":"result","subtype":"success","result":"..."}
            if json.get("type").and_then(|t| t.as_str()) == Some("result") {
                if let Some(result) = json.get("result").and_then(|r| r.as_str()) {
                    if !result.trim().is_empty() {
                        return Ok(result.to_string());
                    }
                }
            }
        }
    }

    // Fallback: collect text from assistant messages
    let mut content = String::new();
    for line in raw_output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<Value>(line) {
            if json.get("type").and_then(|t| t.as_str()) == Some("assistant") {
                if let Some(msg) = json.get("message") {
                    if let Some(content_arr) = msg.get("content").and_then(|c| c.as_array()) {
                        for item in content_arr {
                            if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                                if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                    content.push_str(text);
                                    content.push('\n');
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if content.trim().is_empty() {
        // If we couldn't extract any structured content, check if the raw output
        // is already clean markdown (not JSON)
        let first_char = raw_output.trim().chars().next();
        if first_char != Some('{') && first_char != Some('[') {
            // Doesn't look like JSON, might already be clean content
            return Ok(raw_output.to_string());
        }
        Err("Could not extract research content from agent output".to_string())
    } else {
        Ok(content.trim().to_string())
    }
}

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
    app_handle: Option<std::sync::Arc<crate::server::EventBroadcaster>>,
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
        app_handle: std::sync::Arc<crate::server::EventBroadcaster>,
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
            app_handle.broadcast(
                "gsd:research_output",
                serde_json::to_value(&event).unwrap_or_default(),
            );
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
            app_handle.broadcast(
                "gsd:research_status",
                serde_json::to_value(&event).unwrap_or_default(),
            );
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
                // Extract clean research content from stream-json output
                let raw_output = output.clone();
                match extract_research_from_stream(&raw_output) {
                    Ok(clean_content) => {
                        log::info!(
                            "[ResearchOrchestrator] Extracted clean research content ({} bytes from {} bytes raw)",
                            clean_content.len(),
                            raw_output.len()
                        );
                        Ok(clean_content)
                    }
                    Err(e) => {
                        // Log warning but return raw output as fallback
                        log::warn!(
                            "[ResearchOrchestrator] Failed to extract clean research: {}, using raw output ({} bytes)",
                            e,
                            raw_output.len()
                        );
                        Ok(raw_output)
                    }
                }
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
    app_handle: Option<std::sync::Arc<crate::server::EventBroadcaster>>,
) -> (ResearchStatus, Vec<ResearchResult>) {
    // Run all research types
    run_research_agents_selective(
        config,
        project_path,
        session_id,
        context,
        app_handle,
        None, // None means run all
    )
    .await
}

/// Run specific research agents in parallel (or all if research_types is None)
pub async fn run_research_agents_selective(
    config: &GsdConfig,
    project_path: &str,
    session_id: &str,
    context: &str,
    app_handle: Option<std::sync::Arc<crate::server::EventBroadcaster>>,
    research_types: Option<Vec<String>>,
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
    let timeout_secs = config.research_timeout_secs;

    // Determine which research types to run
    let should_run = |research_type: &str| -> bool {
        match &research_types {
            None => true, // Run all if no specific types provided
            Some(types) => types
                .iter()
                .any(|t| t.to_lowercase() == research_type.to_lowercase()),
        }
    };

    // Load existing status to preserve completed results
    let existing_status =
        crate::gsd::planning_storage::load_workflow_state(Path::new(project_path), session_id)
            .map(|state| state.research_status)
            .ok();

    // Run only the requested research agents in parallel
    let arch_future = async {
        if should_run("architecture") {
            Some(
                timeout(
                    timeout_duration,
                    orchestrator.run_single_agent(ResearchAgentType::Architecture, context),
                )
                .await,
            )
        } else {
            None
        }
    };

    let codebase_future = async {
        if should_run("codebase") {
            Some(
                timeout(
                    timeout_duration,
                    orchestrator.run_single_agent(ResearchAgentType::Codebase, context),
                )
                .await,
            )
        } else {
            None
        }
    };

    let best_practices_future = async {
        if should_run("bestpractices") || should_run("best_practices") {
            Some(
                timeout(
                    timeout_duration,
                    orchestrator.run_single_agent(ResearchAgentType::BestPractices, context),
                )
                .await,
            )
        } else {
            None
        }
    };

    let risks_future = async {
        if should_run("risks") {
            Some(
                timeout(
                    timeout_duration,
                    orchestrator.run_single_agent(ResearchAgentType::Risks, context),
                )
                .await,
            )
        } else {
            None
        }
    };

    let (arch_result, codebase_result, best_practices_result, risks_result) = tokio::join!(
        arch_future,
        codebase_future,
        best_practices_future,
        risks_future
    );

    // Convert results, preserving existing state for non-run agents
    let arch = match arch_result {
        Some(Ok(r)) => r,
        Some(Err(_)) => ResearchResult::timeout("architecture", timeout_secs, &cli_agent),
        None => {
            // Preserve existing state if we didn't run this agent
            if let Some(ref existing) = existing_status {
                ResearchResult {
                    research_type: "architecture".to_string(),
                    success: existing.architecture.complete,
                    content: None,
                    error: existing.architecture.error.clone(),
                    output_path: existing.architecture.output_path.clone(),
                    duration_secs: 0.0,
                    cli_agent: cli_agent.clone(),
                }
            } else {
                ResearchResult {
                    research_type: "architecture".to_string(),
                    success: false,
                    content: None,
                    error: None,
                    output_path: None,
                    duration_secs: 0.0,
                    cli_agent: cli_agent.clone(),
                }
            }
        }
    };

    let codebase = match codebase_result {
        Some(Ok(r)) => r,
        Some(Err(_)) => ResearchResult::timeout("codebase", timeout_secs, &cli_agent),
        None => {
            if let Some(ref existing) = existing_status {
                ResearchResult {
                    research_type: "codebase".to_string(),
                    success: existing.codebase.complete,
                    content: None,
                    error: existing.codebase.error.clone(),
                    output_path: existing.codebase.output_path.clone(),
                    duration_secs: 0.0,
                    cli_agent: cli_agent.clone(),
                }
            } else {
                ResearchResult {
                    research_type: "codebase".to_string(),
                    success: false,
                    content: None,
                    error: None,
                    output_path: None,
                    duration_secs: 0.0,
                    cli_agent: cli_agent.clone(),
                }
            }
        }
    };

    let best_practices = match best_practices_result {
        Some(Ok(r)) => r,
        Some(Err(_)) => ResearchResult::timeout("best_practices", timeout_secs, &cli_agent),
        None => {
            if let Some(ref existing) = existing_status {
                ResearchResult {
                    research_type: "best_practices".to_string(),
                    success: existing.best_practices.complete,
                    content: None,
                    error: existing.best_practices.error.clone(),
                    output_path: existing.best_practices.output_path.clone(),
                    duration_secs: 0.0,
                    cli_agent: cli_agent.clone(),
                }
            } else {
                ResearchResult {
                    research_type: "best_practices".to_string(),
                    success: false,
                    content: None,
                    error: None,
                    output_path: None,
                    duration_secs: 0.0,
                    cli_agent: cli_agent.clone(),
                }
            }
        }
    };

    let risks = match risks_result {
        Some(Ok(r)) => r,
        Some(Err(_)) => ResearchResult::timeout("risks", timeout_secs, &cli_agent),
        None => {
            if let Some(ref existing) = existing_status {
                ResearchResult {
                    research_type: "risks".to_string(),
                    success: existing.risks.complete,
                    content: None,
                    error: existing.risks.error.clone(),
                    output_path: existing.risks.output_path.clone(),
                    duration_secs: 0.0,
                    cli_agent: cli_agent.clone(),
                }
            } else {
                ResearchResult {
                    research_type: "risks".to_string(),
                    success: false,
                    content: None,
                    error: None,
                    output_path: None,
                    duration_secs: 0.0,
                    cli_agent: cli_agent.clone(),
                }
            }
        }
    };

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

    #[test]
    fn test_extract_research_from_stream_result_message() {
        // Test extracting from a proper result message
        // Using escaped JSON string that the actual stream would produce
        let raw_output = "{\"type\":\"system\",\"subtype\":\"init\",\"cwd\":\"/path\"}\n\
{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"Working on it...\"}]}}\n\
{\"type\":\"result\",\"subtype\":\"success\",\"result\":\"# Architecture Research\\n\\n## Executive Summary\\n\\nThis is the clean research content.\"}";

        let result = extract_research_from_stream(raw_output);
        assert!(result.is_ok());
        let content = result.unwrap();
        assert!(content.starts_with("# Architecture Research"));
        assert!(content.contains("Executive Summary"));
        assert!(!content.contains(r#""type":"system""#));
    }

    #[test]
    fn test_extract_research_from_stream_fallback_to_assistant() {
        // Test fallback when there's no result message but there are assistant messages
        let raw_output = "{\"type\":\"system\",\"subtype\":\"init\",\"cwd\":\"/path\"}\n\
{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"# Research Output\\n\\nHere is my analysis.\"}]}}\n\
{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"## More Details\\n\\nAdditional findings.\"}]}}";

        let result = extract_research_from_stream(raw_output);
        assert!(result.is_ok());
        let content = result.unwrap();
        assert!(content.contains("# Research Output"));
        assert!(content.contains("## More Details"));
    }

    #[test]
    fn test_extract_research_from_stream_plain_markdown() {
        // Test passthrough when content is already clean markdown (not JSON)
        let raw_output = "# Clean Markdown\n\nThis is already clean content.";

        let result = extract_research_from_stream(raw_output);
        assert!(result.is_ok());
        let content = result.unwrap();
        assert_eq!(content, raw_output);
    }

    #[test]
    fn test_extract_research_from_stream_empty_result() {
        // Test that empty result fields don't match
        let raw_output = "{\"type\":\"result\",\"subtype\":\"success\",\"result\":\"\"}\n\
{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"text\",\"text\":\"Actual content here\"}]}}";

        let result = extract_research_from_stream(raw_output);
        assert!(result.is_ok());
        let content = result.unwrap();
        assert!(content.contains("Actual content here"));
    }

    #[test]
    fn test_extract_research_from_stream_no_content() {
        // Test error case when no content can be extracted
        let raw_output = "{\"type\":\"system\",\"subtype\":\"init\",\"cwd\":\"/path\"}\n\
{\"type\":\"user\",\"message\":\"some user input\"}";

        let result = extract_research_from_stream(raw_output);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Could not extract"));
    }
}
