// Agent process spawning and lifecycle management
// Note: Contains infrastructure code for future parallel agent execution

#![allow(dead_code)] // Infrastructure for parallel agent orchestration (Phase 4)

use crate::agents::ansi_stripper::RingBuffer;
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
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tokio::sync::mpsc;

/// Parse agent JSON output and extract human-readable text
/// Supports Claude stream-json format and OpenCode JSON format
/// Returns formatted text suitable for terminal display
fn parse_agent_json_output(line: &str) -> String {
    // Try to parse as JSON
    let json: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return line.to_string(), // Not JSON, return as-is
    };

    // Check for Claude stream-json format (has "type" field)
    if let Some(msg_type) = json.get("type").and_then(|v| v.as_str()) {
        return parse_claude_stream_json(&json, msg_type);
    }

    // Check for OpenCode format (has "role" or "content" at top level)
    if json.get("role").is_some() || json.get("content").is_some() {
        return parse_opencode_json(&json);
    }

    // Check for generic message/text fields
    if let Some(text) = json.get("text").and_then(|v| v.as_str()) {
        return text.to_string();
    }
    if let Some(message) = json.get("message").and_then(|v| v.as_str()) {
        return message.to_string();
    }
    if let Some(output) = json.get("output").and_then(|v| v.as_str()) {
        return output.to_string();
    }

    // Unknown JSON format - return as-is but formatted
    line.to_string()
}

/// Parse Claude stream-json format
fn parse_claude_stream_json(json: &serde_json::Value, msg_type: &str) -> String {
    match msg_type {
        "system" => {
            let subtype = json.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
            if subtype == "init" {
                let model = json.get("model").and_then(|v| v.as_str()).unwrap_or("unknown");
                format!("\x1b[36m[System] Initialized with model: {}\x1b[0m", model)
            } else {
                format!("\x1b[36m[System] {}\x1b[0m", subtype)
            }
        }
        "assistant" => {
            if let Some(message) = json.get("message") {
                if let Some(content) = message.get("content").and_then(|c| c.as_array()) {
                    let texts: Vec<String> = content
                        .iter()
                        .filter_map(|item| {
                            if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                                item.get("text").and_then(|t| t.as_str()).map(String::from)
                            } else if item.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                                let tool_name = item.get("name").and_then(|n| n.as_str()).unwrap_or("tool");
                                Some(format!("\x1b[33m[Using tool: {}]\x1b[0m", tool_name))
                            } else {
                                None
                            }
                        })
                        .collect();
                    if !texts.is_empty() {
                        return texts.join("\n");
                    }
                }
            }
            String::new()
        }
        "user" => {
            if let Some(message) = json.get("message") {
                if let Some(content) = message.get("content").and_then(|c| c.as_array()) {
                    for item in content {
                        if item.get("type").and_then(|t| t.as_str()) == Some("tool_result") {
                            let tool_id = item.get("tool_use_id").and_then(|t| t.as_str()).unwrap_or("");
                            let content_str = item.get("content").and_then(|c| c.as_str()).unwrap_or("");
                            let truncated = if content_str.len() > 200 {
                                format!("{}...", &content_str[..200])
                            } else {
                                content_str.to_string()
                            };
                            return format!("\x1b[90m[Tool result {}]: {}\x1b[0m", &tool_id[..8.min(tool_id.len())], truncated);
                        }
                    }
                }
            }
            String::new()
        }
        "result" => {
            let subtype = json.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
            let duration = json.get("duration_ms").and_then(|v| v.as_u64()).unwrap_or(0);
            let cost = json.get("total_cost_usd").and_then(|v| v.as_f64()).unwrap_or(0.0);
            format!(
                "\x1b[32m[Complete] {} - Duration: {}ms, Cost: ${:.4}\x1b[0m",
                subtype, duration, cost
            )
        }
        _ => String::new(),
    }
}

