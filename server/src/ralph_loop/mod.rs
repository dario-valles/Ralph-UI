//! Ralph Wiggum Loop - External orchestration for PRD execution
//!
//! This module implements the "true" Ralph Wiggum Loop pattern where:
//! - The loop runs OUTSIDE the agent (not delegated to the CLI)
//! - Each iteration spawns a FRESH agent instance (clean context)
//! - Progress persists in FILES (prd.json, progress.txt) + git commits
//! - Loop repeats until all tasks pass or max iterations reached
//!
//! Key insight from Theo: "The Ralph loop controls Claude Code, not Claude Code controlling the Ralph loop"

mod assignments_manager;
mod brief_builder;
mod completion;
mod config;
pub mod fallback_orchestrator;
mod learnings_manager;
pub mod merge_coordinator;
pub mod parallel_orchestrator;
mod prd_executor;
mod progress_tracker;
mod prompt_builder;
pub mod retry;
mod types;
pub mod worktree_pool;

pub use assignments_manager::*;
pub use brief_builder::*;
pub use completion::*;
pub use config::*;
pub use fallback_orchestrator::{FallbackOrchestrator, FallbackStats};
pub use learnings_manager::*;
pub use merge_coordinator::{CompletedWork, ConflictInfo, MergeCoordinator, MergeResult};
pub use parallel_orchestrator::{ParallelAgentState, ParallelAgentStatus, ParallelOrchestrator};
pub use prd_executor::*;
pub use progress_tracker::*;
pub use prompt_builder::*;
pub use retry::{is_retryable_error, RetryConfig, RetryResult};
pub use types::*;
pub use worktree_pool::{WorktreeAllocation, WorktreePool};

use crate::agents::manager::AgentManager;
use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
use crate::models::AgentType;
use crate::utils::lock_mutex_recover;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

/// Configuration for a Ralph loop execution
///
/// # Simplified Worktree Approach
///
/// Unlike the parallel execution system which creates multiple worktrees (one per task),
/// the Ralph Loop uses a single working directory per PRD execution. This follows
/// Theo's insight: "By throwing away the parallelism aspect, you end up reducing a
/// lot of the complexity which allows this method to be more reliable."
///
/// The agent works directly in `project_path`:
/// - If `branch` is specified, commits happen on that branch
/// - If `use_worktree` is true, a dedicated worktree is created for isolation
/// - Progress is tracked in files at `.ralph-ui/prds/{prd_name}.json`, `.ralph-ui/prds/{prd_name}-progress.txt`
/// - Git history provides persistent memory across iterations
#[derive(Debug, Clone)]
pub struct RalphLoopConfig {
    /// Path to the project directory (or worktree if use_worktree is enabled)
    pub project_path: PathBuf,
    /// Agent type to use (Claude, OpenCode, etc.)
    pub agent_type: AgentType,
    /// Model to use (e.g., "claude-sonnet-4-5")
    pub model: Option<String>,
    /// Maximum iterations before stopping (safety limit)
    pub max_iterations: u32,
    /// Whether to run tests before marking tasks complete
    pub run_tests: bool,
    /// Whether to run lint before marking tasks complete
    pub run_lint: bool,
    /// Branch to work on (defaults to current branch)
    pub branch: Option<String>,
    /// Custom completion promise (default: "<promise>COMPLETE</promise>")
    pub completion_promise: Option<String>,
    /// Maximum cost limit in dollars (safety limit)
    pub max_cost: Option<f64>,
    /// Whether to create a dedicated worktree for isolation (default: false)
    /// When enabled, a worktree is created at start and merged back at completion.
    /// This provides isolation from the main working directory.
    pub use_worktree: bool,
    /// Retry configuration for transient errors (rate limits, timeouts)
    pub retry_config: RetryConfig,
    /// Error handling strategy when iterations fail
    pub error_strategy: ErrorStrategy,
    /// Fallback chain configuration for rate limit handling
    pub fallback_config: Option<FallbackChainConfig>,
    /// Timeout in seconds for each agent iteration (default: 1800 = 30 minutes)
    /// Set to 0 for no timeout (wait indefinitely)
    pub agent_timeout_secs: u64,
    /// PRD name (required) - e.g., "my-feature-a1b2c3d4"
    ///
    /// PRD files are stored at `.ralph-ui/prds/{prd_name}.json`
    pub prd_name: String,
    /// Template name to use for prompt generation (US-014)
    /// If None, uses the default hardcoded prompt
    pub template_name: Option<String>,
    /// Custom test command (e.g., "npm test", "cargo test")
    /// If None, auto-detect based on project type
    pub test_command: Option<String>,
    /// Custom lint command (e.g., "npm run lint", "cargo clippy")
    /// If None, auto-detect based on project type
    pub lint_command: Option<String>,
    /// Environment variables to inject when spawning the agent
    /// Used for alternative API providers (z.ai, MiniMax)
    pub env_vars: Option<std::collections::HashMap<String, String>>,
    /// Execution mode: sequential (default) or parallel (Beta)
    /// Sequential runs one story at a time, parallel runs multiple independent stories
    pub execution_mode: crate::commands::ralph_loop::RalphExecutionMode,
    /// Maximum parallel agents when using parallel execution mode (default: 3)
    pub max_parallel: u32,
}

impl Default for RalphLoopConfig {
    fn default() -> Self {
        Self {
            project_path: PathBuf::new(),
            agent_type: AgentType::Claude,
            model: None,
            max_iterations: 50,
            run_tests: true,
            run_lint: true,
            branch: None,
            completion_promise: None,
            max_cost: None,
            use_worktree: false,
            retry_config: RetryConfig::default(),
            error_strategy: ErrorStrategy::default(),
            fallback_config: None,
            agent_timeout_secs: 0, // No timeout by default (wait indefinitely)
            prd_name: String::new(), // Must be set before use
            template_name: None,   // Use default prompt
            test_command: None,    // Auto-detect based on project type
            lint_command: None,    // Auto-detect based on project type
            env_vars: None,        // No extra env vars by default
            execution_mode: crate::commands::ralph_loop::RalphExecutionMode::Sequential,
            max_parallel: 3, // Default to 3 parallel agents
        }
    }
}

/// State of a running Ralph loop
#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum RalphLoopState {
    /// Loop has not started
    Idle,
    /// Loop is running, currently on iteration N
    Running { iteration: u32 },
    /// Loop is retrying after a transient error
    Retrying {
        iteration: u32,
        attempt: u32,
        reason: String,
        delay_ms: u64,
    },
    /// Loop is paused (can be resumed)
    Paused { iteration: u32, reason: String },
    /// Loop completed successfully (all tasks pass)
    Completed { total_iterations: u32 },
    /// Loop failed (max iterations, max cost, or error)
    Failed { iteration: u32, reason: String },
    /// Loop was cancelled by user
    Cancelled { iteration: u32 },
}

/// Status update event emitted during Ralph loop execution
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphLoopStatusEvent {
    /// Unique execution ID
    pub execution_id: String,
    /// Current state
    pub state: RalphLoopState,
    /// Current PRD status (stories with pass/fail)
    pub prd_status: Option<PrdStatus>,
    /// Current iteration metrics
    pub iteration_metrics: Option<IterationMetrics>,
    /// Timestamp
    pub timestamp: String,
    /// Current agent ID (for terminal connection)
    pub current_agent_id: Option<String>,
    /// Worktree path if using worktree isolation
    pub worktree_path: Option<String>,
    /// Branch name for this execution
    pub branch: Option<String>,
    /// Progress message for UI display
    pub progress_message: Option<String>,
}

