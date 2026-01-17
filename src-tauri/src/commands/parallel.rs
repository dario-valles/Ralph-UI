// Tauri commands for parallel execution

use crate::database::Database;
use crate::models::{Task, Agent};
use crate::parallel::{
    scheduler::{ParallelScheduler, SchedulerConfig, SchedulerStats},
    pool::PoolStats,
    coordinator::{WorktreeCoordinator, WorktreeAllocation},
    conflicts::{ConflictDetector, MergeConflict, ConflictResolutionStrategy, ConflictSummary, ConflictResolutionResult},
};
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
    config: SchedulerConfig,
    repo_path: String,
) -> Result<(), String> {
    let scheduler = ParallelScheduler::new(config);
    let coordinator = WorktreeCoordinator::new(&repo_path);
    let detector = ConflictDetector::new(&repo_path);

    *state.scheduler.lock().unwrap() = Some(scheduler);
    *state.coordinator.lock().unwrap() = Some(coordinator);
    *state.detector.lock().unwrap() = Some(detector);

    Ok(())
}

/// Add task to parallel scheduler
#[tauri::command]
pub fn parallel_add_task(
    state: State<ParallelState>,
    task: Task,
) -> Result<(), String> {
    let mut scheduler = state.scheduler.lock().unwrap();

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
    let mut scheduler = state.scheduler.lock().unwrap();

    let scheduler = scheduler
        .as_mut()
        .ok_or("Scheduler not initialized")?;

    scheduler.add_tasks(tasks);
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
    let mut scheduler = state.scheduler.lock().unwrap();

    let scheduler = scheduler
        .as_mut()
        .ok_or("Scheduler not initialized")?;

    match scheduler.schedule_next(&session_id, &project_path) {
        Ok(Some(agent)) => {
            // Save agent to database
            let db = db.lock().unwrap();
            db.create_agent(&agent)
                .map_err(|e| format!("Failed to save agent: {}", e))?;

            Ok(Some(agent))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(format!("Failed to schedule next task: {}", e)),
    }
}

/// Complete a task in the scheduler
#[tauri::command]
pub fn parallel_complete_task(
    state: State<ParallelState>,
    task_id: String,
) -> Result<(), String> {
    let mut scheduler = state.scheduler.lock().unwrap();

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
    let mut scheduler = state.scheduler.lock().unwrap();

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
    let mut scheduler = state.scheduler.lock().unwrap();

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
    let scheduler = state.scheduler.lock().unwrap();

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
    let scheduler = state.scheduler.lock().unwrap();

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
    let mut scheduler = state.scheduler.lock().unwrap();

    let scheduler = scheduler
        .as_mut()
        .ok_or("Scheduler not initialized")?;

    scheduler.check_violations()
        .map_err(|e| format!("Failed to check violations: {}", e))
}

/// Allocate worktree for agent
#[tauri::command]
pub fn worktree_allocate(
    state: State<ParallelState>,
    agent_id: String,
    task_id: String,
    branch: String,
) -> Result<WorktreeAllocation, String> {
    let mut coordinator = state.coordinator.lock().unwrap();

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
    let mut coordinator = state.coordinator.lock().unwrap();

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
    let mut coordinator = state.coordinator.lock().unwrap();

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
    let coordinator = state.coordinator.lock().unwrap();

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
    let mut coordinator = state.coordinator.lock().unwrap();

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
    let detector = state.detector.lock().unwrap();

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
    let detector = state.detector.lock().unwrap();

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
    let detector = state.detector.lock().unwrap();

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
    let detector = state.detector.lock().unwrap();

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
