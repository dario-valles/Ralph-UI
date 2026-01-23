//! Type definitions for Ralph Wiggum Loop
//!
//! These types define the file-based state that persists across agent iterations:
//! - .ralph-ui/prds/{prd_name}.json: Task list with pass/fail status
//! - .ralph-ui/prds/{prd_name}-progress.txt: Learnings accumulated across iterations
//! - .ralph-ui/prds/{prd_name}-prompt.md: Prompt template for agent iterations

use crate::models::AgentType;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Assignment strategy for multi-agent scenarios (US-4.2)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub enum AssignmentStrategy {
    /// Assign stories in priority order (default, higher priority = lower number)
    Priority,
    /// Assign story with lowest overlap with in-progress work
    MinimalConflict,
}

impl Default for AssignmentStrategy {
    fn default() -> Self {
        Self::Priority
    }
}

/// Merge strategy for collaborative mode (US-5.1)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MergeStrategy {
    /// Never merge automatically - manual merge only
    Never,
    /// Merge only when all stories are complete
    OnSuccess,
    /// Merge at regular intervals (configured via merge_interval)
    Periodic,
    /// Always attempt merge at the end, regardless of outcome
    Always,
}

impl Default for MergeStrategy {
    fn default() -> Self {
        Self::Never
    }
}

/// Conflict resolution strategy for merged conflicts (US-5.1)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictResolution {
    /// Stop all agents if a merge conflict is detected
    StopOnConflict,
    /// Continue agents even if a merge conflict is detected
    ContinueOnConflict,
}

impl Default for ConflictResolution {
    fn default() -> Self {
        Self::StopOnConflict
    }
}

/// Generate a consistent PRD filename from title and ID
///
/// Format: `{sanitized-title}-{8-char-id}`
///
/// # Arguments
/// * `title` - The PRD title (will be sanitized)
/// * `prd_id` - A UUID or unique identifier (first 8 chars used)
///
/// # Example
/// ```ignore
/// let name = make_prd_filename("New Feature PRD", "a1b2c3d4-5678-9abc-def0");
/// assert_eq!(name, "new-feature-prd-a1b2c3d4");
/// ```
pub fn make_prd_filename(title: &str, prd_id: &str) -> String {
    let sanitized = title
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else if c.is_whitespace() {
                '-'
            } else {
                '_'
            }
        })
        .collect::<String>()
        .to_lowercase()
        .chars()
        .take(50)
        .collect::<String>();

    let short_id = &prd_id[..8.min(prd_id.len())];
    format!("{}-{}", sanitized, short_id)
}

/// A story/task in the PRD
///
/// This represents a single unit of work that the agent should complete.
/// The `passes` field is updated by the agent when the story is implemented and verified.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RalphStory {
    /// Unique identifier for the story
    pub id: String,

    /// Short title describing the story
    pub title: String,

    /// Detailed description of what needs to be done
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Acceptance criteria that must be met
    pub acceptance: String,

    /// Whether this story passes all acceptance criteria
    #[serde(default)]
    pub passes: bool,

    /// Priority level (lower = higher priority)
    #[serde(default = "default_priority")]
    pub priority: u32,

    /// Dependencies on other story IDs (must be completed first)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub dependencies: Vec<String>,

    /// Tags for categorization
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,

    /// Optional estimated effort (S/M/L/XL)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
}

fn default_priority() -> u32 {
    100
}

impl RalphStory {
    /// Create a new story with required fields
    pub fn new(id: impl Into<String>, title: impl Into<String>, acceptance: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            description: None,
            acceptance: acceptance.into(),
            passes: false,
            priority: default_priority(),
            dependencies: Vec::new(),
            tags: Vec::new(),
            effort: None,
        }
    }

    /// Check if all dependencies are satisfied (all pass)
    pub fn dependencies_satisfied(&self, stories: &[RalphStory]) -> bool {
        self.dependencies.iter().all(|dep_id| {
            stories
                .iter()
                .find(|s| &s.id == dep_id)
                .map(|s| s.passes)
                .unwrap_or(false)
        })
    }
}

/// Execution configuration stored with a PRD
///
/// This captures the execution settings that were used (or should be used) when
/// running the Ralph loop for this PRD. When a PRD is executed, these settings
/// take precedence over global config. If not present, global RalphConfig is used.
///
/// Config precedence: PRD stored > global config > defaults
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdExecutionConfig {
    /// Agent type to use (claude, opencode, cursor, codex)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_type: Option<String>,

    /// Model to use (e.g., "claude-sonnet-4-5")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// Maximum iterations per execution
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_iterations: Option<u32>,

    /// Maximum cost limit in dollars
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_cost: Option<f64>,

    /// Whether to run tests after each iteration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_tests: Option<bool>,

    /// Whether to run lint after each iteration
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_lint: Option<bool>,

    /// Whether to use a worktree for isolation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub use_worktree: Option<bool>,

    /// Agent timeout in seconds (0 = no timeout)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_timeout_secs: Option<u64>,

    /// Template name for prompt generation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub template_name: Option<String>,

    /// Automatically create PRs for completed stories
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auto_create_prs: Option<bool>,

    /// Create PRs as drafts
    #[serde(skip_serializing_if = "Option::is_none")]
    pub draft_prs: Option<bool>,

    /// Merge strategy for collaborative mode (US-5.1)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_strategy: Option<String>,

    /// Merge interval in iterations (US-5.1) - merge every N iterations
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_interval: Option<u32>,

    /// Conflict resolution strategy (US-5.1)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflict_resolution: Option<String>,

    /// Target branch for merges (US-5.1) - defaults to main
    #[serde(skip_serializing_if = "Option::is_none")]
    pub merge_target_branch: Option<String>,
}

impl Default for PrdExecutionConfig {
    fn default() -> Self {
        Self {
            agent_type: None,
            model: None,
            max_iterations: None,
            max_cost: None,
            run_tests: None,
            run_lint: None,
            use_worktree: None,
            agent_timeout_secs: None,
            template_name: None,
            auto_create_prs: None,
            draft_prs: None,
            merge_strategy: None,
            merge_interval: None,
            conflict_resolution: None,
            merge_target_branch: None,
        }
    }
}

impl PrdExecutionConfig {
    /// Validate the execution config fields
    ///
    /// Returns Ok(()) if valid, Err with error message if invalid.
    pub fn validate(&self) -> Result<(), String> {
        if let Some(max_iterations) = self.max_iterations {
            if max_iterations == 0 {
                return Err("max_iterations must be greater than 0".to_string());
            }
        }

        if let Some(max_cost) = self.max_cost {
            if max_cost < 0.0 {
                return Err("max_cost cannot be negative".to_string());
            }
        }

        if let Some(ref agent_type) = self.agent_type {
            let valid_types = ["claude", "opencode", "cursor", "codex"];
            if !valid_types.contains(&agent_type.to_lowercase().as_str()) {
                return Err(format!(
                    "Invalid agent_type '{}'. Valid types: {:?}",
                    agent_type, valid_types
                ));
            }
        }

        Ok(())
    }

    /// Check if this config has any fields set
    pub fn has_any_fields(&self) -> bool {
        self.agent_type.is_some()
            || self.model.is_some()
            || self.max_iterations.is_some()
            || self.max_cost.is_some()
            || self.run_tests.is_some()
            || self.run_lint.is_some()
            || self.use_worktree.is_some()
            || self.agent_timeout_secs.is_some()
            || self.template_name.is_some()
            || self.auto_create_prs.is_some()
            || self.draft_prs.is_some()
            || self.merge_strategy.is_some()
            || self.merge_interval.is_some()
            || self.conflict_resolution.is_some()
            || self.merge_target_branch.is_some()
    }
}

/// The PRD document stored in .ralph-ui/prds/{prd_name}.json
///
/// This is the source of truth for what tasks need to be done and their status.
/// The agent reads this file at the start of each iteration to pick a task,
/// and updates it when a task is completed.
///
/// Executions and iteration history are embedded directly in this file,
/// enabling git-trackable state for team sharing.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RalphPrd {
    /// Title of the PRD
    pub title: String,

    /// Description of the overall goal
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Branch name for this PRD's work
    pub branch: String,

    /// List of stories/tasks to complete
    pub stories: Vec<RalphStory>,

    /// PRD metadata
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<PrdMetadata>,

    /// Optional execution configuration stored with the PRD
    ///
    /// When present, these settings are used for PRD execution.
    /// When absent, settings are loaded from global RalphConfig.
    /// Config precedence: PRD stored > global config > defaults
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "executionConfig")]
    pub execution_config: Option<PrdExecutionConfig>,

    /// Execution history (embedded, replaces database tables)
    /// Only the most recent executions are kept to avoid file bloat.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub executions: Vec<PrdExecution>,
}