/// Metrics for a single iteration
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IterationMetrics {
    /// Iteration number (1-indexed)
    pub iteration: u32,
    /// Tokens used in this iteration
    pub tokens: u64,
    /// Input tokens used in this iteration
    pub input_tokens: u64,
    /// Output tokens used in this iteration
    pub output_tokens: u64,
    /// Cost of this iteration in dollars
    pub cost: f64,
    /// Duration in seconds
    pub duration_secs: f64,
    /// Story that was worked on (if identified)
    pub story_id: Option<String>,
    /// Whether the story was marked as passing
    pub story_completed: bool,
    /// Exit code of the agent
    pub exit_code: i32,
    /// Number of retry attempts made
    pub retry_attempts: u32,
    /// Whether this iteration was retried
    pub was_retried: bool,
}

/// Cumulative metrics for an entire Ralph loop execution
#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphLoopMetrics {
    /// Total iterations run
    pub total_iterations: u32,
    /// Total tokens used
    pub total_tokens: u64,
    /// Total cost in dollars
    pub total_cost: f64,
    /// Total duration in seconds
    pub total_duration_secs: f64,
    /// Stories completed
    pub stories_completed: u32,
    /// Stories remaining
    pub stories_remaining: u32,
    /// Per-iteration metrics
    pub iterations: Vec<IterationMetrics>,
}

/// Snapshot of execution state for external access
#[derive(Debug, Clone, Default)]
pub struct ExecutionSnapshot {
    pub state: Option<RalphLoopState>,
    pub metrics: Option<RalphLoopMetrics>,
    pub current_agent_id: Option<String>,
    pub worktree_path: Option<String>,
    pub project_path: Option<String>,
}

/// Type alias for snapshot storage
pub type SnapshotStore = Arc<Mutex<std::collections::HashMap<String, ExecutionSnapshot>>>;

/// The main Ralph Loop orchestrator
///
/// This struct manages the execution of a PRD using the Ralph Wiggum Loop pattern.
/// It spawns fresh agent instances for each iteration and tracks progress via files.
pub struct RalphLoopOrchestrator {
    /// Configuration for this execution
    config: RalphLoopConfig,
    /// Unique execution ID
    execution_id: String,
    /// Current state
    state: RalphLoopState,
    /// PRD executor for file operations
    prd_executor: PrdExecutor,
    /// Progress tracker for learnings
    progress_tracker: ProgressTracker,
    /// Prompt builder for generating iteration prompts
    prompt_builder: PromptBuilder,
    /// Brief builder for generating BRIEF.md (US-1.1: Resume After Rate Limit)
    brief_builder: BriefBuilder,
    /// Assignments manager for crash recovery (US-1.2)
    assignments_manager: AssignmentsManager,
    /// Learnings manager for structured learnings (US-1.2)
    learnings_manager: LearningsManager,
    /// Completion detector
    completion_detector: CompletionDetector,
    /// Cumulative metrics
    metrics: RalphLoopMetrics,
    /// Channel for sending status updates
    status_tx: Option<mpsc::UnboundedSender<RalphLoopStatusEvent>>,
    /// Direct snapshot store for synchronous updates (bypasses async channel issues)
    snapshot_store: Option<SnapshotStore>,
    /// Flag to signal cancellation
    cancelled: Arc<Mutex<bool>>,
    /// Current agent ID for terminal connection
    current_agent_id: Option<String>,
    /// Worktree path if using worktree isolation
    worktree_path: Option<PathBuf>,
    /// Effective working path (worktree if enabled, otherwise project_path)
    working_path: PathBuf,
    /// Current progress message for UI
    progress_message: Option<String>,
    /// Fallback orchestrator for managing agent fallbacks on rate limits
    fallback_orchestrator: Option<FallbackOrchestrator>,
    /// Currently active agent type (may differ from config due to fallback)
    active_agent_type: AgentType,
}

impl RalphLoopOrchestrator {
    /// Create a new Ralph Loop orchestrator
    pub fn new(config: RalphLoopConfig) -> Self {
        let execution_id = uuid::Uuid::new_v4().to_string();
        let working_path = config.project_path.clone();

        let completion_promise = config
            .completion_promise
            .clone()
            .unwrap_or_else(|| "<promise>COMPLETE</promise>".to_string());

        // Initialize fallback orchestrator if config is provided
        let fallback_orchestrator = config
            .fallback_config
            .clone()
            .map(FallbackOrchestrator::new);
        let active_agent_type = config.agent_type;

        // Create executors for .ralph-ui/prds/{prd_name}.*
        let prd_executor = PrdExecutor::new(&config.project_path, &config.prd_name);
        let progress_tracker = ProgressTracker::new(&config.project_path, &config.prd_name);
        let prompt_builder = PromptBuilder::new(&config.project_path, &config.prd_name);
        let brief_builder = BriefBuilder::new(&config.project_path, &config.prd_name);

        // Create managers for crash recovery (US-1.2: Resume After Crash)
        let assignments_manager = AssignmentsManager::new(&config.project_path, &config.prd_name);
        let learnings_manager = LearningsManager::new(&config.project_path, &config.prd_name);

        Self {
            prd_executor,
            progress_tracker,
            prompt_builder,
            brief_builder,
            assignments_manager,
            learnings_manager,
            completion_detector: CompletionDetector::new(&completion_promise),
            config,
            execution_id,
            state: RalphLoopState::Idle,
            metrics: RalphLoopMetrics::default(),
            status_tx: None,
            snapshot_store: None,
            cancelled: Arc::new(Mutex::new(false)),
            current_agent_id: None,
            worktree_path: None,
            working_path,
            progress_message: None,
            fallback_orchestrator,
            active_agent_type,
        }
    }

    /// Get the currently active agent type (may differ from config due to fallback)
    pub fn active_agent_type(&self) -> AgentType {
        self.active_agent_type
    }

    /// Get fallback statistics if fallback orchestrator is enabled
    pub fn fallback_stats(&self) -> Option<FallbackStats> {
        self.fallback_orchestrator.as_ref().map(|fo| fo.get_stats())
    }

    /// Get the agent type to use for the next iteration
    ///
    /// If fallback orchestrator is enabled, consults it to handle rate limits.
    /// Otherwise returns the configured agent type.
    fn get_agent_for_iteration(&mut self) -> AgentType {
        if let Some(ref mut fo) = self.fallback_orchestrator {
            let agent = fo.get_agent_for_iteration();
            self.active_agent_type = agent;
            agent
        } else {
            self.config.agent_type
        }
    }

    /// Report a successful iteration to the fallback orchestrator
    fn report_iteration_success(&mut self, agent: AgentType) {
        if let Some(ref mut fo) = self.fallback_orchestrator {
            fo.report_success(agent);
        }
    }

    /// Report an error to the fallback orchestrator
    ///
    /// Returns the next agent to try if a fallback is available.
    fn report_iteration_error(
        &mut self,
        agent: AgentType,
        is_rate_limit: bool,
    ) -> Option<AgentType> {
        if let Some(ref mut fo) = self.fallback_orchestrator {
            fo.report_error(agent, is_rate_limit)
        } else {
            None
        }
    }

    /// Set the snapshot store for direct status updates
    pub fn set_snapshot_store(&mut self, store: SnapshotStore) {
        self.snapshot_store = Some(store);
    }

    /// Get the worktree path if using worktree isolation
    pub fn worktree_path(&self) -> Option<&PathBuf> {
        self.worktree_path.as_ref()
    }

