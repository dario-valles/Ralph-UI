// OpenCode output parsing
//
// Parses JSON output from the OpenCode CLI.
// Format: Standard chat completion format with role/content structure.

use crate::agents::format_parsers::generic::truncate_string;

/// Parse OpenCode JSON format
pub fn parse_opencode_json(json: &serde_json::Value) -> String {
    let role = json
        .get("role")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

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
                format!("{}...", truncate_string(&content, 200))
            } else {
                content
            };
            format!("\x1b[90m[Tool result]: {}\x1b[0m", truncated)
        }
        _ => content,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_assistant_message() {
        let json: serde_json::Value = serde_json::json!({
            "role": "assistant",
            "content": "Hello, I can help with that."
        });

        let result = parse_opencode_json(&json);
        assert_eq!(result, "Hello, I can help with that.");
    }

    #[test]
    fn test_parse_user_message() {
        let json: serde_json::Value = serde_json::json!({
            "role": "user",
            "content": "Can you help me?"
        });

        let result = parse_opencode_json(&json);
        assert!(result.contains("[User]"));
        assert!(result.contains("Can you help me?"));
    }

    #[test]
    fn test_parse_system_message() {
        let json: serde_json::Value = serde_json::json!({
            "role": "system",
            "content": "You are a helpful assistant."
        });

        let result = parse_opencode_json(&json);
        assert!(result.contains("[System]"));
        assert!(result.contains("You are a helpful assistant."));
    }

    #[test]
    fn test_parse_tool_result() {
        let json: serde_json::Value = serde_json::json!({
            "role": "tool",
            "content": "File contents here"
        });

        let result = parse_opencode_json(&json);
        assert!(result.contains("[Tool result]"));
        assert!(result.contains("File contents here"));
    }

    #[test]
    fn test_parse_content_array_with_tool_use() {
        let json: serde_json::Value = serde_json::json!({
            "role": "assistant",
            "content": [
                {"text": "Let me read that file"},
                {"tool_use": {"name": "read_file"}}
            ]
        });

        let result = parse_opencode_json(&json);
        assert!(result.contains("Let me read that file"));
        assert!(result.contains("[Using tool: read_file]"));
    }

    #[test]
    fn test_parse_empty_content() {
        let json: serde_json::Value = serde_json::json!({
            "role": "assistant",
            "content": ""
        });

        let result = parse_opencode_json(&json);
        assert!(result.is_empty());
    }

    #[test]
    fn test_truncate_long_tool_result() {
        let long_content = "x".repeat(300);
        let json: serde_json::Value = serde_json::json!({
            "role": "tool",
            "content": long_content
        });

        let result = parse_opencode_json(&json);
        assert!(result.contains("..."));
        assert!(result.len() < 250); // Should be truncated
    }
}
