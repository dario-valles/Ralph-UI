//! GSD (Get Stuff Done) workflow commands
//!
//! Backend commands for the GSD PRD generation workflow.

use crate::gsd::{
    config::GsdConfig,
    conversion::{convert_to_ralph_prd, ConversionOptions, ConversionResult},
    planning_storage::{
        delete_planning_session, init_planning_session, list_planning_sessions,
        load_workflow_state, read_planning_file, save_workflow_state, write_planning_file,
        PlanningFile, PlanningSessionInfo,
    },
    requirements::{Requirement, RequirementsDoc, ScopeSelection},
    research::{get_available_agents, synthesize_research, ResearchResult, ResearchSynthesis},
    roadmap::{derive_roadmap, RoadmapDoc},
    startup::{
        detect_project_type as detect_type, ContextQualityReport, ContextSuggestions,
        GeneratedIdea, ProjectType, ProjectTypeDetection,
    },
    state::{GsdPhase, GsdWorkflowState, QuestioningContext, ResearchStatus},
    verification::{verify_plans, VerificationResult},
};
use crate::models::AgentType;
use crate::utils::as_path;
use serde::{Deserialize, Serialize};

/// Helper trait for serialization errors
trait SerializeExt<T> {
    fn serialize_to_json(&self, context: &str) -> Result<String, String>;
}

impl<T: Serialize> SerializeExt<T> for T {
    fn serialize_to_json(&self, context: &str) -> Result<String, String> {
        serde_json::to_string_pretty(self)
            .map_err(|e| format!("Failed to serialize {}: {}", context, e))
    }
}

/// Start a new GSD workflow session
pub async fn start_gsd_session(
    project_path: String,
    chat_session_id: String,
) -> Result<GsdWorkflowState, String> {
    let path = as_path(&project_path);

    // Initialize planning directory
    init_planning_session(path, &chat_session_id)?;

    // Create initial workflow state
    let state = GsdWorkflowState::new(chat_session_id.clone());

    // Save the initial state
    save_workflow_state(path, &chat_session_id, &state)?;

    log::info!("Started GSD session {} at {:?}", chat_session_id, path);
    Ok(state)
}

/// Get the current GSD workflow state for a session
pub async fn get_gsd_state(
    project_path: String,
    session_id: String,
) -> Result<Option<GsdWorkflowState>, String> {
    let path = as_path(&project_path);

    match load_workflow_state(path, &session_id) {
        Ok(state) => Ok(Some(state)),
        Err(_) => Ok(None),
    }
}

/// Update the GSD workflow phase
pub async fn update_gsd_phase(
    project_path: String,
    session_id: String,
    phase: GsdPhase,
) -> Result<GsdWorkflowState, String> {
    let path = as_path(&project_path);

    let mut state = load_workflow_state(path, &session_id)?;
    state.current_phase = phase;
    state.updated_at = chrono::Utc::now();

    save_workflow_state(path, &session_id, &state)?;

    Ok(state)
}

/// Update questioning context
pub async fn update_questioning_context(
    project_path: String,
    session_id: String,
    context: QuestioningContext,
) -> Result<GsdWorkflowState, String> {
    let path = as_path(&project_path);

    let mut state = load_workflow_state(path, &session_id)?;
    state.questioning_context = context;
    state.updated_at = chrono::Utc::now();

    save_workflow_state(path, &session_id, &state)?;

    Ok(state)
}

/// Generate PROJECT.md from questioning context
pub async fn generate_project_document(
    project_path: String,
    session_id: String,
) -> Result<String, String> {
    let path = as_path(&project_path);

    // Load the current state to get questioning context
    let state = load_workflow_state(path, &session_id)?;

    // Generate and write PROJECT.md
    let file_path = crate::gsd::planning_storage::create_project_md(
        path,
        &session_id,
        &state.questioning_context,
    )?;

    log::info!(
        "Generated PROJECT.md for session {} at {:?}",
        session_id,
        file_path
    );

    // Return the content
    let content = crate::gsd::planning_storage::read_planning_file(
        path,
        &session_id,
        crate::gsd::planning_storage::PlanningFile::Project,
    )?;

    Ok(content)
}

/// Start parallel research agents with streaming output
pub async fn start_research(
    app_handle: std::sync::Arc<crate::server::EventBroadcaster>,
    project_path: String,
    session_id: String,
    context: String,
    agent_type: Option<String>,
    model: Option<String>,
    research_types: Option<Vec<String>>,
    env_vars: Option<std::collections::HashMap<String, String>>,
) -> Result<ResearchStatus, String> {
    let path = as_path(&project_path);

    // Load chat session to get PRD type
    let prd_type = crate::file_storage::chat_ops::get_chat_session(path, &session_id)
        .ok()
        .and_then(|session| session.prd_type);

    log::info!(
        "Starting research for session {} with PRD type: {:?}",
        session_id,
        prd_type
    );

    // Build config with optional overrides
    let config = GsdConfig {
        research_agent_type: agent_type.unwrap_or_else(|| GsdConfig::default().research_agent_type),
        research_model: model,
        env_vars,
        ..GsdConfig::default()
    };

    // Run research agents in parallel with app handle for event emission
    // If research_types is specified, only run those agents (for retrying failed agents)
    let (status, results) = crate::gsd::research::run_research_agents_selective(
        &config,
        &project_path,
        &session_id,
        &context,
        Some(app_handle),
        research_types,
        prd_type.as_deref(),
    )
    .await;

    // Update workflow state with research status
    if let Ok(mut state) = load_workflow_state(path, &session_id) {
        state.research_status = status.clone();
        state.updated_at = chrono::Utc::now();
        let _ = save_workflow_state(path, &session_id, &state);
    }

    log::info!(
        "Research completed for session {}: {} agents finished",
        session_id,
        results.len()
    );

    Ok(status)
}

/// Get research results for a session
pub async fn get_research_results(
    project_path: String,
    session_id: String,
) -> Result<Vec<ResearchResult>, String> {
    let path = as_path(&project_path);

    // Read research files and construct results
    let research_dir = crate::gsd::planning_storage::get_research_dir(path, &session_id);
    let mut results = Vec::new();

    for agent_type in crate::gsd::config::ResearchAgentType::all() {
        let filename = agent_type.output_filename();
        let file_path = research_dir.join(filename);

        if file_path.exists() {
            match std::fs::read_to_string(&file_path) {
                Ok(content) => {
                    results.push(ResearchResult {
                        research_type: format!("{:?}", agent_type).to_lowercase(),
                        success: true,
                        content: Some(content),
                        error: None,
                        output_path: Some(file_path.to_string_lossy().to_string()),
                        duration_secs: 0.0,
                        cli_agent: "unknown".to_string(), // Loaded from file, agent unknown
                    });
                }
                Err(e) => {
                    results.push(ResearchResult {
                        research_type: format!("{:?}", agent_type).to_lowercase(),
                        success: false,
                        content: None,
                        error: Some(e.to_string()),
                        output_path: None,
                        duration_secs: 0.0,
                        cli_agent: "unknown".to_string(),
                    });
                }
            }
        }
    }

    Ok(results)
}

/// Synthesize research into SUMMARY.md
pub async fn synthesize_research_cmd(
    project_path: String,
    session_id: String,
) -> Result<ResearchSynthesis, String> {
    let path = as_path(&project_path);
    synthesize_research(path, &session_id)
}

/// Generate requirements from research output
pub async fn generate_requirements_from_research(
    project_path: String,
    session_id: String,
) -> Result<RequirementsDoc, String> {
    use crate::gsd::requirements::generate_requirements_from_research as gen_reqs;

    let path = as_path(&project_path);

    // Try to load synthesis first, fall back to individual research files
    let synthesis_content = read_planning_file(path, &session_id, PlanningFile::Summary)
        .or_else(|_| {
            read_planning_file(
                path,
                &session_id,
                PlanningFile::Research("features.md".to_string()),
            )
        })
        .unwrap_or_default();

    // Load project context
    let project_content =
        read_planning_file(path, &session_id, PlanningFile::Project).unwrap_or_default();

    // Generate requirements from research
    let doc = gen_reqs(&synthesis_content, &project_content);

    // Save the requirements document
    let req_json = doc.serialize_to_json("requirements")?;
    write_planning_file(path, &session_id, PlanningFile::Requirements, &req_json)?;

    // Also save markdown version
    let req_md = doc.to_markdown();
    write_planning_file(path, &session_id, PlanningFile::RequirementsMd, &req_md)?;

    log::info!(
        "Generated {} requirements from research for session {}",
        doc.requirements.len(),
        session_id
    );

    Ok(doc)
}

/// Apply scope selections to requirements
pub async fn scope_requirements(
    project_path: String,
    session_id: String,
    selections: ScopeSelection,
) -> Result<RequirementsDoc, String> {
    let path = as_path(&project_path);

    // Load existing requirements
    let req_content = read_planning_file(path, &session_id, PlanningFile::Requirements)?;
    let mut doc: RequirementsDoc = serde_json::from_str(&req_content)
        .map_err(|e| format!("Failed to parse requirements: {}", e))?;

    // Apply selections
    selections.apply(&mut doc);

    // Save updated requirements
    let updated_content = doc.serialize_to_json("requirements")?;
    write_planning_file(
        path,
        &session_id,
        PlanningFile::Requirements,
        &updated_content,
    )?;

    // Also save a scoped markdown version
    let scoped_md = doc.to_markdown();
    write_planning_file(path, &session_id, PlanningFile::Scoped, &scoped_md)?;

    Ok(doc)
}

/// Validate requirements quality
pub async fn validate_requirements(
    project_path: String,
    session_id: String,
) -> Result<RequirementsValidationResult, String> {
    use crate::gsd::requirements::{calculate_quality_score, validate_requirements_doc};

    let path = as_path(&project_path);

    // Load requirements
    let req_content = read_planning_file(path, &session_id, PlanningFile::Requirements)?;
    let doc: RequirementsDoc = serde_json::from_str(&req_content)
        .map_err(|e| format!("Failed to parse requirements: {}", e))?;

    // Validate all requirements
    let results = validate_requirements_doc(&doc);
    let quality_score = calculate_quality_score(&doc);
    let valid_count = results.iter().filter(|r| r.is_valid).count();

    Ok(RequirementsValidationResult {
        results,
        quality_score,
        total_requirements: doc.requirements.len(),
        valid_requirements: valid_count,
    })
}

/// Result of validating all requirements
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequirementsValidationResult {
    pub results: Vec<crate::gsd::requirements::RequirementQualityResult>,
    pub quality_score: u32,
    pub total_requirements: usize,
    pub valid_requirements: usize,
}

/// Save requirements document
pub async fn save_requirements(
    project_path: String,
    session_id: String,
    requirements: RequirementsDoc,
) -> Result<(), String> {
    let path = as_path(&project_path);

    let content = requirements.serialize_to_json("requirements")?;
    write_planning_file(path, &session_id, PlanningFile::Requirements, &content)?;

    // Also save markdown version
    let md = requirements.to_markdown();
    write_planning_file(path, &session_id, PlanningFile::Requirements, &md)?;

    Ok(())
}

/// Load requirements document
pub async fn load_requirements(
    project_path: String,
    session_id: String,
) -> Result<Option<RequirementsDoc>, String> {
    let path = as_path(&project_path);

    match read_planning_file(path, &session_id, PlanningFile::Requirements) {
        Ok(content) => {
            let doc: RequirementsDoc = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse requirements: {}", e))?;
            Ok(Some(doc))
        }
        Err(_) => Ok(None),
    }
}

/// Create roadmap from requirements
pub async fn create_roadmap(
    project_path: String,
    session_id: String,
) -> Result<RoadmapDoc, String> {
    let path = as_path(&project_path);

    // Load requirements
    let req_content = read_planning_file(path, &session_id, PlanningFile::Requirements)?;
    let requirements: RequirementsDoc = serde_json::from_str(&req_content)
        .map_err(|e| format!("Failed to parse requirements: {}", e))?;

    // Derive roadmap
    let roadmap = derive_roadmap(&requirements);

    // Save roadmap
    let roadmap_json = roadmap.serialize_to_json("roadmap")?;
    write_planning_file(path, &session_id, PlanningFile::RoadmapJson, &roadmap_json)?;

    // Also save markdown version
    let roadmap_md = roadmap.to_markdown();
    write_planning_file(path, &session_id, PlanningFile::Roadmap, &roadmap_md)?;

    Ok(roadmap)
}

