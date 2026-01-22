//! GSD (Get Stuff Done) workflow commands
//!
//! Tauri commands for the GSD PRD generation workflow.

use crate::gsd::{
    config::{GsdConfig, ScopeLevel},
    conversion::{convert_to_ralph_prd, ConversionOptions, ConversionResult},
    planning_storage::{
        delete_planning_session, get_planning_dir, init_planning_session, list_planning_sessions,
        load_workflow_state, read_planning_file, save_workflow_state, write_planning_file,
        PlanningFile, PlanningSessionInfo,
    },
    requirements::{Requirement, RequirementsDoc, ScopeSelection},
    research::{run_research_agents, synthesize_research, ResearchResult, ResearchSynthesis},
    roadmap::{derive_roadmap, RoadmapDoc},
    state::{GsdPhase, GsdWorkflowState, QuestioningContext, ResearchStatus},
    verification::{verify_plans, VerificationResult},
};
use serde::{Deserialize, Serialize};
use std::path::Path;

/// Request to start a GSD session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartGsdSessionRequest {
    pub project_path: String,
    pub chat_session_id: String,
}

/// Start a new GSD workflow session
#[tauri::command]
pub async fn start_gsd_session(
    project_path: String,
    chat_session_id: String,
) -> Result<GsdWorkflowState, String> {
    let path = Path::new(&project_path);

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
#[tauri::command]
pub async fn get_gsd_state(
    project_path: String,
    session_id: String,
) -> Result<Option<GsdWorkflowState>, String> {
    let path = Path::new(&project_path);

    match load_workflow_state(path, &session_id) {
        Ok(state) => Ok(Some(state)),
        Err(_) => Ok(None),
    }
}

/// Update the GSD workflow phase
#[tauri::command]
pub async fn update_gsd_phase(
    project_path: String,
    session_id: String,
    phase: GsdPhase,
) -> Result<GsdWorkflowState, String> {
    let path = Path::new(&project_path);

    let mut state = load_workflow_state(path, &session_id)?;
    state.current_phase = phase;
    state.updated_at = chrono::Utc::now();

    save_workflow_state(path, &session_id, &state)?;

    Ok(state)
}

/// Update questioning context
#[tauri::command]
pub async fn update_questioning_context(
    project_path: String,
    session_id: String,
    context: QuestioningContext,
) -> Result<GsdWorkflowState, String> {
    let path = Path::new(&project_path);

    let mut state = load_workflow_state(path, &session_id)?;
    state.questioning_context = context;
    state.updated_at = chrono::Utc::now();

    save_workflow_state(path, &session_id, &state)?;

    Ok(state)
}

/// Generate PROJECT.md from questioning context
#[tauri::command]
pub async fn generate_project_document(
    project_path: String,
    session_id: String,
) -> Result<String, String> {
    let path = Path::new(&project_path);

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

/// Request to start research
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartResearchRequest {
    pub project_path: String,
    pub session_id: String,
    pub context: String,
}

/// Start parallel research agents
#[tauri::command]
pub async fn start_research(
    project_path: String,
    session_id: String,
    context: String,
) -> Result<ResearchStatus, String> {
    let path = Path::new(&project_path);

    // Load config (use defaults for now)
    let config = GsdConfig::default();

    // Run research agents in parallel
    let (status, results) = run_research_agents(&config, &project_path, &session_id, &context).await;

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
#[tauri::command]
pub async fn get_research_results(
    project_path: String,
    session_id: String,
) -> Result<Vec<ResearchResult>, String> {
    let path = Path::new(&project_path);

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
                    });
                }
            }
        }
    }

    Ok(results)
}

/// Synthesize research into SUMMARY.md
#[tauri::command]
pub async fn synthesize_research_cmd(
    project_path: String,
    session_id: String,
) -> Result<ResearchSynthesis, String> {
    let path = Path::new(&project_path);
    synthesize_research(path, &session_id)
}

/// Request to scope requirements
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeRequirementsRequest {
    pub project_path: String,
    pub session_id: String,
    pub selections: ScopeSelection,
}

/// Apply scope selections to requirements
#[tauri::command]
pub async fn scope_requirements(
    project_path: String,
    session_id: String,
    selections: ScopeSelection,
) -> Result<RequirementsDoc, String> {
    let path = Path::new(&project_path);

    // Load existing requirements
    let req_content = read_planning_file(path, &session_id, PlanningFile::Requirements)?;
    let mut doc: RequirementsDoc = serde_json::from_str(&req_content)
        .map_err(|e| format!("Failed to parse requirements: {}", e))?;

    // Apply selections
    selections.apply(&mut doc);

    // Save updated requirements
    let updated_content = serde_json::to_string_pretty(&doc)
        .map_err(|e| format!("Failed to serialize requirements: {}", e))?;
    write_planning_file(path, &session_id, PlanningFile::Requirements, &updated_content)?;

    // Also save a scoped markdown version
    let scoped_md = doc.to_markdown();
    write_planning_file(path, &session_id, PlanningFile::Scoped, &scoped_md)?;

    Ok(doc)
}

