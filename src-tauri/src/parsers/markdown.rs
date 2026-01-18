// Markdown PRD parser

use super::types::{PRDDocument, PRDTask};
use anyhow::Result;
use pulldown_cmark::{Event, Parser, Tag, TagEnd};
use regex::Regex;

/// Parse a PRD from Markdown format
///
/// Expected Markdown structure:
/// ```markdown
/// # Project Title
///
/// Optional project description
///
/// ## Tasks
///
/// ### Task 1 [priority: 1]
///
/// Task description here.
///
/// - **Dependencies:** task-0, task-1
/// - **Tags:** feature, backend
/// - **Estimated Tokens:** 1000
///
/// ### Task 2
///
/// Another task description.
/// ```
pub fn parse_markdown(content: &str) -> Result<PRDDocument> {
    let parser = Parser::new(content);
    let mut state = ParserState::new();

    for event in parser {
        match event {
            Event::Start(tag) => state.handle_start_tag(tag),
            Event::End(tag_end) => state.handle_end_tag(tag_end),
            Event::Text(text) => state.handle_text(&text),
            Event::Code(code) => state.handle_code(&code),
            _ => {}
        }
    }

    state.finalize()
}

#[derive(Debug)]
struct ParserState {
    title: Option<String>,
    description: String,
    tasks: Vec<PRDTask>,
    current_heading_level: Option<u32>,
    current_heading_text: String,
    current_task_title: Option<String>,
    current_task_description: String,
    current_task_metadata: TaskMetadata,
    in_paragraph: bool,
    in_list: bool,
    current_list_item: String,
    found_tasks_section: bool,
}

#[derive(Debug, Default)]
struct TaskMetadata {
    priority: Option<i32>,
    dependencies: Vec<String>,
    tags: Vec<String>,
    estimated_tokens: Option<i32>,
}

impl ParserState {
    fn new() -> Self {
        Self {
            title: None,
            description: String::new(),
            tasks: Vec::new(),
            current_heading_level: None,
            current_heading_text: String::new(),
            current_task_title: None,
            current_task_description: String::new(),
            current_task_metadata: TaskMetadata::default(),
            in_paragraph: false,
            in_list: false,
            current_list_item: String::new(),
            found_tasks_section: false,
        }
    }

    fn handle_start_tag(&mut self, tag: Tag) {
        match tag {
            Tag::Heading { level, .. } => {
                self.save_current_task();
                self.current_heading_level = Some(level as u32);
                self.current_heading_text.clear();
            }
            Tag::Paragraph => {
                self.in_paragraph = true;
            }
            Tag::List(_) => {
                self.in_list = true;
            }
            Tag::Item => {
                self.current_list_item.clear();
            }
            _ => {}
        }
    }

    fn handle_end_tag(&mut self, tag_end: TagEnd) {
        match tag_end {
            TagEnd::Heading(_) => {
                if let Some(level) = self.current_heading_level {
                    self.process_heading(level);
                }
                self.current_heading_level = None;
            }
            TagEnd::Paragraph => {
                self.in_paragraph = false;
            }
            TagEnd::List(_) => {
                self.in_list = false;
            }
            TagEnd::Item => {
                if self.in_list {
                    self.process_list_item();
                }
            }
            _ => {}
        }
    }

    fn handle_text(&mut self, text: &str) {
        if self.current_heading_level.is_some() {
            self.current_heading_text.push_str(text);
        } else if self.in_list {
            self.current_list_item.push_str(text);
        } else if self.in_paragraph {
            if self.current_task_title.is_some() {
                if !self.current_task_description.is_empty() {
                    self.current_task_description.push(' ');
                }
                self.current_task_description.push_str(text.trim());
            } else if self.title.is_some() && !self.found_tasks_section {
                if !self.description.is_empty() {
                    self.description.push(' ');
                }
                self.description.push_str(text.trim());
            }
        }
    }

    fn handle_code(&mut self, code: &str) {
        if self.in_list {
            self.current_list_item.push_str(code);
        }
    }

    fn process_heading(&mut self, level: u32) {
        let text = self.current_heading_text.trim().to_string();

        if text.is_empty() {
            return;
        }

        match level {
            1 => {
                // H1 is the document title
                if self.title.is_none() {
                    self.title = Some(text);
                }
            }
            2 => {
                // H2 could be "Tasks" section or a major section
                if text.eq_ignore_ascii_case("tasks") {
                    self.found_tasks_section = true;
                }
            }
            3 => {
                // H3 is a task title (if we're in tasks section)
                if self.found_tasks_section {
                    self.save_current_task();
                    let (title, priority) = extract_priority(&text);
                    self.current_task_title = Some(title);
                    if let Some(p) = priority {
                        self.current_task_metadata.priority = Some(p);
                    }
                }
            }
            _ => {}
        }
    }

