// Agent process spawning and lifecycle management
#![allow(dead_code)]

use crate::agents::rate_limiter::{RateLimitDetector, RateLimitInfo};
use crate::models::{AgentType, LogEntry, LogLevel};
use anyhow::{Result, anyhow};
use chrono::Utc;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

/// Agent lifecycle manager
pub struct AgentManager {
    /// Map of agent ID to running process
    processes: Arc<Mutex<HashMap<String, Child>>>,
    /// Event sender for agent logs
    log_tx: Option<mpsc::UnboundedSender<AgentLogEvent>>,
    /// Rate limit detector for parsing stderr output
    rate_limit_detector: RateLimitDetector,
    /// Event sender for rate limit events
    rate_limit_tx: Option<mpsc::UnboundedSender<RateLimitEvent>>,
}

/// Event emitted when a rate limit is detected
#[derive(Debug, Clone)]
pub struct RateLimitEvent {
    pub agent_id: String,
    pub rate_limit_info: RateLimitInfo,
}

/// Event emitted when an agent produces a log
#[derive(Debug, Clone)]
pub struct AgentLogEvent {
    pub agent_id: String,
    pub log: LogEntry,
}

/// Configuration for spawning an agent
#[derive(Debug, Clone)]
pub struct AgentSpawnConfig {
    pub agent_type: AgentType,
    pub task_id: String,
    pub worktree_path: String,
    pub branch: String,
    pub max_iterations: i32,
    pub prompt: Option<String>,
}

