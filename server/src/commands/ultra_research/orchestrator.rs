// Orchestrator module for ultra research - main entry points

use crate::commands::prd_chat::build_agent_command;
use crate::file_storage::research_ops;
use crate::models::{
    ResearchExecutionMode, ResearchProgress, ResearchSession, ResearchSessionStatus,
    ResearchSessionUpdatePayload, StartUltraResearchRequest, StartUltraResearchResponse,
};
use crate::server::EventBroadcaster;
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use uuid::Uuid;

use super::agent_spawner::{run_parallel_research, run_sequential_research};
use super::discussion::run_all_discussion_rounds;
use super::prompts::build_orchestrator_prompt;
use super::synthesizer::synthesize_prd;

// ============================================================================
// Public API
// ============================================================================

/// Start an ultra research session
pub async fn start_ultra_research(
    request: StartUltraResearchRequest,
    broadcaster: Arc<EventBroadcaster>,
) -> Result<StartUltraResearchResponse, String> {
    // Validate configuration
    request.config.validate()?;

    let project_path = Path::new(&request.project_path);

    // Generate session ID
    let session_id = format!("research-{}", Uuid::new_v4());
    let mut config = request.config;
    config.id = session_id.clone();

    // Assign IDs to agents if not set
    for (i, agent) in config.agents.iter_mut().enumerate() {
        if agent.id.is_empty() {
            agent.id = format!("agent-{}", i + 1);
        }
    }

    // Create the research session
    let session = ResearchSession::new(
        session_id.clone(),
        request.chat_session_id,
        config.clone(),
        request.query.clone(),
        request.project_path.clone(),
    );

    // Save the session
    research_ops::create_research_session(project_path, &session)?;

    // Emit started event
    emit_session_update(&session, &broadcaster);
    if let Ok(json) = serde_json::to_value(serde_json::json!({
        "sessionId": session_id,
        "query": request.query,
        "agentCount": config.agents.len()
    })) {
        broadcaster.send("ultra_research:started", json);
    }

    // Clone values for the spawned task
    let session_id_clone = session_id.clone();
    let project_path_owned = request.project_path.clone();
    let query = request.query.clone();
    let broadcaster_clone = broadcaster.clone();

    // Spawn the research workflow in background
    tokio::spawn(async move {
        let project_path = Path::new(&project_path_owned);

        if let Err(e) =
            run_research_workflow(project_path, &session_id_clone, &query, broadcaster_clone).await
        {
            log::error!("Research workflow failed: {}", e);

            // Update session with error
            let _ = research_ops::set_research_error(project_path, &session_id_clone, e);
        }
    });

    // Return the created session
    let session = research_ops::read_research_session(project_path, &session_id)?;

    Ok(StartUltraResearchResponse { session })
}

/// Get the current progress of a research session
pub fn get_research_progress(
    project_path: &str,
    session_id: &str,
) -> Result<ResearchProgress, String> {
    let project_path = Path::new(project_path);
    let session = research_ops::read_research_session(project_path, session_id)?;
    Ok(ResearchProgress::from_session(&session))
}

/// Get a research session by ID
pub fn get_research_session(
    project_path: &str,
    session_id: &str,
) -> Result<ResearchSession, String> {
    let project_path = Path::new(project_path);
    research_ops::read_research_session(project_path, session_id)
}

/// List all research sessions for a project
pub fn list_research_sessions(project_path: &str) -> Result<Vec<ResearchSession>, String> {
    let project_path = Path::new(project_path);
    research_ops::list_research_sessions(project_path)
}

/// Cancel an ongoing research session
pub fn cancel_ultra_research(project_path: &str, session_id: &str) -> Result<(), String> {
    let project_path = Path::new(project_path);

    let mut session = research_ops::read_research_session(project_path, session_id)?;

    if session.status.is_terminal() {
        return Err("Session is already complete or cancelled".to_string());
    }

    session.update_status(ResearchSessionStatus::Cancelled);
    research_ops::save_research_session(project_path, &session)?;

    Ok(())
}

// ============================================================================
// Internal Workflow
// ============================================================================

