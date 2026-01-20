// Agent process spawning and lifecycle management
#![allow(dead_code)]

use crate::agents::path_resolver::CliPathResolver;
use crate::agents::rate_limiter::{RateLimitDetector, RateLimitInfo};
use crate::models::{AgentType, LogEntry, LogLevel};
use crate::utils::lock_mutex_recover;
use anyhow::{Result, anyhow};
use chrono::Utc;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
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
    /// In-memory log storage for each agent (for retrieval via command)
    agent_logs: Arc<Mutex<HashMap<String, Vec<LogEntry>>>>,
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
    /// Model to use for the agent (e.g., "anthropic/claude-sonnet-4-5", "claude-sonnet-4-5")
    pub model: Option<String>,
}

impl AgentManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            log_tx: None,
            rate_limit_detector: RateLimitDetector::new(),
            rate_limit_tx: None,
            agent_logs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Get logs for an agent from in-memory storage
    pub fn get_agent_logs(&self, agent_id: &str) -> Vec<LogEntry> {
        let logs = lock_mutex_recover(&self.agent_logs);
        logs.get(agent_id).cloned().unwrap_or_default()
    }

    /// Clear logs for an agent
    pub fn clear_agent_logs(&self, agent_id: &str) {
        let mut logs = lock_mutex_recover(&self.agent_logs);
        logs.remove(agent_id);
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
        log::info!("[AgentManager] spawn_agent called for agent_id: {}, task_id: {}", agent_id, config.task_id);
        log::info!("[AgentManager] Config: {:?}", config);

        let mut command = self.build_command(&config)?;

        // Log the command being executed
        let program = command.get_program().to_string_lossy().to_string();
        let args: Vec<String> = command.get_args().map(|s| s.to_string_lossy().to_string()).collect();
        log::info!("[AgentManager] Executing command: {} {:?}", program, args);

        let mut child = match command
            .stdin(Stdio::null())  // Prevent stdin issues causing early exit
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn() {
                Ok(c) => {
                    log::info!("[AgentManager] Process spawned successfully");
                    c
                }
                Err(e) => {
                    log::error!("[AgentManager] Failed to spawn process: {}", e);
                    return Err(anyhow!("Failed to spawn agent process '{}': {}", program, e));
                }
            };

        let pid = child.id();
        log::info!("[AgentManager] Process PID: {}", pid);

        // Take ownership of stdout and stderr for background reading
        let stdout = child.stdout.take();
        let stderr = child.stderr.take();

        // Store the process
        {
            let mut processes = lock_mutex_recover(&self.processes);
            processes.insert(agent_id.to_string(), child);
            log::info!("[AgentManager] Process stored. Total running: {}", processes.len());
        }

        // Emit log
        self.emit_log(agent_id, LogLevel::Info, format!(
            "Agent spawned with PID {} for task {} in {}",
            pid, config.task_id, config.worktree_path
        ));

        // Give the process a moment to start (helps detect immediate failures)
        std::thread::sleep(std::time::Duration::from_millis(100));

        // Quick check - see if process already exited (helps diagnose immediate failures)
        let process_exited_immediately = {
            let mut processes = lock_mutex_recover(&self.processes);
            if let Some(child) = processes.get_mut(agent_id) {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        let exit_code = status.code().unwrap_or(-1);
                        log::error!("[AgentManager] Process {} exited immediately with code {}", pid, exit_code);
                        Some(exit_code)
                    }
                    Ok(None) => {
                        log::info!("[AgentManager] Process {} is running", pid);
                        None
                    }
                    Err(e) => {
                        log::error!("[AgentManager] Failed to check process status: {}", e);
                        None
                    }
                }
            } else {
                None
            }
        };

        // If process exited immediately, try to read stderr for error details
        if let Some(exit_code) = process_exited_immediately {
            let stderr_content = if let Some(mut stderr_handle) = stderr {
                let mut buf = String::new();
                use std::io::Read;
                if stderr_handle.read_to_string(&mut buf).is_ok() {
                    buf
                } else {
                    String::new()
                }
            } else {
                String::new()
            };

            if !stderr_content.is_empty() {
                log::error!("[AgentManager] Process stderr: {}", stderr_content);
                self.emit_log(agent_id, LogLevel::Error, format!(
                    "Process exited with code {}. Error: {}",
                    exit_code, stderr_content.trim()
                ));
            } else {
                self.emit_log(agent_id, LogLevel::Error, format!(
                    "Process exited immediately with code {}. This usually means the CLI command failed. Check if claude CLI works: claude --version",
                    exit_code
                ));
            }
            // Process already exited, no point in spawning background readers
            return Ok(pid);
        }

        // Spawn background thread to read stdout
        if let Some(stdout) = stdout {
            let log_tx = self.log_tx.clone();
            let agent_logs = self.agent_logs.clone();
            let agent_id_clone = agent_id.to_string();
            thread::spawn(move || {
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    match line {
                        Ok(line) => {
                            log::info!("[Agent {}] {}", agent_id_clone, line);

                            let log_entry = LogEntry {
                                timestamp: Utc::now(),
                                level: LogLevel::Info,
                                message: line,
                            };

                            // Store in memory
                            {
                                let mut logs = lock_mutex_recover(&agent_logs);
                                logs.entry(agent_id_clone.clone())
                                    .or_insert_with(Vec::new)
                                    .push(log_entry.clone());
                            }

                            // Also send via channel if available
                            if let Some(tx) = &log_tx {
                                let event = AgentLogEvent {
                                    agent_id: agent_id_clone.clone(),
                                    log: log_entry,
                                };
                                let _ = tx.send(event);
                            }
                        }
                        Err(e) => {
                            log::debug!("[Agent {}] stdout read error: {}", agent_id_clone, e);
                            break;
                        }
                    }
                }
                log::debug!("[Agent {}] stdout reader finished", agent_id_clone);
            });
        }

        // Spawn background thread to read stderr
        if let Some(stderr) = stderr {
            let log_tx = self.log_tx.clone();
            let rate_limit_tx = self.rate_limit_tx.clone();
            let agent_logs = self.agent_logs.clone();
            // Create a new detector for the thread (uses static patterns internally)
            let rate_limit_detector = RateLimitDetector::new();
            let agent_id_clone = agent_id.to_string();
            thread::spawn(move || {
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    match line {
                        Ok(line) => {
                            // Log stderr as warnings (they're often important)
                            log::warn!("[Agent {}] stderr: {}", agent_id_clone, line);

                            // Check for rate limits
                            if let Some(info) = rate_limit_detector.detect_in_stderr(&line) {
                                log::warn!("[Agent {}] Rate limit detected: {:?}", agent_id_clone, info);
                                if let Some(tx) = &rate_limit_tx {
                                    let event = RateLimitEvent {
                                        agent_id: agent_id_clone.clone(),
                                        rate_limit_info: info,
                                    };
                                    let _ = tx.send(event);
                                }
                            }

                            let log_entry = LogEntry {
                                timestamp: Utc::now(),
                                level: LogLevel::Warn,
                                message: line,
                            };

                            // Store in memory
                            {
                                let mut logs = lock_mutex_recover(&agent_logs);
                                logs.entry(agent_id_clone.clone())
                                    .or_insert_with(Vec::new)
                                    .push(log_entry.clone());
                            }

                            // Also send via channel if available
                            if let Some(tx) = &log_tx {
                                let event = AgentLogEvent {
                                    agent_id: agent_id_clone.clone(),
                                    log: log_entry,
                                };
                                let _ = tx.send(event);
                            }
                        }
                        Err(e) => {
                            log::debug!("[Agent {}] stderr read error: {}", agent_id_clone, e);
                            break;
                        }
                    }
                }
                log::debug!("[Agent {}] stderr reader finished", agent_id_clone);
            });
        }

        Ok(pid)
    }

    /// Build the command to execute based on agent type
    fn build_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        match config.agent_type {
            AgentType::Claude => {
                // Resolve Claude CLI path using path resolver
                let claude_path = CliPathResolver::resolve_claude()
                    .ok_or_else(|| anyhow!("Claude CLI not found. Install: npm install -g @anthropic-ai/claude-code"))?;

                log::info!("[AgentManager] Claude path: {:?}", claude_path);

                let mut cmd = Command::new(&claude_path);

                // Set working directory - check if it exists first
                let worktree = Path::new(&config.worktree_path);
                if worktree.exists() {
                    log::info!("[AgentManager] Using worktree path: {}", config.worktree_path);
                    cmd.current_dir(&config.worktree_path);
                } else {
                    log::warn!("[AgentManager] Worktree path doesn't exist: {}, using current directory", config.worktree_path);
                }

                // Add the prompt as positional argument - requires non-empty prompt
                match &config.prompt {
                    Some(prompt) if !prompt.trim().is_empty() => {
                        cmd.arg("-p").arg(prompt);
                    }
                    _ => {
                        return Err(anyhow!(
                            "Claude requires a non-empty prompt. Task description is empty for task {}",
                            config.task_id
                        ));
                    }
                }

                // Add max turns (iterations)
                cmd.arg("--max-turns")
                    .arg(config.max_iterations.to_string());

                // Add --yes to auto-accept prompts
                cmd.arg("--yes");

                // Add --dangerously-skip-permissions to skip permission prompts
                cmd.arg("--dangerously-skip-permissions");

                // Add model if specified
                if let Some(model) = &config.model {
                    cmd.arg("--model").arg(model);
                }

                Ok(cmd)
            }
            AgentType::Opencode => {
                // Resolve OpenCode path using path resolver
                let opencode_path = CliPathResolver::resolve_opencode()
                    .ok_or_else(|| anyhow!("OpenCode not found. Install from https://opencode.ai"))?;

                log::info!("[AgentManager] OpenCode path: {:?}", opencode_path);

                let mut cmd = Command::new(&opencode_path);

                // Set working directory - check if it exists first
                let worktree = Path::new(&config.worktree_path);
                if worktree.exists() {
                    log::info!("[AgentManager] Using worktree path: {}", config.worktree_path);
                    cmd.current_dir(&config.worktree_path);
                } else {
                    log::warn!("[AgentManager] Worktree path doesn't exist: {}, using current directory", config.worktree_path);
                }

                // Use the 'run' subcommand for non-interactive execution
                cmd.arg("run");

                // Add the prompt as the message - opencode requires a non-empty message
                match &config.prompt {
                    Some(prompt) if !prompt.trim().is_empty() => {
                        cmd.arg(prompt);
                    }
                    _ => {
                        return Err(anyhow!(
                            "OpenCode requires a non-empty prompt. Task description is empty for task {}",
                            config.task_id
                        ));
                    }
                }

                // Use JSON format for easier parsing
                cmd.arg("--format").arg("json");

                // Print logs to stderr for debugging
                cmd.arg("--print-logs");

                // Add model if specified
                if let Some(model) = &config.model {
                    cmd.arg("--model").arg(model);
                }

                Ok(cmd)
            }
            AgentType::Cursor => {
                // Resolve Cursor agent path
                let cursor_path = CliPathResolver::resolve_cursor()
                    .ok_or_else(|| anyhow!("Cursor agent not found. Ensure Cursor is installed."))?;

                log::info!("[AgentManager] Cursor path: {:?}", cursor_path);

                let mut cmd = Command::new(&cursor_path);

                // Set working directory
                let worktree = Path::new(&config.worktree_path);
                if worktree.exists() {
                    cmd.current_dir(&config.worktree_path);
                }

                // Add the prompt - requires non-empty prompt
                match &config.prompt {
                    Some(prompt) if !prompt.trim().is_empty() => {
                        cmd.arg("--prompt").arg(prompt);
                    }
                    _ => {
                        return Err(anyhow!(
                            "Cursor requires a non-empty prompt. Task description is empty for task {}",
                            config.task_id
                        ));
                    }
                }

                // Add --force to skip confirmation prompts
                cmd.arg("--force");

                // Add model if specified (Cursor may support model selection)
                if let Some(model) = &config.model {
                    cmd.arg("--model").arg(model);
                }

                Ok(cmd)
            }
            AgentType::Codex => {
                // Resolve Codex CLI path
                let codex_path = CliPathResolver::resolve_codex()
                    .ok_or_else(|| anyhow!("Codex CLI not found. Install from OpenAI."))?;

                log::info!("[AgentManager] Codex path: {:?}", codex_path);

                let mut cmd = Command::new(&codex_path);

                // Set working directory
                let worktree = Path::new(&config.worktree_path);
                if worktree.exists() {
                    cmd.current_dir(&config.worktree_path);
                }

                // Add the prompt - requires non-empty prompt
                match &config.prompt {
                    Some(prompt) if !prompt.trim().is_empty() => {
                        cmd.arg("--prompt").arg(prompt);
                    }
                    _ => {
                        return Err(anyhow!(
                            "Codex requires a non-empty prompt. Task description is empty for task {}",
                            config.task_id
                        ));
                    }
                }

                cmd.arg("--max-turns")
                    .arg(config.max_iterations.to_string());

                // Add model if specified
                if let Some(model) = &config.model {
                    cmd.arg("--model").arg(model);
                }

                Ok(cmd)
            }
            AgentType::Qwen => {
                // Resolve Qwen CLI path
                let qwen_path = CliPathResolver::resolve_qwen()
                    .ok_or_else(|| anyhow!("Qwen CLI not found."))?;

                log::info!("[AgentManager] Qwen path: {:?}", qwen_path);

                let mut cmd = Command::new(&qwen_path);

                // Set working directory
                let worktree = Path::new(&config.worktree_path);
                if worktree.exists() {
                    cmd.current_dir(&config.worktree_path);
                }

                // Add the prompt - requires non-empty prompt
                match &config.prompt {
                    Some(prompt) if !prompt.trim().is_empty() => {
                        cmd.arg("--prompt").arg(prompt);
                    }
                    _ => {
                        return Err(anyhow!(
                            "Qwen requires a non-empty prompt. Task description is empty for task {}",
                            config.task_id
                        ));
                    }
                }

                // Permission: --yolo for fully autonomous execution (auto-approves all operations)
                cmd.arg("--yolo");

                // Add model if specified
                if let Some(model) = &config.model {
                    cmd.arg("--model").arg(model);
                }

                Ok(cmd)
            }
            AgentType::Droid => {
                // Resolve Droid CLI path
                let droid_path = CliPathResolver::resolve_droid()
                    .ok_or_else(|| anyhow!("Droid CLI not found."))?;

                log::info!("[AgentManager] Droid path: {:?}", droid_path);

                let mut cmd = Command::new(&droid_path);

                // Droid uses "exec" subcommand
                cmd.arg("exec");

                // Set working directory
                let worktree = Path::new(&config.worktree_path);
                if worktree.exists() {
                    cmd.current_dir(&config.worktree_path);
                }

                // Add the prompt - requires non-empty prompt
                match &config.prompt {
                    Some(prompt) if !prompt.trim().is_empty() => {
                        cmd.arg("--prompt").arg(prompt);
                    }
                    _ => {
                        return Err(anyhow!(
                            "Droid requires a non-empty prompt. Task description is empty for task {}",
                            config.task_id
                        ));
                    }
                }

                // Permission: --auto medium for autonomous execution
                cmd.arg("--auto").arg("medium");

                // Add model if specified
                if let Some(model) = &config.model {
                    cmd.arg("--model").arg(model);
                }

                Ok(cmd)
            }
        }
    }

    /// Stop an agent by killing its process
    pub fn stop_agent(&mut self, agent_id: &str) -> Result<()> {
        let mut processes = lock_mutex_recover(&self.processes);

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
        let processes = lock_mutex_recover(&self.processes);
        processes.contains_key(agent_id)
    }

    /// Get the number of running agents
    pub fn running_count(&self) -> usize {
        let processes = lock_mutex_recover(&self.processes);
        processes.len()
    }

    /// Stop all running agents
    pub fn stop_all(&mut self) -> Result<()> {
        let mut processes = lock_mutex_recover(&self.processes);
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
        let mut processes = lock_mutex_recover(&self.processes);

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
        let log_entry = LogEntry {
            timestamp: Utc::now(),
            level,
            message,
        };

        // Store in memory for later retrieval
        {
            let mut logs = lock_mutex_recover(&self.agent_logs);
            logs.entry(agent_id.to_string())
                .or_insert_with(Vec::new)
                .push(log_entry.clone());
        }

        // Also send via channel if available
        if let Some(tx) = &self.log_tx {
            let event = AgentLogEvent {
                agent_id: agent_id.to_string(),
                log: log_entry,
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
        let mut processes = lock_mutex_recover(&self.processes);

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
            model: None,
        };

        // This test may fail if claude is not installed, which is expected
        let result = manager.build_command(&config);
        if let Ok(cmd) = result {
            let program = cmd.get_program().to_string_lossy();
            assert!(program.contains("claude"));
        }
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
            model: Some("anthropic/claude-sonnet-4-5".to_string()),
        };

        // This test may fail if opencode is not installed, which is expected
        let result = manager.build_command(&config);
        if let Ok(cmd) = result {
            let program = cmd.get_program().to_string_lossy();
            assert!(program.contains("opencode"));
        }
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
            model: None,
        };

        // This test may fail if cursor-agent is not installed, which is expected
        let result = manager.build_command(&config);
        if let Ok(cmd) = result {
            let program = cmd.get_program().to_string_lossy();
            assert!(program.contains("cursor"));
        }
    }

    #[test]
    fn test_build_codex_command() {
        let manager = AgentManager::new();
        let config = AgentSpawnConfig {
            agent_type: AgentType::Codex,
            task_id: "task1".to_string(),
            worktree_path: "/tmp/worktree".to_string(),
            branch: "feature/test".to_string(),
            max_iterations: 8,
            prompt: Some("Add unit tests".to_string()),
            model: Some("gpt-4o".to_string()),
        };

        // This test may fail if codex is not installed, which is expected
        let result = manager.build_command(&config);
        if let Ok(cmd) = result {
            let program = cmd.get_program().to_string_lossy();
            assert!(program.contains("codex"));
        }
    }

    #[test]
    fn test_build_qwen_command() {
        let manager = AgentManager::new();
        let config = AgentSpawnConfig {
            agent_type: AgentType::Qwen,
            task_id: "task1".to_string(),
            worktree_path: "/tmp/worktree".to_string(),
            branch: "feature/test".to_string(),
            max_iterations: 5,
            prompt: Some("Implement feature".to_string()),
            model: None,
        };

        // This test may fail if qwen is not installed, which is expected
        let result = manager.build_command(&config);
        if let Ok(cmd) = result {
            let program = cmd.get_program().to_string_lossy();
            assert!(program.contains("qwen"));
        }
    }

    #[test]
    fn test_build_droid_command() {
        let manager = AgentManager::new();
        let config = AgentSpawnConfig {
            agent_type: AgentType::Droid,
            task_id: "task1".to_string(),
            worktree_path: "/tmp/worktree".to_string(),
            branch: "feature/test".to_string(),
            max_iterations: 5,
            prompt: Some("Fix bug".to_string()),
            model: Some("droid-model".to_string()),
        };

        // This test may fail if droid is not installed, which is expected
        let result = manager.build_command(&config);
        if let Ok(cmd) = result {
            let program = cmd.get_program().to_string_lossy();
            assert!(program.contains("droid"));
        }
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
