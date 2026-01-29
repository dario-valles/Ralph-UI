//! Parallel Orchestrator for Ralph Loop
//!
//! Manages parallel execution of independent stories using multiple agents.
//! Each agent works in its own isolated worktree, and completed work is
//! merged back to the main branch.

use crate::agents::manager::AgentManager;
use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
use crate::ralph_loop::{
    BriefBuilder, CompletionDetector, LearningsManager, PrdExecutor, ProgressTracker,
    PromptBuilder, RalphLoopConfig, RalphLoopMetrics, RalphPrd, RalphStory,
};
use crate::utils::lock_mutex_recover;

use super::merge_coordinator::{CompletedWork, ConflictInfo, MergeCoordinator, MergeResult};
use super::worktree_pool::{WorktreeAllocation, WorktreePool};
use super::RalphLoopState;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Status of a parallel agent
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParallelAgentStatus {
    /// Agent ID
    pub agent_id: String,
    /// Story ID being worked on
    pub story_id: String,
    /// Story title
    pub story_title: String,
    /// Current status
    pub status: ParallelAgentState,
    /// Worktree path
    pub worktree_path: String,
    /// Branch name
    pub branch_name: String,
    /// Start time
    pub start_time: String,
    /// End time (if completed)
    pub end_time: Option<String>,
    /// Error message (if failed)
    pub error: Option<String>,
}

/// State of a parallel agent
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ParallelAgentState {
    Running,
    Completed,
    Failed,
    Merging,
}

/// Handle to a running agent process
struct AgentHandle {
    /// Agent ID
    agent_id: String,
    /// Story being worked on (kept for future use in progress tracking)
    #[allow(dead_code)]
    story: RalphStory,
    /// Worktree allocation
    allocation: WorktreeAllocation,
    /// Child process (taken when waiting)
    child: Option<std::process::Child>,
    /// Start time
    start_time: std::time::Instant,
}

/// Parallel orchestrator for running multiple agents simultaneously
pub struct ParallelOrchestrator {
    /// Configuration
    config: RalphLoopConfig,
    /// Unique execution ID
    execution_id: String,
    /// PRD executor for file operations
    prd_executor: PrdExecutor,
    /// Progress tracker (kept for future use)
    #[allow(dead_code)]
    progress_tracker: ProgressTracker,
    /// Prompt builder (kept for future use)
    #[allow(dead_code)]
    prompt_builder: PromptBuilder,
    /// Brief builder (kept for future use)
    #[allow(dead_code)]
    brief_builder: BriefBuilder,
    /// Learnings manager (kept for future use)
    #[allow(dead_code)]
    learnings_manager: LearningsManager,
    /// Completion detector
    completion_detector: CompletionDetector,
    /// Worktree pool for parallel agents
    worktree_pool: WorktreePool,
    /// Merge coordinator
    merge_coordinator: MergeCoordinator,
    /// Currently active agents (story_id -> handle)
    active_agents: HashMap<String, AgentHandle>,
    /// Agent statuses for UI
    agent_statuses: Vec<ParallelAgentStatus>,
    /// Cumulative metrics
    metrics: RalphLoopMetrics,
    /// Current state
    state: RalphLoopState,
    /// Cancellation flag
    cancelled: Arc<Mutex<bool>>,
    /// Maximum parallel agents
    max_parallel: usize,
    /// Total iterations (agent spawns)
    iteration_count: u32,
}

impl ParallelOrchestrator {
    /// Create a new parallel orchestrator
    pub fn new(config: RalphLoopConfig, max_parallel: usize) -> Self {
        let execution_id = uuid::Uuid::new_v4().to_string();
        let completion_promise = config
            .completion_promise
            .clone()
            .unwrap_or_else(|| "<promise>COMPLETE</promise>".to_string());

        // Determine base branch
        let base_branch = config.branch.clone().unwrap_or_else(|| "main".to_string());

        // Create components
        let prd_executor = PrdExecutor::new(&config.project_path, &config.prd_name);
        let progress_tracker = ProgressTracker::new(&config.project_path, &config.prd_name);
        let prompt_builder = PromptBuilder::new(&config.project_path, &config.prd_name);
        let brief_builder = BriefBuilder::new(&config.project_path, &config.prd_name);
        let learnings_manager = LearningsManager::new(&config.project_path, &config.prd_name);

        // Create worktree pool and merge coordinator
        let worktree_pool = WorktreePool::new(
            &config.project_path,
            &base_branch,
            max_parallel,
            &config.prd_name,
        );
        let merge_coordinator = MergeCoordinator::new(&config.project_path, &base_branch);

        Self {
            prd_executor,
            progress_tracker,
            prompt_builder,
            brief_builder,
            learnings_manager,
            completion_detector: CompletionDetector::new(&completion_promise),
            worktree_pool,
            merge_coordinator,
            active_agents: HashMap::new(),
            agent_statuses: Vec::new(),
            metrics: RalphLoopMetrics::default(),
            state: RalphLoopState::Idle,
            cancelled: Arc::new(Mutex::new(false)),
            max_parallel,
            iteration_count: 0,
            config,
            execution_id,
        }
    }