/// Load roadmap document
pub async fn load_roadmap(
    project_path: String,
    session_id: String,
) -> Result<Option<RoadmapDoc>, String> {
    let path = as_path(&project_path);

    // Try to load JSON first
    match read_planning_file(path, &session_id, PlanningFile::RoadmapJson) {
        Ok(content) => {
            if let Ok(doc) = serde_json::from_str::<RoadmapDoc>(&content) {
                return Ok(Some(doc));
            }
            // If JSON fails, it might be corrupt or we might need to fallback?
            // For now, just return None if JSON is invalid
            Ok(None)
        }
        Err(_) => {
            // Fallback for backward compatibility (if user has only ROADMAP.md but it happens to contain JSON?)
            // Or maybe previous version wrote JSON to ROADMAP.md?
            // Actually previous version overwrote JSON with Markdown in ROADMAP.md, so reading it as JSON will fail.
            // So we can't really recover data from ROADMAP.md if it's markdown.
            Ok(None)
        }
    }
}

/// Verify plans for completeness (with iteration tracking)
pub async fn verify_gsd_plans(
    project_path: String,
    session_id: String,
) -> Result<VerificationIterationResult, String> {
    use crate::gsd::verification::VerificationHistory;

    let path = as_path(&project_path);

    // Load requirements
    let req_content = read_planning_file(path, &session_id, PlanningFile::Requirements)?;
    let requirements: RequirementsDoc = serde_json::from_str(&req_content)
        .map_err(|e| format!("Failed to parse requirements: {}", e))?;

    // Load roadmap (or create empty one if not exists)
    let roadmap = match read_planning_file(path, &session_id, PlanningFile::RoadmapJson) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_else(|_| RoadmapDoc::new("v1")),
        Err(_) => RoadmapDoc::new("v1"),
    };

    // Run verification
    let result = verify_plans(&requirements, &roadmap);

    // Load or create verification history
    let history_file = PlanningFile::Research("verification_history.json".to_string());
    let mut history = match read_planning_file(path, &session_id, history_file.clone()) {
        Ok(content) => serde_json::from_str::<VerificationHistory>(&content)
            .unwrap_or_else(|_| VerificationHistory::new()),
        Err(_) => VerificationHistory::new(),
    };

    // Add this iteration to history
    let iteration = history.add_iteration(result.clone());
    let iteration_num = iteration.iteration;
    let issues_fixed = iteration.issues_fixed.clone();
    let new_issues = iteration.new_issues.clone();

    // Save verification history
    let history_json = history.serialize_to_json("verification history")?;
    write_planning_file(path, &session_id, history_file, &history_json)?;

    // Save verification result as markdown
    let verification_md = crate::gsd::verification::verification_to_markdown(&result);
    write_planning_file(
        path,
        &session_id,
        PlanningFile::Verification,
        &verification_md,
    )?;

    Ok(VerificationIterationResult {
        result,
        iteration: iteration_num,
        issues_fixed,
        new_issues,
        summary: history.summary(),
    })
}

/// Result of a verification iteration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VerificationIterationResult {
    /// The verification result
    pub result: VerificationResult,
    /// Current iteration number
    pub iteration: u32,
    /// Issues that were fixed since previous iteration
    pub issues_fixed: Vec<String>,
    /// New issues since previous iteration
    pub new_issues: Vec<String>,
    /// Summary of verification history
    pub summary: crate::gsd::verification::VerificationHistorySummary,
}

/// Get verification history for a session
pub async fn get_verification_history(
    project_path: String,
    session_id: String,
) -> Result<Option<crate::gsd::verification::VerificationHistory>, String> {
    use crate::gsd::verification::VerificationHistory;

    let path = as_path(&project_path);

    let history_file = PlanningFile::Research("verification_history.json".to_string());
    match read_planning_file(path, &session_id, history_file) {
        Ok(content) => {
            let history: VerificationHistory = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse verification history: {}", e))?;
            Ok(Some(history))
        }
        Err(_) => Ok(None),
    }
}

/// Clear verification history (for starting fresh)
pub async fn clear_verification_history(
    project_path: String,
    session_id: String,
) -> Result<(), String> {
    let path = as_path(&project_path);
    let history_file = PlanningFile::Research("verification_history.json".to_string());
    let empty_history = crate::gsd::verification::VerificationHistory::new();
    let content = empty_history.serialize_to_json("verification history")?;
    write_planning_file(path, &session_id, history_file, &content)?;
    Ok(())
}

/// Export GSD plans to Ralph PRD format
pub async fn export_gsd_to_ralph(
    project_path: String,
    session_id: String,
    prd_name: String,
    branch: String,
    include_v2: Option<bool>,
    execution_config: Option<crate::ralph_loop::PrdExecutionConfig>,
) -> Result<ConversionResult, String> {
    let path = as_path(&project_path);

    // Load requirements
    let req_content = read_planning_file(path, &session_id, PlanningFile::Requirements)?;
    let requirements: RequirementsDoc = serde_json::from_str(&req_content)
        .map_err(|e| format!("Failed to parse requirements: {}", e))?;

    // Load roadmap (with auto-healing for backward compatibility)
    let roadmap = match read_planning_file(path, &session_id, PlanningFile::RoadmapJson) {
        Ok(content) => serde_json::from_str::<RoadmapDoc>(&content)
            .map_err(|e| format!("Failed to parse roadmap: {}", e))?,
        Err(_) => {
            // Roadmap JSON missing (or old version). Try to regenerate it from requirements.
            log::info!("Roadmap JSON missing during export. Regenerating from requirements...");
            let roadmap = derive_roadmap(&requirements);

            // Save it for future use (repairing the state)
            // We ignore errors here as we can proceed with the in-memory roadmap
            if let Ok(json) = roadmap.serialize_to_json("roadmap") {
                let _ = write_planning_file(path, &session_id, PlanningFile::RoadmapJson, &json);
            }

            roadmap
        }
    };

    // Load project doc for title/description
    let (title, description) = match read_planning_file(path, &session_id, PlanningFile::Project) {
        Ok(content) => {
            // Extract title from first # heading
            let title = content
                .lines()
                .find(|l| l.starts_with("# "))
                .map(|l| l.trim_start_matches("# ").to_string());
            // Use first paragraph as description
            let description = content
                .lines()
                .skip_while(|l| l.starts_with("#") || l.trim().is_empty())
                .take_while(|l| !l.trim().is_empty())
                .collect::<Vec<_>>()
                .join(" ");
            (
                title,
                if description.is_empty() {
                    None
                } else {
                    Some(description)
                },
            )
        }
        Err(_) => (None, None),
    };

    // Validate and log execution config if provided
    let validated_config = if let Some(ref config) = execution_config {
        // Validate config
        config
            .validate()
            .map_err(|e| format!("Invalid execution config: {}", e))?;

        // Log the captured settings
        if config.has_any_fields() {
            log::info!(
                "GSD export capturing execution settings for PRD '{}': agent_type={:?}, model={:?}, max_iterations={:?}, max_cost={:?}",
                prd_name,
                config.agent_type,
                config.model,
                config.max_iterations,
                config.max_cost
            );
            Some(config.clone())
        } else {
            log::info!("GSD export for PRD '{}': no execution settings captured, will use global config at execution time", prd_name);
            None
        }
    } else {
        log::info!("GSD export for PRD '{}': no execution settings provided, will use global config at execution time", prd_name);
        None
    };

    // Create conversion options
    let options = ConversionOptions {
        branch,
        include_v2: include_v2.unwrap_or(false),
        source_chat_id: Some(session_id.clone()),
        custom_title: Some(prd_name.clone()),
        custom_description: description,
        execution_config: validated_config,
    };

    // Convert to Ralph PRD
    let result = convert_to_ralph_prd(
        &requirements,
        &roadmap,
        title.as_deref(),
        options.custom_description.as_deref(),
        &options,
    );

    // Save the PRD using ralph_loop functions
    let prd_json = result.prd.serialize_to_json("PRD")?;

    // Save to .ralph-ui/prds/{prd_name}.json
    let prds_dir = crate::file_storage::get_ralph_ui_dir(path).join("prds");
    crate::file_storage::ensure_dir(&prds_dir)?;

    // Save JSON
    let prd_path = prds_dir.join(format!("{}.json", prd_name));
    crate::file_storage::atomic_write(&prd_path, &prd_json)?;

    // Save Markdown (required for file watcher and human reading)
    let prd_md = ralph_prd_to_markdown(&result.prd);
    let prd_path_md = prds_dir.join(format!("{}.md", prd_name));
    crate::file_storage::atomic_write(&prd_path_md, &prd_md)?;

    // Mark workflow as complete
    if let Ok(mut state) = load_workflow_state(path, &session_id) {
        state.is_complete = true;
        state.record_decision(crate::gsd::state::GsdDecision::Exported {
            prd_name: prd_name.clone(),
        });
        let _ = save_workflow_state(path, &session_id, &state);
    }

    log::info!(
        "Exported GSD session {} to Ralph PRD: {}.{{json,md}} (with execution config: {})",
        session_id,
        prd_name,
        execution_config.is_some()
    );

    Ok(result)
}

/// Convert Ralph PRD to Markdown format
fn ralph_prd_to_markdown(prd: &crate::ralph_loop::RalphPrd) -> String {
    let mut md = String::new();

    md.push_str(&format!("# {}\n\n", prd.title));

    if let Some(desc) = &prd.description {
        md.push_str(desc);
        md.push_str("\n\n");
    }

    md.push_str(&format!("**Branch**: `{}`\n\n", prd.branch));

    md.push_str("## Stories\n\n");

    for story in &prd.stories {
        md.push_str(&format!("### {} - {}\n\n", story.id, story.title));

        if let Some(desc) = &story.description {
            md.push_str(desc);
            md.push_str("\n\n");
        }

        md.push_str("**Acceptance Criteria:**\n");
        // Split acceptance criteria by lines if it's a block, or just print it
        for line in story.acceptance.lines() {
            let line = line.trim();
            if !line.is_empty() {
                if line.starts_with('-') || line.starts_with('*') {
                    md.push_str(&format!("{}\n", line));
                } else {
                    md.push_str(&format!("- {}\n", line));
                }
            }
        }
        md.push('\n');

        md.push_str(&format!("**Priority**: {}\n", story.priority));
        if !story.dependencies.is_empty() {
            md.push_str(&format!(
                "**Dependencies**: {}\n",
                story.dependencies.join(", ")
            ));
        }
        md.push_str("---\n\n");
    }

    md
}

/// Save a planning file (generic)
pub async fn save_planning_file(
    project_path: String,
    session_id: String,
    file_type: String,
    content: String,
) -> Result<String, String> {
    let path = as_path(&project_path);

    let file = match file_type.as_str() {
        "project" => PlanningFile::Project,
        "summary" => PlanningFile::Summary,
        "requirements" => PlanningFile::Requirements,
        "scoped" => PlanningFile::Scoped,
        "roadmap" => PlanningFile::Roadmap,
        "verification" => PlanningFile::Verification,
        _ => return Err(format!("Unknown file type: {}", file_type)),
    };

    let file_path = write_planning_file(path, &session_id, file, &content)?;
    Ok(file_path.to_string_lossy().to_string())
}

/// Read a planning file (generic)
pub async fn read_gsd_planning_file(
    project_path: String,
    session_id: String,
    file_type: String,
) -> Result<Option<String>, String> {
    let path = as_path(&project_path);

    let file = match file_type.as_str() {
        "project" => PlanningFile::Project,
        "summary" => PlanningFile::Summary,
        "requirements" => PlanningFile::Requirements,
        "scoped" => PlanningFile::Scoped,
        "roadmap" => PlanningFile::Roadmap,
        "verification" => PlanningFile::Verification,
        _ => return Err(format!("Unknown file type: {}", file_type)),
    };

    match read_planning_file(path, &session_id, file) {
        Ok(content) => Ok(Some(content)),
        Err(_) => Ok(None),
    }
}

