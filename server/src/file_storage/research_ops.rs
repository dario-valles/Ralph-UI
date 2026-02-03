//! Ultra Research operations for file storage
//!
//! Research sessions are stored in `{project}/.ralph-ui/research/{id}.json`
//! Research findings are stored in `{project}/.ralph-ui/research/{id}-findings/{agent_id}.md`

use super::{atomic_write, ensure_dir, get_ralph_ui_dir, read_json, write_json, FileResult};
use crate::models::{
    DiscussionEntry, ResearchFinding, ResearchSession, ResearchSessionStatus, UltraResearchConfig,
};
use chrono::Utc;
use std::fs;
use std::path::{Path, PathBuf};

// ============================================================================
// Path Helpers
// ============================================================================

/// Get the research directory for a project
fn get_research_dir(project_path: &Path) -> PathBuf {
    get_ralph_ui_dir(project_path).join("research")
}

/// Get the path to a research session file
fn get_session_path(project_path: &Path, session_id: &str) -> PathBuf {
    get_research_dir(project_path).join(format!("{}.json", session_id))
}

/// Get the findings directory for a session
fn get_findings_dir(project_path: &Path, session_id: &str) -> PathBuf {
    get_research_dir(project_path).join(format!("{}-findings", session_id))
}

/// Get the path to an agent's findings file
fn get_findings_path(project_path: &Path, session_id: &str, agent_id: &str) -> PathBuf {
    get_findings_dir(project_path, session_id).join(format!("{}.md", agent_id))
}

/// Get the path to the synthesized PRD file
fn get_synthesis_path(project_path: &Path, session_id: &str) -> PathBuf {
    get_research_dir(project_path).join(format!("{}-synthesis.md", session_id))
}

// ============================================================================
// Session Operations
// ============================================================================

/// Check if a research session exists
pub fn research_session_exists(project_path: &Path, session_id: &str) -> bool {
    get_session_path(project_path, session_id).exists()
}

/// Create a new research session
pub fn create_research_session(project_path: &Path, session: &ResearchSession) -> FileResult<()> {
    let dir = get_research_dir(project_path);
    ensure_dir(&dir)?;

    // Also create the findings directory
    let findings_dir = get_findings_dir(project_path, &session.id);
    ensure_dir(&findings_dir)?;

    let path = get_session_path(project_path, &session.id);
    write_json(&path, session)
}

/// Read a research session by ID
pub fn read_research_session(project_path: &Path, session_id: &str) -> FileResult<ResearchSession> {
    let path = get_session_path(project_path, session_id);
    read_json(&path)
}

/// Get a research session if it exists
pub fn get_research_session_opt(
    project_path: &Path,
    session_id: &str,
) -> FileResult<Option<ResearchSession>> {
    if !research_session_exists(project_path, session_id) {
        return Ok(None);
    }
    let session = read_research_session(project_path, session_id)?;
    Ok(Some(session))
}

/// Save/update a research session
pub fn save_research_session(project_path: &Path, session: &ResearchSession) -> FileResult<()> {
    let path = get_session_path(project_path, &session.id);
    write_json(&path, session)
}

/// List all research sessions for a project
pub fn list_research_sessions(project_path: &Path) -> FileResult<Vec<ResearchSession>> {
    let dir = get_research_dir(project_path);

    if !dir.exists() {
        return Ok(Vec::new());
    }

    let entries =
        fs::read_dir(&dir).map_err(|e| format!("Failed to read research directory: {}", e))?;

    let mut sessions = Vec::new();

    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().map_or(false, |ext| ext == "json") {
            // Skip any non-session files
            if let Ok(session) = read_json::<ResearchSession>(&path) {
                sessions.push(session);
            }
        }
    }

    // Sort by created_at descending (newest first)
    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    Ok(sessions)
}

/// List research sessions for a specific chat session
pub fn list_research_sessions_by_chat(
    project_path: &Path,
    chat_session_id: &str,
) -> FileResult<Vec<ResearchSession>> {
    let sessions = list_research_sessions(project_path)?;
    Ok(sessions
        .into_iter()
        .filter(|s| s.chat_session_id == chat_session_id)
        .collect())
}

/// Delete a research session and all its files
pub fn delete_research_session(project_path: &Path, session_id: &str) -> FileResult<()> {
    // Delete the session file
    let session_path = get_session_path(project_path, session_id);
    if session_path.exists() {
        fs::remove_file(&session_path)
            .map_err(|e| format!("Failed to delete session file: {}", e))?;
    }

    // Delete the findings directory
    let findings_dir = get_findings_dir(project_path, session_id);
    if findings_dir.exists() {
        fs::remove_dir_all(&findings_dir)
            .map_err(|e| format!("Failed to delete findings directory: {}", e))?;
    }

    // Delete the synthesis file
    let synthesis_path = get_synthesis_path(project_path, session_id);
    if synthesis_path.exists() {
        fs::remove_file(&synthesis_path)
            .map_err(|e| format!("Failed to delete synthesis file: {}", e))?;
    }

    Ok(())
}