/// Run the complete research workflow
async fn run_research_workflow(
    project_path: &Path,
    session_id: &str,
    query: &str,
    broadcaster: Arc<EventBroadcaster>,
) -> Result<(), String> {
    // Phase 1: Planning - decompose query into research angles
    log::info!(
        "Phase 1: Planning research angles for session {}",
        session_id
    );

    research_ops::update_research_status(
        project_path,
        session_id,
        ResearchSessionStatus::Planning,
    )?;
    emit_progress_update(project_path, session_id, &broadcaster);

    let session = research_ops::read_research_session(project_path, session_id)?;
    let angles = decompose_into_angles(
        project_path,
        query,
        session.config.agents.len(),
        &broadcaster,
    )
    .await?;

    // Save angles to session
    research_ops::update_research_angles(
        project_path,
        session_id,
        angles.iter().map(|(a, _)| a.clone()).collect(),
    )?;

    // Emit angles assigned event
    if let Ok(json) = serde_json::to_value(serde_json::json!({
        "sessionId": session_id,
        "angles": angles.iter().map(|(a, d)| serde_json::json!({"name": a, "description": d})).collect::<Vec<_>>()
    })) {
        broadcaster.send("ultra_research:angle_assigned", json);
    }

    // Phase 2: Research - run agents on assigned angles
    log::info!("Phase 2: Running research for session {}", session_id);

    research_ops::update_research_status(
        project_path,
        session_id,
        ResearchSessionStatus::Researching,
    )?;
    emit_progress_update(project_path, session_id, &broadcaster);

    let session = research_ops::read_research_session(project_path, session_id)?;

    let findings = match session.config.mode {
        ResearchExecutionMode::Parallel => {
            run_parallel_research(
                project_path,
                session_id,
                &session.config.agents,
                &angles,
                query,
                broadcaster.clone(),
            )
            .await?
        }
        ResearchExecutionMode::Sequential => {
            run_sequential_research(
                project_path,
                session_id,
                &session.config.agents,
                &angles,
                query,
                broadcaster.clone(),
            )
            .await?
        }
    };

    log::info!(
        "Research complete: {} findings from {} agents",
        findings.len(),
        session.config.agents.len()
    );

    // Phase 3: Discussion (if configured)
    let session = research_ops::read_research_session(project_path, session_id)?;

    if session.config.discussion_rounds > 0 {
        log::info!(
            "Phase 3: Running {} discussion rounds",
            session.config.discussion_rounds
        );

        research_ops::update_research_status(
            project_path,
            session_id,
            ResearchSessionStatus::Discussing,
        )?;
        emit_progress_update(project_path, session_id, &broadcaster);

        let _discussion_entries =
            run_all_discussion_rounds(project_path, session_id, broadcaster.clone()).await?;
    }

    // Phase 4: Synthesis - merge findings into PRD
    log::info!("Phase 4: Synthesizing PRD for session {}", session_id);

    research_ops::update_research_status(
        project_path,
        session_id,
        ResearchSessionStatus::Synthesizing,
    )?;
    emit_progress_update(project_path, session_id, &broadcaster);

    // Emit synthesis started event
    if let Ok(json) = serde_json::to_value(serde_json::json!({
        "sessionId": session_id
    })) {
        broadcaster.send("ultra_research:synthesis_started", json);
    }

    let session = research_ops::read_research_session(project_path, session_id)?;
    let _prd_content = synthesize_prd(project_path, &session, broadcaster.clone()).await?;

    // Phase 5: Complete
    research_ops::update_research_status(
        project_path,
        session_id,
        ResearchSessionStatus::Complete,
    )?;

    // Emit completed event
    if let Ok(json) = serde_json::to_value(serde_json::json!({
        "sessionId": session_id
    })) {
        broadcaster.send("ultra_research:completed", json);
    }

    emit_progress_update(project_path, session_id, &broadcaster);

    log::info!("Research complete for session {}", session_id);

    Ok(())
}

/// Decompose a query into research angles using the orchestrator agent
async fn decompose_into_angles(
    project_path: &Path,
    query: &str,
    agent_count: usize,
    _broadcaster: &Arc<EventBroadcaster>,
) -> Result<Vec<(String, String)>, String> {
    // Build the orchestrator prompt
    let prompt = build_orchestrator_prompt(query, agent_count);

    // Use Claude for orchestration
    let (cmd_name, args) = build_agent_command(crate::models::AgentType::Claude, &prompt, None);

    // Run the orchestrator agent
    let mut cmd = Command::new(cmd_name);
    cmd.args(&args)
        .current_dir(project_path)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn orchestrator agent: {}", e))?;

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
        .map_err(|e| format!("Failed to wait for orchestrator: {}", e))?;

    if !status.success() {
        return Err(format!("Orchestrator exited with status: {}", status));
    }

    // Parse angles from response
    parse_angles_from_response(&response, agent_count)
}

