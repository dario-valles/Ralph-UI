//! Workflow storage for PRD workflow
//!
//! Manages the `.ralph-ui/workflows/{workflow-id}/` directory structure.

use super::state::PrdWorkflowState;
use crate::file_storage::{atomic_write, ensure_dir, get_ralph_ui_dir, read_json, FileResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Workflow file types
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WorkflowFile {
    /// state.json - Unified workflow state
    State,
    /// SPEC.md - Current/desired state specification
    Spec,
    /// SUMMARY.md - Synthesized research summary
    Summary,
    /// requirements.json - Requirements with dependencies
    Requirements,
    /// REQUIREMENTS.md - Human-readable requirements markdown
    RequirementsMd,
    /// ROADMAP.md - Execution plan
    Roadmap,
    /// AGENTS.md - Generated agent guidance file
    AgentsMd,
    /// Research file by name (e.g., "architecture.md")
    Research(String),
}

impl WorkflowFile {
    /// Get the filename for this workflow file
    pub fn filename(&self) -> String {
        match self {
            WorkflowFile::State => "state.json".to_string(),
            WorkflowFile::Spec => "SPEC.md".to_string(),
            WorkflowFile::Summary => "SUMMARY.md".to_string(),
            WorkflowFile::Requirements => "requirements.json".to_string(),
            WorkflowFile::RequirementsMd => "REQUIREMENTS.md".to_string(),
            WorkflowFile::Roadmap => "ROADMAP.md".to_string(),
            WorkflowFile::AgentsMd => "AGENTS.md".to_string(),
            WorkflowFile::Research(name) => format!("research/{}", name),
        }
    }
}

/// Get the workflows base directory for a project
pub fn get_workflows_base_dir(project_path: &Path) -> PathBuf {
    get_ralph_ui_dir(project_path).join("workflows")
}

/// Get the workflow directory for a specific workflow
pub fn get_workflow_dir(project_path: &Path, workflow_id: &str) -> PathBuf {
    get_workflows_base_dir(project_path).join(workflow_id)
}

/// Get the research directory for a workflow
pub fn get_research_dir(project_path: &Path, workflow_id: &str) -> PathBuf {
    get_workflow_dir(project_path, workflow_id).join("research")
}

/// Get the path for a workflow file
pub fn get_workflow_file_path(
    project_path: &Path,
    workflow_id: &str,
    file: WorkflowFile,
) -> PathBuf {
    get_workflow_dir(project_path, workflow_id).join(file.filename())
}

/// Initialize a workflow directory
pub fn init_workflow(project_path: &Path, workflow_id: &str) -> FileResult<PathBuf> {
    let workflow_dir = get_workflow_dir(project_path, workflow_id);
    ensure_dir(&workflow_dir)?;

    // Create research subdirectory
    let research_dir = get_research_dir(project_path, workflow_id);
    ensure_dir(&research_dir)?;

    log::info!("Initialized workflow directory: {:?}", workflow_dir);
    Ok(workflow_dir)
}

/// Write a workflow file
pub fn write_workflow_file(
    project_path: &Path,
    workflow_id: &str,
    file: WorkflowFile,
    content: &str,
) -> FileResult<PathBuf> {
    let file_path = get_workflow_file_path(project_path, workflow_id, file);

    // Ensure parent directory exists
    if let Some(parent) = file_path.parent() {
        ensure_dir(parent)?;
    }

    atomic_write(&file_path, content)?;

    log::debug!("Wrote workflow file: {:?}", file_path);
    Ok(file_path)
}

/// Read a workflow file
pub fn read_workflow_file(
    project_path: &Path,
    workflow_id: &str,
    file: WorkflowFile,
) -> FileResult<String> {
    let file_path = get_workflow_file_path(project_path, workflow_id, file);

    fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read workflow file {:?}: {}", file_path, e))
}

/// Check if a workflow file exists
pub fn workflow_file_exists(project_path: &Path, workflow_id: &str, file: WorkflowFile) -> bool {
    get_workflow_file_path(project_path, workflow_id, file).exists()
}

/// Write a research output file
pub fn write_research_file(
    project_path: &Path,
    workflow_id: &str,
    filename: &str,
    content: &str,
) -> FileResult<PathBuf> {
    let file_path = get_research_dir(project_path, workflow_id).join(filename);

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
    workflow_id: &str,
    filename: &str,
) -> FileResult<String> {
    let file_path = get_research_dir(project_path, workflow_id).join(filename);

    fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read research file {:?}: {}", file_path, e))
}

/// List all research files for a workflow
pub fn list_research_files(project_path: &Path, workflow_id: &str) -> FileResult<Vec<String>> {
    let research_dir = get_research_dir(project_path, workflow_id);

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
    workflow_id: &str,
    state: &PrdWorkflowState,
) -> FileResult<PathBuf> {
    let file_path = get_workflow_file_path(project_path, workflow_id, WorkflowFile::State);

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
pub fn load_workflow_state(project_path: &Path, workflow_id: &str) -> FileResult<PrdWorkflowState> {
    let file_path = get_workflow_file_path(project_path, workflow_id, WorkflowFile::State);
    read_json(&file_path)
}

/// Delete a workflow directory
pub fn delete_workflow(project_path: &Path, workflow_id: &str) -> FileResult<()> {
    let workflow_dir = get_workflow_dir(project_path, workflow_id);

    if workflow_dir.exists() {
        fs::remove_dir_all(&workflow_dir)
            .map_err(|e| format!("Failed to delete workflow directory: {}", e))?;
        log::info!("Deleted workflow: {:?}", workflow_dir);
    }

    Ok(())
}

/// Information about a workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowInfo {
    pub id: String,
    pub project_path: String,
    pub phase: Option<super::state::WorkflowPhase>,
    pub mode: Option<super::state::WorkflowMode>,
    pub is_complete: bool,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub context_summary: Option<String>,
}

/// List all workflows for a project
pub fn list_workflows(project_path: &Path) -> FileResult<Vec<WorkflowInfo>> {
    let workflows_base = get_workflows_base_dir(project_path);

    if !workflows_base.exists() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(&workflows_base)
        .map_err(|e| format!("Failed to read workflows directory: {}", e))?;

    let mut workflows = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let path = entry.path();

        if path.is_dir() {
            if let Some(workflow_id) = path.file_name() {
                let workflow_id = workflow_id.to_string_lossy().to_string();

                // Try to load the state to get more info
                let state = load_workflow_state(project_path, &workflow_id).ok();

                let context_summary = state.as_ref().and_then(|s| {
                    s.context.what.as_ref().map(|w| {
                        if w.len() > 100 {
                            format!("{}...", &w[..100])
                        } else {
                            w.clone()
                        }
                    })
                });

                workflows.push(WorkflowInfo {
                    id: workflow_id,
                    project_path: project_path.to_string_lossy().to_string(),
                    phase: state.as_ref().map(|s| s.phase),
                    mode: state.as_ref().map(|s| s.mode),
                    is_complete: state.as_ref().map(|s| s.is_complete).unwrap_or(false),
                    created_at: state.as_ref().map(|s| s.created_at.to_rfc3339()),
                    updated_at: state.as_ref().map(|s| s.updated_at.to_rfc3339()),
                    context_summary,
                });
            }
        }
    }

    // Sort by updated_at descending (most recent first)
    workflows.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(workflows)
}

