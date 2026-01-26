// Agent-specific format parsers for processing CLI output
//
// Each agent CLI (Claude, OpenCode, etc.) has its own output format.
// These parsers convert agent-specific JSON/text output to normalized
// data structures for display and analysis.

pub mod claude;
pub mod generic;
pub mod opencode;

pub use claude::parse_claude_stream_json_with_tools;
pub use generic::{parse_generic_json, truncate_string};
pub use opencode::parse_opencode_json;

use crate::agents::output_parser::ParsedAgentOutput;

/// Parse agent JSON output and extract human-readable text and tool call data
/// Supports Claude stream-json format and OpenCode JSON format
/// Returns formatted text suitable for terminal display along with tool call info
pub fn parse_agent_json_output_with_tools(line: &str) -> ParsedAgentOutput {
    // Try to parse as JSON
    let json: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => {
            return ParsedAgentOutput {
                display_text: line.to_string(),
                ..Default::default()
            };
        }
    };

    // Check for Claude stream-json format (has "type" field)
    if let Some(msg_type) = json.get("type").and_then(|v| v.as_str()) {
        return parse_claude_stream_json_with_tools(&json, msg_type);
    }

    // Check for OpenCode format (has "role" or "content" at top level)
    if json.get("role").is_some() || json.get("content").is_some() {
        return ParsedAgentOutput {
            display_text: parse_opencode_json(&json),
            ..Default::default()
        };
    }

    // Try generic JSON parsing
    parse_generic_json(&json, line)
}

/// Parse agent JSON output and extract human-readable text
/// Supports Claude stream-json format and OpenCode JSON format
/// Returns formatted text suitable for terminal display
pub fn parse_agent_json_output(line: &str) -> String {
    parse_agent_json_output_with_tools(line).display_text
}