// ============================================================================
// Status Updates
// ============================================================================

/// Update the session status
pub fn update_research_status(
    project_path: &Path,
    session_id: &str,
    status: ResearchSessionStatus,
) -> FileResult<()> {
    let mut session = read_research_session(project_path, session_id)?;
    session.update_status(status);
    save_research_session(project_path, &session)
}

/// Set error status with message
pub fn set_research_error(project_path: &Path, session_id: &str, error: String) -> FileResult<()> {
    let mut session = read_research_session(project_path, session_id)?;
    session.set_error(error);
    save_research_session(project_path, &session)
}

/// Update research angles
pub fn update_research_angles(
    project_path: &Path,
    session_id: &str,
    angles: Vec<String>,
) -> FileResult<()> {
    let mut session = read_research_session(project_path, session_id)?;
    session.angles = angles;
    session.updated_at = Utc::now();
    save_research_session(project_path, &session)
}

/// Update agent status within the session
pub fn update_agent_status(
    project_path: &Path,
    session_id: &str,
    agent_id: &str,
    status: crate::models::ResearchAgentStatus,
) -> FileResult<()> {
    let mut session = read_research_session(project_path, session_id)?;

    if let Some(agent) = session.config.agents.iter_mut().find(|a| a.id == agent_id) {
        agent.status = status;
    }
    session.updated_at = Utc::now();

    save_research_session(project_path, &session)
}

// ============================================================================
// Findings Operations
// ============================================================================

/// Add a research finding to the session
pub fn add_research_finding(
    project_path: &Path,
    session_id: &str,
    finding: ResearchFinding,
) -> FileResult<()> {
    let mut session = read_research_session(project_path, session_id)?;
    session.add_finding(finding.clone());
    save_research_session(project_path, &session)?;

    // Also save the finding as a markdown file for easy viewing
    save_finding_markdown(project_path, session_id, &finding)
}

/// Save a finding as a markdown file
fn save_finding_markdown(
    project_path: &Path,
    session_id: &str,
    finding: &ResearchFinding,
) -> FileResult<()> {
    let findings_dir = get_findings_dir(project_path, session_id);
    ensure_dir(&findings_dir)?;

    let path = get_findings_path(project_path, session_id, &finding.agent_id);

    let mut content = format!("# Research Findings: {}\n\n", finding.angle);
    content.push_str(&format!("**Agent:** {}\n", finding.agent_id));
    content.push_str(&format!("**Confidence:** {}%\n", finding.confidence));
    content.push_str(&format!("**Timestamp:** {}\n\n", finding.timestamp));
    content.push_str("---\n\n");
    content.push_str(&finding.content);

    if let Some(sources) = &finding.sources {
        if !sources.is_empty() {
            content.push_str("\n\n## Sources\n\n");
            for source in sources {
                content.push_str(&format!("- {}\n", source));
            }
        }
    }

    atomic_write(&path, &content)
}

/// Get all findings for a session
pub fn get_research_findings(
    project_path: &Path,
    session_id: &str,
) -> FileResult<Vec<ResearchFinding>> {
    let session = read_research_session(project_path, session_id)?;
    Ok(session.findings)
}

// ============================================================================
// Discussion Operations
// ============================================================================

/// Add a discussion entry to the session
pub fn add_discussion_entry(
    project_path: &Path,
    session_id: &str,
    entry: DiscussionEntry,
) -> FileResult<()> {
    let mut session = read_research_session(project_path, session_id)?;
    session.add_discussion_entry(entry);
    save_research_session(project_path, &session)
}

/// Get all discussion entries for a session
pub fn get_discussion_log(
    project_path: &Path,
    session_id: &str,
) -> FileResult<Vec<DiscussionEntry>> {
    let session = read_research_session(project_path, session_id)?;
    Ok(session.discussion_log)
}

// ============================================================================
// Synthesis Operations
// ============================================================================

/// Save the synthesized PRD content
pub fn save_synthesized_prd(
    project_path: &Path,
    session_id: &str,
    content: &str,
) -> FileResult<()> {
    // Update the session with the synthesized content
    let mut session = read_research_session(project_path, session_id)?;
    session.synthesized_prd = Some(content.to_string());
    session.updated_at = Utc::now();
    save_research_session(project_path, &session)?;

    // Also save as a markdown file
    let path = get_synthesis_path(project_path, session_id);
    atomic_write(&path, content)
}

/// Get the synthesized PRD content
pub fn get_synthesized_prd(project_path: &Path, session_id: &str) -> FileResult<Option<String>> {
    let session = read_research_session(project_path, session_id)?;
    Ok(session.synthesized_prd)
}