    fn process_list_item(&mut self) {
        let item = self.current_list_item.trim();

        if item.is_empty() {
            return;
        }

        // Try to extract metadata from list items
        if let Some(deps) = extract_dependencies(item) {
            self.current_task_metadata.dependencies = deps;
        } else if let Some(tags) = extract_tags(item) {
            self.current_task_metadata.tags = tags;
        } else if let Some(tokens) = extract_estimated_tokens(item) {
            self.current_task_metadata.estimated_tokens = Some(tokens);
        }
    }

    fn save_current_task(&mut self) {
        if let Some(title) = self.current_task_title.take() {
            // Handle empty descriptions by using title as fallback
            let description = if self.current_task_description.trim().is_empty() {
                eprintln!("[Parser Warning] Task '{}' has no description, using title as prompt", title);
                format!("Implement: {}", title)
            } else {
                self.current_task_description.trim().to_string()
            };

            let mut task = PRDTask::new(title, description);

            if let Some(priority) = self.current_task_metadata.priority {
                task = task.with_priority(priority);
            }

            if !self.current_task_metadata.dependencies.is_empty() {
                task = task.with_dependencies(
                    std::mem::take(&mut self.current_task_metadata.dependencies)
                );
            }

            if !self.current_task_metadata.tags.is_empty() {
                task = task.with_tags(
                    std::mem::take(&mut self.current_task_metadata.tags)
                );
            }

            if let Some(tokens) = self.current_task_metadata.estimated_tokens {
                task = task.with_estimated_tokens(tokens);
            }

            self.tasks.push(task);
            self.current_task_description.clear();
            self.current_task_metadata = TaskMetadata::default();
        }
    }

    fn finalize(mut self) -> Result<PRDDocument> {
        self.save_current_task();

        let title = self.title
            .unwrap_or_else(|| "Untitled PRD".to_string());

        let description = if self.description.trim().is_empty() {
            None
        } else {
            Some(self.description.trim().to_string())
        };

        Ok(PRDDocument {
            title,
            description,
            tasks: self.tasks,
        })
    }
}

/// Extract priority from heading text like "Task Title [priority: 1]"
fn extract_priority(text: &str) -> (String, Option<i32>) {
    let re = Regex::new(r"\[priority:\s*(\d+)\]").unwrap();

    if let Some(cap) = re.captures(text) {
        let priority = cap.get(1)
            .and_then(|m| m.as_str().parse::<i32>().ok());
        let title = re.replace(text, "").trim().to_string();
        (title, priority)
    } else {
        (text.to_string(), None)
    }
}