    /// Get the effective working path (worktree or project_path)
    pub fn working_path(&self) -> &PathBuf {
        &self.working_path
    }

    /// Set the status update channel
    pub fn set_status_sender(&mut self, tx: mpsc::UnboundedSender<RalphLoopStatusEvent>) {
        self.status_tx = Some(tx);
    }

    /// Get a handle to cancel the loop
    pub fn get_cancel_handle(&self) -> Arc<Mutex<bool>> {
        self.cancelled.clone()
    }

    /// Get the current execution ID
    pub fn execution_id(&self) -> &str {
        &self.execution_id
    }

    /// Get the current state
    pub fn state(&self) -> &RalphLoopState {
        &self.state
    }

    /// Get current metrics
    pub fn metrics(&self) -> &RalphLoopMetrics {
        &self.metrics
    }

    /// Get current agent ID (for terminal connection)
    pub fn current_agent_id(&self) -> Option<&str> {
        self.current_agent_id.as_deref()
    }

    /// Initialize the Ralph loop (create directories and files if needed)
    ///
    /// Files are stored at `.ralph-ui/prds/{prd_name}.json`, etc.
    pub fn initialize(&mut self, prd: &RalphPrd) -> Result<(), String> {
        // Write initial PRD JSON (directory creation is handled by write_prd)
        self.prd_executor.write_prd(prd)?;

        // Initialize progress file
        self.progress_tracker.initialize()?;

        // Generate initial prompt file
        self.prompt_builder.generate_prompt(&self.config)?;

        // Generate initial BRIEF.md (US-1.1: Resume After Rate Limit, US-1.3: Context Handoff)
        // Use learnings manager for structured learnings from all agents
        self.brief_builder.generate_brief_with_learnings_manager(
            prd,
            &self.learnings_manager,
            Some(1),
        )?;

        // Initialize crash recovery state (US-1.2: Resume After Crash)
        self.assignments_manager.initialize(&self.execution_id)?;
        self.learnings_manager.initialize()?;

        self.state = RalphLoopState::Idle;
        self.emit_status();

        Ok(())
    }

    /// Check if this PRD execution can be resumed after a crash
    ///
    /// Returns true if there's existing assignment state that can be restored.
    pub fn can_resume(&self) -> bool {
        self.assignments_manager.can_resume()
    }

    /// Load existing state for crash recovery (US-1.2: Resume After Crash)
    ///
    /// Returns the iteration to resume from if state exists.
    pub fn load_state_for_resume(&mut self) -> Result<Option<u32>, String> {
        if !self.assignments_manager.can_resume() {
            return Ok(None);
        }

        // Load the last saved iteration
        let iteration = self.assignments_manager.get_current_iteration()?;

        if iteration == 0 {
            return Ok(None);
        }

        log::info!(
            "[RalphLoop] Found existing state for crash recovery. Last iteration: {}",
            iteration
        );

        // Log completed stories from assignments
        let completed = self.assignments_manager.get_completed_story_ids()?;
        log::info!(
            "[RalphLoop] Completed stories from crash recovery: {:?}",
            completed
        );

        // Check learnings
        if self.learnings_manager.has_learnings()? {
            let count = self.learnings_manager.count()?;
            log::info!(
                "[RalphLoop] Found {} learnings from previous execution",
                count
            );
        }

        Ok(Some(iteration))
    }

    /// Save current iteration state for crash recovery
    fn save_iteration_state(&self, iteration: u32) -> Result<(), String> {
        self.assignments_manager.set_iteration(iteration)?;
        Ok(())
    }

    /// Get the assignments manager for external access
    pub fn assignments_manager(&self) -> &AssignmentsManager {
        &self.assignments_manager
    }

    /// Get the learnings manager for external access
    pub fn learnings_manager(&self) -> &LearningsManager {
        &self.learnings_manager
    }

    /// Get the current story ID being worked on (from PRD)
    fn get_current_story_id(&self) -> Option<String> {
        self.prd_executor
            .read_prd()
            .ok()
            .and_then(|prd| prd.next_story().map(|s| s.id.clone()))
    }