/// Parse OpenCode JSON format
fn parse_opencode_json(json: &serde_json::Value) -> String {
    let role = json.get("role").and_then(|v| v.as_str()).unwrap_or("unknown");

    // Extract content - can be string or array
    let content = if let Some(content_str) = json.get("content").and_then(|v| v.as_str()) {
        content_str.to_string()
    } else if let Some(content_arr) = json.get("content").and_then(|v| v.as_array()) {
        content_arr
            .iter()
            .filter_map(|item| {
                if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                    Some(text.to_string())
                } else if let Some(tool) = item.get("tool_use") {
                    let name = tool.get("name").and_then(|n| n.as_str()).unwrap_or("tool");
                    Some(format!("\x1b[33m[Using tool: {}]\x1b[0m", name))
                } else {
                    None
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
    } else {
        String::new()
    };

    if content.is_empty() {
        return String::new();
    }

    match role {
        "assistant" => content,
        "user" => format!("\x1b[90m[User]: {}\x1b[0m", content),
        "system" => format!("\x1b[36m[System]: {}\x1b[0m", content),
        "tool" => {
            let truncated = if content.len() > 200 {
                format!("{}...", &content[..200])
            } else {
                content
            };
            format!("\x1b[90m[Tool result]: {}\x1b[0m", truncated)
        }
        _ => content,
    }
}

/// Agent spawn mode - determines how the agent process is spawned
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum AgentSpawnMode {
    /// Piped mode - separate stdout/stderr, current behavior
    Piped,
    /// PTY mode - interactive terminal with combined output
    #[default]
    Pty,
}

/// Agent lifecycle manager
pub struct AgentManager {
    /// Map of agent ID to running process (for piped mode)
    processes: Arc<Mutex<HashMap<String, Child>>>,
    /// Event sender for agent logs
    log_tx: Option<mpsc::UnboundedSender<AgentLogEvent>>,
    /// Rate limit detector for parsing stderr output
    rate_limit_detector: RateLimitDetector,
    /// Event sender for rate limit events
    rate_limit_tx: Option<mpsc::UnboundedSender<RateLimitEvent>>,
    /// Event sender for agent completion events
    completion_tx: Option<mpsc::UnboundedSender<AgentCompletionEvent>>,
    /// In-memory log storage for each agent (for retrieval via command)
    agent_logs: Arc<Mutex<HashMap<String, Vec<LogEntry>>>>,
    /// Map of agent ID to PTY ID (for PTY mode)
    pty_ids: Arc<Mutex<HashMap<String, String>>>,
    /// Raw PTY output history per agent (ring buffer for replay)
    pty_history: Arc<Mutex<HashMap<String, RingBuffer>>>,
    /// Event sender for PTY data events
    pty_data_tx: Option<mpsc::UnboundedSender<AgentPtyDataEvent>>,
    /// Event sender for PTY exit events
    pty_exit_tx: Option<mpsc::UnboundedSender<AgentPtyExitEvent>>,
    /// Cancellation tokens for monitor threads (triggered when process is taken/stopped)
    monitor_cancellation: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

/// Event emitted when a rate limit is detected
#[derive(Debug, Clone)]
pub struct RateLimitEvent {
    pub agent_id: String,
    pub rate_limit_info: RateLimitInfo,
}

/// Event emitted when an agent process completes
#[derive(Debug, Clone)]
pub struct AgentCompletionEvent {
    pub agent_id: String,
    pub task_id: String,
    pub success: bool,
    pub exit_code: Option<i32>,
    pub error: Option<String>,
}

/// Event emitted when an agent produces a log
#[derive(Debug, Clone)]
pub struct AgentLogEvent {
    pub agent_id: String,
    pub log: LogEntry,
}

/// Event emitted when PTY produces output data
#[derive(Debug, Clone)]
pub struct AgentPtyDataEvent {
    pub agent_id: String,
    pub data: Vec<u8>,
}

/// Event emitted when PTY exits
#[derive(Debug, Clone)]
pub struct AgentPtyExitEvent {
    pub agent_id: String,
    pub exit_code: i32,
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
    /// Spawn mode - PTY (interactive) or Piped (separate streams)
    pub spawn_mode: AgentSpawnMode,
}

impl AgentManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            log_tx: None,
            rate_limit_detector: RateLimitDetector::new(),
            rate_limit_tx: None,
            completion_tx: None,
            agent_logs: Arc::new(Mutex::new(HashMap::new())),
            pty_ids: Arc::new(Mutex::new(HashMap::new())),
            pty_history: Arc::new(Mutex::new(HashMap::new())),
            pty_data_tx: None,
            pty_exit_tx: None,
            monitor_cancellation: Arc::new(Mutex::new(HashMap::new())),
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

    /// Set the completion event sender for agent completion notifications
    pub fn set_completion_sender(&mut self, tx: mpsc::UnboundedSender<AgentCompletionEvent>) {
        self.completion_tx = Some(tx);
    }

    /// Set the PTY data event sender for streaming PTY output
    pub fn set_pty_data_sender(&mut self, tx: mpsc::UnboundedSender<AgentPtyDataEvent>) {
        self.pty_data_tx = Some(tx);
    }

    /// Set the PTY exit event sender for PTY termination notifications
    pub fn set_pty_exit_sender(&mut self, tx: mpsc::UnboundedSender<AgentPtyExitEvent>) {
        self.pty_exit_tx = Some(tx);
    }

    /// Check if an agent has an associated PTY
    pub fn has_pty(&self, agent_id: &str) -> bool {
        let pty_ids = lock_mutex_recover(&self.pty_ids);
        pty_ids.contains_key(agent_id)
    }

    /// Get the PTY ID for an agent
    pub fn get_pty_id(&self, agent_id: &str) -> Option<String> {
        let pty_ids = lock_mutex_recover(&self.pty_ids);
        pty_ids.get(agent_id).cloned()
    }

    /// Get the PTY history (raw output) for an agent
    pub fn get_pty_history(&self, agent_id: &str) -> Vec<u8> {
        let pty_history = lock_mutex_recover(&self.pty_history);
        pty_history.get(agent_id)
            .map(|buf| buf.get_data())
            .unwrap_or_default()
    }

    /// Clear PTY tracking data for an agent
    pub fn clear_pty_data(&self, agent_id: &str) {
        {
            let mut pty_ids = lock_mutex_recover(&self.pty_ids);
            pty_ids.remove(agent_id);
        }
        {
            let mut pty_history = lock_mutex_recover(&self.pty_history);
            pty_history.remove(agent_id);
        }
    }

    /// Register a PTY association for an agent
    /// Called by frontend after spawning a PTY for an agent
    pub fn register_pty(&self, agent_id: &str, pty_id: &str) {
        {
            let mut pty_ids = lock_mutex_recover(&self.pty_ids);
            pty_ids.insert(agent_id.to_string(), pty_id.to_string());
        }
        {
            let mut pty_history = lock_mutex_recover(&self.pty_history);
            // Create a 1MB ring buffer for history
            pty_history.insert(agent_id.to_string(), RingBuffer::new(1024 * 1024));
        }
        log::info!("[AgentManager] Registered PTY {} for agent {}", pty_id, agent_id);
    }

    /// Unregister a PTY association for an agent
    /// Called when PTY exits or agent stops
    pub fn unregister_pty(&self, agent_id: &str) {
        let pty_id = {
            let mut pty_ids = lock_mutex_recover(&self.pty_ids);
            pty_ids.remove(agent_id)
        };
        // Keep history for a while after exit (don't clear immediately)
        // The history can be cleared explicitly via clear_pty_data
        if let Some(id) = pty_id {
            log::info!("[AgentManager] Unregistered PTY {} for agent {}", id, agent_id);
        }
    }

    /// Process PTY data from an agent
    /// Stores in history buffer, parses for logs, and checks for rate limits
    pub fn process_pty_data(&self, agent_id: &str, data: &[u8]) {
        // Store raw data in history buffer
        {
            let mut pty_history = lock_mutex_recover(&self.pty_history);
            if let Some(buffer) = pty_history.get_mut(agent_id) {
                buffer.write(data);
            }
        }

        // Convert to string for log parsing
        let text = String::from_utf8_lossy(data);

        // Strip ANSI codes for clean log parsing
        let clean_text = crate::agents::ansi_stripper::strip_ansi(&text);

        // Process each line for logs and rate limit detection
        for line in clean_text.lines() {
            if line.trim().is_empty() {
                continue;
            }

            // Check for rate limits
            if let Some(info) = self.rate_limit_detector.detect_in_stderr(line) {
                log::warn!("[Agent {}] Rate limit detected: {:?}", agent_id, info);
                if let Some(tx) = &self.rate_limit_tx {
                    let event = RateLimitEvent {
                        agent_id: agent_id.to_string(),
                        rate_limit_info: info,
                    };
                    let _ = tx.send(event);
                }
            }

            // Create log entry (default to Info level since PTY combines streams)
            let log_entry = LogEntry {
                timestamp: Utc::now(),
                level: LogLevel::Info,
                message: line.to_string(),
            };

            // Store in memory
            {
                let mut logs = lock_mutex_recover(&self.agent_logs);
                logs.entry(agent_id.to_string())
                    .or_insert_with(Vec::new)
                    .push(log_entry.clone());
            }

            // Send via channel if available
            if let Some(tx) = &self.log_tx {
                let event = AgentLogEvent {
                    agent_id: agent_id.to_string(),
                    log: log_entry,
                };
                let _ = tx.send(event);
            }
        }

        // Emit PTY data event for terminal streaming
        if let Some(tx) = &self.pty_data_tx {
            let event = AgentPtyDataEvent {
                agent_id: agent_id.to_string(),
                data: data.to_vec(),
            };
            let _ = tx.send(event);
        }
    }

    /// Notify that an agent's PTY has exited
    pub fn notify_pty_exit(&self, agent_id: &str, exit_code: i32) {
        log::info!("[AgentManager] PTY exit for agent {} with code {}", agent_id, exit_code);

        // Emit exit event
        if let Some(tx) = &self.pty_exit_tx {
            let event = AgentPtyExitEvent {
                agent_id: agent_id.to_string(),
                exit_code,
            };
            let _ = tx.send(event);
        }

        // Add exit log entry
        self.emit_log(
            agent_id,
            if exit_code == 0 { LogLevel::Info } else { LogLevel::Error },
            format!("Agent exited with code {}", exit_code),
        );
    }

    /// Build command line arguments for an agent (for PTY spawning on frontend)
    /// Returns (program, args, cwd)
    pub fn build_agent_command_line(&self, config: &AgentSpawnConfig) -> Result<(String, Vec<String>, String)> {
        let cmd = self.build_command(config)?;
        let program = cmd.get_program().to_string_lossy().to_string();
        let args: Vec<String> = cmd.get_args().map(|s| s.to_string_lossy().to_string()).collect();
        let cwd = config.worktree_path.clone();
        Ok((program, args, cwd))
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

        // For PTY mode, register a pseudo-PTY so the Terminal can connect
        // We use the agent_id as the pty_id and store output in pty_history
        let is_pty_mode = config.spawn_mode == AgentSpawnMode::Pty;
        if is_pty_mode {
            log::info!("[AgentManager] PTY mode: registering pseudo-PTY for agent {}", agent_id);
            log::debug!("[AgentManager] pty_data_tx is_some: {}", self.pty_data_tx.is_some());
            self.register_pty(agent_id, agent_id);
        }

        // Emit log
        self.emit_log(agent_id, LogLevel::Info, format!(
            "Agent spawned with PID {} for task {} in {}",
            pid, config.task_id, config.worktree_path
        ));

        // Give the process a moment to start (helps detect immediate failures)
        log::debug!("[AgentManager] Waiting 100ms for process to start...");
        std::thread::sleep(std::time::Duration::from_millis(100));

        // Quick check - see if process already exited (helps diagnose immediate failures)
        log::debug!("[AgentManager] Checking if process exited immediately...");
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
                log::error!("[AgentManager] Process not found in processes map!");
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
            let pty_history = if is_pty_mode { Some(self.pty_history.clone()) } else { None };
            let pty_data_tx = if is_pty_mode { self.pty_data_tx.clone() } else { None };
            let agent_id_clone = agent_id.to_string();
            log::debug!("[AgentManager] Spawning stdout reader thread for agent {}, pty_data_tx.is_some: {}", agent_id, pty_data_tx.is_some());
            thread::spawn(move || {
                log::debug!("[AgentManager] Stdout reader thread started for agent {}", agent_id_clone);
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    match line {
                        Ok(line) => {
                            log::info!("[Agent {}] {}", agent_id_clone, line);

                            // Parse JSON output and extract readable text (supports Claude and OpenCode)
                            let display_text = parse_agent_json_output(&line);

                            // Skip empty lines (unknown JSON types return empty string)
                            if display_text.is_empty() {
                                continue;
                            }

                            // For PTY mode, also write to pty_history with newline
                            if let Some(ref pty_hist) = pty_history {
                                let text_with_newline = format!("{}\r\n", display_text);
                                let mut hist = lock_mutex_recover(pty_hist);
                                hist.entry(agent_id_clone.clone())
                                    .or_insert_with(|| RingBuffer::new(1024 * 1024)) // 1MB buffer
                                    .write(text_with_newline.as_bytes());

                                // Also send via PTY data channel for real-time updates
                                if let Some(ref tx) = pty_data_tx {
                                    let _ = tx.send(AgentPtyDataEvent {
                                        agent_id: agent_id_clone.clone(),
                                        data: text_with_newline.into_bytes(),
                                    });
                                }
                            }

                            let log_entry = LogEntry {
                                timestamp: Utc::now(),
                                level: LogLevel::Info,
                                message: display_text.clone(),
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
            let pty_history = if is_pty_mode { Some(self.pty_history.clone()) } else { None };
            let pty_data_tx = if is_pty_mode { self.pty_data_tx.clone() } else { None };
            // Create a new detector for the thread (uses static patterns internally)
            let rate_limit_detector = RateLimitDetector::new();
            let agent_id_clone = agent_id.to_string();
            log::debug!("[AgentManager] Spawning stderr reader thread for agent {}", agent_id);
            thread::spawn(move || {
                log::debug!("[AgentManager] Stderr reader thread started for agent {}", agent_id_clone);
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    match line {
                        Ok(line) => {
                            // Log stderr as warnings (they're often important)
                            log::warn!("[Agent {}] stderr: {}", agent_id_clone, line);

                            // For PTY mode, also write to pty_history (stderr in red)
                            if let Some(ref pty_hist) = pty_history {
                                // Use ANSI red for stderr
                                let line_with_color = format!("\x1b[31m{}\x1b[0m\r\n", line);
                                let mut hist = lock_mutex_recover(pty_hist);
                                hist.entry(agent_id_clone.clone())
                                    .or_insert_with(|| RingBuffer::new(1024 * 1024))
                                    .write(line_with_color.as_bytes());

                                // Also send via PTY data channel for real-time updates
                                if let Some(ref tx) = pty_data_tx {
                                    let _ = tx.send(AgentPtyDataEvent {
                                        agent_id: agent_id_clone.clone(),
                                        data: line_with_color.into_bytes(),
                                    });
                                }
                            }

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

        // Spawn background thread to monitor process completion
        {
            let processes = self.processes.clone();
            let completion_tx = self.completion_tx.clone();
            let agent_logs = self.agent_logs.clone();
            let agent_id_clone = agent_id.to_string();
            let task_id_clone = config.task_id.clone();
            let log_tx = self.log_tx.clone();

            // Create and store cancellation token for this monitor thread
            let cancelled = Arc::new(AtomicBool::new(false));
            let monitor_cancellation = self.monitor_cancellation.clone();
            {
                let mut tokens = lock_mutex_recover(&self.monitor_cancellation);
                tokens.insert(agent_id.to_string(), cancelled.clone());
            }

            thread::spawn(move || {
                // Poll every 500ms to check if process has exited
                loop {
                    // Check cancellation token first (allows immediate exit)
                    if cancelled.load(Ordering::Relaxed) {
                        log::debug!(
                            "[AgentManager] Monitor thread for agent {} cancelled",
                            agent_id_clone
                        );
                        break;
                    }

                    thread::sleep(std::time::Duration::from_millis(500));

                    // Check again after sleep
                    if cancelled.load(Ordering::Relaxed) {
                        log::debug!(
                            "[AgentManager] Monitor thread for agent {} cancelled after sleep",
                            agent_id_clone
                        );
                        break;
                    }

                    let should_exit = {
                        let mut processes_guard = lock_mutex_recover(&processes);
                        if let Some(child) = processes_guard.get_mut(&agent_id_clone) {
                            match child.try_wait() {
                                Ok(Some(status)) => {
                                    // Process has exited
                                    let exit_code = status.code();
                                    let success = exit_code == Some(0);

                                    log::info!(
                                        "[AgentManager] Process for agent {} exited with code {:?}",
                                        agent_id_clone, exit_code
                                    );

                                    // Remove from processes map
                                    processes_guard.remove(&agent_id_clone);

                                    // Emit completion event
                                    if let Some(tx) = &completion_tx {
                                        let event = AgentCompletionEvent {
                                            agent_id: agent_id_clone.clone(),
                                            task_id: task_id_clone.clone(),
                                            success,
                                            exit_code,
                                            error: if success {
                                                None
                                            } else {
                                                Some(format!("Process exited with code {:?}", exit_code))
                                            },
                                        };
                                        let _ = tx.send(event);
                                    }

                                    // Log the exit
                                    let log_entry = LogEntry {
                                        timestamp: Utc::now(),
                                        level: if success { LogLevel::Info } else { LogLevel::Error },
                                        message: format!("Agent process exited with code {:?}", exit_code),
                                    };
                                    {
                                        let mut logs = lock_mutex_recover(&agent_logs);
                                        logs.entry(agent_id_clone.clone())
                                            .or_insert_with(Vec::new)
                                            .push(log_entry.clone());
                                    }
                                    if let Some(tx) = &log_tx {
                                        let _ = tx.send(AgentLogEvent {
                                            agent_id: agent_id_clone.clone(),
                                            log: log_entry,
                                        });
                                    }

                                    true // Exit the monitoring loop
                                }
                                Ok(None) => {
                                    // Process is still running
                                    false
                                }
                                Err(e) => {
                                    log::error!(
                                        "[AgentManager] Error checking process status for agent {}: {}",
                                        agent_id_clone, e
                                    );
                                    false
                                }
                            }
                        } else {
                            // Process was removed (killed externally), exit loop
                            log::debug!(
                                "[AgentManager] Process for agent {} no longer in tracking map",
                                agent_id_clone
                            );
                            true
                        }
                    };

                    if should_exit {
                        break;
                    }
                }

                // Clean up cancellation token
                {
                    let mut tokens = lock_mutex_recover(&monitor_cancellation);
                    tokens.remove(&agent_id_clone);
                }
                log::debug!("[AgentManager] Process monitor for agent {} finished", agent_id_clone);
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

                // Validate prompt is non-empty
                let prompt = match &config.prompt {
                    Some(prompt) if !prompt.trim().is_empty() => prompt.clone(),
                    _ => {
                        return Err(anyhow!(
                            "Claude requires a non-empty prompt. Task description is empty for task {}",
                            config.task_id
                        ));
                    }
                };

                // Add --print first to output to stdout instead of interactive TUI
                // Note: -p is the short form of --print, NOT a prompt flag!
                cmd.arg("--print");

                // Use stream-json for real-time streaming (text format buffers until complete)
                // Requires --verbose when using stream-json
                cmd.arg("--output-format").arg("stream-json");
                cmd.arg("--verbose");

                // Add --dangerously-skip-permissions to skip permission prompts
                cmd.arg("--dangerously-skip-permissions");

                // Add max turns (iterations) - only if greater than 0
                // max_iterations of 0 or negative means no limit (don't pass flag)
                if config.max_iterations > 0 {
                    cmd.arg("--max-turns")
                        .arg(config.max_iterations.to_string());
                }

                // Add model if specified
                if let Some(model) = &config.model {
                    cmd.arg("--model").arg(model);
                }

                // Add the prompt as the LAST positional argument
                // Claude CLI syntax: claude [options] [prompt]
                cmd.arg(&prompt);

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

                // Create opencode.json config in the working directory to skip permission prompts
                // OpenCode uses config-based permissions, not environment variables
                if worktree.exists() {
                    let config_path = worktree.join("opencode.json");
                    // Only create if it doesn't exist (don't overwrite user config)
                    if !config_path.exists() {
                        let config_content = r#"{"$schema": "https://opencode.ai/config.json", "permission": "allow"}"#;
                        if let Err(e) = std::fs::write(&config_path, config_content) {
                            log::warn!("[AgentManager] Failed to create opencode.json for permissions: {}", e);
                        } else {
                            log::info!("[AgentManager] Created opencode.json with permission: allow");
                        }
                    } else {
                        log::info!("[AgentManager] opencode.json already exists, using existing config");
                    }
                }

                // Set working directory
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

                // Add max turns (iterations) - only if greater than 0
                if config.max_iterations > 0 {
                    cmd.arg("--max-turns")
                        .arg(config.max_iterations.to_string());
                }

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
        // Cancel the monitor thread for this agent
        {
            let tokens = lock_mutex_recover(&self.monitor_cancellation);
            if let Some(cancelled) = tokens.get(agent_id) {
                cancelled.store(true, Ordering::Relaxed);
            }
        }

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
        // Cancel all monitor threads
        {
            let tokens = lock_mutex_recover(&self.monitor_cancellation);
            for (_, cancelled) in tokens.iter() {
                cancelled.store(true, Ordering::Relaxed);
            }
        }

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
        // Cancel the monitor thread since we're waiting directly
        {
            let tokens = lock_mutex_recover(&self.monitor_cancellation);
            if let Some(cancelled) = tokens.get(agent_id) {
                cancelled.store(true, Ordering::Relaxed);
            }
        }

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

    /// Wait for a child process with timeout (polling-based)
    /// Returns Ok(Some(exit_code)) if process exited, Ok(None) if timeout, Err on wait error
    pub fn wait_with_timeout(child: &mut Child, timeout_secs: u64) -> Result<Option<i32>> {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(timeout_secs);
        let poll_interval = std::time::Duration::from_millis(100);

        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    // Process exited
                    return Ok(Some(status.code().unwrap_or(-1)));
                }
                Ok(None) => {
                    // Still running - check timeout
                    if start.elapsed() >= timeout {
                        log::warn!("Process wait timed out after {} seconds", timeout_secs);
                        return Ok(None);
                    }
                    thread::sleep(poll_interval);
                }
                Err(e) => {
                    return Err(anyhow!("Error waiting for process: {}", e));
                }
            }
        }
    }

    /// Take a child process out of the manager for external waiting
    ///
    /// This allows the caller to wait on the process without holding
    /// the manager lock, preventing UI freezes.
    /// Also cancels the background monitor thread for this agent.
    pub fn take_child_process(&mut self, agent_id: &str) -> Option<std::process::Child> {
        // Cancel the monitor thread for this agent
        {
            let tokens = lock_mutex_recover(&self.monitor_cancellation);
            if let Some(cancelled) = tokens.get(agent_id) {
                cancelled.store(true, Ordering::Relaxed);
                log::debug!("[AgentManager] Cancelled monitor thread for agent {}", agent_id);
            }
        }

        // Remove the process from tracking
        let mut processes = lock_mutex_recover(&self.processes);
        processes.remove(agent_id)
    }

    /// Clean up cancellation token for an agent (call after monitor thread exits)
    fn cleanup_monitor_token(&self, agent_id: &str) {
        let mut tokens = lock_mutex_recover(&self.monitor_cancellation);
        tokens.remove(agent_id);
    }

    /// Emit a log event for agent exit (for use after take_child_process + wait)
    pub fn emit_agent_exit(&self, agent_id: &str, exit_code: i32) {
        self.emit_log(
            agent_id,
            if exit_code == 0 { LogLevel::Info } else { LogLevel::Error },
            format!("Agent exited with code {}", exit_code)
        );
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
            spawn_mode: AgentSpawnMode::Piped,
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
            spawn_mode: AgentSpawnMode::Piped,
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
            spawn_mode: AgentSpawnMode::Piped,
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
            spawn_mode: AgentSpawnMode::Piped,
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
            spawn_mode: AgentSpawnMode::Piped,
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
            spawn_mode: AgentSpawnMode::Piped,
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
