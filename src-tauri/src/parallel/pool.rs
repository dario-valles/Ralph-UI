// Agent pool management with resource limits

#![allow(dead_code)] // Parallel pool infrastructure (Phase 4)

use crate::agents::{AgentManager, AgentSpawnConfig, RateLimitEvent};
use crate::utils::lock_mutex_recover;
use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;
use sysinfo::{System, Pid};
use tokio::sync::mpsc;

/// Resource limits for agent execution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceLimits {
    /// Maximum number of concurrent agents
    pub max_agents: usize,
    /// Maximum CPU usage percentage (0-100) per agent
    pub max_cpu_per_agent: f32,
    /// Maximum memory usage in MB per agent
    pub max_memory_mb_per_agent: u64,
    /// Maximum total CPU usage percentage (0-100)
    pub max_total_cpu: f32,
    /// Maximum total memory usage in MB
    pub max_total_memory_mb: u64,
    /// Maximum agent runtime in seconds (0 = unlimited)
    pub max_runtime_secs: u64,
}

impl Default for ResourceLimits {
    fn default() -> Self {
        Self {
            max_agents: 5,
            max_cpu_per_agent: 50.0,
            max_memory_mb_per_agent: 2048,
            max_total_cpu: 80.0,
            max_total_memory_mb: 8192,
            max_runtime_secs: 3600, // 1 hour
        }
    }
}

/// Information about a running agent in the pool
#[derive(Debug, Clone)]
struct PooledAgent {
    agent_id: String,
    started_at: Instant,
    process_id: u32,
    config: AgentSpawnConfig,
}

/// Agent pool for managing multiple concurrent agents
pub struct AgentPool {
    /// Resource limits
    limits: ResourceLimits,
    /// Currently running agents
    running: Arc<Mutex<HashMap<String, PooledAgent>>>,
    /// Agent manager
    manager: Arc<Mutex<AgentManager>>,
    /// System info for resource monitoring
    system: Arc<Mutex<System>>,
}

impl AgentPool {
    /// Create a new agent pool with default limits
    pub fn new() -> Self {
        Self::with_limits(ResourceLimits::default())
    }

    /// Create a new agent pool with custom limits
    pub fn with_limits(limits: ResourceLimits) -> Self {
        Self {
            limits,
            running: Arc::new(Mutex::new(HashMap::new())),
            manager: Arc::new(Mutex::new(AgentManager::new())),
            system: Arc::new(Mutex::new(System::new())),
        }
    }

    /// Get current resource limits
    pub fn get_limits(&self) -> ResourceLimits {
        self.limits.clone()
    }

    /// Update resource limits
    pub fn set_limits(&mut self, limits: ResourceLimits) {
        self.limits = limits;
    }

    /// Set the rate limit event sender for rate limit notifications
    /// Events will be forwarded to the frontend via Tauri events
    pub fn set_rate_limit_sender(&self, tx: mpsc::UnboundedSender<RateLimitEvent>) {
        let mut manager = lock_mutex_recover(&self.manager);
        manager.set_rate_limit_sender(tx);
    }

    /// Check if the pool can accept a new agent
    pub fn can_spawn(&self) -> Result<bool> {
        let running = lock_mutex_recover(&self.running);

        // Check max agents limit
        if running.len() >= self.limits.max_agents {
            return Ok(false);
        }

        // Check system resources
        let mut system = lock_mutex_recover(&self.system);
        system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        // Calculate total usage inline to avoid deadlock (running is already locked)
        let mut total_cpu = 0.0;
        let mut total_memory_mb: u64 = 0;
        for pooled in running.values() {
            if let Some(process) = system.process(Pid::from_u32(pooled.process_id)) {
                total_cpu += process.cpu_usage();
                total_memory_mb += process.memory() / 1024 / 1024;
            }
        }

        // Check CPU limit
        if total_cpu >= self.limits.max_total_cpu {
            return Ok(false);
        }

        // Check memory limit
        if total_memory_mb >= self.limits.max_total_memory_mb {
            return Ok(false);
        }

        Ok(true)
    }

    /// Spawn a new agent in the pool
    pub fn spawn(
        &self,
        agent_id: &str,
        config: AgentSpawnConfig,
    ) -> Result<u32> {
        log::info!("[AgentPool] spawn called for agent: {}", agent_id);

        // Check if we can spawn
        match self.can_spawn() {
            Ok(can) => {
                if !can {
                    log::warn!("[AgentPool] Cannot spawn - resource limits exceeded");
                    return Err(anyhow!("Resource limits exceeded, cannot spawn agent"));
                }
                log::info!("[AgentPool] Resource check passed, can spawn");
            }
            Err(e) => {
                log::error!("[AgentPool] Error checking resources: {}", e);
                return Err(e);
            }
        }

        // Spawn the agent
        log::info!("[AgentPool] Calling manager.spawn_agent...");
        let mut manager = lock_mutex_recover(&self.manager);
        let process_id = match manager.spawn_agent(agent_id, config.clone()) {
            Ok(pid) => {
                log::info!("[AgentPool] Agent spawned with PID: {}", pid);
                pid
            }
            Err(e) => {
                log::error!("[AgentPool] Failed to spawn agent: {}", e);
                return Err(e);
            }
        };

        // Add to running pool
        let pooled = PooledAgent {
            agent_id: agent_id.to_string(),
            started_at: Instant::now(),
            process_id,
            config,
        };

        {
            let mut running = lock_mutex_recover(&self.running);
            running.insert(agent_id.to_string(), pooled);
        }

        Ok(process_id)
    }