    /// Run the Ralph loop with a shared agent manager (Arc-wrapped sync Mutex).
    ///
    /// This is the primary entry point when using the main app's agent manager,
    /// which ensures PTYs are registered in the same place the frontend queries.
    ///
    /// NOTE: This method locks the agent manager for each operation rather than
    /// holding the lock for the entire duration, allowing the UI to query state
    /// during long agent operations.
    pub async fn run(
        &mut self,
        agent_manager_arc: std::sync::Arc<std::sync::Mutex<AgentManager>>,
    ) -> Result<RalphLoopMetrics, String> {
        log::debug!(
            "[RalphLoop] run() starting for execution {}",
            self.execution_id
        );
        let start_time = std::time::Instant::now();
        let mut iteration: u32 = 1;

        // Setup worktree if enabled
        if self.config.use_worktree {
            log::debug!("[RalphLoop] Setting up worktree (use_worktree=true)...");
            self.setup_worktree()?;
            log::debug!("[RalphLoop] Worktree setup complete");
        } else {
            log::debug!("[RalphLoop] Skipping worktree setup (use_worktree=false)");
        }

        // US-1.2: Try to load existing state for crash recovery
        if let Ok(Some(resume_iter)) = self.load_state_for_resume() {
            // Resume from the next iteration (the one that was interrupted)
            iteration = resume_iter + 1;
            log::info!(
                "[RalphLoop] Resuming from iteration {} after crash",
                iteration
            );
        } else {
            // Initialize fresh state for new execution
            if let Err(e) = self.assignments_manager.initialize(&self.execution_id) {
                log::warn!("[RalphLoop] Failed to initialize assignments: {}", e);
            }
            if let Err(e) = self.learnings_manager.initialize() {
                log::warn!("[RalphLoop] Failed to initialize learnings: {}", e);
            }
        }

        log::debug!("[RalphLoop] Entering main loop, iteration {}", iteration);
        self.state = RalphLoopState::Running { iteration };
        self.emit_status();
        log::debug!("[RalphLoop] State set to Running, emitted status");

        loop {
            log::info!(
                "[RalphLoop] ======== Loop iteration {} starting ========",
                iteration
            );

            // Check for cancellation
            if *lock_mutex_recover(&self.cancelled) {
                log::warn!(
                    "[RalphLoop] EXIT REASON: Cancelled at iteration {}",
                    iteration
                );
                // Clean up current agent PTY before returning
                if let Some(agent_id) = self.current_agent_id.take() {
                    let manager = lock_mutex_recover(&agent_manager_arc);
                    manager.unregister_pty(&agent_id);
                }
                // Sync PRD files to main project before exiting
                if let Err(e) = self.sync_prd_to_main() {
                    log::warn!("[RalphLoop] Failed to sync PRD on cancel: {}", e);
                }
                self.state = RalphLoopState::Cancelled { iteration };
                self.emit_status();
                return Ok(self.metrics.clone());
            }

            // Check max iterations
            if iteration > self.config.max_iterations {
                log::warn!(
                    "[RalphLoop] EXIT REASON: Max iterations ({}) reached at iteration {}",
                    self.config.max_iterations,
                    iteration
                );
                // Clean up current agent PTY before returning
                if let Some(agent_id) = self.current_agent_id.take() {
                    let manager = lock_mutex_recover(&agent_manager_arc);
                    manager.unregister_pty(&agent_id);
                }
                // Sync PRD files to main project before exiting
                if let Err(e) = self.sync_prd_to_main() {
                    log::warn!("[RalphLoop] Failed to sync PRD on max iterations: {}", e);
                }
                self.state = RalphLoopState::Failed {
                    iteration,
                    reason: format!("Max iterations ({}) reached", self.config.max_iterations),
                };
                self.emit_status();
                return Ok(self.metrics.clone());
            }

            // Check max cost
            if let Some(max_cost) = self.config.max_cost {
                if self.metrics.total_cost >= max_cost {
                    log::warn!(
                        "[RalphLoop] EXIT REASON: Max cost (${:.2}) exceeded at iteration {}",
                        max_cost,
                        iteration
                    );
                    // Clean up current agent PTY before returning
                    if let Some(agent_id) = self.current_agent_id.take() {
                        let manager = lock_mutex_recover(&agent_manager_arc);
                        manager.unregister_pty(&agent_id);
                    }
                    // Sync PRD files to main project before exiting
                    if let Err(e) = self.sync_prd_to_main() {
                        log::warn!("[RalphLoop] Failed to sync PRD on max cost: {}", e);
                    }
                    self.state = RalphLoopState::Failed {
                        iteration,
                        reason: format!("Max cost (${:.2}) exceeded", max_cost),
                    };
                    self.emit_status();
                    return Ok(self.metrics.clone());
                }
            }

            // Read current PRD status
            log::info!(
                "[RalphLoop] Reading PRD from {:?}",
                self.prd_executor.prd_path()
            );
            let prd = match self.prd_executor.read_prd() {
                Ok(p) => {
                    log::info!(
                        "[RalphLoop] PRD read successfully with {} stories",
                        p.stories.len()
                    );
                    p
                }
                Err(e) => {
                    log::error!("[RalphLoop] EXIT REASON: ERROR reading PRD: {}", e);
                    // Clean up current agent PTY before returning
                    if let Some(agent_id) = self.current_agent_id.take() {
                        let manager = lock_mutex_recover(&agent_manager_arc);
                        manager.unregister_pty(&agent_id);
                    }
                    return Err(e);
                }
            };
            let prd_status = self.prd_executor.get_status(&prd);
            log::info!(
                "[RalphLoop] PRD status: {}/{} passing ({}%), all_pass={}, incomplete: {:?}",
                prd_status.passed,
                prd_status.total,
                prd_status.progress_percent as u32,
                prd_status.all_pass,
                prd_status.incomplete_story_ids
            );

            // Generate BRIEF.md for this iteration (US-1.1: Resume After Rate Limit, US-1.3: Context Handoff)
            // Use structured learnings manager to include accumulated learnings from all agents
            if let Err(e) = self.brief_builder.generate_brief_with_learnings_manager(
                &prd,
                &self.learnings_manager,
                Some(iteration),
            ) {
                log::warn!("[RalphLoop] Failed to generate BRIEF.md: {}", e);
            } else {
                log::debug!("[RalphLoop] Generated BRIEF.md for iteration {}", iteration);
            }

            // Check if all stories pass
            if prd_status.all_pass {
                log::warn!(
                    "[RalphLoop] EXIT REASON: All {} stories pass! Completing at iteration {}.",
                    prd_status.total,
                    iteration
                );
                // Clean up current agent PTY before returning
                if let Some(agent_id) = self.current_agent_id.take() {
                    let manager = lock_mutex_recover(&agent_manager_arc);
                    manager.unregister_pty(&agent_id);
                }
                // Sync PRD files to main project before exiting
                if let Err(e) = self.sync_prd_to_main() {
                    log::warn!("[RalphLoop] Failed to sync PRD on completion: {}", e);
                }
                self.state = RalphLoopState::Completed {
                    total_iterations: iteration - 1,
                };
                self.metrics.total_iterations = iteration - 1;
                self.metrics.stories_completed = prd_status.passed as u32;
                self.metrics.stories_remaining = 0;
                self.metrics.total_duration_secs = start_time.elapsed().as_secs_f64();
                self.emit_status();
                return Ok(self.metrics.clone());
            }

            // Update state
            self.state = RalphLoopState::Running { iteration };
            self.emit_status();

            // Determine which agent to use (primary or fallback)
            let agent_to_use = self.get_agent_for_iteration();
            if agent_to_use != self.config.agent_type {
                log::debug!(
                    "[RalphLoop] Using fallback agent {:?} (primary {:?} may be rate-limited)",
                    agent_to_use,
                    self.config.agent_type
                );
                self.active_agent_type = agent_to_use.clone();
            }

            // Run one iteration with the shared manager
            log::debug!(
                "[RalphLoop] Starting iteration {} execution with agent {:?}...",
                iteration,
                agent_to_use
            );
            let iteration_start = std::time::Instant::now();
            let iteration_result = self
                .run_iteration(iteration, &agent_manager_arc, agent_to_use.clone())
                .await?;
            log::debug!(
                "[RalphLoop] Iteration {} completed with exit_code={}",
                iteration,
                iteration_result.exit_code
            );

            // Update metrics
            let iteration_metrics = IterationMetrics {
                iteration,
                tokens: iteration_result.token_metrics.total_tokens,
                input_tokens: iteration_result.token_metrics.input_tokens,
                output_tokens: iteration_result.token_metrics.output_tokens,
                cost: iteration_result.token_metrics.estimated_cost,
                duration_secs: iteration_start.elapsed().as_secs_f64(),
                story_id: iteration_result.story_id,
                story_completed: iteration_result.story_completed,
                exit_code: iteration_result.exit_code,
                retry_attempts: iteration_result.retry_attempts,
                was_retried: iteration_result.was_retried,
            };

            self.metrics.total_iterations = iteration;
            self.metrics.total_tokens += iteration_metrics.tokens;
            self.metrics.total_cost += iteration_metrics.cost;
            self.metrics.iterations.push(iteration_metrics);

            // Report iteration outcome to fallback orchestrator
            if iteration_result.exit_code == 0 {
                // Success - report to orchestrator
                self.report_iteration_success(agent_to_use.clone());
            } else if iteration_result.rate_limit_detected {
                // Rate limit detected - report error and potentially switch agents
                if let Some(next_agent) = self.report_iteration_error(agent_to_use.clone(), true) {
                    log::debug!(
                        "[RalphLoop] Switching to fallback agent {:?} due to rate limit",
                        next_agent
                    );
                }
            }

            // Check for completion promise in output
            if iteration_result.completion_detected {
                log::info!(
                    "[RalphLoop] Completion promise detected in output, verifying PRD status..."
                );
                // Double-check PRD status
                let prd = self.prd_executor.read_prd()?;
                let prd_status = self.prd_executor.get_status(&prd);
                log::info!(
                    "[RalphLoop] Post-completion check: {}/{} passing, all_pass={}",
                    prd_status.passed,
                    prd_status.total,
                    prd_status.all_pass
                );

                if prd_status.all_pass {
                    log::warn!("[RalphLoop] EXIT REASON: Completion promise confirmed - all {} stories pass!", prd_status.total);
                    // Clean up current agent PTY before returning
                    if let Some(agent_id) = self.current_agent_id.take() {
                        let manager = lock_mutex_recover(&agent_manager_arc);
                        manager.unregister_pty(&agent_id);
                    }
                    // Sync PRD files to main project before exiting
                    if let Err(e) = self.sync_prd_to_main() {
                        log::warn!(
                            "[RalphLoop] Failed to sync PRD on completion promise: {}",
                            e
                        );
                    }
                    self.state = RalphLoopState::Completed {
                        total_iterations: iteration,
                    };
                    self.metrics.stories_completed = prd_status.passed as u32;
                    self.metrics.stories_remaining = 0;
                    self.metrics.total_duration_secs = start_time.elapsed().as_secs_f64();
                    self.emit_status();
                    return Ok(self.metrics.clone());
                } else {
                    log::info!("[RalphLoop] Completion promise detected but {} stories still incomplete: {:?}. Continuing...", 
                        prd_status.failed, prd_status.incomplete_story_ids);
                }
            }

            // Sync PRD files to main project after each iteration
            // This ensures progress is persisted even if the app crashes or restarts
            if let Err(e) = self.sync_prd_to_main() {
                log::warn!(
                    "[RalphLoop] Failed to sync PRD after iteration {}: {}",
                    iteration,
                    e
                );
            }

            // US-1.2: Save iteration state for crash recovery
            if let Err(e) = self.save_iteration_state(iteration) {
                log::warn!("[RalphLoop] Failed to save iteration state: {}", e);
            }

            log::info!("[RalphLoop] Continuing to iteration {}", iteration + 1);
            iteration += 1;
        }
    }

