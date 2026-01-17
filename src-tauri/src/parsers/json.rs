// JSON PRD parser

use super::types::{PRDDocument, PRDTask};
use anyhow::{Context, Result};
use serde_json::Value;

/// Parse a PRD from JSON format
///
/// Expected JSON structure:
/// ```json
/// {
///   "title": "Project Title",
///   "description": "Optional project description",
///   "tasks": [
///     {
///       "title": "Task title",
///       "description": "Task description",
///       "priority": 1,
///       "dependencies": ["task-id-1"],
///       "tags": ["feature", "backend"],
///       "estimated_tokens": 1000
///     }
///   ]
/// }
/// ```
pub fn parse_json(content: &str) -> Result<PRDDocument> {
    let value: Value = serde_json::from_str(content)
        .context("Failed to parse JSON")?;

    let title = value.get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("Untitled PRD")
        .to_string();

    let description = value.get("description")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let tasks = value.get("tasks")
        .and_then(|v| v.as_array())
        .map(|arr| parse_tasks_array(arr))
        .unwrap_or_else(Vec::new);

    Ok(PRDDocument {
        title,
        description,
        tasks,
    })
}

fn parse_tasks_array(tasks: &[Value]) -> Vec<PRDTask> {
    tasks.iter()
        .filter_map(|task| parse_task(task))
        .collect()
}

fn parse_task(value: &Value) -> Option<PRDTask> {
    let title = value.get("title")?.as_str()?.to_string();
    let description = value.get("description")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let priority = value.get("priority")
        .and_then(|v| v.as_i64())
        .map(|n| n as i32);

    let dependencies: Vec<String> = value.get("dependencies")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let tags: Vec<String> = value.get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let estimated_tokens = value.get("estimated_tokens")
        .or_else(|| value.get("estimatedTokens"))
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
    fn test_parse_simple_json() {
        let json = r#"{
            "title": "Test Project",
            "description": "A test project",
            "tasks": [
                {
                    "title": "Task 1",
                    "description": "First task"
                }
            ]
        }"#;

        let result = parse_json(json);
        assert!(result.is_ok());

        let doc = result.unwrap();
        assert_eq!(doc.title, "Test Project");
        assert_eq!(doc.description, Some("A test project".to_string()));
        assert_eq!(doc.tasks.len(), 1);
        assert_eq!(doc.tasks[0].title, "Task 1");
    }

    #[test]
    fn test_parse_json_with_all_fields() {
        let json = r#"{
            "title": "Complex Project",
            "tasks": [
                {
                    "title": "Task 1",
                    "description": "First task",
                    "priority": 1,
                    "dependencies": ["task-0"],
                    "tags": ["feature", "backend"],
                    "estimated_tokens": 1000
                }
            ]
        }"#;

        let result = parse_json(json);
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
    fn test_parse_empty_tasks() {
        let json = r#"{
            "title": "Empty Project",
            "tasks": []
        }"#;

        let result = parse_json(json);
        assert!(result.is_ok());

        let doc = result.unwrap();
        assert_eq!(doc.tasks.len(), 0);
    }

    #[test]
    fn test_parse_invalid_json() {
        let json = "{ invalid json }";
        let result = parse_json(json);
        assert!(result.is_err());
    }

    #[test]
    fn test_parse_minimal_json() {
        let json = r#"{
            "title": "Minimal",
            "tasks": [{"title": "Task 1"}]
        }"#;

        let result = parse_json(json);
        assert!(result.is_ok());

        let doc = result.unwrap();
        assert_eq!(doc.tasks[0].description, "");
    }
}
