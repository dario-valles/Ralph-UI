// Discussion module for ultra research - handles agent-to-agent discussions

use crate::commands::prd_chat::build_agent_command;
use crate::file_storage::research_ops;
use crate::models::{
    DiscussionEntry, DiscussionEntryPayload, DiscussionEntryType, ResearchAgent,
    ResearchAgentStatus, ResearchSession,
};
use crate::server::EventBroadcaster;
use chrono::Utc;
use std::path::Path;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use super::prompts::build_discussant_prompt;

/// Run a discussion round between agents
pub async fn run_discussion_round(
    project_path: &Path,
    session: &ResearchSession,
    round: u8,
    broadcaster: Arc<EventBroadcaster>,
) -> Result<Vec<DiscussionEntry>, String> {
    let findings = &session.findings;
    let agents = &session.config.agents;

    if findings.len() < 2 {
        log::info!("Skipping discussion - fewer than 2 findings");
        return Ok(Vec::new());
    }

    let mut entries = Vec::new();

    // Each agent reviews other agents' findings
    for (i, agent) in agents.iter().enumerate() {
        // Find this agent's findings
        let my_findings = findings
            .iter()
            .find(|f| f.agent_id == agent.id)
            .map(|f| f.content.clone())
            .unwrap_or_else(|| "No findings available".to_string());

        // Review each other agent's findings
        for (j, other_agent) in agents.iter().enumerate() {
            if i == j {
                continue; // Don't review own findings
            }

            let their_findings = findings
                .iter()
                .find(|f| f.agent_id == other_agent.id)
                .map(|f| f.content.clone())
                .unwrap_or_else(|| "No findings available".to_string());

            // Update agent status
            let _ = research_ops::update_agent_status(
                project_path,
                &session.id,
                &agent.id,
                ResearchAgentStatus::Discussing,
            );

            // Generate discussion entry
            let entry_result = generate_discussion_entry(
                project_path,
                agent,
                other_agent,
                &my_findings,
                &their_findings,
                round,
                &session.query,
                broadcaster.clone(),
            )
            .await;

            match entry_result {
                Ok(entry) => {
                    // Emit event
                    let payload = DiscussionEntryPayload {
                        session_id: session.id.clone(),
                        entry: entry.clone(),
                    };
                    if let Ok(json) = serde_json::to_value(&payload) {
                        broadcaster.send("ultra_research:discussion_entry", json);
                    }

                    // Save entry
                    let _ = research_ops::add_discussion_entry(
                        project_path,
                        &session.id,
                        entry.clone(),
                    );

                    entries.push(entry);
                }
                Err(e) => {
                    log::error!(
                        "Discussion entry failed for {} reviewing {}: {}",
                        agent.id,
                        other_agent.id,
                        e
                    );
                    // Continue with other discussions
                }
            }
        }

        // Update agent status to complete
        let _ = research_ops::update_agent_status(
            project_path,
            &session.id,
            &agent.id,
            ResearchAgentStatus::Complete,
        );
    }

    Ok(entries)
}

/// Generate a single discussion entry from one agent reviewing another's findings
async fn generate_discussion_entry(
    project_path: &Path,
    reviewing_agent: &ResearchAgent,
    target_agent: &ResearchAgent,
    reviewer_findings: &str,
    target_findings: &str,
    round: u8,
    _query: &str,
    _broadcaster: Arc<EventBroadcaster>,
) -> Result<DiscussionEntry, String> {
    // Build the discussion prompt
    let prompt = build_discussant_prompt(
        &reviewing_agent.id,
        &target_agent.id,
        reviewer_findings,
        target_findings,
    );

    // Build agent command
    let (cmd_name, args) = build_agent_command(reviewing_agent.agent_type, &prompt, None);

    // Run the agent
    let mut cmd = Command::new(cmd_name);
    cmd.args(&args)
        .current_dir(project_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn discussion agent: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;

    let mut reader = BufReader::new(stdout).lines();
    let mut response = String::new();

    while let Ok(Some(line)) = reader.next_line().await {
        response.push_str(&line);
        response.push('\n');
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for discussion agent: {}", e))?;

    if !status.success() {
        return Err(format!("Discussion agent exited with status: {}", status));
    }

    // Determine entry type based on response content
    let entry_type = classify_discussion_entry(&response);

    Ok(DiscussionEntry {
        round,
        agent_id: reviewing_agent.id.clone(),
        target_agent_id: Some(target_agent.id.clone()),
        entry_type,
        content: response,
        timestamp: Utc::now(),
    })
}

/// Classify the type of discussion entry based on content
fn classify_discussion_entry(content: &str) -> DiscussionEntryType {
    let content_lower = content.to_lowercase();

    // Check for challenge indicators
    if content_lower.contains("disagree")
        || content_lower.contains("question")
        || content_lower.contains("challenge")
        || content_lower.contains("concern")
        || content_lower.contains("alternative")
    {
        return DiscussionEntryType::Challenge;
    }

    // Check for agreement indicators
    if content_lower.contains("agree")
        || content_lower.contains("confirm")
        || content_lower.contains("support")
        || content_lower.contains("well done")
    {
        return DiscussionEntryType::Agreement;
    }

    // Check for addition indicators
    if content_lower.contains("additionally")
        || content_lower.contains("also consider")
        || content_lower.contains("another perspective")
        || content_lower.contains("add to")
    {
        return DiscussionEntryType::Addition;
    }

    // Default to feedback
    DiscussionEntryType::Feedback
}

/// Run all configured discussion rounds
pub async fn run_all_discussion_rounds(
    project_path: &Path,
    session_id: &str,
    broadcaster: Arc<EventBroadcaster>,
) -> Result<Vec<DiscussionEntry>, String> {
    let session = research_ops::read_research_session(project_path, session_id)?;
    let rounds = session.config.discussion_rounds;

    if rounds == 0 {
        log::info!("No discussion rounds configured");
        return Ok(Vec::new());
    }

    let mut all_entries = Vec::new();

    for round in 1..=rounds {
        log::info!(
            "Running discussion round {}/{} for session {}",
            round,
            rounds,
            session_id
        );

        // Emit event for round start
        if let Ok(json) = serde_json::to_value(serde_json::json!({
            "sessionId": session_id,
            "round": round,
            "totalRounds": rounds
        })) {
            broadcaster.send("ultra_research:discussion_started", json);
        }

        // Re-read session to get latest findings
        let session = research_ops::read_research_session(project_path, session_id)?;

        let entries =
            run_discussion_round(project_path, &session, round, broadcaster.clone()).await?;

        all_entries.extend(entries);
    }

    Ok(all_entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_classify_discussion_challenge() {
        let content = "I disagree with this approach because...";
        assert_eq!(
            classify_discussion_entry(content),
            DiscussionEntryType::Challenge
        );

        let content = "I have a concern about the security implications";
        assert_eq!(
            classify_discussion_entry(content),
            DiscussionEntryType::Challenge
        );
    }

    #[test]
    fn test_classify_discussion_agreement() {
        let content = "I agree with the recommendation to use JWT tokens";
        assert_eq!(
            classify_discussion_entry(content),
            DiscussionEntryType::Agreement
        );
    }

    #[test]
    fn test_classify_discussion_addition() {
        let content = "Additionally, we should also consider rate limiting";
        assert_eq!(
            classify_discussion_entry(content),
            DiscussionEntryType::Addition
        );
    }

    #[test]
    fn test_classify_discussion_feedback() {
        let content = "The findings are comprehensive and well-structured";
        assert_eq!(
            classify_discussion_entry(content),
            DiscussionEntryType::Feedback
        );
    }
}