    /// Run a single iteration of the Ralph loop
    ///
    /// Uses Arc<Mutex<AgentManager>> to share the manager with the main app's state,
    /// ensuring PTYs are registered in the same place the frontend queries.
    ///
    /// The `agent_type` parameter specifies which agent to use for this iteration,
    /// allowing the fallback orchestrator to switch agents on rate limits.
    async fn run_iteration(
        &mut self,
        iteration: u32,
        agent_manager_arc: &std::sync::Arc<std::sync::Mutex<AgentManager>>,
        agent_type: AgentType,
    ) -> Result<IterationResult, String> {
        log::debug!(
            "[RalphLoop] run_iteration() entered for iteration {} with agent {:?}",
            iteration,
            agent_type
        );

        // Track if rate limit is detected during this iteration
        let mut rate_limit_detected = false;

        // Clean up previous agent's PTY if there was one
        // (We keep it around after iteration completes so terminal can still show output)
        if let Some(prev_agent_id) = self.current_agent_id.take() {
            log::debug!(
                "[RalphLoop] Cleaning up previous agent PTY: {}",
                prev_agent_id
            );
            let manager = lock_mutex_recover(&agent_manager_arc);
            manager.unregister_pty(&prev_agent_id);
        }

        // Record start of iteration in progress.txt
        log::debug!("[RalphLoop] Recording iteration start in progress.txt...");
        self.progress_tracker.start_iteration(iteration)?;
        log::debug!("[RalphLoop] Progress tracker updated");

        // Generate the prompt for this iteration
        log::debug!("[RalphLoop] Building iteration prompt...");
        let prompt = self.prompt_builder.build_iteration_prompt(iteration)?;
        log::debug!("[RalphLoop] Prompt built ({} chars)", prompt.len());

        let mut attempt = 0u32;
        let mut current_delay_ms = self.config.retry_config.initial_delay_ms;
        let max_attempts = self.config.retry_config.max_attempts;

        loop {
            attempt += 1;
            log::debug!("[RalphLoop] Attempt {} of {}", attempt, max_attempts);

            // Emit progress for agent start
            self.set_progress(format!(
                "Starting {:?} agent for iteration {} (attempt {})",
                agent_type, iteration, attempt
            ));

            // Generate unique agent ID for this iteration/attempt
            let agent_id = format!(
                "{}-iter-{}-attempt-{}",
                self.execution_id, iteration, attempt
            );
            let task_id = agent_id.clone();
            log::debug!("[RalphLoop] Agent ID: {}", agent_id);

            // Build agent spawn config - use working_path (worktree if enabled)
            // Use the passed agent_type (may be primary or fallback)
            log::debug!(
                "[RalphLoop] Building spawn config for {:?} agent...",
                agent_type
            );
            let spawn_config = AgentSpawnConfig {
                agent_type,
                task_id,
                worktree_path: self.working_path.to_string_lossy().to_string(),
                branch: self
                    .config
                    .branch
                    .clone()
                    .unwrap_or_else(|| "main".to_string()),
                max_iterations: 0, // Let agent run until completion
                prompt: Some(prompt.clone()),
                model: self.config.model.clone(),
                spawn_mode: AgentSpawnMode::Pty,
                plugin_config: None,
                env_vars: self.config.env_vars.clone(),
                disable_tools: false,
            };
            log::debug!(
                "[RalphLoop] Spawn config: worktree={}, branch={:?}, model={:?}",
                spawn_config.worktree_path,
                spawn_config.branch,
                spawn_config.model
            );

            // Spawn fresh agent instance (creates PTY)
            // Lock, spawn, unlock
            log::debug!("[RalphLoop] Calling agent_manager.spawn_agent()...");
            let spawn_result = {
                let mut manager = lock_mutex_recover(&agent_manager_arc);
                manager.spawn_agent(&agent_id, spawn_config)
            };
            log::debug!(
                "[RalphLoop] spawn_agent returned: {:?}",
                spawn_result.is_ok()
            );

            if let Err(e) = spawn_result {
                let error_str = e.to_string();

                // Check if spawn error is retryable
                if attempt < max_attempts && is_retryable_error(&error_str) {
                    log::warn!(
                        "[RalphLoop] Spawn failed on attempt {}/{}: {}. Retrying in {}ms...",
                        attempt,
                        max_attempts,
                        error_str,
                        current_delay_ms
                    );

                    // Update state to retrying and emit status
                    self.state = RalphLoopState::Retrying {
                        iteration,
                        attempt,
                        reason: error_str.clone(),
                        delay_ms: current_delay_ms,
                    };
                    self.set_progress(format!("Retrying after error: {}", error_str));

                    // Record retry in progress file
                    let retry_note =
                        retry::format_retry_note(attempt, &error_str, current_delay_ms);
                    let _ = self.progress_tracker.add_note(iteration, &retry_note);

                    // Wait before retrying
                    tokio::time::sleep(std::time::Duration::from_millis(current_delay_ms)).await;

                    // Calculate next delay with exponential backoff
                    current_delay_ms = ((current_delay_ms as f64
                        * self.config.retry_config.backoff_multiplier)
                        as u64)
                        .min(self.config.retry_config.max_delay_ms);

                    continue;
                }
                return Err(format!("Failed to spawn agent: {}", error_str));
            }

            // Set current agent ID and emit status AFTER successful spawn (PTY now exists)
            log::debug!("[RalphLoop] Setting current_agent_id to {}", agent_id);
            self.current_agent_id = Some(agent_id.clone());
            self.emit_status();
            log::debug!("[RalphLoop] Agent spawned successfully, emitted status with agent_id");

            self.set_progress(format!("Agent running (iteration {})", iteration));

            // Wait for agent to complete
            // IMPORTANT: We take the child process out first, then wait WITHOUT holding the lock.
            // This prevents the UI from freezing while waiting for the agent.
            log::debug!("[RalphLoop] Taking child process for waiting...");

            // Step 1: Take the child process out (quick lock/unlock)
            let child_process = {
                let mut manager = lock_mutex_recover(&agent_manager_arc);
                manager.take_child_process(&agent_id)
            };
            log::debug!(
                "[RalphLoop] Got child_process: {:?}",
                child_process.is_some()
            );

            // Step 2: Wait on the process WITHOUT holding the manager lock
            // Use polling-based wait that checks cancellation flag periodically
            let timeout_secs = self.config.agent_timeout_secs;

            let exit_code = match child_process {
                Some(mut child) => {
                    log::debug!(
                        "[RalphLoop] Waiting for agent process (timeout: {}s, 0=indefinite)...",
                        timeout_secs
                    );

                    // Poll-based wait with cancellation checking
                    let poll_interval = std::time::Duration::from_millis(250);
                    let start = std::time::Instant::now();
                    let timeout = if timeout_secs > 0 {
                        Some(std::time::Duration::from_secs(timeout_secs))
                    } else {
                        None // No timeout
                    };

                    loop {
                        // Check for cancellation first
                        if *lock_mutex_recover(&self.cancelled) {
                            log::info!(
                                "[RalphLoop] Cancellation detected during agent wait, killing process"
                            );
                            let _ = child.kill();
                            let _ = child.wait(); // Clean up zombie

                            // Clean up agent PTY
                            let manager = lock_mutex_recover(&agent_manager_arc);
                            manager.unregister_pty(&agent_id);
                            self.current_agent_id = None;

                            // Return a special marker - the outer loop will handle the cancelled state
                            // We use -999 as a sentinel value for "cancelled"
                            break -999;
                        }

                        // Check if process has exited
                        match child.try_wait() {
                            Ok(Some(status)) => {
                                break status.code().unwrap_or(-1);
                            }
                            Ok(None) => {
                                // Process still running, check timeout
                                if let Some(t) = timeout {
                                    if start.elapsed() >= t {
                                        log::warn!(
                                            "[RalphLoop] Agent timed out after {}s, killing process",
                                            timeout_secs
                                        );
                                        let _ = child.kill();
                                        let _ = child.wait(); // Clean up zombie

                                        // Clean up agent PTY
                                        let manager = lock_mutex_recover(&agent_manager_arc);
                                        manager.unregister_pty(&agent_id);
                                        self.current_agent_id = None;
                                        return Err(format!(
                                            "Agent timed out after {} seconds",
                                            timeout_secs
                                        ));
                                    }
                                }
                                // Sleep briefly before next poll
                                std::thread::sleep(poll_interval);
                            }
                            Err(e) => {
                                // Clean up agent PTY before returning error
                                let manager = lock_mutex_recover(&agent_manager_arc);
                                manager.unregister_pty(&agent_id);
                                self.current_agent_id = None;
                                return Err(format!("Failed to wait for agent: {}", e));
                            }
                        }
                    }
                }
                None => {
                    // Clean up agent PTY before returning error
                    let manager = lock_mutex_recover(&agent_manager_arc);
                    manager.unregister_pty(&agent_id);
                    self.current_agent_id = None;
                    return Err(format!("Agent process not found: {}", agent_id));
                }
            };

            // Check if we were cancelled (sentinel value -999)
            if exit_code == -999 {
                // Return early - the main loop will detect the cancelled flag
                // and transition to Cancelled state
                return Ok(IterationResult {
                    exit_code: -1,
                    token_metrics: TokenMetrics::default(),
                    story_id: None,
                    story_completed: false,
                    completion_detected: false,
                    retry_attempts: attempt,
                    was_retried: attempt > 1,
                    rate_limit_detected: false,
                });
            }

            // Step 3: Emit the exit log (quick lock/unlock)
            {
                let manager = lock_mutex_recover(&agent_manager_arc);
                manager.emit_agent_exit(&agent_id, exit_code);
            }

            log::debug!("[RalphLoop] Agent finished with exit_code={}", exit_code);

            // Get agent output for completion detection and metrics
            let output = {
                let manager = lock_mutex_recover(&agent_manager_arc);
                manager.get_pty_history(&agent_id)
            };
            let output_str = String::from_utf8_lossy(&output);

            // Debug: Log agent output when it fails
            if exit_code != 0 {
                log::debug!("[RalphLoop] Agent failed! Output ({} bytes):", output.len());
                // Log first 2000 chars of output for debugging
                let truncated = if output_str.len() > 2000 {
                    format!("{}... [truncated]", &output_str[..2000])
                } else {
                    output_str.to_string()
                };
                log::debug!("{}", truncated);
            }

            // Check for rate limit in output
            let output_lower = output_str.to_lowercase();
            let is_rate_limit_error = output_lower.contains("rate limit")
                || output_lower.contains("429")
                || output_lower.contains("too many requests")
                || output_lower.contains("overloaded");

            if is_rate_limit_error {
                rate_limit_detected = true;
                log::debug!("[RalphLoop] Rate limit detected in agent output");
            }

            // Check if we should retry based on exit code and output
            if exit_code != 0
                && attempt < max_attempts
                && retry::should_retry_agent(exit_code, &output_str)
            {
                log::warn!(
                    "[RalphLoop] Agent failed on attempt {}/{} with exit code {}. Retrying in {}ms...",
                    attempt, max_attempts, exit_code, current_delay_ms
                );

                // Update state to retrying
                let error_reason = format!(
                    "Agent exited with code {} (retryable error detected)",
                    exit_code
                );
                self.state = RalphLoopState::Retrying {
                    iteration,
                    attempt,
                    reason: error_reason.clone(),
                    delay_ms: current_delay_ms,
                };
                self.set_progress(format!(
                    "Retrying after agent failure (exit code {})",
                    exit_code
                ));

                // Record retry in progress file
                let retry_note = retry::format_retry_note(attempt, &error_reason, current_delay_ms);
                let _ = self.progress_tracker.add_note(iteration, &retry_note);

                // Clean up this agent attempt
                {
                    let manager = lock_mutex_recover(&agent_manager_arc);
                    manager.unregister_pty(&agent_id);
                }

                // Wait before retrying
                tokio::time::sleep(std::time::Duration::from_millis(current_delay_ms)).await;

                // Calculate next delay with exponential backoff
                current_delay_ms = ((current_delay_ms as f64
                    * self.config.retry_config.backoff_multiplier)
                    as u64)
                    .min(self.config.retry_config.max_delay_ms);

                continue;
            }

            // Check for completion promise
            let completion_detected = self.completion_detector.check(&output_str);

            // Parse token metrics from output
            let token_metrics = self.parse_metrics_from_output(&output_str);

            // Record end of iteration in progress.txt
            self.progress_tracker
                .end_iteration(iteration, exit_code == 0)?;

            // US-3.1: Extract learnings from agent output using structured protocol
            // The <learning> tags in the output are parsed and saved to learnings.json
            let story_id_ref = self.get_current_story_id();
            match self.learnings_manager.extract_and_save_learnings(
                &output_str,
                iteration,
                story_id_ref.as_deref(),
            ) {
                Ok(count) if count > 0 => {
                    log::info!(
                        "[RalphLoop] Extracted {} learning(s) from agent output",
                        count
                    );
                }
                Ok(_) => {
                    log::debug!("[RalphLoop] No learnings found in agent output");
                }
                Err(e) => {
                    log::warn!("[RalphLoop] Failed to extract learnings: {}", e);
                }
            }

            // Note: We intentionally keep current_agent_id set and don't unregister the PTY yet.
            // This allows the terminal to continue displaying the agent's output after it completes.
            // The PTY will be unregistered when a new iteration starts (or loop ends).
            // Old agent cleanup happens at the START of run_iteration, not at the end.

            self.set_progress(format!(
                "Iteration {} complete (exit code {})",
                iteration, exit_code
            ));

            return Ok(IterationResult {
                exit_code,
                token_metrics,
                story_id: None, // Would need to parse from output
                story_completed: exit_code == 0,
                completion_detected,
                retry_attempts: attempt,
                was_retried: attempt > 1,
                rate_limit_detected,
            });
        }
    }