    /// Stop an agent
    pub fn stop(&self, agent_id: &str) -> Result<()> {
        let mut manager = lock_mutex_recover(&self.manager);
        manager.stop_agent(agent_id)?;

        let mut running = lock_mutex_recover(&self.running);
        running.remove(agent_id);

        Ok(())
    }

    /// Stop all running agents
    pub fn stop_all(&self) -> Result<()> {
        let mut manager = lock_mutex_recover(&self.manager);
        manager.stop_all()?;

        let mut running = lock_mutex_recover(&self.running);
        running.clear();

        Ok(())
    }

    /// Get number of running agents
    pub fn running_count(&self) -> usize {
        let running = lock_mutex_recover(&self.running);
        running.len()
    }

    /// Check if an agent is running
    pub fn is_running(&self, agent_id: &str) -> bool {
        let running = lock_mutex_recover(&self.running);
        running.contains_key(agent_id)
    }

    /// Get runtime for an agent in seconds
    pub fn get_runtime(&self, agent_id: &str) -> Option<u64> {
        let running = lock_mutex_recover(&self.running);
        running.get(agent_id).map(|a| a.started_at.elapsed().as_secs())
    }

    /// Check for agents exceeding resource limits and runtime
    pub fn check_violations(&self) -> Result<Vec<String>> {
        let mut violations = Vec::new();
        let running = lock_mutex_recover(&self.running);

        let mut system = lock_mutex_recover(&self.system);
        system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        for (agent_id, pooled) in running.iter() {
            // Check runtime limit
            if self.limits.max_runtime_secs > 0 {
                let runtime = pooled.started_at.elapsed().as_secs();
                if runtime > self.limits.max_runtime_secs {
                    violations.push(agent_id.clone());
                    continue;
                }
            }

            // Check process resource usage
            if let Some(process) = system.process(Pid::from_u32(pooled.process_id)) {
                let cpu = process.cpu_usage();
                let memory_mb = process.memory() / 1024 / 1024;

                if cpu > self.limits.max_cpu_per_agent {
                    violations.push(agent_id.clone());
                } else if memory_mb > self.limits.max_memory_mb_per_agent {
                    violations.push(agent_id.clone());
                }
            }
        }

        Ok(violations)
    }

    /// Get total CPU and memory usage from all agents
    fn get_total_usage(&self, system: &System) -> Result<(f32, u64)> {
        let running = lock_mutex_recover(&self.running);
        let mut total_cpu = 0.0;
        let mut total_memory_mb = 0;

        for pooled in running.values() {
            if let Some(process) = system.process(Pid::from_u32(pooled.process_id)) {
                total_cpu += process.cpu_usage();
                total_memory_mb += process.memory() / 1024 / 1024;
            }
        }

        Ok((total_cpu, total_memory_mb))
    }

    /// Get current resource usage statistics
    pub fn get_stats(&self) -> Result<PoolStats> {
        let running = lock_mutex_recover(&self.running);
        let mut system = lock_mutex_recover(&self.system);
        system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

        // Calculate total usage inline to avoid deadlock (running is already locked)
        let mut total_cpu = 0.0;
        let mut total_memory_mb: u64 = 0;
        for pooled in running.values() {
            if let Some(process) = system.process(Pid::from_u32(pooled.process_id)) {
                total_cpu += process.cpu_usage();
                total_memory_mb += process.memory() / 1024 / 1024;
            }
        }

        Ok(PoolStats {
            running_agents: running.len(),
            max_agents: self.limits.max_agents,
            total_cpu_usage: total_cpu,
            max_total_cpu: self.limits.max_total_cpu,
            total_memory_mb,
            max_total_memory_mb: self.limits.max_total_memory_mb,
        })
    }