/// Generate SPEC.md content from SpecState
pub fn generate_spec_md(spec: &super::state::SpecState) -> String {
    let mut content = String::new();

    content.push_str("# Specification\n\n");

    // Current State
    content.push_str("## Current State\n\n");
    if !spec.current.summary.is_empty() {
        content.push_str(&format!("{}\n\n", spec.current.summary));
    }

    if !spec.current.user_flows.is_empty() {
        content.push_str("### User Flows\n\n");
        for flow in &spec.current.user_flows {
            content.push_str(&format!("- {}\n", flow));
        }
        content.push('\n');
    }

    if !spec.current.components.is_empty() {
        content.push_str("### Components\n\n");
        for component in &spec.current.components {
            content.push_str(&format!("- {}\n", component));
        }
        content.push('\n');
    }

    if !spec.current.data_models.is_empty() {
        content.push_str("### Data Models\n\n");
        for model in &spec.current.data_models {
            content.push_str(&format!("- {}\n", model));
        }
        content.push('\n');
    }

    if !spec.current.constraints.is_empty() {
        content.push_str("### Constraints\n\n");
        for constraint in &spec.current.constraints {
            content.push_str(&format!("- {}\n", constraint));
        }
        content.push('\n');
    }

    // Desired State
    content.push_str("## Desired State\n\n");
    if !spec.desired.summary.is_empty() {
        content.push_str(&format!("{}\n\n", spec.desired.summary));
    }

    if !spec.desired.user_flows.is_empty() {
        content.push_str("### User Flows\n\n");
        for flow in &spec.desired.user_flows {
            content.push_str(&format!("- {}\n", flow));
        }
        content.push('\n');
    }

    if !spec.desired.components.is_empty() {
        content.push_str("### Components\n\n");
        for component in &spec.desired.components {
            content.push_str(&format!("- {}\n", component));
        }
        content.push('\n');
    }

    if !spec.desired.data_models.is_empty() {
        content.push_str("### Data Models\n\n");
        for model in &spec.desired.data_models {
            content.push_str(&format!("- {}\n", model));
        }
        content.push('\n');
    }

    if !spec.desired.constraints.is_empty() {
        content.push_str("### Constraints\n\n");
        for constraint in &spec.desired.constraints {
            content.push_str(&format!("- {}\n", constraint));
        }
        content.push('\n');
    }

    // Implementation Notes
    if !spec.implementation_notes.is_empty() {
        content.push_str("## Implementation Notes\n\n");
        for note in &spec.implementation_notes {
            content.push_str(&format!("- {}\n", note));
        }
        content.push('\n');
    }

    content
}

