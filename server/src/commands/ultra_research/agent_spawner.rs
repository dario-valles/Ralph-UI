// Agent spawner for ultra research - handles parallel agent execution

use crate::commands::prd_chat::{build_agent_command, ChatAgentResult, ChatEventEmitter};
use crate::events::{MdFileDetectedPayload, ToolCallCompletedPayload, ToolCallStartedPayload};
use crate::file_storage::research_ops;
use crate::models::{
    ResearchAgent, ResearchAgentProgressPayload, ResearchAgentStatus, ResearchFinding,
    ResearchSession,
};
use crate::server::EventBroadcaster;
use chrono::Utc;
use std::path::Path;
use std::sync::Arc;
use tokio::process::Command;
use tokio::sync::Mutex;

/// Event emitter for research agent progress
pub struct ResearchEventEmitter {
    broadcaster: Arc<EventBroadcaster>,
    session_id: String,
    agent_id: String,
}

impl ResearchEventEmitter {
    pub fn new(broadcaster: Arc<EventBroadcaster>, session_id: String, agent_id: String) -> Self {
        Self {
            broadcaster,
            session_id,
            agent_id,
        }
    }

    pub fn emit_progress(&self, content: &str) {
        let payload = ResearchAgentProgressPayload {
            session_id: self.session_id.clone(),
            agent_id: self.agent_id.clone(),
            content: content.to_string(),
        };

        if let Ok(json) = serde_json::to_value(&payload) {
            self.broadcaster.send("ultra_research:agent_progress", json);
        }
    }
}

impl ChatEventEmitter for ResearchEventEmitter {
    fn emit_chunk(&self, _session_id: &str, content: &str) {
        self.emit_progress(content);
    }

    fn emit_tool_started(&self, _payload: ToolCallStartedPayload) {
        // Tool events not needed for research
    }

    fn emit_tool_completed(&self, _payload: ToolCallCompletedPayload) {
        // Tool events not needed for research
    }

    fn emit_md_file_detected(&self, _payload: MdFileDetectedPayload) {
        // MD file detection not needed for research
    }
}

/// Spawn a researcher agent to investigate an angle
pub async fn spawn_researcher(
    project_path: &Path,
    session: &ResearchSession,
    agent: &ResearchAgent,
    angle: &str,
    _angle_description: &str,
    prompt: &str,
    broadcaster: Arc<EventBroadcaster>,
) -> Result<ResearchFinding, String> {
    // Build the agent command
    let (cmd_name, args) = build_agent_command(
        agent.agent_type,
        prompt,
        None, // No session resumption for research agents
    );

    log::info!(
        "Spawning researcher agent {} ({}) for angle: {}",
        agent.id,
        agent.agent_type,
        angle
    );

    // Create event emitter
    let emitter = ResearchEventEmitter::new(broadcaster, session.id.clone(), agent.id.clone());

    // Run the agent command
    let result = run_agent_command(cmd_name, &args, project_path, &emitter).await?;

    // Create the finding
    let finding = ResearchFinding {
        agent_id: agent.id.clone(),
        angle: angle.to_string(),
        content: result.content.clone(),
        sources: None, // Could parse from response in future
        confidence: extract_confidence(&result.content).unwrap_or(75),
        timestamp: Utc::now(),
    };

    Ok(finding)
}

/// Run a single agent command and capture output
async fn run_agent_command(
    cmd_name: &str,
    args: &[String],
    working_dir: &Path,
    emitter: &ResearchEventEmitter,
) -> Result<ChatAgentResult, String> {
    use tokio::io::{AsyncBufReadExt, BufReader};

    let mut cmd = Command::new(cmd_name);
    cmd.args(args)
        .current_dir(working_dir)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn agent {}: {}", cmd_name, e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;

    let mut reader = BufReader::new(stdout).lines();
    let mut full_response = String::new();

    while let Ok(Some(line)) = reader.next_line().await {
        emitter.emit_progress(&line);
        full_response.push_str(&line);
        full_response.push('\n');
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for agent: {}", e))?;

    if !status.success() {
        return Err(format!("Agent exited with status: {}", status));
    }

    Ok(ChatAgentResult {
        content: full_response,
        captured_session_id: None,
    })
}

/// Extract confidence score from agent response
fn extract_confidence(response: &str) -> Option<u8> {
    // Look for confidence patterns like "Confidence: 85" or "confidence level: 85%"
    let patterns = [
        r"(?i)confidence[:\s]+(\d{1,3})%?",
        r"(?i)confidence level[:\s]+(\d{1,3})%?",
    ];

    for pattern in &patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            if let Some(caps) = re.captures(response) {
                if let Some(m) = caps.get(1) {
                    if let Ok(val) = m.as_str().parse::<u8>() {
                        return Some(val.min(100));
                    }
                }
            }
        }
    }

    None
}