/// Metadata about the PRD
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdMetadata {
    /// When the PRD was created
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,

    /// When the PRD was last modified
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,

    /// Source chat session ID (if created from PRD chat)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_chat_id: Option<String>,

    /// Total iterations run against this PRD
    #[serde(default)]
    pub total_iterations: u32,

    /// Last execution ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_execution_id: Option<String>,

    /// Last worktree path (for finding worktree after execution ends)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_worktree_path: Option<String>,
}

// ============================================================================
// PRD Execution Types (Embedded in PRD files)
// ============================================================================

/// Execution status
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionStatus {
    /// Execution is currently running
    Running,
    /// Execution completed successfully (all stories passed)
    Completed,
    /// Execution was stopped manually
    Stopped,
    /// Execution failed due to errors
    Failed,
    /// Execution was interrupted (crash recovery)
    Interrupted,
}

impl Default for ExecutionStatus {
    fn default() -> Self {
        Self::Running
    }
}

impl std::fmt::Display for ExecutionStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ExecutionStatus::Running => write!(f, "running"),
            ExecutionStatus::Completed => write!(f, "completed"),
            ExecutionStatus::Stopped => write!(f, "stopped"),
            ExecutionStatus::Failed => write!(f, "failed"),
            ExecutionStatus::Interrupted => write!(f, "interrupted"),
        }
    }
}

/// A single PRD execution with embedded iteration history
///
/// This replaces the database tables:
/// - `prd_executions` table
/// - `ralph_iteration_history` table (embedded as `iterations`)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdExecution {
    /// Unique execution ID
    pub id: String,

    /// Status of this execution
    #[serde(default)]
    pub status: ExecutionStatus,

    /// Agent type used for this execution
    pub agent_type: AgentType,

    /// Model used (optional)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// Worktree path for this execution
    #[serde(skip_serializing_if = "Option::is_none")]
    pub worktree_path: Option<String>,

    /// When the execution started
    pub started_at: String,

    /// When the execution ended (None if still running)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ended_at: Option<String>,

    /// Total iterations completed
    pub total_iterations: u32,

    /// Total duration in seconds
    pub total_duration_secs: f64,

    /// Total cost incurred
    #[serde(default)]
    pub total_cost: f64,

    /// Stories completed during this execution
    #[serde(default)]
    pub stories_completed: u32,

    /// Stories remaining at end of execution
    #[serde(default)]
    pub stories_remaining: u32,

    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,

    /// Iteration history embedded in the execution
    #[serde(default)]
    pub iterations: Vec<IterationRecord>,
}

impl PrdExecution {
    /// Create a new execution with an ID and agent type
    pub fn new(id: impl Into<String>, agent_type: AgentType) -> Self {
        Self {
            id: id.into(),
            status: ExecutionStatus::Running,
            agent_type,
            model: None,
            worktree_path: None,
            started_at: chrono::Utc::now().to_rfc3339(),
            ended_at: None,
            total_iterations: 0,
            total_duration_secs: 0.0,
            total_cost: 0.0,
            stories_completed: 0,
            stories_remaining: 0,
            error_message: None,
            iterations: Vec::new(),
        }
    }

    /// Add an iteration to this execution
    pub fn add_iteration(&mut self, iteration: IterationRecord) {
        self.total_iterations += 1;
        self.total_duration_secs += iteration.duration_secs;
        self.iterations.push(iteration);
    }

    /// Mark this execution as completed
    pub fn mark_completed(&mut self, stories_completed: u32, stories_remaining: u32) {
        self.status = ExecutionStatus::Completed;
        self.ended_at = Some(chrono::Utc::now().to_rfc3339());
        self.stories_completed = stories_completed;
        self.stories_remaining = stories_remaining;
    }

    /// Mark this execution as stopped
    pub fn mark_stopped(&mut self, stories_completed: u32, stories_remaining: u32) {
        self.status = ExecutionStatus::Stopped;
        self.ended_at = Some(chrono::Utc::now().to_rfc3339());
        self.stories_completed = stories_completed;
        self.stories_remaining = stories_remaining;
    }

    /// Mark this execution as failed
    pub fn mark_failed(&mut self, error: impl Into<String>) {
        self.status = ExecutionStatus::Failed;
        self.ended_at = Some(chrono::Utc::now().to_rfc3339());
        self.error_message = Some(error.into());
    }

    /// Get iteration stats
    pub fn get_stats(&self) -> IterationStats {
        let mut stats = IterationStats::default();
        stats.total = self.total_iterations;
        stats.total_duration_secs = self.total_duration_secs;

        for iter in &self.iterations {
            match iter.outcome {
                IterationOutcome::Success => stats.successful += 1,
                IterationOutcome::Failed => stats.failed += 1,
                IterationOutcome::Skipped => stats.skipped += 1,
                IterationOutcome::Interrupted => stats.interrupted += 1,
            }
            if iter.rate_limit_encountered {
                stats.rate_limited += 1;
            }
        }

        stats
    }
}

/// Statistics for an execution's iterations
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IterationStats {
    pub total: u32,
    pub successful: u32,
    pub failed: u32,
    pub skipped: u32,
    pub interrupted: u32,
    pub rate_limited: u32,
    pub total_duration_secs: f64,
}

/// Maximum number of executions to keep embedded in PRD file
const MAX_EMBEDDED_EXECUTIONS: usize = 10;

