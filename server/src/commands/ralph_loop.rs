//! Backend commands for Ralph Wiggum Loop orchestration
//!
//! These commands control the external Ralph loop that spawns fresh agent instances.

use crate::commands::ConfigState;
use crate::models::AgentType;
use crate::ralph_loop::{
    AssignmentsFile, AssignmentsManager, ConflictResolution, ErrorStrategy, ExecutionSnapshot,
    FallbackChainConfig, FileInUse, LearningEntry, LearningType, LearningsFile, LearningsManager,
    MergeStrategy, PrdExecutor, PrdStatus, ProgressSummary, ProgressTracker, PromptBuilder,
    RalphConfig, RalphLoopConfig, RalphLoopMetrics, RalphLoopOrchestrator,
    RalphLoopState as RalphLoopExecutionState, RalphPrd, RalphStory, RetryConfig, SnapshotStore,
};
use crate::utils::{as_path, prds_dir, ralph_ui_dir, to_path_buf};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

// ============================================================================
// Helper Functions
// ============================================================================

/// Create a PrdExecutor from project path and PRD name strings.
/// Reduces repetitive `PrdExecutor::new(&to_path_buf(&project_path), &prd_name)` pattern.
#[inline]
fn prd_executor(project_path: &str, prd_name: &str) -> PrdExecutor {
    PrdExecutor::new(&to_path_buf(project_path), prd_name)
}

/// Create a ProgressTracker from project path and PRD name strings.
#[inline]
fn progress_tracker(project_path: &str, prd_name: &str) -> ProgressTracker {
    ProgressTracker::new(&to_path_buf(project_path), prd_name)
}

/// Create a PromptBuilder from project path and PRD name strings.
#[inline]
fn prompt_builder(project_path: &str, prd_name: &str) -> PromptBuilder {
    PromptBuilder::new(&to_path_buf(project_path), prd_name)
}

/// Resolve a configuration value with fallback chain.
/// Tries request value first, then PRD config, then global config, then default.
#[inline]
fn resolve_config<T>(
    request_val: Option<T>,
    prd_val: Option<T>,
    global_val: Option<T>,
    default: T,
) -> T {
    request_val.or(prd_val).or(global_val).unwrap_or(default)
}

/// Resolve an optional configuration value with fallback chain.
/// Like resolve_config but returns Option<T> instead of T.
#[inline]
fn resolve_config_opt<T>(
    request_val: Option<T>,
    prd_val: Option<T>,
    global_val: Option<T>,
) -> Option<T> {
    request_val.or(prd_val).or(global_val)
}

/// State for managing active Ralph loop executions (Application state)
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

    /// Get an execution orchestrator by ID (for server mode)
    pub fn get_execution(
        &self,
        execution_id: &str,
    ) -> Result<Option<Arc<tokio::sync::Mutex<RalphLoopOrchestrator>>>, String> {
        let executions = self
            .executions
            .lock()
            .map_err(|e| format!("Executions lock error: {}", e))?;
        Ok(executions.get(execution_id).cloned())
    }

    /// Insert an execution orchestrator (for server mode)
    pub fn insert_execution(
        &self,
        execution_id: String,
        orchestrator: Arc<tokio::sync::Mutex<RalphLoopOrchestrator>>,
    ) -> Result<(), String> {
        let mut executions = self
            .executions
            .lock()
            .map_err(|e| format!("Executions lock error: {}", e))?;
        executions.insert(execution_id, orchestrator);
        Ok(())
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
    /// Optional execution configuration to store with the PRD
    pub execution_config: Option<crate::ralph_loop::PrdExecutionConfig>,
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
pub fn init_ralph_prd(request: InitRalphPrdRequest, prd_name: String) -> Result<RalphPrd, String> {
    let project_path = PathBuf::from(&request.project_path);
    let executor = PrdExecutor::new(&project_path, &prd_name);

    // Validate execution config if provided
    if let Some(ref exec_config) = request.execution_config {
        exec_config.validate()?;
        log::info!(
            "[init_ralph_prd] PRD '{}' includes stored execution config: agent={:?}, model={:?}, max_iterations={:?}",
            prd_name,
            exec_config.agent_type,
            exec_config.model,
            exec_config.max_iterations
        );
    } else {
        log::info!(
            "[init_ralph_prd] PRD '{}' has no stored execution config - will use global config at execution time",
            prd_name
        );
    }

    let mut prd = RalphPrd::new(&request.title, &request.branch);
    prd.description = request.description;
    prd.execution_config = request.execution_config.clone();

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

    // Generate prompt.md - use execution config settings if provided
    let prompt_builder = PromptBuilder::new(&project_path, &prd_name);
    let exec_config = request.execution_config.as_ref();
    let config = RalphLoopConfig {
        project_path: project_path.clone(),
        prd_name: prd_name.clone(),
        run_tests: exec_config.and_then(|c| c.run_tests).unwrap_or(true),
        run_lint: exec_config.and_then(|c| c.run_lint).unwrap_or(true),
        template_name: exec_config.and_then(|c| c.template_name.clone()),
        ..Default::default()
    };
    prompt_builder.generate_prompt(&config)?;

    Ok(prd)
}

/// Find the newest PRD by checking main project and all worktrees.
///
/// Returns the PRD from whichever location has the most recently modified file.
/// This ensures correct data is shown after app restart even if a worktree
/// execution is ongoing.
fn find_newest_prd(project_path: &std::path::Path, prd_name: &str) -> Result<RalphPrd, String> {
    use std::time::SystemTime;

    let main_executor = PrdExecutor::new(project_path, prd_name);
    let main_prd_path = project_path
        .join(".ralph-ui")
        .join("prds")
        .join(format!("{}.json", prd_name));
    let main_modified = main_prd_path
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok());

    let worktrees_dir = project_path.join(".worktrees");
    let mut best_prd: Option<RalphPrd> = None;
    let mut best_modified: Option<SystemTime> = main_modified;

    if worktrees_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&worktrees_dir) {
            for entry in entries.flatten() {
                let worktree_path = entry.path();
                if !worktree_path.is_dir() {
                    continue;
                }

                let worktree_prd_path = worktree_path
                    .join(".ralph-ui")
                    .join("prds")
                    .join(format!("{}.json", prd_name));

                let modified = worktree_prd_path
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok());

                let is_newer = match (modified, best_modified) {
                    (Some(m), Some(best)) => m > best,
                    (Some(_), None) => true,
                    _ => false,
                };

                if is_newer {
                    let worktree_executor = PrdExecutor::new(&worktree_path, prd_name);
                    if let Ok(prd) = worktree_executor.read_prd() {
                        log::debug!(
                            "[find_newest_prd] Found newer PRD in worktree {:?}",
                            worktree_path
                        );
                        best_prd = Some(prd);
                        best_modified = modified;
                    }
                }
            }
        }
    }

    match best_prd {
        Some(prd) => Ok(prd),
        None => main_executor.read_prd(),
    }
}

/// Read the Ralph PRD from .ralph-ui/prds/{prd_name}.json
///
/// This command checks both the main project and any existing worktrees,
/// returning the PRD from whichever has newer data. This ensures correct
/// data is shown after app restart even if a worktree execution is ongoing.
pub fn get_ralph_prd(project_path: String, prd_name: String) -> Result<RalphPrd, String> {
    find_newest_prd(&to_path_buf(&project_path), &prd_name)
}

/// Get the status of the Ralph PRD
///
/// This command checks both the main project and any existing worktrees,
/// returning status from whichever has newer data. This ensures correct
/// status is shown after app restart even if a worktree execution is ongoing.
pub fn get_ralph_prd_status(project_path: String, prd_name: String) -> Result<PrdStatus, String> {
    let project_path_buf = to_path_buf(&project_path);
    let prd = find_newest_prd(&project_path_buf, &prd_name)?;
    let executor = PrdExecutor::new(&project_path_buf, &prd_name);
    Ok(executor.get_status(&prd))
}

/// Mark a story as passing in the PRD
pub fn mark_ralph_story_passing(project_path: String, prd_name: String, story_id: String) -> Result<bool, String> {
    prd_executor(&project_path, &prd_name).mark_story_passing(&story_id)
}

/// Mark a story as failing in the PRD
pub fn mark_ralph_story_failing(project_path: String, prd_name: String, story_id: String) -> Result<bool, String> {
    prd_executor(&project_path, &prd_name).mark_story_failing(&story_id)
}

/// Add a story to the PRD
pub fn add_ralph_story(project_path: String, prd_name: String, story: RalphStoryInput) -> Result<(), String> {
    let mut ralph_story = RalphStory::new(&story.id, &story.title, &story.acceptance);
    ralph_story.description = story.description;
    ralph_story.priority = story.priority.unwrap_or(100);
    ralph_story.dependencies = story.dependencies.unwrap_or_default();
    ralph_story.tags = story.tags.unwrap_or_default();
    ralph_story.effort = story.effort;

    prd_executor(&project_path, &prd_name).add_story(ralph_story)
}

