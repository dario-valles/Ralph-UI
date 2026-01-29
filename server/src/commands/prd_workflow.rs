//! PRD Workflow commands
//!
//! Backend commands for the centralized PRD creation workflow.
//! This replaces the GSD workflow with a simplified 5-phase approach.

use crate::prd_workflow::{
    self,
    research::ResearchConfig,
    state::{
        ExecutionMode, PhaseStatus, PrdWorkflowState, ProjectContext, Requirement,
        RequirementCategory, RequirementStatus, ScopeLevel, SpecState, WorkflowMode, WorkflowPhase,
    },
    storage::{
        delete_workflow, generate_requirements_md, generate_roadmap_md, generate_spec_md,
        init_workflow, list_research_files, list_workflows, load_workflow_state,
        read_research_file, save_workflow_state, write_research_file, write_workflow_file,
        WorkflowFile, WorkflowInfo,
    },
};
use crate::utils::as_path;
use serde::{Deserialize, Serialize};

/// Create a new PRD workflow
pub async fn create_prd_workflow(
    project_path: String,
    workflow_id: String,
    mode: WorkflowMode,
    chat_session_id: Option<String>,
) -> Result<PrdWorkflowState, String> {
    let path = as_path(&project_path);

    // Initialize workflow directory
    init_workflow(path, &workflow_id)?;

    // Create initial workflow state
    let mut state = PrdWorkflowState::new(workflow_id.clone(), project_path.clone(), mode);

    // Link to chat session if provided
    state.chat_session_id = chat_session_id;

    // Configure research based on mode
    if mode == WorkflowMode::Existing {
        // Add Ideas agent for existing codebases
        state.research_config = ResearchConfig::default().with_ideas_agent();
    } else {
        // Filter out codebase-requiring agents for new projects
        state.research_config = ResearchConfig::default().filter_for_mode(false);
    }

    // Save the initial state
    save_workflow_state(path, &workflow_id, &state)?;

    log::info!(
        "Created PRD workflow {} at {:?} (mode: {:?})",
        workflow_id,
        path,
        mode
    );
    Ok(state)
}

/// Get a PRD workflow by ID
pub async fn get_prd_workflow(
    project_path: String,
    workflow_id: String,
) -> Result<Option<PrdWorkflowState>, String> {
    let path = as_path(&project_path);

    match load_workflow_state(path, &workflow_id) {
        Ok(state) => Ok(Some(state)),
        Err(_) => Ok(None),
    }
}

/// List all PRD workflows for a project
pub async fn list_prd_workflows(project_path: String) -> Result<Vec<WorkflowInfo>, String> {
    let path = as_path(&project_path);
    list_workflows(path)
}

/// Delete a PRD workflow
pub async fn delete_prd_workflow(project_path: String, workflow_id: String) -> Result<(), String> {
    let path = as_path(&project_path);
    delete_workflow(path, &workflow_id)
}

/// Update the current workflow phase
pub async fn update_workflow_phase(
    project_path: String,
    workflow_id: String,
    action: PhaseAction,
) -> Result<PrdWorkflowState, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    match action {
        PhaseAction::Advance => {
            state.advance_phase();
        }
        PhaseAction::GoBack => {
            state.go_back();
        }
        PhaseAction::Skip => {
            state.skip_phase();
        }
        PhaseAction::SetPhase(phase) => {
            state.phase = phase;
            let key = format!("{:?}", phase).to_lowercase();
            state.phase_statuses.insert(key, PhaseStatus::InProgress);
            state.updated_at = chrono::Utc::now();
        }
    }

    save_workflow_state(path, &workflow_id, &state)?;
    Ok(state)
}

/// Phase action for phase updates
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum PhaseAction {
    Advance,
    GoBack,
    Skip,
    SetPhase(WorkflowPhase),
}

/// Update the project context
pub async fn update_workflow_context(
    project_path: String,
    workflow_id: String,
    context: ProjectContext,
) -> Result<PrdWorkflowState, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    state.context = context;
    state.updated_at = chrono::Utc::now();

    save_workflow_state(path, &workflow_id, &state)?;
    Ok(state)
}