    /// Poll for completed agents and clean up
    /// Returns a list of (agent_id, task_id, exit_code) for agents that have finished
    pub fn poll_completed(&self) -> Result<Vec<CompletedAgent>> {
        let mut completed = Vec::new();
        let mut to_remove = Vec::new();

        // First, identify processes that are no longer running
        {
            let running = lock_mutex_recover(&self.running);
            let mut system = lock_mutex_recover(&self.system);
            system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

            for (agent_id, pooled) in running.iter() {
                let process = system.process(Pid::from_u32(pooled.process_id));

                // If process doesn't exist in system, it has completed (or is zombie)
                let is_alive = process.map(|p| {
                    // Check if the process is actually running vs zombie
                    // A zombie shows up in process list but has status "Zombie"
                    !matches!(p.status(), sysinfo::ProcessStatus::Zombie)
                        && p.status() != sysinfo::ProcessStatus::Dead
                }).unwrap_or(false);

                if !is_alive {
                    log::info!("[AgentPool] Process {} for agent {} is no longer running",
                        pooled.process_id, agent_id);
                    to_remove.push((agent_id.clone(), pooled.config.task_id.clone(), pooled.process_id));
                }
            }
        }

        // Now remove them and try to get exit status
        {
            let mut running = lock_mutex_recover(&self.running);
            let mut manager = lock_mutex_recover(&self.manager);

            for (agent_id, task_id, process_id) in to_remove {
                running.remove(&agent_id);

                // Try to wait for the process to get exit code (reap zombie)
                let exit_code = manager.wait_for_agent(&agent_id)
                    .unwrap_or_else(|_| {
                        // If wait fails, process is already gone, assume success
                        log::warn!("[AgentPool] Could not get exit code for agent {}, assuming 0", agent_id);
                        0
                    });

                log::info!("[AgentPool] Agent {} (task {}) completed with exit code {}",
                    agent_id, task_id, exit_code);

                // Get and clear the logs for this agent
                let logs = manager.get_agent_logs(&agent_id);
                manager.clear_agent_logs(&agent_id);

                log::info!("[AgentPool] Agent {} has {} log entries", agent_id, logs.len());

                completed.push(CompletedAgent {
                    agent_id,
                    task_id,
                    process_id,
                    exit_code,
                    logs,
                });
            }
        }

        Ok(completed)
    }
}

/// Information about a completed agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletedAgent {
    pub agent_id: String,
    pub task_id: String,
    pub process_id: u32,
    pub exit_code: i32,
    /// Logs collected during agent execution
    pub logs: Vec<crate::models::LogEntry>,
}

impl AgentPool {
    /// Get in-memory logs for an agent
    pub fn get_agent_logs(&self, agent_id: &str) -> Vec<crate::models::LogEntry> {
        let manager = lock_mutex_recover(&self.manager);
        manager.get_agent_logs(agent_id)
    }

    /// Clear in-memory logs for an agent
    pub fn clear_agent_logs(&self, agent_id: &str) {
        let manager = lock_mutex_recover(&self.manager);
        manager.clear_agent_logs(agent_id);
    }
}

impl Default for AgentPool {
    fn default() -> Self {
        Self::new()
    }
}

/// Pool statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PoolStats {
    pub running_agents: usize,
    pub max_agents: usize,
    pub total_cpu_usage: f32,
    pub max_total_cpu: f32,
    pub total_memory_mb: u64,
    pub max_total_memory_mb: u64,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::AgentType;

    #[test]
    fn test_agent_pool_creation() {
        let pool = AgentPool::new();
        assert_eq!(pool.running_count(), 0);
    }

    #[test]
    fn test_pool_with_custom_limits() {
        let limits = ResourceLimits {
            max_agents: 3,
            max_cpu_per_agent: 40.0,
            max_memory_mb_per_agent: 1024,
            max_total_cpu: 60.0,
            max_total_memory_mb: 4096,
            max_runtime_secs: 1800,
        };

        let pool = AgentPool::with_limits(limits.clone());
        let pool_limits = pool.get_limits();

        assert_eq!(pool_limits.max_agents, 3);
        assert_eq!(pool_limits.max_cpu_per_agent, 40.0);
    }

    #[test]
    fn test_default_resource_limits() {
        let limits = ResourceLimits::default();
        assert_eq!(limits.max_agents, 5);
        assert_eq!(limits.max_cpu_per_agent, 50.0);
        assert_eq!(limits.max_memory_mb_per_agent, 2048);
    }

    #[test]
    fn test_can_spawn_empty_pool() {
        let pool = AgentPool::new();
        let can_spawn = pool.can_spawn().unwrap();
        assert!(can_spawn);
    }

    #[test]
    fn test_running_count() {
        let pool = AgentPool::new();
        assert_eq!(pool.running_count(), 0);
    }

    #[test]
    fn test_is_running() {
        let pool = AgentPool::new();
        assert!(!pool.is_running("agent1"));
    }

    #[test]
    fn test_get_runtime_nonexistent() {
        let pool = AgentPool::new();
        assert!(pool.get_runtime("agent1").is_none());
    }

    #[test]
    fn test_pool_stats() {
        let pool = AgentPool::new();
        let stats = pool.get_stats().unwrap();
        assert_eq!(stats.running_agents, 0);
        assert_eq!(stats.max_agents, 5);
    }

    #[test]
    fn test_set_limits() {
        let mut pool = AgentPool::new();
        let new_limits = ResourceLimits {
            max_agents: 10,
            ..Default::default()
        };

        pool.set_limits(new_limits);
        let limits = pool.get_limits();
        assert_eq!(limits.max_agents, 10);
    }

    #[test]
    fn test_check_violations_empty() {
        let pool = AgentPool::new();
        let violations = pool.check_violations().unwrap();
        assert_eq!(violations.len(), 0);
    }
}
