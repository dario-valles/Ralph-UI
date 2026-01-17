// Agent process spawning and lifecycle management

use crate::models::{Agent, AgentStatus, AgentType, LogEntry, LogLevel};
use anyhow::{Result, anyhow};
use chrono::Utc;
use std::collections::HashMap;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

/// Agent lifecycle manager
pub struct AgentManager {
    /// Map of agent ID to running process
    processes: Arc<Mutex<HashMap<String, Child>>>,
    /// Event sender for agent logs
    log_tx: Option<mpsc::UnboundedSender<AgentLogEvent>>,
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
        }
    }

    /// Set the log event sender for real-time log streaming
    pub fn set_log_sender(&mut self, tx: mpsc::UnboundedSender<AgentLogEvent>) {
        self.log_tx = Some(tx);
    }

    /// Spawn a new agent process
    pub fn spawn_agent(
        &mut self,
        agent_id: &str,
        config: AgentSpawnConfig,
    ) -> Result<u32> {
        let mut command = self.build_command(&config)?;

        let mut child = command
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

    // Note: We can't easily test actual process spawning in unit tests
    // without having the actual CLI tools installed. These tests focus
    // on the command building and manager state management.
}
