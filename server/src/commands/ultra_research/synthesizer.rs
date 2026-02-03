// Synthesizer module for ultra research - merges findings into final PRD

use crate::commands::prd_chat::build_agent_command;
use crate::file_storage::research_ops;
use crate::models::{DiscussionEntry, ResearchFinding, ResearchSession, SynthesisProgressPayload};
use crate::server::EventBroadcaster;
use std::path::Path;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

use super::prompts::build_synthesizer_prompt;

/// Synthesize all research findings into a final PRD
pub async fn synthesize_prd(
    project_path: &Path,
    session: &ResearchSession,
    broadcaster: Arc<EventBroadcaster>,
) -> Result<String, String> {
    // Format all findings for the synthesizer
    let all_findings = format_findings(&session.findings);

    // Format discussion log if any
    let discussion_log = if session.discussion_log.is_empty() {
        None
    } else {
        Some(format_discussion_log(&session.discussion_log))
    };

    // Build the synthesizer prompt
    let prompt = build_synthesizer_prompt(&session.query, &all_findings, discussion_log.as_deref());

    // Use the synthesize model from config, parse it
    let agent_type = session
        .config
        .synthesize_model
        .parse()
        .unwrap_or(crate::models::AgentType::Claude);

    // Build agent command
    let (cmd_name, args) = build_agent_command(
        agent_type, &prompt, None, // No session resumption for synthesis
    );

    log::info!("Starting PRD synthesis for session {}", session.id);

    // Run the synthesizer agent
    let mut cmd = Command::new(cmd_name);
    cmd.args(&args)
        .current_dir(project_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn synthesizer agent: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;

    let mut reader = BufReader::new(stdout).lines();
    let mut full_response = String::new();

    while let Ok(Some(line)) = reader.next_line().await {
        // Emit progress event
        let payload = SynthesisProgressPayload {
            session_id: session.id.clone(),
            content: line.clone(),
        };
        if let Ok(json) = serde_json::to_value(&payload) {
            broadcaster.send("ultra_research:synthesis_progress", json);
        }

        full_response.push_str(&line);
        full_response.push('\n');
    }

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for synthesizer agent: {}", e))?;

    if !status.success() {
        return Err(format!("Synthesizer agent exited with status: {}", status));
    }

    // Save the synthesized PRD
    research_ops::save_synthesized_prd(project_path, &session.id, &full_response)?;

    Ok(full_response)
}

/// Format all findings into a single string for the synthesizer
fn format_findings(findings: &[ResearchFinding]) -> String {
    let mut formatted = String::new();

    for (i, finding) in findings.iter().enumerate() {
        formatted.push_str(&format!(
            "## Research Finding {} - {} (Agent: {})\n\n",
            i + 1,
            finding.angle,
            finding.agent_id
        ));

        formatted.push_str(&format!("**Confidence:** {}%\n\n", finding.confidence));
        formatted.push_str(&finding.content);

        if let Some(sources) = &finding.sources {
            if !sources.is_empty() {
                formatted.push_str("\n\n**Sources:**\n");
                for source in sources {
                    formatted.push_str(&format!("- {}\n", source));
                }
            }
        }

        formatted.push_str("\n\n---\n\n");
    }

    formatted
}

/// Format discussion log for the synthesizer
fn format_discussion_log(entries: &[DiscussionEntry]) -> String {
    let mut formatted = String::new();

    let mut current_round = 0u8;

    for entry in entries {
        if entry.round != current_round {
            current_round = entry.round;
            formatted.push_str(&format!("\n## Discussion Round {}\n\n", current_round));
        }

        let entry_type = match entry.entry_type {
            crate::models::DiscussionEntryType::Feedback => "Feedback",
            crate::models::DiscussionEntryType::Challenge => "Challenge",
            crate::models::DiscussionEntryType::Agreement => "Agreement",
            crate::models::DiscussionEntryType::Addition => "Addition",
        };

        let target = entry
            .target_agent_id
            .as_ref()
            .map(|t| format!(" -> {}", t))
            .unwrap_or_default();

        formatted.push_str(&format!(
            "### {} from {}{}\n\n{}\n\n",
            entry_type, entry.agent_id, target, entry.content
        ));
    }

    formatted
}

/// Calculate weighted consensus score from findings
/// Used for quality metrics and future synthesis improvements
#[allow(dead_code)]
pub fn calculate_consensus_score(findings: &[ResearchFinding]) -> u8 {
    if findings.is_empty() {
        return 0;
    }

    // Weight by confidence score
    let total_weight: u32 = findings.iter().map(|f| f.confidence as u32).sum();
    let weighted_sum: u32 = findings
        .iter()
        .map(|f| (f.confidence as u32) * (f.confidence as u32))
        .sum();

    if total_weight == 0 {
        return 0;
    }

    (weighted_sum / total_weight).min(100) as u8
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn make_finding(agent_id: &str, angle: &str, confidence: u8) -> ResearchFinding {
        ResearchFinding {
            agent_id: agent_id.to_string(),
            angle: angle.to_string(),
            content: "Test finding content".to_string(),
            sources: None,
            confidence,
            timestamp: Utc::now(),
        }
    }

    #[test]
    fn test_format_findings() {
        let findings = vec![
            make_finding("agent-1", "Security", 90),
            make_finding("agent-2", "UX", 80),
        ];

        let formatted = format_findings(&findings);

        assert!(formatted.contains("Research Finding 1 - Security"));
        assert!(formatted.contains("Research Finding 2 - UX"));
        assert!(formatted.contains("Confidence:** 90%"));
        assert!(formatted.contains("Confidence:** 80%"));
    }

    #[test]
    fn test_format_discussion_log() {
        use crate::models::DiscussionEntryType;

        let entries = vec![
            DiscussionEntry {
                round: 1,
                agent_id: "agent-1".to_string(),
                target_agent_id: Some("agent-2".to_string()),
                entry_type: DiscussionEntryType::Agreement,
                content: "I agree with the findings".to_string(),
                timestamp: Utc::now(),
            },
            DiscussionEntry {
                round: 1,
                agent_id: "agent-2".to_string(),
                target_agent_id: Some("agent-1".to_string()),
                entry_type: DiscussionEntryType::Challenge,
                content: "I have concerns about...".to_string(),
                timestamp: Utc::now(),
            },
        ];

        let formatted = format_discussion_log(&entries);

        assert!(formatted.contains("Discussion Round 1"));
        assert!(formatted.contains("Agreement from agent-1"));
        assert!(formatted.contains("Challenge from agent-2"));
    }

    #[test]
    fn test_calculate_consensus_score() {
        let findings = vec![
            make_finding("agent-1", "Security", 90),
            make_finding("agent-2", "UX", 80),
            make_finding("agent-3", "Performance", 70),
        ];

        let score = calculate_consensus_score(&findings);

        // Higher confidence findings should weight more heavily
        assert!(score > 75);
        assert!(score < 95);
    }

    #[test]
    fn test_calculate_consensus_score_empty() {
        let findings: Vec<ResearchFinding> = vec![];
        assert_eq!(calculate_consensus_score(&findings), 0);
    }

    #[test]
    fn test_calculate_consensus_score_uniform() {
        let findings = vec![
            make_finding("agent-1", "A", 80),
            make_finding("agent-2", "B", 80),
            make_finding("agent-3", "C", 80),
        ];

        // With uniform confidence, score should be 80
        assert_eq!(calculate_consensus_score(&findings), 80);
    }
}