/// List all planning sessions for a project
pub async fn list_gsd_sessions(project_path: String) -> Result<Vec<PlanningSessionInfo>, String> {
    let path = as_path(&project_path);
    list_planning_sessions(path)
}

/// Delete a planning session
pub async fn delete_gsd_session(project_path: String, session_id: String) -> Result<(), String> {
    let path = as_path(&project_path);
    delete_planning_session(path, &session_id)
}

/// List all sessions with research results for a project
///
/// Returns sessions that have at least one research file (architecture, codebase, best_practices, or risks).
/// Used for the "reuse previous research" feature.
pub async fn list_project_research(
    project_path: String,
) -> Result<Vec<crate::gsd::planning_storage::ResearchSessionInfo>, String> {
    let path = as_path(&project_path);
    crate::gsd::planning_storage::list_project_research(path)
}

/// Copy research files from one session to another
///
/// Copies research output files from a source session to a target session.
/// If research_types is provided, only copies those specific research types.
/// Otherwise copies all available research files.
///
/// Does NOT copy SUMMARY.md - synthesis should be regenerated for the new context.
pub async fn copy_research_to_session(
    project_path: String,
    source_session_id: String,
    target_session_id: String,
    research_types: Option<Vec<String>>,
) -> Result<u32, String> {
    let path = as_path(&project_path);
    crate::gsd::planning_storage::copy_research_to_session(
        path,
        &source_session_id,
        &target_session_id,
        research_types,
    )
}

/// Options for cloning a GSD session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneSessionOptions {
    /// Copy project context (PROJECT.md)
    #[serde(default = "default_true")]
    pub copy_context: bool,
    /// Copy research outputs
    #[serde(default)]
    pub copy_research: bool,
    /// Copy requirements document
    #[serde(default)]
    pub copy_requirements: bool,
}

fn default_true() -> bool {
    true
}

/// Clone a GSD session with specified options
///
/// Creates a new session by copying data from an existing session.
/// Useful for iterating on similar features without starting from scratch.
pub async fn clone_gsd_session(
    project_path: String,
    source_session_id: String,
    options: CloneSessionOptions,
) -> Result<GsdWorkflowState, String> {
    let path = as_path(&project_path);

    // Generate new session ID
    let new_session_id = uuid::Uuid::new_v4().to_string();

    // Initialize new planning directory
    init_planning_session(path, &new_session_id)?;

    // Load source state
    let source_state = load_workflow_state(path, &source_session_id)?;

    // Copy project context if requested
    if options.copy_context {
        if let Ok(content) = read_planning_file(path, &source_session_id, PlanningFile::Project) {
            write_planning_file(path, &new_session_id, PlanningFile::Project, &content)?;
        }
    }

    // Copy research if requested
    if options.copy_research {
        crate::gsd::planning_storage::copy_research_to_session(
            path,
            &source_session_id,
            &new_session_id,
            None, // Copy all research types
        )?;
    }

    // Copy requirements if requested
    if options.copy_requirements {
        if let Ok(content) =
            read_planning_file(path, &source_session_id, PlanningFile::Requirements)
        {
            write_planning_file(path, &new_session_id, PlanningFile::Requirements, &content)?;
        }
        if let Ok(content) =
            read_planning_file(path, &source_session_id, PlanningFile::RequirementsMd)
        {
            write_planning_file(
                path,
                &new_session_id,
                PlanningFile::RequirementsMd,
                &content,
            )?;
        }
    }

    // Create new state based on source, but with new timestamps
    let mut new_state = GsdWorkflowState::new(new_session_id.clone());

    // Copy questioning context if we copied the project file
    if options.copy_context {
        new_state.questioning_context = source_state.questioning_context.clone();
    }

    // Update research status if we copied research
    if options.copy_research {
        new_state.research_status = source_state.research_status.clone();
        // Set phase to research if we have research
        if new_state.research_status.architecture.complete
            || new_state.research_status.codebase.complete
            || new_state.research_status.best_practices.complete
            || new_state.research_status.risks.complete
        {
            new_state.current_phase = GsdPhase::Research;
        }
    }

    // Save the new state
    save_workflow_state(path, &new_session_id, &new_state)?;

    log::info!(
        "Cloned GSD session {} -> {} (context: {}, research: {}, requirements: {})",
        source_session_id,
        new_session_id,
        options.copy_context,
        options.copy_research,
        options.copy_requirements
    );

    Ok(new_state)
}

/// Add a custom requirement to the requirements document
pub async fn add_requirement(
    project_path: String,
    session_id: String,
    category: String,
    title: String,
    description: String,
) -> Result<Requirement, String> {
    use crate::gsd::config::RequirementCategory;

    let path = as_path(&project_path);

    // Parse category string to enum
    let category_enum = match category.to_lowercase().as_str() {
        "core" => RequirementCategory::Core,
        "ui" => RequirementCategory::Ui,
        "data" => RequirementCategory::Data,
        "integration" => RequirementCategory::Integration,
        "security" => RequirementCategory::Security,
        "performance" => RequirementCategory::Performance,
        "testing" => RequirementCategory::Testing,
        "documentation" => RequirementCategory::Documentation,
        _ => RequirementCategory::Other,
    };

    // Load existing requirements (or create new doc)
    let mut doc = match read_planning_file(path, &session_id, PlanningFile::Requirements) {
        Ok(content) => serde_json::from_str::<RequirementsDoc>(&content)
            .unwrap_or_else(|_| RequirementsDoc::new()),
        Err(_) => RequirementsDoc::new(),
    };

    // Add the new requirement
    let id = doc.add_requirement(category_enum.clone(), title.clone(), description.clone());

    // Get the created requirement to return
    let requirement = doc
        .get(&id)
        .cloned()
        .ok_or_else(|| "Failed to retrieve created requirement".to_string())?;

    // Save updated requirements document
    let req_json = doc.serialize_to_json("requirements")?;
    write_planning_file(path, &session_id, PlanningFile::Requirements, &req_json)?;

    // Also save markdown version
    let req_md = doc.to_markdown();
    write_planning_file(path, &session_id, PlanningFile::RequirementsMd, &req_md)?;

    log::info!(
        "Added requirement {} to session {}: {}",
        id,
        session_id,
        title
    );

    Ok(requirement)
}

/// Get list of available CLI agents for GSD research
///
/// Returns only agents that are installed and available on the system.
pub fn get_available_research_agents() -> Vec<AgentType> {
    get_available_agents()
}

/// Load existing research synthesis from SUMMARY.md
///
/// Used to restore synthesis state when reopening a chat session.
/// Returns None if no synthesis exists yet.
pub async fn load_synthesis(
    project_path: String,
    session_id: String,
) -> Result<Option<ResearchSynthesis>, String> {
    let path = as_path(&project_path);

    // Try to read existing SUMMARY.md
    let content = match read_planning_file(&path, &session_id, PlanningFile::Summary) {
        Ok(content) => content,
        Err(_) => return Ok(None), // No synthesis exists yet
    };

    if content.is_empty() {
        return Ok(None);
    }

    // Extract key themes from content (simple parsing)
    let key_themes = extract_key_themes(&content);

    // Count research files
    let planning_dir = crate::gsd::planning_storage::get_planning_dir(&path, &session_id);
    let research_dir = planning_dir.join("research");
    let files_included = std::fs::read_dir(&research_dir)
        .map(|entries| entries.filter_map(|e| e.ok()).count())
        .unwrap_or(0);

    Ok(Some(ResearchSynthesis {
        content,
        files_included,
        missing_files: vec![],
        key_themes,
    }))
}

/// Extract key themes from synthesis content
fn extract_key_themes(content: &str) -> Vec<String> {
    let mut themes = Vec::new();

    // Look for markdown headers that might indicate themes
    for line in content.lines() {
        if line.starts_with("## ") {
            let theme = line.trim_start_matches("## ").trim();
            if !theme.is_empty()
                && !theme.to_lowercase().contains("summary")
                && !theme.to_lowercase().contains("overview")
            {
                themes.push(theme.to_string());
            }
        } else if line.starts_with("### ") {
            let theme = line.trim_start_matches("### ").trim();
            if !theme.is_empty() {
                themes.push(theme.to_string());
            }
        }
    }

    // Limit to reasonable number of themes
    themes.truncate(10);
    themes
}

/// A generated requirement from AI (with temporary ID and suggested scope)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedRequirement {
    /// Temporary ID (e.g., GEN-01) before being accepted
    pub id: String,
    /// Category of the requirement
    pub category: String,
    /// Short title
    pub title: String,
    /// Detailed description
    pub description: String,
    /// Acceptance criteria
    pub acceptance_criteria: Vec<String>,
    /// AI-suggested scope (v1, v2, out_of_scope)
    pub suggested_scope: String,
}

/// Result of AI requirement generation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequirementsResult {
    /// Generated requirements
    pub requirements: Vec<GeneratedRequirement>,
    /// Number of requirements generated
    pub count: usize,
}

/// Agent execution timeout in seconds (5 minutes)
const AGENT_TIMEOUT_SECS: u64 = 300;

/// Sanitize user input to prevent Tera template injection
fn sanitize_tera_input(input: &str) -> String {
    input
        .replace("{{", "{ {")
        .replace("}}", "} }")
        .replace("{%", "{ %")
        .replace("%}", "% }")
        .replace("{#", "{ #")
        .replace("#}", "# }")
}

/// Load existing requirement titles for deduplication
fn load_existing_requirement_titles(
    path: &std::path::Path,
    session_id: &str,
) -> Vec<serde_json::Value> {
    read_planning_file(path, session_id, PlanningFile::Requirements)
        .ok()
        .and_then(|content| serde_json::from_str::<RequirementsDoc>(&content).ok())
        .map(|doc| {
            doc.requirements
                .values()
                .map(|r| serde_json::json!({ "id": r.id, "title": r.title }))
                .collect()
        })
        .unwrap_or_default()
}

/// Broadcast a status event for requirement generation
fn broadcast_status(
    app_handle: &std::sync::Arc<crate::server::EventBroadcaster>,
    session_id: &str,
    status: &str,
    extra: Option<serde_json::Value>,
) {
    let mut payload = serde_json::json!({
        "sessionId": session_id,
        "status": status
    });
    if let Some(extra_obj) = extra {
        if let Some(map) = payload.as_object_mut() {
            if let Some(extra_map) = extra_obj.as_object() {
                for (k, v) in extra_map {
                    map.insert(k.clone(), v.clone());
                }
            }
        }
    }
    app_handle.broadcast("gsd:requirement_generation_status", payload);
}