impl RalphPrd {
    /// Create a new PRD with required fields
    pub fn new(title: impl Into<String>, branch: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            description: None,
            branch: branch.into(),
            stories: Vec::new(),
            metadata: Some(PrdMetadata {
                created_at: Some(chrono::Utc::now().to_rfc3339()),
                updated_at: None,
                source_chat_id: None,
                total_iterations: 0,
                last_execution_id: None,
                last_worktree_path: None,
            }),
            execution_config: None,
            executions: Vec::new(),
        }
    }

    /// Add a story to the PRD (skips if story with same ID already exists)
    pub fn add_story(&mut self, story: RalphStory) {
        // Check if story with same ID already exists
        if !self.stories.iter().any(|s| s.id == story.id) {
            self.stories.push(story);
        }
    }

    /// Get all stories that haven't passed yet
    pub fn incomplete_stories(&self) -> Vec<&RalphStory> {
        self.stories.iter().filter(|s| !s.passes).collect()
    }

    /// Get the highest priority incomplete story with satisfied dependencies
    pub fn next_story(&self) -> Option<&RalphStory> {
        self.stories
            .iter()
            .filter(|s| !s.passes && s.dependencies_satisfied(&self.stories))
            .min_by_key(|s| s.priority)
    }

    /// Get the next available story for assignment (US-2.1: Multiple Agents on Same PRD)
    ///
    /// This method returns the highest priority story that:
    /// - Is not completed (passes == false)
    /// - Has all dependencies satisfied
    /// - Is NOT already assigned to another agent
    ///
    /// # Arguments
    /// * `assigned_story_ids` - List of story IDs that are currently assigned to other agents
    pub fn next_available_story(&self, assigned_story_ids: &[String]) -> Option<&RalphStory> {
        self.stories
            .iter()
            .filter(|s| {
                !s.passes
                    && s.dependencies_satisfied(&self.stories)
                    && !assigned_story_ids.contains(&s.id)
            })
            .min_by_key(|s| s.priority)
    }

    /// Get all available stories for assignment (US-2.1)
    ///
    /// Returns all stories that are available for assignment, sorted by priority.
    /// A story is available if it's not completed, not assigned, and has satisfied dependencies.
    ///
    /// # Arguments
    /// * `assigned_story_ids` - List of story IDs that are currently assigned to other agents
    pub fn available_stories(&self, assigned_story_ids: &[String]) -> Vec<&RalphStory> {
        let mut available: Vec<&RalphStory> = self
            .stories
            .iter()
            .filter(|s| {
                !s.passes
                    && s.dependencies_satisfied(&self.stories)
                    && !assigned_story_ids.contains(&s.id)
            })
            .collect();

        available.sort_by_key(|s| s.priority);
        available
    }

    /// Mark a story as passing
    pub fn mark_story_passing(&mut self, story_id: &str) -> bool {
        if let Some(story) = self.stories.iter_mut().find(|s| s.id == story_id) {
            story.passes = true;
            true
        } else {
            false
        }
    }

    /// Check if all stories pass
    pub fn all_pass(&self) -> bool {
        self.stories.iter().all(|s| s.passes)
    }

    /// Get progress stats
    pub fn progress(&self) -> (usize, usize) {
        let passed = self.stories.iter().filter(|s| s.passes).count();
        (passed, self.stories.len())
    }

    /// Get the next available story using the specified strategy (US-4.2)
    ///
    /// This method selects the next story to assign based on the assignment strategy:
    /// - Priority: Selects highest priority (lowest priority number)
    /// - MinimalConflict: Selects story with lowest overlap with in-progress work
    ///
    /// # Arguments
    /// * `assigned_story_ids` - List of story IDs that are currently assigned to other agents
    /// * `strategy` - The assignment strategy to use (Priority or MinimalConflict)
    /// * `estimated_files_map` - Map of story_id -> Vec<estimated_files> for conflict scoring
    pub fn next_available_story_with_strategy(
        &self,
        assigned_story_ids: &[String],
        strategy: AssignmentStrategy,
        estimated_files_map: &HashMap<String, Vec<String>>,
    ) -> Option<&RalphStory> {
        let available = self.available_stories(assigned_story_ids);
        if available.is_empty() {
            return None;
        }

        match strategy {
            AssignmentStrategy::Priority => {
                // Priority strategy: return highest priority available story
                available.first().copied()
            }
            AssignmentStrategy::MinimalConflict => {
                // MinimalConflict strategy: return story with lowest file overlap
                available
                    .into_iter()
                    .min_by_key(|story| self.score_story_by_conflict(&story.id, estimated_files_map))
            }
        }
    }

    /// Score a story by its file conflict potential (US-4.2)
    ///
    /// Lower scores are better. Returns the number of files that would conflict
    /// with in-progress work if this story were assigned.
    ///
    /// # Arguments
    /// * `story_id` - The story ID to score
    /// * `estimated_files_map` - Map of story_id -> Vec<estimated_files>
    fn score_story_by_conflict(&self, story_id: &str, estimated_files_map: &HashMap<String, Vec<String>>) -> usize {
        let story_files = match estimated_files_map.get(story_id) {
            Some(files) => files,
            None => return 0, // No estimated files = no conflict
        };

        // Count conflicts: how many files are used by other assigned stories
        let mut conflict_count = 0;
        for (other_story_id, other_files) in estimated_files_map {
            if other_story_id != story_id {
                for file in story_files {
                    if other_files.contains(file) {
                        conflict_count += 1;
                    }
                }
            }
        }

        conflict_count
    }

    // =========================================================================
    // Execution Management (Embedded)
    // =========================================================================

    /// Start a new execution
    pub fn start_execution(&mut self, execution_id: impl Into<String>, agent_type: AgentType) -> &mut PrdExecution {
        let exec = PrdExecution::new(execution_id, agent_type);
        self.executions.push(exec);

        // Update metadata
        if let Some(ref mut meta) = self.metadata {
            meta.last_execution_id = Some(self.executions.last().unwrap().id.clone());
            meta.updated_at = Some(chrono::Utc::now().to_rfc3339());
        }

        // Trim old executions to avoid file bloat
        while self.executions.len() > MAX_EMBEDDED_EXECUTIONS {
            self.executions.remove(0);
        }

        self.executions.last_mut().unwrap()
    }

    /// Get the current (most recent) execution
    pub fn current_execution(&self) -> Option<&PrdExecution> {
        self.executions.last()
    }

    /// Get mutable reference to the current execution
    pub fn current_execution_mut(&mut self) -> Option<&mut PrdExecution> {
        self.executions.last_mut()
    }

    /// Get an execution by ID
    pub fn get_execution(&self, execution_id: &str) -> Option<&PrdExecution> {
        self.executions.iter().find(|e| e.id == execution_id)
    }

    /// Get mutable reference to an execution by ID
    pub fn get_execution_mut(&mut self, execution_id: &str) -> Option<&mut PrdExecution> {
        self.executions.iter_mut().find(|e| e.id == execution_id)
    }

    /// Add an iteration to the current execution
    pub fn add_iteration(&mut self, iteration: IterationRecord) -> bool {
        if let Some(exec) = self.current_execution_mut() {
            exec.add_iteration(iteration);

            // Update total iterations in metadata
            if let Some(ref mut meta) = self.metadata {
                meta.total_iterations += 1;
                meta.updated_at = Some(chrono::Utc::now().to_rfc3339());
            }
            true
        } else {
            false
        }
    }

    /// Get all iterations across all executions
    pub fn all_iterations(&self) -> Vec<&IterationRecord> {
        self.executions
            .iter()
            .flat_map(|e| e.iterations.iter())
            .collect()
    }

    /// Get iterations for a specific execution
    pub fn iterations_for_execution(&self, execution_id: &str) -> Vec<&IterationRecord> {
        self.get_execution(execution_id)
            .map(|e| e.iterations.iter().collect())
            .unwrap_or_default()
    }
}

/// Status summary for a PRD
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdStatus {
    /// Total number of stories
    pub total: usize,

    /// Number of stories that pass
    pub passed: usize,

    /// Number of stories that fail
    pub failed: usize,

    /// Whether all stories pass
    pub all_pass: bool,

    /// Progress percentage (0-100)
    pub progress_percent: f32,

    /// IDs of incomplete stories
    pub incomplete_story_ids: Vec<String>,

    /// ID of next story to work on (highest priority with satisfied deps)
    pub next_story_id: Option<String>,
}

/// A single entry in progress.txt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEntry {
    /// Iteration number
    pub iteration: u32,

    /// Timestamp
    pub timestamp: String,

    /// Type of entry
    pub entry_type: ProgressEntryType,

    /// Content of the entry
    pub content: String,
}

/// Types of progress entries
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProgressEntryType {
    /// Iteration started
    IterationStart,
    /// Iteration ended
    IterationEnd,
    /// Learning/insight recorded
    Learning,
    /// Error or issue encountered
    Error,
    /// Story completed
    StoryCompleted,
    /// Manual note added
    Note,
}

impl std::fmt::Display for ProgressEntryType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProgressEntryType::IterationStart => write!(f, "START"),
            ProgressEntryType::IterationEnd => write!(f, "END"),
            ProgressEntryType::Learning => write!(f, "LEARNING"),
            ProgressEntryType::Error => write!(f, "ERROR"),
            ProgressEntryType::StoryCompleted => write!(f, "COMPLETED"),
            ProgressEntryType::Note => write!(f, "NOTE"),
        }
    }
}

/// Configuration from .ralph-ui/config.yaml (optional)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RalphConfig {
    /// Project settings
    #[serde(default)]
    pub project: ProjectConfig,

    /// Ralph loop settings
    #[serde(default)]
    pub ralph: LoopConfig,
}

/// Project-specific configuration
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProjectConfig {
    /// Project name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Command to run tests
    #[serde(skip_serializing_if = "Option::is_none")]
    pub test_command: Option<String>,

    /// Command to run linter
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lint_command: Option<String>,

    /// Command to build the project
    #[serde(skip_serializing_if = "Option::is_none")]
    pub build_command: Option<String>,
}

/// Loop-specific configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopConfig {
    /// Maximum iterations
    #[serde(default = "default_max_iterations")]
    pub max_iterations: u32,

    /// Completion promise string
    #[serde(default = "default_completion_promise")]
    pub completion_promise: String,

    /// Agent to use
    #[serde(default = "default_agent")]
    pub agent: String,

    /// Model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// Maximum cost in dollars
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_cost: Option<f64>,
}

fn default_max_iterations() -> u32 {
    50
}

fn default_completion_promise() -> String {
    "<promise>COMPLETE</promise>".to_string()
}

fn default_agent() -> String {
    "claude".to_string()
}

impl Default for LoopConfig {
    fn default() -> Self {
        Self {
            max_iterations: default_max_iterations(),
            completion_promise: default_completion_promise(),
            agent: default_agent(),
            model: None,
            max_cost: None,
        }
    }
}

impl Default for RalphConfig {
    fn default() -> Self {
        Self {
            project: ProjectConfig::default(),
            ralph: LoopConfig::default(),
        }
    }
}

