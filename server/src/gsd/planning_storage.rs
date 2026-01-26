//! Planning document storage for GSD workflow
//!
//! Manages the `.ralph-ui/planning/{session-id}/` directory structure for storing
//! planning documents generated during the GSD workflow.

use super::state::{GsdWorkflowState, QuestioningContext};
use crate::file_storage::{atomic_write, ensure_dir, get_ralph_ui_dir, read_json, FileResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Planning file types
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PlanningFile {
    /// PROJECT.md - Project vision and constraints
    Project,
    /// SUMMARY.md - Synthesized research summary
    Summary,
    /// requirements.json - Structured requirements data
    Requirements,
    /// REQUIREMENTS.md - Human-readable requirements markdown
    RequirementsMd,
    /// SCOPED.md - User-selected scope
    Scoped,
    /// ROADMAP.md - Phased execution plan
    Roadmap,
    /// VERIFICATION.md - Gap analysis results
    Verification,
    /// state.json - Workflow state
    State,
    /// Research file by name (e.g., "features.md")
    Research(String),
}

impl PlanningFile {
    /// Get the filename for this planning file
    pub fn filename(&self) -> String {
        match self {
            PlanningFile::Project => "PROJECT.md".to_string(),
            PlanningFile::Summary => "SUMMARY.md".to_string(),
            PlanningFile::Requirements => "requirements.json".to_string(),
            PlanningFile::RequirementsMd => "REQUIREMENTS.md".to_string(),
            PlanningFile::Scoped => "SCOPED.md".to_string(),
            PlanningFile::Roadmap => "ROADMAP.md".to_string(),
            PlanningFile::Verification => "VERIFICATION.md".to_string(),
            PlanningFile::State => "state.json".to_string(),
            PlanningFile::Research(name) => format!("research/{}", name),
        }
    }
}

/// Get the planning directory for a project
pub fn get_planning_base_dir(project_path: &Path) -> PathBuf {
    get_ralph_ui_dir(project_path).join("planning")
}

/// Get the planning directory for a specific session
pub fn get_planning_dir(project_path: &Path, session_id: &str) -> PathBuf {
    get_planning_base_dir(project_path).join(session_id)
}

/// Get the research directory for a session
pub fn get_research_dir(project_path: &Path, session_id: &str) -> PathBuf {
    get_planning_dir(project_path, session_id).join("research")
}

/// Get the path for a planning file
pub fn get_planning_file_path(
    project_path: &Path,
    session_id: &str,
    file: PlanningFile,
) -> PathBuf {
    get_planning_dir(project_path, session_id).join(file.filename())
}

/// Get the path for a research output file
pub fn get_research_file_path(
    project_path: &Path,
    session_id: &str,
    filename: &str,
) -> PathBuf {
    get_research_dir(project_path, session_id).join(filename)
}

/// Initialize a planning session directory
pub fn init_planning_session(project_path: &Path, session_id: &str) -> FileResult<PathBuf> {
    let planning_dir = get_planning_dir(project_path, session_id);
    ensure_dir(&planning_dir)?;

    // Create research subdirectory
    let research_dir = get_research_dir(project_path, session_id);
    ensure_dir(&research_dir)?;

    log::info!(
        "Initialized planning session directory: {:?}",
        planning_dir
    );
    Ok(planning_dir)
}

/// Write a planning file
pub fn write_planning_file(
    project_path: &Path,
    session_id: &str,
    file: PlanningFile,
    content: &str,
) -> FileResult<PathBuf> {
    let file_path = get_planning_file_path(project_path, session_id, file);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        ensure_dir(parent)?;
    }

    atomic_write(&file_path, content)?;

    log::debug!("Wrote planning file: {:?}", file_path);
    Ok(file_path)
}

/// Read a planning file
pub fn read_planning_file(
    project_path: &Path,
    session_id: &str,
    file: PlanningFile,
) -> FileResult<String> {
    let file_path = get_planning_file_path(project_path, session_id, file);

    fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read planning file {:?}: {}", file_path, e))
}