/// Run all researcher agents in parallel
pub async fn run_parallel_research(
    project_path: &Path,
    session_id: &str,
    agents: &[ResearchAgent],
    angles: &[(String, String)], // (angle_name, angle_description)
    query: &str,
    broadcaster: Arc<EventBroadcaster>,
) -> Result<Vec<ResearchFinding>, String> {
    use super::prompts::build_researcher_prompt;
    use futures_util::future::join_all;

    let project_path = project_path.to_path_buf();
    let session_arc = Arc::new(Mutex::new(research_ops::read_research_session(
        &project_path,
        session_id,
    )?));

    // Create tasks for each agent
    let mut handles = Vec::new();

    for (i, agent) in agents.iter().enumerate() {
        let angle = angles.get(i).cloned().unwrap_or_else(|| {
            (
                format!("Research Angle {}", i + 1),
                "General research".to_string(),
            )
        });

        let prompt = build_researcher_prompt(&angle.0, &angle.1, query);
        let project_path = project_path.clone();
        let session_arc = session_arc.clone();
        let broadcaster = broadcaster.clone();
        let agent = agent.clone();
        let session_id = session_id.to_string();

        let handle = tokio::spawn(async move {
            // Update agent status to researching
            let _ = research_ops::update_agent_status(
                &project_path,
                &session_id,
                &agent.id,
                ResearchAgentStatus::Researching,
            );

            // Read session
            let session = {
                let guard = session_arc.lock().await;
                guard.clone()
            };

            // Run the researcher
            let result = spawn_researcher(
                &project_path,
                &session,
                &agent,
                &angle.0,
                &angle.1,
                &prompt,
                broadcaster,
            )
            .await;

            // Update agent status based on result
            let status = if result.is_ok() {
                ResearchAgentStatus::Complete
            } else {
                ResearchAgentStatus::Error
            };

            let _ =
                research_ops::update_agent_status(&project_path, &session_id, &agent.id, status);

            (agent.id.clone(), result)
        });

        handles.push(handle);
    }

    // Wait for all agents to complete
    let results = join_all(handles).await;

    // Collect findings and errors
    let mut findings: Vec<ResearchFinding> = Vec::new();
    let mut errors = Vec::new();

    for result in results {
        match result {
            Ok((_agent_id, Ok(finding))) => {
                // Save finding to storage
                let _ =
                    research_ops::add_research_finding(&project_path, session_id, finding.clone());
                findings.push(finding);
            }
            Ok((agent_id, Err(e))) => {
                errors.push(format!("Agent {} failed: {}", agent_id, e));
            }
            Err(e) => {
                errors.push(format!("Task panicked: {}", e));
            }
        }
    }

    if !errors.is_empty() && findings.is_empty() {
        return Err(errors.join("; "));
    }

    Ok(findings)
}

/// Run sequential research (agents build on each other's findings)
pub async fn run_sequential_research(
    project_path: &Path,
    session_id: &str,
    agents: &[ResearchAgent],
    angles: &[(String, String)],
    query: &str,
    broadcaster: Arc<EventBroadcaster>,
) -> Result<Vec<ResearchFinding>, String> {
    use super::prompts::build_researcher_prompt;

    let mut findings = Vec::new();
    let mut accumulated_context = String::new();

    for (i, agent) in agents.iter().enumerate() {
        let angle = angles.get(i).cloned().unwrap_or_else(|| {
            (
                format!("Research Angle {}", i + 1),
                "General research".to_string(),
            )
        });

        // Build prompt with accumulated context from previous agents
        let base_prompt = build_researcher_prompt(&angle.0, &angle.1, query);
        let prompt = if accumulated_context.is_empty() {
            base_prompt
        } else {
            format!(
                "{}\n\n## Previous Research Findings\nBuild on and expand the following findings from previous researchers:\n\n{}",
                base_prompt, accumulated_context
            )
        };

        // Update agent status
        research_ops::update_agent_status(
            project_path,
            session_id,
            &agent.id,
            ResearchAgentStatus::Researching,
        )?;

        // Read session
        let session = research_ops::read_research_session(project_path, session_id)?;

        // Run the researcher
        let result = spawn_researcher(
            project_path,
            &session,
            agent,
            &angle.0,
            &angle.1,
            &prompt,
            broadcaster.clone(),
        )
        .await;

        match result {
            Ok(finding) => {
                // Add to accumulated context for next agent
                accumulated_context.push_str(&format!(
                    "\n\n### {} (by {})\n{}",
                    finding.angle, agent.name, finding.content
                ));

                // Save finding
                research_ops::add_research_finding(project_path, session_id, finding.clone())?;
                findings.push(finding);

                // Update status to complete
                research_ops::update_agent_status(
                    project_path,
                    session_id,
                    &agent.id,
                    ResearchAgentStatus::Complete,
                )?;
            }
            Err(e) => {
                research_ops::update_agent_status(
                    project_path,
                    session_id,
                    &agent.id,
                    ResearchAgentStatus::Error,
                )?;
                log::error!("Agent {} failed: {}", agent.id, e);
                // Continue with other agents
            }
        }
    }

    if findings.is_empty() {
        return Err("All research agents failed".to_string());
    }

    Ok(findings)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_confidence_percentage() {
        let response = "Based on my analysis, my confidence: 85%";
        assert_eq!(extract_confidence(response), Some(85));
    }

    #[test]
    fn test_extract_confidence_no_percentage() {
        let response = "Confidence Level: 90";
        assert_eq!(extract_confidence(response), Some(90));
    }

    #[test]
    fn test_extract_confidence_none() {
        let response = "This is a finding without confidence score";
        assert_eq!(extract_confidence(response), None);
    }

    #[test]
    fn test_extract_confidence_capped_at_100() {
        let response = "Confidence: 150%";
        assert_eq!(extract_confidence(response), Some(100));
    }
}
