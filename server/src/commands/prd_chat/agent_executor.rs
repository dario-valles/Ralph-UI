//! Chat agent executor with broadcast-based event emission
//!
//! This module provides the implementation for executing chat agents
//! with streaming output via WebSocket broadcast.

use crate::events::{
    ToolCallCompletedPayload, ToolCallStartedPayload, EVENT_TOOL_CALL_COMPLETED,
    EVENT_TOOL_CALL_STARTED,
};
use crate::models::AgentType;
use regex::Regex;
use std::process::Stdio;
use std::sync::LazyLock;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::{timeout, Duration};

/// Default timeout for agent execution (25 minutes)
pub const AGENT_TIMEOUT_SECS: u64 = 1500;

/// Regex pattern to detect tool usage start (e.g., "⚡ Using Read")
static TOOL_START_RE: LazyLock<Regex> = LazyLock::new(|| {
    // Match various tool start patterns from Claude Code CLI
    // Common patterns: "⚡ Using Read", "Using Read", "● Using Bash"
    Regex::new(r"(?:⚡|●|▶|>)\s*Using\s+(\w+)").unwrap()
});

/// Regex pattern to detect tool result (e.g., "✓ Tool Result", "✗ Tool Result")
static TOOL_RESULT_RE: LazyLock<Regex> = LazyLock::new(|| {
    // Match tool result patterns
    Regex::new(r"[✓✗]\s*(?:Tool\s+)?(?:Result|Completed|Done|Error)").unwrap()
});

/// State for tracking active tool calls during streaming
struct ToolCallState {
    tool_id: String,
    tool_name: String,
    started_at: std::time::Instant,
    input_lines: Vec<String>,
}

/// Trait for emitting chat streaming events
pub trait ChatEventEmitter: Send + Sync {
    /// Emit a chat chunk event with the given session ID and content
    fn emit_chunk(&self, session_id: &str, content: &str);

    /// Emit a tool call started event
    fn emit_tool_started(&self, payload: ToolCallStartedPayload);

    /// Emit a tool call completed event
    fn emit_tool_completed(&self, payload: ToolCallCompletedPayload);
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

    fn emit_tool_started(&self, payload: ToolCallStartedPayload) {
        self.broadcaster.broadcast(EVENT_TOOL_CALL_STARTED, payload);
    }

    fn emit_tool_completed(&self, payload: ToolCallCompletedPayload) {
        self.broadcaster.broadcast(EVENT_TOOL_CALL_COMPLETED, payload);
    }
}

/// Build command line arguments for the specified agent type
///
/// If `external_session_id` is provided, uses the agent's native session resumption
/// feature to continue an existing conversation without resending full history.
///
/// Session resumption support by agent:
/// - Claude: `--resume session-id`
/// - Cursor: `--resume="chat-id"`
/// - Codex: `codex resume <SESSION_ID>` (subcommand changes)
/// - Qwen: `--continue` (uses implicit continuation, no ID needed)
/// - OpenCode: `--session [id]`
/// - Droid: `--session-id <id>`
pub fn build_agent_command(
    agent_type: AgentType,
    prompt: &str,
    external_session_id: Option<&str>,
) -> (&'static str, Vec<String>) {
    match agent_type {
        AgentType::Claude => {
            let mut args = vec![
                "-p".to_string(),
                "--dangerously-skip-permissions".to_string(),
            ];
            if let Some(sid) = external_session_id {
                args.push("--resume".to_string());
                args.push(sid.to_string());
            }
            args.push(prompt.to_string());
            ("claude", args)
        }
        AgentType::Opencode => {
            let mut args = vec!["run".to_string()];
            if let Some(sid) = external_session_id {
                args.push("--session".to_string());
                args.push(sid.to_string());
            }
            args.push(prompt.to_string());
            ("opencode", args)
        }
        AgentType::Cursor => {
            let mut args = vec![];
            if let Some(sid) = external_session_id {
                args.push(format!("--resume={}", sid));
            }
            args.push("--prompt".to_string());
            args.push(prompt.to_string());
            ("cursor-agent", args)
        }
        AgentType::Codex => {
            if let Some(sid) = external_session_id {
                // Codex uses a different subcommand for resume
                ("codex", vec![
                    "resume".to_string(),
                    sid.to_string(),
                    prompt.to_string(),
                ])
            } else {
                ("codex", vec!["--prompt".to_string(), prompt.to_string()])
            }
        }
        AgentType::Qwen => {
            let mut args = vec![];
            // Qwen uses --continue for session continuation (no explicit ID needed)
            if external_session_id.is_some() {
                args.push("--continue".to_string());
            }
            args.push("--prompt".to_string());
            args.push(prompt.to_string());
            ("qwen", args)
        }
        AgentType::Droid => {
            let mut args = vec!["chat".to_string()];
            if let Some(sid) = external_session_id {
                args.push("--session-id".to_string());
                args.push(sid.to_string());
            }
            args.push("--prompt".to_string());
            args.push(prompt.to_string());
            ("droid", args)
        }
    }
}

