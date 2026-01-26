//! Loop execution: start, stop, get_state, get_metrics

use crate::commands::ConfigState;
use crate::file_storage::iterations as iteration_storage;
use crate::models::AgentType;
use crate::ralph_loop::{
    ErrorStrategy, ExecutionSnapshot, ExecutionStateSnapshot, FallbackChainConfig, IterationRecord,
    PrdExecutor, PrdMetadata, RalphLoopConfig, RalphLoopMetrics, RalphLoopOrchestrator,
    RalphLoopState as RalphLoopExecutionState, RetryConfig,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;

use super::helpers::{resolve_config, resolve_config_opt, RalphLoopManagerState};
use super::notifications::{send_error_notification, send_loop_completion_notification};

// ============================================================================
// Request/Response Types
// ============================================================================

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
    /// Custom test command (e.g., "npm test", "cargo test")
    pub test_command: Option<String>,
    /// Custom lint command (e.g., "npm run lint", "cargo clippy")
    pub lint_command: Option<String>,
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

/// Info about an active execution
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionInfo {
    pub execution_id: String,
    pub project_path: Option<String>,
    pub state: Option<String>,
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

/// Heartbeat interval in seconds (30 seconds)
const HEARTBEAT_INTERVAL_SECS: u64 = 30;

// ============================================================================
// Execution Operations
// ============================================================================

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
        if prd_config.is_some() {
            "present"
        } else {
            "absent"
        },
        if user_config.is_some() {
            "present"
        } else {
            "absent"
        }
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
        user_config
            .as_ref()
            .map(|c| c.execution.max_iterations as u32),
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
        user_config
            .as_ref()
            .and_then(|c| c.templates.default_template.clone()), // Fall back to default_template
    );

    // Resolve test and lint commands with config precedence
    let resolved_test_command = resolve_config_opt(
        request.test_command.clone(),
        prd_config.and_then(|c| c.test_command.clone()),
        user_config
            .as_ref()
            .and_then(|c| c.validation.test_command.clone()),
    );

    let resolved_lint_command = resolve_config_opt(
        request.lint_command.clone(),
        prd_config.and_then(|c| c.lint_command.clone()),
        user_config
            .as_ref()
            .and_then(|c| c.validation.lint_command.clone()),
    );

    // Resolve max_retries from config (for RetryConfig)
    let resolved_max_retries = user_config
        .as_ref()
        .map(|c| c.execution.max_retries as u32)
        .unwrap_or(3);

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
            let fallback_chain = config
                .fallback
                .fallback_chain
                .clone()
                .map(|chain| {
                    // Convert string agent names to AgentType
                    chain
                        .into_iter()
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
                ErrorStrategyConfig::Retry {
                    max_attempts,
                    backoff_ms,
                } => ErrorStrategy::Retry {
                    max_attempts,
                    backoff_ms,
                },
                ErrorStrategyConfig::Skip => ErrorStrategy::Skip,
                ErrorStrategyConfig::Abort => ErrorStrategy::Abort,
            }
        })
        .unwrap_or_default();

    // Build RetryConfig using resolved max_retries from settings
    let retry_config = RetryConfig {
        max_attempts: resolved_max_retries,
        ..RetryConfig::default()
    };

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
        retry_config,   // Use config value instead of hardcoded default
        error_strategy, // Use config value instead of hardcoded default
        fallback_config,
        agent_timeout_secs: resolved_agent_timeout,
        prd_name: request.prd_name.clone(),
        template_name: resolved_template,
        test_command: resolved_test_command,
        lint_command: resolved_lint_command,
    };

    // Create orchestrator
    let mut orchestrator = RalphLoopOrchestrator::new(config.clone());
    let execution_id = orchestrator.execution_id().to_string();

    // Get shared snapshots Arc and pass to orchestrator for direct updates
    let snapshots_arc = ralph_state.snapshots_arc();
    orchestrator.set_snapshot_store(snapshots_arc.clone());

    // Initialize snapshot with idle state
    {
        let mut snapshots = snapshots_arc
            .lock()
            .map_err(|e| format!("Snapshot lock error: {}", e))?;
        snapshots.insert(
            execution_id.clone(),
            ExecutionSnapshot {
                state: Some(RalphLoopExecutionState::Idle),
                metrics: None,
                current_agent_id: None,
                worktree_path: None,
                project_path: Some(request.project_path.clone()),
            },
        );
    }

    // Update PRD metadata with current execution ID immediately so frontend can recover
    // Note: We already read the PRD above for config resolution
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
        let mut executions = ralph_state
            .executions
            .lock()
            .map_err(|e| format!("Executions lock error: {}", e))?;
        executions.insert(execution_id.clone(), orchestrator_arc.clone());
    }

    // Clone the main app's agent manager Arc for the spawned task
    // This ensures PTYs are registered in the same place the frontend queries
    let agent_manager_arc = agent_manager_state.clone_manager();

    // Spawn the loop in background
    log::info!(
        "[RalphLoop] Spawning background task for execution {}",
        execution_id
    );

    // Clone for heartbeat task
    let execution_id_for_heartbeat = execution_id.clone();
    let project_path_for_heartbeat = project_path_buf.clone();
    let orchestrator_arc_for_heartbeat = orchestrator_arc.clone();

    // Spawn heartbeat task (uses file storage)
    tokio::spawn(async move {
        let mut interval =
            tokio::time::interval(std::time::Duration::from_secs(HEARTBEAT_INTERVAL_SECS));

        loop {
            interval.tick().await;

            // Check if orchestrator is still running
            let is_running = {
                let orchestrator = orchestrator_arc_for_heartbeat.lock().await;
                matches!(
                    orchestrator.state(),
                    RalphLoopExecutionState::Running { .. }
                        | RalphLoopExecutionState::Retrying { .. }
                )
            };

            if !is_running {
                log::info!(
                    "[Heartbeat] Execution {} no longer running, stopping heartbeat",
                    execution_id_for_heartbeat
                );
                break;
            }

            // Update heartbeat in file storage
            let heartbeat = chrono::Utc::now().to_rfc3339();
            if let Err(e) = iteration_storage::update_heartbeat(
                &project_path_for_heartbeat,
                &execution_id_for_heartbeat,
                &heartbeat,
            ) {
                log::warn!(
                    "[Heartbeat] Failed to update heartbeat for {}: {}",
                    execution_id_for_heartbeat,
                    e
                );
            } else {
                log::debug!(
                    "[Heartbeat] Updated heartbeat for {}",
                    execution_id_for_heartbeat
                );
            }
        }
    });

    // Clone for main loop task
    let execution_id_for_loop = execution_id.clone();
    let project_path_for_loop = project_path_buf.clone();
    let prd_name_for_loop = request.prd_name.clone();
    let app_handle_for_loop = app_handle.clone();

    tokio::spawn(async move {
        log::info!(
            "[RalphLoop] Background task started for {}",
            execution_id_for_loop
        );

        // Lock orchestrator, then run with the shared agent manager
        log::debug!("[RalphLoop] Acquiring orchestrator lock...");
        let mut orchestrator = orchestrator_arc.lock().await;
        log::debug!("[RalphLoop] Locks acquired, starting run()...");

        // Use the main app's agent manager (sync mutex, but operations are quick)
        // We lock/unlock for each operation within run() rather than holding lock
        let result = orchestrator.run(agent_manager_arc).await;

        // Clean up execution state from file storage
        if let Err(e) = iteration_storage::delete_execution_state(
            &project_path_for_loop,
            &execution_id_for_loop,
        ) {
            log::warn!(
                "[RalphLoop] Failed to delete execution state for {}: {}",
                execution_id_for_loop,
                e
            );
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
                        app_handle_for_loop.broadcast(
                            "ralph:loop_completed",
                            serde_json::to_value(&payload).unwrap_or_default(),
                        );

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
                        let (stories_remaining, total_stories) =
                            if error_type == crate::events::RalphLoopErrorType::MaxIterations {
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
                let error_type = if error_str.contains("rate limit")
                    || error_str.contains("429")
                    || error_str.contains("too many requests")
                {
                    crate::events::RalphLoopErrorType::RateLimit
                } else if error_str.contains("max iterations") {
                    crate::events::RalphLoopErrorType::MaxIterations
                } else if error_str.contains("max cost") {
                    crate::events::RalphLoopErrorType::MaxCost
                } else if error_str.contains("timeout") || error_str.contains("timed out") {
                    crate::events::RalphLoopErrorType::Timeout
                } else if error_str.contains("parse")
                    || error_str.contains("json")
                    || error_str.contains("deserialize")
                {
                    crate::events::RalphLoopErrorType::ParseError
                } else if error_str.contains("conflict") || error_str.contains("merge") {
                    crate::events::RalphLoopErrorType::GitConflict
                } else if error_str.contains("agent")
                    || error_str.contains("exit")
                    || error_str.contains("spawn")
                    || error_str.contains("crash")
                {
                    crate::events::RalphLoopErrorType::AgentCrash
                } else {
                    crate::events::RalphLoopErrorType::Unknown
                };

                // Include stories info for max_iterations errors
                let (stories_remaining, total_stories) =
                    if error_type == crate::events::RalphLoopErrorType::MaxIterations {
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
        let executions = ralph_state
            .executions
            .lock()
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
        let executions = ralph_state
            .executions
            .lock()
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
        let executions = ralph_state
            .executions
            .lock()
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
    let executions = ralph_state
        .executions
        .lock()
        .map_err(|e| format!("Executions lock error: {}", e))?;
    Ok(executions.keys().cloned().collect())
}

/// List all active Ralph loop executions with details
pub fn list_ralph_loop_executions_with_details(
    ralph_state: &RalphLoopManagerState,
) -> Result<Vec<ExecutionInfo>, String> {
    let executions = ralph_state
        .executions
        .lock()
        .map_err(|e| format!("Executions lock error: {}", e))?;
    let snapshots = ralph_state
        .snapshots
        .lock()
        .map_err(|e| format!("Snapshots lock error: {}", e))?;

    Ok(executions
        .keys()
        .map(|id| {
            let snapshot = snapshots.get(id);
            ExecutionInfo {
                execution_id: id.clone(),
                project_path: snapshot.and_then(|s| s.project_path.clone()),
                state: snapshot.and_then(|s| s.state.as_ref().map(|st| format!("{:?}", st))),
            }
        })
        .collect())
}

/// Get current agent ID for a Ralph loop execution (for terminal connection)
pub async fn get_ralph_loop_current_agent(
    execution_id: String,
    ralph_state: &RalphLoopManagerState,
) -> Result<Option<String>, String> {
    // Read from snapshot (doesn't require locking orchestrator)
    if let Some(snapshot) = ralph_state.get_snapshot(&execution_id) {
        log::debug!(
            "get_ralph_loop_current_agent: returning {:?}",
            snapshot.current_agent_id
        );
        return Ok(snapshot.current_agent_id);
    }
    log::debug!(
        "get_ralph_loop_current_agent: NO SNAPSHOT for {}",
        execution_id
    );

    // Fallback: check if execution exists
    let exists = {
        let executions = ralph_state
            .executions
            .lock()
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
        let executions = ralph_state
            .executions
            .lock()
            .map_err(|e| format!("Executions lock error: {}", e))?;
        executions.contains_key(&execution_id)
    };

    if exists {
        Ok(None) // No worktree yet
    } else {
        Err(format!("No execution found with ID: {}", execution_id))
    }
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
    let path = crate::utils::as_path(&project_path);

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
