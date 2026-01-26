// Generic/fallback format parsing
//
// Handles JSON output that doesn't match known agent formats.
// Provides utility functions used by other format parsers.

use crate::agents::output_parser::ParsedAgentOutput;

/// Truncate a string to approximately max_bytes, ensuring we don't cut in the middle of a UTF-8 character
pub fn truncate_string(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    // Find the last valid char boundary at or before max_bytes
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

/// Parse generic JSON format with common field names
pub fn parse_generic_json(json: &serde_json::Value, original_line: &str) -> ParsedAgentOutput {
    // Check for generic message/text fields
    if let Some(text) = json.get("text").and_then(|v| v.as_str()) {
        return ParsedAgentOutput {
            display_text: text.to_string(),
            ..Default::default()
        };
    }
    if let Some(message) = json.get("message").and_then(|v| v.as_str()) {
        return ParsedAgentOutput {
            display_text: message.to_string(),
            ..Default::default()
        };
    }
    if let Some(output) = json.get("output").and_then(|v| v.as_str()) {
        return ParsedAgentOutput {
            display_text: output.to_string(),
            ..Default::default()
        };
    }

    // Unknown JSON format - return as-is
    ParsedAgentOutput {
        display_text: original_line.to_string(),
        ..Default::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_truncate_string_short() {
        let s = "hello";
        assert_eq!(truncate_string(s, 10), "hello");
    }

    #[test]
    fn test_truncate_string_exact() {
        let s = "hello";
        assert_eq!(truncate_string(s, 5), "hello");
    }

    #[test]
    fn test_truncate_string_long() {
        let s = "hello world";
        assert_eq!(truncate_string(s, 5), "hello");
    }

    #[test]
    fn test_truncate_string_utf8() {
        let s = "hello\u{1F600}world"; // emoji is 4 bytes
        let truncated = truncate_string(s, 6);
        // Should not cut in the middle of the emoji
        assert!(truncated == "hello" || truncated == "hello\u{1F600}");
    }

    #[test]
    fn test_parse_generic_text_field() {
        let json: serde_json::Value = serde_json::json!({
            "text": "Some text output"
        });

        let result = parse_generic_json(&json, "");
        assert_eq!(result.display_text, "Some text output");
    }

    #[test]
    fn test_parse_generic_message_field() {
        let json: serde_json::Value = serde_json::json!({
            "message": "A message"
        });

        let result = parse_generic_json(&json, "");
        assert_eq!(result.display_text, "A message");
    }

    #[test]
    fn test_parse_generic_output_field() {
        let json: serde_json::Value = serde_json::json!({
            "output": "Output data"
        });

        let result = parse_generic_json(&json, "");
        assert_eq!(result.display_text, "Output data");
    }

    #[test]
    fn test_parse_generic_unknown() {
        let json: serde_json::Value = serde_json::json!({
            "unknown_field": "value"
        });

        let result = parse_generic_json(&json, "{\"unknown_field\": \"value\"}");
        assert_eq!(result.display_text, "{\"unknown_field\": \"value\"}");
    }
}