/// Parse research angles from orchestrator response
fn parse_angles_from_response(
    response: &str,
    agent_count: usize,
) -> Result<Vec<(String, String)>, String> {
    // Try to parse JSON from response
    if let Some(json_start) = response.find('{') {
        if let Some(json_end) = response.rfind('}') {
            let json_str = &response[json_start..=json_end];

            if let Ok(parsed) = serde_json::from_str::<Value>(json_str) {
                if let Some(angles_arr) = parsed.get("angles").and_then(|a| a.as_array()) {
                    let angles: Vec<(String, String)> = angles_arr
                        .iter()
                        .filter_map(|a| {
                            let name = a.get("name").and_then(|n| n.as_str())?;
                            let desc = a
                                .get("description")
                                .and_then(|d| d.as_str())
                                .unwrap_or("Research this area");
                            Some((name.to_string(), desc.to_string()))
                        })
                        .collect();

                    if !angles.is_empty() {
                        return Ok(angles);
                    }
                }
            }
        }
    }

    // Fallback: generate default angles
    log::warn!("Could not parse angles from orchestrator response, using defaults");
    Ok(generate_default_angles(agent_count))
}

/// Generate default research angles based on agent count
fn generate_default_angles(agent_count: usize) -> Vec<(String, String)> {
    let defaults = vec![
        (
            "Security & Compliance".to_string(),
            "Research authentication, authorization, data protection, and compliance requirements"
                .to_string(),
        ),
        (
            "User Experience".to_string(),
            "Research UX patterns, accessibility, and user workflows".to_string(),
        ),
        (
            "Performance & Scalability".to_string(),
            "Research performance requirements, caching strategies, and scaling approaches"
                .to_string(),
        ),
        (
            "Architecture & Integration".to_string(),
            "Research architecture patterns, API design, and system integrations".to_string(),
        ),
        (
            "Testing & Quality".to_string(),
            "Research testing strategies, quality metrics, and CI/CD requirements".to_string(),
        ),
    ];

    defaults.into_iter().take(agent_count).collect()
}

/// Emit a progress update event
fn emit_progress_update(
    project_path: &Path,
    session_id: &str,
    broadcaster: &Arc<EventBroadcaster>,
) {
    if let Ok(session) = research_ops::read_research_session(project_path, session_id) {
        emit_session_update(&session, broadcaster);
    }
}

/// Emit session update event
fn emit_session_update(session: &ResearchSession, broadcaster: &Arc<EventBroadcaster>) {
    let progress = ResearchProgress::from_session(session);
    let payload = ResearchSessionUpdatePayload {
        session_id: session.id.clone(),
        progress,
    };

    if let Ok(json) = serde_json::to_value(&payload) {
        broadcaster.send("ultra_research:session_update", json);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_angles_from_valid_json() {
        let response = r#"
        Here's the decomposition:
        {
            "angles": [
                {"name": "Security", "description": "Auth patterns"},
                {"name": "UX", "description": "User flows"}
            ],
            "rationale": "These cover the main areas"
        }
        "#;

        let angles = parse_angles_from_response(response, 2).unwrap();
        assert_eq!(angles.len(), 2);
        assert_eq!(angles[0].0, "Security");
        assert_eq!(angles[1].0, "UX");
    }

    #[test]
    fn test_parse_angles_fallback() {
        let response = "Invalid response without JSON";

        let angles = parse_angles_from_response(response, 3).unwrap();
        assert_eq!(angles.len(), 3);
        // Should get default angles
        assert_eq!(angles[0].0, "Security & Compliance");
    }

    #[test]
    fn test_generate_default_angles() {
        let angles = generate_default_angles(3);
        assert_eq!(angles.len(), 3);
        assert_eq!(angles[0].0, "Security & Compliance");
        assert_eq!(angles[1].0, "User Experience");
        assert_eq!(angles[2].0, "Performance & Scalability");
    }
}
