// Parallel execution scheduler for tasks
#![allow(dead_code)]

use crate::models::{Task, TaskStatus, Agent, AgentStatus, AgentType};
use crate::agents::{AgentSpawnConfig, AgentFallbackManager, FallbackConfig, RateLimitEvent};
use crate::parallel::pool::{AgentPool, ResourceLimits};
use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use tokio::sync::mpsc;
use uuid::Uuid;

/// Scheduling strategy for task assignment
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SchedulingStrategy {
    /// Execute tasks in priority order
    Priority,
    /// Execute tasks with fewest dependencies first
    DependencyFirst,
    /// Execute tasks in FIFO order
    Fifo,
    /// Execute tasks with highest estimated cost first
    CostFirst,
}

impl Default for SchedulingStrategy {
    fn default() -> Self {
        Self::DependencyFirst
    }
}

/// Error handling strategy for failed tasks
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorStrategy {
    /// Retry with exponential backoff
    Retry {
        max_attempts: i32,
        backoff_ms: u64,
    },
    /// Skip the task and continue with others
    Skip,
    /// Abort the entire scheduler
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

/// Configuration for parallel scheduler
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerConfig {
    /// Maximum number of parallel agents
    pub max_parallel: usize,
    /// Maximum iterations per agent
    pub max_iterations: i32,
    /// Maximum retries for failed tasks (deprecated: use error_strategy)
    pub max_retries: i32,
    /// Agent type to use
    pub agent_type: AgentType,
    /// Scheduling strategy
    pub strategy: SchedulingStrategy,
    /// Resource limits
    pub resource_limits: ResourceLimits,
    /// Error handling strategy
    #[serde(default)]
    pub error_strategy: ErrorStrategy,
    /// Fallback configuration for rate limiting
    #[serde(default)]
    pub fallback_config: FallbackConfig,
    /// Dry-run mode: preview execution without spawning agents
    #[serde(default)]
    pub dry_run: bool,
}

impl Default for SchedulerConfig {
    fn default() -> Self {
        Self {
            max_parallel: 3,
            max_iterations: 10,
            max_retries: 2,
            agent_type: AgentType::Claude,
            strategy: SchedulingStrategy::DependencyFirst,
            resource_limits: ResourceLimits::default(),
            error_strategy: ErrorStrategy::default(),
            fallback_config: FallbackConfig::default(),
            dry_run: false,
        }
    }
}

/// Status of task in the scheduler
#[derive(Debug, Clone)]
struct ScheduledTask {
    task: Task,
    retry_count: i32,
    assigned_agent_id: Option<String>,
    dependencies_met: bool,
}

/// Parallel scheduler for task execution
pub struct ParallelScheduler {
    /// Scheduler configuration
    config: SchedulerConfig,
    /// Agent pool
    pool: AgentPool,
    /// Pending tasks (not yet ready)
    pending: HashMap<String, ScheduledTask>,
    /// Ready tasks (dependencies met, ready to execute)
    ready: VecDeque<ScheduledTask>,
    /// Running tasks (currently executing)
    running: HashMap<String, ScheduledTask>,
    /// Completed task IDs
    completed: HashSet<String>,
    /// Failed task IDs
    failed: HashSet<String>,
    /// Skipped task IDs (due to Skip error strategy)
    skipped: HashSet<String>,
    /// Agent fallback manager for rate limit handling
    fallback_manager: AgentFallbackManager,
    /// Flag to indicate scheduler should abort
    should_abort: bool,
}

impl ParallelScheduler {
    /// Create a new parallel scheduler
    pub fn new(config: SchedulerConfig) -> Self {
        let pool = AgentPool::with_limits(config.resource_limits.clone());
        let fallback_manager = AgentFallbackManager::with_config(config.fallback_config.clone());

        Self {
            config,
            pool,
            pending: HashMap::new(),
            ready: VecDeque::new(),
            running: HashMap::new(),
            completed: HashSet::new(),
            failed: HashSet::new(),
            skipped: HashSet::new(),
            fallback_manager,
            should_abort: false,
        }
    }

    /// Check if the scheduler should abort
    pub fn should_abort(&self) -> bool {
        self.should_abort
    }

    /// Reset the abort flag
    pub fn reset_abort(&mut self) {
        self.should_abort = false;
    }

    /// Get the fallback manager (for external rate limit handling)
    pub fn fallback_manager(&self) -> &AgentFallbackManager {
        &self.fallback_manager
    }

    /// Get mutable reference to fallback manager
    pub fn fallback_manager_mut(&mut self) -> &mut AgentFallbackManager {
        &mut self.fallback_manager
    }

    /// Set the rate limit event sender for rate limit notifications
    /// Events will be forwarded to the frontend via Tauri events
    pub fn set_rate_limit_sender(&self, tx: mpsc::UnboundedSender<RateLimitEvent>) {
        self.pool.set_rate_limit_sender(tx);
    }

    /// Handle rate limit error for a task
    pub fn handle_rate_limit(&mut self, task_id: &str, agent_type: AgentType) -> Result<()> {
        self.fallback_manager.mark_rate_limited(agent_type, task_id);

        // Try to use fallback agent
        if let Some(fallback) = self.fallback_manager.get_fallback(agent_type, task_id) {
            // Re-queue the task with fallback agent
            if let Some(mut scheduled) = self.running.remove(task_id) {
                scheduled.task.status = TaskStatus::Pending;
                scheduled.task.error = Some(format!(
                    "Rate limited on {:?}, retrying with {:?}",
                    agent_type, fallback
                ));
                scheduled.assigned_agent_id = None;
                self.ready.push_front(scheduled); // High priority re-queue
            }
        } else {
            // No fallback available, fail the task
            self.fail_task(task_id, "Rate limited, no fallback available".to_string())?;
        }

        Ok(())
    }

    /// Add a task to the scheduler
    pub fn add_task(&mut self, task: Task) {
        let scheduled = ScheduledTask {
            task,
            retry_count: 0,
            assigned_agent_id: None,
            dependencies_met: false,
        };

        self.pending.insert(scheduled.task.id.clone(), scheduled);
    }

    /// Add multiple tasks to the scheduler
    pub fn add_tasks(&mut self, tasks: Vec<Task>) {
        for task in tasks {
            self.add_task(task);
        }
    }

    /// Update task dependency status
    fn update_dependencies(&mut self) {
        let completed = &self.completed;
        let failed = &self.failed;

        // Check pending tasks for met dependencies
        let mut newly_ready = Vec::new();

        for (task_id, scheduled) in self.pending.iter_mut() {
            if scheduled.dependencies_met {
                continue;
            }

            // Check if all dependencies are completed
            let all_met = scheduled.task.dependencies.iter().all(|dep_id| {
                completed.contains(dep_id)
            });

            // Check if any dependency failed
            let any_failed = scheduled.task.dependencies.iter().any(|dep_id| {
                failed.contains(dep_id)
            });

            if any_failed {
                // Mark task as failed due to dependency failure
                newly_ready.push((task_id.clone(), false));
            } else if all_met {
                // Mark dependencies as met
                scheduled.dependencies_met = true;
                newly_ready.push((task_id.clone(), true));
            }
        }

        // Move ready tasks from pending to ready queue
        for (task_id, is_ready) in newly_ready {
            if let Some(mut scheduled) = self.pending.remove(&task_id) {
                if is_ready {
                    self.ready.push_back(scheduled);
                } else {
                    // Dependency failed, mark as failed
                    scheduled.task.status = TaskStatus::Failed;
                    scheduled.task.error = Some("Dependency task failed".to_string());
                    self.failed.insert(task_id);
                }
            }
        }
    }

    /// Sort ready queue based on strategy
    fn sort_ready_queue(&mut self) {
        let mut tasks: Vec<_> = self.ready.drain(..).collect();

        match self.config.strategy {
            SchedulingStrategy::Priority => {
                // Higher priority first (lower number = higher priority)
                tasks.sort_by_key(|t| t.task.priority);
            }
            SchedulingStrategy::DependencyFirst => {
                // Fewer dependencies first
                tasks.sort_by_key(|t| t.task.dependencies.len());
            }
            SchedulingStrategy::Fifo => {
                // Already in FIFO order, no sorting needed
            }
            SchedulingStrategy::CostFirst => {
                // Higher estimated cost first
                tasks.sort_by_key(|t| std::cmp::Reverse(t.task.estimated_tokens.unwrap_or(0)));
            }
        }

        self.ready = tasks.into();
    }

    /// Try to schedule next task from ready queue
    pub fn schedule_next(&mut self, session_id: &str, project_path: &str) -> Result<Option<Agent>> {
        // Update dependencies
        self.update_dependencies();

        // Sort ready queue
        self.sort_ready_queue();

        // Check if we can spawn more agents
        if !self.pool.can_spawn()? {
            return Ok(None);
        }

        // Check if we're at max parallel limit
        if self.running.len() >= self.config.max_parallel {
            return Ok(None);
        }

        // Get next ready task
        let mut scheduled = match self.ready.pop_front() {
            Some(task) => task,
            None => return Ok(None),
        };

        // Create agent
        let agent_id = Uuid::new_v4().to_string();
        let branch = format!("task/{}", scheduled.task.id);
        let worktree_path = format!("{}/worktrees/{}", project_path, scheduled.task.id);

        // Spawn agent
        let config = AgentSpawnConfig {
            agent_type: self.config.agent_type,
            task_id: scheduled.task.id.clone(),
            worktree_path: worktree_path.clone(),
            branch: branch.clone(),
            max_iterations: self.config.max_iterations,
            prompt: Some(scheduled.task.description.clone()),
        };

        let process_id = self.pool.spawn(&agent_id, config)?;

        // Update scheduled task
        scheduled.assigned_agent_id = Some(agent_id.clone());
        scheduled.task.status = TaskStatus::InProgress;
        scheduled.task.assigned_agent = Some(agent_id.clone());
        scheduled.task.branch = Some(branch.clone());
        scheduled.task.worktree_path = Some(worktree_path.clone());

        // Create agent object
        let agent = Agent {
            id: agent_id.clone(),
            session_id: session_id.to_string(),
            task_id: scheduled.task.id.clone(),
            status: AgentStatus::Idle,
            process_id: Some(process_id),
            worktree_path,
            branch,
            iteration_count: 0,
            tokens: 0,
            cost: 0.0,
            logs: Vec::new(),
            subagents: Vec::new(),
        };

        // Move to running
        self.running.insert(scheduled.task.id.clone(), scheduled);

        Ok(Some(agent))
    }

    /// Mark a task as completed
    pub fn complete_task(&mut self, task_id: &str) -> Result<()> {
        if let Some(mut scheduled) = self.running.remove(task_id) {
            scheduled.task.status = TaskStatus::Completed;
            self.completed.insert(task_id.to_string());

            if let Some(agent_id) = &scheduled.assigned_agent_id {
                let _ = self.pool.stop(agent_id); // Best effort
            }

            Ok(())
        } else {
            Err(anyhow!("Task not found in running queue: {}", task_id))
        }
    }

    /// Mark a task as failed
    pub fn fail_task(&mut self, task_id: &str, error: String) -> Result<()> {
        self.fail_task_with_strategy(task_id, error, None)
    }

    /// Mark a task as failed with optional strategy override
    pub fn fail_task_with_strategy(
        &mut self,
        task_id: &str,
        error: String,
        strategy_override: Option<ErrorStrategy>,
    ) -> Result<()> {
        if let Some(mut scheduled) = self.running.remove(task_id) {
            // Capture agent_id before potential move
            let agent_id = scheduled.assigned_agent_id.clone();

            // Use override strategy or default from config
            let strategy = strategy_override.unwrap_or_else(|| self.config.error_strategy.clone());

            match strategy {
                ErrorStrategy::Retry { max_attempts, backoff_ms: _ } => {
                    // Check if we can retry
                    if scheduled.retry_count < max_attempts {
                        scheduled.retry_count += 1;
                        scheduled.task.status = TaskStatus::Pending;
                        scheduled.task.error = Some(format!("Retry {}: {}", scheduled.retry_count, error));
                        scheduled.assigned_agent_id = None;

                        // Move back to ready queue for retry
                        self.ready.push_back(scheduled);
                    } else {
                        // Max retries reached, mark as failed
                        scheduled.task.status = TaskStatus::Failed;
                        scheduled.task.error = Some(format!("Max retries ({}) exceeded: {}", max_attempts, error));
                        self.failed.insert(task_id.to_string());
                    }
                }
                ErrorStrategy::Skip => {
                    // Skip this task, mark as skipped, continue with others
                    scheduled.task.status = TaskStatus::Failed; // Use Failed status but track in skipped set
                    scheduled.task.error = Some(format!("Skipped: {}", error));
                    self.skipped.insert(task_id.to_string());
                    // Don't add to failed set - skipped tasks don't block dependents
                }
                ErrorStrategy::Abort => {
                    // Mark as failed and signal abort
                    scheduled.task.status = TaskStatus::Failed;
                    scheduled.task.error = Some(format!("Aborted: {}", error));
                    self.failed.insert(task_id.to_string());
                    self.should_abort = true;
                }
            }

            if let Some(agent_id) = agent_id {
                let _ = self.pool.stop(&agent_id); // Best effort
            }

            Ok(())
        } else {
            Err(anyhow!("Task not found in running queue: {}", task_id))
        }
    }

    /// Stop all running tasks
    pub fn stop_all(&mut self) -> Result<()> {
        self.pool.stop_all()?;

        // Move running tasks back to pending
        for (task_id, mut scheduled) in self.running.drain() {
            scheduled.task.status = TaskStatus::Pending;
            scheduled.assigned_agent_id = None;
            self.pending.insert(task_id, scheduled);
        }

        Ok(())
    }

    /// Get scheduler statistics
    pub fn get_stats(&self) -> SchedulerStats {
        SchedulerStats {
            pending: self.pending.len(),
            ready: self.ready.len(),
            running: self.running.len(),
            completed: self.completed.len(),
            failed: self.failed.len(),
            skipped: self.skipped.len(),
            aborted: self.should_abort,
            total: self.pending.len() + self.ready.len() + self.running.len()
                   + self.completed.len() + self.failed.len() + self.skipped.len(),
        }
    }

    /// Get pool statistics
    pub fn get_pool_stats(&self) -> Result<crate::parallel::pool::PoolStats> {
        self.pool.get_stats()
    }

    /// Check if scheduler is in dry-run mode
    pub fn is_dry_run(&self) -> bool {
        self.config.dry_run
    }

    /// Set dry-run mode
    pub fn set_dry_run(&mut self, dry_run: bool) {
        self.config.dry_run = dry_run;
    }

    /// Preview all scheduled tasks without actually executing them (dry-run)
    /// Returns a list of what would happen if the scheduler ran
    pub fn preview_all(&mut self, project_path: &str) -> Vec<DryRunResult> {
        // Update dependencies first
        self.update_dependencies();
        self.sort_ready_queue();

        let mut results = Vec::new();

        // Preview all ready tasks
        for scheduled in &self.ready {
            let branch = format!("task/{}", scheduled.task.id);
            let worktree_path = format!("{}/worktrees/{}", project_path, scheduled.task.id);

            results.push(DryRunResult {
                task_id: scheduled.task.id.clone(),
                task_title: scheduled.task.title.clone(),
                agent_type: self.config.agent_type,
                branch,
                worktree_path,
                max_iterations: self.config.max_iterations,
            });
        }

        // Also preview pending tasks (those with unmet dependencies)
        for (_, scheduled) in &self.pending {
            let branch = format!("task/{}", scheduled.task.id);
            let worktree_path = format!("{}/worktrees/{}", project_path, scheduled.task.id);

            results.push(DryRunResult {
                task_id: scheduled.task.id.clone(),
                task_title: scheduled.task.title.clone(),
                agent_type: self.config.agent_type,
                branch,
                worktree_path,
                max_iterations: self.config.max_iterations,
            });
        }

        results
    }

    /// Schedule next task in dry-run mode (simulates without spawning)
    /// Returns a simulated agent result without actually spawning processes
    pub fn schedule_next_dry_run(&mut self, session_id: &str, project_path: &str) -> Result<Option<Agent>> {
        // Update dependencies
        self.update_dependencies();

        // Sort ready queue
        self.sort_ready_queue();

        // Check if we're at max parallel limit (simulate real behavior)
        if self.running.len() >= self.config.max_parallel {
            log::info!("DRY-RUN: Would wait - at max parallel limit ({}/{})",
                self.running.len(), self.config.max_parallel);
            return Ok(None);
        }

        // Get next ready task
        let mut scheduled = match self.ready.pop_front() {
            Some(task) => task,
            None => return Ok(None),
        };

        // Create simulated agent (no actual process spawned)
        let agent_id = Uuid::new_v4().to_string();
        let branch = format!("task/{}", scheduled.task.id);
        let worktree_path = format!("{}/worktrees/{}", project_path, scheduled.task.id);

        log::info!("DRY-RUN: Would spawn {:?} agent for task '{}' ({}) on branch '{}'",
            self.config.agent_type,
            scheduled.task.title,
            scheduled.task.id,
            branch
        );

        // Update scheduled task (simulate state change)
        scheduled.assigned_agent_id = Some(agent_id.clone());
        scheduled.task.status = TaskStatus::InProgress;
        scheduled.task.assigned_agent = Some(agent_id.clone());
        scheduled.task.branch = Some(branch.clone());
        scheduled.task.worktree_path = Some(worktree_path.clone());

        // Create simulated agent object (process_id is None for dry-run)
        let agent = Agent {
            id: agent_id.clone(),
            session_id: session_id.to_string(),
            task_id: scheduled.task.id.clone(),
            status: AgentStatus::Idle,
            process_id: None, // No actual process in dry-run mode
            worktree_path,
            branch,
            iteration_count: 0,
            tokens: 0,
            cost: 0.0,
            logs: Vec::new(),
            subagents: Vec::new(),
        };

        // Move to running (simulate)
        self.running.insert(scheduled.task.id.clone(), scheduled);

        Ok(Some(agent))
    }

    /// Check for resource violations and handle them
    pub fn check_violations(&mut self) -> Result<Vec<String>> {
        let violations = self.pool.check_violations()?;

        // Stop violating agents
        for agent_id in &violations {
            let _ = self.pool.stop(agent_id);
        }

        // Find tasks with violating agents and mark for retry
        let mut tasks_to_retry = Vec::new();
        for (task_id, scheduled) in &self.running {
            if let Some(agent_id) = &scheduled.assigned_agent_id {
                if violations.contains(agent_id) {
                    tasks_to_retry.push(task_id.clone());
                }
            }
        }

        for task_id in &tasks_to_retry {
            self.fail_task(task_id, "Resource limit violation".to_string())?;
        }

        Ok(violations)
    }
}

/// Scheduler statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchedulerStats {
    pub pending: usize,
    pub ready: usize,
    pub running: usize,
    pub completed: usize,
    pub failed: usize,
    pub skipped: usize,
    pub aborted: bool,
    pub total: usize,
}