/// Update the spec state (current/desired)
pub async fn update_workflow_spec(
    project_path: String,
    workflow_id: String,
    spec: SpecState,
) -> Result<PrdWorkflowState, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    state.spec = Some(spec.clone());
    state.updated_at = chrono::Utc::now();

    // Also write SPEC.md
    let spec_content = generate_spec_md(&spec);
    write_workflow_file(path, &workflow_id, WorkflowFile::Spec, &spec_content)?;

    save_workflow_state(path, &workflow_id, &state)?;
    Ok(state)
}

/// Update research configuration
pub async fn update_research_config(
    project_path: String,
    workflow_id: String,
    config: ResearchConfig,
) -> Result<PrdWorkflowState, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    state.research_config = config;
    state.updated_at = chrono::Utc::now();

    save_workflow_state(path, &workflow_id, &state)?;
    Ok(state)
}

/// Upsert a requirement (add or update)
pub async fn upsert_requirement(
    project_path: String,
    workflow_id: String,
    requirement: Requirement,
) -> Result<PrdWorkflowState, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    state.upsert_requirement(requirement)?;
    state.update_requirement_statuses();
    state.updated_at = chrono::Utc::now();

    // Also update REQUIREMENTS.md
    let requirements_md = generate_requirements_md(&state);
    write_workflow_file(
        path,
        &workflow_id,
        WorkflowFile::RequirementsMd,
        &requirements_md,
    )?;

    // Save requirements.json
    let requirements_json = serde_json::to_string_pretty(&state.requirements)
        .map_err(|e| format!("Failed to serialize requirements: {}", e))?;
    write_workflow_file(
        path,
        &workflow_id,
        WorkflowFile::Requirements,
        &requirements_json,
    )?;

    save_workflow_state(path, &workflow_id, &state)?;
    Ok(state)
}

/// Add a new requirement with auto-generated ID
pub async fn add_requirement(
    project_path: String,
    workflow_id: String,
    category: RequirementCategory,
    title: String,
    description: String,
    depends_on: Option<Vec<String>>,
    scope: Option<ScopeLevel>,
) -> Result<AddRequirementResult, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    let id = state.next_requirement_id(&category);
    let mut req = Requirement::new(id.clone(), category, title, description);

    if let Some(scope) = scope {
        req.scope = scope;
    }

    if let Some(deps) = depends_on {
        // Add dependencies to graph
        for dep_id in &deps {
            state.dependency_graph.add_dependency(&id, dep_id)?;
        }
        req.depends_on = deps;
    }

    state.requirements.insert(id.clone(), req);
    state.update_requirement_statuses();
    state.updated_at = chrono::Utc::now();

    // Update files
    let requirements_md = generate_requirements_md(&state);
    write_workflow_file(
        path,
        &workflow_id,
        WorkflowFile::RequirementsMd,
        &requirements_md,
    )?;

    let requirements_json = serde_json::to_string_pretty(&state.requirements)
        .map_err(|e| format!("Failed to serialize requirements: {}", e))?;
    write_workflow_file(
        path,
        &workflow_id,
        WorkflowFile::Requirements,
        &requirements_json,
    )?;

    save_workflow_state(path, &workflow_id, &state)?;

    Ok(AddRequirementResult { id, state })
}

/// Result of adding a requirement
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddRequirementResult {
    pub id: String,
    pub state: PrdWorkflowState,
}

/// Delete a requirement
pub async fn delete_requirement(
    project_path: String,
    workflow_id: String,
    requirement_id: String,
) -> Result<PrdWorkflowState, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    // Remove from requirements map
    state.requirements.remove(&requirement_id);

    // Remove from dependency graph
    state.dependency_graph.remove_requirement(&requirement_id);

    state.update_requirement_statuses();
    state.updated_at = chrono::Utc::now();

    // Update files
    let requirements_md = generate_requirements_md(&state);
    write_workflow_file(
        path,
        &workflow_id,
        WorkflowFile::RequirementsMd,
        &requirements_md,
    )?;

    let requirements_json = serde_json::to_string_pretty(&state.requirements)
        .map_err(|e| format!("Failed to serialize requirements: {}", e))?;
    write_workflow_file(
        path,
        &workflow_id,
        WorkflowFile::Requirements,
        &requirements_json,
    )?;

    save_workflow_state(path, &workflow_id, &state)?;
    Ok(state)
}