/// Generate requirements from a natural language prompt using AI
///
/// Takes a user description and generates structured requirements
/// using the configured AI agent.
pub async fn generate_requirements_from_prompt(
    app_handle: std::sync::Arc<crate::server::EventBroadcaster>,
    project_path: String,
    session_id: String,
    prompt: String,
    count: Option<u32>,
    agent_type: Option<String>,
    model: Option<String>,
    env_vars: Option<std::collections::HashMap<String, String>>,
) -> Result<GenerateRequirementsResult, String> {
    use crate::agents::providers::get_provider;
    use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
    use crate::templates::builtin::get_builtin_template;
    use std::process::Stdio;
    use tera::{Context, Tera};
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    let path = as_path(&project_path);
    let target_count = count.unwrap_or(7).clamp(3, 15);

    // Sanitize user prompt to prevent template injection
    let sanitized_prompt = sanitize_tera_input(&prompt);

    // Build template context
    let template_content = get_builtin_template("requirement_generation")
        .ok_or("Requirement generation template not found")?;

    let mut context = Context::new();
    context.insert("user_prompt", &sanitized_prompt);
    context.insert("count", &target_count);
    context.insert(
        "project_context",
        &read_planning_file(path, &session_id, PlanningFile::Project).unwrap_or_default(),
    );
    context.insert(
        "existing_requirements",
        &load_existing_requirement_titles(path, &session_id),
    );

    let rendered_prompt = Tera::one_off(template_content, &context, false)
        .map_err(|e| format!("Failed to render template: {e}"))?;

    // Resolve agent
    let agent: AgentType = agent_type
        .unwrap_or_else(|| "claude".to_string())
        .parse()
        .map_err(|e| format!("Invalid agent type: {e}"))?;

    let provider = get_provider(&agent);
    if !provider.is_available() {
        return Err(format!(
            "{agent:?} CLI not found. Please ensure it is installed and in PATH."
        ));
    }

    log::info!("[GenerateRequirements] Running {agent:?} to generate {target_count} requirements");
    broadcast_status(&app_handle, &session_id, "running", None);

    // Spawn the agent with tools disabled (pure text generation task)
    let spawn_config = AgentSpawnConfig {
        agent_type: agent.clone(),
        task_id: format!("req-gen-{}", uuid::Uuid::new_v4()),
        worktree_path: project_path.clone(),
        branch: "main".to_string(),
        max_iterations: 0,
        prompt: Some(rendered_prompt),
        model,
        spawn_mode: AgentSpawnMode::Piped,
        plugin_config: None,
        env_vars,
        disable_tools: true, // No tools needed for JSON generation
    };

    let std_cmd = provider
        .build_command(&spawn_config)
        .map_err(|e| format!("Failed to build command: {e}"))?;

    let mut child = Command::from(std_cmd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn agent: {e}"))?;

    let mut stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    // Read output with size limit and timeout
    let mut output = Vec::new(); // Dynamic buffer
    let read_result = tokio::time::timeout(
        tokio::time::Duration::from_secs(AGENT_TIMEOUT_SECS),
        stdout.read_to_end(&mut output), // Read UNTIL EOF
    )
    .await;

    match read_result {
        Ok(Ok(_)) => {} // Success
        Ok(Err(e)) => {
            let _ = child.kill().await;
            broadcast_status(
                &app_handle,
                &session_id,
                "error",
                Some(serde_json::json!({ "error": format!("Read error: {e}") })),
            );
            return Err(format!("Failed to read agent output: {e}"));
        }
        Err(_) => {
            let _ = child.kill().await;
            broadcast_status(
                &app_handle,
                &session_id,
                "error",
                Some(serde_json::json!({ "error": "Generation timed out" })),
            );
            return Err("Requirement generation timed out after 5 minutes".to_string());
        }
    };

    let output_str = String::from_utf8_lossy(&output);

    // Log raw AI output for debugging
    log::debug!("[GenerateRequirements] AI output:\n{}", output_str);

    // Wait for process with timeout
    let wait_result =
        tokio::time::timeout(tokio::time::Duration::from_secs(10), child.wait()).await;

    if wait_result.is_err() {
        let _ = child.kill().await;
    }

    // Parse requirements from output
    let requirements = parse_generated_requirements(&output_str)?;

    log::info!(
        "[GenerateRequirements] Generated {} requirements",
        requirements.len()
    );
    broadcast_status(
        &app_handle,
        &session_id,
        "complete",
        Some(serde_json::json!({ "count": requirements.len() })),
    );

    Ok(GenerateRequirementsResult {
        count: requirements.len(),
        requirements,
    })
}

/// Parse a single requirement JSON object into a GeneratedRequirement
fn parse_requirement_item(
    item: &serde_json::Value,
    idx: usize,
) -> Result<GeneratedRequirement, String> {
    // Check if item is an object
    if !item.is_object() {
        return Err(format!(
            "Requirement {idx} is not a valid object, got: {}",
            item
        ));
    }

    // Collect available fields for better error messages
    let available_fields = item
        .as_object()
        .map(|obj| obj.keys().cloned().collect::<Vec<_>>())
        .unwrap_or_default();

    let title = item
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            let fields_str = if available_fields.is_empty() {
                "no fields".to_string()
            } else {
                format!("fields: {}", available_fields.join(", "))
            };
            format!(
                "Requirement {idx} missing 'title' field (has {}). Got: {}",
                fields_str,
                serde_json::to_string_pretty(item).unwrap_or_else(|_| "[invalid JSON]".to_string())
            )
        })?
        .to_string();

    let acceptance_criteria = item
        .get("acceptanceCriteria")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    Ok(GeneratedRequirement {
        id: format!("GEN-{:02}", idx + 1),
        category: item
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("other")
            .to_string(),
        title,
        description: item
            .get("description")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        acceptance_criteria,
        suggested_scope: item
            .get("suggestedScope")
            .and_then(|v| v.as_str())
            .unwrap_or("unscoped")
            .to_string(),
    })
}

/// Extract content from stream-json output (similar to research/orchestrator.rs)
fn extract_content_from_stream(raw_output: &str) -> Result<String, String> {
    use serde_json::Value;

    // Search from the end for the "result" message
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
        // is already clean content (not JSON stream)
        let first_char = raw_output.trim().chars().next();
        if first_char.is_some() && first_char != Some('{') {
            // Doesn't look like JSON stream, might already be clean content
            return Ok(raw_output.to_string());
        }

        // One final check: try to find the JSON array directly in the raw output
        // This handles cases where extract_json_array might find it even if stream parsing failed
        if let Some(json) = extract_json_array(raw_output) {
            return Ok(json);
        }

        Err("Could not extract content from agent output".to_string())
    } else {
        Ok(content.trim().to_string())
    }
}

/// Parse generated requirements from AI agent output
fn parse_generated_requirements(output: &str) -> Result<Vec<GeneratedRequirement>, String> {
    // First try to extract content from stream-json format
    let clean_output = extract_content_from_stream(output).unwrap_or_else(|_| output.to_string());

    let json_str = extract_json_array(&clean_output).ok_or_else(|| {
        // Check if there's a single object instead of array
        let trimmed = output.trim();
        if trimmed.starts_with('{') && !trimmed.starts_with('[') {
            "Found a JSON object instead of an array. The AI may have returned a single requirement instead of an array.".to_string()
        } else {
            log::error!("[ParseRequirements] Failed to extract JSON from output: {}", output);
            "Could not find JSON array in agent output".to_string()
        }
    })?;

    let parsed: Vec<serde_json::Value> = serde_json::from_str(&json_str).map_err(|e| {
        log::error!(
            "[ParseRequirements] JSON parse error: {}\nInput: {}",
            e,
            json_str
        );
        // Add hint for common JSON mistakes
        let error_str = e.to_string();
        if error_str.contains("trailing comma") {
            format!(
                "Invalid JSON: {}. The AI may have generated malformed JSON with trailing commas.",
                e
            )
        } else {
            format!("Failed to parse JSON: {e}")
        }
    })?;

    log::debug!(
        "[ParseRequirements] Extracted JSON array with {} items",
        parsed.len()
    );

    // Detect if AI returned tool names instead of requirement objects
    // This can happen when Claude Code outputs its tool inventory instead of following the prompt
    if !parsed.is_empty() && parsed.iter().all(|v| v.is_string()) {
        let known_tool_patterns: &[&str] = &[
            "Task",
            "TaskOutput",
            "Bash",
            "Glob",
            "Grep",
            "Read",
            "Edit",
            "Write",
            "WebFetch",
            "WebSearch",
            "TodoWrite",
            "TodoRead",
            "Skill",
            "AskUserQuestion",
            "TaskStop",
            "NotebookEdit",
            "ExitPlanMode",
            "EnterPlanMode",
        ];

        let is_tool_list = parsed.iter().all(|v| {
            v.as_str()
                .map(|s| {
                    known_tool_patterns.contains(&s)
                        || s.starts_with("mcp__")      // Standard MCP prefix
                        || s.starts_with("mcp_")       // Alternative MCP prefix (e.g., mcp_dart__)
                        || s.ends_with("_tool") // Common tool suffix
                })
                .unwrap_or(false)
        });

        if is_tool_list {
            return Err(
                "The AI returned a list of tool names instead of requirement objects. This indicates the AI misunderstood the task. Please try again or use a different AI provider/model.".to_string()
            );
        }
    }

    let mut requirements = Vec::new();
    let mut skipped = Vec::new();

    for (idx, item) in parsed.iter().enumerate() {
        match parse_requirement_item(item, idx) {
            Ok(req) => requirements.push(req),
            Err(e) => {
                log::warn!("[ParseRequirements] Skipping requirement {}: {}", idx, e);
                skipped.push((idx, e));
            }
        }
    }

    if requirements.is_empty() {
        let error_msg = if skipped.is_empty() {
            "No valid requirements found in output".to_string()
        } else {
            // Include ALL errors, not just the first one
            let all_errors: Vec<String> = skipped
                .iter()
                .map(|(idx, e)| format!("Requirement {}: {}", idx, e))
                .collect();
            format!(
                "All {} requirement(s) failed to parse:\n{}",
                skipped.len(),
                all_errors.join("\n")
            )
        };
        return Err(error_msg);
    }

    // Warn if high failure rate
    if !skipped.is_empty() {
        let total = skipped.len() + requirements.len();
        let skip_percentage = (skipped.len() as f64 / total as f64) * 100.0;
        if skip_percentage > 50.0 {
            log::warn!(
                "[ParseRequirements] High failure rate: {}/{} requirements ({:.0}%) failed to parse. First error: {}",
                skipped.len(),
                total,
                skip_percentage,
                skipped[0].1
            );
        } else {
            log::info!(
                "[ParseRequirements] Parsed {} requirements, skipped {} invalid",
                requirements.len(),
                skipped.len()
            );
        }
    }

    Ok(requirements)
}

/// Try to extract JSON array from Claude Code stream-json format
fn try_extract_from_stream_json(text: &str) -> Option<String> {
    for line in text.lines().rev() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let json: serde_json::Value = serde_json::from_str(line).ok()?;
        if json.get("type").and_then(|t| t.as_str()) != Some("result") {
            continue;
        }

        let result = json.get("result").and_then(|r| r.as_str())?;
        return find_json_array_bounds(result);
    }
    None
}

/// Find and extract a JSON array from text by tracking bracket depth
fn find_json_array_bounds(text: &str) -> Option<String> {
    let mut bracket_depth = 0;
    let mut in_string = false;
    let mut escape_next = false;
    let mut start_idx = None;

    for (idx, ch) in text.char_indices() {
        if escape_next {
            escape_next = false;
            continue;
        }

        match ch {
            '\\' if in_string => escape_next = true,
            '"' => in_string = !in_string,
            '[' if !in_string => {
                if bracket_depth == 0 {
                    start_idx = Some(idx);
                }
                bracket_depth += 1;
            }
            ']' if !in_string => {
                bracket_depth -= 1;
                if bracket_depth == 0 {
                    let start = start_idx?;
                    return Some(text[start..=idx].to_string());
                }
            }
            _ => {}
        }
    }

    None
}

/// Extract a JSON array from text that might contain other content
fn extract_json_array(text: &str) -> Option<String> {
    // First try stream-json format (from Claude Code)
    try_extract_from_stream_json(text).or_else(|| find_json_array_bounds(text))
}

/// Parse category string to RequirementCategory enum
fn parse_category(category: &str) -> crate::gsd::config::RequirementCategory {
    use crate::gsd::config::RequirementCategory;
    match category.to_lowercase().as_str() {
        "core" => RequirementCategory::Core,
        "ui" => RequirementCategory::Ui,
        "data" => RequirementCategory::Data,
        "integration" => RequirementCategory::Integration,
        "security" => RequirementCategory::Security,
        "performance" => RequirementCategory::Performance,
        "testing" => RequirementCategory::Testing,
        "documentation" => RequirementCategory::Documentation,
        _ => RequirementCategory::Other,
    }
}

/// Parse scope string to ScopeLevel enum
fn parse_scope(scope: &str) -> crate::gsd::config::ScopeLevel {
    use crate::gsd::config::ScopeLevel;
    let normalized = scope.trim().to_lowercase();
    match normalized.as_str() {
        "v1" | "v1 (must have)" | "must have" => ScopeLevel::V1,
        "v2" | "v2 (nice to have)" | "nice to have" => ScopeLevel::V2,
        "out_of_scope" | "out-of-scope" | "out of scope" | "outofscope" => ScopeLevel::OutOfScope,
        _ => ScopeLevel::Unscoped,
    }
}

/// File lock guard for atomic file operations
struct FileLockGuard {
    lock_path: std::path::PathBuf,
}