/// Check if a planning file exists
pub fn planning_file_exists(project_path: &Path, session_id: &str, file: PlanningFile) -> bool {
    get_planning_file_path(project_path, session_id, file).exists()
}

/// Write a research output file
pub fn write_research_file(
    project_path: &Path,
    session_id: &str,
    filename: &str,
    content: &str,
) -> FileResult<PathBuf> {
    let file_path = get_research_file_path(project_path, session_id, filename);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        ensure_dir(parent)?;
    }

    atomic_write(&file_path, content)?;

    log::debug!("Wrote research file: {:?}", file_path);
    Ok(file_path)
}

/// Read a research output file
pub fn read_research_file(
    project_path: &Path,
    session_id: &str,
    filename: &str,
) -> FileResult<String> {
    let file_path = get_research_file_path(project_path, session_id, filename);

    fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read research file {:?}: {}", file_path, e))
}

/// List all research files for a session
pub fn list_research_files(project_path: &Path, session_id: &str) -> FileResult<Vec<String>> {
    let research_dir = get_research_dir(project_path, session_id);

    if !research_dir.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&research_dir)
        .map_err(|e| format!("Failed to read research directory: {}", e))?;

    let mut files = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_file() {
            if let Some(name) = path.file_name() {
                files.push(name.to_string_lossy().to_string());
            }
        }
    }

    files.sort();
    Ok(files)
}

/// Save workflow state to file
pub fn save_workflow_state(
    project_path: &Path,
    session_id: &str,
    state: &GsdWorkflowState,
) -> FileResult<PathBuf> {
    let file_path = get_planning_file_path(project_path, session_id, PlanningFile::State);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        ensure_dir(parent)?;
    }

    let content = serde_json::to_string_pretty(state)
        .map_err(|e| format!("Failed to serialize workflow state: {}", e))?;

    atomic_write(&file_path, &content)?;

    log::debug!("Saved workflow state: {:?}", file_path);
    Ok(file_path)
}

/// Load workflow state from file
pub fn load_workflow_state(
    project_path: &Path,
    session_id: &str,
) -> FileResult<GsdWorkflowState> {
    let file_path = get_planning_file_path(project_path, session_id, PlanningFile::State);
    read_json(&file_path)
}

/// Delete a planning session directory
pub fn delete_planning_session(project_path: &Path, session_id: &str) -> FileResult<()> {
    let planning_dir = get_planning_dir(project_path, session_id);

    if planning_dir.exists() {
        fs::remove_dir_all(&planning_dir)
            .map_err(|e| format!("Failed to delete planning directory: {}", e))?;
        log::info!("Deleted planning session: {:?}", planning_dir);
    }

    Ok(())
}

/// List all planning sessions for a project
pub fn list_planning_sessions(project_path: &Path) -> FileResult<Vec<PlanningSessionInfo>> {
    let planning_base = get_planning_base_dir(project_path);

    if !planning_base.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&planning_base)
        .map_err(|e| format!("Failed to read planning directory: {}", e))?;

    let mut sessions = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            if let Some(session_id) = path.file_name() {
                let session_id = session_id.to_string_lossy().to_string();

                // Try to load the state to get more info
                let state = load_workflow_state(project_path, &session_id).ok();

                sessions.push(PlanningSessionInfo {
                    session_id: session_id.clone(),
                    phase: state.as_ref().map(|s| s.current_phase),
                    is_complete: state.as_ref().map(|s| s.is_complete).unwrap_or(false),
                    updated_at: state.map(|s| s.updated_at.to_rfc3339()),
                });
            }
        }
    }

    // Sort by updated_at descending (most recent first)
    sessions.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(sessions)
}

/// Information about a planning session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanningSessionInfo {
    pub session_id: String,
    pub phase: Option<super::state::GsdPhase>,
    pub is_complete: bool,
    pub updated_at: Option<String>,
}