/// Remove a story from the PRD
pub fn remove_ralph_story(project_path: String, prd_name: String, story_id: String) -> Result<bool, String> {
    prd_executor(&project_path, &prd_name).remove_story(&story_id)
}

/// Get progress.txt content
pub fn get_ralph_progress(project_path: String, prd_name: String) -> Result<String, String> {
    progress_tracker(&project_path, &prd_name).read_raw()
}

/// Get progress summary
pub fn get_ralph_progress_summary(project_path: String, prd_name: String) -> Result<ProgressSummary, String> {
    progress_tracker(&project_path, &prd_name).get_summary()
}

/// Add a note to progress.txt
pub fn add_ralph_progress_note(project_path: String, prd_name: String, iteration: u32, note: String) -> Result<(), String> {
    progress_tracker(&project_path, &prd_name).add_note(iteration, &note)
}

/// Clear progress.txt and reinitialize
pub fn clear_ralph_progress(project_path: String, prd_name: String) -> Result<(), String> {
    progress_tracker(&project_path, &prd_name).clear()
}

/// Get the prompt.md content
pub fn get_ralph_prompt(project_path: String, prd_name: String) -> Result<String, String> {
    prompt_builder(&project_path, &prd_name).read_prompt()
}

/// Update the prompt.md content
pub fn set_ralph_prompt(project_path: String, prd_name: String, content: String) -> Result<(), String> {
    prompt_builder(&project_path, &prd_name).write_prompt(&content)
}

// =============================================================================
// Assignment Commands (US-2.3: View Parallel Progress)
// =============================================================================

/// Get all assignments for a PRD (US-2.3: View Parallel Progress)
///
/// Returns the assignments file containing all current and historical assignments
/// for the specified PRD. This enables the UI to display:
/// - All current agent assignments
/// - Each assignment's agent ID, story, start time, estimated files
/// - Assignment status (active, completed, failed, released)
pub fn get_ralph_assignments(project_path: String, prd_name: String) -> Result<AssignmentsFile, String> {
    let manager = AssignmentsManager::new(&to_path_buf(&project_path), &prd_name);
    manager.read()
}

/// Get files currently in use by active agents (US-2.3: View Parallel Progress)
///
/// Returns a list of files that are currently being modified by active agents.
/// This is used to display visual indicators for potential conflict zones.
pub fn get_ralph_files_in_use(project_path: String, prd_name: String) -> Result<Vec<FileInUse>, String> {
    let manager = AssignmentsManager::new(&to_path_buf(&project_path), &prd_name);
    manager.get_files_in_use()
}

// =============================================================================
// US-4.1: Priority-Based Assignment - Manual Override Commands
// =============================================================================

/// Input for manually assigning a story to an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualAssignStoryInput {
    /// Agent identifier
    pub agent_id: String,
    /// Agent type (claude, opencode, cursor, codex)
    pub agent_type: String,
    /// Story ID to assign
    pub story_id: String,
    /// If true, releases any existing assignment and reassigns
    #[serde(default)]
    pub force: bool,
    /// Optional estimated files for conflict detection
    pub estimated_files: Option<Vec<String>>,
}