/// Save requirements document
#[tauri::command]
pub async fn save_requirements(
    project_path: String,
    session_id: String,
    requirements: RequirementsDoc,
) -> Result<(), String> {
    let path = Path::new(&project_path);

    let content = serde_json::to_string_pretty(&requirements)
        .map_err(|e| format!("Failed to serialize requirements: {}", e))?;
    write_planning_file(path, &session_id, PlanningFile::Requirements, &content)?;

    // Also save markdown version
    let md = requirements.to_markdown();
    write_planning_file(path, &session_id, PlanningFile::Requirements, &md)?;

    Ok(())
}

/// Load requirements document
#[tauri::command]
pub async fn load_requirements(
    project_path: String,
    session_id: String,
) -> Result<Option<RequirementsDoc>, String> {
    let path = Path::new(&project_path);

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
#[tauri::command]
pub async fn create_roadmap(
    project_path: String,
    session_id: String,
) -> Result<RoadmapDoc, String> {
    let path = Path::new(&project_path);

    // Load requirements
    let req_content = read_planning_file(path, &session_id, PlanningFile::Requirements)?;
    let requirements: RequirementsDoc = serde_json::from_str(&req_content)
        .map_err(|e| format!("Failed to parse requirements: {}", e))?;

    // Derive roadmap
    let roadmap = derive_roadmap(&requirements);

    // Save roadmap
    let roadmap_json = serde_json::to_string_pretty(&roadmap)
        .map_err(|e| format!("Failed to serialize roadmap: {}", e))?;
    write_planning_file(path, &session_id, PlanningFile::Roadmap, &roadmap_json)?;

    // Also save markdown version
    let roadmap_md = roadmap.to_markdown();
    write_planning_file(path, &session_id, PlanningFile::Roadmap, &roadmap_md)?;

    Ok(roadmap)
}

/// Load roadmap document
#[tauri::command]
pub async fn load_roadmap(
    project_path: String,
    session_id: String,
) -> Result<Option<RoadmapDoc>, String> {
    let path = Path::new(&project_path);

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

/// Verify plans for completeness
#[tauri::command]
pub async fn verify_gsd_plans(
    project_path: String,
    session_id: String,
) -> Result<VerificationResult, String> {
    let path = Path::new(&project_path);

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

    // Save verification result
    let verification_md = crate::gsd::verification::verification_to_markdown(&result);
    write_planning_file(path, &session_id, PlanningFile::Verification, &verification_md)?;

    Ok(result)
}

/// Request to export to Ralph PRD
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportToRalphRequest {
    pub project_path: String,
    pub session_id: String,
    pub prd_name: String,
    pub branch: String,
    pub include_v2: Option<bool>,
}

/// Export GSD plans to Ralph PRD format
#[tauri::command]
pub async fn export_gsd_to_ralph(
    project_path: String,
    session_id: String,
    prd_name: String,
    branch: String,
    include_v2: Option<bool>,
) -> Result<ConversionResult, String> {
    let path = Path::new(&project_path);

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

    // Create conversion options
    let options = ConversionOptions {
        branch,
        include_v2: include_v2.unwrap_or(false),
        source_chat_id: Some(session_id.clone()),
        custom_title: Some(prd_name.clone()),
        custom_description: description,
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
    let prd_json = serde_json::to_string_pretty(&result.prd)
        .map_err(|e| format!("Failed to serialize PRD: {}", e))?;

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
        "Exported GSD session {} to Ralph PRD: {}",
        session_id,
        prd_name
    );

    Ok(result)
}

/// Save a planning file (generic)
#[tauri::command]
pub async fn save_planning_file(
    project_path: String,
    session_id: String,
    file_type: String,
    content: String,
) -> Result<String, String> {
    let path = Path::new(&project_path);

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
#[tauri::command]
pub async fn read_gsd_planning_file(
    project_path: String,
    session_id: String,
    file_type: String,
) -> Result<Option<String>, String> {
    let path = Path::new(&project_path);

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
#[tauri::command]
pub async fn list_gsd_sessions(project_path: String) -> Result<Vec<PlanningSessionInfo>, String> {
    let path = Path::new(&project_path);
    list_planning_sessions(path)
}

/// Delete a planning session
#[tauri::command]
pub async fn delete_gsd_session(project_path: String, session_id: String) -> Result<(), String> {
    let path = Path::new(&project_path);
    delete_planning_session(path, &session_id)
}