impl FileLockGuard {
    /// Acquire a file lock with retry logic
    fn acquire(base_path: &std::path::Path, name: &str) -> Result<Self, String> {
        let lock_path = base_path.join(format!(".{}.lock", name));

        // Retry up to 10 times with 100ms delay
        for attempt in 0..10 {
            // Try to create lock file exclusively
            match std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&lock_path)
            {
                Ok(mut file) => {
                    // Write PID and timestamp for debugging
                    use std::io::Write;
                    let _ = writeln!(
                        file,
                        "{}:{}",
                        std::process::id(),
                        chrono::Utc::now().to_rfc3339()
                    );
                    return Ok(Self { lock_path });
                }
                Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                    // Check if lock is stale (older than 30 seconds)
                    if let Ok(metadata) = std::fs::metadata(&lock_path) {
                        if let Ok(modified) = metadata.modified() {
                            let age = std::time::SystemTime::now()
                                .duration_since(modified)
                                .unwrap_or_default();
                            if age > std::time::Duration::from_secs(30) {
                                // Stale lock, remove it
                                let _ = std::fs::remove_file(&lock_path);
                                continue;
                            }
                        }
                    }
                    // Lock is held, wait and retry
                    if attempt < 9 {
                        std::thread::sleep(std::time::Duration::from_millis(100));
                    }
                }
                Err(e) => {
                    return Err(format!("Failed to acquire lock: {e}"));
                }
            }
        }

        Err("Failed to acquire lock after 10 attempts".to_string())
    }
}

impl Drop for FileLockGuard {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.lock_path);
    }
}

/// Add multiple generated requirements to the requirements document
///
/// Converts GeneratedRequirement structs (with temporary IDs) into
/// proper Requirement structs with category-based IDs.
///
/// Uses file locking to prevent race conditions during concurrent updates.
pub async fn add_generated_requirements(
    project_path: String,
    session_id: String,
    generated: Vec<GeneratedRequirement>,
) -> Result<Vec<Requirement>, String> {
    let path = as_path(&project_path);

    // Get planning directory for lock file
    let planning_dir = crate::gsd::planning_storage::get_planning_dir(path, &session_id);

    // Acquire lock before read-modify-write
    let _lock = FileLockGuard::acquire(&planning_dir, "requirements")?;

    let mut doc = read_planning_file(path, &session_id, PlanningFile::Requirements)
        .ok()
        .and_then(|content| serde_json::from_str::<RequirementsDoc>(&content).ok())
        .unwrap_or_else(RequirementsDoc::new);

    let added: Vec<Requirement> = generated
        .into_iter()
        .map(|gen_req| {
            let category = parse_category(&gen_req.category);
            let id = doc.next_id(&category);
            let mut req = Requirement::new(id, category, gen_req.title, gen_req.description);

            // Parse scope with logging for debugging
            req.scope = parse_scope(&gen_req.suggested_scope);
            if req.scope == crate::gsd::config::ScopeLevel::Unscoped
                && !gen_req.suggested_scope.is_empty()
            {
                log::warn!(
                    "Failed to parse scope '{}' for requirement '{}'. defaulting to Unscoped",
                    gen_req.suggested_scope,
                    req.title
                );
            }

            req.acceptance_criteria = gen_req.acceptance_criteria;
            doc.add(req.clone());
            req
        })
        .collect();

    // Save both JSON and markdown versions
    write_planning_file(
        path,
        &session_id,
        PlanningFile::Requirements,
        &doc.serialize_to_json("requirements")?,
    )?;
    write_planning_file(
        path,
        &session_id,
        PlanningFile::RequirementsMd,
        &doc.to_markdown(),
    )?;

    log::info!(
        "Added {} generated requirements to session {session_id}",
        added.len()
    );

    Ok(added)
}

/// Detect project type from configuration files
pub async fn detect_project_type(project_path: String) -> Result<ProjectTypeDetection, String> {
    let path = as_path(&project_path);
    Ok(detect_type(path))
}

/// Analyzes the quality of questioning context using LLM
pub async fn analyze_context_quality(
    context: QuestioningContext,
    project_type: Option<ProjectType>,
) -> Result<ContextQualityReport, String> {
    use crate::agents::providers::get_provider;
    use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
    use crate::templates::builtin::get_builtin_template;
    use std::process::Stdio;
    use tera::{Context, Tera};
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    // Build template context
    let template_content = get_builtin_template("context_quality_analysis")
        .ok_or("Context quality analysis template not found")?;

    let mut tera_context = Context::new();
    if let Some(pt) = project_type {
        // Convert camelCase to snake_case for template
        let project_type_str = match pt {
            ProjectType::WebApp => "web_app",
            ProjectType::CliTool => "cli_tool",
            ProjectType::ApiService => "api_service",
            ProjectType::Library => "library",
            ProjectType::MobileApp => "mobile_app",
            ProjectType::DesktopApp => "desktop_app",
            ProjectType::DataPipeline => "data_pipeline",
            ProjectType::DevopsTool => "devops_tool",
            ProjectType::Documentation => "documentation",
            ProjectType::Other => "other",
        };
        tera_context.insert("project_type", project_type_str);
    }

    // Sanitize context fields
    let mut context_obj = serde_json::Map::new();
    if let Some(what) = &context.what {
        context_obj.insert("what".to_string(), sanitize_tera_input(what).into());
    }
    if let Some(why) = &context.why {
        context_obj.insert("why".to_string(), sanitize_tera_input(why).into());
    }
    if let Some(who) = &context.who {
        context_obj.insert("who".to_string(), sanitize_tera_input(who).into());
    }
    if let Some(done) = &context.done {
        context_obj.insert("done".to_string(), sanitize_tera_input(done).into());
    }
    context_obj.insert(
        "notes".to_string(),
        context
            .notes
            .iter()
            .map(|s| sanitize_tera_input(s))
            .collect::<Vec<_>>()
            .into(),
    );
    tera_context.insert("context", &context_obj);

    let rendered_prompt = Tera::one_off(template_content, &tera_context, false)
        .map_err(|e| format!("Failed to render template: {e}"))?;

    // Resolve agent (use Claude by default)
    let agent: AgentType = "claude"
        .parse()
        .map_err(|e| format!("Invalid agent type: {e}"))?;
    let provider = get_provider(&agent);
    if !provider.is_available() {
        // Fallback to heuristic-based analysis if agent not available
        return analyze_context_quality_heuristic(&context);
    }

    log::info!("[ContextQuality] Running {agent:?} to analyze context");

    // Spawn agent with tools disabled
    let spawn_config = AgentSpawnConfig {
        agent_type: agent.clone(),
        task_id: format!("ctx-quality-{}", uuid::Uuid::new_v4()),
        worktree_path: ".".to_string(),
        branch: "main".to_string(),
        max_iterations: 0,
        prompt: Some(rendered_prompt),
        model: None,
        spawn_mode: AgentSpawnMode::Piped,
        plugin_config: None,
        env_vars: None,
        disable_tools: true,
    };

    let std_cmd = provider
        .build_command(&spawn_config)
        .map_err(|e| format!("Failed to build command: {e}"))?;

    let mut child = Command::from(std_cmd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn agent: {e}"))?;

    let mut stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    // Read output with timeout
    let mut output = Vec::new();
    let read_result = tokio::time::timeout(
        tokio::time::Duration::from_secs(60), // 1 minute timeout
        stdout.read_to_end(&mut output),
    )
    .await;

    match read_result {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            let _ = child.kill().await;
            return Err(format!("Failed to read agent output: {e}"));
        }
        Err(_) => {
            let _ = child.kill().await;
            return Err("Context quality analysis timed out".to_string());
        }
    }

    let _ = tokio::time::timeout(tokio::time::Duration::from_secs(5), child.wait()).await;

    let output_str = String::from_utf8_lossy(&output);

    // Parse JSON response
    let report: ContextQualityReport = serde_json::from_str(&output_str)
        .map_err(|e| format!("Failed to parse quality report: {e}\nOutput: {output_str}"))?;

    log::info!(
        "[ContextQuality] Analysis complete: overall score {}",
        report.overall_score
    );
    Ok(report)
}

/// Fallback heuristic-based context quality analysis
fn analyze_context_quality_heuristic(
    context: &QuestioningContext,
) -> Result<ContextQualityReport, String> {
    use crate::gsd::startup::ContextQualityIssue;

    let mut issues = Vec::new();
    let mut suggestions = Vec::new();

    // Check completeness
    let has_what = context.what.as_deref().map_or(false, |s| s.len() > 10);
    let has_why = context.why.as_deref().map_or(false, |s| s.len() > 10);
    let has_who = context.who.as_deref().map_or(false, |s| s.len() > 10);
    let has_done = context.done.as_deref().map_or(false, |s| s.len() > 10);

    let filled_count = [has_what, has_why, has_who, has_done]
        .iter()
        .filter(|&&x| x)
        .count();

    // Completeness score
    let completeness_score = match filled_count {
        0 | 1 => 20,
        2 => 40,
        3 => 70,
        4 => 100,
        _ => 0,
    };

    // Check specificity
    let specificity_score = if has_what {
        let what_len = context.what.as_deref().map_or(0, |s| s.len());
        match what_len {
            0..=20 => 30,
            21..=50 => 50,
            51..=100 => 70,
            _ => 85,
        }
    } else {
        20
    };

    // Actionability score (based on what and done fields mainly)
    let actionability_score = if has_what && has_done {
        75
    } else if has_what {
        50
    } else {
        20
    };

    // Generate issues
    if !has_what {
        issues.push(ContextQualityIssue {
            issue_type: "missing_info".to_string(),
            message: "Missing 'what' - what are you building?".to_string(),
            severity: "error".to_string(),
            field: "what".to_string(),
        });
        suggestions.push("Describe what you're building in 1-2 sentences".to_string());
    }

    if !has_why {
        issues.push(ContextQualityIssue {
            issue_type: "missing_info".to_string(),
            message: "Missing 'why' - what problem are you solving?".to_string(),
            severity: "error".to_string(),
            field: "why".to_string(),
        });
        suggestions.push("Explain the motivation or problem being solved".to_string());
    }

    if !has_who {
        issues.push(ContextQualityIssue {
            issue_type: "missing_info".to_string(),
            message: "Missing 'who' - who will use this?".to_string(),
            severity: "warning".to_string(),
            field: "who".to_string(),
        });
        suggestions.push("Identify your target users or audience".to_string());
    }

    if !has_done {
        issues.push(ContextQualityIssue {
            issue_type: "missing_info".to_string(),
            message: "Missing 'done' - what defines success?".to_string(),
            severity: "error".to_string(),
            field: "done".to_string(),
        });
        suggestions.push("Define clear success criteria or definition of done".to_string());
    }

    let overall_score = (specificity_score + completeness_score + actionability_score) / 3;
    let is_good_enough = overall_score >= 70;

    Ok(ContextQualityReport {
        specificity_score: specificity_score as u32,
        completeness_score: completeness_score as u32,
        actionability_score: actionability_score as u32,
        overall_score: overall_score as u32,
        issues,
        suggestions,
        is_good_enough,
    })
}

