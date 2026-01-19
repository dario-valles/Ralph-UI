// Tauri commands for parallel execution

use crate::database::Database;
use crate::models::{Task, Agent, AgentStatus};
use crate::parallel::{
    scheduler::{ParallelScheduler, SchedulerConfig, SchedulerStats},
    pool::{PoolStats, CompletedAgent},
    coordinator::{WorktreeCoordinator, WorktreeAllocation},
    conflicts::{ConflictDetector, MergeConflict, ConflictResolutionStrategy, ConflictSummary, ConflictResolutionResult},
};
use crate::events::{emit_agent_status_changed, AgentStatusChangedPayload};
use crate::RateLimitEventState;
use std::sync::Mutex;
use tauri::State;

/// State for the parallel scheduler
pub struct ParallelState {
    pub scheduler: Mutex<Option<ParallelScheduler>>,
    pub coordinator: Mutex<Option<WorktreeCoordinator>>,
    pub detector: Mutex<Option<ConflictDetector>>,
}

impl ParallelState {
    pub fn new() -> Self {
        Self {
            scheduler: Mutex::new(None),
            coordinator: Mutex::new(None),
            detector: Mutex::new(None),
        }
    }
}

impl Default for ParallelState {
    fn default() -> Self {
        Self::new()
    }
}

/// Initialize parallel scheduler
#[tauri::command]
pub fn init_parallel_scheduler(
    state: State<ParallelState>,
    rate_limit_state: State<RateLimitEventState>,
    config: SchedulerConfig,
    repo_path: String,
) -> Result<(), String> {
    log::info!("[Parallel] Initializing scheduler with config: {:?}, repo_path: {}", config, repo_path);

    let scheduler = ParallelScheduler::new(config);

    // Wire up rate limit event sender so agents can report rate limits to frontend
    let rate_limit_sender = rate_limit_state.get_sender();
    scheduler.set_rate_limit_sender(rate_limit_sender);

    let coordinator = WorktreeCoordinator::new(&repo_path);
    let detector = ConflictDetector::new(&repo_path);

    *state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))? = Some(scheduler);
    *state.coordinator.lock().map_err(|e| format!("Lock error: {}", e))? = Some(coordinator);
    *state.detector.lock().map_err(|e| format!("Lock error: {}", e))? = Some(detector);

    log::info!("[Parallel] Scheduler initialized successfully");
    Ok(())
}

/// Add task to parallel scheduler
#[tauri::command]
pub fn parallel_add_task(
    state: State<ParallelState>,
    task: Task,
) -> Result<(), String> {
    let mut scheduler = state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))?;

    let scheduler = scheduler
        .as_mut()
        .ok_or("Scheduler not initialized")?;

    scheduler.add_task(task);
    Ok(())
}

/// Add multiple tasks to scheduler
#[tauri::command]
pub fn parallel_add_tasks(
    state: State<ParallelState>,
    tasks: Vec<Task>,
) -> Result<(), String> {
    log::info!("[Parallel] Adding {} tasks to scheduler", tasks.len());
    for task in &tasks {
        log::debug!("[Parallel] Task: {} - {}", task.id, task.title);
    }

    let mut scheduler = state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))?;

    let scheduler = scheduler
        .as_mut()
        .ok_or("Scheduler not initialized")?;

    scheduler.add_tasks(tasks);
    log::info!("[Parallel] Tasks added successfully");
    Ok(())
}