/// Generate REQUIREMENTS.md content from workflow state
pub fn generate_requirements_md(state: &PrdWorkflowState) -> String {
    let mut md = String::new();
    md.push_str("# Requirements\n\n");

    // Group by category
    let mut by_category: std::collections::HashMap<
        &super::state::RequirementCategory,
        Vec<&super::state::Requirement>,
    > = std::collections::HashMap::new();
    for req in state.requirements.values() {
        by_category.entry(&req.category).or_default().push(req);
    }

    // Sort categories
    let mut categories: Vec<_> = by_category.keys().collect();
    categories.sort_by_key(|c| c.prefix());

    for category in categories {
        md.push_str(&format!("## {}\n\n", category.display_name()));

        let mut reqs: Vec<_> = by_category[category].clone();
        reqs.sort_by(|a, b| a.id.cmp(&b.id));

        for req in reqs {
            md.push_str(&format!("### {} - {}\n\n", req.id, req.title));
            md.push_str(&format!("**Scope:** {}\n\n", req.scope.display_name()));
            md.push_str(&format!("**Status:** {:?}\n\n", req.status));
            md.push_str(&format!("{}\n\n", req.description));

            if let Some(story) = &req.user_story {
                md.push_str(&format!("**User Story:** {}\n\n", story));
            }

            if !req.acceptance_criteria.is_empty() {
                md.push_str("**Acceptance Criteria:**\n");
                for criterion in &req.acceptance_criteria {
                    md.push_str(&format!("- [ ] {}\n", criterion));
                }
                md.push('\n');
            }

            if let Some(effort) = &req.effort {
                md.push_str(&format!("**Effort:** {}\n\n", effort));
            }

            if !req.depends_on.is_empty() {
                md.push_str(&format!(
                    "**Dependencies:** {}\n\n",
                    req.depends_on.join(", ")
                ));
            }
        }
    }

    md
}