/// Generates smart context suggestions using LLM
pub async fn generate_context_suggestions(
    project_type: ProjectType,
    context: QuestioningContext,
) -> Result<ContextSuggestions, String> {
    use crate::agents::providers::get_provider;
    use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
    use crate::templates::builtin::get_builtin_template;
    use std::process::Stdio;
    use tera::{Context, Tera};
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    // Build template context
    let template_content = get_builtin_template("context_suggestions")
        .ok_or("Context suggestions template not found")?;

    let mut tera_context = Context::new();

    // Convert project type to string
    let project_type_str = match project_type {
        ProjectType::WebApp => "web_app",
        ProjectType::CliTool => "cli_tool",
        ProjectType::ApiService => "api_service",
        ProjectType::Library => "library",
        ProjectType::MobileApp => "mobile_app",
        ProjectType::DesktopApp => "desktop_app",
        ProjectType::DataPipeline => "data_pipeline",
        ProjectType::DevopsTool => "devops_tool",
        ProjectType::Documentation => "documentation",
        ProjectType::Other => "other",
    };
    tera_context.insert("project_type", project_type_str);

    // Sanitize context fields
    let mut context_obj = serde_json::Map::new();
    if let Some(what) = &context.what {
        context_obj.insert("what".to_string(), sanitize_tera_input(what).into());
    }
    if let Some(why) = &context.why {
        context_obj.insert("why".to_string(), sanitize_tera_input(why).into());
    }
    if let Some(who) = &context.who {
        context_obj.insert("who".to_string(), sanitize_tera_input(who).into());
    }
    if let Some(done) = &context.done {
        context_obj.insert("done".to_string(), sanitize_tera_input(done).into());
    }
    context_obj.insert(
        "notes".to_string(),
        context
            .notes
            .iter()
            .map(|s| sanitize_tera_input(s))
            .collect::<Vec<_>>()
            .into(),
    );
    tera_context.insert("context", &context_obj);

    let rendered_prompt = Tera::one_off(template_content, &tera_context, false)
        .map_err(|e| format!("Failed to render template: {e}"))?;

    // Resolve agent
    let agent: AgentType = "claude"
        .parse()
        .map_err(|e| format!("Invalid agent type: {e}"))?;
    let provider = get_provider(&agent);
    if !provider.is_available() {
        // Fallback to heuristic suggestions
        return generate_context_suggestions_heuristic(project_type, &context);
    }

    log::info!("[ContextSuggestions] Running {agent:?} to generate suggestions");

    // Spawn agent with tools disabled
    let spawn_config = AgentSpawnConfig {
        agent_type: agent.clone(),
        task_id: format!("ctx-suggestions-{}", uuid::Uuid::new_v4()),
        worktree_path: ".".to_string(),
        branch: "main".to_string(),
        max_iterations: 0,
        prompt: Some(rendered_prompt),
        model: None,
        spawn_mode: AgentSpawnMode::Piped,
        plugin_config: None,
        env_vars: None,
        disable_tools: true,
    };

    let std_cmd = provider
        .build_command(&spawn_config)
        .map_err(|e| format!("Failed to build command: {e}"))?;

    let mut child = Command::from(std_cmd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn agent: {e}"))?;

    let mut stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    // Read output with timeout
    let mut output = Vec::new();
    let read_result = tokio::time::timeout(
        tokio::time::Duration::from_secs(90), // 1.5 minute timeout
        stdout.read_to_end(&mut output),
    )
    .await;

    match read_result {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            let _ = child.kill().await;
            return Err(format!("Failed to read agent output: {e}"));
        }
        Err(_) => {
            let _ = child.kill().await;
            return Err("Context suggestions generation timed out".to_string());
        }
    }

    let _ = tokio::time::timeout(tokio::time::Duration::from_secs(5), child.wait()).await;

    let output_str = String::from_utf8_lossy(&output);

    // Parse JSON response
    let suggestions: ContextSuggestions = serde_json::from_str(&output_str)
        .map_err(|e| format!("Failed to parse suggestions: {e}\nOutput: {output_str}"))?;

    log::info!("[ContextSuggestions] Generated {} suggestion categories", 4);
    Ok(suggestions)
}

/// Fallback heuristic-based context suggestions
fn generate_context_suggestions_heuristic(
    project_type: ProjectType,
    _context: &QuestioningContext,
) -> Result<ContextSuggestions, String> {
    let (what, why, who, done) = match project_type {
        ProjectType::WebApp => (
            vec![
                "A web application that allows users to [core action] and [secondary action]".to_string(),
                "A responsive web platform for [target users] to [primary goal]".to_string(),
                "An interactive web experience focused on [key feature] with real-time updates".to_string(),
            ],
            vec![
                "To simplify [problem] and provide a more efficient way to [solution]".to_string(),
                "To fill the gap in the market for [need] with an accessible web solution".to_string(),
                "To empower users to [action] without requiring specialized software or training".to_string(),
            ],
            vec![
                "Users who need to [action] but lack existing tools".to_string(),
                "Individuals or teams working in [domain] who need [capability]".to_string(),
                "Professionals and hobbyists seeking a streamlined solution for [problem]".to_string(),
            ],
            vec![
                "When users can successfully [primary action] and [secondary action] through the web interface".to_string(),
                "When the application is deployed and accessible via [deployment target]".to_string(),
                "When user testing shows [specific metric] improvement over baseline".to_string(),
            ],
        ),
        ProjectType::CliTool => (
            vec![
                "A command-line tool that automates [task] for developers".to_string(),
                "A CLI utility to streamline [workflow] by [action]".to_string(),
                "A terminal-based application that provides [capability] with simple commands".to_string(),
            ],
            vec![
                "To reduce the time and effort required for [task]".to_string(),
                "To provide a consistent interface for [operation] across different platforms".to_string(),
                "To eliminate manual steps in [workflow] and reduce human error".to_string(),
            ],
            vec![
                "Developers and system administrators who frequently need to [action]".to_string(),
                "Users who prefer command-line interfaces over GUI applications".to_string(),
                "Teams automating deployment or CI/CD workflows".to_string(),
            ],
            vec![
                "When the tool accepts all required arguments and produces valid output".to_string(),
                "When the tool can be installed via [package manager] and added to PATH".to_string(),
                "When tests pass for common use cases and edge cases are documented".to_string(),
            ],
        ),
        ProjectType::ApiService => (
            vec![
                "A RESTful API service that exposes [capability] to client applications".to_string(),
                "A backend service that handles [operation] with proper authentication and rate limiting".to_string(),
                "A microservice architecture for [domain] with real-time data processing".to_string(),
            ],
            vec![
                "To provide a standardized interface for [service] that can be consumed by multiple clients".to_string(),
                "To enable third-party integration with [system] through documented endpoints".to_string(),
                "To decouple [frontend] concerns from backend business logic".to_string(),
            ],
            vec![
                "Mobile applications that need to access [data] from the cloud".to_string(),
                "Web applications requiring secure user authentication and data storage".to_string(),
                "Third-party developers building on top of [platform]".to_string(),
            ],
            vec![
                "When all endpoints return valid responses with proper status codes".to_string(),
                "When API documentation is complete and endpoints are accessible from external clients".to_string(),
                "When load testing shows acceptable performance under expected traffic".to_string(),
            ],
        ),
        _ => (
            vec![
                "A software solution that provides [core functionality] for users".to_string(),
                "An application to address [problem] with efficient and intuitive design".to_string(),
                "A platform that enables [action] with modern tools and best practices".to_string(),
            ],
            vec![
                "To solve [problem] that affects users in [context]".to_string(),
                "To improve [process] by reducing [metric] and increasing [benefit]".to_string(),
                "To enable users to accomplish [goal] more easily than current alternatives".to_string(),
            ],
            vec![
                "Users who need to [action] on a regular basis".to_string(),
                "Organizations seeking to improve their [workflow]".to_string(),
                "Individuals looking for a better solution to [problem]".to_string(),
            ],
            vec![
                "When the core functionality works as specified in requirements".to_string(),
                "When the application can be deployed and accessed by end users".to_string(),
                "When key performance metrics meet or exceed targets defined in planning".to_string(),
            ],
        ),
    };

    Ok(ContextSuggestions {
        project_type,
        what,
        why,
        who,
        done,
    })
}

/// Generate idea starters using LLM
pub async fn generate_idea_starters(
    project_type: ProjectType,
    context: QuestioningContext,
) -> Result<Vec<GeneratedIdea>, String> {
    use crate::agents::providers::get_provider;
    use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
    use crate::templates::builtin::get_builtin_template;
    use std::process::Stdio;
    use tera::{Context, Tera};
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    // Build template context
    let template_content =
        get_builtin_template("idea_starters").ok_or("Idea starters template not found")?;

    let mut tera_context = Context::new();

    // Convert project type to string
    let project_type_str = match project_type {
        ProjectType::WebApp => "web_app",
        ProjectType::CliTool => "cli_tool",
        ProjectType::ApiService => "api_service",
        ProjectType::Library => "library",
        ProjectType::MobileApp => "mobile_app",
        ProjectType::DesktopApp => "desktop_app",
        ProjectType::DataPipeline => "data_pipeline",
        ProjectType::DevopsTool => "devops_tool",
        ProjectType::Documentation => "documentation",
        ProjectType::Other => "other",
    };
    tera_context.insert("project_type", project_type_str);

    // Sanitize context fields
    let mut context_obj = serde_json::Map::new();
    if let Some(what) = &context.what {
        context_obj.insert("what".to_string(), sanitize_tera_input(what).into());
    } else {
        context_obj.insert("what".to_string(), "".to_string().into());
    }
    if let Some(why) = &context.why {
        context_obj.insert("why".to_string(), sanitize_tera_input(why).into());
    } else {
        context_obj.insert("why".to_string(), "".to_string().into());
    }
    if let Some(who) = &context.who {
        context_obj.insert("who".to_string(), sanitize_tera_input(who).into());
    } else {
        context_obj.insert("who".to_string(), "".to_string().into());
    }
    if let Some(done) = &context.done {
        context_obj.insert("done".to_string(), sanitize_tera_input(done).into());
    } else {
        context_obj.insert("done".to_string(), "".to_string().into());
    }
    context_obj.insert(
        "notes".to_string(),
        context
            .notes
            .iter()
            .map(|s| sanitize_tera_input(s))
            .collect::<Vec<_>>()
            .into(),
    );
    tera_context.insert("context", &context_obj);

    let rendered_prompt = Tera::one_off(template_content, &tera_context, false)
        .map_err(|e| format!("Failed to render template: {e}"))?;

    // Resolve agent
    let agent: AgentType = "claude"
        .parse()
        .map_err(|e| format!("Invalid agent type: {e}"))?;
    let provider = get_provider(&agent);
    if !provider.is_available() {
        // Fallback to heuristic idea starters
        return generate_idea_starters_heuristic(project_type);
    }

    log::info!("[IdeaStarters] Running {agent:?} to generate ideas");

    // Spawn agent with tools disabled
    let spawn_config = AgentSpawnConfig {
        agent_type: agent.clone(),
        task_id: format!("idea-starters-{}", uuid::Uuid::new_v4()),
        worktree_path: ".".to_string(),
        branch: "main".to_string(),
        max_iterations: 0,
        prompt: Some(rendered_prompt),
        model: None,
        spawn_mode: AgentSpawnMode::Piped,
        plugin_config: None,
        env_vars: None,
        disable_tools: true,
    };

    let std_cmd = provider
        .build_command(&spawn_config)
        .map_err(|e| format!("Failed to build command: {e}"))?;

    let mut child = Command::from(std_cmd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn agent: {e}"))?;

    let mut stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    // Read output with timeout
    let mut output = Vec::new();
    let read_result = tokio::time::timeout(
        tokio::time::Duration::from_secs(120), // 2 minute timeout
        stdout.read_to_end(&mut output),
    )
    .await;

    match read_result {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            let _ = child.kill().await;
            return Err(format!("Failed to read agent output: {e}"));
        }
        Err(_) => {
            let _ = child.kill().await;
            return Err("Idea starters generation timed out".to_string());
        }
    }

    let _ = tokio::time::timeout(tokio::time::Duration::from_secs(5), child.wait()).await;

    let output_str = String::from_utf8_lossy(&output);

    // Parse JSON response
    let ideas: Vec<GeneratedIdea> = serde_json::from_str(&output_str)
        .map_err(|e| format!("Failed to parse ideas: {e}\nOutput: {output_str}"))?;

    log::info!("[IdeaStarters] Generated {} ideas", ideas.len());
    Ok(ideas)
}

