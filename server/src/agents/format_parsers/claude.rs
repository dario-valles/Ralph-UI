// Claude Code output parsing
//
// Parses the stream-json format output from Claude Code CLI.
// Format documentation: https://docs.anthropic.com/claude-code

use crate::agents::format_parsers::generic::truncate_string;
use crate::agents::output_parser::{ParsedAgentOutput, ParsedToolCall, ParsedToolResult};

/// Parse Claude stream-json format with tool call extraction
pub fn parse_claude_stream_json_with_tools(
    json: &serde_json::Value,
    msg_type: &str,
) -> ParsedAgentOutput {
    let mut result = ParsedAgentOutput::default();

    match msg_type {
        "system" => {
            let subtype = json.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
            if subtype == "init" {
                let model = json
                    .get("model")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                result.display_text =
                    format!("\x1b[36m[System] Initialized with model: {}\x1b[0m", model);
            } else {
                result.display_text = format!("\x1b[36m[System] {}\x1b[0m", subtype);
            }
        }
        "assistant" => {
            if let Some(message) = json.get("message") {
                if let Some(content) = message.get("content").and_then(|c| c.as_array()) {
                    let mut texts: Vec<String> = Vec::new();

                    for item in content {
                        if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                            if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                                texts.push(text.to_string());
                            }
                        } else if item.get("type").and_then(|t| t.as_str()) == Some("tool_use") {
                            let tool_name =
                                item.get("name").and_then(|n| n.as_str()).unwrap_or("tool");
                            let tool_id = item
                                .get("id")
                                .and_then(|i| i.as_str())
                                .unwrap_or("")
                                .to_string();
                            let tool_input = item.get("input").cloned();

                            // Add to tool calls
                            result.tool_calls.push(ParsedToolCall {
                                tool_id: tool_id.clone(),
                                tool_name: tool_name.to_string(),
                                input: tool_input,
                            });

                            texts.push(format!("\x1b[33m[Using tool: {}]\x1b[0m", tool_name));
                        }
                    }

                    if !texts.is_empty() {
                        result.display_text = texts.join("\n");
                    }
                }
            }
        }
        "user" => {
            if let Some(message) = json.get("message") {
                if let Some(content) = message.get("content").and_then(|c| c.as_array()) {
                    for item in content {
                        if item.get("type").and_then(|t| t.as_str()) == Some("tool_result") {
                            let tool_id = item
                                .get("tool_use_id")
                                .and_then(|t| t.as_str())
                                .unwrap_or("")
                                .to_string();
                            let content_str =
                                item.get("content").and_then(|c| c.as_str()).unwrap_or("");
                            let is_error = item
                                .get("is_error")
                                .and_then(|e| e.as_bool())
                                .unwrap_or(false);

                            // Add to tool results
                            result.tool_results.push(ParsedToolResult {
                                tool_id: tool_id.clone(),
                                output: content_str.to_string(),
                                is_error,
                            });

                            let truncated = if content_str.len() > 200 {
                                format!("{}...", truncate_string(content_str, 200))
                            } else {
                                content_str.to_string()
                            };
                            result.display_text = format!(
                                "\x1b[90m[Tool result {}]: {}\x1b[0m",
                                &tool_id[..8.min(tool_id.len())],
                                truncated
                            );
                            return result;
                        }
                    }
                }
            }
        }
        "result" => {
            let subtype = json.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
            let duration = json
                .get("duration_ms")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let cost = json
                .get("total_cost_usd")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            result.display_text = format!(
                "\x1b[32m[Complete] {} - Duration: {}ms, Cost: ${:.4}\x1b[0m",
                subtype, duration, cost
            );
        }
        _ => {}
    }

    result
}

/// Parse Claude stream-json format (simple version without tool extraction)
#[allow(dead_code)]
pub fn parse_claude_stream_json(json: &serde_json::Value, msg_type: &str) -> String {
    match msg_type {
        "system" => {
            let subtype = json.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
            if subtype == "init" {
                let model = json
                    .get("model")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
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
                            } else if item.get("type").and_then(|t| t.as_str()) == Some("tool_use")
                            {
                                let tool_name =
                                    item.get("name").and_then(|n| n.as_str()).unwrap_or("tool");
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
                            let tool_id = item
                                .get("tool_use_id")
                                .and_then(|t| t.as_str())
                                .unwrap_or("");
                            let content_str =
                                item.get("content").and_then(|c| c.as_str()).unwrap_or("");
                            let truncated = if content_str.len() > 200 {
                                format!("{}...", truncate_string(content_str, 200))
                            } else {
                                content_str.to_string()
                            };
                            return format!(
                                "\x1b[90m[Tool result {}]: {}\x1b[0m",
                                &tool_id[..8.min(tool_id.len())],
                                truncated
                            );
                        }
                    }
                }
            }
            String::new()
        }
        "result" => {
            let subtype = json.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
            let duration = json
                .get("duration_ms")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            let cost = json
                .get("total_cost_usd")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            format!(
                "\x1b[32m[Complete] {} - Duration: {}ms, Cost: ${:.4}\x1b[0m",
                subtype, duration, cost
            )
        }
        _ => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_system_init() {
        let json: serde_json::Value = serde_json::json!({
            "type": "system",
            "subtype": "init",
            "model": "claude-sonnet-4-20250514"
        });

        let result = parse_claude_stream_json_with_tools(&json, "system");
        assert!(result.display_text.contains("Initialized with model"));
        assert!(result.display_text.contains("claude-sonnet-4-20250514"));
    }

    #[test]
    fn test_parse_assistant_with_tool_use() {
        let json: serde_json::Value = serde_json::json!({
            "type": "assistant",
            "message": {
                "content": [
                    {"type": "text", "text": "Let me read that file"},
                    {"type": "tool_use", "id": "tool_abc123", "name": "Read", "input": {"path": "/test"}}
                ]
            }
        });

        let result = parse_claude_stream_json_with_tools(&json, "assistant");
        assert!(result.display_text.contains("Let me read that file"));
        assert!(result.display_text.contains("[Using tool: Read]"));
        assert_eq!(result.tool_calls.len(), 1);
        assert_eq!(result.tool_calls[0].tool_name, "Read");
        assert_eq!(result.tool_calls[0].tool_id, "tool_abc123");
    }

    #[test]
    fn test_parse_tool_result() {
        let json: serde_json::Value = serde_json::json!({
            "type": "user",
            "message": {
                "content": [
                    {"type": "tool_result", "tool_use_id": "tool_abc123", "content": "File content here", "is_error": false}
                ]
            }
        });

        let result = parse_claude_stream_json_with_tools(&json, "user");
        assert!(result.display_text.contains("[Tool result"));
        assert!(result.display_text.contains("File content here"));
        assert_eq!(result.tool_results.len(), 1);
        assert_eq!(result.tool_results[0].tool_id, "tool_abc123");
        assert!(!result.tool_results[0].is_error);
    }

    #[test]
    fn test_parse_result() {
        let json: serde_json::Value = serde_json::json!({
            "type": "result",
            "subtype": "success",
            "duration_ms": 5000,
            "total_cost_usd": 0.0123
        });

        let result = parse_claude_stream_json_with_tools(&json, "result");
        assert!(result.display_text.contains("[Complete]"));
        assert!(result.display_text.contains("5000ms"));
        assert!(result.display_text.contains("$0.0123"));
    }
}