/// Extract dependencies from list item like "**Dependencies:** task-1, task-2"
/// Note: After markdown parsing, bold markers are stripped, so we match with or without **
fn extract_dependencies(text: &str) -> Option<Vec<String>> {
    // Match: "**Dependencies:** ...", "Dependencies: ...", "- **Dependencies:** ..."
    // The key pattern is "dependencies:" possibly surrounded by **
    let re = Regex::new(r"(?i)^(?:-\s*)?\*{0,2}dependencies:\*{0,2}\s*(.+)").unwrap();

    re.captures(text).map(|cap| {
        cap.get(1)
            .map(|m| {
                m.as_str()
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default()
    })
}

/// Extract tags from list item like "**Tags:** feature, backend"
/// Note: After markdown parsing, bold markers are stripped, so we match with or without **
fn extract_tags(text: &str) -> Option<Vec<String>> {
    // Match: "**Tags:** ...", "Tags: ...", "- **Labels:** ..."
    let re = Regex::new(r"(?i)^(?:-\s*)?\*{0,2}(tags|labels):\*{0,2}\s*(.+)").unwrap();

    re.captures(text).map(|cap| {
        cap.get(2)
            .map(|m| {
                m.as_str()
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect()
            })
            .unwrap_or_default()
    })
}

/// Extract estimated tokens from list item like "**Estimated Tokens:** 1000"
/// Note: After markdown parsing, bold markers are stripped, so we match with or without **
fn extract_estimated_tokens(text: &str) -> Option<i32> {
    // Match: "**Estimated Tokens:** 1000", "Estimated Tokens: 1000"
    let re = Regex::new(r"(?i)^(?:-\s*)?\*{0,2}estimated\s*tokens:\*{0,2}\s*(\d+)").unwrap();

    re.captures(text)
        .and_then(|cap| cap.get(1))
        .and_then(|m| m.as_str().parse::<i32>().ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple_markdown() {
        let md = r#"# Test Project

A test project description.

## Tasks

### Task 1

First task description.
"#;

        let result = parse_markdown(md);
        assert!(result.is_ok());

        let doc = result.unwrap();
        assert_eq!(doc.title, "Test Project");
        assert_eq!(doc.description, Some("A test project description.".to_string()));
        assert_eq!(doc.tasks.len(), 1);
        assert_eq!(doc.tasks[0].title, "Task 1");
        assert_eq!(doc.tasks[0].description, "First task description.");
    }

    #[test]
    fn test_parse_markdown_with_priority() {
        let md = r#"# Project

## Tasks

### Task 1 [priority: 1]

High priority task.
"#;

        let result = parse_markdown(md);
        assert!(result.is_ok());

        let doc = result.unwrap();
        assert_eq!(doc.tasks[0].title, "Task 1");
        assert_eq!(doc.tasks[0].priority, Some(1));
    }

    #[test]
    fn test_parse_markdown_with_metadata() {
        let md = r#"# Project

## Tasks

### Task 1

Task description.

- **Dependencies:** task-0, task-1
- **Tags:** feature, backend
- **Estimated Tokens:** 1000
"#;

        let result = parse_markdown(md);
        assert!(result.is_ok());

        let doc = result.unwrap();
        let task = &doc.tasks[0];
        assert_eq!(task.dependencies, vec!["task-0", "task-1"]);
        assert_eq!(task.tags, vec!["feature", "backend"]);
        assert_eq!(task.estimated_tokens, Some(1000));
    }

    #[test]
    fn test_parse_multiple_tasks() {
        let md = r#"# Project

## Tasks

### Task 1 [priority: 1]

First task.

### Task 2 [priority: 2]

Second task.

### Task 3

Third task.
"#;

        let result = parse_markdown(md);
        assert!(result.is_ok());

        let doc = result.unwrap();
        assert_eq!(doc.tasks.len(), 3);
        assert_eq!(doc.tasks[0].title, "Task 1");
        assert_eq!(doc.tasks[1].title, "Task 2");
        assert_eq!(doc.tasks[2].title, "Task 3");
    }

    #[test]
    fn test_parse_no_tasks_section() {
        let md = r#"# Project

Just a description.
"#;

        let result = parse_markdown(md);
        assert!(result.is_ok());

        let doc = result.unwrap();
        assert_eq!(doc.tasks.len(), 0);
    }

    #[test]
    fn test_extract_priority() {
        let (title, priority) = extract_priority("Task Title [priority: 5]");
        assert_eq!(title, "Task Title");
        assert_eq!(priority, Some(5));

        let (title, priority) = extract_priority("Task Title");
        assert_eq!(title, "Task Title");
        assert_eq!(priority, None);
    }

    #[test]
    fn test_extract_dependencies() {
        let deps = extract_dependencies("**Dependencies:** task-1, task-2, task-3");
        assert_eq!(deps, Some(vec!["task-1".to_string(), "task-2".to_string(), "task-3".to_string()]));

        let deps = extract_dependencies("**dependencies:** task-1");
        assert_eq!(deps, Some(vec!["task-1".to_string()]));

        let deps = extract_dependencies("No dependencies here");
        assert_eq!(deps, None);
    }

    #[test]
    fn test_extract_tags() {
        let tags = extract_tags("**Tags:** feature, backend");
        assert_eq!(tags, Some(vec!["feature".to_string(), "backend".to_string()]));

        let tags = extract_tags("**labels:** test");
        assert_eq!(tags, Some(vec!["test".to_string()]));

        let tags = extract_tags("No tags here");
        assert_eq!(tags, None);
    }

    #[test]
    fn test_extract_estimated_tokens() {
        let tokens = extract_estimated_tokens("**Estimated Tokens:** 1000");
        assert_eq!(tokens, Some(1000));

        let tokens = extract_estimated_tokens("**estimated tokens:** 500");
        assert_eq!(tokens, Some(500));

        let tokens = extract_estimated_tokens("No tokens here");
        assert_eq!(tokens, None);
    }
}