/// Schedule next task from queue
#[tauri::command]
pub fn parallel_schedule_next(
    state: State<ParallelState>,
    db: State<Mutex<Database>>,
    session_id: String,
    project_path: String,
) -> Result<Option<Agent>, String> {
    log::info!("[Parallel] schedule_next called for session: {}, project: {}", session_id, project_path);

    // First, peek at what task would be scheduled
    let task_info = {
        let mut scheduler = state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))?;
        let scheduler = scheduler
            .as_mut()
            .ok_or("Scheduler not initialized")?;

        scheduler.peek_next_task()
    };

    let task_info = match task_info {
        Some(info) => {
            log::info!("[Parallel] Next task to schedule: {} ({})", info.1, info.0);
            info
        }
        None => {
            log::info!("[Parallel] No task available to schedule");
            return Ok(None);
        }
    };

    let (task_id, _task_title) = task_info;

    // Allocate worktree for the task
    log::info!("[Parallel] Allocating worktree for task: {}", task_id);
    let worktree_allocation = {
        let mut coordinator = state.coordinator.lock().map_err(|e| format!("Lock error: {}", e))?;
        let coordinator = coordinator
            .as_mut()
            .ok_or("Coordinator not initialized")?;

        // Ensure base directory exists
        coordinator.ensure_base_directory()
            .map_err(|e| format!("Failed to ensure worktree base directory: {}", e))?;

        // Create branch name for this task
        let branch = format!("task/{}", task_id);

        // Generate a unique agent ID for this allocation
        let agent_id = uuid::Uuid::new_v4().to_string();

        match coordinator.allocate_worktree(&agent_id, &task_id, &branch) {
            Ok(allocation) => {
                log::info!("[Parallel] Worktree allocated: {} on branch {}", allocation.worktree_path, allocation.branch);
                Some((allocation.worktree_path, allocation.branch))
            }
            Err(e) => {
                log::error!("[Parallel] Failed to allocate worktree: {}", e);
                // If worktree allocation fails, try to continue without it
                // The agent will run in the main project directory
                log::warn!("[Parallel] Falling back to project path: {}", project_path);
                None
            }
        }
    };

    // Now schedule the task with the allocated worktree
    let mut scheduler = state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))?;
    let scheduler = scheduler
        .as_mut()
        .ok_or("Scheduler not initialized")?;

    log::info!("[Parallel] Calling scheduler.schedule_next_with_worktree...");
    match scheduler.schedule_next_with_worktree(&session_id, &project_path, worktree_allocation) {
        Ok(Some(agent)) => {
            log::info!("[Parallel] Agent scheduled: {} for task {}", agent.id, agent.task_id);
            // Save agent to database
            let db = db.lock().map_err(|e| format!("Lock error: {}", e))?;
            db.create_agent(&agent)
                .map_err(|e| format!("Failed to save agent: {}", e))?;
            log::info!("[Parallel] Agent saved to database");

            Ok(Some(agent))
        }
        Ok(None) => {
            log::info!("[Parallel] No task available to schedule (unexpected after peek)");
            Ok(None)
        }
        Err(e) => {
            log::error!("[Parallel] Failed to schedule next task: {}", e);
            Err(format!("Failed to schedule next task: {}", e))
        }
    }
}

/// Complete a task in the scheduler
#[tauri::command]
pub fn parallel_complete_task(
    state: State<ParallelState>,
    task_id: String,
) -> Result<(), String> {
    let mut scheduler = state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))?;

    let scheduler = scheduler
        .as_mut()
        .ok_or("Scheduler not initialized")?;

    scheduler.complete_task(&task_id)
        .map_err(|e| format!("Failed to complete task: {}", e))
}

/// Mark a task as failed
#[tauri::command]
pub fn parallel_fail_task(
    state: State<ParallelState>,
    task_id: String,
    error: String,
) -> Result<(), String> {
    let mut scheduler = state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))?;

    let scheduler = scheduler
        .as_mut()
        .ok_or("Scheduler not initialized")?;

    scheduler.fail_task(&task_id, error)
        .map_err(|e| format!("Failed to mark task as failed: {}", e))
}

/// Stop all running tasks
#[tauri::command]
pub fn parallel_stop_all(
    state: State<ParallelState>,
) -> Result<(), String> {
    let mut scheduler = state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))?;

    let scheduler = scheduler
        .as_mut()
        .ok_or("Scheduler not initialized")?;

    scheduler.stop_all()
        .map_err(|e| format!("Failed to stop all tasks: {}", e))
}

/// Get scheduler statistics
#[tauri::command]
pub fn parallel_get_scheduler_stats(
    state: State<ParallelState>,
) -> Result<SchedulerStats, String> {
    let scheduler = state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))?;

    let scheduler = scheduler
        .as_ref()
        .ok_or("Scheduler not initialized")?;

    Ok(scheduler.get_stats())
}