// ============================================================================
// Config Operations
// ============================================================================

/// Get the active ultra research config for a chat session
pub fn get_active_research_config(
    project_path: &Path,
    chat_session_id: &str,
) -> FileResult<Option<UltraResearchConfig>> {
    // Find the most recent non-terminal research session for this chat
    let sessions = list_research_sessions_by_chat(project_path, chat_session_id)?;

    for session in sessions {
        if !session.status.is_terminal() {
            return Ok(Some(session.config));
        }
    }

    Ok(None)
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{
        ResearchAgent, ResearchAgentRole, ResearchAgentStatus, ResearchExecutionMode,
    };
    use tempfile::TempDir;

    fn create_test_config() -> UltraResearchConfig {
        UltraResearchConfig {
            id: "config-1".to_string(),
            enabled: true,
            mode: ResearchExecutionMode::Parallel,
            agents: vec![ResearchAgent {
                id: "agent-1".to_string(),
                name: "Claude".to_string(),
                agent_type: crate::models::AgentType::Claude,
                provider_id: Some("zai".to_string()),
                role: ResearchAgentRole::Researcher,
                angle: Some("Security".to_string()),
                status: ResearchAgentStatus::Idle,
            }],
            discussion_rounds: 1,
            synthesize_model: "claude".to_string(),
        }
    }

    fn create_test_session(id: &str) -> ResearchSession {
        ResearchSession::new(
            id.to_string(),
            "chat-123".to_string(),
            create_test_config(),
            "Test query".to_string(),
            "/test/project".to_string(),
        )
    }

    #[test]
    fn test_create_and_read_session() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("research-1");
        create_research_session(temp_dir.path(), &session).unwrap();

        let read = read_research_session(temp_dir.path(), "research-1").unwrap();
        assert_eq!(read.id, "research-1");
        assert_eq!(read.query, "Test query");
    }

    #[test]
    fn test_list_sessions() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        create_research_session(temp_dir.path(), &create_test_session("research-1")).unwrap();
        create_research_session(temp_dir.path(), &create_test_session("research-2")).unwrap();

        let sessions = list_research_sessions(temp_dir.path()).unwrap();
        assert_eq!(sessions.len(), 2);
    }

    #[test]
    fn test_update_status() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("research-1");
        create_research_session(temp_dir.path(), &session).unwrap();

        update_research_status(
            temp_dir.path(),
            "research-1",
            ResearchSessionStatus::Researching,
        )
        .unwrap();

        let read = read_research_session(temp_dir.path(), "research-1").unwrap();
        assert_eq!(read.status, ResearchSessionStatus::Researching);
    }

    #[test]
    fn test_add_finding() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("research-1");
        create_research_session(temp_dir.path(), &session).unwrap();

        let finding = ResearchFinding {
            agent_id: "agent-1".to_string(),
            angle: "Security".to_string(),
            content: "Found important security considerations...".to_string(),
            sources: Some(vec!["https://example.com".to_string()]),
            confidence: 85,
            timestamp: Utc::now(),
        };

        add_research_finding(temp_dir.path(), "research-1", finding).unwrap();

        let findings = get_research_findings(temp_dir.path(), "research-1").unwrap();
        assert_eq!(findings.len(), 1);
        assert_eq!(findings[0].confidence, 85);

        // Check that markdown file was created
        let findings_path = get_findings_path(temp_dir.path(), "research-1", "agent-1");
        assert!(findings_path.exists());
    }

    #[test]
    fn test_delete_session() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("research-1");
        create_research_session(temp_dir.path(), &session).unwrap();

        // Add a finding to create the findings directory
        let finding = ResearchFinding {
            agent_id: "agent-1".to_string(),
            angle: "Security".to_string(),
            content: "Test content".to_string(),
            sources: None,
            confidence: 80,
            timestamp: Utc::now(),
        };
        add_research_finding(temp_dir.path(), "research-1", finding).unwrap();

        delete_research_session(temp_dir.path(), "research-1").unwrap();

        assert!(!research_session_exists(temp_dir.path(), "research-1"));
    }

    #[test]
    fn test_save_synthesized_prd() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let session = create_test_session("research-1");
        create_research_session(temp_dir.path(), &session).unwrap();

        let prd_content = "# Synthesized PRD\n\nThis is the final PRD content.";
        save_synthesized_prd(temp_dir.path(), "research-1", prd_content).unwrap();

        let retrieved = get_synthesized_prd(temp_dir.path(), "research-1").unwrap();
        assert_eq!(retrieved, Some(prd_content.to_string()));

        // Check that markdown file was created
        let synthesis_path = get_synthesis_path(temp_dir.path(), "research-1");
        assert!(synthesis_path.exists());
    }
}