// ============================================================================
// Error Handling and Fallback Types
// ============================================================================

/// Error handling strategy for Ralph Loop iterations
///
/// Determines how the loop responds when an agent fails or encounters errors.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum ErrorStrategy {
    /// Retry the iteration with exponential backoff
    Retry {
        /// Maximum number of retry attempts
        max_attempts: u32,
        /// Initial backoff delay in milliseconds
        backoff_ms: u64,
    },
    /// Skip the failed iteration and continue to the next
    Skip,
    /// Abort the entire loop execution
    Abort,
}

impl Default for ErrorStrategy {
    fn default() -> Self {
        Self::Retry {
            max_attempts: 3,
            backoff_ms: 5000,
        }
    }
}

/// Outcome of a single Ralph Loop iteration
///
/// Tracks what happened during an iteration for history and crash recovery.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IterationOutcome {
    /// Iteration completed successfully
    Success,
    /// Iteration failed but was retried
    Failed,
    /// Iteration was skipped (error strategy: skip)
    Skipped,
    /// Iteration was interrupted (crash/manual stop)
    Interrupted,
}

impl std::fmt::Display for IterationOutcome {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            IterationOutcome::Success => write!(f, "success"),
            IterationOutcome::Failed => write!(f, "failed"),
            IterationOutcome::Skipped => write!(f, "skipped"),
            IterationOutcome::Interrupted => write!(f, "interrupted"),
        }
    }
}

impl std::str::FromStr for IterationOutcome {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "success" => Ok(IterationOutcome::Success),
            "failed" => Ok(IterationOutcome::Failed),
            "skipped" => Ok(IterationOutcome::Skipped),
            "interrupted" => Ok(IterationOutcome::Interrupted),
            _ => Err(format!("Unknown iteration outcome: {}", s)),
        }
    }
}

/// Extended fallback configuration with chain support
///
/// Configures how the Ralph Loop handles rate limits by falling back to
/// alternative agents in a defined order.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FallbackChainConfig {
    /// Ordered list of agents to try (e.g., [Claude, OpenCode, Cursor])
    /// The first agent in the list is the primary; others are fallbacks.
    pub fallback_chain: Vec<AgentType>,
    /// Whether to test if the primary agent has recovered
    pub test_primary_recovery: bool,
    /// How often to test primary recovery (every N iterations)
    pub recovery_test_interval: u32,
    /// Base backoff time in milliseconds when an agent is rate-limited
    pub base_backoff_ms: u64,
    /// Maximum backoff time in milliseconds
    pub max_backoff_ms: u64,
    /// Whether fallback is enabled at all
    pub enabled: bool,
}

impl Default for FallbackChainConfig {
    fn default() -> Self {
        Self {
            fallback_chain: vec![AgentType::Claude, AgentType::Opencode],
            test_primary_recovery: true,
            recovery_test_interval: 5, // Test every 5 iterations
            base_backoff_ms: 5000,
            max_backoff_ms: 300_000, // 5 minutes
            enabled: true,
        }
    }
}

/// Record of a single iteration stored in the database
///
/// Used for persistent history and crash recovery.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IterationRecord {
    /// Unique identifier for this record
    pub id: String,
    /// Execution ID this iteration belongs to
    pub execution_id: String,
    /// Iteration number (1-indexed)
    pub iteration: u32,
    /// Outcome of this iteration
    pub outcome: IterationOutcome,
    /// Duration in seconds
    pub duration_secs: f64,
    /// Agent type used for this iteration
    pub agent_type: AgentType,
    /// Whether a rate limit was encountered
    pub rate_limit_encountered: bool,
    /// Error message if failed
    pub error_message: Option<String>,
    /// When the iteration started
    pub started_at: String,
    /// When the iteration completed (None if interrupted)
    pub completed_at: Option<String>,
}