/// Get pool statistics
#[tauri::command]
pub fn parallel_get_pool_stats(
    state: State<ParallelState>,
) -> Result<PoolStats, String> {
    let scheduler = state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))?;

    let scheduler = scheduler
        .as_ref()
        .ok_or("Scheduler not initialized")?;

    scheduler.get_pool_stats()
        .map_err(|e| format!("Failed to get pool stats: {}", e))
}

/// Check for resource violations
#[tauri::command]
pub fn parallel_check_violations(
    state: State<ParallelState>,
) -> Result<Vec<String>, String> {
    let mut scheduler = state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))?;

    let scheduler = scheduler
        .as_mut()
        .ok_or("Scheduler not initialized")?;

    scheduler.check_violations()
        .map_err(|e| format!("Failed to check violations: {}", e))
}

/// Get real-time in-memory logs for an agent from the pool
/// Use this for logs during agent execution (before agent completes)
#[tauri::command]
pub fn parallel_get_agent_logs(
    state: State<ParallelState>,
    agent_id: String,
) -> Result<Vec<crate::models::LogEntry>, String> {
    let scheduler = state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))?;

    let scheduler = scheduler
        .as_ref()
        .ok_or("Scheduler not initialized")?;

    Ok(scheduler.get_agent_logs(&agent_id))
}

/// Poll for completed agents and update their status
/// This should be called periodically by the frontend to detect when agents finish
#[tauri::command]
pub fn parallel_poll_completed(
    app_handle: tauri::AppHandle,
    state: State<ParallelState>,
    db: State<Mutex<Database>>,
) -> Result<Vec<CompletedAgent>, String> {
    log::debug!("[Parallel] poll_completed called");

    // Poll the pool for completed agents (scoped to release lock)
    let completed = {
        let scheduler_guard = state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))?;
        let scheduler = scheduler_guard
            .as_ref()
            .ok_or("Scheduler not initialized")?;

        scheduler.poll_completed()
            .map_err(|e| format!("Failed to poll completed agents: {}", e))?
    };

    // Update database and emit events for each completed agent
    {
        let db = db.lock().map_err(|e| format!("Lock error: {}", e))?;

        for agent in &completed {
            log::info!("[Parallel] Agent {} completed with exit code {}, {} logs",
                agent.agent_id, agent.exit_code, agent.logs.len());

            // Save logs to database
            for log_entry in &agent.logs {
                if let Err(e) = db.add_log(&agent.agent_id, log_entry) {
                    log::error!("[Parallel] Failed to save log for agent {}: {}", agent.agent_id, e);
                }
            }

            // Determine new status based on exit code
            let new_status = if agent.exit_code == 0 {
                AgentStatus::Idle // Success
            } else {
                AgentStatus::Idle // Failed but still idle
            };

            // Get current agent to get session_id
            if let Ok(Some(current_agent)) = db.get_agent(&agent.agent_id) {
                // Update agent status in database
                if let Err(e) = db.update_agent_status(&agent.agent_id, &new_status) {
                    log::error!("[Parallel] Failed to update agent status: {}", e);
                }

                // Emit status changed event
                let payload = AgentStatusChangedPayload {
                    agent_id: agent.agent_id.clone(),
                    session_id: current_agent.session_id.clone(),
                    old_status: format!("{:?}", current_agent.status).to_lowercase(),
                    new_status: format!("{:?}", new_status).to_lowercase(),
                };
                let _ = emit_agent_status_changed(&app_handle, payload);
            }
        }
    }

    // Mark tasks as completed in scheduler (need mutable access)
    {
        let mut scheduler_guard = state.scheduler.lock().map_err(|e| format!("Lock error: {}", e))?;
        if let Some(scheduler) = scheduler_guard.as_mut() {
            for agent in &completed {
                if agent.exit_code == 0 {
                    let _ = scheduler.complete_task(&agent.task_id);
                } else {
                    let _ = scheduler.fail_task(&agent.task_id, format!("Agent exited with code {}", agent.exit_code));
                }
            }
        }
    }

    Ok(completed)
}