/// Result of a dry-run schedule operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DryRunResult {
    /// The task that would be executed
    pub task_id: String,
    pub task_title: String,
    /// The agent type that would be used
    pub agent_type: AgentType,
    /// The branch that would be created
    pub branch: String,
    /// The worktree path that would be used
    pub worktree_path: String,
    /// Maximum iterations configured
    pub max_iterations: i32,
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn create_test_task(id: &str, priority: i32, dependencies: Vec<String>) -> Task {
        Task {
            id: id.to_string(),
            title: format!("Task {}", id),
            description: "Test task".to_string(),
            status: TaskStatus::Pending,
            priority,
            dependencies,
            assigned_agent: None,
            estimated_tokens: Some(1000),
            actual_tokens: None,
            started_at: None,
            completed_at: None,
            branch: None,
            worktree_path: None,
            error: None,
        }
    }

    #[test]
    fn test_scheduler_creation() {
        let config = SchedulerConfig::default();
        let scheduler = ParallelScheduler::new(config);
        let stats = scheduler.get_stats();

        assert_eq!(stats.pending, 0);
        assert_eq!(stats.running, 0);
        assert_eq!(stats.completed, 0);
    }

    #[test]
    fn test_add_task() {
        let config = SchedulerConfig::default();
        let mut scheduler = ParallelScheduler::new(config);

        let task = create_test_task("task1", 1, vec![]);
        scheduler.add_task(task);

        let stats = scheduler.get_stats();
        assert_eq!(stats.pending, 1);
    }

    #[test]
    fn test_add_multiple_tasks() {
        let config = SchedulerConfig::default();
        let mut scheduler = ParallelScheduler::new(config);

        let tasks = vec![
            create_test_task("task1", 1, vec![]),
            create_test_task("task2", 2, vec![]),
            create_test_task("task3", 3, vec![]),
        ];

        scheduler.add_tasks(tasks);

        let stats = scheduler.get_stats();
        assert_eq!(stats.pending, 3);
    }

    #[test]
    fn test_dependency_resolution() {
        let config = SchedulerConfig::default();
        let mut scheduler = ParallelScheduler::new(config);

        let task1 = create_test_task("task1", 1, vec![]);
        let task2 = create_test_task("task2", 2, vec!["task1".to_string()]);

        scheduler.add_task(task1);
        scheduler.add_task(task2);

        // Update dependencies
        scheduler.update_dependencies();

        // Task1 should be ready (no dependencies)
        // Task2 should still be pending (dependency not met)
        assert_eq!(scheduler.ready.len(), 1);
        assert_eq!(scheduler.pending.len(), 1);
    }

    #[test]
    fn test_priority_strategy() {
        let mut config = SchedulerConfig::default();
        config.strategy = SchedulingStrategy::Priority;
        let mut scheduler = ParallelScheduler::new(config);

        let tasks = vec![
            create_test_task("task1", 3, vec![]),
            create_test_task("task2", 1, vec![]),
            create_test_task("task3", 2, vec![]),
        ];

        scheduler.add_tasks(tasks);
        scheduler.update_dependencies();
        scheduler.sort_ready_queue();

        // Should be sorted by priority (lowest first)
        let first = scheduler.ready.front().unwrap();
        assert_eq!(first.task.id, "task2");
        assert_eq!(first.task.priority, 1);
    }

    #[test]
    fn test_dependency_first_strategy() {
        let mut config = SchedulerConfig::default();
        config.strategy = SchedulingStrategy::DependencyFirst;
        let mut scheduler = ParallelScheduler::new(config);

        let tasks = vec![
            create_test_task("task1", 1, vec!["dep1".to_string(), "dep2".to_string()]),
            create_test_task("task2", 2, vec![]),
            create_test_task("task3", 3, vec!["dep1".to_string()]),
        ];

        scheduler.add_tasks(tasks);
        scheduler.update_dependencies();
        scheduler.sort_ready_queue();

        // Should be sorted by dependency count (fewest first)
        let first = scheduler.ready.front().unwrap();
        assert_eq!(first.task.id, "task2");
        assert_eq!(first.task.dependencies.len(), 0);
    }

    #[test]
    fn test_complete_task() {
        let config = SchedulerConfig::default();
        let mut scheduler = ParallelScheduler::new(config);

        let task = create_test_task("task1", 1, vec![]);
        scheduler.add_task(task);

        // Manually add to running (simulate scheduling)
        let scheduled = scheduler.pending.remove("task1").unwrap();
        scheduler.running.insert("task1".to_string(), scheduled);

        // Complete the task
        let result = scheduler.complete_task("task1");
        assert!(result.is_ok());

        let stats = scheduler.get_stats();
        assert_eq!(stats.completed, 1);
        assert_eq!(stats.running, 0);
    }

    #[test]
    fn test_fail_task_with_retry() {
        let mut config = SchedulerConfig::default();
        config.max_retries = 2;
        let mut scheduler = ParallelScheduler::new(config);

        let task = create_test_task("task1", 1, vec![]);
        scheduler.add_task(task);

        // Manually add to running
        let scheduled = scheduler.pending.remove("task1").unwrap();
        scheduler.running.insert("task1".to_string(), scheduled);

        // Fail the task
        let result = scheduler.fail_task("task1", "Test error".to_string());
        assert!(result.is_ok());

        // Should be moved to ready for retry
        assert_eq!(scheduler.ready.len(), 1);
        assert_eq!(scheduler.failed.len(), 0);
    }

    #[test]
    fn test_fail_task_max_retries() {
        let mut config = SchedulerConfig::default();
        config.error_strategy = ErrorStrategy::Retry {
            max_attempts: 2,
            backoff_ms: 1000,
        };
        let mut scheduler = ParallelScheduler::new(config);

        let task = create_test_task("task1", 1, vec![]);
        scheduler.add_task(task);

        // Manually add to running with retry count at max_attempts
        let mut scheduled = scheduler.pending.remove("task1").unwrap();
        scheduled.retry_count = 2; // Already at max_attempts
        scheduler.running.insert("task1".to_string(), scheduled);

        // Fail the task
        let result = scheduler.fail_task("task1", "Test error".to_string());
        assert!(result.is_ok());

        // Should be marked as failed (exceeded max_attempts)
        assert_eq!(scheduler.failed.len(), 1);
        assert_eq!(scheduler.ready.len(), 0);
    }

    #[test]
    fn test_scheduler_stats() {
        let config = SchedulerConfig::default();
        let mut scheduler = ParallelScheduler::new(config);

        scheduler.add_task(create_test_task("task1", 1, vec![]));
        scheduler.add_task(create_test_task("task2", 2, vec![]));
        scheduler.completed.insert("task3".to_string());
        scheduler.failed.insert("task4".to_string());

        let stats = scheduler.get_stats();
        assert_eq!(stats.pending, 2);
        assert_eq!(stats.completed, 1);
        assert_eq!(stats.failed, 1);
        assert_eq!(stats.total, 4);
    }

    #[test]
    fn test_default_scheduling_strategy() {
        let config = SchedulerConfig::default();
        assert_eq!(config.strategy, SchedulingStrategy::DependencyFirst);
    }

    // Error Strategy Tests

    #[test]
    fn test_error_strategy_retry_with_backoff() {
        let mut config = SchedulerConfig::default();
        config.error_strategy = ErrorStrategy::Retry {
            max_attempts: 3,
            backoff_ms: 5000,
        };
        let mut scheduler = ParallelScheduler::new(config);

        let task = create_test_task("task1", 1, vec![]);
        scheduler.add_task(task);

        // Manually add to running
        let scheduled = scheduler.pending.remove("task1").unwrap();
        scheduler.running.insert("task1".to_string(), scheduled);

        // First failure - should retry
        scheduler.fail_task("task1", "Error 1".to_string()).unwrap();
        assert_eq!(scheduler.ready.len(), 1);
        assert_eq!(scheduler.failed.len(), 0);
    }

    #[test]
    fn test_error_strategy_retry_respects_max_attempts() {
        let mut config = SchedulerConfig::default();
        config.error_strategy = ErrorStrategy::Retry {
            max_attempts: 2,
            backoff_ms: 1000,
        };
        let mut scheduler = ParallelScheduler::new(config);

        let task = create_test_task("task1", 1, vec![]);
        scheduler.add_task(task);

        // Add to running with retry_count already at max
        let mut scheduled = scheduler.pending.remove("task1").unwrap();
        scheduled.retry_count = 2;
        scheduler.running.insert("task1".to_string(), scheduled);

        // Should fail permanently
        scheduler.fail_task("task1", "Error".to_string()).unwrap();
        assert_eq!(scheduler.failed.len(), 1);
        assert_eq!(scheduler.ready.len(), 0);
    }

    #[test]
    fn test_error_strategy_skip() {
        let mut config = SchedulerConfig::default();
        config.error_strategy = ErrorStrategy::Skip;
        let mut scheduler = ParallelScheduler::new(config);

        let task = create_test_task("task1", 1, vec![]);
        scheduler.add_task(task);

        // Add to running
        let scheduled = scheduler.pending.remove("task1").unwrap();
        scheduler.running.insert("task1".to_string(), scheduled);

        // Should skip without retrying
        scheduler.fail_task("task1", "Error".to_string()).unwrap();
        assert_eq!(scheduler.skipped.len(), 1);
        assert_eq!(scheduler.failed.len(), 0); // Not in failed set
        assert_eq!(scheduler.ready.len(), 0);  // Not retried
    }

    #[test]
    fn test_error_strategy_abort() {
        let mut config = SchedulerConfig::default();
        config.error_strategy = ErrorStrategy::Abort;
        let mut scheduler = ParallelScheduler::new(config);

        let task = create_test_task("task1", 1, vec![]);
        scheduler.add_task(task);

        // Add to running
        let scheduled = scheduler.pending.remove("task1").unwrap();
        scheduler.running.insert("task1".to_string(), scheduled);

        // Should abort
        scheduler.fail_task("task1", "Error".to_string()).unwrap();
        assert!(scheduler.should_abort());
        assert_eq!(scheduler.failed.len(), 1);

        let stats = scheduler.get_stats();
        assert!(stats.aborted);
    }

    #[test]
    fn test_default_error_strategy_is_retry() {
        let config = SchedulerConfig::default();
        assert_eq!(
            config.error_strategy,
            ErrorStrategy::Retry {
                max_attempts: 3,
                backoff_ms: 5000
            }
        );
    }

    #[test]
    fn test_scheduler_with_fallback_config() {
        let mut config = SchedulerConfig::default();
        config.fallback_config.base_backoff_ms = 1000;
        config.fallback_config.enable_fallback = true;
        let scheduler = ParallelScheduler::new(config);

        assert_eq!(scheduler.fallback_manager().get_config().base_backoff_ms, 1000);
    }

    #[test]
    fn test_reset_abort_flag() {
        let mut config = SchedulerConfig::default();
        config.error_strategy = ErrorStrategy::Abort;
        let mut scheduler = ParallelScheduler::new(config);

        let task = create_test_task("task1", 1, vec![]);
        scheduler.add_task(task);

        let scheduled = scheduler.pending.remove("task1").unwrap();
        scheduler.running.insert("task1".to_string(), scheduled);

        scheduler.fail_task("task1", "Error".to_string()).unwrap();
        assert!(scheduler.should_abort());

        scheduler.reset_abort();
        assert!(!scheduler.should_abort());
    }

    #[test]
    fn test_fail_task_with_strategy_override() {
        let config = SchedulerConfig::default(); // Default is Retry
        let mut scheduler = ParallelScheduler::new(config);

        let task = create_test_task("task1", 1, vec![]);
        scheduler.add_task(task);

        let scheduled = scheduler.pending.remove("task1").unwrap();
        scheduler.running.insert("task1".to_string(), scheduled);

        // Override with Skip strategy
        scheduler
            .fail_task_with_strategy("task1", "Error".to_string(), Some(ErrorStrategy::Skip))
            .unwrap();

        assert_eq!(scheduler.skipped.len(), 1);
        assert_eq!(scheduler.ready.len(), 0); // Not retried despite default being Retry
    }

    #[test]
    fn test_stats_include_skipped() {
        let mut config = SchedulerConfig::default();
        config.error_strategy = ErrorStrategy::Skip;
        let mut scheduler = ParallelScheduler::new(config);

        scheduler.add_task(create_test_task("task1", 1, vec![]));

        let scheduled = scheduler.pending.remove("task1").unwrap();
        scheduler.running.insert("task1".to_string(), scheduled);

        scheduler.fail_task("task1", "Error".to_string()).unwrap();

        let stats = scheduler.get_stats();
        assert_eq!(stats.skipped, 1);
        assert_eq!(stats.total, 1);
    }

    // Dry-run Mode Tests

    #[test]
    fn test_dry_run_mode_disabled_by_default() {
        let config = SchedulerConfig::default();
        assert!(!config.dry_run);

        let scheduler = ParallelScheduler::new(config);
        assert!(!scheduler.is_dry_run());
    }

    #[test]
    fn test_dry_run_mode_can_be_enabled() {
        let mut config = SchedulerConfig::default();
        config.dry_run = true;
        let scheduler = ParallelScheduler::new(config);

        assert!(scheduler.is_dry_run());
    }

    #[test]
    fn test_set_dry_run() {
        let config = SchedulerConfig::default();
        let mut scheduler = ParallelScheduler::new(config);

        assert!(!scheduler.is_dry_run());
        scheduler.set_dry_run(true);
        assert!(scheduler.is_dry_run());
    }

    #[test]
    fn test_dry_run_preview_all() {
        let mut config = SchedulerConfig::default();
        config.dry_run = true;
        let mut scheduler = ParallelScheduler::new(config);

        // Add tasks
        scheduler.add_task(create_test_task("task1", 1, vec![]));
        scheduler.add_task(create_test_task("task2", 2, vec![]));
        scheduler.add_task(create_test_task("task3", 3, vec!["task1".to_string()]));

        let preview = scheduler.preview_all("/test/project");

        // Should have all 3 tasks previewed
        assert_eq!(preview.len(), 3);

        // Check first task preview
        let task1_preview = preview.iter().find(|p| p.task_id == "task1").unwrap();
        assert_eq!(task1_preview.task_title, "Task task1");
        assert_eq!(task1_preview.branch, "task/task1");
        assert_eq!(task1_preview.worktree_path, "/test/project/worktrees/task1");
        assert_eq!(task1_preview.agent_type, AgentType::Claude);
    }

    #[test]
    fn test_dry_run_schedule_next_does_not_spawn_process() {
        let mut config = SchedulerConfig::default();
        config.dry_run = true;
        let mut scheduler = ParallelScheduler::new(config);

        scheduler.add_task(create_test_task("task1", 1, vec![]));

        let result = scheduler.schedule_next_dry_run("session1", "/test/project");
        assert!(result.is_ok());

        let agent = result.unwrap();
        assert!(agent.is_some());

        let agent = agent.unwrap();
        // In dry-run, process_id should be None (no actual process spawned)
        assert!(agent.process_id.is_none());
        assert_eq!(agent.task_id, "task1");
        assert_eq!(agent.branch, "task/task1");
    }

    #[test]
    fn test_dry_run_respects_max_parallel_limit() {
        let mut config = SchedulerConfig::default();
        config.dry_run = true;
        config.max_parallel = 1;
        let mut scheduler = ParallelScheduler::new(config);

        scheduler.add_task(create_test_task("task1", 1, vec![]));
        scheduler.add_task(create_test_task("task2", 2, vec![]));

        // First task should be scheduled
        let result1 = scheduler.schedule_next_dry_run("session1", "/test/project");
        assert!(result1.unwrap().is_some());

        // Second task should be blocked (max_parallel = 1)
        let result2 = scheduler.schedule_next_dry_run("session1", "/test/project");
        assert!(result2.unwrap().is_none());
    }

    #[test]
    fn test_dry_run_result_contains_correct_info() {
        let mut config = SchedulerConfig::default();
        config.dry_run = true;
        config.agent_type = AgentType::Opencode;
        config.max_iterations = 15;
        let mut scheduler = ParallelScheduler::new(config);

        scheduler.add_task(create_test_task("test-task", 1, vec![]));

        let preview = scheduler.preview_all("/my/project");
        assert_eq!(preview.len(), 1);

        let result = &preview[0];
        assert_eq!(result.task_id, "test-task");
        assert_eq!(result.agent_type, AgentType::Opencode);
        assert_eq!(result.max_iterations, 15);
        assert_eq!(result.worktree_path, "/my/project/worktrees/test-task");
    }
}