/// Execution state snapshot for crash recovery
///
/// Saved periodically during execution so we can detect and recover from crashes.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionStateSnapshot {
    /// Execution ID
    pub execution_id: String,
    /// Serialized state of the Ralph loop
    pub state: String,
    /// Last heartbeat timestamp (for crash detection)
    pub last_heartbeat: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ralph_story_creation() {
        let story = RalphStory::new("1", "Add login", "User can log in with email/password");
        assert_eq!(story.id, "1");
        assert!(!story.passes);
        assert_eq!(story.priority, 100);
    }

    #[test]
    fn test_ralph_prd_next_story() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");

        let mut story1 = RalphStory::new("1", "First task", "Complete first");
        story1.priority = 1;

        let mut story2 = RalphStory::new("2", "Second task", "Complete second");
        story2.priority = 2;
        story2.dependencies = vec!["1".to_string()];

        prd.add_story(story1);
        prd.add_story(story2);

        // First story should be next (no deps, highest priority)
        let next = prd.next_story();
        assert_eq!(next.unwrap().id, "1");

        // After marking first as passing, second should be next
        prd.mark_story_passing("1");
        let next = prd.next_story();
        assert_eq!(next.unwrap().id, "2");
    }

    #[test]
    fn test_prd_serialization() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");
        prd.add_story(RalphStory::new("1", "Test story", "Must pass test"));

        let json = serde_json::to_string_pretty(&prd).unwrap();
        assert!(json.contains("Test PRD"));
        assert!(json.contains("Test story"));

        // Deserialize back
        let parsed: RalphPrd = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.title, "Test PRD");
        assert_eq!(parsed.stories.len(), 1);
    }

    #[test]
    fn test_dependencies_satisfied() {
        let stories = vec![
            {
                let mut s = RalphStory::new("1", "First", "A");
                s.passes = true;
                s
            },
            {
                let mut s = RalphStory::new("2", "Second", "B");
                s.passes = false;
                s
            },
        ];

        let mut story_with_dep = RalphStory::new("3", "Third", "C");
        story_with_dep.dependencies = vec!["1".to_string()];
        assert!(story_with_dep.dependencies_satisfied(&stories));

        story_with_dep.dependencies = vec!["2".to_string()];
        assert!(!story_with_dep.dependencies_satisfied(&stories));

        story_with_dep.dependencies = vec!["1".to_string(), "2".to_string()];
        assert!(!story_with_dep.dependencies_satisfied(&stories));
    }

    // =========================================================================
    // Error Strategy Tests
    // =========================================================================

    #[test]
    fn test_error_strategy_default() {
        let strategy = ErrorStrategy::default();
        match strategy {
            ErrorStrategy::Retry { max_attempts, backoff_ms } => {
                assert_eq!(max_attempts, 3);
                assert_eq!(backoff_ms, 5000);
            }
            _ => unreachable!("Default should be Retry"),
        }
    }

    #[test]
    fn test_error_strategy_serialization() {
        let retry = ErrorStrategy::Retry { max_attempts: 5, backoff_ms: 10000 };
        let json = serde_json::to_string(&retry).unwrap();
        assert!(json.contains("retry"));
        assert!(json.contains("5"));
        assert!(json.contains("10000"));

        let skip = ErrorStrategy::Skip;
        let json = serde_json::to_string(&skip).unwrap();
        assert!(json.contains("skip"));

        let abort = ErrorStrategy::Abort;
        let json = serde_json::to_string(&abort).unwrap();
        assert!(json.contains("abort"));
    }

    #[test]
    fn test_error_strategy_deserialization() {
        let json = r#"{"type":"retry","max_attempts":3,"backoff_ms":5000}"#;
        let strategy: ErrorStrategy = serde_json::from_str(json).unwrap();
        assert_eq!(strategy, ErrorStrategy::Retry { max_attempts: 3, backoff_ms: 5000 });

        let json = r#"{"type":"skip"}"#;
        let strategy: ErrorStrategy = serde_json::from_str(json).unwrap();
        assert_eq!(strategy, ErrorStrategy::Skip);

        let json = r#"{"type":"abort"}"#;
        let strategy: ErrorStrategy = serde_json::from_str(json).unwrap();
        assert_eq!(strategy, ErrorStrategy::Abort);
    }

    // =========================================================================
    // Iteration Outcome Tests
    // =========================================================================

    #[test]
    fn test_iteration_outcome_display() {
        assert_eq!(IterationOutcome::Success.to_string(), "success");
        assert_eq!(IterationOutcome::Failed.to_string(), "failed");
        assert_eq!(IterationOutcome::Skipped.to_string(), "skipped");
        assert_eq!(IterationOutcome::Interrupted.to_string(), "interrupted");
    }

    #[test]
    fn test_iteration_outcome_from_str() {
        assert_eq!("success".parse::<IterationOutcome>().unwrap(), IterationOutcome::Success);
        assert_eq!("failed".parse::<IterationOutcome>().unwrap(), IterationOutcome::Failed);
        assert_eq!("skipped".parse::<IterationOutcome>().unwrap(), IterationOutcome::Skipped);
        assert_eq!("interrupted".parse::<IterationOutcome>().unwrap(), IterationOutcome::Interrupted);
        assert_eq!("SUCCESS".parse::<IterationOutcome>().unwrap(), IterationOutcome::Success);
        assert!("invalid".parse::<IterationOutcome>().is_err());
    }

    #[test]
    fn test_iteration_outcome_serialization() {
        let outcome = IterationOutcome::Success;
        let json = serde_json::to_string(&outcome).unwrap();
        assert_eq!(json, "\"success\"");

        let parsed: IterationOutcome = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed, IterationOutcome::Success);
    }

    // =========================================================================
    // Fallback Chain Config Tests
    // =========================================================================

    #[test]
    fn test_fallback_chain_config_default() {
        let config = FallbackChainConfig::default();
        assert!(config.enabled);
        assert!(config.test_primary_recovery);
        assert_eq!(config.recovery_test_interval, 5);
        assert_eq!(config.fallback_chain.len(), 2);
        assert_eq!(config.fallback_chain[0], AgentType::Claude);
        assert_eq!(config.fallback_chain[1], AgentType::Opencode);
    }

    #[test]
    fn test_fallback_chain_config_serialization() {
        let config = FallbackChainConfig {
            fallback_chain: vec![AgentType::Claude, AgentType::Opencode, AgentType::Cursor],
            test_primary_recovery: false,
            recovery_test_interval: 10,
            base_backoff_ms: 10000,
            max_backoff_ms: 600000,
            enabled: true,
        };

        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("fallbackChain"));
        assert!(json.contains("testPrimaryRecovery"));

        let parsed: FallbackChainConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.fallback_chain.len(), 3);
        assert!(!parsed.test_primary_recovery);
        assert_eq!(parsed.recovery_test_interval, 10);
    }

    // =========================================================================
    // Iteration Record Tests
    // =========================================================================

    #[test]
    fn test_iteration_record_serialization() {
        let record = IterationRecord {
            id: "rec-123".to_string(),
            execution_id: "exec-456".to_string(),
            iteration: 5,
            outcome: IterationOutcome::Success,
            duration_secs: 120.5,
            agent_type: AgentType::Claude,
            rate_limit_encountered: false,
            error_message: None,
            started_at: "2024-01-01T00:00:00Z".to_string(),
            completed_at: Some("2024-01-01T00:02:00Z".to_string()),
        };

        let json = serde_json::to_string(&record).unwrap();
        assert!(json.contains("rec-123"));
        assert!(json.contains("exec-456"));
        assert!(json.contains("success"));

        let parsed: IterationRecord = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.iteration, 5);
        assert_eq!(parsed.outcome, IterationOutcome::Success);
        assert!(!parsed.rate_limit_encountered);
    }

    #[test]
    fn test_iteration_record_with_error() {
        let record = IterationRecord {
            id: "rec-789".to_string(),
            execution_id: "exec-456".to_string(),
            iteration: 3,
            outcome: IterationOutcome::Failed,
            duration_secs: 45.0,
            agent_type: AgentType::Opencode,
            rate_limit_encountered: true,
            error_message: Some("Rate limit exceeded".to_string()),
            started_at: "2024-01-01T00:00:00Z".to_string(),
            completed_at: Some("2024-01-01T00:00:45Z".to_string()),
        };

        let json = serde_json::to_string(&record).unwrap();
        assert!(json.contains("failed"));
        assert!(json.contains("Rate limit exceeded"));
        assert!(json.contains("rateLimitEncountered\":true"));
    }

    // =========================================================================
    // make_prd_filename Tests
    // =========================================================================

    #[test]
    fn test_make_prd_filename_basic() {
        let name = super::make_prd_filename("New Feature PRD", "a1b2c3d4-5678-9abc-def0");
        assert_eq!(name, "new-feature-prd-a1b2c3d4");
    }

    #[test]
    fn test_make_prd_filename_special_chars() {
        let name = super::make_prd_filename("My PRD: Test/Feature!", "12345678-abcd");
        assert_eq!(name, "my-prd_-test_feature_-12345678");
    }

    #[test]
    fn test_make_prd_filename_long_title() {
        let long_title = "This is a very long PRD title that exceeds fifty characters limit";
        let name = super::make_prd_filename(long_title, "abcd1234");
        // Sanitized title is truncated to 50 chars, then -id is appended
        assert!(name.starts_with("this-is-a-very-long-prd-title-that-exceeds-fifty-c"));
        assert!(name.ends_with("-abcd1234"));
    }

    #[test]
    fn test_make_prd_filename_short_id() {
        let name = super::make_prd_filename("Test", "abc");
        assert_eq!(name, "test-abc");
    }

    // =========================================================================
    // PRD Execution Tests
    // =========================================================================

    #[test]
    fn test_prd_execution_new() {
        let exec = PrdExecution::new("exec-123", AgentType::Claude);
        assert_eq!(exec.id, "exec-123");
        assert_eq!(exec.status, ExecutionStatus::Running);
        assert_eq!(exec.agent_type, AgentType::Claude);
        assert_eq!(exec.total_iterations, 0);
        assert!(exec.iterations.is_empty());
    }

    #[test]
    fn test_prd_execution_add_iteration() {
        let mut exec = PrdExecution::new("exec-123", AgentType::Claude);

        let iter = IterationRecord {
            id: "iter-1".to_string(),
            execution_id: "exec-123".to_string(),
            iteration: 1,
            outcome: IterationOutcome::Success,
            duration_secs: 60.0,
            agent_type: AgentType::Claude,
            rate_limit_encountered: false,
            error_message: None,
            started_at: "2024-01-01T00:00:00Z".to_string(),
            completed_at: Some("2024-01-01T00:01:00Z".to_string()),
        };

        exec.add_iteration(iter);

        assert_eq!(exec.total_iterations, 1);
        assert_eq!(exec.total_duration_secs, 60.0);
        assert_eq!(exec.iterations.len(), 1);
    }

    #[test]
    fn test_prd_execution_mark_completed() {
        let mut exec = PrdExecution::new("exec-123", AgentType::Claude);
        exec.mark_completed(5, 0);

        assert_eq!(exec.status, ExecutionStatus::Completed);
        assert_eq!(exec.stories_completed, 5);
        assert_eq!(exec.stories_remaining, 0);
        assert!(exec.ended_at.is_some());
    }

    #[test]
    fn test_prd_execution_mark_failed() {
        let mut exec = PrdExecution::new("exec-123", AgentType::Claude);
        exec.mark_failed("Connection timeout");

        assert_eq!(exec.status, ExecutionStatus::Failed);
        assert_eq!(exec.error_message, Some("Connection timeout".to_string()));
        assert!(exec.ended_at.is_some());
    }

    #[test]
    fn test_prd_execution_get_stats() {
        let mut exec = PrdExecution::new("exec-123", AgentType::Claude);

        for i in 1..=5 {
            let outcome = if i <= 3 {
                IterationOutcome::Success
            } else {
                IterationOutcome::Failed
            };

            exec.add_iteration(IterationRecord {
                id: format!("iter-{}", i),
                execution_id: "exec-123".to_string(),
                iteration: i,
                outcome,
                duration_secs: 30.0,
                agent_type: AgentType::Claude,
                rate_limit_encountered: i == 4,
                error_message: None,
                started_at: "2024-01-01T00:00:00Z".to_string(),
                completed_at: Some("2024-01-01T00:00:30Z".to_string()),
            });
        }

        let stats = exec.get_stats();
        assert_eq!(stats.total, 5);
        assert_eq!(stats.successful, 3);
        assert_eq!(stats.failed, 2);
        assert_eq!(stats.rate_limited, 1);
        assert_eq!(stats.total_duration_secs, 150.0);
    }

    #[test]
    fn test_prd_execution_serialization() {
        let mut exec = PrdExecution::new("exec-123", AgentType::Claude);
        exec.model = Some("claude-3-5-sonnet".to_string());
        exec.mark_completed(3, 2);

        let json = serde_json::to_string_pretty(&exec).unwrap();
        assert!(json.contains("exec-123"));
        assert!(json.contains("completed"));

        let parsed: PrdExecution = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.id, "exec-123");
        assert_eq!(parsed.status, ExecutionStatus::Completed);
    }

    // =========================================================================
    // PRD with Embedded Executions Tests
    // =========================================================================

    #[test]
    fn test_prd_start_execution() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");

        let exec = prd.start_execution("exec-1", AgentType::Claude);
        assert_eq!(exec.id, "exec-1");

        assert_eq!(prd.executions.len(), 1);
        assert_eq!(prd.metadata.as_ref().unwrap().last_execution_id, Some("exec-1".to_string()));
    }

    #[test]
    fn test_prd_current_execution() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");

        assert!(prd.current_execution().is_none());

        prd.start_execution("exec-1", AgentType::Claude);
        assert!(prd.current_execution().is_some());
        assert_eq!(prd.current_execution().unwrap().id, "exec-1");
    }

    #[test]
    fn test_prd_add_iteration() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");
        prd.start_execution("exec-1", AgentType::Claude);

        let iter = IterationRecord {
            id: "iter-1".to_string(),
            execution_id: "exec-1".to_string(),
            iteration: 1,
            outcome: IterationOutcome::Success,
            duration_secs: 60.0,
            agent_type: AgentType::Claude,
            rate_limit_encountered: false,
            error_message: None,
            started_at: "2024-01-01T00:00:00Z".to_string(),
            completed_at: Some("2024-01-01T00:01:00Z".to_string()),
        };

        assert!(prd.add_iteration(iter));
        assert_eq!(prd.current_execution().unwrap().total_iterations, 1);
        assert_eq!(prd.metadata.as_ref().unwrap().total_iterations, 1);
    }

    #[test]
    fn test_prd_executions_trimming() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");

        // Start more than MAX_EMBEDDED_EXECUTIONS
        for i in 1..=15 {
            prd.start_execution(format!("exec-{}", i), AgentType::Claude);
        }

        // Should be trimmed to MAX_EMBEDDED_EXECUTIONS
        assert_eq!(prd.executions.len(), super::MAX_EMBEDDED_EXECUTIONS);
        // The most recent execution should still be there
        assert_eq!(prd.current_execution().unwrap().id, "exec-15");
    }

    #[test]
    fn test_prd_all_iterations() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");

        prd.start_execution("exec-1", AgentType::Claude);
        prd.add_iteration(IterationRecord {
            id: "iter-1".to_string(),
            execution_id: "exec-1".to_string(),
            iteration: 1,
            outcome: IterationOutcome::Success,
            duration_secs: 30.0,
            agent_type: AgentType::Claude,
            rate_limit_encountered: false,
            error_message: None,
            started_at: "2024-01-01T00:00:00Z".to_string(),
            completed_at: Some("2024-01-01T00:00:30Z".to_string()),
        });

        prd.start_execution("exec-2", AgentType::Opencode);
        prd.add_iteration(IterationRecord {
            id: "iter-2".to_string(),
            execution_id: "exec-2".to_string(),
            iteration: 1,
            outcome: IterationOutcome::Failed,
            duration_secs: 45.0,
            agent_type: AgentType::Opencode,
            rate_limit_encountered: true,
            error_message: Some("Rate limit".to_string()),
            started_at: "2024-01-01T00:01:00Z".to_string(),
            completed_at: Some("2024-01-01T00:01:45Z".to_string()),
        });

        let all_iters = prd.all_iterations();
        assert_eq!(all_iters.len(), 2);
    }

    #[test]
    fn test_prd_with_executions_serialization() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");
        prd.add_story(RalphStory::new("1", "Story 1", "Acceptance"));

        prd.start_execution("exec-1", AgentType::Claude);
        prd.add_iteration(IterationRecord {
            id: "iter-1".to_string(),
            execution_id: "exec-1".to_string(),
            iteration: 1,
            outcome: IterationOutcome::Success,
            duration_secs: 60.0,
            agent_type: AgentType::Claude,
            rate_limit_encountered: false,
            error_message: None,
            started_at: "2024-01-01T00:00:00Z".to_string(),
            completed_at: Some("2024-01-01T00:01:00Z".to_string()),
        });

        let json = serde_json::to_string_pretty(&prd).unwrap();
        assert!(json.contains("executions"));
        assert!(json.contains("exec-1"));
        assert!(json.contains("iter-1"));

        let parsed: RalphPrd = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.executions.len(), 1);
        assert_eq!(parsed.executions[0].iterations.len(), 1);
    }

    #[test]
    fn test_execution_status_display() {
        assert_eq!(ExecutionStatus::Running.to_string(), "running");
        assert_eq!(ExecutionStatus::Completed.to_string(), "completed");
        assert_eq!(ExecutionStatus::Stopped.to_string(), "stopped");
        assert_eq!(ExecutionStatus::Failed.to_string(), "failed");
        assert_eq!(ExecutionStatus::Interrupted.to_string(), "interrupted");
    }

    // ============================================================================
    // PrdExecutionConfig Tests (US-002)
    // ============================================================================

    #[test]
    fn test_prd_execution_config_default() {
        let config = PrdExecutionConfig::default();
        assert!(config.agent_type.is_none());
        assert!(config.model.is_none());
        assert!(config.max_iterations.is_none());
        assert!(config.max_cost.is_none());
        assert!(config.run_tests.is_none());
        assert!(config.run_lint.is_none());
        assert!(config.use_worktree.is_none());
        assert!(!config.has_any_fields());
    }

    #[test]
    fn test_prd_execution_config_has_any_fields() {
        let mut config = PrdExecutionConfig::default();
        assert!(!config.has_any_fields());

        config.agent_type = Some("claude".to_string());
        assert!(config.has_any_fields());

        config.agent_type = None;
        config.max_iterations = Some(50);
        assert!(config.has_any_fields());
    }

    #[test]
    fn test_prd_execution_config_validation_success() {
        let config = PrdExecutionConfig {
            agent_type: Some("claude".to_string()),
            model: Some("claude-sonnet-4-5".to_string()),
            max_iterations: Some(50),
            max_cost: Some(10.0),
            run_tests: Some(true),
            run_lint: Some(true),
            use_worktree: Some(true),
            ..Default::default()
        };
        assert!(config.validate().is_ok());
    }

    #[test]
    fn test_prd_execution_config_validation_invalid_agent_type() {
        let config = PrdExecutionConfig {
            agent_type: Some("invalid_agent".to_string()),
            ..Default::default()
        };
        let result = config.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid agent_type"));
    }

    #[test]
    fn test_prd_execution_config_validation_zero_iterations() {
        let config = PrdExecutionConfig {
            max_iterations: Some(0),
            ..Default::default()
        };
        let result = config.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("max_iterations must be greater than 0"));
    }

    #[test]
    fn test_prd_execution_config_validation_negative_cost() {
        let config = PrdExecutionConfig {
            max_cost: Some(-5.0),
            ..Default::default()
        };
        let result = config.validate();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("max_cost cannot be negative"));
    }

    #[test]
    fn test_prd_with_execution_config_serialization() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");
        prd.execution_config = Some(PrdExecutionConfig {
            agent_type: Some("claude".to_string()),
            model: Some("claude-sonnet-4-5".to_string()),
            max_iterations: Some(100),
            max_cost: Some(25.0),
            run_tests: Some(true),
            run_lint: Some(false),
            use_worktree: Some(true),
            agent_timeout_secs: Some(1800),
            template_name: Some("default".to_string()),
            auto_create_prs: Some(true),
            draft_prs: Some(false),
            merge_strategy: None,
            merge_interval: None,
            conflict_resolution: None,
            merge_target_branch: None,
        });

        let json = serde_json::to_string_pretty(&prd).unwrap();
        assert!(json.contains("executionConfig"));
        assert!(json.contains("agentType"));
        assert!(json.contains("claude"));
        assert!(json.contains("maxIterations"));
        assert!(json.contains("100"));

        // Verify round-trip
        let parsed: RalphPrd = serde_json::from_str(&json).unwrap();
        assert!(parsed.execution_config.is_some());
        let config = parsed.execution_config.unwrap();
        assert_eq!(config.agent_type, Some("claude".to_string()));
        assert_eq!(config.max_iterations, Some(100));
        assert_eq!(config.max_cost, Some(25.0));
        assert_eq!(config.run_tests, Some(true));
        assert_eq!(config.run_lint, Some(false));
        assert_eq!(config.agent_timeout_secs, Some(1800));
    }

    #[test]
    fn test_prd_without_execution_config_backward_compatible() {
        // Simulate JSON from before execution_config existed
        let json = r#"{
            "title": "Old PRD",
            "branch": "feature/old",
            "stories": []
        }"#;

        let parsed: RalphPrd = serde_json::from_str(json).unwrap();
        assert!(parsed.execution_config.is_none());
        assert_eq!(parsed.title, "Old PRD");
        assert_eq!(parsed.branch, "feature/old");
    }

    #[test]
    fn test_prd_with_partial_execution_config() {
        // Simulate JSON with only some execution_config fields set
        let json = r#"{
            "title": "Partial Config PRD",
            "branch": "feature/partial",
            "stories": [],
            "executionConfig": {
                "maxIterations": 75,
                "runTests": true
            }
        }"#;

        let parsed: RalphPrd = serde_json::from_str(json).unwrap();
        assert!(parsed.execution_config.is_some());
        let config = parsed.execution_config.unwrap();
        assert_eq!(config.max_iterations, Some(75));
        assert_eq!(config.run_tests, Some(true));
        assert!(config.agent_type.is_none());
        assert!(config.model.is_none());
        assert!(config.max_cost.is_none());
    }

    // =========================================================================
    // US-2.1: Multiple Agents on Same PRD Tests
    // =========================================================================

    #[test]
    fn test_next_available_story_excludes_assigned() {
        // US-2.1: System assigns different stories to each agent
        let mut prd = RalphPrd::new("Multi-Agent PRD", "feature/multi");

        let mut s1 = RalphStory::new("US-1.1", "First story", "Acceptance 1");
        s1.priority = 100;
        let mut s2 = RalphStory::new("US-1.2", "Second story", "Acceptance 2");
        s2.priority = 100;
        let mut s3 = RalphStory::new("US-1.3", "Third story", "Acceptance 3");
        s3.priority = 100;

        prd.add_story(s1);
        prd.add_story(s2);
        prd.add_story(s3);

        // With no assignments, first story is returned
        let assigned: Vec<String> = vec![];
        let next = prd.next_available_story(&assigned).unwrap();
        assert_eq!(next.id, "US-1.1");

        // With US-1.1 assigned, US-1.2 is returned
        let assigned = vec!["US-1.1".to_string()];
        let next = prd.next_available_story(&assigned).unwrap();
        assert_eq!(next.id, "US-1.2");

        // With US-1.1 and US-1.2 assigned, US-1.3 is returned
        let assigned = vec!["US-1.1".to_string(), "US-1.2".to_string()];
        let next = prd.next_available_story(&assigned).unwrap();
        assert_eq!(next.id, "US-1.3");

        // With all assigned, no story available
        let assigned = vec![
            "US-1.1".to_string(),
            "US-1.2".to_string(),
            "US-1.3".to_string(),
        ];
        assert!(prd.next_available_story(&assigned).is_none());
    }

    #[test]
    fn test_next_available_story_respects_dependencies() {
        // US-2.1: Assignment respects story dependencies
        let mut prd = RalphPrd::new("Multi-Agent PRD", "feature/multi");

        let mut s1 = RalphStory::new("US-1.1", "First story", "Acceptance 1");
        s1.priority = 100;
        let mut s2 = RalphStory::new("US-1.2", "Second story", "Acceptance 2");
        s2.priority = 100;
        s2.dependencies = vec!["US-1.1".to_string()]; // Depends on US-1.1
        let mut s3 = RalphStory::new("US-1.3", "Third story", "Acceptance 3");
        s3.priority = 100;

        prd.add_story(s1);
        prd.add_story(s2);
        prd.add_story(s3);

        // US-1.1 is assigned to agent 1
        let assigned = vec!["US-1.1".to_string()];

        // US-1.2 depends on US-1.1 (not passed yet), so US-1.3 should be returned
        let next = prd.next_available_story(&assigned).unwrap();
        assert_eq!(next.id, "US-1.3"); // Not US-1.2 because dependency not satisfied

        // After US-1.1 passes, US-1.2 becomes available
        prd.mark_story_passing("US-1.1");
        let assigned: Vec<String> = vec![]; // Agent 1 finished
        let next = prd.next_available_story(&assigned).unwrap();
        assert_eq!(next.id, "US-1.2");
    }

    #[test]
    fn test_next_available_story_respects_priority() {
        // US-2.1: System assigns by priority
        let mut prd = RalphPrd::new("Multi-Agent PRD", "feature/multi");

        let mut s1 = RalphStory::new("US-1.1", "Low priority", "Acceptance 1");
        s1.priority = 200;
        let mut s2 = RalphStory::new("US-1.2", "High priority", "Acceptance 2");
        s2.priority = 50;
        let mut s3 = RalphStory::new("US-1.3", "Medium priority", "Acceptance 3");
        s3.priority = 100;

        prd.add_story(s1);
        prd.add_story(s2);
        prd.add_story(s3);

        // High priority (US-1.2) should be returned first
        let assigned: Vec<String> = vec![];
        let next = prd.next_available_story(&assigned).unwrap();
        assert_eq!(next.id, "US-1.2");

        // With US-1.2 assigned, medium priority (US-1.3) should be next
        let assigned = vec!["US-1.2".to_string()];
        let next = prd.next_available_story(&assigned).unwrap();
        assert_eq!(next.id, "US-1.3");
    }

    #[test]
    fn test_available_stories_returns_all_unassigned() {
        // US-2.1: Can get all available stories
        let mut prd = RalphPrd::new("Multi-Agent PRD", "feature/multi");

        let mut s1 = RalphStory::new("US-1.1", "Story 1", "A");
        s1.priority = 100;
        let mut s2 = RalphStory::new("US-1.2", "Story 2", "A");
        s2.priority = 50;
        let mut s3 = RalphStory::new("US-1.3", "Story 3", "A");
        s3.priority = 150;

        prd.add_story(s1);
        prd.add_story(s2);
        prd.add_story(s3);

        // All available, sorted by priority
        let assigned: Vec<String> = vec![];
        let available = prd.available_stories(&assigned);
        assert_eq!(available.len(), 3);
        assert_eq!(available[0].id, "US-1.2"); // Priority 50
        assert_eq!(available[1].id, "US-1.1"); // Priority 100
        assert_eq!(available[2].id, "US-1.3"); // Priority 150

        // With one assigned
        let assigned = vec!["US-1.2".to_string()];
        let available = prd.available_stories(&assigned);
        assert_eq!(available.len(), 2);
        assert!(!available.iter().any(|s| s.id == "US-1.2"));
    }

    #[test]
    fn test_available_stories_excludes_completed() {
        // US-2.1: Completed stories are not available
        let mut prd = RalphPrd::new("Multi-Agent PRD", "feature/multi");

        let mut s1 = RalphStory::new("US-1.1", "Story 1", "A");
        s1.passes = true; // Already completed
        let mut s2 = RalphStory::new("US-1.2", "Story 2", "A");
        s2.passes = false;

        prd.add_story(s1);
        prd.add_story(s2);

        let assigned: Vec<String> = vec![];
        let available = prd.available_stories(&assigned);
        assert_eq!(available.len(), 1);
        assert_eq!(available[0].id, "US-1.2");
    }

    #[test]
    fn test_available_stories_excludes_blocked() {
        // US-2.1: Blocked stories (unsatisfied dependencies) are not available
        let mut prd = RalphPrd::new("Multi-Agent PRD", "feature/multi");

        let mut s1 = RalphStory::new("US-1.1", "Story 1", "A");
        s1.passes = false;
        let mut s2 = RalphStory::new("US-1.2", "Story 2", "A");
        s2.passes = false;
        s2.dependencies = vec!["US-1.1".to_string()]; // Blocked

        prd.add_story(s1);
        prd.add_story(s2);

        let assigned: Vec<String> = vec![];
        let available = prd.available_stories(&assigned);
        assert_eq!(available.len(), 1);
        assert_eq!(available[0].id, "US-1.1");

        // After US-1.1 passes, US-1.2 becomes available
        prd.mark_story_passing("US-1.1");
        let available = prd.available_stories(&assigned);
        assert_eq!(available.len(), 1);
        assert_eq!(available[0].id, "US-1.2");
    }

    #[test]
    fn test_multi_agent_scenario() {
        // US-2.1: Full multi-agent scenario
        let mut prd = RalphPrd::new("Multi-Agent PRD", "feature/multi");

        // 5 stories with various dependencies
        let mut s1 = RalphStory::new("US-1", "Foundation", "A");
        s1.priority = 100;
        let mut s2 = RalphStory::new("US-2", "Feature A", "A");
        s2.priority = 100;
        s2.dependencies = vec!["US-1".to_string()];
        let mut s3 = RalphStory::new("US-3", "Feature B", "A");
        s3.priority = 100;
        s3.dependencies = vec!["US-1".to_string()];
        let mut s4 = RalphStory::new("US-4", "Integration", "A");
        s4.priority = 100;
        s4.dependencies = vec!["US-2".to_string(), "US-3".to_string()];
        let mut s5 = RalphStory::new("US-5", "Independent", "A");
        s5.priority = 200; // Lower priority

        prd.add_story(s1);
        prd.add_story(s2);
        prd.add_story(s3);
        prd.add_story(s4);
        prd.add_story(s5);

        // Initially: US-1 and US-5 are available (others blocked by deps)
        let assigned: Vec<String> = vec![];
        let available = prd.available_stories(&assigned);
        assert_eq!(available.len(), 2);

        // Agent 1 takes US-1 (higher priority)
        let assigned = vec!["US-1".to_string()];
        let next = prd.next_available_story(&assigned).unwrap();
        assert_eq!(next.id, "US-5"); // Only US-5 left that's not blocked

        // Agent 1 completes US-1
        prd.mark_story_passing("US-1");

        // Now US-2 and US-3 are unblocked
        let assigned: Vec<String> = vec![];
        let available = prd.available_stories(&assigned);
        assert_eq!(available.len(), 3); // US-2, US-3, US-5 (US-4 still blocked)

        // Agent 1 takes US-2, Agent 2 takes US-3
        let assigned = vec!["US-2".to_string(), "US-3".to_string()];
        let next = prd.next_available_story(&assigned);
        assert_eq!(next.unwrap().id, "US-5"); // Only US-5 available (US-4 blocked)

        // Both agents complete their work
        prd.mark_story_passing("US-2");
        prd.mark_story_passing("US-3");

        // Now US-4 is available
        let assigned: Vec<String> = vec![];
        let available = prd.available_stories(&assigned);
        assert_eq!(available.len(), 2); // US-4 and US-5
    }

    // =========================================================================
    // Assignment Strategy Tests (US-4.2)
    // =========================================================================

    #[test]
    fn test_assignment_strategy_default() {
        let strategy = AssignmentStrategy::default();
        assert_eq!(strategy, AssignmentStrategy::Priority);
    }

    #[test]
    fn test_next_available_story_with_priority_strategy() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");

        let mut s1 = RalphStory::new("US-1", "First", "A");
        s1.priority = 50;

        let mut s2 = RalphStory::new("US-2", "Second", "B");
        s2.priority = 100;

        let mut s3 = RalphStory::new("US-3", "Third", "C");
        s3.priority = 25; // Highest priority

        prd.add_story(s1);
        prd.add_story(s2);
        prd.add_story(s3);

        let assigned: Vec<String> = vec![];
        let estimated_files: HashMap<String, Vec<String>> = HashMap::new();

        // Priority strategy should pick US-3 (priority 25)
        let next = prd.next_available_story_with_strategy(
            &assigned,
            AssignmentStrategy::Priority,
            &estimated_files,
        );
        assert_eq!(next.unwrap().id, "US-3");
    }

    #[test]
    fn test_next_available_story_with_minimal_conflict_strategy() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");

        let mut s1 = RalphStory::new("US-1", "Frontend", "A");
        s1.priority = 100;

        let mut s2 = RalphStory::new("US-2", "Backend", "B");
        s2.priority = 100;

        let mut s3 = RalphStory::new("US-3", "Config", "C");
        s3.priority = 100;

        prd.add_story(s1);
        prd.add_story(s2);
        prd.add_story(s3);

        // Build estimated files map showing in-progress work
        // "In-progress" assignments are represented by having files in the map
        // US-2 (in progress) has 3 files
        // US-3 (in progress) has 2 files
        // US-1 (candidate) needs files:
        //   - overlaps 2 files with US-2 (high conflict)
        //   - overlaps 1 file with US-3 (lower conflict)
        // Total conflicts for US-1: 3
        //
        // Let's make US-2 have 5 files so it has more conflicts with US-1
        let mut estimated_files: HashMap<String, Vec<String>> = HashMap::new();

        // These are "in-progress" assignments (already assigned to other agents)
        estimated_files.insert(
            "US-2".to_string(),
            vec![
                "src/components/Button.tsx".to_string(),
                "src/components/Card.tsx".to_string(),
                "src/lib/api.ts".to_string(),
                "src/stores/uiStore.ts".to_string(),
                "src/stores/sessionStore.ts".to_string(),
            ],
        );
        estimated_files.insert(
            "US-3".to_string(),
            vec!["config.json".to_string(), "server/src/models.rs".to_string()],
        );

        // US-1 (candidate story) has these files:
        // overlaps with US-2: Button.tsx, Card.tsx (2 conflicts)
        // overlaps with US-3: none (0 conflicts)
        // Total: 2 conflicts
        estimated_files.insert(
            "US-1".to_string(),
            vec![
                "src/components/Button.tsx".to_string(),
                "src/components/Card.tsx".to_string(),
                "src/pages/Home.tsx".to_string(),
            ],
        );

        let assigned: Vec<String> = vec![];

        // MinimalConflict strategy should pick US-3 (0 conflicts is minimal)
        let next = prd.next_available_story_with_strategy(
            &assigned,
            AssignmentStrategy::MinimalConflict,
            &estimated_files,
        );
        assert_eq!(next.unwrap().id, "US-3");
    }

    #[test]
    fn test_score_story_by_conflict() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");

        let s1 = RalphStory::new("US-1", "Story 1", "A");
        let s2 = RalphStory::new("US-2", "Story 2", "B");

        prd.add_story(s1);
        prd.add_story(s2);

        // Create a map where US-1 has 3 overlapping files with US-2
        let mut estimated_files: HashMap<String, Vec<String>> = HashMap::new();
        estimated_files.insert(
            "US-1".to_string(),
            vec![
                "src/components/Button.tsx".to_string(),
                "src/lib/api.ts".to_string(),
                "src/stores/store.ts".to_string(),
            ],
        );
        estimated_files.insert(
            "US-2".to_string(),
            vec![
                "src/components/Button.tsx".to_string(),
                "src/lib/api.ts".to_string(),
                "src/stores/store.ts".to_string(),
                "server/src/auth.rs".to_string(),
            ],
        );

        // Score US-1 against US-2's files
        let score = prd.score_story_by_conflict("US-1", &estimated_files);
        assert_eq!(score, 3); // 3 files overlap

        // Score US-2 against US-1's files
        let score = prd.score_story_by_conflict("US-2", &estimated_files);
        assert_eq!(score, 3); // 3 files overlap
    }

    #[test]
    fn test_score_story_no_overlap() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");

        let s1 = RalphStory::new("US-1", "Story 1", "A");
        let s2 = RalphStory::new("US-2", "Story 2", "B");

        prd.add_story(s1);
        prd.add_story(s2);

        // Create a map where stories have no overlapping files
        let mut estimated_files: HashMap<String, Vec<String>> = HashMap::new();
        estimated_files.insert(
            "US-1".to_string(),
            vec!["src/components/Button.tsx".to_string()],
        );
        estimated_files.insert(
            "US-2".to_string(),
            vec!["server/src/auth.rs".to_string()],
        );

        // Score should be 0 (no overlap)
        let score = prd.score_story_by_conflict("US-1", &estimated_files);
        assert_eq!(score, 0);

        let score = prd.score_story_by_conflict("US-2", &estimated_files);
        assert_eq!(score, 0);
    }

    #[test]
    fn test_score_story_no_estimated_files() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");

        let s1 = RalphStory::new("US-1", "Story 1", "A");
        prd.add_story(s1);

        let estimated_files: HashMap<String, Vec<String>> = HashMap::new();

        // Score should be 0 when no estimated files
        let score = prd.score_story_by_conflict("US-1", &estimated_files);
        assert_eq!(score, 0);
    }
}