/// Allocate worktree for agent
#[tauri::command]
pub fn worktree_allocate(
    state: State<ParallelState>,
    agent_id: String,
    task_id: String,
    branch: String,
) -> Result<WorktreeAllocation, String> {
    let mut coordinator = state.coordinator.lock().map_err(|e| format!("Lock error: {}", e))?;

    let coordinator = coordinator
        .as_mut()
        .ok_or("Coordinator not initialized")?;

    coordinator.allocate_worktree(&agent_id, &task_id, &branch)
        .map_err(|e| format!("Failed to allocate worktree: {}", e))
}

/// Deallocate worktree
#[tauri::command]
pub fn worktree_deallocate(
    state: State<ParallelState>,
    worktree_path: String,
) -> Result<(), String> {
    let mut coordinator = state.coordinator.lock().map_err(|e| format!("Lock error: {}", e))?;

    let coordinator = coordinator
        .as_mut()
        .ok_or("Coordinator not initialized")?;

    coordinator.deallocate_worktree(&worktree_path)
        .map_err(|e| format!("Failed to deallocate worktree: {}", e))
}

/// Deallocate worktree by agent ID
#[tauri::command]
pub fn worktree_deallocate_by_agent(
    state: State<ParallelState>,
    agent_id: String,
) -> Result<(), String> {
    let mut coordinator = state.coordinator.lock().map_err(|e| format!("Lock error: {}", e))?;

    let coordinator = coordinator
        .as_mut()
        .ok_or("Coordinator not initialized")?;

    coordinator.deallocate_by_agent(&agent_id)
        .map_err(|e| format!("Failed to deallocate worktree: {}", e))
}

/// Get all worktree allocations
#[tauri::command]
pub fn worktree_get_allocations(
    state: State<ParallelState>,
) -> Result<Vec<WorktreeAllocation>, String> {
    let coordinator = state.coordinator.lock().map_err(|e| format!("Lock error: {}", e))?;

    let coordinator = coordinator
        .as_ref()
        .ok_or("Coordinator not initialized")?;

    Ok(coordinator.get_all_allocations())
}

/// Cleanup orphaned worktrees
#[tauri::command]
pub fn worktree_cleanup_orphaned(
    state: State<ParallelState>,
) -> Result<Vec<String>, String> {
    let mut coordinator = state.coordinator.lock().map_err(|e| format!("Lock error: {}", e))?;

    let coordinator = coordinator
        .as_mut()
        .ok_or("Coordinator not initialized")?;

    coordinator.cleanup_orphaned()
        .map_err(|e| format!("Failed to cleanup orphaned worktrees: {}", e))
}

/// Detect conflicts between branches
#[tauri::command]
pub fn conflicts_detect(
    state: State<ParallelState>,
    branches: Vec<(String, String)>, // (branch_name, agent_id)
) -> Result<Vec<MergeConflict>, String> {
    let detector = state.detector.lock().map_err(|e| format!("Lock error: {}", e))?;

    let detector = detector
        .as_ref()
        .ok_or("Conflict detector not initialized")?;

    detector.detect_all_conflicts(branches)
        .map_err(|e| format!("Failed to detect conflicts: {}", e))
}

/// Check if branches can merge safely
#[tauri::command]
pub fn conflicts_can_merge_safely(
    state: State<ParallelState>,
    branch1: String,
    branch2: String,
) -> Result<bool, String> {
    let detector = state.detector.lock().map_err(|e| format!("Lock error: {}", e))?;

    let detector = detector
        .as_ref()
        .ok_or("Conflict detector not initialized")?;

    detector.can_merge_safely(&branch1, &branch2)
        .map_err(|e| format!("Failed to check merge safety: {}", e))
}

/// Get conflict summary
#[tauri::command]
pub fn conflicts_get_summary(
    state: State<ParallelState>,
    conflicts: Vec<MergeConflict>,
) -> Result<ConflictSummary, String> {
    let detector = state.detector.lock().map_err(|e| format!("Lock error: {}", e))?;

    let detector = detector
        .as_ref()
        .ok_or("Conflict detector not initialized")?;

    Ok(detector.get_conflict_summary(&conflicts))
}

