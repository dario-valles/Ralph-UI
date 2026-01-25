// Agent process spawning and lifecycle management
// Note: Contains infrastructure code for future parallel agent execution

#![allow(dead_code)] // Infrastructure for parallel agent orchestration (Phase 4)

use crate::agents::ansi_stripper::RingBuffer;
use crate::agents::format_parsers::parse_agent_json_output_with_tools;
use crate::agents::log_collector::LogCollector;
use crate::agents::path_resolver::CliPathResolver;
use crate::agents::rate_limiter::{RateLimitDetector, RateLimitInfo};
use crate::agents::{StreamingParser, SubagentEvent, SubagentTree};
use crate::models::{AgentType, LogEntry, LogLevel};
use crate::utils::lock_mutex_recover;
use anyhow::{anyhow, Result};
use chrono::Utc;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use tokio::sync::mpsc;

// Re-export types from log_collector for backward compatibility
pub use crate::agents::log_collector::{
    AgentCompletionEvent, AgentLogEvent, AgentPtyDataEvent, AgentPtyExitEvent, RateLimitEvent,
    ToolCallCompleteEvent, ToolCallStartEvent,
};

/// Agent spawn mode - determines how the agent process is spawned
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum AgentSpawnMode {
    /// Piped mode - separate stdout/stderr, current behavior
    Piped,
    /// PTY mode - interactive terminal with combined output
    #[default]
    Pty,
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
    /// Configuration for plugins (key-value pairs)
    pub plugin_config: Option<HashMap<String, serde_json::Value>>,
}

