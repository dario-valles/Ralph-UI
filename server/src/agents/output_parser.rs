// Agent output parsing types and utilities
//
// Common types and structures for parsing agent CLI output.
// Used by format-specific parsers in format_parsers/.

/// Parsed tool call from agent JSON output
#[derive(Debug, Clone)]
pub struct ParsedToolCall {
    /// Tool call ID (from Claude's tool_use_id)
    pub tool_id: String,
    /// Tool name
    pub tool_name: String,
    /// Tool input parameters
    pub input: Option<serde_json::Value>,
}

/// Parsed tool result from agent JSON output
#[derive(Debug, Clone)]
pub struct ParsedToolResult {
    /// Tool call ID this result is for
    pub tool_id: String,
    /// Tool output (may be truncated)
    pub output: String,
    /// Whether the result indicates an error
    pub is_error: bool,
}

/// Result of parsing agent JSON output
#[derive(Debug, Clone, Default)]
pub struct ParsedAgentOutput {
    /// Display text for the terminal
    pub display_text: String,
    /// Tool calls found in this message
    pub tool_calls: Vec<ParsedToolCall>,
    /// Tool results found in this message
    pub tool_results: Vec<ParsedToolResult>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parsed_agent_output_default() {
        let output = ParsedAgentOutput::default();
        assert!(output.display_text.is_empty());
        assert!(output.tool_calls.is_empty());
        assert!(output.tool_results.is_empty());
    }

    #[test]
    fn test_parsed_tool_call() {
        let tool_call = ParsedToolCall {
            tool_id: "123".to_string(),
            tool_name: "Read".to_string(),
            input: Some(serde_json::json!({"path": "/test"})),
        };

        assert_eq!(tool_call.tool_id, "123");
        assert_eq!(tool_call.tool_name, "Read");
        assert!(tool_call.input.is_some());
    }

    #[test]
    fn test_parsed_tool_result() {
        let tool_result = ParsedToolResult {
            tool_id: "123".to_string(),
            output: "File content".to_string(),
            is_error: false,
        };

        assert_eq!(tool_result.tool_id, "123");
        assert_eq!(tool_result.output, "File content");
        assert!(!tool_result.is_error);
    }
}