/// Information about research in a session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchSessionInfo {
    pub session_id: String,
    pub created_at: Option<String>,
    pub has_architecture: bool,
    pub has_codebase: bool,
    pub has_best_practices: bool,
    pub has_risks: bool,
    pub has_synthesis: bool,
    /// Total size of research files in bytes
    pub total_size_bytes: u64,
}

/// List all sessions that have research results
pub fn list_project_research(project_path: &Path) -> FileResult<Vec<ResearchSessionInfo>> {
    let planning_base = get_planning_base_dir(project_path);

    if !planning_base.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&planning_base)
        .map_err(|e| format!("Failed to read planning directory: {}", e))?;

    let mut sessions = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            if let Some(session_id) = path.file_name() {
                let session_id = session_id.to_string_lossy().to_string();
                let research_dir = get_research_dir(project_path, &session_id);

                // Check if research directory exists and has files
                if !research_dir.exists() {
                    continue;
                }

                let has_architecture = research_dir.join("architecture.md").exists();
                let has_codebase = research_dir.join("codebase.md").exists();
                let has_best_practices = research_dir.join("best_practices.md").exists();
                let has_risks = research_dir.join("risks.md").exists();
                let has_synthesis = get_planning_file_path(project_path, &session_id, PlanningFile::Summary).exists();

                // Skip sessions without any research
                if !has_architecture && !has_codebase && !has_best_practices && !has_risks {
                    continue;
                }

                // Calculate total size
                let mut total_size: u64 = 0;
                if let Ok(entries) = fs::read_dir(&research_dir) {
                    for entry in entries.flatten() {
                        if let Ok(meta) = entry.metadata() {
                            total_size += meta.len();
                        }
                    }
                }

                // Get creation time from state
                let state = load_workflow_state(project_path, &session_id).ok();
                let created_at = state.map(|s| s.started_at.to_rfc3339());

                sessions.push(ResearchSessionInfo {
                    session_id,
                    created_at,
                    has_architecture,
                    has_codebase,
                    has_best_practices,
                    has_risks,
                    has_synthesis,
                    total_size_bytes: total_size,
                });
            }
        }
    }

    // Sort by created_at descending (most recent first)
    sessions.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(sessions)
}

/// Copy research files from one session to another
pub fn copy_research_to_session(
    project_path: &Path,
    source_session_id: &str,
    target_session_id: &str,
    research_types: Option<Vec<String>>,
) -> FileResult<u32> {
    let source_research_dir = get_research_dir(project_path, source_session_id);
    let target_research_dir = get_research_dir(project_path, target_session_id);

    // Ensure target directory exists
    ensure_dir(&target_research_dir)?;

    let all_types = vec!["architecture", "codebase", "best_practices", "risks"];
    let types_to_copy: Vec<&str> = match &research_types {
        Some(types) => types.iter().map(|s| s.as_str()).collect(),
        None => all_types,
    };

    let mut copied_count = 0u32;
    for research_type in types_to_copy {
        let filename = format!("{}.md", research_type);
        let source_file = source_research_dir.join(&filename);
        let target_file = target_research_dir.join(&filename);

        if source_file.exists() {
            fs::copy(&source_file, &target_file)
                .map_err(|e| format!("Failed to copy {}: {}", filename, e))?;
            copied_count += 1;
            log::info!("Copied research file: {:?} -> {:?}", source_file, target_file);
        }
    }

    log::info!(
        "Copied {} research files from {} to {}",
        copied_count,
        source_session_id,
        target_session_id
    );

    Ok(copied_count)
}