/// Resolve a conflict using the specified strategy
#[tauri::command]
pub fn conflicts_resolve(
    state: State<ParallelState>,
    conflict: MergeConflict,
    strategy: ConflictResolutionStrategy,
    base_branch: String,
) -> Result<ConflictResolutionResult, String> {
    let detector = state.detector.lock().map_err(|e| format!("Lock error: {}", e))?;

    let detector = detector
        .as_ref()
        .ok_or("Conflict detector not initialized")?;

    detector.resolve_conflict(&conflict, strategy, &base_branch)
        .map_err(|e| format!("Failed to resolve conflict: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{AgentType, TaskStatus};
    use crate::parallel::scheduler::{SchedulingStrategy, ErrorStrategy};
    use crate::parallel::pool::ResourceLimits;
    use crate::agents::FallbackConfig;

    fn create_test_state() -> ParallelState {
        ParallelState::new()
    }

    fn create_test_config() -> SchedulerConfig {
        SchedulerConfig {
            max_parallel: 2,
            max_iterations: 10,
            max_retries: 2,
            agent_type: AgentType::Claude,
            strategy: SchedulingStrategy::Priority,
            resource_limits: ResourceLimits::default(),
            error_strategy: ErrorStrategy::default(),
            fallback_config: FallbackConfig::default(),
            dry_run: false,
            model: None,
        }
    }

    #[test]
    fn test_parallel_state_creation() {
        let state = create_test_state();
        assert!(state.scheduler.lock().unwrap().is_none());
        assert!(state.coordinator.lock().unwrap().is_none());
    }

    #[test]
    fn test_init_parallel_scheduler() {
        let state = create_test_state();
        let config = create_test_config();

        // Initialize scheduler directly on state
        let scheduler = ParallelScheduler::new(config);
        *state.scheduler.lock().unwrap() = Some(scheduler);

        assert!(state.scheduler.lock().unwrap().is_some());
    }

    #[test]
    fn test_parallel_add_task_not_initialized() {
        let state = create_test_state();
        let task = Task {
            id: "task1".to_string(),
            title: "Test Task".to_string(),
            description: "Test".to_string(),
            status: TaskStatus::Pending,
            priority: 1,
            dependencies: vec![],
            assigned_agent: None,
            estimated_tokens: None,
            actual_tokens: None,
            started_at: None,
            completed_at: None,
            branch: None,
            worktree_path: None,
            error: None,
        };

        // Test that adding a task to uninitialized state fails
        let scheduler = state.scheduler.lock().unwrap();
        assert!(scheduler.is_none());
    }

    #[test]
    fn test_parallel_get_scheduler_stats_not_initialized() {
        let state = create_test_state();
        // Test that getting stats from uninitialized state fails
        let scheduler = state.scheduler.lock().unwrap();
        assert!(scheduler.is_none());
    }

    #[test]
    fn test_parallel_add_task_initialized() {
        let state = create_test_state();
        let config = create_test_config();

        // Initialize scheduler
        let mut scheduler = ParallelScheduler::new(config);

        let task = Task {
            id: "task1".to_string(),
            title: "Test Task".to_string(),
            description: "Test".to_string(),
            status: TaskStatus::Pending,
            priority: 1,
            dependencies: vec![],
            assigned_agent: None,
            estimated_tokens: None,
            actual_tokens: None,
            started_at: None,
            completed_at: None,
            branch: None,
            worktree_path: None,
            error: None,
        };

        scheduler.add_task(task);
        let stats = scheduler.get_stats();
        assert_eq!(stats.pending, 1);

        *state.scheduler.lock().unwrap() = Some(scheduler);
    }

    #[test]
    fn test_parallel_get_scheduler_stats_initialized() {
        let state = create_test_state();
        let config = create_test_config();

        // Initialize scheduler
        let scheduler = ParallelScheduler::new(config);
        let stats = scheduler.get_stats();

        assert_eq!(stats.pending, 0);
        assert_eq!(stats.running, 0);
        assert_eq!(stats.completed, 0);
    }
}