impl AgentManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            log_tx: None,
            rate_limit_detector: RateLimitDetector::new(),
            rate_limit_tx: None,
        }
    }

    /// Set the log event sender for real-time log streaming
    pub fn set_log_sender(&mut self, tx: mpsc::UnboundedSender<AgentLogEvent>) {
        self.log_tx = Some(tx);
    }

    /// Set the rate limit event sender for rate limit notifications
    pub fn set_rate_limit_sender(&mut self, tx: mpsc::UnboundedSender<RateLimitEvent>) {
        self.rate_limit_tx = Some(tx);
    }

    /// Spawn a new agent process
    pub fn spawn_agent(
        &mut self,
        agent_id: &str,
        config: AgentSpawnConfig,
    ) -> Result<u32> {
        let mut command = self.build_command(&config)?;

        let child = command
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn agent process: {}", e))?;

        let pid = child.id();

        // Store the process
        {
            let mut processes = self.processes.lock().unwrap();
            processes.insert(agent_id.to_string(), child);
        }

        // Emit log
        self.emit_log(agent_id, LogLevel::Info, format!(
            "Agent spawned with PID {} for task {}",
            pid, config.task_id
        ));

        Ok(pid)
    }

    /// Build the command to execute based on agent type
    fn build_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        match config.agent_type {
            AgentType::Claude => {
                // Build Claude Code CLI command
                // Example: claude-code --task "Fix bug" --max-iterations 10
                let mut cmd = Command::new("claude-code");

                if let Some(prompt) = &config.prompt {
                    cmd.arg("--task").arg(prompt);
                }

                cmd.arg("--max-iterations")
                    .arg(config.max_iterations.to_string());

                cmd.arg("--worktree")
                    .arg(&config.worktree_path);

                cmd.arg("--branch")
                    .arg(&config.branch);

                Ok(cmd)
            }
            AgentType::Opencode => {
                // Build OpenCode command
                let mut cmd = Command::new("opencode");

                if let Some(prompt) = &config.prompt {
                    cmd.arg(prompt);
                }

                cmd.arg("--iterations")
                    .arg(config.max_iterations.to_string());

                Ok(cmd)
            }
            AgentType::Cursor => {
                // Build Cursor agent command
                let mut cmd = Command::new("cursor-agent");

                if let Some(prompt) = &config.prompt {
                    cmd.arg("--prompt").arg(prompt);
                }

                Ok(cmd)
            }
        }
    }

    /// Stop an agent by killing its process
    pub fn stop_agent(&mut self, agent_id: &str) -> Result<()> {
        let mut processes = self.processes.lock().unwrap();

        if let Some(mut child) = processes.remove(agent_id) {
            child.kill()
                .map_err(|e| anyhow!("Failed to kill agent process: {}", e))?;

            self.emit_log(agent_id, LogLevel::Info, "Agent stopped".to_string());
            Ok(())
        } else {
            Err(anyhow!("Agent process not found: {}", agent_id))
        }
    }

    /// Check if an agent process is still running
    pub fn is_agent_running(&self, agent_id: &str) -> bool {
        let processes = self.processes.lock().unwrap();
        processes.contains_key(agent_id)
    }

    /// Get the number of running agents
    pub fn running_count(&self) -> usize {
        let processes = self.processes.lock().unwrap();
        processes.len()
    }

    /// Stop all running agents
    pub fn stop_all(&mut self) -> Result<()> {
        let mut processes = self.processes.lock().unwrap();
        let agent_ids: Vec<String> = processes.keys().cloned().collect();

        for agent_id in agent_ids {
            if let Some(mut child) = processes.remove(&agent_id) {
                let _ = child.kill(); // Best effort
                self.emit_log(&agent_id, LogLevel::Info, "Agent stopped (shutdown)".to_string());
            }
        }

        Ok(())
    }

    /// Wait for an agent process to complete
    pub fn wait_for_agent(&mut self, agent_id: &str) -> Result<i32> {
        let mut processes = self.processes.lock().unwrap();

        if let Some(mut child) = processes.remove(agent_id) {
            let status = child.wait()
                .map_err(|e| anyhow!("Failed to wait for agent: {}", e))?;

            let exit_code = status.code().unwrap_or(-1);

            self.emit_log(
                agent_id,
                if exit_code == 0 { LogLevel::Info } else { LogLevel::Error },
                format!("Agent exited with code {}", exit_code)
            );

            Ok(exit_code)
        } else {
            Err(anyhow!("Agent process not found: {}", agent_id))
        }
    }

    /// Emit a log event
    fn emit_log(&self, agent_id: &str, level: LogLevel, message: String) {
        if let Some(tx) = &self.log_tx {
            let event = AgentLogEvent {
                agent_id: agent_id.to_string(),
                log: LogEntry {
                    timestamp: Utc::now(),
                    level,
                    message,
                },
            };
            let _ = tx.send(event); // Best effort
        }
    }

    /// Parse stderr output and check for rate limits
    /// Returns Some(RateLimitInfo) if a rate limit is detected
    pub fn check_stderr_for_rate_limit(&self, stderr: &str) -> Option<RateLimitInfo> {
        self.rate_limit_detector.detect_in_stderr(stderr)
    }

    /// Emit a rate limit event
    fn emit_rate_limit(&self, agent_id: &str, info: RateLimitInfo) {
        if let Some(tx) = &self.rate_limit_tx {
            let event = RateLimitEvent {
                agent_id: agent_id.to_string(),
                rate_limit_info: info.clone(),
            };
            let _ = tx.send(event); // Best effort
        }

        // Also emit as a warning log
        let retry_msg = info.retry_after_ms
            .map(|ms| format!(", retry after {}ms", ms))
            .unwrap_or_default();

        self.emit_log(
            agent_id,
            LogLevel::Warn,
            format!(
                "Rate limit detected: {:?}{}",
                info.limit_type.unwrap_or(crate::agents::rate_limiter::RateLimitType::RateLimit),
                retry_msg
            ),
        );
    }

    /// Wait for an agent process to complete while monitoring stderr for rate limits
    /// Returns the exit code and any rate limit info detected
    pub fn wait_for_agent_with_rate_limit_check(
        &mut self,
        agent_id: &str,
    ) -> Result<(i32, Option<RateLimitInfo>)> {
        let mut processes = self.processes.lock().unwrap();

        if let Some(mut child) = processes.remove(agent_id) {
            // Capture stderr and check for rate limits
            let mut rate_limit_info = None;

            if let Some(stderr) = child.stderr.take() {
                let reader = BufReader::new(stderr);
                let mut stderr_buffer = String::new();

                for line in reader.lines() {
                    if let Ok(line) = line {
                        stderr_buffer.push_str(&line);
                        stderr_buffer.push('\n');

                        // Check each line for rate limit indicators
                        if let Some(info) = self.rate_limit_detector.detect_in_stderr(&line) {
                            rate_limit_info = Some(info.clone());
                            self.emit_rate_limit(agent_id, info);
                        }
                    }
                }
            }

            let status = child.wait()
                .map_err(|e| anyhow!("Failed to wait for agent: {}", e))?;

            let exit_code = status.code().unwrap_or(-1);

            self.emit_log(
                agent_id,
                if exit_code == 0 { LogLevel::Info } else { LogLevel::Error },
                format!("Agent exited with code {}", exit_code)
            );

            Ok((exit_code, rate_limit_info))
        } else {
            Err(anyhow!("Agent process not found: {}", agent_id))
        }
    }

    /// Process a chunk of stderr output for an agent
    /// Useful for streaming stderr monitoring
    pub fn process_stderr_chunk(&self, agent_id: &str, stderr_chunk: &str) -> Option<RateLimitInfo> {
        if let Some(info) = self.rate_limit_detector.detect_in_stderr(stderr_chunk) {
            self.emit_rate_limit(agent_id, info.clone());
            Some(info)
        } else {
            None
        }
    }
}