    /// Parse metrics from agent output (best effort)
    ///
    /// Parses token counts from agent output. Supports:
    /// - Claude: JSON with inputTokens/outputTokens fields
    /// - OpenCode: step_finish events with tokens object
    fn parse_metrics_from_output(&self, output: &str) -> TokenMetrics {
        let mut total_input = 0u64;
        let mut total_output = 0u64;

        for line in output.lines() {
            // Skip non-JSON lines
            let trimmed = line.trim();
            if !trimmed.starts_with('{') {
                continue;
            }

            // Try parsing as JSON
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(trimmed) {
                // Claude format: stream-json with inputTokens/outputTokens
                if let (Some(input), Some(output_val)) = (
                    json.get("inputTokens").and_then(|v| v.as_u64()),
                    json.get("outputTokens").and_then(|v| v.as_u64()),
                ) {
                    total_input += input;
                    total_output += output_val;
                    continue;
                }

                // Claude alternate format: usage object
                if let Some(usage) = json.get("usage") {
                    if let (Some(input), Some(output_val)) = (
                        usage.get("input_tokens").and_then(|v| v.as_u64()),
                        usage.get("output_tokens").and_then(|v| v.as_u64()),
                    ) {
                        total_input += input;
                        total_output += output_val;
                        continue;
                    }
                }

                // OpenCode format: step_finish event with tokens
                if json.get("type").and_then(|v| v.as_str()) == Some("step_finish") {
                    if let Some(tokens) = json.get("tokens") {
                        total_input += tokens.get("input").and_then(|v| v.as_u64()).unwrap_or(0);
                        total_output += tokens.get("output").and_then(|v| v.as_u64()).unwrap_or(0);
                    }
                }

                // OpenCode alternate: summary with total_tokens
                if let Some(summary) = json.get("summary") {
                    if let Some(tokens) = summary.get("tokens") {
                        total_input += tokens.get("input").and_then(|v| v.as_u64()).unwrap_or(0);
                        total_output += tokens.get("output").and_then(|v| v.as_u64()).unwrap_or(0);
                    }
                }
            }
        }

        let total_tokens = total_input + total_output;
        // Estimate cost based on Claude Sonnet 4 pricing: ~$3/M input, ~$15/M output
        let cost = (total_input as f64 * 0.000003) + (total_output as f64 * 0.000015);

        TokenMetrics {
            input_tokens: total_input,
            output_tokens: total_output,
            total_tokens,
            estimated_cost: cost,
        }
    }

