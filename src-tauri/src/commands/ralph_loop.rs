//! Tauri commands for Ralph Wiggum Loop orchestration
//!
//! These commands control the external Ralph loop that spawns fresh agent instances.

use crate::commands::ConfigState;
use crate::database::Database;
use crate::models::AgentType;
use crate::ralph_loop::{
    ConfigManager, ErrorStrategy, ExecutionSnapshot, FallbackChainConfig, PrdExecutor, PrdStatus,
    ProgressSummary, ProgressTracker, PromptBuilder, RalphConfig, RalphLoopConfig,
    RalphLoopMetrics, RalphLoopOrchestrator, RalphLoopState as RalphLoopExecutionState, RalphPrd,
    RalphStory, RetryConfig, SnapshotStore,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::State;

/// State for managing active Ralph loop executions (Tauri managed state)
pub struct RalphLoopManagerState {
    /// Active executions by execution ID
    /// Uses tokio::sync::Mutex for async-friendly locking during run()
    executions: Mutex<HashMap<String, Arc<tokio::sync::Mutex<RalphLoopOrchestrator>>>>,
    /// Execution snapshots that can be read without locking the orchestrator
    /// Uses Arc so it can be shared with the orchestrator for direct updates
    snapshots: SnapshotStore,
}

impl RalphLoopManagerState {
    pub fn new() -> Self {
        Self {
            executions: Mutex::new(HashMap::new()),
            snapshots: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Get a clone of the snapshots Arc for sharing with the orchestrator
    pub fn snapshots_arc(&self) -> SnapshotStore {
        self.snapshots.clone()
    }

    /// Get a snapshot for an execution
    pub fn get_snapshot(&self, execution_id: &str) -> Option<ExecutionSnapshot> {
        let snapshots = match self.snapshots.lock() {
            Ok(guard) => guard,
            Err(poisoned) => {
                log::warn!("Snapshots mutex was poisoned, recovering");
                poisoned.into_inner()
            }
        };
        snapshots.get(execution_id).cloned()
    }
}

impl Default for RalphLoopManagerState {
    fn default() -> Self {
        Self::new()
    }
}

/// Request to start a Ralph loop execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartRalphLoopRequest {
    /// Path to the project directory
    pub project_path: String,
    /// Agent type to use (claude, opencode, cursor, codex)
    pub agent_type: String,
    /// Model to use (e.g., "claude-sonnet-4-5")
    pub model: Option<String>,
    /// Maximum iterations (default: 50)
    pub max_iterations: Option<u32>,
    /// Whether to run tests (default: true)
    pub run_tests: Option<bool>,
    /// Whether to run lint (default: true)
    pub run_lint: Option<bool>,
    /// Branch to work on (default: current branch)
    pub branch: Option<String>,
    /// Custom completion promise
    pub completion_promise: Option<String>,
    /// Maximum cost limit in dollars
    pub max_cost: Option<f64>,
    /// Whether to use a worktree for isolation (default: true)
    pub use_worktree: Option<bool>,
    /// Agent timeout in seconds (default: 1800 = 30 minutes, 0 = no timeout)
    pub agent_timeout_secs: Option<u64>,
    /// PRD name (required) - e.g., "my-feature-a1b2c3d4"
    ///
    /// PRD files are stored at `.ralph-ui/prds/{prd_name}.json`
    pub prd_name: String,
    /// Template name to use for prompt generation (US-014)
    pub template_name: Option<String>,
}

/// Response from starting a Ralph loop
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct StartRalphLoopResponse {
    /// Unique execution ID
    pub execution_id: String,
    /// Initial state
    pub state: RalphLoopExecutionState,
}

/// Request to initialize a Ralph PRD
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitRalphPrdRequest {
    /// Project path
    pub project_path: String,
    /// PRD title
    pub title: String,
    /// PRD description
    pub description: Option<String>,
    /// Branch name
    pub branch: String,
    /// Stories to add
    pub stories: Vec<RalphStoryInput>,
}

/// Input for creating a Ralph story
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphStoryInput {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub acceptance: String,
    pub priority: Option<u32>,
    pub dependencies: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub effort: Option<String>,
}

/// Request to convert a database PRD to Ralph format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertPrdToRalphRequest {
    /// Database PRD ID
    pub prd_id: String,
    /// PRD name for file storage (e.g., "my-feature-a1b2c3d4")
    pub prd_name: String,
    /// Branch name to use
    pub branch: String,
    /// Agent type to use (claude, opencode, cursor, codex)
    pub agent_type: Option<String>,
    /// Model to use (e.g., "claude-sonnet-4-5")
    pub model: Option<String>,
    /// Maximum iterations (default: 50)
    pub max_iterations: Option<u32>,
    /// Maximum cost limit in dollars
    pub max_cost: Option<f64>,
    /// Whether to run tests (default: true)
    pub run_tests: Option<bool>,
    /// Whether to run lint (default: true)
    pub run_lint: Option<bool>,
    /// Whether to use a worktree for isolation
    pub use_worktree: Option<bool>,
}

/// Request to convert a file-based PRD to Ralph format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertPrdFileToRalphRequest {
    /// Project path
    pub project_path: String,
    /// PRD filename (without extension, e.g., "new-feature-prd-abc123")
    pub prd_name: String,
    /// Branch name to use
    pub branch: String,
    /// Agent type to use (claude, opencode, cursor, codex)
    pub agent_type: Option<String>,
    /// Model to use (e.g., "claude-sonnet-4-5")
    pub model: Option<String>,
    /// Maximum iterations (default: 50)
    pub max_iterations: Option<u32>,
    /// Maximum cost limit in dollars
    pub max_cost: Option<f64>,
    /// Whether to run tests (default: true)
    pub run_tests: Option<bool>,
    /// Whether to run lint (default: true)
    pub run_lint: Option<bool>,
    /// Whether to use a worktree for isolation
    pub use_worktree: Option<bool>,
    /// Template name to use for prompt generation (US-014)
    pub template_name: Option<String>,
}

/// Initialize a Ralph PRD at .ralph-ui/prds/{prd_name}.json
#[tauri::command]
pub fn init_ralph_prd(request: InitRalphPrdRequest, prd_name: String) -> Result<RalphPrd, String> {
    let project_path = PathBuf::from(&request.project_path);
    let executor = PrdExecutor::new(&project_path, &prd_name);

    let mut prd = RalphPrd::new(&request.title, &request.branch);
    prd.description = request.description;

    for (index, story_input) in request.stories.iter().enumerate() {
        let mut story = RalphStory::new(&story_input.id, &story_input.title, &story_input.acceptance);
        story.description = story_input.description.clone();
        story.priority = story_input.priority.unwrap_or(index as u32);
        story.dependencies = story_input.dependencies.clone().unwrap_or_default();
        story.tags = story_input.tags.clone().unwrap_or_default();
        story.effort = story_input.effort.clone();
        prd.add_story(story);
    }

    executor.write_prd(&prd)?;

    // Also initialize progress.txt
    let tracker = ProgressTracker::new(&project_path, &prd_name);
    tracker.initialize()?;

    // Generate prompt.md
    let prompt_builder = PromptBuilder::new(&project_path, &prd_name);
    let config = RalphLoopConfig {
        project_path: project_path.clone(),
        prd_name: prd_name.clone(),
        run_tests: true,
        run_lint: true,
        ..Default::default()
    };
    prompt_builder.generate_prompt(&config)?;

    Ok(prd)
}