/// Generate ROADMAP.md content from workflow state (based on dependency order)
pub fn generate_roadmap_md(state: &PrdWorkflowState) -> FileResult<String> {
    let mut md = String::new();
    md.push_str("# Roadmap\n\n");

    // Get execution order
    let order = state.get_execution_order()?;

    // Separate by scope
    let v1_reqs: Vec<_> = order
        .iter()
        .filter_map(|id| state.requirements.get(id))
        .filter(|r| r.scope == super::state::ScopeLevel::V1)
        .collect();

    let v2_reqs: Vec<_> = order
        .iter()
        .filter_map(|id| state.requirements.get(id))
        .filter(|r| r.scope == super::state::ScopeLevel::V2)
        .collect();

    // V1 Phase
    if !v1_reqs.is_empty() {
        md.push_str("## Phase 1: V1 (Must Have)\n\n");
        md.push_str("Execute in this order based on dependencies:\n\n");

        for (i, req) in v1_reqs.iter().enumerate() {
            md.push_str(&format!("{}. **{}** - {}\n", i + 1, req.id, req.title));
            if !req.depends_on.is_empty() {
                md.push_str(&format!("   - Depends on: {}\n", req.depends_on.join(", ")));
            }
        }
        md.push('\n');
    }

    // V2 Phase
    if !v2_reqs.is_empty() {
        md.push_str("## Phase 2: V2 (Nice to Have)\n\n");
        md.push_str("Execute in this order based on dependencies:\n\n");

        for (i, req) in v2_reqs.iter().enumerate() {
            md.push_str(&format!("{}. **{}** - {}\n", i + 1, req.id, req.title));
            if !req.depends_on.is_empty() {
                md.push_str(&format!("   - Depends on: {}\n", req.depends_on.join(", ")));
            }
        }
        md.push('\n');
    }

    // Dependency Stats
    let stats = state.dependency_graph.stats();
    md.push_str("## Dependency Statistics\n\n");
    md.push_str(&format!("- Total requirements: {}\n", stats.total_nodes));
    md.push_str(&format!(
        "- Total dependencies: {}\n",
        stats.total_dependencies
    ));
    md.push_str(&format!(
        "- Maximum dependency depth: {}\n",
        stats.max_depth
    ));
    md.push_str(&format!(
        "- Root requirements (no dependencies): {}\n",
        stats.root_nodes.len()
    ));
    md.push_str(&format!(
        "- Leaf requirements (nothing depends on them): {}\n",
        stats.leaf_nodes.len()
    ));

    Ok(md)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_workflow_dir_paths() {
        let project = Path::new("/home/user/project");
        let workflow_id = "workflow-123";

        let workflow_dir = get_workflow_dir(project, workflow_id);
        assert_eq!(
            workflow_dir,
            PathBuf::from("/home/user/project/.ralph-ui/workflows/workflow-123")
        );

        let research_dir = get_research_dir(project, workflow_id);
        assert_eq!(
            research_dir,
            PathBuf::from("/home/user/project/.ralph-ui/workflows/workflow-123/research")
        );
    }

    #[test]
    fn test_workflow_file_paths() {
        let project = Path::new("/home/user/project");
        let workflow_id = "workflow-123";

        let state_file = get_workflow_file_path(project, workflow_id, WorkflowFile::State);
        assert!(state_file.ends_with("state.json"));

        let spec_file = get_workflow_file_path(project, workflow_id, WorkflowFile::Spec);
        assert!(spec_file.ends_with("SPEC.md"));
    }

    #[test]
    fn test_init_and_write_workflow_files() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();
        let workflow_id = "test-workflow";

        // Initialize workflow
        let workflow_dir = init_workflow(project_path, workflow_id).unwrap();
        assert!(workflow_dir.exists());
        assert!(get_research_dir(project_path, workflow_id).exists());

        // Write workflow file
        let content = "# Specification\n\nTest content.";
        let file_path =
            write_workflow_file(project_path, workflow_id, WorkflowFile::Spec, content).unwrap();
        assert!(file_path.exists());

        // Read it back
        let read_content =
            read_workflow_file(project_path, workflow_id, WorkflowFile::Spec).unwrap();
        assert_eq!(read_content, content);

        // Check existence
        assert!(workflow_file_exists(
            project_path,
            workflow_id,
            WorkflowFile::Spec
        ));
        assert!(!workflow_file_exists(
            project_path,
            workflow_id,
            WorkflowFile::Summary
        ));
    }

    #[test]
    fn test_workflow_state_persistence() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();
        let workflow_id = "test-workflow";

        init_workflow(project_path, workflow_id).unwrap();

        // Create and save state
        let mut state = PrdWorkflowState::new(
            workflow_id.to_string(),
            project_path.to_string_lossy().to_string(),
            super::super::state::WorkflowMode::New,
        );
        state.context.what = Some("A chat app".to_string());
        state.advance_phase();

        save_workflow_state(project_path, workflow_id, &state).unwrap();

        // Load it back
        let loaded = load_workflow_state(project_path, workflow_id).unwrap();
        assert_eq!(loaded.id, workflow_id);
        assert_eq!(loaded.context.what, Some("A chat app".to_string()));
        assert_eq!(loaded.phase, super::super::state::WorkflowPhase::Research);
    }

    #[test]
    fn test_list_workflows() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();

        // Create some workflows
        for i in 1..=3 {
            let workflow_id = format!("workflow-{}", i);
            init_workflow(project_path, &workflow_id).unwrap();

            let state = PrdWorkflowState::new(
                workflow_id.clone(),
                project_path.to_string_lossy().to_string(),
                super::super::state::WorkflowMode::New,
            );
            save_workflow_state(project_path, &workflow_id, &state).unwrap();
        }

        // List workflows
        let workflows = list_workflows(project_path).unwrap();
        assert_eq!(workflows.len(), 3);
    }

    #[test]
    fn test_delete_workflow() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path();
        let workflow_id = "test-workflow";

        init_workflow(project_path, workflow_id).unwrap();
        assert!(get_workflow_dir(project_path, workflow_id).exists());

        delete_workflow(project_path, workflow_id).unwrap();
        assert!(!get_workflow_dir(project_path, workflow_id).exists());
    }
}