/// Result of chat agent execution including the response and any captured session ID
#[derive(Debug, Clone)]
pub struct ChatAgentResult {
    /// The response content from the agent
    pub content: String,
    /// Session ID captured from the agent's output (for session resumption)
    pub captured_session_id: Option<String>,
}

/// Execute a chat agent with streaming output
///
/// The `emitter` parameter abstracts the event emission mechanism.
/// If `external_session_id` is provided, the agent will resume an existing session.
/// Returns the response content and any newly captured session ID.
pub async fn execute_chat_agent<E: ChatEventEmitter>(
    emitter: &E,
    session_id: &str,
    agent_type: AgentType,
    prompt: &str,
    working_dir: Option<&str>,
    external_session_id: Option<&str>,
) -> Result<ChatAgentResult, String> {
    let (program, args) = build_agent_command(agent_type, prompt, external_session_id);

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

    // Track active tool call for emitting events
    let mut active_tool: Option<ToolCallState> = None;
    let mut tool_counter: u32 = 0;

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

            // Parse tool usage patterns from the line
            parse_and_emit_tool_events(
                emitter,
                session_id,
                &line,
                &mut active_tool,
                &mut tool_counter,
            );

            // Emit streaming chunk via the abstracted emitter
            emitter.emit_chunk(session_id, &line);
        }

        // If there's still an active tool when streaming ends, complete it
        if let Some(tool_state) = active_tool.take() {
            let duration_ms = tool_state.started_at.elapsed().as_millis() as u64;
            emitter.emit_tool_completed(ToolCallCompletedPayload {
                agent_id: session_id.to_string(),
                tool_id: tool_state.tool_id,
                output: if tool_state.input_lines.is_empty() {
                    None
                } else {
                    Some(tool_state.input_lines.join("\n"))
                },
                duration_ms: Some(duration_ms),
                timestamp: chrono::Utc::now().to_rfc3339(),
                is_error: false,
            });
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
        // If we got some output before failure, return it with any captured session ID
        if !accumulated.is_empty() {
            let content = accumulated.trim().to_string();
            let captured_session_id = parse_session_id_from_output(agent_type, &content);
            return Ok(ChatAgentResult {
                content,
                captured_session_id,
            });
        }
        return Err(format!(
            "Agent returned error (exit code: {:?})",
            status.code()
        ));
    }

    let content = accumulated.trim().to_string();
    // Only try to capture session ID if we don't already have one (first message)
    let captured_session_id = if external_session_id.is_none() {
        parse_session_id_from_output(agent_type, &content)
    } else {
        None
    };

    Ok(ChatAgentResult {
        content,
        captured_session_id,
    })
}

/// Parse a line for tool usage patterns and emit events
///
/// Detects tool start patterns like "⚡ Using Read" and tool result patterns
/// like "✓ Tool Result", emitting appropriate events.
fn parse_and_emit_tool_events<E: ChatEventEmitter>(
    emitter: &E,
    session_id: &str,
    line: &str,
    active_tool: &mut Option<ToolCallState>,
    tool_counter: &mut u32,
) {
    // Check for tool start pattern
    if let Some(caps) = TOOL_START_RE.captures(line) {
        // First, complete any existing active tool
        if let Some(prev_tool) = active_tool.take() {
            let duration_ms = prev_tool.started_at.elapsed().as_millis() as u64;
            emitter.emit_tool_completed(ToolCallCompletedPayload {
                agent_id: session_id.to_string(),
                tool_id: prev_tool.tool_id,
                output: if prev_tool.input_lines.is_empty() {
                    None
                } else {
                    Some(prev_tool.input_lines.join("\n"))
                },
                duration_ms: Some(duration_ms),
                timestamp: chrono::Utc::now().to_rfc3339(),
                is_error: false,
            });
        }

        // Start a new tool call
        *tool_counter += 1;
        let tool_name = caps
            .get(1)
            .map(|m: regex::Match| m.as_str())
            .unwrap_or("Unknown");
        let tool_id = format!("tool_{}_{}", session_id, tool_counter);

        emitter.emit_tool_started(ToolCallStartedPayload {
            agent_id: session_id.to_string(),
            tool_id: tool_id.clone(),
            tool_name: tool_name.to_string(),
            input: None, // Will be populated from subsequent lines
            timestamp: chrono::Utc::now().to_rfc3339(),
        });

        *active_tool = Some(ToolCallState {
            tool_id,
            tool_name: tool_name.to_string(),
            started_at: std::time::Instant::now(),
            input_lines: Vec::new(),
        });
    }
    // Check for tool result pattern (completes the active tool)
    else if TOOL_RESULT_RE.is_match(line) {
        if let Some(tool_state) = active_tool.take() {
            let duration_ms = tool_state.started_at.elapsed().as_millis() as u64;
            let is_error = line.contains('✗');

            emitter.emit_tool_completed(ToolCallCompletedPayload {
                agent_id: session_id.to_string(),
                tool_id: tool_state.tool_id,
                output: if tool_state.input_lines.is_empty() {
                    None
                } else {
                    // Truncate output if too long
                    let output = tool_state.input_lines.join("\n");
                    Some(if output.len() > 5000 {
                        format!("{}... (truncated)", &output[..5000])
                    } else {
                        output
                    })
                },
                duration_ms: Some(duration_ms),
                timestamp: chrono::Utc::now().to_rfc3339(),
                is_error,
            });
        }
    }
    // If we have an active tool, accumulate lines as potential output
    else if let Some(ref mut tool_state) = active_tool {
        // Only accumulate non-empty lines that aren't just whitespace
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            tool_state.input_lines.push(line.to_string());
        }
    }
}