    /// Get the execution ID
    pub fn execution_id(&self) -> &str {
        &self.execution_id
    }

    /// Get current state
    pub fn state(&self) -> &RalphLoopState {
        &self.state
    }

    /// Get metrics
    pub fn metrics(&self) -> &RalphLoopMetrics {
        &self.metrics
    }

    /// Get agent statuses for UI
    pub fn agent_statuses(&self) -> &[ParallelAgentStatus] {
        &self.agent_statuses
    }

    /// Get conflicts
    pub fn conflicts(&self) -> &[ConflictInfo] {
        self.merge_coordinator.conflicts()
    }

    /// Get cancellation handle
    pub fn get_cancel_handle(&self) -> Arc<Mutex<bool>> {
        self.cancelled.clone()
    }

    /// Cancel execution
    pub fn cancel(&mut self) {
        *lock_mutex_recover(&self.cancelled) = true;
    }

    /// Get stories that can run now (dependencies satisfied, not already running, not passed)
    fn get_runnable_stories<'a>(&self, prd: &'a RalphPrd) -> Vec<&'a RalphStory> {
        prd.stories
            .iter()
            .filter(|s| !s.passes) // Not already done
            .filter(|s| !self.active_agents.contains_key(&s.id)) // Not already running
            .filter(|s| s.dependencies_satisfied(&prd.stories)) // Dependencies met
            .collect()
    }

    /// Run the parallel orchestration loop
    pub async fn run(
        &mut self,
        agent_manager_arc: Arc<Mutex<AgentManager>>,
    ) -> Result<RalphLoopMetrics, String> {
        log::info!(
            "[ParallelOrchestrator] Starting parallel execution {} with max {} agents",
            self.execution_id,
            self.max_parallel
        );

        let start_time = std::time::Instant::now();
        self.state = RalphLoopState::Running { iteration: 1 };

        loop {
            // Check for cancellation
            if *lock_mutex_recover(&self.cancelled) {
                log::warn!(
                    "[ParallelOrchestrator] Cancelled at iteration {}",
                    self.iteration_count
                );
                self.cleanup_all_agents(&agent_manager_arc);
                self.state = RalphLoopState::Cancelled {
                    iteration: self.iteration_count,
                };
                return Ok(self.metrics.clone());
            }

            // Check max iterations
            if self.iteration_count >= self.config.max_iterations {
                log::warn!(
                    "[ParallelOrchestrator] Max iterations ({}) reached",
                    self.config.max_iterations
                );
                self.cleanup_all_agents(&agent_manager_arc);
                self.state = RalphLoopState::Failed {
                    iteration: self.iteration_count,
                    reason: format!("Max iterations ({}) reached", self.config.max_iterations),
                };
                return Ok(self.metrics.clone());
            }

            // Check max cost
            if let Some(max_cost) = self.config.max_cost {
                if self.metrics.total_cost >= max_cost {
                    log::warn!(
                        "[ParallelOrchestrator] Max cost (${:.2}) exceeded",
                        max_cost
                    );
                    self.cleanup_all_agents(&agent_manager_arc);
                    self.state = RalphLoopState::Failed {
                        iteration: self.iteration_count,
                        reason: format!("Max cost (${:.2}) exceeded", max_cost),
                    };
                    return Ok(self.metrics.clone());
                }
            }

            // Read current PRD status
            let prd = match self.prd_executor.read_prd() {
                Ok(p) => p,
                Err(e) => {
                    log::error!("[ParallelOrchestrator] Failed to read PRD: {}", e);
                    self.cleanup_all_agents(&agent_manager_arc);
                    return Err(e);
                }
            };

            let prd_status = self.prd_executor.get_status(&prd);
            log::info!(
                "[ParallelOrchestrator] PRD status: {}/{} passing, active agents: {}",
                prd_status.passed,
                prd_status.total,
                self.active_agents.len()
            );

            // Check if all stories pass
            if prd_status.all_pass {
                log::info!(
                    "[ParallelOrchestrator] All {} stories pass! Completing.",
                    prd_status.total
                );
                self.cleanup_all_agents(&agent_manager_arc);
                self.state = RalphLoopState::Completed {
                    total_iterations: self.iteration_count,
                };
                self.metrics.total_iterations = self.iteration_count;
                self.metrics.stories_completed = prd_status.passed as u32;
                self.metrics.stories_remaining = 0;
                self.metrics.total_duration_secs = start_time.elapsed().as_secs_f64();
                return Ok(self.metrics.clone());
            }

            // Get runnable stories - clone to avoid borrow issues
            let runnable: Vec<RalphStory> = self
                .get_runnable_stories(&prd)
                .iter()
                .map(|s| (*s).clone())
                .collect();
            let runnable_count = runnable.len();

            log::debug!(
                "[ParallelOrchestrator] {} runnable stories, {} slots available",
                runnable_count,
                self.worktree_pool.available_slots()
            );

            // Spawn agents for independent stories (up to available slots)
            let available_slots = self.max_parallel.saturating_sub(self.active_agents.len());
            for story in runnable.iter().take(available_slots) {
                if let Err(e) = self.spawn_agent_for_story(story, &agent_manager_arc) {
                    log::error!(
                        "[ParallelOrchestrator] Failed to spawn agent for story {}: {}",
                        story.id,
                        e
                    );
                    // Continue with other stories
                }
            }

            // If no agents running and no runnable stories, we're stuck
            if self.active_agents.is_empty() && runnable_count == 0 {
                log::warn!(
                    "[ParallelOrchestrator] No agents running and no runnable stories. \
                     Possible circular dependency or all remaining stories blocked."
                );
                self.state = RalphLoopState::Failed {
                    iteration: self.iteration_count,
                    reason: "No runnable stories (possible circular dependency)".to_string(),
                };
                return Ok(self.metrics.clone());
            }

            // Wait for any agent to complete (poll-based)
            if !self.active_agents.is_empty() {
                match self.wait_for_any_completion(&agent_manager_arc).await {
                    Ok(Some(completed)) => {
                        // Handle completion
                        self.handle_agent_completion(completed, &agent_manager_arc)?;
                    }
                    Ok(None) => {
                        // Cancelled or no agents
                    }
                    Err(e) => {
                        log::error!("[ParallelOrchestrator] Error waiting for agent: {}", e);
                    }
                }
            }

            // Small delay before next iteration
            tokio::time::sleep(std::time::Duration::from_millis(100)).await;
        }
    }

    /// Spawn an agent for a story
    fn spawn_agent_for_story(
        &mut self,
        story: &RalphStory,
        agent_manager_arc: &Arc<Mutex<AgentManager>>,
    ) -> Result<(), String> {
        log::info!(
            "[ParallelOrchestrator] Spawning agent for story: {} ({})",
            story.id,
            story.title
        );

        // Acquire worktree
        let allocation = self.worktree_pool.acquire(&story.id)?;

        // Generate agent ID
        self.iteration_count += 1;
        let agent_id = format!(
            "{}-parallel-{}-{}",
            self.execution_id, story.id, self.iteration_count
        );

        // Build prompt for this story
        let prompt = self.build_story_prompt(story)?;

        // Build spawn config
        let spawn_config = AgentSpawnConfig {
            agent_type: self.config.agent_type,
            task_id: agent_id.clone(),
            worktree_path: allocation.path.to_string_lossy().to_string(),
            branch: allocation.branch_name.clone(),
            max_iterations: 0, // Let agent run until completion
            prompt: Some(prompt),
            model: self.config.model.clone(),
            spawn_mode: AgentSpawnMode::Pty,
            plugin_config: None,
            env_vars: self.config.env_vars.clone(),
            disable_tools: false,
        };

        // Spawn agent
        let spawn_result = {
            let mut manager = lock_mutex_recover(agent_manager_arc);
            manager.spawn_agent(&agent_id, spawn_config)
        };

        if let Err(e) = spawn_result {
            // Release worktree on spawn failure
            let _ = self.worktree_pool.release(&story.id);
            return Err(format!("Failed to spawn agent: {}", e));
        }

        // Take child process for later waiting
        let child = {
            let mut manager = lock_mutex_recover(agent_manager_arc);
            manager.take_child_process(&agent_id)
        };

        // Update worktree pool with agent ID
        self.worktree_pool.set_agent_id(&story.id, &agent_id);

        // Create handle
        let handle = AgentHandle {
            agent_id: agent_id.clone(),
            story: story.clone(),
            allocation: allocation.clone(),
            child,
            start_time: std::time::Instant::now(),
        };

        self.active_agents.insert(story.id.clone(), handle);

        // Update status
        self.agent_statuses.push(ParallelAgentStatus {
            agent_id,
            story_id: story.id.clone(),
            story_title: story.title.clone(),
            status: ParallelAgentState::Running,
            worktree_path: allocation.path.to_string_lossy().to_string(),
            branch_name: allocation.branch_name,
            start_time: chrono::Utc::now().to_rfc3339(),
            end_time: None,
            error: None,
        });

        log::info!(
            "[ParallelOrchestrator] Agent spawned for story {}. {} active agents.",
            story.id,
            self.active_agents.len()
        );

        Ok(())
    }

    /// Build a prompt for a specific story
    fn build_story_prompt(&self, story: &RalphStory) -> Result<String, String> {
        // For now, use a simple prompt format
        // TODO: Use the template system for customization
        Ok(format!(
            "# Story to Implement\n\n\
             **ID**: {}\n\
             **Title**: {}\n\n\
             ## Description\n{}\n\n\
             ## Acceptance Criteria\n{}\n\n\
             ## Instructions\n\
             - Implement this story completely\n\
             - Run tests to verify your implementation\n\
             - Mark the story as passing in the PRD when done\n\
             - When complete, output: <promise>COMPLETE</promise>\n",
            story.id,
            story.title,
            story.description.as_deref().unwrap_or("(no description)"),
            story.acceptance
        ))
    }

    /// Wait for any agent to complete
    async fn wait_for_any_completion(
        &mut self,
        agent_manager_arc: &Arc<Mutex<AgentManager>>,
    ) -> Result<Option<CompletedAgentResult>, String> {
        let poll_interval = std::time::Duration::from_millis(250);

        loop {
            // Check cancellation
            if *lock_mutex_recover(&self.cancelled) {
                return Ok(None);
            }

            // Check each active agent
            let mut completed_story_id = None;

            for (story_id, handle) in self.active_agents.iter_mut() {
                if let Some(ref mut child) = handle.child {
                    match child.try_wait() {
                        Ok(Some(status)) => {
                            // Agent completed
                            let exit_code = status.code().unwrap_or(-1);
                            log::info!(
                                "[ParallelOrchestrator] Agent {} for story {} completed (exit={})",
                                handle.agent_id,
                                story_id,
                                exit_code
                            );
                            completed_story_id = Some((story_id.clone(), exit_code));
                            break;
                        }
                        Ok(None) => {
                            // Still running
                        }
                        Err(e) => {
                            log::error!(
                                "[ParallelOrchestrator] Error checking agent {}: {}",
                                handle.agent_id,
                                e
                            );
                            completed_story_id = Some((story_id.clone(), -1));
                            break;
                        }
                    }
                }
            }

            if let Some((story_id, exit_code)) = completed_story_id {
                let handle = self.active_agents.remove(&story_id).unwrap();

                // Get agent output
                let output = {
                    let manager = lock_mutex_recover(agent_manager_arc);
                    manager.get_pty_history(&handle.agent_id)
                };

                // Emit exit event
                {
                    let manager = lock_mutex_recover(agent_manager_arc);
                    manager.emit_agent_exit(&handle.agent_id, exit_code);
                }

                return Ok(Some(CompletedAgentResult {
                    story_id,
                    agent_id: handle.agent_id,
                    allocation: handle.allocation,
                    exit_code,
                    output,
                    duration_secs: handle.start_time.elapsed().as_secs_f64(),
                }));
            }

            // No completions yet, wait a bit
            tokio::time::sleep(poll_interval).await;
        }
    }

    /// Handle agent completion
    fn handle_agent_completion(
        &mut self,
        result: CompletedAgentResult,
        agent_manager_arc: &Arc<Mutex<AgentManager>>,
    ) -> Result<(), String> {
        let output_str = String::from_utf8_lossy(&result.output);

        // Update agent status
        if let Some(status) = self
            .agent_statuses
            .iter_mut()
            .find(|s| s.agent_id == result.agent_id)
        {
            status.end_time = Some(chrono::Utc::now().to_rfc3339());
            if result.exit_code == 0 {
                status.status = ParallelAgentState::Merging;
            } else {
                status.status = ParallelAgentState::Failed;
                status.error = Some(format!("Exit code: {}", result.exit_code));
            }
        }

        // Check for completion promise
        let completion_detected = self.completion_detector.check(&output_str);

        if result.exit_code == 0 && completion_detected {
            log::info!(
                "[ParallelOrchestrator] Story {} completed successfully, merging...",
                result.story_id
            );

            // Attempt merge
            let completed_work = CompletedWork {
                story_id: result.story_id.clone(),
                branch_name: result.allocation.branch_name.clone(),
                worktree_path: result.allocation.path.clone(),
                agent_id: result.agent_id.clone(),
            };

            match self.merge_coordinator.merge(&completed_work) {
                Ok(MergeResult::Success { .. }) => {
                    log::info!(
                        "[ParallelOrchestrator] Successfully merged story {}",
                        result.story_id
                    );

                    // Sync PRD from worktree
                    let _ = self
                        .merge_coordinator
                        .sync_prd_from_worktree(&result.allocation.path, &self.config.prd_name);

                    // Update status to completed
                    if let Some(status) = self
                        .agent_statuses
                        .iter_mut()
                        .find(|s| s.agent_id == result.agent_id)
                    {
                        status.status = ParallelAgentState::Completed;
                    }
                }
                Ok(MergeResult::Conflict(conflict)) => {
                    log::warn!(
                        "[ParallelOrchestrator] Merge conflict for story {}: {:?}",
                        result.story_id,
                        conflict.conflicting_files
                    );
                    // Keep worktree for manual resolution
                    // Update status
                    if let Some(status) = self
                        .agent_statuses
                        .iter_mut()
                        .find(|s| s.agent_id == result.agent_id)
                    {
                        status.status = ParallelAgentState::Failed;
                        status.error = Some(format!(
                            "Merge conflict: {}",
                            conflict.conflicting_files.join(", ")
                        ));
                    }
                }
                Ok(MergeResult::Error(e)) => {
                    log::error!(
                        "[ParallelOrchestrator] Merge error for story {}: {}",
                        result.story_id,
                        e
                    );
                    if let Some(status) = self
                        .agent_statuses
                        .iter_mut()
                        .find(|s| s.agent_id == result.agent_id)
                    {
                        status.status = ParallelAgentState::Failed;
                        status.error = Some(format!("Merge error: {}", e));
                    }
                }
                Err(e) => {
                    log::error!(
                        "[ParallelOrchestrator] Merge failed for story {}: {}",
                        result.story_id,
                        e
                    );
                }
            }
        } else {
            log::warn!(
                "[ParallelOrchestrator] Story {} failed (exit={}, completion={})",
                result.story_id,
                result.exit_code,
                completion_detected
            );
        }

        // Release worktree (unless there's a conflict that needs manual resolution)
        if self
            .merge_coordinator
            .conflicts()
            .iter()
            .all(|c| c.story_id != result.story_id)
        {
            let _ = self.worktree_pool.release(&result.story_id);
        }

        // Unregister agent PTY
        {
            let manager = lock_mutex_recover(agent_manager_arc);
            manager.unregister_pty(&result.agent_id);
        }

        // Update metrics
        self.metrics.total_iterations = self.iteration_count;
        self.metrics.total_duration_secs += result.duration_secs;

        Ok(())
    }

    /// Cleanup all active agents
    fn cleanup_all_agents(&mut self, agent_manager_arc: &Arc<Mutex<AgentManager>>) {
        for (story_id, mut handle) in self.active_agents.drain() {
            // Kill child process if still running
            if let Some(ref mut child) = handle.child {
                let _ = child.kill();
                let _ = child.wait();
            }

            // Unregister PTY
            {
                let manager = lock_mutex_recover(agent_manager_arc);
                manager.unregister_pty(&handle.agent_id);
            }

            // Release worktree
            let _ = self.worktree_pool.release(&story_id);
        }
    }
}

/// Result of a completed agent
struct CompletedAgentResult {
    story_id: String,
    agent_id: String,
    allocation: WorktreeAllocation,
    exit_code: i32,
    output: Vec<u8>,
    duration_secs: f64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parallel_agent_state_serialization() {
        let state = ParallelAgentState::Running;
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, "\"running\"");
    }
}