/// Manually assign a story to an agent (US-4.1: Priority-Based Assignment)
///
/// This provides a manual override for exceptional cases where a specific
/// story needs to be assigned regardless of priority order. Use cases include:
/// - Debugging a specific story issue
/// - Prioritizing urgent work that bypasses normal priority
/// - Reassigning work after an agent failure
///
/// If the story is already assigned and `force` is false, returns an error.
/// If `force` is true, releases the existing assignment first.
pub fn manual_assign_ralph_story(
    project_path: String,
    prd_name: String,
    input: ManualAssignStoryInput,
    broadcaster: Option<std::sync::Arc<crate::server::EventBroadcaster>>,
) -> Result<crate::ralph_loop::Assignment, String> {
    let manager = AssignmentsManager::new(&to_path_buf(&project_path), &prd_name);

    // Parse agent type
    let agent_type: AgentType = input
        .agent_type
        .parse()
        .map_err(|_| format!("Invalid agent type: {}", input.agent_type))?;

    // Use appropriate method based on whether files are provided
    let result = match input.estimated_files {
        Some(files) => manager.manual_assign_story_with_files(
            &input.agent_id,
            agent_type,
            &input.story_id,
            files,
            input.force,
        ),
        None => manager.manual_assign_story(&input.agent_id, agent_type, &input.story_id, input.force),
    };

    // Emit event on successful assignment (US-6.2: Real-Time Assignment Updates)
    if let Ok(assignment) = &result {
        if let Some(bc) = broadcaster {
            use crate::events::{AssignmentChangedPayload, AssignmentChangeType};
            let payload = AssignmentChangedPayload {
                change_type: AssignmentChangeType::Created,
                agent_id: input.agent_id.clone(),
                agent_type: input.agent_type.clone(),
                story_id: input.story_id.clone(),
                prd_name: prd_name.clone(),
                estimated_files: assignment.estimated_files.clone(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            };
            bc.broadcast(
                "assignment:changed",
                &payload,
            );
        }
    }

    result
}

/// Release a story assignment back to the pool (US-4.1: Priority-Based Assignment)
///
/// This allows manually releasing a story that was assigned to an agent,
/// making it available for automatic assignment to another agent.
pub fn release_ralph_story_assignment(
    project_path: String,
    prd_name: String,
    story_id: String,
    broadcaster: Option<std::sync::Arc<crate::server::EventBroadcaster>>,
) -> Result<(), String> {
    let manager = AssignmentsManager::new(&to_path_buf(&project_path), &prd_name);
    let result = manager.release_story(&story_id);

    // Emit event on successful release (US-6.2: Real-Time Assignment Updates)
    if result.is_ok() {
        if let Some(bc) = broadcaster {
            use crate::events::{AssignmentChangedPayload, AssignmentChangeType};
            let payload = AssignmentChangedPayload {
                change_type: AssignmentChangeType::Released,
                agent_id: String::new(),
                agent_type: String::new(),
                story_id: story_id.clone(),
                prd_name: prd_name.clone(),
                estimated_files: Vec::new(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            };
            bc.broadcast(
                "assignment:changed",
                &payload,
            );
        }
    }

    result
}

// =============================================================================
// US-3.3: Manual Learning Entry - CRUD commands for learnings
// =============================================================================

/// Get all learnings for a PRD (US-3.3: Manual Learning Entry)
///
/// Returns the learnings file containing all accumulated learnings for the specified PRD.
pub fn get_ralph_learnings(project_path: String, prd_name: String) -> Result<LearningsFile, String> {
    let manager = LearningsManager::new(&to_path_buf(&project_path), &prd_name);
    manager.read()
}

/// Input for adding a manual learning
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddLearningInput {
    /// Type/category of the learning
    pub learning_type: String,
    /// The learning content (description)
    pub content: String,
    /// Optional code example
    pub code_example: Option<String>,
    /// Optional associated story ID
    pub story_id: Option<String>,
}

/// Add a manual learning entry (US-3.3: Manual Learning Entry)
///
/// Allows users to add learnings with type, content, and optional code.
/// Manual learnings are integrated with agent-reported learnings.
pub fn add_ralph_learning(
    project_path: String,
    prd_name: String,
    input: AddLearningInput,
) -> Result<LearningEntry, String> {
    let manager = LearningsManager::new(&to_path_buf(&project_path), &prd_name);

    // Parse learning type
    let learning_type: LearningType = input
        .learning_type
        .parse()
        .unwrap_or(LearningType::General);

    // Get current iteration from learnings file (or default to 0 for manual entries)
    let file = manager.read()?;
    let iteration = file.total_iterations;

    // Create the learning entry
    let mut entry = LearningEntry::with_type(iteration, learning_type, &input.content).from_human();

    if let Some(story_id) = input.story_id {
        entry = entry.for_story(story_id);
    }

    if let Some(code) = input.code_example {
        entry = entry.with_code(code);
    }

    // Save the ID before adding (entry will be moved)
    let entry_id = entry.id.clone();

    // Add to file
    manager.add_learning(entry)?;

    // Return the created entry by reading it back
    let file = manager.read()?;
    file.entries
        .into_iter()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| "Failed to find created learning entry".to_string())
}

/// Input for updating an existing learning
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLearningInput {
    /// ID of the learning to update
    pub id: String,
    /// Updated type/category (optional)
    pub learning_type: Option<String>,
    /// Updated content (optional)
    pub content: Option<String>,
    /// Updated code example (optional, None to keep, Some("") to remove)
    pub code_example: Option<String>,
    /// Updated story ID (optional, None to keep, Some("") to remove)
    pub story_id: Option<String>,
}

/// Update an existing learning entry (US-3.3: Manual Learning Entry)
///
/// Edit capabilities for manual learnings.
pub fn update_ralph_learning(
    project_path: String,
    prd_name: String,
    input: UpdateLearningInput,
) -> Result<LearningEntry, String> {
    let manager = LearningsManager::new(&to_path_buf(&project_path), &prd_name);
    let mut file = manager.read()?;

    // Find the entry to update
    let entry_idx = file
        .entries
        .iter()
        .position(|e| e.id == input.id)
        .ok_or_else(|| format!("Learning with id '{}' not found", input.id))?;

    // Update fields
    if let Some(learning_type_str) = input.learning_type {
        file.entries[entry_idx].learning_type = learning_type_str
            .parse()
            .unwrap_or(LearningType::General);
    }

    if let Some(content) = input.content {
        file.entries[entry_idx].content = content;
    }

    if let Some(code) = input.code_example {
        file.entries[entry_idx].code_example = if code.is_empty() { None } else { Some(code) };
    }

    if let Some(story_id) = input.story_id {
        file.entries[entry_idx].story_id = if story_id.is_empty() {
            None
        } else {
            Some(story_id)
        };
    }

    // Update timestamp
    file.last_updated = chrono::Utc::now().to_rfc3339();

    manager.write(&file)?;

    Ok(file.entries[entry_idx].clone())
}

/// Delete a learning entry (US-3.3: Manual Learning Entry)
///
/// Delete capabilities for manual learnings.
pub fn delete_ralph_learning(
    project_path: String,
    prd_name: String,
    learning_id: String,
) -> Result<bool, String> {
    let manager = LearningsManager::new(&to_path_buf(&project_path), &prd_name);
    let mut file = manager.read()?;

    let initial_len = file.entries.len();
    file.entries.retain(|e| e.id != learning_id);

    if file.entries.len() == initial_len {
        return Ok(false); // Entry not found
    }

    file.last_updated = chrono::Utc::now().to_rfc3339();
    manager.write(&file)?;

    Ok(true)
}

/// Export learnings to markdown (US-6.3: Learning Analytics)
///
/// Exports all learnings in a PRD to a markdown-formatted string for documentation.
/// Includes learning type grouping, syntax highlighting, and metadata.
pub fn export_ralph_learnings(
    project_path: String,
    prd_name: String,
) -> Result<String, String> {
    let manager = LearningsManager::new(&to_path_buf(&project_path), &prd_name);
    manager.export_markdown()
}

/// Heartbeat interval in seconds (30 seconds)
const HEARTBEAT_INTERVAL_SECS: u64 = 30;

/// Start a Ralph loop execution
///
/// Config precedence (highest to lowest):
/// 1. Explicit values in StartRalphLoopRequest (from UI)
/// 2. PRD stored execution_config (from PRD JSON)
/// 3. Global RalphConfig (from config files)
/// 4. Defaults
pub async fn start_ralph_loop(
    request: StartRalphLoopRequest,
    ralph_state: &RalphLoopManagerState,
    agent_manager_state: &crate::AgentManagerState,
    config_state: &ConfigState,
    app_handle: std::sync::Arc<crate::server::EventBroadcaster>,
) -> Result<String, String> {
    // Read PRD to get stored execution config
    let project_path_buf = PathBuf::from(&request.project_path);
    let executor = PrdExecutor::new(&project_path_buf, &request.prd_name);
    let prd = executor.read_prd()?;
    let prd_config = prd.execution_config.as_ref();

    // Get global config
    let user_config = config_state.get_config().ok();

    // Log config sources
    log::info!(
        "[start_ralph_loop] Config sources: request={}, prd_stored={}, global_config={}",
        "explicit",
        if prd_config.is_some() { "present" } else { "absent" },
        if user_config.is_some() { "present" } else { "absent" }
    );

    // Parse agent type (request.agent_type is required, so it always takes precedence)
    // PRD stored config's agent_type could be used as default if request allowed it,
    // but currently request.agent_type is required so it always takes precedence.
    let agent_type = match request.agent_type.to_lowercase().as_str() {
        "claude" => AgentType::Claude,
        "opencode" => AgentType::Opencode,
        "cursor" => AgentType::Cursor,
        "codex" => AgentType::Codex,
        _ => return Err(format!("Unknown agent type: {}", request.agent_type)),
    };

    // Resolve config values using precedence: request > PRD stored config > global config > default
    let resolved_model = resolve_config_opt(
        request.model.clone(),
        prd_config.and_then(|c| c.model.clone()),
        user_config.as_ref().and_then(|c| c.execution.model.clone()),
    );

    let resolved_max_iterations = resolve_config(
        request.max_iterations,
        prd_config.and_then(|c| c.max_iterations),
        user_config.as_ref().map(|c| c.execution.max_iterations as u32),
        50,
    );

    let resolved_max_cost = resolve_config_opt(
        request.max_cost,
        prd_config.and_then(|c| c.max_cost),
        None, // No global config for max_cost
    );

    let resolved_run_tests = resolve_config(
        request.run_tests,
        prd_config.and_then(|c| c.run_tests),
        user_config.as_ref().map(|c| c.validation.run_tests),
        true,
    );

    let resolved_run_lint = resolve_config(
        request.run_lint,
        prd_config.and_then(|c| c.run_lint),
        user_config.as_ref().map(|c| c.validation.run_lint),
        true,
    );

    let resolved_use_worktree = resolve_config(
        request.use_worktree,
        prd_config.and_then(|c| c.use_worktree),
        None, // No global config for use_worktree
        true,
    );

    let resolved_agent_timeout = resolve_config(
        request.agent_timeout_secs,
        prd_config.and_then(|c| c.agent_timeout_secs),
        None, // No global config for agent_timeout
        0,
    );

    let resolved_template = resolve_config_opt(
        request.template_name.clone(),
        prd_config.and_then(|c| c.template_name.clone()),
        None, // No global config for template
    );

    log::info!(
        "[start_ralph_loop] Resolved config: agent={:?}, model={:?}, max_iterations={}, max_cost={:?}, run_tests={}, run_lint={}, use_worktree={}, agent_timeout={}",
        agent_type,
        resolved_model,
        resolved_max_iterations,
        resolved_max_cost,
        resolved_run_tests,
        resolved_run_lint,
        resolved_use_worktree,
        resolved_agent_timeout
    );

    // Get fallback config from user settings

    let fallback_config = user_config.as_ref().and_then(|config| {
        if config.fallback.enabled {
            // Use fallback_chain from config if available, otherwise build from legacy fallback_agent
            #[allow(deprecated)]
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
                    // Legacy behavior: build chain from primary + deprecated fallback_agent field
                    let mut chain = vec![agent_type];
                    #[allow(deprecated)]
                    if let Some(ref fallback_str) = config.fallback.fallback_agent {
                        log::warn!(
                            "[start_ralph_loop] DEPRECATED: Config uses 'fallback_agent' field. \
                             Migrating to 'fallback_chain'. Please update your config to use \
                             'fallback_chain' instead."
                        );
                        let legacy_fallback = match fallback_str.to_lowercase().as_str() {
                            "claude" => Some(AgentType::Claude),
                            "opencode" => Some(AgentType::Opencode),
                            "cursor" => Some(AgentType::Cursor),
                            "codex" => Some(AgentType::Codex),
                            _ => None,
                        };
                        if let Some(agent) = legacy_fallback {
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

    // Build RalphLoopConfig using resolved values (respecting config precedence)
    let config = RalphLoopConfig {
        project_path: PathBuf::from(&request.project_path),
        agent_type,
        model: resolved_model,
        max_iterations: resolved_max_iterations,
        run_tests: resolved_run_tests,
        run_lint: resolved_run_lint,
        branch: request.branch,
        completion_promise: request.completion_promise,
        max_cost: resolved_max_cost,
        use_worktree: resolved_use_worktree,
        retry_config: RetryConfig::default(),
        error_strategy,  // Use config value instead of hardcoded default
        fallback_config,
        agent_timeout_secs: resolved_agent_timeout,
        prd_name: request.prd_name.clone(),
        template_name: resolved_template,
        merge_strategy: MergeStrategy::default(),
        merge_interval: 0,
        conflict_resolution: ConflictResolution::default(),
        merge_target_branch: "main".to_string(),
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
            project_path: Some(request.project_path.clone()),
        });
    }

    // Update PRD metadata with current execution ID immediately so frontend can recover
    // Note: We already read the PRD above for config resolution
    use crate::ralph_loop::PrdMetadata;
    let mut prd = prd; // Move from immutable to mutable
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
            last_worktree_path: None,
        });
    }

    orchestrator.initialize(&prd)?;

    // Save initial execution state for crash recovery (file-based)
    {
        let initial_state = ExecutionStateSnapshot {
            execution_id: execution_id.clone(),
            state: serde_json::to_string(&RalphLoopExecutionState::Idle).unwrap_or_default(),
            last_heartbeat: chrono::Utc::now().to_rfc3339(),
        };
        iteration_storage::save_execution_state(&project_path_buf, &initial_state)
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

    // Spawn the loop in background
    log::info!("[RalphLoop] Spawning background task for execution {}", execution_id);

    // Clone for heartbeat task
    let execution_id_for_heartbeat = execution_id.clone();
    let project_path_for_heartbeat = project_path_buf.clone();
    let orchestrator_arc_for_heartbeat = orchestrator_arc.clone();

    // Spawn heartbeat task (uses file storage)
    tokio::spawn(async move {
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

            // Update heartbeat in file storage
            let heartbeat = chrono::Utc::now().to_rfc3339();
            if let Err(e) = iteration_storage::update_heartbeat(&project_path_for_heartbeat, &execution_id_for_heartbeat, &heartbeat) {
                log::warn!("[Heartbeat] Failed to update heartbeat for {}: {}", execution_id_for_heartbeat, e);
            } else {
                log::debug!("[Heartbeat] Updated heartbeat for {}", execution_id_for_heartbeat);
            }
        }
    });

    // Clone for main loop task
    let execution_id_for_loop = execution_id.clone();
    let project_path_for_loop = project_path_buf.clone();
    let prd_name_for_loop = request.prd_name.clone();
    let app_handle_for_loop = app_handle.clone();

    tokio::spawn(async move {
        log::info!("[RalphLoop] Background task started for {}", execution_id_for_loop);

        // Lock orchestrator, then run with the shared agent manager
        log::debug!("[RalphLoop] Acquiring orchestrator lock...");
        let mut orchestrator = orchestrator_arc.lock().await;
        log::debug!("[RalphLoop] Locks acquired, starting run()...");

        // Use the main app's agent manager (sync mutex, but operations are quick)
        // We lock/unlock for each operation within run() rather than holding lock
        let result = orchestrator.run(agent_manager_arc).await;

        // Clean up execution state from file storage
        if let Err(e) = iteration_storage::delete_execution_state(&project_path_for_loop, &execution_id_for_loop) {
            log::warn!("[RalphLoop] Failed to delete execution state for {}: {}", execution_id_for_loop, e);
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
                        app_handle_for_loop.broadcast("ralph:loop_completed", serde_json::to_value(&payload).unwrap_or_default());

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
pub async fn stop_ralph_loop(
    execution_id: String,
    ralph_state: &RalphLoopManagerState,
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
pub async fn get_ralph_loop_state(
    execution_id: String,
    ralph_state: &RalphLoopManagerState,
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
pub async fn get_ralph_loop_metrics(
    execution_id: String,
    ralph_state: &RalphLoopManagerState,
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
pub fn list_ralph_loop_executions(
    ralph_state: &RalphLoopManagerState,
) -> Result<Vec<String>, String> {
    let executions = ralph_state.executions.lock()
        .map_err(|e| format!("Executions lock error: {}", e))?;
    Ok(executions.keys().cloned().collect())
}

/// Info about an active execution
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionInfo {
    pub execution_id: String,
    pub project_path: Option<String>,
    pub state: Option<String>,
}

/// List all active Ralph loop executions with details
pub fn list_ralph_loop_executions_with_details(
    ralph_state: &RalphLoopManagerState,
) -> Result<Vec<ExecutionInfo>, String> {
    let executions = ralph_state.executions.lock()
        .map_err(|e| format!("Executions lock error: {}", e))?;
    let snapshots = ralph_state.snapshots.lock()
        .map_err(|e| format!("Snapshots lock error: {}", e))?;

    Ok(executions.keys().map(|id| {
        let snapshot = snapshots.get(id);
        ExecutionInfo {
            execution_id: id.clone(),
            project_path: snapshot.and_then(|s| s.project_path.clone()),
            state: snapshot.and_then(|s| s.state.as_ref().map(|st| format!("{:?}", st))),
        }
    }).collect())
}

/// Get current agent ID for a Ralph loop execution (for terminal connection)
pub async fn get_ralph_loop_current_agent(
    execution_id: String,
    ralph_state: &RalphLoopManagerState,
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
pub async fn get_ralph_loop_worktree_path(
    execution_id: String,
    ralph_state: &RalphLoopManagerState,
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

/// Convert a file-based PRD (from .ralph-ui/prds/) to Ralph loop format
///
/// This reads a markdown PRD file and its associated structure JSON (if any),
/// then creates the Ralph loop files (prd.json, progress.txt, config.yaml, prompt.md).
/// Execution settings from the request are stored in the PRD JSON for future executions.
pub fn convert_prd_file_to_ralph(
    request: ConvertPrdFileToRalphRequest,
) -> Result<RalphPrd, String> {
    use crate::ralph_loop::{LoopConfig, PrdExecutionConfig, ProjectConfig};
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

    // Create execution config from request parameters
    let execution_config = PrdExecutionConfig {
        agent_type: request.agent_type.clone(),
        model: request.model.clone(),
        max_iterations: request.max_iterations,
        max_cost: request.max_cost,
        run_tests: request.run_tests,
        run_lint: request.run_lint,
        use_worktree: request.use_worktree,
        template_name: request.template_name.clone(),
        ..Default::default()
    };

    // Validate the execution config
    execution_config.validate()?;

    // Log config storage
    if execution_config.has_any_fields() {
        log::info!(
            "[convert_prd_file_to_ralph] PRD '{}' storing execution config: agent={:?}, model={:?}, max_iterations={:?}",
            request.prd_name,
            execution_config.agent_type,
            execution_config.model,
            execution_config.max_iterations
        );
    }

    // Create Ralph PRD with stored execution config
    let mut ralph_prd = RalphPrd::new(&title, &request.branch);
    ralph_prd.execution_config = if execution_config.has_any_fields() {
        Some(execution_config)
    } else {
        None
    };

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
        // Parse markdown to extract tasks with acceptance criteria
        let stories = parse_markdown_stories_with_acceptance(&content);

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
pub fn has_ralph_files(project_path: String) -> bool {
    let prds_dir = prds_dir(&project_path);

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
pub fn get_ralph_files(project_path: String) -> Result<RalphFiles, String> {
    let prds_dir = prds_dir(&project_path);

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
    let config_path = crate::utils::config_path(&project_path);

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
pub fn get_ralph_config(project_path: String) -> Result<RalphConfig, String> {
    use crate::ralph_loop::ConfigManager;

    let config_manager = ConfigManager::new(&to_path_buf(&project_path));
    config_manager.read()
}

/// Set Ralph config for a project
pub fn set_ralph_config(project_path: String, config: RalphConfig) -> Result<(), String> {
    use crate::ralph_loop::ConfigManager;

    let config_manager = ConfigManager::new(&to_path_buf(&project_path));
    config_manager.write(&config)
}

/// Initialize Ralph config with defaults
pub fn init_ralph_config(project_path: String) -> Result<RalphConfig, String> {
    use crate::ralph_loop::ConfigManager;

    let ralph_ui_path = ralph_ui_dir(&project_path);
    std::fs::create_dir_all(&ralph_ui_path)
        .map_err(|e| format!("Failed to create .ralph-ui directory: {}", e))?;

    let config_manager = ConfigManager::new(&to_path_buf(&project_path));
    config_manager.initialize()
}

/// Update specific Ralph config fields
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

    let config_manager = ConfigManager::new(&to_path_buf(&project_path));

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

use crate::file_storage::iterations as iteration_storage;
use crate::file_storage::iterations::IterationStats;
use crate::ralph_loop::{ExecutionStateSnapshot, IterationOutcome, IterationRecord};

/// Get iteration history for an execution
pub fn get_ralph_iteration_history(
    project_path: String,
    execution_id: String,
) -> Result<Vec<IterationRecord>, String> {
    let path = as_path(&project_path);
    iteration_storage::get_iterations_for_execution(path, &execution_id)
        .map_err(|e| format!("Failed to get iteration history: {}", e))
}

/// Get iteration statistics for an execution
pub fn get_ralph_iteration_stats(
    project_path: String,
    execution_id: String,
) -> Result<IterationStats, String> {
    let path = as_path(&project_path);
    iteration_storage::get_execution_stats(path, &execution_id)
        .map_err(|e| format!("Failed to get iteration stats: {}", e))
}

/// Get all iteration history with optional filters
pub fn get_all_ralph_iterations(
    project_path: String,
    execution_id: Option<String>,
    outcome_filter: Option<String>,
    limit: Option<u32>,
) -> Result<Vec<IterationRecord>, String> {
    let path = as_path(&project_path);

    let outcome = outcome_filter.and_then(|s| match s.as_str() {
        "success" => Some(IterationOutcome::Success),
        "failed" => Some(IterationOutcome::Failed),
        "skipped" => Some(IterationOutcome::Skipped),
        "interrupted" => Some(IterationOutcome::Interrupted),
        _ => None,
    });

    iteration_storage::get_iteration_history(path, execution_id.as_deref(), outcome, limit)
        .map_err(|e| format!("Failed to get iteration history: {}", e))
}

/// Save an iteration record (used by orchestrator)
pub fn save_ralph_iteration(project_path: String, record: IterationRecord) -> Result<(), String> {
    let path = as_path(&project_path);
    iteration_storage::insert_iteration(path, &record)
        .map_err(|e| format!("Failed to save iteration: {}", e))
}

/// Update an iteration record (used by orchestrator on completion)
pub fn update_ralph_iteration(
    project_path: String,
    execution_id: String,
    id: String,
    outcome: String,
    duration_secs: f64,
    completed_at: String,
    error_message: Option<String>,
) -> Result<(), String> {
    let path = as_path(&project_path);

    let outcome_enum = match outcome.as_str() {
        "success" => IterationOutcome::Success,
        "failed" => IterationOutcome::Failed,
        "skipped" => IterationOutcome::Skipped,
        "interrupted" => IterationOutcome::Interrupted,
        _ => return Err(format!("Invalid outcome: {}", outcome)),
    };

    iteration_storage::update_iteration(
        path,
        &execution_id,
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
pub fn save_ralph_execution_state(
    project_path: String,
    snapshot: ExecutionStateSnapshot,
) -> Result<(), String> {
    let path = as_path(&project_path);
    iteration_storage::save_execution_state(path, &snapshot)
        .map_err(|e| format!("Failed to save execution state: {}", e))
}

/// Update heartbeat for an execution
pub fn update_ralph_heartbeat(project_path: String, execution_id: String) -> Result<(), String> {
    let path = as_path(&project_path);
    let heartbeat = chrono::Utc::now().to_rfc3339();
    iteration_storage::update_heartbeat(path, &execution_id, &heartbeat)
        .map_err(|e| format!("Failed to update heartbeat: {}", e))?;
    Ok(())
}

/// Get execution state snapshot
pub fn get_ralph_execution_state(
    project_path: String,
    execution_id: String,
) -> Result<Option<ExecutionStateSnapshot>, String> {
    let path = as_path(&project_path);
    iteration_storage::get_execution_state(path, &execution_id)
        .map_err(|e| format!("Failed to get execution state: {}", e))
}

/// Check for stale executions (crash recovery)
pub fn check_stale_ralph_executions(
    project_path: String,
    threshold_secs: Option<i64>,
) -> Result<Vec<ExecutionStateSnapshot>, String> {
    let path = as_path(&project_path);
    let threshold = threshold_secs.unwrap_or(120); // Default 2 minutes
    iteration_storage::get_stale_executions(path, threshold)
        .map_err(|e| format!("Failed to check stale executions: {}", e))
}

/// Mark stale iterations as interrupted (crash recovery)
pub fn recover_stale_ralph_iterations(
    project_path: String,
    execution_id: String,
) -> Result<u32, String> {
    let path = as_path(&project_path);
    let completed_at = chrono::Utc::now().to_rfc3339();

    let count = iteration_storage::mark_interrupted_iterations(path, &execution_id, &completed_at)
        .map_err(|e| format!("Failed to recover iterations: {}", e))?;

    // Clean up execution state
    iteration_storage::delete_execution_state(path, &execution_id)
        .map_err(|e| format!("Failed to delete execution state: {}", e))?;

    Ok(count as u32)
}

/// Delete iteration history for an execution (cleanup)
pub fn delete_ralph_iteration_history(
    project_path: String,
    execution_id: String,
) -> Result<u32, String> {
    let path = as_path(&project_path);

    let count = iteration_storage::delete_iterations_for_execution(path, &execution_id)
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
/// - Iteration history (from file storage)
pub async fn get_ralph_loop_snapshot(
    project_path: String,
    execution_id: String,
    ralph_state: &RalphLoopManagerState,
) -> Result<RalphLoopSnapshot, String> {
    let path = as_path(&project_path);

    // Get in-memory snapshot
    let snapshot = ralph_state.get_snapshot(&execution_id);

    // Get iteration history from file storage
    let iteration_history =
        iteration_storage::get_iterations_for_execution(path, &execution_id).unwrap_or_default();

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
            let executions = ralph_state
                .executions
                .lock()
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
/// File-based iterations are stored per-execution, so this removes old execution files
pub fn cleanup_ralph_iteration_history(
    project_path: String,
    days_to_keep: Option<i64>,
) -> Result<u32, String> {
    let path = as_path(&project_path);
    let days = days_to_keep.unwrap_or(30); // Default: keep 30 days
    let threshold_time = chrono::Utc::now() - chrono::Duration::days(days);

    let iterations_dir = path.join(".ralph-ui").join("iterations");
    if !iterations_dir.exists() {
        return Ok(0);
    }

    let mut count = 0u32;
    if let Ok(entries) = std::fs::read_dir(&iterations_dir) {
        for entry in entries.flatten() {
            let file_path = entry.path();
            if file_path.extension().map_or(true, |ext| ext != "json") {
                continue;
            }

            // Check file modification time
            if let Ok(metadata) = file_path.metadata() {
                if let Ok(modified) = metadata.modified() {
                    let modified_time: chrono::DateTime<chrono::Utc> = modified.into();
                    if modified_time < threshold_time {
                        if std::fs::remove_file(&file_path).is_ok() {
                            count += 1;
                        }
                    }
                }
            }
        }
    }

    log::info!(
        "[RalphLoop] Cleaned up {} old iteration files (older than {} days)",
        count,
        days
    );
    Ok(count)
}

// ============================================================================
// Helper Functions for Markdown Parsing
// ============================================================================

/// Parse markdown content to extract user stories with their acceptance criteria.
///
/// This function handles two markdown formats:
/// 1. User Story format with "#### US-XXX: Title" headers followed by "**Acceptance Criteria**:" sections
/// 2. Generic headers as fallback
///
/// Returns a vector of RalphStory objects with proper acceptance criteria extracted.
/// Check if a line is a user story header (markdown or bold format)
/// Returns (is_story, id, title) if matched
fn parse_story_header(line: &str) -> Option<(String, String)> {
    let trimmed = line.trim();

    // Pattern 1: Markdown headers like "#### US-1.1: Title" or "### US-1.1: Title"
    if trimmed.contains("#### US-") || trimmed.contains("### US-") ||
       trimmed.contains("#### T-") || trimmed.contains("### T-") {
        let header_marker = if trimmed.contains("#### ") { "#### " } else { "### " };
        if let Some(start_idx) = trimmed.find(header_marker) {
            let text = &trimmed[start_idx + header_marker.len()..];
            return extract_id_and_title(text);
        }
    }

    // Pattern 2: Bold format like "**US-1.1: Title**" or "**US-1.1:** Title"
    // This handles both "**US-1.1: Title**" and "**US-1.1:** Title" formats
    if trimmed.starts_with("**US-") || trimmed.starts_with("**T-") {
        // Remove leading **
        let without_prefix = trimmed.trim_start_matches("**");

        // Check for ":**" pattern FIRST (more specific)
        // This handles "**US-1.1:** Title" where only the ID is bold
        // Note: ":**" contains "**", so we must check this pattern first
        if let Some(colon_star_pos) = without_prefix.find(":**") {
            let id = without_prefix[..colon_star_pos].trim().to_string();
            let title = without_prefix[colon_star_pos + 3..].trim().to_string();
            if !id.is_empty() && !title.is_empty() {
                return Some((id, title));
            } else if !id.is_empty() {
                return Some((id.clone(), id));
            }
        } else if let Some(end_bold_pos) = without_prefix.find("**") {
            // Case: "**US-1.1: Title**" - ID and title both in bold
            let inside_bold = &without_prefix[..end_bold_pos];
            return extract_id_and_title(inside_bold);
        }
    }

    None
}

/// Extract ID and title from a string like "US-1.1: Some Title"
fn extract_id_and_title(text: &str) -> Option<(String, String)> {
    if let Some((id_part, title_part)) = text.split_once(':') {
        let id = id_part.trim().to_string();
        let title = title_part.trim().trim_end_matches("**").trim().to_string();
        if !id.is_empty() && !title.is_empty() {
            return Some((id, title));
        } else if !id.is_empty() {
            return Some((id.clone(), id));
        }
    } else {
        // Fallback: first word is ID, rest is title
        let parts: Vec<&str> = text.split_whitespace().collect();
        if !parts.is_empty() {
            return Some((parts[0].to_string(), text.to_string()));
        }
    }
    None
}

/// Check if a line is any kind of user story header (for stopping condition)
fn is_story_header(line: &str) -> bool {
    parse_story_header(line).is_some()
}

fn parse_markdown_stories_with_acceptance(content: &str) -> Vec<RalphStory> {
    let lines: Vec<&str> = content.lines().collect();
    let mut stories = Vec::new();

    // First pass: Look for explicit US patterns with acceptance criteria
    // Now supports both markdown headers (#### US-1.1:) and bold format (**US-1.1:**)
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];

        // Try to parse as a story header
        if let Some((id, title)) = parse_story_header(line) {
            // Now look for "**Acceptance Criteria**:" or "Acceptance Criteria:" section
            let mut acceptance_lines = Vec::new();
            let mut j = i + 1;
            let mut found_acceptance_section = false;

            while j < lines.len() {
                let current_line = lines[j];

                // Stop at next user story header (any format) or major section
                if is_story_header(current_line) || current_line.starts_with("## ") {
                    break;
                }

                // Check for acceptance criteria section header
                let lower = current_line.to_lowercase();
                if lower.contains("acceptance criteria") {
                    found_acceptance_section = true;
                    j += 1;
                    continue;
                }

                // If we're in the acceptance section, collect bullet points
                if found_acceptance_section {
                    let trimmed = current_line.trim();

                    // Stop at next section header within the story (bold headers that aren't acceptance)
                    if trimmed.starts_with("**") && !lower.contains("acceptance") {
                        // But don't stop if this is another story header (handled above)
                        if !trimmed.starts_with("**US-") && !trimmed.starts_with("**T-") {
                            break;
                        }
                    }

                    // Collect bullet points (lines starting with - or *)
                    if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
                        // Remove the bullet and checkbox markers like "[ ]"
                        let criterion = trimmed
                            .trim_start_matches("- ")
                            .trim_start_matches("* ")
                            .trim_start_matches("[ ] ")
                            .trim_start_matches("[x] ")
                            .trim_start_matches("[X] ")
                            .trim();
                        if !criterion.is_empty() {
                            acceptance_lines.push(criterion.to_string());
                        }
                    }
                }

                j += 1;
            }

            // Create the acceptance criteria string
            let acceptance = if acceptance_lines.is_empty() {
                // No acceptance criteria found - use a placeholder that's better than just the title
                format!("Implement: {}", title)
            } else {
                acceptance_lines.iter()
                    .map(|s| format!("- {}", s))
                    .collect::<Vec<_>>()
                    .join("\n")
            };

            stories.push(RalphStory::new(&id, &title, &acceptance));
            i = j;
            continue;
        }

        i += 1;
    }

    // Second pass: Fallback to generic headers if no explicit stories found
    if stories.is_empty() {
        let mut task_index = 0;
        let skip_headers = [
            "overview", "requirements", "tasks", "summary", "description",
            "background", "phase", "feature", "metrics", "notes", "questions",
            "table", "dependency", "migration", "technical", "architecture",
            "files", "implementation", "open", "success", "deferred"
        ];

        for line in lines.iter() {
            if line.starts_with("## ") || line.starts_with("### ") {
                let task_title = line.trim_start_matches('#').trim();
                let lower_title = task_title.to_lowercase();

                // Skip common section headers
                if !skip_headers.iter().any(|s| lower_title.starts_with(s)) {
                    stories.push(RalphStory::new(
                        &format!("task-{}", task_index + 1),
                        task_title,
                        &format!("Implement: {}", task_title),
                    ));
                    task_index += 1;
                }
            }
        }
    }

    // Deduplicate stories by ID (keep only the first occurrence of each ID)
    let mut seen_ids = std::collections::HashSet::new();
    stories.retain(|story| seen_ids.insert(story.id.clone()));

    stories
}

// ============================================================================
// Acceptance Criteria Regeneration
// ============================================================================

/// Request to regenerate acceptance criteria for an existing Ralph PRD
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegenerateAcceptanceRequest {
    /// Project path
    pub project_path: String,
    /// PRD name (without .json extension)
    pub prd_name: String,
}

/// Regenerate acceptance criteria for stories in a Ralph PRD.
///
/// This reads the PRD markdown file and re-extracts acceptance criteria for each story,
/// updating the PRD JSON while preserving pass/fail status.
pub fn regenerate_ralph_prd_acceptance(
    request: RegenerateAcceptanceRequest,
) -> Result<RalphPrd, String> {
    use std::fs;

    let project_path = PathBuf::from(&request.project_path);
    let prds_dir = project_path.join(".ralph-ui").join("prds");

    // Read the existing PRD JSON
    let executor = PrdExecutor::new(&project_path, &request.prd_name);
    let mut prd = executor.read_prd()?;

    // Read the markdown file for content
    let md_path = prds_dir.join(format!("{}.md", request.prd_name));
    let content = if md_path.exists() {
        fs::read_to_string(&md_path)
            .map_err(|e| format!("Failed to read PRD markdown file: {}", e))?
    } else {
        // No markdown file - use PRD description as context
        prd.description.clone().unwrap_or_default()
    };

    // Parse the markdown to extract stories with acceptance criteria
    let parsed_stories = parse_markdown_stories_with_acceptance(&content);

    // Create a map of parsed stories by ID for quick lookup
    let parsed_map: std::collections::HashMap<String, &RalphStory> = parsed_stories
        .iter()
        .map(|s| (s.id.clone(), s))
        .collect();

    // Update each story's acceptance criteria while preserving pass/fail status
    for story in prd.stories.iter_mut() {
        if let Some(parsed) = parsed_map.get(&story.id) {
            // Only update if the parsed acceptance is different and better
            let current_is_just_title = story.acceptance == story.title ||
                                        story.acceptance.is_empty();
            let parsed_is_better = !parsed.acceptance.is_empty() &&
                                   parsed.acceptance != parsed.title &&
                                   !parsed.acceptance.starts_with("Implement:");

            if current_is_just_title || parsed_is_better {
                story.acceptance = parsed.acceptance.clone();
            }
        }
    }

    // Write the updated PRD back
    executor.write_prd(&prd)?;

    log::info!(
        "[RalphLoop] Regenerated acceptance criteria for PRD '{}' ({} stories)",
        request.prd_name,
        prd.stories.len()
    );

    Ok(prd)
}

// ============================================================================
// AI-Powered Story Regeneration
// ============================================================================

/// Request to regenerate stories using AI for an existing Ralph PRD
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegenerateStoriesRequest {
    /// Project path
    pub project_path: String,
    /// PRD name (without .json extension)
    pub prd_name: String,
    /// Agent type to use for extraction (claude, opencode, etc.)
    pub agent_type: String,
    /// Optional model override
    pub model: Option<String>,
}

/// Story extracted by AI
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedStory {
    pub id: String,
    pub title: String,
    pub acceptance_criteria: Vec<String>,
}

/// Regenerate stories using AI to properly extract user stories from PRD markdown.
///
/// This is useful when the initial story extraction created generic tasks like
/// "Problem Statement", "Solution" instead of proper US-X.X user stories.
pub async fn regenerate_ralph_prd_stories(
    app_handle: std::sync::Arc<crate::server::EventBroadcaster>,
    request: RegenerateStoriesRequest,
) -> Result<RalphPrd, String> {
    use crate::commands::prd_chat::agent_executor::{execute_chat_agent, BroadcastEmitter};
    use crate::models::AgentType;
    use std::fs;

    let project_path = PathBuf::from(&request.project_path);
    let prds_dir = project_path.join(".ralph-ui").join("prds");

    // Read the existing PRD JSON
    let executor = PrdExecutor::new(&project_path, &request.prd_name);
    let mut prd = executor.read_prd()?;

    // Read the markdown file
    let md_path = prds_dir.join(format!("{}.md", request.prd_name));
    let content = if md_path.exists() {
        fs::read_to_string(&md_path)
            .map_err(|e| format!("Failed to read PRD markdown file: {}", e))?
    } else {
        return Err("No PRD markdown file found. Cannot regenerate stories without source content.".to_string());
    };

    // Parse agent type
    let agent_type: AgentType = request.agent_type.parse()
        .map_err(|_| format!("Invalid agent type: {}", request.agent_type))?;

    // Build prompt for AI extraction
    let prompt = build_story_extraction_prompt(&content);

    // Execute AI agent to extract stories
    let emitter = BroadcastEmitter::new(app_handle.clone());
    let session_id = format!("story-regen-{}", uuid::Uuid::new_v4());

    let response = execute_chat_agent(
        &emitter,
        &session_id,
        agent_type,
        &prompt,
        Some(&request.project_path),
    ).await?;

    // Parse the AI response to extract stories
    let extracted_stories = parse_ai_story_response(&response)?;

    if extracted_stories.is_empty() {
        return Err("AI did not extract any valid user stories. The PRD may need manual formatting.".to_string());
    }

    // Replace stories in the PRD, preserving any pass/fail status for matching IDs
    let old_status: std::collections::HashMap<String, bool> = prd.stories
        .iter()
        .map(|s| (s.id.clone(), s.passes))
        .collect();

    prd.stories = extracted_stories.into_iter().map(|es| {
        let passes = old_status.get(&es.id).copied().unwrap_or(false);
        let acceptance = if es.acceptance_criteria.is_empty() {
            format!("Implement: {}", es.title)
        } else {
            es.acceptance_criteria.iter()
                .map(|c| format!("- {}", c))
                .collect::<Vec<_>>()
                .join("\n")
        };
        let mut story = RalphStory::new(&es.id, &es.title, &acceptance);
        story.passes = passes;
        story
    }).collect();

    // Write the updated PRD
    executor.write_prd(&prd)?;

    log::info!(
        "[RalphLoop] Regenerated {} stories using AI for PRD '{}'",
        prd.stories.len(),
        request.prd_name
    );

    Ok(prd)
}

/// Build prompt for AI to extract user stories from PRD content
fn build_story_extraction_prompt(prd_content: &str) -> String {
    format!(r#"Analyze this PRD document and extract all user stories in a structured format.

## PRD Content:
{}

## Instructions:
1. Identify all user stories, features, or tasks that should be implemented
2. Assign each a unique ID in the format US-X.X (e.g., US-1.1, US-1.2, US-2.1)
3. Extract or create clear acceptance criteria for each story

## Output Format:
Return ONLY a JSON array with no additional text. Each story should have:
- "id": string (US-X.X format)
- "title": string (brief, actionable title)
- "acceptance_criteria": array of strings

Example:
```json
[
  {{
    "id": "US-1.1",
    "title": "User Login",
    "acceptance_criteria": [
      "User can enter email and password",
      "Form validates inputs before submission",
      "Shows error message on invalid credentials"
    ]
  }},
  {{
    "id": "US-1.2",
    "title": "User Registration",
    "acceptance_criteria": [
      "User can create account with email",
      "Password must meet security requirements"
    ]
  }}
]
```

Extract the stories now and return ONLY the JSON array:"#, prd_content)
}

/// Parse AI response to extract stories
fn parse_ai_story_response(response: &str) -> Result<Vec<ExtractedStory>, String> {
    // Try to find JSON array in the response
    let json_start = response.find('[');
    let json_end = response.rfind(']');

    match (json_start, json_end) {
        (Some(start), Some(end)) if start < end => {
            let json_str = &response[start..=end];
            serde_json::from_str::<Vec<ExtractedStory>>(json_str)
                .map_err(|e| format!("Failed to parse AI response as JSON: {}", e))
        }
        _ => {
            // Try parsing the whole response as JSON
            serde_json::from_str::<Vec<ExtractedStory>>(response.trim())
                .map_err(|e| format!("No valid JSON array found in AI response: {}", e))
        }
    }
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

/// Log when a Ralph loop completes successfully
/// Note: Desktop notifications are handled by the frontend via Web Notifications API
fn send_loop_completion_notification(
    _app_handle: &std::sync::Arc<crate::server::EventBroadcaster>,
    prd_name: &str,
    total_iterations: u32,
    completed_stories: u32,
    duration_secs: f64,
) {
    // Format the notification body
    let duration_str = format_duration(duration_secs);
    log::info!(
        "[RalphLoop] Loop completed: {} - {} stories completed in {} iterations, Duration: {}",
        prd_name, completed_stories, total_iterations, duration_str
    );
}

/// Send a desktop notification when a Ralph loop encounters an error
fn send_error_notification(
    app_handle: &std::sync::Arc<crate::server::EventBroadcaster>,
    execution_id: &str,
    prd_name: &str,
    error_type: crate::events::RalphLoopErrorType,
    message: &str,
    iteration: u32,
    stories_remaining: Option<u32>,
    total_stories: Option<u32>,
) {

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

    app_handle.broadcast("ralph:loop_error", serde_json::to_value(&payload).unwrap_or_default());

    // Log the error (desktop notification is handled by frontend via Web Notifications API)
    log::warn!("[RalphLoop] Loop error: {} - {} - {}", error_label, prd_name, body);
}

/// Send a test notification to verify notification settings (US-005)
/// In server mode, this broadcasts an event for the frontend to show a Web Notification
pub fn send_test_notification(app_handle: std::sync::Arc<crate::server::EventBroadcaster>) -> Result<(), String> {
    // Broadcast notification event for frontend to display via Web Notifications API
    app_handle.broadcast(
        "notification:test",
        serde_json::json!({
            "title": "Ralph UI Test Notification",
            "body": "If you can see this, notifications are working! Ralph says hi.",
        }),
    );
    log::info!("[Notification] Test notification event broadcast");
    Ok(())
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    // -------------------------------------------------------------------------
    // parse_story_header tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_parse_story_header_markdown_h4() {
        let line = "#### US-1.1: User Login Feature";
        let result = parse_story_header(line);
        assert!(result.is_some());
        let (id, title) = result.unwrap();
        assert_eq!(id, "US-1.1");
        assert_eq!(title, "User Login Feature");
    }

    #[test]
    fn test_parse_story_header_markdown_h3() {
        let line = "### US-2.3: Dashboard Analytics";
        let result = parse_story_header(line);
        assert!(result.is_some());
        let (id, title) = result.unwrap();
        assert_eq!(id, "US-2.3");
        assert_eq!(title, "Dashboard Analytics");
    }

    #[test]
    fn test_parse_story_header_bold_format() {
        let line = "**US-1.1: User Login Feature**";
        let result = parse_story_header(line);
        assert!(result.is_some());
        let (id, title) = result.unwrap();
        assert_eq!(id, "US-1.1");
        assert_eq!(title, "User Login Feature");
    }

    #[test]
    fn test_parse_story_header_bold_colon_outside() {
        // Format where colon is outside the bold: **US-1.1:** Title
        let line = "**US-1.1:** User Login Feature";
        let result = parse_story_header(line);
        assert!(result.is_some());
        let (id, title) = result.unwrap();
        assert_eq!(id, "US-1.1");
        assert_eq!(title, "User Login Feature");
    }

    #[test]
    fn test_parse_story_header_task_format() {
        let line = "#### T-3.2: Implement API Endpoint";
        let result = parse_story_header(line);
        assert!(result.is_some());
        let (id, title) = result.unwrap();
        assert_eq!(id, "T-3.2");
        assert_eq!(title, "Implement API Endpoint");
    }

    #[test]
    fn test_parse_story_header_bold_task_format() {
        let line = "**T-3.2: Implement API Endpoint**";
        let result = parse_story_header(line);
        assert!(result.is_some());
        let (id, title) = result.unwrap();
        assert_eq!(id, "T-3.2");
        assert_eq!(title, "Implement API Endpoint");
    }

    #[test]
    fn test_parse_story_header_non_story_line() {
        let line = "This is just a regular line of text";
        let result = parse_story_header(line);
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_story_header_section_header() {
        let line = "## Overview";
        let result = parse_story_header(line);
        assert!(result.is_none());
    }

    // -------------------------------------------------------------------------
    // is_story_header tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_is_story_header_markdown() {
        assert!(is_story_header("#### US-1.1: Title"));
        assert!(is_story_header("### US-2.1: Title"));
        assert!(is_story_header("#### T-1.1: Title"));
    }

    #[test]
    fn test_is_story_header_bold() {
        assert!(is_story_header("**US-1.1: Title**"));
        assert!(is_story_header("**US-1.1:** Title"));
        assert!(is_story_header("**T-1.1: Title**"));
    }

    #[test]
    fn test_is_story_header_false_cases() {
        assert!(!is_story_header("## Overview"));
        assert!(!is_story_header("Regular text"));
        assert!(!is_story_header("**Bold but not a story**"));
    }

    // -------------------------------------------------------------------------
    // parse_markdown_stories_with_acceptance tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_parse_stories_markdown_format() {
        let content = r#"
# PRD Document

## User Stories

#### US-1.1: User Login

**Acceptance Criteria:**
- User can enter email and password
- Form validates inputs
- Shows error on invalid credentials

#### US-1.2: User Registration

**Acceptance Criteria:**
- User can create new account
- Email verification required
"#;

        let stories = parse_markdown_stories_with_acceptance(content);
        assert_eq!(stories.len(), 2);

        assert_eq!(stories[0].id, "US-1.1");
        assert_eq!(stories[0].title, "User Login");
        assert!(stories[0].acceptance.contains("User can enter email"));

        assert_eq!(stories[1].id, "US-1.2");
        assert_eq!(stories[1].title, "User Registration");
        assert!(stories[1].acceptance.contains("User can create new account"));
    }

    #[test]
    fn test_parse_stories_bold_format() {
        let content = r#"
# PRD Document

## User Stories

**US-1.1: User Login**

**Acceptance Criteria:**
- User can enter email and password
- Form validates inputs
- Shows error on invalid credentials

**US-1.2: User Registration**

**Acceptance Criteria:**
- User can create new account
- Email verification required
"#;

        let stories = parse_markdown_stories_with_acceptance(content);
        assert_eq!(stories.len(), 2);

        assert_eq!(stories[0].id, "US-1.1");
        assert_eq!(stories[0].title, "User Login");
        assert!(stories[0].acceptance.contains("User can enter email"));

        assert_eq!(stories[1].id, "US-1.2");
        assert_eq!(stories[1].title, "User Registration");
    }

    #[test]
    fn test_parse_stories_bold_colon_outside_format() {
        let content = r#"
# PRD Document

**US-1.1:** User Login

**Acceptance Criteria:**
- User can enter email and password
- Form validates inputs

**US-2.1:** Dashboard View

**Acceptance Criteria:**
- Shows user statistics
"#;

        let stories = parse_markdown_stories_with_acceptance(content);
        assert_eq!(stories.len(), 2);

        assert_eq!(stories[0].id, "US-1.1");
        assert_eq!(stories[0].title, "User Login");

        assert_eq!(stories[1].id, "US-2.1");
        assert_eq!(stories[1].title, "Dashboard View");
    }

    #[test]
    fn test_parse_stories_mixed_format() {
        let content = r#"
# PRD

#### US-1.1: Login (Header Format)

**Acceptance Criteria:**
- Criteria 1

**US-2.1: Dashboard (Bold Format)**

**Acceptance Criteria:**
- Criteria 2
"#;

        let stories = parse_markdown_stories_with_acceptance(content);
        assert_eq!(stories.len(), 2);

        assert_eq!(stories[0].id, "US-1.1");
        assert_eq!(stories[1].id, "US-2.1");
    }

    #[test]
    fn test_parse_stories_no_acceptance_criteria() {
        let content = r#"
#### US-1.1: Feature Without Criteria

Just some description text.

#### US-1.2: Another Feature
"#;

        let stories = parse_markdown_stories_with_acceptance(content);
        assert_eq!(stories.len(), 2);

        // Should have fallback acceptance criteria
        assert!(stories[0].acceptance.starts_with("Implement:"));
        assert!(stories[1].acceptance.starts_with("Implement:"));
    }

    #[test]
    fn test_parse_stories_deduplicates() {
        let content = r#"
#### US-1.1: Duplicate Story

**Acceptance Criteria:**
- First version

#### US-1.1: Duplicate Story Again

**Acceptance Criteria:**
- Second version
"#;

        let stories = parse_markdown_stories_with_acceptance(content);
        // Should only have one US-1.1
        assert_eq!(stories.len(), 1);
        assert_eq!(stories[0].id, "US-1.1");
    }

    #[test]
    fn test_parse_stories_fallback_to_headers() {
        // When no US- patterns are found, fall back to generic headers
        let content = r#"
## Overview
This is an overview.

## Login Feature
Implement login.

## Dashboard
Show analytics.
"#;

        let stories = parse_markdown_stories_with_acceptance(content);
        // Should find "Login Feature" and "Dashboard" (Overview is skipped)
        assert_eq!(stories.len(), 2);
        assert_eq!(stories[0].id, "task-1");
        assert_eq!(stories[0].title, "Login Feature");
        assert_eq!(stories[1].id, "task-2");
        assert_eq!(stories[1].title, "Dashboard");
    }
}

/// Get the current BRIEF.md content for a PRD (US-6.1: View Current Brief)
pub fn get_ralph_brief(project_path: String, prd_name: String) -> Result<String, String> {
    let briefs_path = format!(".ralph-ui/briefs/{}/BRIEF.md", prd_name);
    let full_path = std::path::PathBuf::from(&project_path)
        .join(&briefs_path);

    match std::fs::read_to_string(&full_path) {
        Ok(content) => Ok(content),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            Err(format!("BRIEF.md not found at {}", briefs_path))
        }
        Err(e) => Err(format!("Failed to read BRIEF.md: {}", e)),
    }
}

/// Regenerate the BRIEF.md file for a PRD (US-6.1: View Current Brief)
pub fn regenerate_ralph_brief(
    project_path: String,
    prd_name: String,
) -> Result<String, String> {
    use crate::ralph_loop::{BriefBuilder, LearningsManager, PrdExecutor};
    use std::path::Path;

    let project_path_ref = Path::new(&project_path);

    // Load the PRD
    let prd_executor = PrdExecutor::new(project_path_ref, &prd_name);
    let prd = prd_executor.read_prd()
        .map_err(|e| format!("Failed to load PRD: {}", e))?;

    // Load learnings
    let learnings_manager = LearningsManager::new(project_path_ref, &prd_name);

    // Generate brief (no iteration for current brief)
    let brief_builder = BriefBuilder::new(project_path_ref, &prd_name);
    brief_builder.generate_brief_with_learnings_manager(&prd, &learnings_manager, None)
        .map_err(|e| format!("Failed to generate brief: {}", e))?;

    // Return the generated content
    get_ralph_brief(project_path, prd_name)
}

/// Get historical briefs for a PRD (US-6.1: View Current Brief - historical briefs)
#[derive(serde::Serialize)]
pub struct HistoricalBrief {
    pub iteration: u32,
    pub content: String,
}

pub fn get_ralph_historical_briefs(
    project_path: String,
    prd_name: String,
) -> Result<Vec<HistoricalBrief>, String> {
    use crate::ralph_loop::BriefBuilder;
    use std::path::Path;

    let brief_builder = BriefBuilder::new(Path::new(&project_path), &prd_name);
    let briefs = brief_builder.list_historical_briefs()?;

    Ok(briefs
        .into_iter()
        .map(|(iteration, content)| HistoricalBrief { iteration, content })
        .collect())
}

/// Get competitive attempts for a PRD execution (US-5.3)
pub fn get_ralph_competitive_attempts(
    project_path: String,
    prd_name: String,
    execution_id: String,
) -> Result<Vec<serde_json::Value>, String> {
    let project_path_buf = to_path_buf(&project_path);
    let prd_executor = PrdExecutor::new(&project_path_buf, &prd_name);

    // Read the PRD file
    let prd = prd_executor
        .read_prd()
        .map_err(|e| format!("Failed to load PRD: {}", e))?;

    // Find the execution by ID
    let execution = prd
        .executions
        .iter()
        .find(|e| e.id == execution_id)
        .ok_or_else(|| format!("Execution {} not found", execution_id))?;

    // Return competitive attempts as JSON
    let attempts = execution
        .competitive_attempts
        .iter()
        .map(|a| {
            serde_json::json!({
                "id": a.id,
                "attemptNumber": a.attempt_number,
                "agentType": a.agent_type,
                "model": a.model,
                "storiesCompleted": a.stories_completed,
                "storiesRemaining": a.stories_remaining,
                "durationSecs": a.duration_secs,
                "cost": a.cost,
                "linesChanged": a.lines_changed,
                "coveragePercent": a.coverage_percent,
                "selected": a.selected,
                "selectionReason": a.selection_reason,
                "startedAt": a.started_at,
                "completedAt": a.completed_at,
                "errorMessage": a.error_message,
            })
        })
        .collect();

    Ok(attempts)
}

/// Select a winning competitive attempt (US-5.3)
pub fn select_ralph_competitive_attempt(
    project_path: String,
    prd_name: String,
    execution_id: String,
    attempt_id: String,
    reason: String,
) -> Result<(), String> {
    let project_path_buf = to_path_buf(&project_path);
    let prd_executor = PrdExecutor::new(&project_path_buf, &prd_name);

    // Read the PRD file
    let mut prd = prd_executor
        .read_prd()
        .map_err(|e| format!("Failed to load PRD: {}", e))?;

    // Find and update the execution
    if let Some(execution) = prd.executions.iter_mut().find(|e| e.id == execution_id) {
        execution.select_competitive_attempt(&attempt_id, &reason)?;

        // Write back to disk
        prd_executor
            .write_prd(&prd)
            .map_err(|e| format!("Failed to save PRD: {}", e))?;

        Ok(())
    } else {
        Err(format!("Execution {} not found", execution_id))
    }
}

/// Get the selected attempt for an execution (US-5.3)
pub fn get_ralph_selected_competitive_attempt(
    project_path: String,
    prd_name: String,
    execution_id: String,
) -> Result<Option<serde_json::Value>, String> {
    let project_path_buf = to_path_buf(&project_path);
    let prd_executor = PrdExecutor::new(&project_path_buf, &prd_name);

    // Read the PRD file
    let prd = prd_executor
        .read_prd()
        .map_err(|e| format!("Failed to load PRD: {}", e))?;

    // Find the execution
    let execution = prd
        .executions
        .iter()
        .find(|e| e.id == execution_id)
        .ok_or_else(|| format!("Execution {} not found", execution_id))?;

    // Return selected attempt if any
    let result = execution.get_selected_attempt().map(|a| {
        serde_json::json!({
            "id": a.id,
            "attemptNumber": a.attempt_number,
            "agentType": a.agent_type,
            "model": a.model,
            "storiesCompleted": a.stories_completed,
            "storiesRemaining": a.stories_remaining,
            "durationSecs": a.duration_secs,
            "cost": a.cost,
            "linesChanged": a.lines_changed,
            "coveragePercent": a.coverage_percent,
            "selected": a.selected,
            "selectionReason": a.selection_reason,
            "startedAt": a.started_at,
            "completedAt": a.completed_at,
            "errorMessage": a.error_message,
        })
    });

    Ok(result)
}
