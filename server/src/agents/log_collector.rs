// Agent log collection and management
//
// Handles storage, retrieval, and emission of agent logs.
// Logs are stored in memory and can be streamed via channels.

use crate::agents::rate_limiter::RateLimitInfo;
use crate::models::{LogEntry, LogLevel};
use crate::utils::lock_mutex_recover;
use chrono::Utc;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;

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

/// Event emitted when a tool call starts
#[derive(Debug, Clone)]
pub struct ToolCallStartEvent {
    pub agent_id: String,
    pub tool_id: String,
    pub tool_name: String,
    pub input: Option<serde_json::Value>,
    pub timestamp: String,
}

/// Event emitted when a tool call completes
#[derive(Debug, Clone)]
pub struct ToolCallCompleteEvent {
    pub agent_id: String,
    pub tool_id: String,
    pub output: Option<String>,
    pub is_error: bool,
    pub timestamp: String,
}

/// Log collector manages agent log storage and event emission
pub struct LogCollector {
    /// In-memory log storage for each agent
    pub(crate) agent_logs: Arc<Mutex<HashMap<String, Vec<LogEntry>>>>,
    /// Event sender for agent logs
    pub(crate) log_tx: Option<mpsc::UnboundedSender<AgentLogEvent>>,
    /// Event sender for rate limit events
    pub(crate) rate_limit_tx: Option<mpsc::UnboundedSender<RateLimitEvent>>,
    /// Event sender for agent completion events
    pub(crate) completion_tx: Option<mpsc::UnboundedSender<AgentCompletionEvent>>,
    /// Event sender for PTY data events
    pub(crate) pty_data_tx: Option<mpsc::UnboundedSender<AgentPtyDataEvent>>,
    /// Event sender for PTY exit events
    pub(crate) pty_exit_tx: Option<mpsc::UnboundedSender<AgentPtyExitEvent>>,
    /// Event sender for tool call events
    pub(crate) tool_call_tx: Option<mpsc::UnboundedSender<ToolCallStartEvent>>,
    /// Event sender for tool call completion events
    pub(crate) tool_call_complete_tx: Option<mpsc::UnboundedSender<ToolCallCompleteEvent>>,
}

