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
    research::{
        get_available_agents, synthesize_research, ResearchResult,
        ResearchSynthesis,
    },
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
) -> Result<ResearchStatus, String> {
    let path = as_path(&project_path);

    // Build config with optional overrides
    let config = GsdConfig {
        research_agent_type: agent_type.unwrap_or_else(|| GsdConfig::default().research_agent_type),
        research_model: model,
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
        .or_else(|_| read_planning_file(path, &session_id, PlanningFile::Research("features.md".to_string())))
        .unwrap_or_default();

    // Load project context
    let project_content = read_planning_file(path, &session_id, PlanningFile::Project)
        .unwrap_or_default();

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
    write_planning_file(path, &session_id, PlanningFile::Requirements, &updated_content)?;

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
    write_planning_file(path, &session_id, PlanningFile::Verification, &verification_md)?;

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
            (title, if description.is_empty() { None } else { Some(description) })
        }
        Err(_) => (None, None),
    };

    // Validate and log execution config if provided
    let validated_config = if let Some(ref config) = execution_config {
        // Validate config
        config.validate().map_err(|e| format!("Invalid execution config: {}", e))?;

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
    std::fs::write(&prd_path, prd_json)
        .map_err(|e| format!("Failed to write PRD file: {}", e))?;

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
        "other" | _ => RequirementCategory::Other,
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
