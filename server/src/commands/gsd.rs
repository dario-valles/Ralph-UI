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
    write_planning_file(path, &session_id, PlanningFile::Roadmap, &roadmap_json)?;

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
    match read_planning_file(path, &session_id, PlanningFile::Roadmap) {
        Ok(content) => {
            if let Ok(doc) = serde_json::from_str::<RoadmapDoc>(&content) {
                return Ok(Some(doc));
            }
            // If it's not JSON, it might be markdown only - return None
            Ok(None)
        }
        Err(_) => Ok(None),
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
    let roadmap = match read_planning_file(path, &session_id, PlanningFile::Roadmap) {
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

    // Load roadmap
    let roadmap_content = read_planning_file(path, &session_id, PlanningFile::Roadmap)?;
    let roadmap: RoadmapDoc = serde_json::from_str(&roadmap_content)
        .map_err(|e| format!("Failed to parse roadmap: {}", e))?;

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
    let prd_path = prds_dir.join(format!("{}.json", prd_name));
    std::fs::write(&prd_path, prd_json).map_err(|e| format!("Failed to write PRD file: {}", e))?;

    // Mark workflow as complete
    if let Ok(mut state) = load_workflow_state(path, &session_id) {
        state.is_complete = true;
        state.record_decision(crate::gsd::state::GsdDecision::Exported {
            prd_name: prd_name.clone(),
        });
        let _ = save_workflow_state(path, &session_id, &state);
    }

    log::info!(
        "Exported GSD session {} to Ralph PRD: {} (with execution config: {})",
        session_id,
        prd_name,
        execution_config.is_some()
    );

    Ok(result)
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

/// Maximum output size from agent (1MB)
const MAX_OUTPUT_SIZE: usize = 1024 * 1024;

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

    // Spawn the agent
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
    let mut output = vec![0u8; MAX_OUTPUT_SIZE];
    let read_result = tokio::time::timeout(
        tokio::time::Duration::from_secs(AGENT_TIMEOUT_SECS),
        stdout.read(&mut output),
    )
    .await;

    let bytes_read = match read_result {
        Ok(Ok(n)) => n,
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

    output.truncate(bytes_read);
    let output_str = String::from_utf8_lossy(&output);

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
    let title = item
        .get("title")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("Requirement {idx} missing title"))?
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

/// Parse generated requirements from AI agent output
fn parse_generated_requirements(output: &str) -> Result<Vec<GeneratedRequirement>, String> {
    let json_str = extract_json_array(output).ok_or("Could not find JSON array in agent output")?;

    let parsed: Vec<serde_json::Value> =
        serde_json::from_str(&json_str).map_err(|e| format!("Failed to parse JSON: {e}"))?;

    let requirements: Result<Vec<_>, _> = parsed
        .iter()
        .enumerate()
        .map(|(idx, item)| parse_requirement_item(item, idx))
        .collect();

    let requirements = requirements?;

    if requirements.is_empty() {
        return Err("No valid requirements found in output".to_string());
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
    match scope.to_lowercase().as_str() {
        "v1" => ScopeLevel::V1,
        "v2" => ScopeLevel::V2,
        "out_of_scope" => ScopeLevel::OutOfScope,
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
            req.scope = parse_scope(&gen_req.suggested_scope);
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
