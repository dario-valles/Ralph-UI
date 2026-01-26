// PRD (Product Requirements Document) parsers

pub mod json;
pub mod markdown;
pub mod structured_output;
pub mod types;
pub mod yaml;

use anyhow::{anyhow, Result};
pub use types::{PRDDocument, PRDTask};

/// Supported PRD file formats
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PRDFormat {
    Json,
    Yaml,
    Markdown,
}

impl PRDFormat {
    /// Detect format from file extension
    pub fn from_extension(ext: &str) -> Option<Self> {
        match ext.to_lowercase().as_str() {
            "json" => Some(Self::Json),
            "yaml" | "yml" => Some(Self::Yaml),
            "md" | "markdown" => Some(Self::Markdown),
            _ => None,
        }
    }

    /// Detect format from file path
    pub fn from_path(path: &str) -> Option<Self> {
        std::path::Path::new(path)
            .extension()
            .and_then(|ext| ext.to_str())
            .and_then(Self::from_extension)
    }
}

/// Parse a PRD from the given content and format
pub fn parse_prd(content: &str, format: PRDFormat) -> Result<PRDDocument> {
    match format {
        PRDFormat::Json => json::parse_json(content),
        PRDFormat::Yaml => yaml::parse_yaml(content),
        PRDFormat::Markdown => markdown::parse_markdown(content),
    }
}

/// Parse a PRD from content, auto-detecting the format
///
/// This attempts to parse as JSON first, then YAML, then Markdown
pub fn parse_prd_auto(content: &str) -> Result<PRDDocument> {
    // Try JSON first (strictest format)
    if let Ok(doc) = json::parse_json(content) {
        return Ok(doc);
    }

    // Try YAML (can be mistaken for plain text)
    if let Ok(doc) = yaml::parse_yaml(content) {
        return Ok(doc);
    }

    // Fall back to Markdown
    markdown::parse_markdown(content)
        .map_err(|_| anyhow!("Failed to parse PRD in any supported format"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_from_extension() {
        assert_eq!(PRDFormat::from_extension("json"), Some(PRDFormat::Json));
        assert_eq!(PRDFormat::from_extension("JSON"), Some(PRDFormat::Json));
        assert_eq!(PRDFormat::from_extension("yaml"), Some(PRDFormat::Yaml));
        assert_eq!(PRDFormat::from_extension("yml"), Some(PRDFormat::Yaml));
        assert_eq!(PRDFormat::from_extension("md"), Some(PRDFormat::Markdown));
        assert_eq!(
            PRDFormat::from_extension("markdown"),
            Some(PRDFormat::Markdown)
        );
        assert_eq!(PRDFormat::from_extension("txt"), None);
    }

    #[test]
    fn test_format_from_path() {
        assert_eq!(PRDFormat::from_path("tasks.json"), Some(PRDFormat::Json));
        assert_eq!(
            PRDFormat::from_path("/path/to/prd.yaml"),
            Some(PRDFormat::Yaml)
        );
        assert_eq!(PRDFormat::from_path("README.md"), Some(PRDFormat::Markdown));
        assert_eq!(PRDFormat::from_path("file.txt"), None);
    }

    #[test]
    fn test_parse_prd_json() {
        let content = r#"{"title": "Test", "tasks": [{"title": "Task 1"}]}"#;
        let result = parse_prd(content, PRDFormat::Json);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().title, "Test");
    }

    #[test]
    fn test_parse_prd_yaml() {
        let content = "title: Test\ntasks:\n  - title: Task 1";
        let result = parse_prd(content, PRDFormat::Yaml);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().title, "Test");
    }

    #[test]
    fn test_parse_prd_markdown() {
        let content = "# Test\n\n## Tasks\n\n### Task 1\n\nDescription.";
        let result = parse_prd(content, PRDFormat::Markdown);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().title, "Test");
    }

    #[test]
    fn test_parse_prd_auto_json() {
        let content = r#"{"title": "Test", "tasks": []}"#;
        let result = parse_prd_auto(content);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().title, "Test");
    }

    #[test]
    fn test_parse_prd_auto_yaml() {
        let content = "title: Test\ntasks: []";
        let result = parse_prd_auto(content);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().title, "Test");
    }

    #[test]
    fn test_parse_prd_auto_markdown() {
        let content = "# Test\n\n## Tasks";
        let result = parse_prd_auto(content);
        assert!(result.is_ok());
        assert_eq!(result.unwrap().title, "Test");
    }
}