impl LogCollector {
    pub fn new() -> Self {
        Self {
            agent_logs: Arc::new(Mutex::new(HashMap::new())),
            log_tx: None,
            rate_limit_tx: None,
            completion_tx: None,
            pty_data_tx: None,
            pty_exit_tx: None,
            tool_call_tx: None,
            tool_call_complete_tx: None,
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

    /// Set the tool call start event sender
    pub fn set_tool_call_sender(&mut self, tx: mpsc::UnboundedSender<ToolCallStartEvent>) {
        self.tool_call_tx = Some(tx);
    }

    /// Set the tool call complete event sender
    pub fn set_tool_call_complete_sender(
        &mut self,
        tx: mpsc::UnboundedSender<ToolCallCompleteEvent>,
    ) {
        self.tool_call_complete_tx = Some(tx);
    }

    /// Emit a log event
    pub fn emit_log(&self, agent_id: &str, level: LogLevel, message: String) {
        let log_entry = LogEntry {
            timestamp: Utc::now(),
            level,
            message,
        };

        // Store in memory for later retrieval
        {
            let mut logs = lock_mutex_recover(&self.agent_logs);
            logs.entry(agent_id.to_string())
                .or_default()
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

    /// Emit a rate limit event
    pub fn emit_rate_limit(&self, agent_id: &str, info: RateLimitInfo) {
        if let Some(tx) = &self.rate_limit_tx {
            let event = RateLimitEvent {
                agent_id: agent_id.to_string(),
                rate_limit_info: info.clone(),
            };
            let _ = tx.send(event); // Best effort
        }

        // Also emit as a warning log
        let retry_msg = info
            .retry_after_ms
            .map(|ms| format!(", retry after {}ms", ms))
            .unwrap_or_default();

        self.emit_log(
            agent_id,
            LogLevel::Warn,
            format!(
                "Rate limit detected: {:?}{}",
                info.limit_type
                    .unwrap_or(crate::agents::rate_limiter::RateLimitType::RateLimit),
                retry_msg
            ),
        );
    }

    /// Emit an agent completion event
    pub fn emit_completion(
        &self,
        agent_id: &str,
        task_id: &str,
        success: bool,
        exit_code: Option<i32>,
        error: Option<String>,
    ) {
        if let Some(tx) = &self.completion_tx {
            let event = AgentCompletionEvent {
                agent_id: agent_id.to_string(),
                task_id: task_id.to_string(),
                success,
                exit_code,
                error,
            };
            let _ = tx.send(event);
        }
    }

    /// Emit PTY data event
    pub fn emit_pty_data(&self, agent_id: &str, data: Vec<u8>) {
        if let Some(tx) = &self.pty_data_tx {
            let event = AgentPtyDataEvent {
                agent_id: agent_id.to_string(),
                data,
            };
            let _ = tx.send(event);
        }
    }

    /// Emit PTY exit event
    pub fn emit_pty_exit(&self, agent_id: &str, exit_code: i32) {
        if let Some(tx) = &self.pty_exit_tx {
            let event = AgentPtyExitEvent {
                agent_id: agent_id.to_string(),
                exit_code,
            };
            let _ = tx.send(event);
        }
    }

    /// Emit tool call start event
    pub fn emit_tool_call_start(
        &self,
        agent_id: &str,
        tool_id: String,
        tool_name: String,
        input: Option<serde_json::Value>,
    ) {
        if let Some(tx) = &self.tool_call_tx {
            let event = ToolCallStartEvent {
                agent_id: agent_id.to_string(),
                tool_id,
                tool_name,
                input,
                timestamp: Utc::now().to_rfc3339(),
            };
            let _ = tx.send(event);
        }
    }

    /// Emit tool call complete event
    pub fn emit_tool_call_complete(
        &self,
        agent_id: &str,
        tool_id: String,
        output: Option<String>,
        is_error: bool,
    ) {
        if let Some(tx) = &self.tool_call_complete_tx {
            let event = ToolCallCompleteEvent {
                agent_id: agent_id.to_string(),
                tool_id,
                output,
                is_error,
                timestamp: Utc::now().to_rfc3339(),
            };
            let _ = tx.send(event);
        }
    }

    /// Get a clone of the agent logs Arc for use in background threads
    pub fn get_logs_arc(&self) -> Arc<Mutex<HashMap<String, Vec<LogEntry>>>> {
        self.agent_logs.clone()
    }
}

impl Default for LogCollector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_log_collector_creation() {
        let collector = LogCollector::new();
        assert!(collector.get_agent_logs("test").is_empty());
    }

    #[test]
    fn test_emit_and_retrieve_logs() {
        let collector = LogCollector::new();

        collector.emit_log("agent1", LogLevel::Info, "Test message".to_string());

        let logs = collector.get_agent_logs("agent1");
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].message, "Test message");
    }

    #[test]
    fn test_clear_logs() {
        let collector = LogCollector::new();

        collector.emit_log("agent1", LogLevel::Info, "Test message".to_string());
        assert!(!collector.get_agent_logs("agent1").is_empty());

        collector.clear_agent_logs("agent1");
        assert!(collector.get_agent_logs("agent1").is_empty());
    }

    #[test]
    fn test_log_sender() {
        let mut collector = LogCollector::new();
        let (tx, mut rx) = mpsc::unbounded_channel();

        collector.set_log_sender(tx);
        collector.emit_log("agent1", LogLevel::Info, "Test message".to_string());

        // Check that event was sent
        let event = rx.try_recv().unwrap();
        assert_eq!(event.agent_id, "agent1");
        assert_eq!(event.log.message, "Test message");
    }

    #[test]
    fn test_multiple_agents() {
        let collector = LogCollector::new();

        collector.emit_log("agent1", LogLevel::Info, "Message 1".to_string());
        collector.emit_log("agent2", LogLevel::Info, "Message 2".to_string());
        collector.emit_log("agent1", LogLevel::Warn, "Message 3".to_string());

        let logs1 = collector.get_agent_logs("agent1");
        let logs2 = collector.get_agent_logs("agent2");

        assert_eq!(logs1.len(), 2);
        assert_eq!(logs2.len(), 1);
    }
}
