//! Chat agent executor with broadcast-based event emission
//!
//! This module provides the implementation for executing chat agents
//! with streaming output via WebSocket broadcast.

use crate::models::AgentType;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

/// Default timeout for agent execution (25 minutes)
pub const AGENT_TIMEOUT_SECS: u64 = 1500;

/// Trait for emitting chat streaming events
pub trait ChatEventEmitter: Send + Sync {
    /// Emit a chat chunk event with the given session ID and content
    fn emit_chunk(&self, session_id: &str, content: &str);
}

/// Broadcast-based event emitter for WebSocket clients
pub struct BroadcastEmitter {
    broadcaster: std::sync::Arc<crate::server::EventBroadcaster>,
}

impl BroadcastEmitter {
    pub fn new(broadcaster: std::sync::Arc<crate::server::EventBroadcaster>) -> Self {
        Self { broadcaster }
    }
}

impl ChatEventEmitter for BroadcastEmitter {
    fn emit_chunk(&self, session_id: &str, content: &str) {
        self.broadcaster.broadcast(
            "prd:chat_chunk",
            serde_json::json!({
                "sessionId": session_id,
                "content": content,
            }),
        );
    }
}

/// Build command line arguments for the specified agent type
pub fn build_agent_command(agent_type: AgentType, prompt: &str) -> (&'static str, Vec<String>) {
    match agent_type {
        AgentType::Claude => (
            "claude",
            vec![
                "-p".to_string(),
                "--dangerously-skip-permissions".to_string(),
                prompt.to_string(),
            ],
        ),
        AgentType::Opencode => ("opencode", vec!["run".to_string(), prompt.to_string()]),
        AgentType::Cursor => (
            "cursor-agent",
            vec!["--prompt".to_string(), prompt.to_string()],
        ),
        AgentType::Codex => ("codex", vec!["--prompt".to_string(), prompt.to_string()]),
        AgentType::Qwen => ("qwen", vec!["--prompt".to_string(), prompt.to_string()]),
        AgentType::Droid => (
            "droid",
            vec![
                "chat".to_string(),
                "--prompt".to_string(),
                prompt.to_string(),
            ],
        ),
    }
}

/// Execute a chat agent with streaming output
///
/// The `emitter` parameter abstracts the event emission mechanism.
pub async fn execute_chat_agent<E: ChatEventEmitter>(
    emitter: &E,
    session_id: &str,
    agent_type: AgentType,
    prompt: &str,
    working_dir: Option<&str>,
) -> Result<String, String> {
    let (program, args) = build_agent_command(agent_type, prompt);

    let mut cmd = Command::new(program);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(dir) = working_dir {
        cmd.current_dir(dir);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn {}: {}", program, e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;

    let mut reader = BufReader::new(stdout).lines();
    let mut accumulated = String::new();

    // Stream lines with overall timeout
    let stream_result = timeout(Duration::from_secs(AGENT_TIMEOUT_SECS), async {
        while let Some(line) = reader
            .next_line()
            .await
            .map_err(|e| format!("Read error: {}", e))?
        {
            if !accumulated.is_empty() {
                accumulated.push('\n');
            }
            accumulated.push_str(&line);

            // Emit streaming chunk via the abstracted emitter
            emitter.emit_chunk(session_id, &line);
        }
        Ok::<(), String>(())
    })
    .await;

    // Handle streaming timeout
    if stream_result.is_err() {
        let _ = child.kill().await;
        return Err(format!(
            "Agent timed out after {} seconds. The process may have hung or be unresponsive.",
            AGENT_TIMEOUT_SECS
        ));
    }

    // Check for streaming errors
    stream_result.unwrap()?;

    // Wait for process to complete and check exit status
    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for process: {}", e))?;

    if !status.success() {
        // Check for common interrupt signals
        if let Some(code) = status.code() {
            if code == 130 || code == 137 || code == 143 {
                return Err("Agent process was interrupted (SIGINT/SIGTERM)".to_string());
            }
        }
        // If we got some output before failure, return it
        if !accumulated.is_empty() {
            return Ok(accumulated.trim().to_string());
        }
        return Err(format!(
            "Agent returned error (exit code: {:?})",
            status.code()
        ));
    }

    Ok(accumulated.trim().to_string())
}

/// Generate a session title from the first user message and PRD type
pub fn generate_session_title(first_message: &str, prd_type: Option<&str>) -> String {
    let message_title = first_message
        .lines()
        .next()
        .unwrap_or(first_message)
        .trim();

    // Truncate to 50 characters and add ellipsis if needed
    let truncated = if message_title.len() > 50 {
        format!("{}...", &message_title[..47])
    } else {
        message_title.to_string()
    };

    // If too short, use PRD type as fallback
    if truncated.len() < 5 {
        match prd_type {
            Some("new_feature") => "New Feature PRD".to_string(),
            Some("bug_fix") => "Bug Fix PRD".to_string(),
            Some("refactoring") => "Refactoring PRD".to_string(),
            Some("api_integration") => "API Integration PRD".to_string(),
            Some("full_new_app") => "New App PRD".to_string(),
            _ => "PRD Chat".to_string(),
        }
    } else {
        truncated
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_agent_command_claude() {
        let (program, args) = build_agent_command(AgentType::Claude, "test prompt");
        assert_eq!(program, "claude");
        assert_eq!(args[0], "-p");
        assert_eq!(args[1], "--dangerously-skip-permissions");
        assert_eq!(args[2], "test prompt");
    }

    #[test]
    fn test_build_agent_command_opencode() {
        let (program, args) = build_agent_command(AgentType::Opencode, "test prompt");
        assert_eq!(program, "opencode");
        assert_eq!(args[0], "run");
        assert_eq!(args[1], "test prompt");
    }

    #[test]
    fn test_build_agent_command_droid() {
        let (program, args) = build_agent_command(AgentType::Droid, "test prompt");
        assert_eq!(program, "droid");
        assert_eq!(args[0], "chat");
        assert_eq!(args[1], "--prompt");
        assert_eq!(args[2], "test prompt");
    }

    #[test]
    fn test_generate_session_title_short() {
        // Less than 5 characters should fall back to PRD type
        let title = generate_session_title("Hi", None);
        assert_eq!(title, "PRD Chat");
    }

    #[test]
    fn test_generate_session_title_normal() {
        let title = generate_session_title("A reasonably sized title for testing", None);
        assert_eq!(title, "A reasonably sized title for testing");
    }

    #[test]
    fn test_generate_session_title_long() {
        let title = generate_session_title(
            "This is a very long title that should be truncated because it exceeds fifty characters",
            None,
        );
        assert!(title.len() <= 50);
        assert!(title.ends_with("..."));
    }

    #[test]
    fn test_generate_session_title_with_prd_type() {
        let title = generate_session_title("Hi", Some("new_feature"));
        assert_eq!(title, "New Feature PRD");
    }

    #[test]
    fn test_generate_session_title_multiline() {
        let title = generate_session_title("First line\nSecond line\nThird line", None);
        assert_eq!(title, "First line");
    }
}