/// Agent lifecycle manager
pub struct AgentManager {
    /// Map of agent ID to running process (for piped mode)
    processes: Arc<Mutex<HashMap<String, Child>>>,
    /// Log collector for managing agent logs and events
    log_collector: LogCollector,
    /// Rate limit detector for parsing stderr output
    rate_limit_detector: RateLimitDetector,
    /// Map of agent ID to PTY ID (for PTY mode)
    pty_ids: Arc<Mutex<HashMap<String, String>>>,
    /// Raw PTY output history per agent (ring buffer for replay)
    pty_history: Arc<Mutex<HashMap<String, RingBuffer>>>,
    /// Event sender for subagent events
    subagent_tx: Option<mpsc::UnboundedSender<SubagentEvent>>,
    /// Trace parsers per agent
    parsers: Arc<Mutex<HashMap<String, StreamingParser>>>,
    /// Subagent trees per agent
    subagent_trees: Arc<Mutex<HashMap<String, SubagentTree>>>,
    /// Cancellation tokens for monitor threads (triggered when process is taken/stopped)
    monitor_cancellation: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl AgentManager {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
            log_collector: LogCollector::new(),
            rate_limit_detector: RateLimitDetector::new(),
            pty_ids: Arc::new(Mutex::new(HashMap::new())),
            pty_history: Arc::new(Mutex::new(HashMap::new())),
            subagent_tx: None,
            parsers: Arc::new(Mutex::new(HashMap::new())),
            subagent_trees: Arc::new(Mutex::new(HashMap::new())),
            monitor_cancellation: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    // ========== Log Collection Delegation ==========

    /// Get logs for an agent from in-memory storage
    pub fn get_agent_logs(&self, agent_id: &str) -> Vec<LogEntry> {
        self.log_collector.get_agent_logs(agent_id)
    }

    /// Clear logs for an agent
    pub fn clear_agent_logs(&self, agent_id: &str) {
        self.log_collector.clear_agent_logs(agent_id);
    }

    /// Set the log event sender for real-time log streaming
    pub fn set_log_sender(&mut self, tx: mpsc::UnboundedSender<AgentLogEvent>) {
        self.log_collector.set_log_sender(tx);
    }

    /// Set the rate limit event sender for rate limit notifications
    pub fn set_rate_limit_sender(&mut self, tx: mpsc::UnboundedSender<RateLimitEvent>) {
        self.log_collector.set_rate_limit_sender(tx);
    }

    /// Set the completion event sender for agent completion notifications
    pub fn set_completion_sender(&mut self, tx: mpsc::UnboundedSender<AgentCompletionEvent>) {
        self.log_collector.set_completion_sender(tx);
    }

    /// Set the PTY data event sender for streaming PTY output
    pub fn set_pty_data_sender(&mut self, tx: mpsc::UnboundedSender<AgentPtyDataEvent>) {
        self.log_collector.set_pty_data_sender(tx);
    }

    /// Set the PTY exit event sender for PTY termination notifications
    pub fn set_pty_exit_sender(&mut self, tx: mpsc::UnboundedSender<AgentPtyExitEvent>) {
        self.log_collector.set_pty_exit_sender(tx);
    }

    /// Set the subagent event sender for streaming subagent updates
    pub fn set_subagent_sender(&mut self, tx: mpsc::UnboundedSender<SubagentEvent>) {
        self.subagent_tx = Some(tx);
    }

    /// Set the tool call start event sender for streaming tool call updates
    pub fn set_tool_call_sender(&mut self, tx: mpsc::UnboundedSender<ToolCallStartEvent>) {
        self.log_collector.set_tool_call_sender(tx);
    }

    /// Set the tool call complete event sender for streaming tool call completion updates
    pub fn set_tool_call_complete_sender(
        &mut self,
        tx: mpsc::UnboundedSender<ToolCallCompleteEvent>,
    ) {
        self.log_collector.set_tool_call_complete_sender(tx);
    }

    // ========== Trace Parser Management ==========

    /// Initialize trace parser for an agent
    pub fn init_trace_parser(&self, agent_id: &str) {
        {
            let mut parsers = lock_mutex_recover(&self.parsers);
            parsers.insert(agent_id.to_string(), StreamingParser::new(agent_id));
        }
        {
            let mut trees = lock_mutex_recover(&self.subagent_trees);
            trees.insert(agent_id.to_string(), SubagentTree::new());
        }
    }

    /// Get subagent tree for an agent
    pub fn get_subagent_tree(&self, agent_id: &str) -> Option<SubagentTree> {
        let trees = lock_mutex_recover(&self.subagent_trees);
        trees.get(agent_id).cloned()
    }

    /// Clear trace data for an agent
    pub fn clear_trace_data(&self, agent_id: &str) {
        {
            let mut parsers = lock_mutex_recover(&self.parsers);
            parsers.remove(agent_id);
        }
        {
            let mut trees = lock_mutex_recover(&self.subagent_trees);
            trees.remove(agent_id);
        }
    }

    /// Parse text output for an agent (helper for manual parsing)
    pub fn parse_text_output(&self, agent_id: &str, text: &str) -> Vec<SubagentEvent> {
        let mut parsers = lock_mutex_recover(&self.parsers);
        let mut trees = lock_mutex_recover(&self.subagent_trees);

        // Auto-initialize if missing
        if !parsers.contains_key(agent_id) {
            parsers.insert(agent_id.to_string(), StreamingParser::new(agent_id));
            trees.insert(agent_id.to_string(), SubagentTree::new());
        }

        if let Some(parser) = parsers.get_mut(agent_id) {
            let events = parser.parse_output(text);
            if !events.is_empty() {
                let tree = trees
                    .entry(agent_id.to_string())
                    .or_insert_with(SubagentTree::new);
                for event in &events {
                    tree.add_event(event.clone());
                }
            }
            events
        } else {
            Vec::new()
        }
    }

    // ========== PTY Management ==========

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
        pty_history
            .get(agent_id)
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
        // Initialize trace parser
        self.init_trace_parser(agent_id);

        log::info!(
            "[AgentManager] Registered PTY {} for agent {}",
            pty_id,
            agent_id
        );
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
            log::info!(
                "[AgentManager] Unregistered PTY {} for agent {}",
                id,
                agent_id
            );
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

        // Parse for subagent events
        {
            let mut parsers = lock_mutex_recover(&self.parsers);
            let mut trees = lock_mutex_recover(&self.subagent_trees);

            // Auto-initialize if missing
            if !parsers.contains_key(agent_id) {
                parsers.insert(agent_id.to_string(), StreamingParser::new(agent_id));
                trees.insert(agent_id.to_string(), SubagentTree::new());
            }

            if let Some(parser) = parsers.get_mut(agent_id) {
                let events = parser.parse_output(&clean_text);
                if !events.is_empty() {
                    let tree = trees
                        .entry(agent_id.to_string())
                        .or_insert_with(SubagentTree::new);

                    for event in events {
                        tree.add_event(event.clone());

                        // Emit event
                        if let Some(tx) = &self.subagent_tx {
                            let _ = tx.send(event);
                        }
                    }
                }
            }
        }

        // Process each line for logs and rate limit detection
        for line in clean_text.lines() {
            if line.trim().is_empty() {
                continue;
            }

            // Filter out noisy server logs
            if line.contains("path=/tui/show-toast") || line.contains("type=tui.toast.show") {
                continue;
            }

            // Check for rate limits
            if let Some(info) = self.rate_limit_detector.detect_in_stderr(line) {
                log::warn!("[Agent {}] Rate limit detected: {:?}", agent_id, info);
                self.log_collector.emit_rate_limit(agent_id, info);
            }

            // Create log entry (default to Info level since PTY combines streams)
            let log_entry = LogEntry {
                timestamp: Utc::now(),
                level: LogLevel::Info,
                message: line.to_string(),
            };

            // Store in memory
            {
                let mut logs = lock_mutex_recover(&self.log_collector.agent_logs);
                logs.entry(agent_id.to_string())
                    .or_insert_with(Vec::new)
                    .push(log_entry.clone());
            }

            // Send via channel if available
            if let Some(tx) = &self.log_collector.log_tx {
                let event = AgentLogEvent {
                    agent_id: agent_id.to_string(),
                    log: log_entry,
                };
                let _ = tx.send(event);
            }
        }

        // Emit PTY data event for terminal streaming
        if self.log_collector.pty_data_tx.is_some() {
            // Filter out noisy server logs from the terminal output
            let should_filter =
                text.contains("path=/tui/show-toast") || text.contains("type=tui.toast.show");

            let data_to_send = if should_filter {
                let mut filtered = Vec::new();
                for line in text.split_inclusive('\n') {
                    if !line.contains("path=/tui/show-toast")
                        && !line.contains("type=tui.toast.show")
                    {
                        filtered.extend_from_slice(line.as_bytes());
                    }
                }
                filtered
            } else {
                data.to_vec()
            };

            if !data_to_send.is_empty() {
                self.log_collector
                    .emit_pty_data(agent_id, data_to_send);
            }
        }
    }