    /// Emit a status update event
    fn emit_status(&self) {
        // Update snapshot store directly (bypasses async channel issues)
        if let Some(store) = &self.snapshot_store {
            let mut snapshots = lock_mutex_recover(store);
            if let Some(snapshot) = snapshots.get_mut(&self.execution_id) {
                snapshot.state = Some(self.state.clone());
                snapshot.current_agent_id = self.current_agent_id.clone();
                snapshot.worktree_path = self
                    .worktree_path
                    .as_ref()
                    .map(|p| p.to_string_lossy().to_string());
                snapshot.metrics = Some(self.metrics.clone());
                log::debug!(
                    "[DEBUG] emit_status: updated snapshot agent_id={:?}",
                    snapshot.current_agent_id
                );
            } else {
                log::debug!(
                    "[DEBUG] emit_status: snapshot NOT FOUND for {}",
                    self.execution_id
                );
            }
        } else {
            log::debug!("[DEBUG] emit_status: NO snapshot_store!");
        }

        // Also send to channel for compatibility
        if let Some(tx) = &self.status_tx {
            let prd_status = self
                .prd_executor
                .read_prd()
                .ok()
                .map(|prd| self.prd_executor.get_status(&prd));

            let event = RalphLoopStatusEvent {
                execution_id: self.execution_id.clone(),
                state: self.state.clone(),
                prd_status,
                iteration_metrics: self.metrics.iterations.last().cloned(),
                timestamp: chrono::Utc::now().to_rfc3339(),
                current_agent_id: self.current_agent_id.clone(),
                worktree_path: self
                    .worktree_path
                    .as_ref()
                    .map(|p| p.to_string_lossy().to_string()),
                branch: self.config.branch.clone(),
                progress_message: self.progress_message.clone(),
            };

            let _ = tx.send(event); // Ignore result, snapshot store is primary
        }
    }

    /// Set progress message and emit status
    fn set_progress(&mut self, message: impl Into<String>) {
        self.progress_message = Some(message.into());
        self.emit_status();
    }

    /// Pause the current execution
    pub fn pause(&mut self, reason: &str) {
        if let RalphLoopState::Running { iteration } = self.state {
            self.state = RalphLoopState::Paused {
                iteration,
                reason: reason.to_string(),
            };
            self.emit_status();
        }
    }

    /// Cancel the current execution
    pub fn cancel(&mut self) {
        *lock_mutex_recover(&self.cancelled) = true;
    }

    /// Sync PRD files from worktree back to main project directory.
    /// This ensures progress is persisted even if the app restarts.
    /// Called after each iteration and on completion/failure/cancel.
    fn sync_prd_to_main(&self) -> Result<(), String> {
        // Only sync if we're using a worktree
        let worktree_path = match &self.worktree_path {
            Some(p) => p,
            None => return Ok(()), // No worktree, nothing to sync
        };

        let prd_name = &self.config.prd_name;

        let src_dir = worktree_path.join(".ralph-ui").join("prds");
        let dst_dir = self.config.project_path.join(".ralph-ui").join("prds");

        // Ensure destination directory exists
        if !dst_dir.exists() {
            std::fs::create_dir_all(&dst_dir)
                .map_err(|e| format!("Failed to create .ralph-ui/prds directory: {}", e))?;
        }

        // Files to sync: {prd_name}.json, {prd_name}-progress.txt
        let files_to_sync = [
            format!("{}.json", prd_name),
            format!("{}-progress.txt", prd_name),
        ];

        for filename in &files_to_sync {
            let src = src_dir.join(filename);
            let dst = dst_dir.join(filename);

            if src.exists() {
                if let Err(e) = std::fs::copy(&src, &dst) {
                    log::warn!(
                        "[RalphLoop] Failed to sync {} to main project: {}",
                        filename,
                        e
                    );
                } else {
                    log::debug!("[RalphLoop] Synced {} to main project", filename);
                }
            }
        }

        log::info!("[RalphLoop] Synced PRD files from worktree to main project");
        Ok(())
    }