/// Generate PROJECT.md content from questioning context
pub fn generate_project_md(context: &QuestioningContext) -> String {
    let mut content = String::new();

    content.push_str("# Project Document\n\n");

    // Vision / What
    content.push_str("## Vision\n\n");
    if let Some(what) = &context.what {
        content.push_str(what);
        content.push_str("\n\n");
    } else {
        content.push_str("*To be defined*\n\n");
    }

    // Problem / Why
    content.push_str("## Problem Statement\n\n");
    if let Some(why) = &context.why {
        content.push_str(why);
        content.push_str("\n\n");
    } else {
        content.push_str("*To be defined*\n\n");
    }

    // Target Users / Who
    content.push_str("## Target Users\n\n");
    if let Some(who) = &context.who {
        content.push_str(who);
        content.push_str("\n\n");
    } else {
        content.push_str("*To be defined*\n\n");
    }

    // Success Criteria / Done
    content.push_str("## Success Criteria\n\n");
    if let Some(done) = &context.done {
        content.push_str(done);
        content.push_str("\n\n");
    } else {
        content.push_str("*To be defined*\n\n");
    }

    // Additional Notes
    if !context.notes.is_empty() {
        content.push_str("## Additional Context\n\n");
        for note in &context.notes {
            content.push_str("- ");
            content.push_str(note);
            content.push('\n');
        }
        content.push('\n');
    }

    // Constraints placeholder
    content.push_str("## Constraints\n\n");
    content.push_str("*Technical and business constraints to be identified during research phase.*\n\n");

    // Non-goals placeholder
    content.push_str("## Non-Goals\n\n");
    content.push_str("*Explicit non-goals to be identified during scoping phase.*\n\n");

    content
}