/// Update requirement scope (v1/v2/out-of-scope)
pub async fn update_requirement_scope(
    project_path: String,
    workflow_id: String,
    requirement_id: String,
    scope: ScopeLevel,
) -> Result<PrdWorkflowState, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    if let Some(req) = state.requirements.get_mut(&requirement_id) {
        req.scope = scope;
    } else {
        return Err(format!("Requirement {} not found", requirement_id));
    }

    state.updated_at = chrono::Utc::now();

    // Update files
    let requirements_md = generate_requirements_md(&state);
    write_workflow_file(
        path,
        &workflow_id,
        WorkflowFile::RequirementsMd,
        &requirements_md,
    )?;

    save_workflow_state(path, &workflow_id, &state)?;
    Ok(state)
}

/// Update requirement status
pub async fn update_requirement_status(
    project_path: String,
    workflow_id: String,
    requirement_id: String,
    status: RequirementStatus,
) -> Result<PrdWorkflowState, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    if let Some(req) = state.requirements.get_mut(&requirement_id) {
        req.status = status;
    } else {
        return Err(format!("Requirement {} not found", requirement_id));
    }

    state.update_requirement_statuses();
    state.updated_at = chrono::Utc::now();

    save_workflow_state(path, &workflow_id, &state)?;
    Ok(state)
}

/// Add a dependency between requirements
pub async fn add_dependency(
    project_path: String,
    workflow_id: String,
    from_requirement_id: String,
    depends_on_id: String,
) -> Result<PrdWorkflowState, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    // Check if this would create a cycle
    if state
        .dependency_graph
        .would_create_cycle(&from_requirement_id, &depends_on_id)
    {
        return Err(format!(
            "Adding dependency {} -> {} would create a cycle",
            from_requirement_id, depends_on_id
        ));
    }

    // Add to dependency graph
    state
        .dependency_graph
        .add_dependency(&from_requirement_id, &depends_on_id)?;

    // Also update the requirement's depends_on field
    if let Some(req) = state.requirements.get_mut(&from_requirement_id) {
        if !req.depends_on.contains(&depends_on_id) {
            req.depends_on.push(depends_on_id.clone());
        }
    }

    state.update_requirement_statuses();
    state.updated_at = chrono::Utc::now();

    save_workflow_state(path, &workflow_id, &state)?;
    Ok(state)
}

/// Remove a dependency between requirements
pub async fn remove_dependency(
    project_path: String,
    workflow_id: String,
    from_requirement_id: String,
    depends_on_id: String,
) -> Result<PrdWorkflowState, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    // Remove from dependency graph
    state
        .dependency_graph
        .remove_dependency(&from_requirement_id, &depends_on_id);

    // Also update the requirement's depends_on field
    if let Some(req) = state.requirements.get_mut(&from_requirement_id) {
        req.depends_on.retain(|d| d != &depends_on_id);
    }

    state.update_requirement_statuses();
    state.updated_at = chrono::Utc::now();

    save_workflow_state(path, &workflow_id, &state)?;
    Ok(state)
}

/// Validate the dependency graph (check for cycles)
pub async fn validate_dependencies(
    project_path: String,
    workflow_id: String,
) -> Result<DependencyValidationResult, String> {
    let path = as_path(&project_path);
    let state = load_workflow_state(path, &workflow_id)?;

    match state.dependency_graph.validate() {
        Ok(()) => {
            let stats = state.dependency_graph.stats();
            Ok(DependencyValidationResult {
                valid: true,
                error: None,
                stats: Some(stats),
            })
        }
        Err(e) => Ok(DependencyValidationResult {
            valid: false,
            error: Some(e.to_string()),
            stats: None,
        }),
    }
}

/// Result of dependency validation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DependencyValidationResult {
    pub valid: bool,
    pub error: Option<String>,
    pub stats: Option<prd_workflow::dependency::DependencyStats>,
}

/// Get the execution order for requirements (topological sort)
pub async fn get_execution_order(
    project_path: String,
    workflow_id: String,
) -> Result<Vec<String>, String> {
    let path = as_path(&project_path);
    let state = load_workflow_state(path, &workflow_id)?;

    state.get_execution_order()
}