impl Default for AgentManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_agent_manager_creation() {
        let manager = AgentManager::new();
        assert_eq!(manager.running_count(), 0);
    }

    #[test]
    fn test_build_claude_command() {
        let manager = AgentManager::new();
        let config = AgentSpawnConfig {
            agent_type: AgentType::Claude,
            task_id: "task1".to_string(),
            worktree_path: "/tmp/worktree".to_string(),
            branch: "feature/test".to_string(),
            max_iterations: 10,
            prompt: Some("Fix bug".to_string()),
        };

        let cmd = manager.build_command(&config).unwrap();
        let program = cmd.get_program().to_string_lossy();
        assert_eq!(program, "claude-code");
    }

    #[test]
    fn test_build_opencode_command() {
        let manager = AgentManager::new();
        let config = AgentSpawnConfig {
            agent_type: AgentType::Opencode,
            task_id: "task1".to_string(),
            worktree_path: "/tmp/worktree".to_string(),
            branch: "feature/test".to_string(),
            max_iterations: 5,
            prompt: Some("Implement feature".to_string()),
        };

        let cmd = manager.build_command(&config).unwrap();
        let program = cmd.get_program().to_string_lossy();
        assert_eq!(program, "opencode");
    }

    #[test]
    fn test_build_cursor_command() {
        let manager = AgentManager::new();
        let config = AgentSpawnConfig {
            agent_type: AgentType::Cursor,
            task_id: "task1".to_string(),
            worktree_path: "/tmp/worktree".to_string(),
            branch: "feature/test".to_string(),
            max_iterations: 3,
            prompt: Some("Refactor code".to_string()),
        };

        let cmd = manager.build_command(&config).unwrap();
        let program = cmd.get_program().to_string_lossy();
        assert_eq!(program, "cursor-agent");
    }

    #[test]
    fn test_log_event_sender() {
        let mut manager = AgentManager::new();
        let (tx, _rx) = mpsc::unbounded_channel();

        manager.set_log_sender(tx);
        assert!(manager.log_tx.is_some());
    }

    #[test]
    fn test_is_agent_running() {
        let manager = AgentManager::new();
        assert!(!manager.is_agent_running("agent1"));
    }

    #[test]
    fn test_running_count() {
        let manager = AgentManager::new();
        assert_eq!(manager.running_count(), 0);
    }

    #[test]
    fn test_rate_limit_sender() {
        let mut manager = AgentManager::new();
        let (tx, _rx) = mpsc::unbounded_channel();

        manager.set_rate_limit_sender(tx);
        assert!(manager.rate_limit_tx.is_some());
    }

    #[test]
    fn test_check_stderr_for_rate_limit_detects_429() {
        let manager = AgentManager::new();

        let result = manager.check_stderr_for_rate_limit("Error: 429 Too Many Requests");
        assert!(result.is_some());
        let info = result.unwrap();
        assert!(info.is_rate_limited);
    }

    #[test]
    fn test_check_stderr_for_rate_limit_no_match() {
        let manager = AgentManager::new();

        let result = manager.check_stderr_for_rate_limit("Normal error: file not found");
        assert!(result.is_none());
    }

    #[test]
    fn test_process_stderr_chunk() {
        let manager = AgentManager::new();

        // Should return rate limit info when detected
        let result = manager.process_stderr_chunk("agent-1", "rate limit exceeded");
        assert!(result.is_some());

        // Should return None when no rate limit
        let result = manager.process_stderr_chunk("agent-1", "task completed");
        assert!(result.is_none());
    }

    // Note: We can't easily test actual process spawning in unit tests
    // without having the actual CLI tools installed. These tests focus
    // on the command building and manager state management.
}