/// Parse session ID from agent output based on agent type
///
/// Different agents output their session IDs in different formats:
/// - Claude: Outputs session ID in startup messages or can be inferred
/// - Cursor: May output chat ID in response
/// - Codex: Outputs session ID in header
/// - OpenCode: Outputs session ID
/// - Droid: Outputs session ID
fn parse_session_id_from_output(agent_type: AgentType, output: &str) -> Option<String> {
    use regex::Regex;

    match agent_type {
        AgentType::Claude => {
            // Claude Code outputs session ID in format: "Session: <uuid>" or similar
            // It may also show in the format "Resuming session <uuid>"
            // Look for UUID patterns following "session" keyword
            let re = Regex::new(r"(?i)(?:session[:\s]+|resuming\s+session\s+)([a-f0-9-]{36})").ok()?;
            re.captures(output)
                .and_then(|caps| caps.get(1))
                .map(|m| m.as_str().to_string())
        }
        AgentType::Cursor => {
            // Cursor agent may output chat ID
            let re = Regex::new(r"(?i)(?:chat[:\s-]+id[:\s]+|chat[:\s]+)([a-zA-Z0-9_-]+)").ok()?;
            re.captures(output)
                .and_then(|caps| caps.get(1))
                .map(|m| m.as_str().to_string())
        }
        AgentType::Codex => {
            // Codex outputs session ID
            let re = Regex::new(r"(?i)session[:\s]+([a-zA-Z0-9_-]+)").ok()?;
            re.captures(output)
                .and_then(|caps| caps.get(1))
                .map(|m| m.as_str().to_string())
        }
        AgentType::Qwen => {
            // Qwen uses implicit continuation, doesn't need explicit session ID
            // Return a placeholder to indicate session continuation is active
            if output.len() > 10 {
                Some("qwen-continuation".to_string())
            } else {
                None
            }
        }
        AgentType::Opencode => {
            // OpenCode outputs session ID
            let re = Regex::new(r"(?i)session[:\s]+([a-zA-Z0-9_-]+)").ok()?;
            re.captures(output)
                .and_then(|caps| caps.get(1))
                .map(|m| m.as_str().to_string())
        }
        AgentType::Droid => {
            // Droid outputs session ID
            let re = Regex::new(r"(?i)session[:\s-]+(?:id[:\s]+)?([a-zA-Z0-9_-]+)").ok()?;
            re.captures(output)
                .and_then(|caps| caps.get(1))
                .map(|m| m.as_str().to_string())
        }
    }
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
        let (program, args) = build_agent_command(AgentType::Claude, "test prompt", None);
        assert_eq!(program, "claude");
        assert_eq!(args[0], "-p");
        assert_eq!(args[1], "--dangerously-skip-permissions");
        assert_eq!(args[2], "test prompt");
    }

    #[test]
    fn test_build_agent_command_claude_with_resume() {
        let (program, args) = build_agent_command(AgentType::Claude, "test prompt", Some("session-123"));
        assert_eq!(program, "claude");
        assert_eq!(args[0], "-p");
        assert_eq!(args[1], "--dangerously-skip-permissions");
        assert_eq!(args[2], "--resume");
        assert_eq!(args[3], "session-123");
        assert_eq!(args[4], "test prompt");
    }

    #[test]
    fn test_build_agent_command_opencode() {
        let (program, args) = build_agent_command(AgentType::Opencode, "test prompt", None);
        assert_eq!(program, "opencode");
        assert_eq!(args[0], "run");
        assert_eq!(args[1], "test prompt");
    }

    #[test]
    fn test_build_agent_command_opencode_with_resume() {
        let (program, args) = build_agent_command(AgentType::Opencode, "test prompt", Some("session-456"));
        assert_eq!(program, "opencode");
        assert_eq!(args[0], "run");
        assert_eq!(args[1], "--session");
        assert_eq!(args[2], "session-456");
        assert_eq!(args[3], "test prompt");
    }

    #[test]
    fn test_build_agent_command_droid() {
        let (program, args) = build_agent_command(AgentType::Droid, "test prompt", None);
        assert_eq!(program, "droid");
        assert_eq!(args[0], "chat");
        assert_eq!(args[1], "--prompt");
        assert_eq!(args[2], "test prompt");
    }

    #[test]
    fn test_build_agent_command_droid_with_resume() {
        let (program, args) = build_agent_command(AgentType::Droid, "test prompt", Some("droid-session"));
        assert_eq!(program, "droid");
        assert_eq!(args[0], "chat");
        assert_eq!(args[1], "--session-id");
        assert_eq!(args[2], "droid-session");
        assert_eq!(args[3], "--prompt");
        assert_eq!(args[4], "test prompt");
    }

    #[test]
    fn test_build_agent_command_cursor_with_resume() {
        let (program, args) = build_agent_command(AgentType::Cursor, "test prompt", Some("chat-789"));
        assert_eq!(program, "cursor-agent");
        assert_eq!(args[0], "--resume=chat-789");
        assert_eq!(args[1], "--prompt");
        assert_eq!(args[2], "test prompt");
    }

    #[test]
    fn test_build_agent_command_codex_with_resume() {
        let (program, args) = build_agent_command(AgentType::Codex, "test prompt", Some("codex-session"));
        assert_eq!(program, "codex");
        assert_eq!(args[0], "resume");
        assert_eq!(args[1], "codex-session");
        assert_eq!(args[2], "test prompt");
    }

    #[test]
    fn test_build_agent_command_qwen_with_resume() {
        let (program, args) = build_agent_command(AgentType::Qwen, "test prompt", Some("any-id"));
        assert_eq!(program, "qwen");
        assert_eq!(args[0], "--continue");
        assert_eq!(args[1], "--prompt");
        assert_eq!(args[2], "test prompt");
    }

    #[test]
    fn test_parse_session_id_claude() {
        let output = "Starting new session\nSession: a1b2c3d4-e5f6-7890-abcd-ef1234567890\nHello!";
        let session_id = parse_session_id_from_output(AgentType::Claude, output);
        assert_eq!(session_id, Some("a1b2c3d4-e5f6-7890-abcd-ef1234567890".to_string()));
    }

    #[test]
    fn test_parse_session_id_qwen() {
        let output = "This is a response from Qwen with some content.";
        let session_id = parse_session_id_from_output(AgentType::Qwen, output);
        assert_eq!(session_id, Some("qwen-continuation".to_string()));
    }

    #[test]
    fn test_parse_session_id_not_found() {
        let output = "Hello! How can I help you today?";
        let session_id = parse_session_id_from_output(AgentType::Claude, output);
        assert!(session_id.is_none());
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

    // Tool parsing pattern tests
    #[test]
    fn test_tool_start_pattern_flash() {
        let line = "⚡ Using Read";
        let caps = TOOL_START_RE.captures(line);
        assert!(caps.is_some());
        assert_eq!(caps.unwrap().get(1).unwrap().as_str(), "Read");
    }

    #[test]
    fn test_tool_start_pattern_bullet() {
        let line = "● Using Bash";
        let caps = TOOL_START_RE.captures(line);
        assert!(caps.is_some());
        assert_eq!(caps.unwrap().get(1).unwrap().as_str(), "Bash");
    }

    #[test]
    fn test_tool_start_pattern_arrow() {
        let line = "▶ Using Write";
        let caps = TOOL_START_RE.captures(line);
        assert!(caps.is_some());
        assert_eq!(caps.unwrap().get(1).unwrap().as_str(), "Write");
    }

    #[test]
    fn test_tool_result_pattern_success() {
        let line = "✓ Tool Result";
        assert!(TOOL_RESULT_RE.is_match(line));
    }

    #[test]
    fn test_tool_result_pattern_error() {
        let line = "✗ Tool Result";
        assert!(TOOL_RESULT_RE.is_match(line));
    }

    #[test]
    fn test_tool_result_pattern_completed() {
        let line = "✓ Completed";
        assert!(TOOL_RESULT_RE.is_match(line));
    }

    #[test]
    fn test_no_tool_pattern_in_normal_text() {
        let line = "Hello, how can I help you today?";
        assert!(TOOL_START_RE.captures(line).is_none());
        assert!(!TOOL_RESULT_RE.is_match(line));
    }
}