/// Get requirements that are ready to execute (all dependencies satisfied)
pub async fn get_ready_requirements(
    project_path: String,
    workflow_id: String,
) -> Result<Vec<Requirement>, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    state.update_requirement_statuses();
    let ready = state.get_ready_requirements();

    Ok(ready.into_iter().cloned().collect())
}

/// Generate the roadmap based on dependency order
pub async fn generate_roadmap(project_path: String, workflow_id: String) -> Result<String, String> {
    let path = as_path(&project_path);
    let state = load_workflow_state(path, &workflow_id)?;

    let roadmap_content = generate_roadmap_md(&state)?;

    // Write ROADMAP.md
    write_workflow_file(path, &workflow_id, WorkflowFile::Roadmap, &roadmap_content)?;

    Ok(roadmap_content)
}

/// Bulk scope selection (v1/v2/out-of-scope)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeSelection {
    pub v1: Vec<String>,
    pub v2: Vec<String>,
    pub out_of_scope: Vec<String>,
}

/// Apply bulk scope selection
pub async fn apply_scope_selection(
    project_path: String,
    workflow_id: String,
    selection: ScopeSelection,
) -> Result<PrdWorkflowState, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    for id in &selection.v1 {
        if let Some(req) = state.requirements.get_mut(id) {
            req.scope = ScopeLevel::V1;
        }
    }
    for id in &selection.v2 {
        if let Some(req) = state.requirements.get_mut(id) {
            req.scope = ScopeLevel::V2;
        }
    }
    for id in &selection.out_of_scope {
        if let Some(req) = state.requirements.get_mut(id) {
            req.scope = ScopeLevel::OutOfScope;
        }
    }

    state.updated_at = chrono::Utc::now();

    // Update files
    let requirements_md = generate_requirements_md(&state);
    write_workflow_file(
        path,
        &workflow_id,
        WorkflowFile::RequirementsMd,
        &requirements_md,
    )?;

    save_workflow_state(path, &workflow_id, &state)?;
    Ok(state)
}

/// Export workflow to Ralph PRD format
pub async fn export_workflow_to_prd(
    project_path: String,
    workflow_id: String,
    prd_name: String,
) -> Result<ExportResult, String> {
    let path = as_path(&project_path);
    let state = load_workflow_state(path, &workflow_id)?;

    // Build PRD content from workflow state
    let mut content = String::new();

    // Add YAML frontmatter with execution mode hint
    // This can be read by Ralph Loop when initializing the PRD
    let execution_mode_str = match state.execution_mode {
        ExecutionMode::Sequential => "sequential",
        ExecutionMode::Parallel => "parallel",
    };
    content.push_str("---\n");
    content.push_str(&format!("execution_mode: {}\n", execution_mode_str));
    content.push_str("---\n\n");

    // Title from context
    if let Some(what) = &state.context.what {
        content.push_str(&format!("# {}\n\n", what));
    } else {
        content.push_str(&format!("# {}\n\n", prd_name));
    }

    // Problem Statement
    if let Some(why) = &state.context.why {
        content.push_str("## Problem Statement\n\n");
        content.push_str(why);
        content.push_str("\n\n");
    }

    // Target Users
    if let Some(who) = &state.context.who {
        content.push_str("## Target Users\n\n");
        content.push_str(who);
        content.push_str("\n\n");
    }

    // Success Criteria
    if let Some(done) = &state.context.done {
        content.push_str("## Success Criteria\n\n");
        content.push_str(done);
        content.push_str("\n\n");
    }

    // Constraints
    if !state.context.constraints.is_empty() {
        content.push_str("## Constraints\n\n");
        for constraint in &state.context.constraints {
            content.push_str(&format!("- {}\n", constraint));
        }
        content.push('\n');
    }

    // Non-Goals
    if !state.context.non_goals.is_empty() {
        content.push_str("## Non-Goals\n\n");
        for non_goal in &state.context.non_goals {
            content.push_str(&format!("- {}\n", non_goal));
        }
        content.push('\n');
    }

    // Requirements (V1)
    let v1_reqs: Vec<_> = state
        .requirements
        .values()
        .filter(|r| r.scope == ScopeLevel::V1)
        .collect();
    if !v1_reqs.is_empty() {
        content.push_str("## V1 Requirements (Must Have)\n\n");
        for req in v1_reqs {
            content.push_str(&format!("### {} - {}\n\n", req.id, req.title));
            content.push_str(&format!("{}\n\n", req.description));

            if let Some(story) = &req.user_story {
                content.push_str(&format!("**User Story:** {}\n\n", story));
            }

            if !req.acceptance_criteria.is_empty() {
                content.push_str("**Acceptance Criteria:**\n");
                for criterion in &req.acceptance_criteria {
                    content.push_str(&format!("- [ ] {}\n", criterion));
                }
                content.push('\n');
            }

            if !req.depends_on.is_empty() {
                content.push_str(&format!(
                    "**Dependencies:** {}\n\n",
                    req.depends_on.join(", ")
                ));
            }
        }
    }

    // Requirements (V2)
    let v2_reqs: Vec<_> = state
        .requirements
        .values()
        .filter(|r| r.scope == ScopeLevel::V2)
        .collect();
    if !v2_reqs.is_empty() {
        content.push_str("## V2 Requirements (Nice to Have)\n\n");
        for req in v2_reqs {
            content.push_str(&format!("### {} - {}\n\n", req.id, req.title));
            content.push_str(&format!("{}\n\n", req.description));
        }
    }

    // Write to .ralph-ui/prds/
    let prds_dir = crate::utils::prds_dir(&project_path);
    crate::file_storage::ensure_dir(&prds_dir)?;

    let prd_path = prds_dir.join(format!("{}.md", prd_name));
    crate::file_storage::atomic_write(&prd_path, &content)?;

    log::info!(
        "Exported workflow {} to PRD {} at {:?}",
        workflow_id,
        prd_name,
        prd_path
    );

    Ok(ExportResult {
        prd_name,
        prd_path: prd_path.to_string_lossy().to_string(),
        content,
        execution_mode: state.execution_mode,
    })
}