/// Fallback heuristic-based idea starters
fn generate_idea_starters_heuristic(
    project_type: ProjectType,
) -> Result<Vec<GeneratedIdea>, String> {
    match project_type {
        ProjectType::WebApp => Ok(vec![
            GeneratedIdea {
                id: "idea-web-1".to_string(),
                title: "Task Management Dashboard".to_string(),
                summary: "A collaborative web application for teams to manage tasks, projects, and deadlines with real-time updates.".to_string(),
                context: QuestioningContext {
                    what: Some("A web-based task and project management platform with kanban boards, task lists, calendars, and real-time collaboration features".to_string()),
                    why: Some("To help teams stay organized, track progress, and meet deadlines more efficiently without complex project management software".to_string()),
                    who: Some("Small to medium-sized teams, freelancers, and project managers who need a simple but powerful task tracking solution".to_string()),
                    done: Some("When teams can create projects, add tasks with deadlines, assign tasks, track progress with kanban views, and receive real-time notifications".to_string()),
                    notes: vec![],
                },
                suggested_features: vec![
                    "Drag-and-drop kanban board".to_string(),
                    "Real-time task updates".to_string(),
                    "Calendar and timeline views".to_string(),
                    "Team member assignment and comments".to_string(),
                    "Deadline reminders and notifications".to_string(),
                ],
                tech_stack: Some(vec!["React".to_string(), "Node.js".to_string(), "PostgreSQL".to_string(), "Socket.io".to_string()]),
            },
            GeneratedIdea {
                id: "idea-web-2".to_string(),
                title: "Knowledge Base Wiki".to_string(),
                summary: "A modern documentation platform with rich text editing, search, and collaborative features.".to_string(),
                context: QuestioningContext {
                    what: Some("A web-based knowledge base and documentation platform with markdown support, search, version history, and collaborative editing".to_string()),
                    why: Some("To provide teams with a centralized place to document processes, share knowledge, and maintain up-to-date documentation".to_string()),
                    who: Some("Development teams, documentation writers, and organizations that need to maintain and share technical documentation".to_string()),
                    done: Some("When users can create, edit, and organize documentation pages, search content effectively, and track changes with version history".to_string()),
                    notes: vec![],
                },
                suggested_features: vec![
                    "Markdown and rich text editor".to_string(),
                    "Full-text search with filters".to_string(),
                    "Version history and rollback".to_string(),
                    "Real-time collaborative editing".to_string(),
                    "Organize with tags and categories".to_string(),
                ],
                tech_stack: Some(vec!["Next.js".to_string(), "MDX".to_string(), "Elasticsearch".to_string(), "PostgreSQL".to_string()]),
            },
        ]),
        ProjectType::CliTool => Ok(vec![
            GeneratedIdea {
                id: "idea-cli-1".to_string(),
                title: "Git Workflow Automation Tool".to_string(),
                summary: "A CLI tool to automate common Git workflows and enforce best practices across teams.".to_string(),
                context: QuestioningContext {
                    what: Some("A command-line tool that automates Git workflows including branching, commit message linting, and PR generation".to_string()),
                    why: Some("To reduce manual Git operations, enforce consistent commit messages, and streamline the pull request process".to_string()),
                    who: Some("Software developers and development teams using Git for version control".to_string()),
                    done: Some("When developers can run simple commands to create feature branches, validate commit messages, and generate pull request templates".to_string()),
                    notes: vec![],
                },
                suggested_features: vec![
                    "Branch naming conventions enforcement".to_string(),
                    "Commit message linting with presets".to_string(),
                    "Automated PR description generation".to_string(),
                    "Git hooks integration".to_string(),
                    "Team workflow customization".to_string(),
                ],
                tech_stack: Some(vec!["Rust".to_string(), "Git CLI".to_string()]),
            },
            GeneratedIdea {
                id: "idea-cli-2".to_string(),
                title: "Project Template Generator".to_string(),
                summary: "A CLI tool to scaffold new projects with best practices and custom templates.".to_string(),
                context: QuestioningContext {
                    what: Some("A command-line tool that generates new project structures with predefined templates, dependencies, and configuration files".to_string()),
                    why: Some("To accelerate project setup and ensure consistent code quality across new projects".to_string()),
                    who: Some("Developers and teams frequently starting new projects who want to skip manual setup".to_string()),
                    done: Some("When users can run a single command to generate a complete project structure with dependencies installed and configured".to_string()),
                    notes: vec![],
                },
                suggested_features: vec![
                    "Multiple project templates (web, cli, library)".to_string(),
                    "Interactive configuration wizard".to_string(),
                    "Template versioning and updates".to_string(),
                    "Custom template support".to_string(),
                    "Post-generation setup scripts".to_string(),
                ],
                tech_stack: Some(vec!["Rust".to_string(), "Handlebars".to_string(), "Git".to_string()]),
            },
        ]),
        ProjectType::ApiService => Ok(vec![
            GeneratedIdea {
                id: "idea-api-1".to_string(),
                title: "User Authentication API".to_string(),
                summary: "A standalone authentication service supporting OAuth, JWT tokens, and multi-factor authentication.".to_string(),
                context: QuestioningContext {
                    what: Some("A RESTful API service that handles user authentication, registration, password reset, and token management".to_string()),
                    why: Some("To provide a secure, reusable authentication solution that can be integrated by multiple applications".to_string()),
                    who: Some("Development teams building applications that need user authentication without implementing it from scratch".to_string()),
                    done: Some("When applications can register users, authenticate with OAuth providers, issue and validate JWT tokens, and handle password resets securely".to_string()),
                    notes: vec![],
                },
                suggested_features: vec![
                    "OAuth 2.0 integration (Google, GitHub)".to_string(),
                    "JWT token generation and validation".to_string(),
                    "Password reset via email".to_string(),
                    "Multi-factor authentication (TOTP)".to_string(),
                    "Rate limiting and security headers".to_string(),
                ],
                tech_stack: Some(vec!["Rust".to_string(), "Axum".to_string(), "PostgreSQL".to_string(), "Redis".to_string()]),
            },
            GeneratedIdea {
                id: "idea-api-2".to_string(),
                title: "File Storage API".to_string(),
                summary: "A cloud storage API with file uploads, downloads, and metadata management.".to_string(),
                context: QuestioningContext {
                    what: Some("A RESTful API for file upload, download, organization, and metadata management with chunked uploads for large files".to_string()),
                    why: Some("To provide a simple, programmable file storage solution without cloud vendor lock-in".to_string()),
                    who: Some("Applications needing to store user-generated content or manage large file uploads".to_string()),
                    done: Some("When applications can upload files via chunked uploads, download files, organize files in folders, and query file metadata".to_string()),
                    notes: vec![],
                },
                suggested_features: vec![
                    "Chunked uploads with resume capability".to_string(),
                    "Folder organization and navigation".to_string(),
                    "File metadata and search".to_string(),
                    "Presigned URLs for direct downloads".to_string(),
                    "Storage backends (S3, local disk)".to_string(),
                ],
                tech_stack: Some(vec!["Rust".to_string(), "Actix-web".to_string(), "S3 SDK".to_string(), "PostgreSQL".to_string()]),
            },
        ]),
        _ => Ok(vec![
            GeneratedIdea {
                id: "idea-generic-1".to_string(),
                title: "Data Processing Pipeline".to_string(),
                summary: "An automated pipeline for ingesting, transforming, and analyzing data from multiple sources.".to_string(),
                context: QuestioningContext {
                    what: Some("A data processing system that ingests data from APIs and files, applies transformations, and stores results for analysis".to_string()),
                    why: Some("To automate data workflows and reduce manual data preparation effort".to_string()),
                    who: Some("Data analysts, data engineers, and teams working with regularly updated data sources".to_string()),
                    done: Some("When the system can automatically ingest data from configured sources, apply defined transformations, and output processed data to storage or analytics".to_string()),
                    notes: vec![],
                },
                suggested_features: vec![
                    "Multiple data source connectors".to_string(),
                    "Declarative transformation rules".to_string(),
                    "Error handling and retry logic".to_string(),
                    "Monitoring and logging".to_string(),
                    "Scheduled and event-driven runs".to_string(),
                ],
                tech_stack: Some(vec!["Python".to_string(), "Apache Airflow".to_string(), "PostgreSQL".to_string()]),
            },
        ]),
    }
}

/// Generate idea variations based on dimensions
pub async fn generate_idea_variations(
    project_type: ProjectType,
    context: QuestioningContext,
    variation_dimensions: Vec<String>,
    count: u8,
) -> Result<Vec<crate::gsd::startup::ValidatedIdea>, String> {
    use crate::agents::providers::get_provider;
    use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
    use crate::gsd::startup::ValidatedIdea;
    use crate::templates::builtin::get_builtin_template;
    use std::process::Stdio;
    use tera::{Context, Tera};
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    let template_content =
        get_builtin_template("idea_variations").ok_or("Idea variations template not found")?;

    let mut tera_context = Context::new();
    let project_type_str = serde_json::to_string(&project_type)
        .unwrap_or_default()
        .replace('"', "");

    tera_context.insert("project_type", &project_type_str);

    // Sanitize context fields
    let mut context_obj = serde_json::Map::new();
    if let Some(what) = &context.what {
        context_obj.insert("what".to_string(), sanitize_tera_input(what).into());
    } else {
        context_obj.insert("what".to_string(), "".to_string().into());
    }
    if let Some(why) = &context.why {
        context_obj.insert("why".to_string(), sanitize_tera_input(why).into());
    } else {
        context_obj.insert("why".to_string(), "".to_string().into());
    }
    if let Some(who) = &context.who {
        context_obj.insert("who".to_string(), sanitize_tera_input(who).into());
    } else {
        context_obj.insert("who".to_string(), "".to_string().into());
    }
    if let Some(done) = &context.done {
        context_obj.insert("done".to_string(), sanitize_tera_input(done).into());
    } else {
        context_obj.insert("done".to_string(), "".to_string().into());
    }
    context_obj.insert(
        "notes".to_string(),
        context
            .notes
            .iter()
            .map(|s| sanitize_tera_input(s))
            .collect::<Vec<_>>()
            .into(),
    );
    tera_context.insert("context", &context_obj);
    tera_context.insert("variation_dimensions", &variation_dimensions);
    tera_context.insert("count", &count);

    let rendered_prompt = Tera::one_off(template_content, &tera_context, false)
        .map_err(|e| format!("Failed to render template: {e}"))?;

    let agent: AgentType = "claude"
        .parse()
        .map_err(|e| format!("Invalid agent type: {e}"))?;
    let provider = get_provider(&agent);
    if !provider.is_available() {
        return Err("Claude agent not available for idea variations".to_string());
    }

    log::info!("[IdeaVariations] Running {agent:?} to generate variations");

    let spawn_config = AgentSpawnConfig {
        agent_type: agent.clone(),
        task_id: format!("idea-variations-{}", uuid::Uuid::new_v4()),
        worktree_path: ".".to_string(),
        branch: "main".to_string(),
        max_iterations: 0,
        prompt: Some(rendered_prompt),
        model: None,
        spawn_mode: AgentSpawnMode::Piped,
        plugin_config: None,
        env_vars: None,
        disable_tools: true,
    };

    let std_cmd = provider
        .build_command(&spawn_config)
        .map_err(|e| format!("Failed to build command: {e}"))?;

    let mut child = Command::from(std_cmd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn agent: {e}"))?;

    let mut stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    let mut output = Vec::new();
    let read_result = tokio::time::timeout(
        tokio::time::Duration::from_secs(120),
        stdout.read_to_end(&mut output),
    )
    .await;

    match read_result {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            let _ = child.kill().await;
            return Err(format!("Failed to read agent output: {e}"));
        }
        Err(_) => {
            let _ = child.kill().await;
            return Err("Idea variations generation timed out".to_string());
        }
    }

    let _ = tokio::time::timeout(tokio::time::Duration::from_secs(5), child.wait()).await;

    let output_str = String::from_utf8_lossy(&output);

    // Parse as base ideas first, then wrap in ValidatedIdea
    let base_ideas: Vec<crate::gsd::startup::GeneratedIdea> = serde_json::from_str(&output_str)
        .map_err(|e| format!("Failed to parse ideas: {e}\nOutput: {output_str}"))?;

    let validated_ideas: Vec<crate::gsd::startup::ValidatedIdea> = base_ideas
        .into_iter()
        .map(|base| ValidatedIdea {
            base,
            feasibility: None,
            market: None,
            user_score: None,
            interest_match_score: None,
        })
        .collect();

    log::info!(
        "[IdeaVariations] Generated {} variations",
        validated_ideas.len()
    );
    Ok(validated_ideas)
}