/// Create PROJECT.md file from questioning context
pub fn create_project_md(
    project_path: &Path,
    session_id: &str,
    context: &QuestioningContext,
) -> FileResult<PathBuf> {
    let content = generate_project_md(context);
    write_planning_file(project_path, session_id, PlanningFile::Project, &content)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_planning_dir_paths() {
        let project = Path::new("/home/user/project");
        let session_id = "session-123";

        let planning_dir = get_planning_dir(project, session_id);
        assert_eq!(
            planning_dir,
            PathBuf::from("/home/user/project/.ralph-ui/planning/session-123")
        );

        let research_dir = get_research_dir(project, session_id);
        assert_eq!(
            research_dir,
            PathBuf::from("/home/user/project/.ralph-ui/planning/session-123/research")
        );
    }

    #[test]
    fn test_planning_file_paths() {
        let project = Path::new("/home/user/project");
        let session_id = "session-123";

        let project_file = get_planning_file_path(project, session_id, PlanningFile::Project);
        assert!(project_file.ends_with("PROJECT.md"));

        let state_file = get_planning_file_path(project, session_id, PlanningFile::State);
        assert!(state_file.ends_with("state.json"));
    }

    #[test]
    fn test_init_and_write_planning_files() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();
        let session_id = "test-session";

        // Initialize session
        let planning_dir = init_planning_session(project_path, session_id).unwrap();
        assert!(planning_dir.exists());
        assert!(get_research_dir(project_path, session_id).exists());

        // Write planning file
        let content = "# Project Vision\n\nBuild something great.";
        let file_path =
            write_planning_file(project_path, session_id, PlanningFile::Project, content).unwrap();
        assert!(file_path.exists());

        // Read it back
        let read_content =
            read_planning_file(project_path, session_id, PlanningFile::Project).unwrap();
        assert_eq!(read_content, content);

        // Check existence
        assert!(planning_file_exists(
            project_path,
            session_id,
            PlanningFile::Project
        ));
        assert!(!planning_file_exists(
            project_path,
            session_id,
            PlanningFile::Summary
        ));
    }

    #[test]
    fn test_research_files() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();
        let session_id = "test-session";

        init_planning_session(project_path, session_id).unwrap();

        // Write research files
        write_research_file(project_path, session_id, "architecture.md", "# Architecture")
            .unwrap();
        write_research_file(project_path, session_id, "codebase.md", "# Codebase Analysis")
            .unwrap();

        // List files
        let files = list_research_files(project_path, session_id).unwrap();
        assert_eq!(files.len(), 2);
        assert!(files.contains(&"architecture.md".to_string()));
        assert!(files.contains(&"codebase.md".to_string()));

        // Read file
        let content = read_research_file(project_path, session_id, "architecture.md").unwrap();
        assert_eq!(content, "# Architecture");
    }

    #[test]
    fn test_workflow_state_persistence() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();
        let session_id = "test-session";

        init_planning_session(project_path, session_id).unwrap();

        // Create and save state
        let mut state = GsdWorkflowState::new(session_id.to_string());
        state.questioning_context.what = Some("A chat app".to_string());
        state.advance_phase();

        save_workflow_state(project_path, session_id, &state).unwrap();

        // Load it back
        let loaded = load_workflow_state(project_path, session_id).unwrap();
        assert_eq!(loaded.session_id, session_id);
        assert_eq!(
            loaded.questioning_context.what,
            Some("A chat app".to_string())
        );
        assert_eq!(
            loaded.current_phase,
            super::super::state::GsdPhase::ProjectDocument
        );
    }

    #[test]
    fn test_list_planning_sessions() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();

        // Create some sessions
        for i in 1..=3 {
            let session_id = format!("session-{}", i);
            init_planning_session(project_path, &session_id).unwrap();

            let state = GsdWorkflowState::new(session_id.clone());
            save_workflow_state(project_path, &session_id, &state).unwrap();
        }

        // List sessions
        let sessions = list_planning_sessions(project_path).unwrap();
        assert_eq!(sessions.len(), 3);
    }

    #[test]
    fn test_delete_planning_session() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();
        let session_id = "test-session";

        init_planning_session(project_path, session_id).unwrap();
        assert!(get_planning_dir(project_path, session_id).exists());

        delete_planning_session(project_path, session_id).unwrap();
        assert!(!get_planning_dir(project_path, session_id).exists());
    }

    #[test]
    fn test_generate_project_md() {
        let context = QuestioningContext {
            what: Some("A task management application".to_string()),
            why: Some("Teams need better collaboration tools".to_string()),
            who: Some("Remote workers and distributed teams".to_string()),
            done: Some("Users can create, assign, and track tasks across projects".to_string()),
            notes: vec!["Should integrate with Slack".to_string(), "Mobile support important".to_string()],
        };

        let content = generate_project_md(&context);

        // Check that all sections are present
        assert!(content.contains("# Project Document"));
        assert!(content.contains("## Vision"));
        assert!(content.contains("A task management application"));
        assert!(content.contains("## Problem Statement"));
        assert!(content.contains("Teams need better collaboration tools"));
        assert!(content.contains("## Target Users"));
        assert!(content.contains("Remote workers and distributed teams"));
        assert!(content.contains("## Success Criteria"));
        assert!(content.contains("Users can create, assign, and track tasks"));
        assert!(content.contains("## Additional Context"));
        assert!(content.contains("Should integrate with Slack"));
        assert!(content.contains("Mobile support important"));
    }

    #[test]
    fn test_generate_project_md_partial_context() {
        let context = QuestioningContext {
            what: Some("An API gateway".to_string()),
            why: None,
            who: Some("Backend developers".to_string()),
            done: None,
            notes: vec![],
        };

        let content = generate_project_md(&context);

        // Check that filled sections have content and empty ones have placeholder
        assert!(content.contains("An API gateway"));
        assert!(content.contains("Backend developers"));
        assert!(content.contains("*To be defined*")); // Placeholder for missing sections
        assert!(!content.contains("## Additional Context")); // No notes = no section
    }

    #[test]
    fn test_create_project_md_file() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();
        let session_id = "test-session";

        init_planning_session(project_path, session_id).unwrap();

        let context = QuestioningContext {
            what: Some("Test project".to_string()),
            why: Some("Testing".to_string()),
            who: Some("Testers".to_string()),
            done: Some("Tests pass".to_string()),
            notes: vec![],
        };

        let file_path = create_project_md(project_path, session_id, &context).unwrap();
        assert!(file_path.exists());

        // Read and verify content
        let content = read_planning_file(project_path, session_id, PlanningFile::Project).unwrap();
        assert!(content.contains("Test project"));
        assert!(content.contains("Testing"));
    }
}