/// Result of exporting to PRD
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub prd_name: String,
    pub prd_path: String,
    pub content: String,
    /// Execution mode used for this PRD (sequential or parallel)
    pub execution_mode: ExecutionMode,
}

/// Save research result from an agent
pub async fn save_research_result(
    project_path: String,
    workflow_id: String,
    agent_id: String,
    content: String,
    output_filename: String,
) -> Result<String, String> {
    let path = as_path(&project_path);

    // Write research file
    let file_path = write_research_file(path, &workflow_id, &output_filename, &content)?;

    // Update research status in state
    let mut state = load_workflow_state(path, &workflow_id)?;

    // Find and update the agent status
    for agent_status in &mut state.research_status.agents {
        if agent_status.agent_id == agent_id {
            agent_status.complete = true;
            agent_status.running = false;
            agent_status.output_path = Some(file_path.to_string_lossy().to_string());
            break;
        }
    }
    state.research_status.calculate_completion();
    state.updated_at = chrono::Utc::now();

    save_workflow_state(path, &workflow_id, &state)?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Save research synthesis
pub async fn save_research_synthesis(
    project_path: String,
    workflow_id: String,
    synthesis_content: String,
) -> Result<String, String> {
    let path = as_path(&project_path);

    // Write SUMMARY.md
    let file_path = write_workflow_file(
        path,
        &workflow_id,
        WorkflowFile::Summary,
        &synthesis_content,
    )?;

    // Update research status
    let mut state = load_workflow_state(path, &workflow_id)?;
    state.research_status.synthesis_complete = true;
    state.updated_at = chrono::Utc::now();

    save_workflow_state(path, &workflow_id, &state)?;

    Ok(file_path.to_string_lossy().to_string())
}

/// Get all research files for a workflow
pub async fn get_research_files(
    project_path: String,
    workflow_id: String,
) -> Result<Vec<String>, String> {
    let path = as_path(&project_path);
    list_research_files(path, &workflow_id)
}

/// Read a research file content
pub async fn read_research_file_content(
    project_path: String,
    workflow_id: String,
    filename: String,
) -> Result<String, String> {
    let path = as_path(&project_path);
    read_research_file(path, &workflow_id, &filename)
}

/// Generate AGENTS.md file for the project
pub async fn generate_agents_md(
    project_path: String,
    workflow_id: String,
    content: String,
) -> Result<String, String> {
    let path = as_path(&project_path);

    // Write to workflow directory
    let _workflow_path = write_workflow_file(path, &workflow_id, WorkflowFile::AgentsMd, &content)?;

    // Also write to project root
    let project_agents_path = path.join("AGENTS.md");
    crate::file_storage::atomic_write(&project_agents_path, &content)?;

    log::info!(
        "Generated AGENTS.md for project at {:?}",
        project_agents_path
    );

    Ok(project_agents_path.to_string_lossy().to_string())
}

/// Update the workflow execution mode (sequential or parallel)
pub async fn update_workflow_execution_mode(
    project_path: String,
    workflow_id: String,
    mode: ExecutionMode,
) -> Result<PrdWorkflowState, String> {
    let path = as_path(&project_path);
    let mut state = load_workflow_state(path, &workflow_id)?;

    state.execution_mode = mode;
    state.updated_at = chrono::Utc::now();

    save_workflow_state(path, &workflow_id, &state)?;

    log::info!(
        "Updated execution mode for workflow {} to {:?}",
        workflow_id,
        mode
    );

    Ok(state)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[tokio::test]
    async fn test_create_and_get_workflow() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        let state = create_prd_workflow(
            project_path.clone(),
            "test-workflow".to_string(),
            WorkflowMode::New,
            None,
        )
        .await
        .unwrap();

        assert_eq!(state.id, "test-workflow");
        assert_eq!(state.mode, WorkflowMode::New);
        assert_eq!(state.phase, WorkflowPhase::Discovery);

        // Get the workflow
        let loaded = get_prd_workflow(project_path, "test-workflow".to_string())
            .await
            .unwrap()
            .unwrap();

        assert_eq!(loaded.id, "test-workflow");
    }

    #[tokio::test]
    async fn test_add_requirement_with_dependencies() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        create_prd_workflow(
            project_path.clone(),
            "test".to_string(),
            WorkflowMode::New,
            None,
        )
        .await
        .unwrap();

        // Add first requirement
        let result1 = add_requirement(
            project_path.clone(),
            "test".to_string(),
            RequirementCategory::Core,
            "Authentication".to_string(),
            "User auth".to_string(),
            None,
            Some(ScopeLevel::V1),
        )
        .await
        .unwrap();

        assert_eq!(result1.id, "CORE-01");

        // Add second requirement that depends on first
        let result2 = add_requirement(
            project_path.clone(),
            "test".to_string(),
            RequirementCategory::Core,
            "Tasks".to_string(),
            "Task management".to_string(),
            Some(vec!["CORE-01".to_string()]),
            Some(ScopeLevel::V1),
        )
        .await
        .unwrap();

        assert_eq!(result2.id, "CORE-02");

        // Check dependency graph
        let validation = validate_dependencies(project_path.clone(), "test".to_string())
            .await
            .unwrap();

        assert!(validation.valid);
    }

    #[tokio::test]
    async fn test_scope_selection() {
        let temp_dir = TempDir::new().unwrap();
        let project_path = temp_dir.path().to_string_lossy().to_string();

        create_prd_workflow(
            project_path.clone(),
            "test".to_string(),
            WorkflowMode::New,
            None,
        )
        .await
        .unwrap();

        // Add requirements
        add_requirement(
            project_path.clone(),
            "test".to_string(),
            RequirementCategory::Core,
            "Auth".to_string(),
            "Auth".to_string(),
            None,
            None,
        )
        .await
        .unwrap();

        add_requirement(
            project_path.clone(),
            "test".to_string(),
            RequirementCategory::Ui,
            "Dashboard".to_string(),
            "Dashboard".to_string(),
            None,
            None,
        )
        .await
        .unwrap();

        // Apply scope selection
        let state = apply_scope_selection(
            project_path,
            "test".to_string(),
            ScopeSelection {
                v1: vec!["CORE-01".to_string()],
                v2: vec!["UI-01".to_string()],
                out_of_scope: vec![],
            },
        )
        .await
        .unwrap();

        assert_eq!(
            state.requirements.get("CORE-01").unwrap().scope,
            ScopeLevel::V1
        );
        assert_eq!(
            state.requirements.get("UI-01").unwrap().scope,
            ScopeLevel::V2
        );
    }
}