/// Analyze market opportunity for an idea
pub async fn analyze_market_opportunity(
    idea: crate::gsd::startup::GeneratedIdea,
) -> Result<crate::gsd::startup::MarketOpportunity, String> {
    use crate::agents::providers::get_provider;
    use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
    use crate::templates::builtin::get_builtin_template;
    use std::process::Stdio;
    use tera::{Context, Tera};
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    let template_content =
        get_builtin_template("market_analysis").ok_or("Market analysis template not found")?;

    let mut tera_context = Context::new();

    // Serialize idea for template
    let idea_json =
        serde_json::to_value(&idea).map_err(|e| format!("Failed to serialize idea: {e}"))?;
    tera_context.insert("idea", &idea_json);

    let rendered_prompt = Tera::one_off(template_content, &tera_context, false)
        .map_err(|e| format!("Failed to render template: {e}"))?;

    let agent: AgentType = "claude"
        .parse()
        .map_err(|e| format!("Invalid agent type: {e}"))?;
    let provider = get_provider(&agent);
    if !provider.is_available() {
        return Err("Claude agent not available for market analysis".to_string());
    }

    log::info!("[MarketAnalysis] Running {agent:?} for market analysis");

    let spawn_config = AgentSpawnConfig {
        agent_type: agent.clone(),
        task_id: format!("market-analysis-{}", uuid::Uuid::new_v4()),
        worktree_path: ".".to_string(),
        branch: "main".to_string(),
        max_iterations: 0,
        prompt: Some(rendered_prompt),
        model: None,
        spawn_mode: AgentSpawnMode::Piped,
        plugin_config: None,
        env_vars: None,
        disable_tools: true,
    };

    let std_cmd = provider
        .build_command(&spawn_config)
        .map_err(|e| format!("Failed to build command: {e}"))?;

    let mut child = Command::from(std_cmd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn agent: {e}"))?;

    let mut stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    let mut output = Vec::new();
    let read_result = tokio::time::timeout(
        tokio::time::Duration::from_secs(120),
        stdout.read_to_end(&mut output),
    )
    .await;

    match read_result {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            let _ = child.kill().await;
            return Err(format!("Failed to read agent output: {e}"));
        }
        Err(_) => {
            let _ = child.kill().await;
            return Err("Market analysis timed out".to_string());
        }
    }

    let _ = tokio::time::timeout(tokio::time::Duration::from_secs(5), child.wait()).await;

    let output_str = String::from_utf8_lossy(&output);

    let analysis: crate::gsd::startup::MarketOpportunity = serde_json::from_str(&output_str)
        .map_err(|e| format!("Failed to parse market analysis: {e}\nOutput: {output_str}"))?;

    log::info!("[MarketAnalysis] Analysis complete");
    Ok(analysis)
}

/// Validate technical feasibility of an idea
pub async fn validate_idea_feasibility(
    idea: crate::gsd::startup::GeneratedIdea,
    project_type: ProjectType,
) -> Result<crate::gsd::startup::IdeaFeasibility, String> {
    use crate::agents::providers::get_provider;
    use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
    use crate::templates::builtin::get_builtin_template;
    use std::process::Stdio;
    use tera::{Context, Tera};
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    let template_content = get_builtin_template("feasibility_analysis")
        .ok_or("Feasibility analysis template not found")?;

    let mut tera_context = Context::new();

    let idea_json =
        serde_json::to_value(&idea).map_err(|e| format!("Failed to serialize idea: {e}"))?;
    tera_context.insert("idea", &idea_json);

    let project_type_str = serde_json::to_string(&project_type)
        .unwrap_or_default()
        .replace('"', "");
    tera_context.insert("project_type", &project_type_str);

    let rendered_prompt = Tera::one_off(template_content, &tera_context, false)
        .map_err(|e| format!("Failed to render template: {e}"))?;

    let agent: AgentType = "claude"
        .parse()
        .map_err(|e| format!("Invalid agent type: {e}"))?;
    let provider = get_provider(&agent);
    if !provider.is_available() {
        return Err("Claude agent not available for feasibility analysis".to_string());
    }

    log::info!("[FeasibilityAnalysis] Running {agent:?} for feasibility analysis");

    let spawn_config = AgentSpawnConfig {
        agent_type: agent.clone(),
        task_id: format!("feasibility-{}", uuid::Uuid::new_v4()),
        worktree_path: ".".to_string(),
        branch: "main".to_string(),
        max_iterations: 0,
        prompt: Some(rendered_prompt),
        model: None,
        spawn_mode: AgentSpawnMode::Piped,
        plugin_config: None,
        env_vars: None,
        disable_tools: true,
    };

    let std_cmd = provider
        .build_command(&spawn_config)
        .map_err(|e| format!("Failed to build command: {e}"))?;

    let mut child = Command::from(std_cmd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn agent: {e}"))?;

    let mut stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    let mut output = Vec::new();
    let read_result = tokio::time::timeout(
        tokio::time::Duration::from_secs(120),
        stdout.read_to_end(&mut output),
    )
    .await;

    match read_result {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            let _ = child.kill().await;
            return Err(format!("Failed to read agent output: {e}"));
        }
        Err(_) => {
            let _ = child.kill().await;
            return Err("Feasibility analysis timed out".to_string());
        }
    }

    let _ = tokio::time::timeout(tokio::time::Duration::from_secs(5), child.wait()).await;

    let output_str = String::from_utf8_lossy(&output);

    let analysis: crate::gsd::startup::IdeaFeasibility = serde_json::from_str(&output_str)
        .map_err(|e| format!("Failed to parse feasibility analysis: {e}\nOutput: {output_str}"))?;

    log::info!(
        "[FeasibilityAnalysis] Analysis complete: score {}",
        analysis.feasibility_score
    );
    Ok(analysis)
}

/// Explore idea space from interests
pub async fn explore_idea_space(
    domain: String,
    interests: Vec<String>,
    count: u8,
) -> Result<Vec<crate::gsd::startup::ValidatedIdea>, String> {
    use crate::agents::providers::get_provider;
    use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
    use crate::gsd::startup::ValidatedIdea;
    use crate::templates::builtin::get_builtin_template;
    use std::process::Stdio;
    use tera::{Context, Tera};
    use tokio::io::AsyncReadExt;
    use tokio::process::Command;

    let template_content =
        get_builtin_template("brainstorm_ideas").ok_or("Brainstorm ideas template not found")?;

    let mut tera_context = Context::new();
    tera_context.insert("interests", &interests);
    tera_context.insert("domain", &domain);
    tera_context.insert("count", &count);

    let rendered_prompt = Tera::one_off(template_content, &tera_context, false)
        .map_err(|e| format!("Failed to render template: {e}"))?;

    let agent: AgentType = "claude"
        .parse()
        .map_err(|e| format!("Invalid agent type: {e}"))?;
    let provider = get_provider(&agent);
    if !provider.is_available() {
        return Err("Claude agent not available for idea exploration".to_string());
    }

    log::info!("[ExploreSpace] Running {agent:?} to explore idea space");

    let spawn_config = AgentSpawnConfig {
        agent_type: agent.clone(),
        task_id: format!("explore-space-{}", uuid::Uuid::new_v4()),
        worktree_path: ".".to_string(),
        branch: "main".to_string(),
        max_iterations: 0,
        prompt: Some(rendered_prompt),
        model: None,
        spawn_mode: AgentSpawnMode::Piped,
        plugin_config: None,
        env_vars: None,
        disable_tools: true,
    };

    let std_cmd = provider
        .build_command(&spawn_config)
        .map_err(|e| format!("Failed to build command: {e}"))?;

    let mut child = Command::from(std_cmd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn agent: {e}"))?;

    let mut stdout = child.stdout.take().ok_or("Failed to capture stdout")?;

    let mut output = Vec::new();
    let read_result = tokio::time::timeout(
        tokio::time::Duration::from_secs(120),
        stdout.read_to_end(&mut output),
    )
    .await;

    match read_result {
        Ok(Ok(_)) => {}
        Ok(Err(e)) => {
            let _ = child.kill().await;
            return Err(format!("Failed to read agent output: {e}"));
        }
        Err(_) => {
            let _ = child.kill().await;
            return Err("Idea exploration timed out".to_string());
        }
    }

    let _ = tokio::time::timeout(tokio::time::Duration::from_secs(5), child.wait()).await;

    let output_str = String::from_utf8_lossy(&output);

    let base_ideas: Vec<crate::gsd::startup::GeneratedIdea> = serde_json::from_str(&output_str)
        .map_err(|e| format!("Failed to parse ideas: {e}\nOutput: {output_str}"))?;

    let validated_ideas: Vec<crate::gsd::startup::ValidatedIdea> = base_ideas
        .into_iter()
        .map(|base| ValidatedIdea {
            base,
            feasibility: None,
            market: None,
            user_score: None,
            interest_match_score: None,
        })
        .collect();

    log::info!("[ExploreSpace] Generated {} ideas", validated_ideas.len());
    Ok(validated_ideas)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_content_from_stream() {
        let raw = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"[{\"title\":\"Test\"}]"}]}}
{"type":"result","subtype":"success","result":"[{\"title\":\"Test\"}]"}"#;

        // Should prefer the "result" message
        let content = extract_content_from_stream(raw).unwrap();
        assert_eq!(content, "[{\"title\":\"Test\"}]");
    }

    #[test]
    fn test_extract_content_from_stream_fallback() {
        let raw = r#"{"type":"assistant","message":{"content":[{"type":"text","text":"[{\"title\":\"Fallback\"}]"}]}}"#;

        // Should fallback to assistant message
        let content = extract_content_from_stream(raw).unwrap();
        assert_eq!(content, "[{\"title\":\"Fallback\"}]");
    }

    #[test]
    fn test_extract_content_from_raw_text() {
        let raw = r#"[{"title":"Raw"}]"#;

        // Should handle raw text
        let content = extract_content_from_stream(raw).unwrap();
        assert_eq!(content, r#"[{"title":"Raw"}]"#);
    }

    #[test]
    fn test_parse_requirement_item_with_empty_object() {
        let empty = serde_json::json!({});
        let result = parse_requirement_item(&empty, 0);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("missing 'title'"));
        assert!(err.contains("no fields"));
    }

    #[test]
    fn test_parse_requirement_item_missing_title_but_has_other_fields() {
        let partial = serde_json::json!({
            "description": "Some description",
            "category": "core"
        });
        let result = parse_requirement_item(&partial, 0);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("missing 'title'"));
        assert!(err.contains("description"));
        assert!(err.contains("category"));
    }

    #[test]
    fn test_parse_requirement_item_with_valid_data() {
        let valid = serde_json::json!({
            "title": "Test Requirement",
            "category": "core",
            "description": "Test description",
            "acceptanceCriteria": ["criterion 1"],
            "suggestedScope": "v1"
        });
        let result = parse_requirement_item(&valid, 0);
        assert!(result.is_ok());
        let req = result.unwrap();
        assert_eq!(req.title, "Test Requirement");
        assert_eq!(req.id, "GEN-01");
    }

    #[test]
    fn test_parse_generated_requirements_partial_success() {
        let mixed = serde_json::to_string(&vec![
            serde_json::json!({"title": "Valid", "category": "core", "description": "A"}),
            serde_json::json!({}), // Invalid
            serde_json::json!({"title": "Also Valid", "category": "ui", "description": "B"}),
        ])
        .unwrap();

        let result = parse_generated_requirements(&mixed);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().len(), 2); // Should skip the middle one
    }

    #[test]
    fn test_parse_generated_requirements_all_invalid() {
        let all_invalid =
            serde_json::to_string(&vec![serde_json::json!({}), serde_json::json!({})]).unwrap();

        let result = parse_generated_requirements(&all_invalid);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("All 2 requirement(s) failed"));
        // Should include both errors
        assert!(err.contains("Requirement 0"));
        assert!(err.contains("Requirement 1"));
    }

    #[test]
    fn test_extract_json_array_from_text() {
        let text_with_markdown = r#"
Here are the requirements:

```json
[
  {"title": "Req1", "category": "core"}
]
```
"#;
        let result = extract_json_array(text_with_markdown);
        assert!(result.is_some());
    }

    #[test]
    fn test_parse_generated_requirements_detects_tool_names() {
        // Simulate AI returning tool names instead of requirement objects
        let tool_names = serde_json::to_string(&vec![
            "Task",
            "TaskOutput",
            "Bash",
            "Glob",
            "Grep",
            "Read",
            "Edit",
            "Write",
        ])
        .unwrap();

        let result = parse_generated_requirements(&tool_names);
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(err.contains("tool names"));
        assert!(err.contains("misunderstood"));
    }
}