    /// Notify that an agent's PTY has exited
    pub fn notify_pty_exit(&self, agent_id: &str, exit_code: i32) {
        log::info!(
            "[AgentManager] PTY exit for agent {} with code {}",
            agent_id,
            exit_code
        );

        // Emit exit event
        self.log_collector.emit_pty_exit(agent_id, exit_code);

        // Add exit log entry
        self.log_collector.emit_log(
            agent_id,
            if exit_code == 0 {
                LogLevel::Info
            } else {
                LogLevel::Error
            },
            format!("Agent exited with code {}", exit_code),
        );
    }

    // ========== Process Lifecycle ==========

    /// Build command line arguments for an agent (for PTY spawning on frontend)
    /// Returns (program, args, cwd)
    pub fn build_agent_command_line(
        &self,
        config: &AgentSpawnConfig,
    ) -> Result<(String, Vec<String>, String)> {
        let cmd = self.build_command(config)?;
        let program = cmd.get_program().to_string_lossy().to_string();
        let args: Vec<String> = cmd
            .get_args()
            .map(|s| s.to_string_lossy().to_string())
            .collect();
        let cwd = config.worktree_path.clone();
        Ok((program, args, cwd))
    }

    /// Spawn a new agent process
    pub fn spawn_agent(&mut self, agent_id: &str, config: AgentSpawnConfig) -> Result<u32> {
        log::info!(
            "[AgentManager] spawn_agent called for agent_id: {}, task_id: {}",
            agent_id,
            config.task_id
        );
        log::info!("[AgentManager] Config: {:?}", config);

        let mut command = self.build_command(&config)?;

        // Log the command being executed
        let program = command.get_program().to_string_lossy().to_string();
        let args: Vec<String> = command
            .get_args()
            .map(|s| s.to_string_lossy().to_string())
            .collect();
        log::info!("[AgentManager] Executing command: {} {:?}", program, args);

        let mut child = match command
            .stdin(Stdio::null()) // Prevent stdin issues causing early exit
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
        {
            Ok(c) => {
                log::info!("[AgentManager] Process spawned successfully");
                c
            }
            Err(e) => {
                log::error!("[AgentManager] Failed to spawn process: {}", e);
                return Err(anyhow!(
                    "Failed to spawn agent process '{}': {}",
                    program,
                    e
                ));
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
            log::info!(
                "[AgentManager] Process stored. Total running: {}",
                processes.len()
            );
        }

        // For PTY mode, register a pseudo-PTY so the Terminal can connect
        let is_pty_mode = config.spawn_mode == AgentSpawnMode::Pty;
        if is_pty_mode {
            log::info!(
                "[AgentManager] PTY mode: registering pseudo-PTY for agent {}",
                agent_id
            );
            log::debug!(
                "[AgentManager] pty_data_tx is_some: {}",
                self.log_collector.pty_data_tx.is_some()
            );
            self.register_pty(agent_id, agent_id);
        }

        // Emit log
        self.log_collector.emit_log(
            agent_id,
            LogLevel::Info,
            format!(
                "Agent spawned with PID {} for task {} in {}",
                pid, config.task_id, config.worktree_path
            ),
        );

        // Give the process a moment to start (helps detect immediate failures)
        log::debug!("[AgentManager] Waiting 100ms for process to start...");
        std::thread::sleep(std::time::Duration::from_millis(100));

        // Quick check - see if process already exited
        log::debug!("[AgentManager] Checking if process exited immediately...");
        let process_exited_immediately = {
            let mut processes = lock_mutex_recover(&self.processes);
            if let Some(child) = processes.get_mut(agent_id) {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        let exit_code = status.code().unwrap_or(-1);
                        log::error!(
                            "[AgentManager] Process {} exited immediately with code {}",
                            pid,
                            exit_code
                        );
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
                self.log_collector.emit_log(
                    agent_id,
                    LogLevel::Error,
                    format!(
                        "Process exited with code {}. Error: {}",
                        exit_code,
                        stderr_content.trim()
                    ),
                );
            } else {
                self.log_collector.emit_log(agent_id, LogLevel::Error, format!(
                    "Process exited immediately with code {}. This usually means the CLI command failed. Check if claude CLI works: claude --version",
                    exit_code
                ));
            }
            // Process already exited, no point in spawning background readers
            return Ok(pid);
        }

        // Spawn background threads for stdout/stderr reading
        self.spawn_output_readers(agent_id, stdout, stderr, is_pty_mode, &config.task_id);

        Ok(pid)
    }

    /// Spawn background threads to read stdout and stderr
    fn spawn_output_readers(
        &self,
        agent_id: &str,
        stdout: Option<std::process::ChildStdout>,
        stderr: Option<std::process::ChildStderr>,
        is_pty_mode: bool,
        task_id: &str,
    ) {
        // Spawn background thread to read stdout
        if let Some(stdout) = stdout {
            let log_tx = self.log_collector.log_tx.clone();
            let subagent_tx = self.subagent_tx.clone();
            let tool_call_tx = self.log_collector.tool_call_tx.clone();
            let tool_call_complete_tx = self.log_collector.tool_call_complete_tx.clone();
            let agent_logs = self.log_collector.agent_logs.clone();
            let parsers = self.parsers.clone();
            let subagent_trees = self.subagent_trees.clone();
            let pty_history = if is_pty_mode {
                Some(self.pty_history.clone())
            } else {
                None
            };
            let pty_data_tx = if is_pty_mode {
                self.log_collector.pty_data_tx.clone()
            } else {
                None
            };
            let agent_id_clone = agent_id.to_string();
            log::debug!(
                "[AgentManager] Spawning stdout reader thread for agent {}, pty_data_tx.is_some: {}",
                agent_id,
                pty_data_tx.is_some()
            );
            thread::spawn(move || {
                log::debug!(
                    "[AgentManager] Stdout reader thread started for agent {}",
                    agent_id_clone
                );
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    match line {
                        Ok(line) => {
                            log::info!("[Agent {}] {}", agent_id_clone, line);

                            // Parse JSON output and extract readable text + tool call data
                            let parsed = parse_agent_json_output_with_tools(&line);
                            let display_text = parsed.display_text.clone();

                            // Emit tool call events
                            for tool_call in parsed.tool_calls {
                                if let Some(ref tx) = tool_call_tx {
                                    let _ = tx.send(ToolCallStartEvent {
                                        agent_id: agent_id_clone.clone(),
                                        tool_id: tool_call.tool_id,
                                        tool_name: tool_call.tool_name,
                                        input: tool_call.input,
                                        timestamp: Utc::now().to_rfc3339(),
                                    });
                                }
                            }

                            // Emit tool result events
                            for tool_result in parsed.tool_results {
                                if let Some(ref tx) = tool_call_complete_tx {
                                    let _ = tx.send(ToolCallCompleteEvent {
                                        agent_id: agent_id_clone.clone(),
                                        tool_id: tool_result.tool_id,
                                        output: Some(tool_result.output),
                                        is_error: tool_result.is_error,
                                        timestamp: Utc::now().to_rfc3339(),
                                    });
                                }
                            }

                            // Skip empty lines
                            if display_text.is_empty() {
                                continue;
                            }

                            // For PTY mode, also write to pty_history with newline
                            if let Some(ref pty_hist) = pty_history {
                                let text_with_newline = format!("{}\r\n", display_text);
                                let mut hist = lock_mutex_recover(pty_hist);
                                hist.entry(agent_id_clone.clone())
                                    .or_insert_with(|| RingBuffer::new(1024 * 1024))
                                    .write(text_with_newline.as_bytes());

                                // Also send via PTY data channel for real-time updates
                                if let Some(ref tx) = pty_data_tx {
                                    let _ = tx.send(AgentPtyDataEvent {
                                        agent_id: agent_id_clone.clone(),
                                        data: text_with_newline.as_bytes().to_vec(),
                                    });
                                }

                                // Parse for subagent events
                                {
                                    let mut parsers_guard = lock_mutex_recover(&parsers);
                                    let mut trees_guard = lock_mutex_recover(&subagent_trees);

                                    if !parsers_guard.contains_key(&agent_id_clone) {
                                        parsers_guard.insert(
                                            agent_id_clone.clone(),
                                            StreamingParser::new(&agent_id_clone),
                                        );
                                        trees_guard
                                            .insert(agent_id_clone.clone(), SubagentTree::new());
                                    }

                                    if let Some(parser) = parsers_guard.get_mut(&agent_id_clone) {
                                        let events = parser.parse_output(&display_text);
                                        if !events.is_empty() {
                                            let tree = trees_guard
                                                .entry(agent_id_clone.clone())
                                                .or_insert_with(SubagentTree::new);

                                            for event in events {
                                                tree.add_event(event.clone());

                                                if let Some(tx) = &subagent_tx {
                                                    let _ = tx.send(event);
                                                }
                                            }
                                        }
                                    }
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

                            // Send via channel if available
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
            let log_tx = self.log_collector.log_tx.clone();
            let rate_limit_tx = self.log_collector.rate_limit_tx.clone();
            let agent_logs = self.log_collector.agent_logs.clone();
            let pty_history = if is_pty_mode {
                Some(self.pty_history.clone())
            } else {
                None
            };
            let pty_data_tx = if is_pty_mode {
                self.log_collector.pty_data_tx.clone()
            } else {
                None
            };
            let rate_limit_detector = RateLimitDetector::new();
            let agent_id_clone = agent_id.to_string();
            log::debug!(
                "[AgentManager] Spawning stderr reader thread for agent {}",
                agent_id
            );
            thread::spawn(move || {
                log::debug!(
                    "[AgentManager] Stderr reader thread started for agent {}",
                    agent_id_clone
                );
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    match line {
                        Ok(line) => {
                            log::warn!("[Agent {}] stderr: {}", agent_id_clone, line);

                            // For PTY mode, also write to pty_history (stderr in red)
                            if let Some(ref pty_hist) = pty_history {
                                let line_with_color = format!("\x1b[31m{}\x1b[0m\r\n", line);
                                let mut hist = lock_mutex_recover(pty_hist);
                                hist.entry(agent_id_clone.clone())
                                    .or_insert_with(|| RingBuffer::new(1024 * 1024))
                                    .write(line_with_color.as_bytes());

                                if let Some(ref tx) = pty_data_tx {
                                    let _ = tx.send(AgentPtyDataEvent {
                                        agent_id: agent_id_clone.clone(),
                                        data: line_with_color.into_bytes(),
                                    });
                                }
                            }

                            // Check for rate limits
                            if let Some(info) = rate_limit_detector.detect_in_stderr(&line) {
                                log::warn!(
                                    "[Agent {}] Rate limit detected: {:?}",
                                    agent_id_clone,
                                    info
                                );
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

                            {
                                let mut logs = lock_mutex_recover(&agent_logs);
                                logs.entry(agent_id_clone.clone())
                                    .or_insert_with(Vec::new)
                                    .push(log_entry.clone());
                            }

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
            let completion_tx = self.log_collector.completion_tx.clone();
            let agent_logs = self.log_collector.agent_logs.clone();
            let agent_id_clone = agent_id.to_string();
            let task_id_clone = task_id.to_string();
            let log_tx = self.log_collector.log_tx.clone();

            // Create and store cancellation token
            let cancelled = Arc::new(AtomicBool::new(false));
            let monitor_cancellation = self.monitor_cancellation.clone();
            {
                let mut tokens = lock_mutex_recover(&self.monitor_cancellation);
                tokens.insert(agent_id.to_string(), cancelled.clone());
            }

            thread::spawn(move || {
                loop {
                    if cancelled.load(Ordering::Relaxed) {
                        log::debug!(
                            "[AgentManager] Monitor thread for agent {} cancelled",
                            agent_id_clone
                        );
                        break;
                    }

                    thread::sleep(std::time::Duration::from_millis(500));

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
                                    let exit_code = status.code();
                                    let success = exit_code == Some(0);

                                    log::info!(
                                        "[AgentManager] Process for agent {} exited with code {:?}",
                                        agent_id_clone,
                                        exit_code
                                    );

                                    processes_guard.remove(&agent_id_clone);

                                    if let Some(tx) = &completion_tx {
                                        let event = AgentCompletionEvent {
                                            agent_id: agent_id_clone.clone(),
                                            task_id: task_id_clone.clone(),
                                            success,
                                            exit_code,
                                            error: if success {
                                                None
                                            } else {
                                                Some(format!(
                                                    "Process exited with code {:?}",
                                                    exit_code
                                                ))
                                            },
                                        };
                                        let _ = tx.send(event);
                                    }

                                    let log_entry = LogEntry {
                                        timestamp: Utc::now(),
                                        level: if success {
                                            LogLevel::Info
                                        } else {
                                            LogLevel::Error
                                        },
                                        message: format!(
                                            "Agent process exited with code {:?}",
                                            exit_code
                                        ),
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

                                    true
                                }
                                Ok(None) => false,
                                Err(e) => {
                                    log::error!(
                                        "[AgentManager] Error checking process status for agent {}: {}",
                                        agent_id_clone,
                                        e
                                    );
                                    false
                                }
                            }
                        } else {
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
                log::debug!(
                    "[AgentManager] Process monitor for agent {} finished",
                    agent_id_clone
                );
            });
        }
    }

    /// Build the command to execute based on agent type
    fn build_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        match config.agent_type {
            AgentType::Claude => self.build_claude_command(config),
            AgentType::Opencode => self.build_opencode_command(config),
            AgentType::Cursor => self.build_cursor_command(config),
            AgentType::Codex => self.build_codex_command(config),
            AgentType::Qwen => self.build_qwen_command(config),
            AgentType::Droid => self.build_droid_command(config),
        }
    }

    fn build_claude_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        let claude_path = CliPathResolver::resolve_claude().ok_or_else(|| {
            anyhow!("Claude CLI not found. Install: npm install -g @anthropic-ai/claude-code")
        })?;

        log::info!("[AgentManager] Claude path: {:?}", claude_path);

        let mut cmd = Command::new(&claude_path);

        let worktree = Path::new(&config.worktree_path);
        if worktree.exists() {
            log::info!(
                "[AgentManager] Using worktree path: {}",
                config.worktree_path
            );
            cmd.current_dir(&config.worktree_path);
        } else {
            log::warn!(
                "[AgentManager] Worktree path doesn't exist: {}, using current directory",
                config.worktree_path
            );
        }

        let prompt = match &config.prompt {
            Some(prompt) if !prompt.trim().is_empty() => prompt.clone(),
            _ => {
                return Err(anyhow!(
                    "Claude requires a non-empty prompt. Task description is empty for task {}",
                    config.task_id
                ));
            }
        };

        cmd.arg("--print");
        cmd.arg("--output-format").arg("stream-json");
        cmd.arg("--verbose");
        cmd.arg("--dangerously-skip-permissions");

        if config.max_iterations > 0 {
            cmd.arg("--max-turns")
                .arg(config.max_iterations.to_string());
        }

        if let Some(model) = &config.model {
            cmd.arg("--model").arg(model);
        }

        cmd.arg(&prompt);

        Ok(cmd)
    }

    fn build_opencode_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        let opencode_path = CliPathResolver::resolve_opencode()
            .ok_or_else(|| anyhow!("OpenCode not found. Install from https://opencode.ai"))?;

        log::info!("[AgentManager] OpenCode path: {:?}", opencode_path);

        let mut cmd = Command::new(&opencode_path);

        let worktree = Path::new(&config.worktree_path);

        // Create opencode.json config in the working directory
        if worktree.exists() {
            let config_path = worktree.join("opencode.json");
            if !config_path.exists() {
                let config_content =
                    r#"{"$schema": "https://opencode.ai/config.json", "permission": "allow"}"#;
                if let Err(e) = std::fs::write(&config_path, config_content) {
                    log::warn!(
                        "[AgentManager] Failed to create opencode.json for permissions: {}",
                        e
                    );
                } else {
                    log::info!("[AgentManager] Created opencode.json with permission: allow");
                }
            } else {
                log::info!(
                    "[AgentManager] opencode.json already exists, using existing config"
                );
            }
        }

        if worktree.exists() {
            log::info!(
                "[AgentManager] Using worktree path: {}",
                config.worktree_path
            );
            cmd.current_dir(&config.worktree_path);
        } else {
            log::warn!(
                "[AgentManager] Worktree path doesn't exist: {}, using current directory",
                config.worktree_path
            );
        }

        cmd.arg("run");

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

        cmd.arg("--format").arg("json");
        cmd.arg("--print-logs");

        if let Some(model) = &config.model {
            cmd.arg("--model").arg(model);
        }

        Ok(cmd)
    }

    fn build_cursor_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        let cursor_path = CliPathResolver::resolve_cursor()
            .ok_or_else(|| anyhow!("Cursor agent not found. Ensure Cursor is installed."))?;

        log::info!("[AgentManager] Cursor path: {:?}", cursor_path);

        let mut cmd = Command::new(&cursor_path);

        let worktree = Path::new(&config.worktree_path);
        if worktree.exists() {
            cmd.current_dir(&config.worktree_path);
        }

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

        cmd.arg("--force");

        if let Some(model) = &config.model {
            cmd.arg("--model").arg(model);
        }

        Ok(cmd)
    }

    fn build_codex_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        let codex_path = CliPathResolver::resolve_codex()
            .ok_or_else(|| anyhow!("Codex CLI not found. Install from OpenAI."))?;

        log::info!("[AgentManager] Codex path: {:?}", codex_path);

        let mut cmd = Command::new(&codex_path);

        let worktree = Path::new(&config.worktree_path);
        if worktree.exists() {
            cmd.current_dir(&config.worktree_path);
        }

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

        if config.max_iterations > 0 {
            cmd.arg("--max-turns")
                .arg(config.max_iterations.to_string());
        }

        if let Some(model) = &config.model {
            cmd.arg("--model").arg(model);
        }

        Ok(cmd)
    }

    fn build_qwen_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        let qwen_path =
            CliPathResolver::resolve_qwen().ok_or_else(|| anyhow!("Qwen CLI not found."))?;

        log::info!("[AgentManager] Qwen path: {:?}", qwen_path);

        let mut cmd = Command::new(&qwen_path);

        let worktree = Path::new(&config.worktree_path);
        if worktree.exists() {
            cmd.current_dir(&config.worktree_path);
        }

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

        cmd.arg("--yolo");

        if let Some(model) = &config.model {
            cmd.arg("--model").arg(model);
        }

        Ok(cmd)
    }

    fn build_droid_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        let droid_path =
            CliPathResolver::resolve_droid().ok_or_else(|| anyhow!("Droid CLI not found."))?;

        log::info!("[AgentManager] Droid path: {:?}", droid_path);

        let mut cmd = Command::new(&droid_path);

        cmd.arg("exec");

        let worktree = Path::new(&config.worktree_path);
        if worktree.exists() {
            cmd.current_dir(&config.worktree_path);
        }

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

        cmd.arg("--auto").arg("medium");

        if let Some(model) = &config.model {
            cmd.arg("--model").arg(model);
        }

        Ok(cmd)
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
            child
                .kill()
                .map_err(|e| anyhow!("Failed to kill agent process: {}", e))?;

            self.log_collector
                .emit_log(agent_id, LogLevel::Info, "Agent stopped".to_string());
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
                self.log_collector.emit_log(
                    &agent_id,
                    LogLevel::Info,
                    "Agent stopped (shutdown)".to_string(),
                );
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
            let status = child
                .wait()
                .map_err(|e| anyhow!("Failed to wait for agent: {}", e))?;

            let exit_code = status.code().unwrap_or(-1);

            self.log_collector.emit_log(
                agent_id,
                if exit_code == 0 {
                    LogLevel::Info
                } else {
                    LogLevel::Error
                },
                format!("Agent exited with code {}", exit_code),
            );

            Ok(exit_code)
        } else {
            Err(anyhow!("Agent process not found: {}", agent_id))
        }
    }

    /// Wait for a child process with timeout (polling-based)
    pub fn wait_with_timeout(child: &mut Child, timeout_secs: u64) -> Result<Option<i32>> {
        let start = std::time::Instant::now();
        let timeout = std::time::Duration::from_secs(timeout_secs);
        let poll_interval = std::time::Duration::from_millis(100);

        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    return Ok(Some(status.code().unwrap_or(-1)));
                }
                Ok(None) => {
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
    pub fn take_child_process(&mut self, agent_id: &str) -> Option<std::process::Child> {
        // Cancel the monitor thread for this agent
        {
            let tokens = lock_mutex_recover(&self.monitor_cancellation);
            if let Some(cancelled) = tokens.get(agent_id) {
                cancelled.store(true, Ordering::Relaxed);
                log::debug!(
                    "[AgentManager] Cancelled monitor thread for agent {}",
                    agent_id
                );
            }
        }

        let mut processes = lock_mutex_recover(&self.processes);
        processes.remove(agent_id)
    }

    /// Emit a log event for agent exit (for use after take_child_process + wait)
    pub fn emit_agent_exit(&self, agent_id: &str, exit_code: i32) {
        self.log_collector.emit_log(
            agent_id,
            if exit_code == 0 {
                LogLevel::Info
            } else {
                LogLevel::Error
            },
            format!("Agent exited with code {}", exit_code),
        );
    }

    /// Parse stderr output and check for rate limits
    pub fn check_stderr_for_rate_limit(&self, stderr: &str) -> Option<RateLimitInfo> {
        self.rate_limit_detector.detect_in_stderr(stderr)
    }

    /// Process a chunk of stderr output for an agent
    pub fn process_stderr_chunk(
        &self,
        agent_id: &str,
        stderr_chunk: &str,
    ) -> Option<RateLimitInfo> {
        if let Some(info) = self.rate_limit_detector.detect_in_stderr(stderr_chunk) {
            self.log_collector.emit_rate_limit(agent_id, info.clone());
            Some(info)
        } else {
            None
        }
    }

    /// Wait for an agent process to complete while monitoring stderr for rate limits
    pub fn wait_for_agent_with_rate_limit_check(
        &mut self,
        agent_id: &str,
    ) -> Result<(i32, Option<RateLimitInfo>)> {
        let mut processes = lock_mutex_recover(&self.processes);

        if let Some(mut child) = processes.remove(agent_id) {
            let mut rate_limit_info = None;

            if let Some(stderr) = child.stderr.take() {
                let reader = BufReader::new(stderr);
                let mut _stderr_buffer = String::new();

                for line in reader.lines() {
                    if let Ok(line) = line {
                        _stderr_buffer.push_str(&line);
                        _stderr_buffer.push('\n');

                        if let Some(info) = self.rate_limit_detector.detect_in_stderr(&line) {
                            rate_limit_info = Some(info.clone());
                            self.log_collector.emit_rate_limit(agent_id, info);
                        }
                    }
                }
            }

            let status = child
                .wait()
                .map_err(|e| anyhow!("Failed to wait for agent: {}", e))?;

            let exit_code = status.code().unwrap_or(-1);

            self.log_collector.emit_log(
                agent_id,
                if exit_code == 0 {
                    LogLevel::Info
                } else {
                    LogLevel::Error
                },
                format!("Agent exited with code {}", exit_code),
            );

            Ok((exit_code, rate_limit_info))
        } else {
            Err(anyhow!("Agent process not found: {}", agent_id))
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
            plugin_config: None,
        };

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
            plugin_config: None,
        };

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
            plugin_config: None,
        };

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
            plugin_config: None,
        };

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
            plugin_config: None,
        };

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
            plugin_config: None,
        };

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
        assert!(manager.log_collector.log_tx.is_some());
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
        assert!(manager.log_collector.rate_limit_tx.is_some());
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

        let result = manager.process_stderr_chunk("agent-1", "rate limit exceeded");
        assert!(result.is_some());

        let result = manager.process_stderr_chunk("agent-1", "task completed");
        assert!(result.is_none());
    }
}