    /// Setup worktree for isolated execution
    ///
    /// Creates a git worktree at {project}/.worktrees/ralph-{execution_id}
    /// and copies the .ralph-ui/ directory to it.
    ///
    /// Each execution gets a unique branch name based on execution_id to allow
    /// multiple concurrent Ralph loops on different PRDs.
    fn setup_worktree(&mut self) -> Result<(), String> {
        use crate::git::GitManager;
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        log::info!(
            "[RalphLoop] Setting up worktree for execution {}",
            self.execution_id
        );

        // Create git manager early - needed for branch detection and cleanup operations
        let git_manager = GitManager::new(&self.config.project_path)
            .map_err(|e| format!("Failed to open git repository: {}", e))?;

        // Get the base branch (the branch to start from)
        // If not configured, detect the repository's current/default branch
        let base_branch = self.config.branch.clone().unwrap_or_else(|| {
            let detected = git_manager.get_default_branch_name();
            log::info!(
                "[RalphLoop] No branch configured, detected default branch: '{}'",
                detected
            );
            detected
        });

        // Generate a STABLE worktree ID based on project path + branch
        // This allows reusing the same worktree when restarting the same PRD
        let mut hasher = DefaultHasher::new();
        self.config.project_path.hash(&mut hasher);
        base_branch.hash(&mut hasher);
        let stable_id = format!("{:x}", hasher.finish())[..8].to_string();

        // Create a stable branch name for this PRD (not per-execution)
        // Format: ralph/{base_branch_sanitized}-{stable_id}
        let sanitized_base = base_branch.replace('/', "-");
        let execution_branch = format!("ralph/{}-{}", sanitized_base, stable_id);

        log::info!(
            "[RalphLoop] Using stable worktree ID '{}' for branch '{}' (execution: {})",
            stable_id,
            base_branch,
            self.execution_id
        );

        // Create worktree path
        let worktree_dir = self.config.project_path.join(".worktrees");
        std::fs::create_dir_all(&worktree_dir)
            .map_err(|e| format!("Failed to create .worktrees directory: {}", e))?;

        let worktree_path = worktree_dir.join(format!("ralph-{}", stable_id));

        // Prune orphaned worktrees (where physical directory was deleted but .git/worktrees entry remains)
        match git_manager.prune_orphaned_worktrees() {
            Ok(count) if count > 0 => {
                log::info!("[RalphLoop] Pruned {} orphaned worktree(s)", count);
            }
            Err(e) => {
                log::warn!("[RalphLoop] Failed to prune orphaned worktrees: {}", e);
            }
            _ => {}
        }

        // Check if worktree already exists and is valid
        let worktree_exists = worktree_path.exists() && worktree_path.join(".git").exists();

        if worktree_exists {
            log::info!(
                "[RalphLoop] Reusing existing worktree at {:?}",
                worktree_path
            );
            // Worktree exists - just sync the .ralph-ui directory
        } else {
            // Need to create worktree - clean up any stale remnants first
            if worktree_path.exists() {
                log::warn!(
                    "[RalphLoop] Removing invalid worktree at {:?}",
                    worktree_path
                );
                let worktree_path_str = worktree_path.to_string_lossy().to_string();
                if let Err(e) = git_manager.remove_worktree(&worktree_path_str) {
                    log::warn!("[RalphLoop] Failed to prune worktree from git: {}", e);
                }
                if let Err(e) = std::fs::remove_dir_all(&worktree_path) {
                    log::warn!(
                        "[RalphLoop] Failed to remove stale worktree directory: {}",
                        e
                    );
                }
            }

            // Try to delete any stale branch with the same name
            if let Err(e) = git_manager.delete_branch(&execution_branch) {
                log::debug!(
                    "[RalphLoop] Branch {} didn't exist or couldn't be deleted: {}",
                    execution_branch,
                    e
                );
            }

            // Create git worktree with stable branch
            git_manager
                .create_worktree(&execution_branch, worktree_path.to_str().unwrap())
                .map_err(|e| format!("Failed to create worktree: {}", e))?;

            log::info!(
                "[RalphLoop] Created worktree at {:?} on branch {}",
                worktree_path,
                execution_branch
            );
        }

        // Sync PRD files based on prd_name setting
        // IMPORTANT: When resuming an existing worktree, we should NOT overwrite
        // the worktree's data with stale main project data. Only sync main→worktree
        // when creating a NEW worktree.
        if !worktree_exists {
            let prd_name = &self.config.prd_name;
            // New format: sync .ralph-ui/prds/ directory
            let src_prds_dir = self.config.project_path.join(".ralph-ui").join("prds");
            let dst_prds_dir = worktree_path.join(".ralph-ui").join("prds");

            if src_prds_dir.exists() {
                // Ensure .ralph-ui/prds exists in worktree
                std::fs::create_dir_all(&dst_prds_dir)
                    .map_err(|e| format!("Failed to create .ralph-ui/prds directory: {}", e))?;

                // Copy PRD-specific files (only for this PRD, not all)
                for ext in &["json", "txt", "md"] {
                    let filename = if *ext == "json" {
                        format!("{}.{}", prd_name, ext)
                    } else if *ext == "txt" {
                        format!("{}-progress.{}", prd_name, ext)
                    } else {
                        format!("{}-prompt.{}", prd_name, ext)
                    };
                    let src_file = src_prds_dir.join(&filename);
                    let dst_file = dst_prds_dir.join(&filename);

                    if src_file.exists() {
                        std::fs::copy(&src_file, &dst_file)
                            .map_err(|e| format!("Failed to copy {}: {}", filename, e))?;
                    }
                }
                log::info!("[RalphLoop] Synced .ralph-ui/prds/ files to new worktree");
            }
        } else {
            log::info!("[RalphLoop] Resuming existing worktree - keeping worktree PRD data (not overwriting with main)");
        }

        // Update working path and reinitialize components
        self.worktree_path = Some(worktree_path.clone());
        self.working_path = worktree_path.clone();

        // Reinitialize executors with new worktree path
        self.prd_executor = PrdExecutor::new(&worktree_path, &self.config.prd_name);
        self.progress_tracker = ProgressTracker::new(&worktree_path, &self.config.prd_name);
        self.prompt_builder = PromptBuilder::new(&worktree_path, &self.config.prd_name);
        self.brief_builder = BriefBuilder::new(&worktree_path, &self.config.prd_name);
        self.assignments_manager = AssignmentsManager::new(&worktree_path, &self.config.prd_name);
        self.learnings_manager = LearningsManager::new(&worktree_path, &self.config.prd_name);

        // Store the execution branch (different from the base PRD branch)
        self.config.branch = Some(execution_branch);

        // Save worktree path to PRD metadata in main project (for later detection)
        let main_executor = PrdExecutor::new(&self.config.project_path, &self.config.prd_name);
        if let Err(e) = main_executor.update_metadata(|meta| {
            meta.last_worktree_path = Some(worktree_path.to_string_lossy().to_string());
        }) {
            log::warn!(
                "[RalphLoop] Failed to save worktree path to PRD metadata: {}",
                e
            );
        }

        Ok(())
    }
}

/// Token usage metrics from agent execution
#[derive(Debug, Clone, Default)]
struct TokenMetrics {
    input_tokens: u64,
    output_tokens: u64,
    total_tokens: u64,
    estimated_cost: f64,
}

/// Result of a single iteration
struct IterationResult {
    exit_code: i32,
    token_metrics: TokenMetrics,
    story_id: Option<String>,
    story_completed: bool,
    completion_detected: bool,
    retry_attempts: u32,
    was_retried: bool,
    /// Whether a rate limit was detected during this iteration
    rate_limit_detected: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ralph_loop_config_default() {
        let config = RalphLoopConfig::default();
        assert_eq!(config.max_iterations, 50);
        assert!(config.run_tests);
        assert!(config.run_lint);
    }

    #[test]
    fn test_ralph_loop_state_serialization() {
        let state = RalphLoopState::Running { iteration: 5 };
        let json = serde_json::to_string(&state).unwrap();
        // With camelCase renaming, "Running" becomes "running"
        assert!(json.contains("running") || json.contains("Running"));
        assert!(json.contains("5"));

        // Also test the new Retrying state
        let retrying_state = RalphLoopState::Retrying {
            iteration: 3,
            attempt: 2,
            reason: "rate limit".to_string(),
            delay_ms: 2000,
        };
        let retrying_json = serde_json::to_string(&retrying_state).unwrap();
        assert!(retrying_json.contains("retrying") || retrying_json.contains("Retrying"));
        assert!(retrying_json.contains("rate limit"));
    }
}
