// YAML PRD parser

use super::types::{PRDDocument, PRDTask};
use anyhow::{Context, Result};
use serde_yaml::Value;

/// Parse a PRD from YAML format
///
/// Expected YAML structure:
/// ```yaml
/// title: Project Title
/// description: Optional project description
/// tasks:
///   - title: Task title
///     description: Task description
///     priority: 1
///     dependencies:
///       - task-id-1
///     tags:
///       - feature
///       - backend
///     estimated_tokens: 1000
/// ```
pub fn parse_yaml(content: &str) -> Result<PRDDocument> {
    let value: Value = serde_yaml::from_str(content)
        .context("Failed to parse YAML")?;

    let title = value.get("title")
        .or_else(|| value.get("name"))
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled PRD")
        .to_string();

    let description = value.get("description")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let tasks = value.get("tasks")
        .and_then(|v| v.as_sequence())
        .map(|seq| parse_tasks_sequence(seq))
        .unwrap_or_else(Vec::new);

    Ok(PRDDocument {
        title,
        description,
        tasks,
    })
}

fn parse_tasks_sequence(tasks: &[Value]) -> Vec<PRDTask> {
    tasks.iter()
        .filter_map(|task| parse_task(task))
        .collect()
}

fn parse_task(value: &Value) -> Option<PRDTask> {
    let title = value.get("title")
        .or_else(|| value.get("name"))
        .and_then(|v| v.as_str())?
        .to_string();

    let description = value.get("description")
        .or_else(|| value.get("desc"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let priority = value.get("priority")
        .and_then(|v| v.as_i64())
        .map(|n| n as i32);

    let dependencies = value.get("dependencies")
        .or_else(|| value.get("depends_on"))
        .and_then(|v| v.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let tags = value.get("tags")
        .or_else(|| value.get("labels"))
        .and_then(|v| v.as_sequence())
        .map(|seq| {
            seq.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let estimated_tokens = value.get("estimated_tokens")
        .or_else(|| value.get("estimatedTokens"))
        .or_else(|| value.get("tokens"))
        .and_then(|v| v.as_i64())
        .map(|n| n as i32);

    let mut task = PRDTask::new(title, description);

    if let Some(p) = priority {
        task = task.with_priority(p);
    }

    if !dependencies.is_empty() {
        task = task.with_dependencies(dependencies);
    }

    if !tags.is_empty() {
        task = task.with_tags(tags);
    }

    if let Some(tokens) = estimated_tokens {
        task = task.with_estimated_tokens(tokens);
    }

    Some(task)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_yaml() {
        let yaml = r#"
title: Test Project
description: A test project
tasks:
  - title: Task 1
    description: First task
"#;

        let result = parse_yaml(yaml);
        assert!(result.is_ok());

        let doc = result.unwrap();
        assert_eq!(doc.title, "Test Project");
        assert_eq!(doc.description, Some("A test project".to_string()));
        assert_eq!(doc.tasks.len(), 1);
        assert_eq!(doc.tasks[0].title, "Task 1");
    }

    #[test]
    fn test_parse_yaml_with_all_fields() {
        let yaml = r#"
title: Complex Project
tasks:
  - title: Task 1
    description: First task
    priority: 1
    dependencies:
      - task-0
    tags:
      - feature
      - backend
    estimated_tokens: 1000
"#;

        let result = parse_yaml(yaml);
        assert!(result.is_ok());

        let doc = result.unwrap();
        assert_eq!(doc.tasks.len(), 1);

        let task = &doc.tasks[0];
        assert_eq!(task.title, "Task 1");
        assert_eq!(task.priority, Some(1));
        assert_eq!(task.dependencies, vec!["task-0"]);
        assert_eq!(task.tags, vec!["feature", "backend"]);
        assert_eq!(task.estimated_tokens, Some(1000));
    }

    #[test]
    fn test_parse_yaml_alternative_field_names() {
        let yaml = r#"
name: Alternative Fields
tasks:
  - name: Task 1
    desc: Using alternative field names
    depends_on:
      - task-0
    labels:
      - test
    tokens: 500
"#;

        let result = parse_yaml(yaml);
        assert!(result.is_ok());

        let doc = result.unwrap();
        assert_eq!(doc.title, "Alternative Fields");
        assert_eq!(doc.tasks[0].title, "Task 1");
        assert_eq!(doc.tasks[0].description, "Using alternative field names");
        assert_eq!(doc.tasks[0].dependencies, vec!["task-0"]);
        assert_eq!(doc.tasks[0].tags, vec!["test"]);
        assert_eq!(doc.tasks[0].estimated_tokens, Some(500));
    }

    #[test]
    fn test_parse_empty_tasks() {
        let yaml = r#"
title: Empty Project
tasks: []
"#;

        let result = parse_yaml(yaml);
        assert!(result.is_ok());

        let doc = result.unwrap();
        assert_eq!(doc.tasks.len(), 0);
    }

    #[test]
    fn test_parse_invalid_yaml() {
        let yaml = "title: Test\ntasks:\n  - invalid: [";
        let result = parse_yaml(yaml);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_minimal_yaml() {
        let yaml = r#"
title: Minimal
tasks:
  - title: Task 1
"#;

        let result = parse_yaml(yaml);
        assert!(result.is_ok());

        let doc = result.unwrap();
        assert_eq!(doc.tasks[0].description, "");
    }

    #[test]
    fn test_parse_multiple_tasks() {
        let yaml = r#"
title: Multi Task
tasks:
  - title: Task 1
    priority: 1
  - title: Task 2
    priority: 2
  - title: Task 3
    priority: 3
"#;

        let result = parse_yaml(yaml);
        assert!(result.is_ok());

        let doc = result.unwrap();
        assert_eq!(doc.tasks.len(), 3);
        assert_eq!(doc.tasks[0].priority, Some(1));
        assert_eq!(doc.tasks[1].priority, Some(2));
        assert_eq!(doc.tasks[2].priority, Some(3));
    }
}