/// Read the Ralph PRD from .ralph-ui/prds/{prd_name}.json
/// 
/// This command checks both the main project and any existing worktrees,
/// returning the PRD from whichever has newer data. This ensures correct
/// data is shown after app restart even if a worktree execution is ongoing.
#[tauri::command]
pub fn get_ralph_prd(project_path: String, prd_name: String) -> Result<RalphPrd, String> {
    let project_path_buf = PathBuf::from(&project_path);
    
    // Try to read from main project first
    let main_executor = PrdExecutor::new(&project_path_buf, &prd_name);
    let main_prd_path = project_path_buf.join(".ralph-ui").join("prds").join(format!("{}.json", prd_name));
    let main_modified = main_prd_path.metadata()
        .ok()
        .and_then(|m| m.modified().ok());
    
    // Check if there's a worktree with newer PRD data
    let worktrees_dir = project_path_buf.join(".worktrees");
    let mut best_prd: Option<RalphPrd> = None;
    let mut best_modified = main_modified;
    
    if worktrees_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&worktrees_dir) {
            for entry in entries.flatten() {
                let worktree_path = entry.path();
                if worktree_path.is_dir() {
                    // Check if this worktree has the same PRD
                    let worktree_prd_path = worktree_path
                        .join(".ralph-ui")
                        .join("prds")
                        .join(format!("{}.json", prd_name));
                    
                    if worktree_prd_path.exists() {
                        if let Ok(metadata) = worktree_prd_path.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                // Check if this is newer than what we have
                                let is_newer = match best_modified {
                                    Some(best) => modified > best,
                                    None => true,
                                };
                                
                                if is_newer {
                                    // Try to read the PRD from worktree
                                    let worktree_executor = PrdExecutor::new(&worktree_path, &prd_name);
                                    if let Ok(prd) = worktree_executor.read_prd() {
                                        log::debug!(
                                            "[get_ralph_prd] Found newer PRD in worktree {:?}",
                                            worktree_path
                                        );
                                        best_prd = Some(prd);
                                        best_modified = Some(modified);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Use the best PRD we found (worktree if newer, otherwise main)
    match best_prd {
        Some(prd) => Ok(prd),
        None => main_executor.read_prd(),
    }
}

/// Get the status of the Ralph PRD
/// 
/// This command checks both the main project and any existing worktrees,
/// returning status from whichever has newer data. This ensures correct
/// status is shown after app restart even if a worktree execution is ongoing.
#[tauri::command]
pub fn get_ralph_prd_status(project_path: String, prd_name: String) -> Result<PrdStatus, String> {
    let project_path_buf = PathBuf::from(&project_path);
    
    // Try to read from main project first
    let main_executor = PrdExecutor::new(&project_path_buf, &prd_name);
    let main_prd_path = project_path_buf.join(".ralph-ui").join("prds").join(format!("{}.json", prd_name));
    let main_modified = main_prd_path.metadata()
        .ok()
        .and_then(|m| m.modified().ok());
    
    // Check if there's a worktree with newer PRD data
    let worktrees_dir = project_path_buf.join(".worktrees");
    let mut best_prd: Option<RalphPrd> = None;
    let mut best_modified = main_modified;
    
    if worktrees_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&worktrees_dir) {
            for entry in entries.flatten() {
                let worktree_path = entry.path();
                if worktree_path.is_dir() {
                    // Check if this worktree has the same PRD
                    let worktree_prd_path = worktree_path
                        .join(".ralph-ui")
                        .join("prds")
                        .join(format!("{}.json", prd_name));
                    
                    if worktree_prd_path.exists() {
                        if let Ok(metadata) = worktree_prd_path.metadata() {
                            if let Ok(modified) = metadata.modified() {
                                // Check if this is newer than what we have
                                let is_newer = match best_modified {
                                    Some(best) => modified > best,
                                    None => true,
                                };
                                
                                if is_newer {
                                    // Try to read the PRD from worktree
                                    let worktree_executor = PrdExecutor::new(&worktree_path, &prd_name);
                                    if let Ok(prd) = worktree_executor.read_prd() {
                                        log::debug!(
                                            "[get_ralph_prd_status] Found newer PRD in worktree {:?}",
                                            worktree_path
                                        );
                                        best_prd = Some(prd);
                                        best_modified = Some(modified);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Use the best PRD we found (worktree if newer, otherwise main)
    let prd = match best_prd {
        Some(prd) => prd,
        None => main_executor.read_prd()?,
    };
    
    Ok(main_executor.get_status(&prd))
}

/// Mark a story as passing in the PRD
#[tauri::command]
pub fn mark_ralph_story_passing(project_path: String, prd_name: String, story_id: String) -> Result<bool, String> {
    let executor = PrdExecutor::new(&PathBuf::from(&project_path), &prd_name);
    executor.mark_story_passing(&story_id)
}

/// Mark a story as failing in the PRD
#[tauri::command]
pub fn mark_ralph_story_failing(project_path: String, prd_name: String, story_id: String) -> Result<bool, String> {
    let executor = PrdExecutor::new(&PathBuf::from(&project_path), &prd_name);
    executor.mark_story_failing(&story_id)
}

/// Add a story to the PRD
#[tauri::command]
pub fn add_ralph_story(project_path: String, prd_name: String, story: RalphStoryInput) -> Result<(), String> {
    let executor = PrdExecutor::new(&PathBuf::from(&project_path), &prd_name);

    let mut ralph_story = RalphStory::new(&story.id, &story.title, &story.acceptance);
    ralph_story.description = story.description;
    ralph_story.priority = story.priority.unwrap_or(100);
    ralph_story.dependencies = story.dependencies.unwrap_or_default();
    ralph_story.tags = story.tags.unwrap_or_default();
    ralph_story.effort = story.effort;

    executor.add_story(ralph_story)
}

/// Remove a story from the PRD
#[tauri::command]
pub fn remove_ralph_story(project_path: String, prd_name: String, story_id: String) -> Result<bool, String> {
    let executor = PrdExecutor::new(&PathBuf::from(&project_path), &prd_name);
    executor.remove_story(&story_id)
}

/// Get progress.txt content
#[tauri::command]
pub fn get_ralph_progress(project_path: String, prd_name: String) -> Result<String, String> {
    let tracker = ProgressTracker::new(&PathBuf::from(&project_path), &prd_name);
    tracker.read_raw()
}

/// Get progress summary
#[tauri::command]
pub fn get_ralph_progress_summary(project_path: String, prd_name: String) -> Result<ProgressSummary, String> {
    let tracker = ProgressTracker::new(&PathBuf::from(&project_path), &prd_name);
    tracker.get_summary()
}

/// Add a note to progress.txt
#[tauri::command]
pub fn add_ralph_progress_note(project_path: String, prd_name: String, iteration: u32, note: String) -> Result<(), String> {
    let tracker = ProgressTracker::new(&PathBuf::from(&project_path), &prd_name);
    tracker.add_note(iteration, &note)
}

/// Clear progress.txt and reinitialize
#[tauri::command]
pub fn clear_ralph_progress(project_path: String, prd_name: String) -> Result<(), String> {
    let tracker = ProgressTracker::new(&PathBuf::from(&project_path), &prd_name);
    tracker.clear()
}

/// Get the prompt.md content
#[tauri::command]
pub fn get_ralph_prompt(project_path: String, prd_name: String) -> Result<String, String> {
    let builder = PromptBuilder::new(&PathBuf::from(&project_path), &prd_name);
    builder.read_prompt()
}

/// Update the prompt.md content
#[tauri::command]
pub fn set_ralph_prompt(project_path: String, prd_name: String, content: String) -> Result<(), String> {
    let builder = PromptBuilder::new(&PathBuf::from(&project_path), &prd_name);
    builder.write_prompt(&content)
}

/// Heartbeat interval in seconds (30 seconds)
const HEARTBEAT_INTERVAL_SECS: u64 = 30;

/// Start a Ralph loop execution
#[tauri::command]
pub async fn start_ralph_loop(
    request: StartRalphLoopRequest,
    ralph_state: State<'_, RalphLoopManagerState>,
    agent_manager_state: State<'_, crate::AgentManagerState>,
    db: State<'_, Mutex<Database>>,
    config_state: State<'_, ConfigState>,
    app_handle: tauri::AppHandle,
) -> Result<String, String> {
    // Parse agent type
    let agent_type = match request.agent_type.to_lowercase().as_str() {
        "claude" => AgentType::Claude,
        "opencode" => AgentType::Opencode,
        "cursor" => AgentType::Cursor,
        "codex" => AgentType::Codex,
        _ => return Err(format!("Unknown agent type: {}", request.agent_type)),
    };

    // Get fallback config from user settings
    let user_config = config_state.get_config().ok();

    let fallback_config = user_config.as_ref().and_then(|config| {
        if config.fallback.enabled {
            // Use fallback_chain from config if available, otherwise build from legacy fallback_agent
            let fallback_chain = config.fallback.fallback_chain
                .clone()
                .map(|chain| {
                    // Convert string agent names to AgentType
                    chain.into_iter()
                        .filter_map(|s| match s.to_lowercase().as_str() {
                            "claude" => Some(AgentType::Claude),
                            "opencode" => Some(AgentType::Opencode),
                            "cursor" => Some(AgentType::Cursor),
                            "codex" => Some(AgentType::Codex),
                            _ => None,
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_else(|| {
                    // Legacy behavior: build chain from primary + fallback_agent
                    let mut chain = vec![agent_type.clone()];
                    if let Some(ref fallback_str) = config.fallback.fallback_agent {
                        let fallback_agent = match fallback_str.to_lowercase().as_str() {
                            "claude" => Some(AgentType::Claude),
                            "opencode" => Some(AgentType::Opencode),
                            "cursor" => Some(AgentType::Cursor),
                            "codex" => Some(AgentType::Codex),
                            _ => None,
                        };
                        if let Some(agent) = fallback_agent {
                            if agent != agent_type {
                                chain.push(agent);
                            }
                        }
                    }
                    chain
                });

            Some(FallbackChainConfig {
                fallback_chain,
                // Use config values instead of hardcoding!
                test_primary_recovery: config.fallback.test_primary_recovery.unwrap_or(true),
                recovery_test_interval: config.fallback.recovery_test_interval.unwrap_or(5),
                base_backoff_ms: config.fallback.base_backoff_ms,
                max_backoff_ms: config.fallback.max_backoff_ms,
                enabled: true,
            })
        } else {
            None
        }
    });

    // Convert ErrorStrategyConfig from user settings to ErrorStrategy
    let error_strategy = user_config
        .and_then(|c| c.fallback.error_strategy)
        .map(|es| {
            use crate::config::ErrorStrategyConfig;
            match es {
                ErrorStrategyConfig::Retry { max_attempts, backoff_ms } => {
                    ErrorStrategy::Retry { max_attempts, backoff_ms }
                }
                ErrorStrategyConfig::Skip => ErrorStrategy::Skip,
                ErrorStrategyConfig::Abort => ErrorStrategy::Abort,
            }
        })
        .unwrap_or_default();

    let config = RalphLoopConfig {
        project_path: PathBuf::from(&request.project_path),
        agent_type: agent_type.clone(),
        model: request.model,
        max_iterations: request.max_iterations.unwrap_or(50),
        run_tests: request.run_tests.unwrap_or(true),
        run_lint: request.run_lint.unwrap_or(true),
        branch: request.branch,
        completion_promise: request.completion_promise,
        max_cost: request.max_cost,
        use_worktree: request.use_worktree.unwrap_or(true), // Use worktree for isolation by default
        retry_config: RetryConfig::default(),
        error_strategy,  // Use config value instead of hardcoded default
        fallback_config,
        agent_timeout_secs: request.agent_timeout_secs.unwrap_or(0), // No timeout by default
        prd_name: request.prd_name.clone(),
        template_name: request.template_name,
    };

    // Create orchestrator
    let mut orchestrator = RalphLoopOrchestrator::new(config.clone());
    let execution_id = orchestrator.execution_id().to_string();

    // Get shared snapshots Arc and pass to orchestrator for direct updates
    let snapshots_arc = ralph_state.snapshots_arc();
    orchestrator.set_snapshot_store(snapshots_arc.clone());

    // Initialize snapshot with idle state
    {
        let mut snapshots = snapshots_arc.lock()
            .map_err(|e| format!("Snapshot lock error: {}", e))?;
        snapshots.insert(execution_id.clone(), ExecutionSnapshot {
            state: Some(RalphLoopExecutionState::Idle),
            metrics: None,
            current_agent_id: None,
            worktree_path: None,
        });
    }

    // Read existing PRD and initialize
    let project_path = PathBuf::from(&request.project_path);
    let executor = PrdExecutor::new(&project_path, &request.prd_name);
    let mut prd = executor.read_prd()?;

    // Update metadata with current execution ID immediately so frontend can recover
    use crate::ralph_loop::PrdMetadata;
    if let Some(ref mut meta) = prd.metadata {
        meta.last_execution_id = Some(execution_id.clone());
        meta.updated_at = Some(chrono::Utc::now().to_rfc3339());
    } else {
        prd.metadata = Some(PrdMetadata {
            last_execution_id: Some(execution_id.clone()),
            created_at: Some(chrono::Utc::now().to_rfc3339()),
            updated_at: None,
            source_chat_id: None,
            total_iterations: 0,
        });
    }

    orchestrator.initialize(&prd)?;

    // Save initial execution state for crash recovery
    {
        let db_guard = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
        let initial_state = ExecutionStateSnapshot {
            execution_id: execution_id.clone(),
            state: serde_json::to_string(&RalphLoopExecutionState::Idle).unwrap_or_default(),
            last_heartbeat: chrono::Utc::now().to_rfc3339(),
        };
        ralph_iterations::save_execution_state(db_guard.get_connection(), &initial_state)
            .map_err(|e| format!("Failed to save initial execution state: {}", e))?;
    }

    // Store orchestrator in state (using tokio::sync::Mutex for async access)
    let orchestrator_arc = Arc::new(tokio::sync::Mutex::new(orchestrator));
    {
        let mut executions = ralph_state.executions.lock()
            .map_err(|e| format!("Executions lock error: {}", e))?;
        executions.insert(execution_id.clone(), orchestrator_arc.clone());
    }

    // Clone the main app's agent manager Arc for the spawned task
    // This ensures PTYs are registered in the same place the frontend queries
    let agent_manager_arc = agent_manager_state.clone_manager();

    // Get database path for spawned tasks
    // Note: We can't pass the State directly, so we get the path and create new connections
    let db_path: Option<PathBuf> = {
        let db_guard = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
        // Get the database file path from the application data directory
        // We'll use a shared connection approach via the database path
        db_guard.get_connection().path().map(PathBuf::from)
    };

    // Spawn the loop in background
    log::info!("[RalphLoop] Spawning background task for execution {}", execution_id);

    // Clone for heartbeat task
    let execution_id_for_heartbeat = execution_id.clone();
    let db_path_for_heartbeat = db_path.clone();
    let orchestrator_arc_for_heartbeat = orchestrator_arc.clone();

    // Spawn heartbeat task
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(HEARTBEAT_INTERVAL_SECS));

        loop {
            interval.tick().await;

            // Check if orchestrator is still running
            let is_running = {
                let orchestrator = orchestrator_arc_for_heartbeat.lock().await;
                matches!(
                    orchestrator.state(),
                    RalphLoopExecutionState::Running { .. } | RalphLoopExecutionState::Retrying { .. }
                )
            };

            if !is_running {
                log::info!("[Heartbeat] Execution {} no longer running, stopping heartbeat", execution_id_for_heartbeat);
                break;
            }

            // Update heartbeat in database
            if let Some(ref path) = db_path_for_heartbeat {
                match rusqlite::Connection::open(path) {
                    Ok(conn) => {
                        let heartbeat = chrono::Utc::now().to_rfc3339();
                        if let Err(e) = ralph_iterations::update_heartbeat(&conn, &execution_id_for_heartbeat, &heartbeat) {
                            log::warn!("[Heartbeat] Failed to update heartbeat for {}: {}", execution_id_for_heartbeat, e);
                        } else {
                            log::debug!("[Heartbeat] Updated heartbeat for {}", execution_id_for_heartbeat);
                        }
                    }
                    Err(e) => {
                        log::error!("[Heartbeat] Failed to open database for heartbeat update: {}", e);
                    }
                }
            }
        }
    });

    // Clone for main loop task
    let execution_id_for_loop = execution_id.clone();
    let db_path_for_loop = db_path.clone();
    let prd_name_for_loop = request.prd_name.clone();
    let app_handle_for_loop = app_handle.clone();

    tauri::async_runtime::spawn(async move {
        log::info!("[RalphLoop] Background task started for {}", execution_id_for_loop);

        // Lock orchestrator, then run with the shared agent manager
        log::debug!("[RalphLoop] Acquiring orchestrator lock...");
        let mut orchestrator = orchestrator_arc.lock().await;
        log::debug!("[RalphLoop] Locks acquired, starting run()...");

        // Use the main app's agent manager (sync mutex, but operations are quick)
        // We lock/unlock for each operation within run() rather than holding lock
        let result = orchestrator.run(agent_manager_arc).await;

        // Clean up execution state from database
        if let Some(ref path) = db_path_for_loop {
            match rusqlite::Connection::open(path) {
                Ok(conn) => {
                    if let Err(e) = ralph_iterations::delete_execution_state(&conn, &execution_id_for_loop) {
                        log::warn!("[RalphLoop] Failed to delete execution state for {}: {}", execution_id_for_loop, e);
                    }
                }
                Err(e) => {
                    log::error!("[RalphLoop] Failed to open database for cleanup: {}", e);
                }
            }
        }

        match result {
            Ok(metrics) => {
                log::info!(
                    "[RalphLoop] Loop {} completed: {} iterations, ${:.2} total cost",
                    execution_id_for_loop,
                    metrics.total_iterations,
                    metrics.total_cost
                );

                // Check orchestrator state to determine if this was a success or a "soft" failure
                let final_state = orchestrator.state().clone();

                match &final_state {
                    RalphLoopExecutionState::Completed { .. } => {
                        // True success - all stories passed
                        // Emit loop completed event for frontend notification handling
                        let payload = crate::events::RalphLoopCompletedPayload {
                            execution_id: execution_id_for_loop.clone(),
                            prd_name: prd_name_for_loop.clone(),
                            total_iterations: metrics.total_iterations,
                            completed_stories: metrics.stories_completed,
                            total_stories: metrics.stories_completed + metrics.stories_remaining,
                            duration_secs: metrics.total_duration_secs,
                            total_cost: metrics.total_cost,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        };

                        // Emit event to frontend
                        if let Err(e) = crate::events::emit_ralph_loop_completed(&app_handle_for_loop, payload) {
                            log::warn!("[RalphLoop] Failed to emit loop completed event: {}", e);
                        }

                        // Send desktop notification
                        send_loop_completion_notification(
                            &app_handle_for_loop,
                            &prd_name_for_loop,
                            metrics.total_iterations,
                            metrics.stories_completed,
                            metrics.total_duration_secs,
                        );
                    }
                    RalphLoopExecutionState::Failed { iteration, reason } => {
                        // Loop ended due to a failure condition (max iterations, max cost, etc.)
                        let error_type = if reason.contains("Max iterations") {
                            crate::events::RalphLoopErrorType::MaxIterations
                        } else if reason.contains("Max cost") {
                            crate::events::RalphLoopErrorType::MaxCost
                        } else {
                            crate::events::RalphLoopErrorType::Unknown
                        };

                        // Include stories info for max_iterations errors
                        let (stories_remaining, total_stories) = if error_type == crate::events::RalphLoopErrorType::MaxIterations {
                            (
                                Some(metrics.stories_remaining),
                                Some(metrics.stories_completed + metrics.stories_remaining),
                            )
                        } else {
                            (None, None)
                        };

                        send_error_notification(
                            &app_handle_for_loop,
                            &execution_id_for_loop,
                            &prd_name_for_loop,
                            error_type,
                            reason,
                            *iteration,
                            stories_remaining,
                            total_stories,
                        );
                    }
                    RalphLoopExecutionState::Cancelled { iteration } => {
                        // Loop was cancelled by user - no notification needed
                        log::info!(
                            "[RalphLoop] Loop {} was cancelled at iteration {}",
                            execution_id_for_loop,
                            iteration
                        );
                    }
                    _ => {
                        // Unexpected state - send completion notification anyway
                        log::warn!(
                            "[RalphLoop] Loop {} ended with unexpected state: {:?}",
                            execution_id_for_loop,
                            final_state
                        );
                    }
                }
            }
            Err(e) => {
                log::error!("[RalphLoop] Loop {} failed: {}", execution_id_for_loop, e);

                // Get metrics from orchestrator
                let metrics = orchestrator.metrics();
                let iteration = metrics.total_iterations;

                // Classify the error and send appropriate notification
                let error_str = e.to_lowercase();
                let error_type = if error_str.contains("rate limit") || error_str.contains("429") || error_str.contains("too many requests") {
                    crate::events::RalphLoopErrorType::RateLimit
                } else if error_str.contains("max iterations") {
                    crate::events::RalphLoopErrorType::MaxIterations
                } else if error_str.contains("max cost") {
                    crate::events::RalphLoopErrorType::MaxCost
                } else if error_str.contains("timeout") || error_str.contains("timed out") {
                    crate::events::RalphLoopErrorType::Timeout
                } else if error_str.contains("parse") || error_str.contains("json") || error_str.contains("deserialize") {
                    crate::events::RalphLoopErrorType::ParseError
                } else if error_str.contains("conflict") || error_str.contains("merge") {
                    crate::events::RalphLoopErrorType::GitConflict
                } else if error_str.contains("agent") || error_str.contains("exit") || error_str.contains("spawn") || error_str.contains("crash") {
                    crate::events::RalphLoopErrorType::AgentCrash
                } else {
                    crate::events::RalphLoopErrorType::Unknown
                };

                // Include stories info for max_iterations errors
                let (stories_remaining, total_stories) = if error_type == crate::events::RalphLoopErrorType::MaxIterations {
                    (
                        Some(metrics.stories_remaining),
                        Some(metrics.stories_completed + metrics.stories_remaining),
                    )
                } else {
                    (None, None)
                };

                // Send error notification
                send_error_notification(
                    &app_handle_for_loop,
                    &execution_id_for_loop,
                    &prd_name_for_loop,
                    error_type,
                    &e,
                    iteration,
                    stories_remaining,
                    total_stories,
                );
            }
        }
    });

    Ok(execution_id)
}

/// Stop a running Ralph loop
#[tauri::command]
pub async fn stop_ralph_loop(
    execution_id: String,
    ralph_state: State<'_, RalphLoopManagerState>,
) -> Result<(), String> {
    let orchestrator_arc = {
        let executions = ralph_state.executions.lock()
            .map_err(|e| format!("Executions lock error: {}", e))?;
        executions.get(&execution_id).cloned()
    };

    if let Some(orchestrator_arc) = orchestrator_arc {
        let mut orchestrator = orchestrator_arc.lock().await;
        orchestrator.cancel();
        Ok(())
    } else {
        Err(format!("No execution found with ID: {}", execution_id))
    }
}

/// Get the state of a Ralph loop execution
#[tauri::command]
pub async fn get_ralph_loop_state(
    execution_id: String,
    ralph_state: State<'_, RalphLoopManagerState>,
) -> Result<RalphLoopExecutionState, String> {
    // Read from snapshot (doesn't require locking orchestrator)
    if let Some(snapshot) = ralph_state.get_snapshot(&execution_id) {
        if let Some(state) = snapshot.state {
            return Ok(state);
        }
    }

    // Fallback: check if execution exists
    let exists = {
        let executions = ralph_state.executions.lock()
            .map_err(|e| format!("Executions lock error: {}", e))?;
        executions.contains_key(&execution_id)
    };

    if exists {
        // Execution exists but no snapshot yet - return Idle
        Ok(RalphLoopExecutionState::Idle)
    } else {
        Err(format!("No execution found with ID: {}", execution_id))
    }
}

/// Get metrics for a Ralph loop execution
#[tauri::command]
pub async fn get_ralph_loop_metrics(
    execution_id: String,
    ralph_state: State<'_, RalphLoopManagerState>,
) -> Result<RalphLoopMetrics, String> {
    // Read from snapshot first (doesn't require locking orchestrator)
    if let Some(snapshot) = ralph_state.get_snapshot(&execution_id) {
        if let Some(metrics) = snapshot.metrics {
            return Ok(metrics);
        }
    }

    // Fallback: check if execution exists and return empty metrics
    let exists = {
        let executions = ralph_state.executions.lock()
            .map_err(|e| format!("Executions lock error: {}", e))?;
        executions.contains_key(&execution_id)
    };

    if exists {
        // Return default empty metrics
        Ok(RalphLoopMetrics::default())
    } else {
        Err(format!("No execution found with ID: {}", execution_id))
    }
}

/// List all active Ralph loop executions
#[tauri::command]
pub fn list_ralph_loop_executions(
    ralph_state: State<'_, RalphLoopManagerState>,
) -> Result<Vec<String>, String> {
    let executions = ralph_state.executions.lock()
        .map_err(|e| format!("Executions lock error: {}", e))?;
    Ok(executions.keys().cloned().collect())
}

/// Get current agent ID for a Ralph loop execution (for terminal connection)
#[tauri::command]
pub async fn get_ralph_loop_current_agent(
    execution_id: String,
    ralph_state: State<'_, RalphLoopManagerState>,
) -> Result<Option<String>, String> {
    // Read from snapshot (doesn't require locking orchestrator)
    if let Some(snapshot) = ralph_state.get_snapshot(&execution_id) {
        log::debug!("get_ralph_loop_current_agent: returning {:?}", snapshot.current_agent_id);
        return Ok(snapshot.current_agent_id);
    }
    log::debug!("get_ralph_loop_current_agent: NO SNAPSHOT for {}", execution_id);

    // Fallback: check if execution exists
    let exists = {
        let executions = ralph_state.executions.lock()
            .map_err(|e| format!("Executions lock error: {}", e))?;
        executions.contains_key(&execution_id)
    };

    if exists {
        Ok(None) // No agent yet
    } else {
        Err(format!("No execution found with ID: {}", execution_id))
    }
}

/// Get worktree path for a Ralph loop execution
#[tauri::command]
pub async fn get_ralph_loop_worktree_path(
    execution_id: String,
    ralph_state: State<'_, RalphLoopManagerState>,
) -> Result<Option<String>, String> {
    // Read from snapshot (doesn't require locking orchestrator)
    if let Some(snapshot) = ralph_state.get_snapshot(&execution_id) {
        return Ok(snapshot.worktree_path);
    }

    // Fallback: check if execution exists
    let exists = {
        let executions = ralph_state.executions.lock()
            .map_err(|e| format!("Executions lock error: {}", e))?;
        executions.contains_key(&execution_id)
    };

    if exists {
        Ok(None) // No worktree yet
    } else {
        Err(format!("No execution found with ID: {}", execution_id))
    }
}

/// Cleanup a Ralph loop worktree
///
/// Removes the git worktree and optionally deletes the directory.
/// The worktree should be kept for review until this command is called.
#[tauri::command]
pub fn cleanup_ralph_worktree(
    project_path: String,
    worktree_path: String,
    delete_directory: Option<bool>,
) -> Result<(), String> {
    use crate::git::GitManager;

    log::info!("[RalphLoop] Cleaning up worktree at {}", worktree_path);

    // Remove the git worktree
    let git_manager = GitManager::new(&project_path)
        .map_err(|e| format!("Failed to open git repository: {}", e))?;

    git_manager.remove_worktree(&worktree_path)
        .map_err(|e| format!("Failed to remove worktree: {}", e))?;

    // Optionally delete the directory
    if delete_directory.unwrap_or(true) {
        let path = PathBuf::from(&worktree_path);
        if path.exists() {
            std::fs::remove_dir_all(&path)
                .map_err(|e| format!("Failed to delete worktree directory: {}", e))?;
            log::info!("[RalphLoop] Deleted worktree directory at {}", worktree_path);
        }
    }

    Ok(())
}

/// List all Ralph worktrees for a project
#[tauri::command]
pub fn list_ralph_worktrees(project_path: String) -> Result<Vec<RalphWorktreeInfo>, String> {
    use crate::git::GitManager;

    let git_manager = GitManager::new(&project_path)
        .map_err(|e| format!("Failed to open git repository: {}", e))?;

    let worktrees = git_manager.list_worktrees()
        .map_err(|e| format!("Failed to list worktrees: {}", e))?;

    // Filter to only ralph worktrees (path contains "ralph-")
    let ralph_worktrees: Vec<RalphWorktreeInfo> = worktrees
        .into_iter()
        .filter(|wt| wt.path.contains("ralph-") || wt.name.starts_with("ralph"))
        .map(|wt| RalphWorktreeInfo {
            name: wt.name,
            path: wt.path,
            branch: wt.branch,
            is_locked: wt.is_locked,
        })
        .collect();

    Ok(ralph_worktrees)
}

/// Information about a Ralph worktree
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphWorktreeInfo {
    pub name: String,
    pub path: String,
    pub branch: Option<String>,
    pub is_locked: bool,
}

/// Convert PRD chat export to Ralph PRD format
///
/// This takes an existing PRD document and converts it to the Ralph loop format,
/// writing prd.json, initializing progress.txt, config.yaml, and prompt.md.
/// Settings from the PRD Execution Dialog are used to initialize the config.
#[tauri::command]
pub fn convert_prd_to_ralph(
    request: ConvertPrdToRalphRequest,
    db: State<'_, Mutex<Database>>,
) -> Result<RalphPrd, String> {
    use crate::models::ExtractedPRDStructure;
    use crate::ralph_loop::{LoopConfig, ProjectConfig};

    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;

    // Get the PRD from database
    let prd_doc = db
        .get_prd(&request.prd_id)
        .map_err(|e| format!("PRD not found or error: {}", e))?;

    let project_path = prd_doc
        .project_path
        .ok_or_else(|| "PRD has no project path".to_string())?;

    let project_path_buf = PathBuf::from(&project_path);
    let executor = PrdExecutor::new(&project_path_buf, &request.prd_name);

    // Create Ralph PRD
    let mut ralph_prd = RalphPrd::new(&prd_doc.title, &request.branch);
    ralph_prd.description = prd_doc.description;

    // Convert extracted structure if available
    if let Some(structure_json) = prd_doc.extracted_structure {
        if let Ok(structure) = serde_json::from_str::<ExtractedPRDStructure>(&structure_json) {
            for (index, task) in structure.tasks.iter().enumerate() {
                let mut story = RalphStory::new(
                    &task.id,
                    &task.title,
                    task.acceptance_criteria
                        .as_ref()
                        .map(|v| v.join("\n"))
                        .unwrap_or_else(|| task.description.clone()),
                );
                story.description = Some(task.description.clone());
                story.priority = task.priority.map(|p| p as u32).unwrap_or(index as u32);
                story.dependencies = task.dependencies.clone().unwrap_or_default();
                story.tags = task.tags.clone().unwrap_or_default();
                ralph_prd.add_story(story);
            }
        }
    }

    // Write PRD to file
    executor.write_prd(&ralph_prd)?;

    // Initialize progress.txt
    let tracker = ProgressTracker::new(&project_path_buf, &request.prd_name);
    tracker.initialize()?;

    // Create and write config.yaml with settings from the dialog
    let config_manager = ConfigManager::new(&project_path_buf);
    let ralph_config = RalphConfig {
        project: ProjectConfig {
            name: Some(prd_doc.title.clone()),
            test_command: None,
            lint_command: None,
            build_command: None,
        },
        ralph: LoopConfig {
            max_iterations: request.max_iterations.unwrap_or(50),
            max_cost: request.max_cost,
            agent: request.agent_type.clone().unwrap_or_else(|| "claude".to_string()),
            model: request.model.clone(),
            completion_promise: "<promise>COMPLETE</promise>".to_string(),
        },
    };
    config_manager.write(&ralph_config)?;

    // Generate prompt.md with the same config
    let prompt_builder = PromptBuilder::new(&project_path_buf, &request.prd_name);
    let loop_config = RalphLoopConfig {
        project_path: project_path_buf.clone(),
        prd_name: request.prd_name.clone(),
        run_tests: request.run_tests.unwrap_or(true),
        run_lint: request.run_lint.unwrap_or(true),
        max_iterations: request.max_iterations.unwrap_or(50),
        max_cost: request.max_cost,
        model: request.model,
        ..Default::default()
    };
    prompt_builder.generate_prompt(&loop_config)?;

    Ok(ralph_prd)
}

/// Convert a file-based PRD (from .ralph-ui/prds/) to Ralph loop format
///
/// This reads a markdown PRD file and its associated structure JSON (if any),
/// then creates the Ralph loop files (prd.json, progress.txt, config.yaml, prompt.md).
#[tauri::command]
pub fn convert_prd_file_to_ralph(
    request: ConvertPrdFileToRalphRequest,
) -> Result<RalphPrd, String> {
    use crate::ralph_loop::{LoopConfig, ProjectConfig};
    use std::fs;

    let project_path = PathBuf::from(&request.project_path);
    let prds_dir = project_path.join(".ralph-ui").join("prds");

    // Read the markdown file
    let md_path = prds_dir.join(format!("{}.md", request.prd_name));
    let content = fs::read_to_string(&md_path)
        .map_err(|e| format!("Failed to read PRD file {:?}: {}", md_path, e))?;

    // Extract title from first # heading or use prd_name
    let title = content
        .lines()
        .find(|line| line.starts_with("# "))
        .map(|line| line.trim_start_matches("# ").trim().to_string())
        .unwrap_or_else(|| request.prd_name.clone());

    // Try to read associated structure JSON
    let structure_path = prds_dir.join(format!("{}-structure.json", request.prd_name));
    let structure: Option<crate::models::ExtractedPRDStructure> = if structure_path.exists() {
        fs::read_to_string(&structure_path)
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
    } else {
        None
    };

    // Create Ralph PRD
    let mut ralph_prd = RalphPrd::new(&title, &request.branch);

    // If we have extracted structure, use it
    if let Some(structure) = structure {
        for (index, task) in structure.tasks.iter().enumerate() {
            let mut story = RalphStory::new(
                &task.id,
                &task.title,
                task.acceptance_criteria
                    .as_ref()
                    .map(|v| v.join("\n"))
                    .unwrap_or_else(|| task.description.clone()),
            );
            story.description = Some(task.description.clone());
            story.priority = task.priority.map(|p| p as u32).unwrap_or(index as u32);
            story.dependencies = task.dependencies.clone().unwrap_or_default();
            story.tags = task.tags.clone().unwrap_or_default();
            ralph_prd.add_story(story);
        }
    } else {
        // Parse markdown to extract tasks
        let mut stories = Vec::new();
        
        // Pass 1: Look for explicit US/Task patterns (e.g., "### US-1: Title")
        // This is robust against section headers being mistaken for tasks
        for line in content.lines() {
            if line.contains("### US-") || line.contains("### T-") {
                // Extract ID and Title
                // Example: "1. ### US-SP-1: Create StreamingParser Struct"
                // Example: "### US-1: Title"
                if let Some(start_idx) = line.find("### ") {
                    let text = &line[start_idx + 4..]; // Skip "### "
                    // Split by colon to separate ID and Title
                    if let Some((id_part, title_part)) = text.split_once(':') {
                        let id = id_part.trim();
                        let title = title_part.trim();
                        stories.push(RalphStory::new(id, title, title));
                    } else {
                        // Fallback: use whole text as title, try to extract ID
                        let parts: Vec<&str> = text.split_whitespace().collect();
                        if !parts.is_empty() {
                            let id = parts[0];
                            let title = text;
                            stories.push(RalphStory::new(id, title, title));
                        }
                    }
                }
            }
        }

        // Pass 2: Fallback to headers if no explicit stories found
        if stories.is_empty() {
            let mut task_index = 0;
            for line in content.lines() {
                if line.starts_with("## ") || line.starts_with("### ") {
                    let task_title = line.trim_start_matches('#').trim();
                    // Skip common section headers
                    if !["overview", "requirements", "tasks", "summary", "description", "background", "phase", "feature", "metrics", "notes", "questions", "table", "dependency", "migration"]
                        .iter()
                        .any(|s| task_title.to_lowercase().starts_with(s))
                    {
                        stories.push(RalphStory::new(
                            &format!("task-{}", task_index + 1),
                            task_title,
                            task_title,
                        ));
                        task_index += 1;
                    }
                }
            }
        }

        for story in stories {
            ralph_prd.add_story(story);
        }

        // If STILL no tasks found, create a single task from the PRD
        if ralph_prd.stories.is_empty() {
            let story = RalphStory::new(
                "task-1",
                &title,
                "Complete the requirements specified in the PRD",
            );
            ralph_prd.add_story(story);
        }
    }

    // Use new multi-PRD path format
    let executor = PrdExecutor::new(&project_path, &request.prd_name);
    executor.write_prd(&ralph_prd)?;

    // Initialize progress
    let tracker = ProgressTracker::new(&project_path, &request.prd_name);
    tracker.initialize()?;

    // Create and write config.yaml
    // Note: config.yaml stays in .ralph-ui/prds/ for now as it's per-PRD
    let config_path = prds_dir.join(format!("{}-config.yaml", request.prd_name));
    let ralph_config = RalphConfig {
        project: ProjectConfig {
            name: Some(title.clone()),
            test_command: None,
            lint_command: None,
            build_command: None,
        },
        ralph: LoopConfig {
            max_iterations: request.max_iterations.unwrap_or(50),
            max_cost: request.max_cost,
            agent: request.agent_type.clone().unwrap_or_else(|| "claude".to_string()),
            model: request.model.clone(),
            completion_promise: "<promise>COMPLETE</promise>".to_string(),
        },
    };
    let config_yaml = serde_yaml::to_string(&ralph_config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&config_path, config_yaml)
        .map_err(|e| format!("Failed to write config: {}", e))?;

    // Generate prompt.md
    let prompt_builder = PromptBuilder::new(&project_path, &request.prd_name);
    let loop_config = RalphLoopConfig {
        project_path: project_path.clone(),
        run_tests: request.run_tests.unwrap_or(true),
        run_lint: request.run_lint.unwrap_or(true),
        max_iterations: request.max_iterations.unwrap_or(50),
        max_cost: request.max_cost,
        model: request.model,
        prd_name: request.prd_name,
        template_name: request.template_name,
        ..Default::default()
    };
    prompt_builder.generate_prompt(&loop_config)?;

    Ok(ralph_prd)
}

/// Check if a project has Ralph loop files
#[tauri::command]
pub fn has_ralph_files(project_path: String) -> bool {
    let prds_dir = PathBuf::from(&project_path).join(".ralph-ui").join("prds");

    // Check if any .json files exist in the prds directory
    if prds_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&prds_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    return true;
                }
            }
        }
    }

    false
}

/// Get all Ralph files for a project
#[tauri::command]
pub fn get_ralph_files(project_path: String) -> Result<RalphFiles, String> {
    let prds_dir = PathBuf::from(&project_path).join(".ralph-ui").join("prds");

    // Check new .ralph-ui/prds/ directory for any PRD JSON files
    let mut has_prd = false;
    let mut has_progress = false;
    let mut has_prompt = false;
    let mut prd_names: Vec<String> = Vec::new();

    if prds_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&prds_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext == "json" {
                        has_prd = true;
                        if let Some(stem) = path.file_stem() {
                            prd_names.push(stem.to_string_lossy().to_string());
                        }
                    }
                }
                // Check for progress and prompt files
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.ends_with("-progress.txt") {
                        has_progress = true;
                    }
                    if name.ends_with("-prompt.md") {
                        has_prompt = true;
                    }
                }
            }
        }
    }

    // Config is at .ralph-ui/config.yaml
    let config_path = PathBuf::from(&project_path).join(".ralph-ui").join("config.yaml");

    Ok(RalphFiles {
        has_prd,
        has_progress,
        has_prompt,
        has_config: config_path.exists(),
        prd_path: prds_dir.to_string_lossy().to_string(),
        progress_path: prds_dir.to_string_lossy().to_string(),
        prompt_path: prds_dir.to_string_lossy().to_string(),
        config_path: config_path.to_string_lossy().to_string(),
        prd_names,
    })
}

/// Information about Ralph loop files
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphFiles {
    pub has_prd: bool,
    pub has_progress: bool,
    pub has_prompt: bool,
    pub has_config: bool,
    pub prd_path: String,
    pub progress_path: String,
    pub prompt_path: String,
    pub config_path: String,
    /// Names of PRD files found in .ralph-ui/prds/
    pub prd_names: Vec<String>,
}

// ============================================================================
// Config Commands
// ============================================================================

/// Get Ralph config for a project
#[tauri::command]
pub fn get_ralph_config(project_path: String) -> Result<RalphConfig, String> {
    use crate::ralph_loop::ConfigManager;

    let config_manager = ConfigManager::new(&PathBuf::from(&project_path));
    config_manager.read()
}

/// Set Ralph config for a project
#[tauri::command]
pub fn set_ralph_config(project_path: String, config: RalphConfig) -> Result<(), String> {
    use crate::ralph_loop::ConfigManager;

    let config_manager = ConfigManager::new(&PathBuf::from(&project_path));
    config_manager.write(&config)
}

/// Initialize Ralph config with defaults
#[tauri::command]
pub fn init_ralph_config(project_path: String) -> Result<RalphConfig, String> {
    use crate::ralph_loop::ConfigManager;

    let ralph_ui_dir = PathBuf::from(&project_path).join(".ralph-ui");
    std::fs::create_dir_all(&ralph_ui_dir)
        .map_err(|e| format!("Failed to create .ralph-ui directory: {}", e))?;

    let config_manager = ConfigManager::new(&PathBuf::from(&project_path));
    config_manager.initialize()
}

/// Update specific Ralph config fields
#[tauri::command]
pub fn update_ralph_config(
    project_path: String,
    max_iterations: Option<u32>,
    max_cost: Option<f64>,
    agent: Option<String>,
    model: Option<String>,
    test_command: Option<String>,
    lint_command: Option<String>,
    build_command: Option<String>,
) -> Result<RalphConfig, String> {
    use crate::ralph_loop::ConfigManager;

    let config_manager = ConfigManager::new(&PathBuf::from(&project_path));

    config_manager.update(|config| {
        if let Some(v) = max_iterations {
            config.ralph.max_iterations = v;
        }
        if max_cost.is_some() {
            config.ralph.max_cost = max_cost;
        }
        if let Some(v) = agent {
            config.ralph.agent = v;
        }
        if model.is_some() {
            config.ralph.model = model;
        }
        if test_command.is_some() {
            config.project.test_command = test_command;
        }
        if lint_command.is_some() {
            config.project.lint_command = lint_command;
        }
        if build_command.is_some() {
            config.project.build_command = build_command;
        }
    })
}

// ============================================================================
// Iteration History Commands
// ============================================================================

use crate::database::ralph_iterations::{
    self, IterationStats,
};
use crate::ralph_loop::{ExecutionStateSnapshot, IterationOutcome, IterationRecord};

/// Get iteration history for an execution
#[tauri::command]
pub fn get_ralph_iteration_history(
    execution_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<Vec<IterationRecord>, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    ralph_iterations::get_iterations_for_execution(db.get_connection(), &execution_id)
        .map_err(|e| format!("Failed to get iteration history: {}", e))
}

/// Get iteration statistics for an execution
#[tauri::command]
pub fn get_ralph_iteration_stats(
    execution_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<IterationStats, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    ralph_iterations::get_execution_stats(db.get_connection(), &execution_id)
        .map_err(|e| format!("Failed to get iteration stats: {}", e))
}

/// Get all iteration history with optional filters
#[tauri::command]
pub fn get_all_ralph_iterations(
    execution_id: Option<String>,
    outcome_filter: Option<String>,
    limit: Option<u32>,
    db: State<'_, Mutex<Database>>,
) -> Result<Vec<IterationRecord>, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;

    let outcome = outcome_filter.and_then(|s| match s.as_str() {
        "success" => Some(IterationOutcome::Success),
        "failed" => Some(IterationOutcome::Failed),
        "skipped" => Some(IterationOutcome::Skipped),
        "interrupted" => Some(IterationOutcome::Interrupted),
        _ => None,
    });

    ralph_iterations::get_iteration_history(
        db.get_connection(),
        execution_id.as_deref(),
        outcome,
        limit,
    )
    .map_err(|e| format!("Failed to get iteration history: {}", e))
}

/// Save an iteration record (used by orchestrator)
#[tauri::command]
pub fn save_ralph_iteration(
    record: IterationRecord,
    db: State<'_, Mutex<Database>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    ralph_iterations::insert_iteration(db.get_connection(), &record)
        .map_err(|e| format!("Failed to save iteration: {}", e))
}

/// Update an iteration record (used by orchestrator on completion)
#[tauri::command]
pub fn update_ralph_iteration(
    id: String,
    outcome: String,
    duration_secs: f64,
    completed_at: String,
    error_message: Option<String>,
    db: State<'_, Mutex<Database>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;

    let outcome_enum = match outcome.as_str() {
        "success" => IterationOutcome::Success,
        "failed" => IterationOutcome::Failed,
        "skipped" => IterationOutcome::Skipped,
        "interrupted" => IterationOutcome::Interrupted,
        _ => return Err(format!("Invalid outcome: {}", outcome)),
    };

    ralph_iterations::update_iteration(
        db.get_connection(),
        &id,
        outcome_enum,
        duration_secs,
        &completed_at,
        error_message.as_deref(),
    )
    .map_err(|e| format!("Failed to update iteration: {}", e))?;

    Ok(())
}

/// Save execution state snapshot (for heartbeat/crash recovery)
#[tauri::command]
pub fn save_ralph_execution_state(
    snapshot: ExecutionStateSnapshot,
    db: State<'_, Mutex<Database>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    ralph_iterations::save_execution_state(db.get_connection(), &snapshot)
        .map_err(|e| format!("Failed to save execution state: {}", e))
}

/// Update heartbeat for an execution
#[tauri::command]
pub fn update_ralph_heartbeat(
    execution_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let heartbeat = chrono::Utc::now().to_rfc3339();
    ralph_iterations::update_heartbeat(db.get_connection(), &execution_id, &heartbeat)
        .map_err(|e| format!("Failed to update heartbeat: {}", e))?;
    Ok(())
}

/// Get execution state snapshot
#[tauri::command]
pub fn get_ralph_execution_state(
    execution_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<Option<ExecutionStateSnapshot>, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    ralph_iterations::get_execution_state(db.get_connection(), &execution_id)
        .map_err(|e| format!("Failed to get execution state: {}", e))
}

/// Check for stale executions (crash recovery)
#[tauri::command]
pub fn check_stale_ralph_executions(
    threshold_secs: Option<i64>,
    db: State<'_, Mutex<Database>>,
) -> Result<Vec<ExecutionStateSnapshot>, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let threshold = threshold_secs.unwrap_or(120); // Default 2 minutes
    ralph_iterations::get_stale_executions(db.get_connection(), threshold)
        .map_err(|e| format!("Failed to check stale executions: {}", e))
}

/// Mark stale iterations as interrupted (crash recovery)
#[tauri::command]
pub fn recover_stale_ralph_iterations(
    execution_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<u32, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let completed_at = chrono::Utc::now().to_rfc3339();

    let count = ralph_iterations::mark_interrupted_iterations(
        db.get_connection(),
        &execution_id,
        &completed_at,
    )
    .map_err(|e| format!("Failed to recover iterations: {}", e))?;

    // Clean up execution state
    ralph_iterations::delete_execution_state(db.get_connection(), &execution_id)
        .map_err(|e| format!("Failed to delete execution state: {}", e))?;

    Ok(count as u32)
}

/// Delete iteration history for an execution (cleanup)
#[tauri::command]
pub fn delete_ralph_iteration_history(
    execution_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<u32, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;

    let count = ralph_iterations::delete_iterations_for_execution(db.get_connection(), &execution_id)
        .map_err(|e| format!("Failed to delete iterations: {}", e))?;

    Ok(count as u32)
}

/// Consolidated snapshot response for efficient polling
/// Combines state, metrics, agent ID, worktree path, and iteration history in a single IPC call
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphLoopSnapshot {
    pub state: Option<RalphLoopExecutionState>,
    pub metrics: Option<RalphLoopMetrics>,
    pub current_agent_id: Option<String>,
    pub worktree_path: Option<String>,
    pub iteration_history: Vec<IterationRecord>,
}

/// Get a consolidated snapshot of Ralph loop execution state
/// 
/// This combines multiple data sources into a single IPC call for efficient polling:
/// - Execution state (running, completed, etc.)
/// - Execution metrics (iterations, cost, tokens)
/// - Current agent ID (for terminal connection)
/// - Worktree path (for file operations)
/// - Iteration history (from database)
#[tauri::command]
pub async fn get_ralph_loop_snapshot(
    execution_id: String,
    ralph_state: State<'_, RalphLoopManagerState>,
    db: State<'_, Mutex<Database>>,
) -> Result<RalphLoopSnapshot, String> {
    // Get in-memory snapshot
    let snapshot = ralph_state.get_snapshot(&execution_id);
    
    // Get iteration history from database
    let iteration_history = {
        let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
        ralph_iterations::get_iterations_for_execution(db.get_connection(), &execution_id)
            .unwrap_or_default()
    };
    
    if let Some(snap) = snapshot {
        Ok(RalphLoopSnapshot {
            state: snap.state,
            metrics: snap.metrics,
            current_agent_id: snap.current_agent_id,
            worktree_path: snap.worktree_path,
            iteration_history,
        })
    } else {
        // Check if execution exists at all
        let exists = {
            let executions = ralph_state.executions.lock()
                .map_err(|e| format!("Executions lock error: {}", e))?;
            executions.contains_key(&execution_id)
        };
        
        if exists {
            // Execution exists but no snapshot yet
            Ok(RalphLoopSnapshot {
                state: Some(RalphLoopExecutionState::Idle),
                metrics: Some(RalphLoopMetrics::default()),
                current_agent_id: None,
                worktree_path: None,
                iteration_history,
            })
        } else {
            Err(format!("No execution found with ID: {}", execution_id))
        }
    }
}

/// Cleanup old iteration history records (maintenance)
/// Deletes iterations older than the specified number of days
#[tauri::command]
pub fn cleanup_ralph_iteration_history(
    days_to_keep: Option<i64>,
    db: State<'_, Mutex<Database>>,
) -> Result<u32, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let days = days_to_keep.unwrap_or(30); // Default: keep 30 days

    let count = ralph_iterations::cleanup_old_iterations(db.get_connection(), days)
        .map_err(|e| format!("Failed to cleanup iterations: {}", e))?;

    log::info!("[RalphLoop] Cleaned up {} old iteration records (older than {} days)", count, days);
    Ok(count as u32)
}

// =============================================================================
// Desktop Notification Helpers
// =============================================================================

/// Format duration in a human-readable way
fn format_duration(secs: f64) -> String {
    let total_secs = secs as u64;
    let hours = total_secs / 3600;
    let minutes = (total_secs % 3600) / 60;
    let seconds = total_secs % 60;

    if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else if minutes > 0 {
        format!("{}m {}s", minutes, seconds)
    } else {
        format!("{}s", seconds)
    }
}

/// Send a desktop notification when a Ralph loop completes successfully
fn send_loop_completion_notification(
    app_handle: &tauri::AppHandle,
    prd_name: &str,
    total_iterations: u32,
    completed_stories: u32,
    duration_secs: f64,
) {
    use tauri_plugin_notification::NotificationExt;

    // Format the notification body
    let duration_str = format_duration(duration_secs);
    let body = format!(
        "{} stories completed in {} iterations\nDuration: {}",
        completed_stories, total_iterations, duration_str
    );

    // Send the desktop notification
    match app_handle
        .notification()
        .builder()
        .title(&format!("Ralph Loop Complete: {}", prd_name))
        .body(&body)
        .show()
    {
        Ok(_) => {
            log::info!("[RalphLoop] Desktop notification sent for loop completion: {}", prd_name);
        }
        Err(e) => {
            log::warn!("[RalphLoop] Failed to send desktop notification: {}", e);
        }
    }
}

/// Send a desktop notification when a Ralph loop encounters an error
fn send_error_notification(
    app_handle: &tauri::AppHandle,
    execution_id: &str,
    prd_name: &str,
    error_type: crate::events::RalphLoopErrorType,
    message: &str,
    iteration: u32,
    stories_remaining: Option<u32>,
    total_stories: Option<u32>,
) {
    use tauri_plugin_notification::NotificationExt;

    // Truncate message to 200 chars for notification display
    let truncated_message = if message.len() > 200 {
        format!("{}...", &message[..197])
    } else {
        message.to_string()
    };

    // Get error type label for title
    let error_label = match error_type {
        crate::events::RalphLoopErrorType::AgentCrash => "Agent Crash",
        crate::events::RalphLoopErrorType::ParseError => "Parse Error",
        crate::events::RalphLoopErrorType::GitConflict => "Git Conflict",
        crate::events::RalphLoopErrorType::RateLimit => "Rate Limit",
        crate::events::RalphLoopErrorType::MaxIterations => "Max Iterations",
        crate::events::RalphLoopErrorType::MaxCost => "Max Cost",
        crate::events::RalphLoopErrorType::Timeout => "Timeout",
        crate::events::RalphLoopErrorType::Unknown => "Error",
    };

    // Format notification body - include stories remaining for max iterations
    let body = if error_type == crate::events::RalphLoopErrorType::MaxIterations {
        if let (Some(remaining), Some(total)) = (stories_remaining, total_stories) {
            format!(
                "{}: {} stories remaining of {}\nIteration: {}",
                prd_name, remaining, total, iteration
            )
        } else {
            format!(
                "{}: {}\nIteration: {}",
                prd_name, truncated_message, iteration
            )
        }
    } else {
        format!(
            "{}: {}\nIteration: {}",
            prd_name, truncated_message, iteration
        )
    };

    // Emit event for frontend
    let payload = crate::events::RalphLoopErrorPayload {
        execution_id: execution_id.to_string(),
        prd_name: prd_name.to_string(),
        error_type: error_type.clone(),
        message: truncated_message.clone(),
        iteration,
        timestamp: chrono::Utc::now().to_rfc3339(),
        stories_remaining,
        total_stories,
    };

    if let Err(e) = crate::events::emit_ralph_loop_error(app_handle, payload) {
        log::warn!("[RalphLoop] Failed to emit error event: {}", e);
    }

    // Send the desktop notification
    match app_handle
        .notification()
        .builder()
        .title(&format!("Ralph Loop {}: {}", error_label, prd_name))
        .body(&body)
        .show()
    {
        Ok(_) => {
            log::info!("[RalphLoop] Error notification sent: {} - {}", error_label, prd_name);
        }
        Err(e) => {
            log::warn!("[RalphLoop] Failed to send error notification: {}", e);
        }
    }
}

/// Send a test notification to verify notification settings (US-005)
#[tauri::command]
pub fn send_test_notification(app_handle: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;

    match app_handle
        .notification()
        .builder()
        .title("Ralph UI Test Notification")
        .body("If you can see this, notifications are working! Ralph says hi.")
        .show()
    {
        Ok(_) => {
            log::info!("[Notification] Test notification sent successfully");
            Ok(())
        }
        Err(e) => {
            log::warn!("[Notification] Failed to send test notification: {}", e);
            Err(format!("Failed to send test notification: {}", e))
        }
    }
}
