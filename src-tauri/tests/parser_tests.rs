// Integration tests for PRD parsers
// These tests verify that the parsers work correctly without requiring the full Tauri build

#[cfg(test)]
mod parser_integration_tests {
    use ralph_ui_lib::parsers::{parse_prd, parse_prd_auto, PRDFormat};

    #[test]
    fn test_json_parser_integration() {
        let json = r#"{
            "title": "Integration Test Project",
            "description": "Testing JSON parser",
            "tasks": [
                {
                    "title": "Task 1",
                    "description": "First task",
                    "priority": 1,
                    "dependencies": ["task-0"],
                    "tags": ["feature"],
                    "estimated_tokens": 500
                },
                {
                    "title": "Task 2",
                    "description": "Second task",
                    "priority": 2
                }
            ]
        }"#;

        let result = parse_prd(json, PRDFormat::Json);
        assert!(result.is_ok(), "JSON parsing should succeed");

        let doc = result.unwrap();
        assert_eq!(doc.title, "Integration Test Project");
        assert_eq!(doc.tasks.len(), 2);
        assert_eq!(doc.tasks[0].dependencies, vec!["task-0"]);
    }

    #[test]
    fn test_yaml_parser_integration() {
        let yaml = r#"
title: Integration Test Project
description: Testing YAML parser
tasks:
  - title: Task 1
    description: First task
    priority: 1
    dependencies:
      - task-0
    tags:
      - feature
    estimated_tokens: 500
  - title: Task 2
    description: Second task
    priority: 2
"#;

        let result = parse_prd(yaml, PRDFormat::Yaml);
        assert!(result.is_ok(), "YAML parsing should succeed");

        let doc = result.unwrap();
        assert_eq!(doc.title, "Integration Test Project");
        assert_eq!(doc.tasks.len(), 2);
        assert_eq!(doc.tasks[0].dependencies, vec!["task-0"]);
    }

    #[test]
    fn test_markdown_parser_integration() {
        let markdown = r#"# Integration Test Project

Testing Markdown parser.

## Tasks

### Task 1 [priority: 1]

First task description.

- **Dependencies:** task-0
- **Tags:** feature
- **Estimated Tokens:** 500

### Task 2 [priority: 2]

Second task description.
"#;

        let result = parse_prd(markdown, PRDFormat::Markdown);
        assert!(result.is_ok(), "Markdown parsing should succeed");

        let doc = result.unwrap();
        assert_eq!(doc.title, "Integration Test Project");
        assert_eq!(doc.tasks.len(), 2);
        assert_eq!(doc.tasks[0].title, "Task 1");
        assert_eq!(doc.tasks[0].priority, Some(1));
    }

    #[test]
    fn test_auto_detection() {
        let json = r#"{"title": "Auto Test", "tasks": []}"#;
        assert!(parse_prd_auto(json).is_ok());

        let yaml = "title: Auto Test\ntasks: []";
        assert!(parse_prd_auto(yaml).is_ok());

        let md = "# Auto Test\n\n## Tasks";
        assert!(parse_prd_auto(md).is_ok());
    }
}
