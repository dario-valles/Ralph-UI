// Subagent trace parsing for Claude Code output

#![allow(dead_code)] // Trace parsing infrastructure

use chrono::{DateTime, Utc};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

/// Type of subagent event
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SubagentEventType {
    /// Subagent was spawned
    Spawned,
    /// Subagent made progress
    Progress,
    /// Subagent completed successfully
    Completed,
    /// Subagent failed
    Failed,
}

/// Event from a subagent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentEvent {
    /// Event type
    pub event_type: SubagentEventType,
    /// Subagent ID (generated from sequence)
    pub subagent_id: String,
    /// Parent agent ID
    pub parent_agent_id: String,
    /// Description of what the subagent is doing
    pub description: String,
    /// When the event occurred
    pub timestamp: DateTime<Utc>,
    /// Depth in the subagent tree (0 = top-level subagent)
    pub depth: u32,
}

/// Parsed subagent hierarchy
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubagentTree {
    /// All events in order
    pub events: Vec<SubagentEvent>,
    /// Parent-child relationships
    pub hierarchy: HashMap<String, Vec<String>>,
    /// Active subagents (spawned but not completed)
    pub active: Vec<String>,
}

impl SubagentTree {
    pub fn new() -> Self {
        Self {
            events: Vec::new(),
            hierarchy: HashMap::new(),
            active: Vec::new(),
        }
    }

    /// Add an event to the tree
    pub fn add_event(&mut self, event: SubagentEvent) {
        match event.event_type {
            SubagentEventType::Spawned => {
                self.active.push(event.subagent_id.clone());
                self.hierarchy
                    .entry(event.parent_agent_id.clone())
                    .or_default()
                    .push(event.subagent_id.clone());
            }
            SubagentEventType::Completed | SubagentEventType::Failed => {
                self.active.retain(|id| id != &event.subagent_id);
            }
            _ => {}
        }
        self.events.push(event);
    }

    /// Get children of a parent
    pub fn get_children(&self, parent_id: &str) -> Vec<&SubagentEvent> {
        self.hierarchy
            .get(parent_id)
            .map(|children| {
                self.events
                    .iter()
                    .filter(|e| {
                        e.event_type == SubagentEventType::Spawned
                            && children.contains(&e.subagent_id)
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Get all events for a subagent
    pub fn get_subagent_events(&self, subagent_id: &str) -> Vec<&SubagentEvent> {
        self.events
            .iter()
            .filter(|e| e.subagent_id == subagent_id)
            .collect()
    }

    /// Check if a subagent is active
    pub fn is_active(&self, subagent_id: &str) -> bool {
        self.active.contains(&subagent_id.to_string())
    }

    /// Get the maximum depth of the tree
    pub fn max_depth(&self) -> u32 {
        self.events.iter().map(|e| e.depth).max().unwrap_or(0)
    }
}

impl Default for SubagentTree {
    fn default() -> Self {
        Self::new()
    }
}

/// Subagent trace parser
pub struct StreamingParser {
    /// Counter for generating subagent IDs
    subagent_counter: u32,
    /// Current depth stack (for tracking nested subagents)
    depth_stack: Vec<String>,
    /// Parent agent ID
    parent_agent_id: String,
}

// Compiled regex patterns
static SPAWN_PATTERN: OnceLock<Regex> = OnceLock::new();
static COMPLETE_PATTERN: OnceLock<Regex> = OnceLock::new();
static PROGRESS_PATTERN: OnceLock<Regex> = OnceLock::new();
static FAILED_PATTERN: OnceLock<Regex> = OnceLock::new();

fn get_spawn_pattern() -> &'static Regex {
    SPAWN_PATTERN.get_or_init(|| Regex::new(r"(?m)^[\s⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]*Task:?\s*(.+)$").unwrap())
}

fn get_complete_pattern() -> &'static Regex {
    COMPLETE_PATTERN
        .get_or_init(|| Regex::new(r"(?m)^[\s✓✔☑]*\s*Task\s+(completed|done|finished)").unwrap())
}

fn get_progress_pattern() -> &'static Regex {
    PROGRESS_PATTERN.get_or_init(|| Regex::new(r"(?m)^[\s⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+\s*(.+)$").unwrap())
}

fn get_failed_pattern() -> &'static Regex {
    FAILED_PATTERN
        .get_or_init(|| Regex::new(r"(?m)^[\s✗✘×]*\s*Task\s+(failed|error|aborted)").unwrap())
}

impl StreamingParser {
    /// Create a new parser for a parent agent
    pub fn new(parent_agent_id: &str) -> Self {
        Self {
            subagent_counter: 0,
            depth_stack: Vec::new(),
            parent_agent_id: parent_agent_id.to_string(),
        }
    }

    /// Parse a line of output and return any subagent event
    pub fn parse_line(&mut self, line: &str) -> Option<SubagentEvent> {
        // Check for Task spawn
        if let Some(caps) = get_spawn_pattern().captures(line) {
            if let Some(description) = caps.get(1) {
                return Some(self.create_spawn_event(description.as_str()));
            }
        }

        // Check for Task completion
        if get_complete_pattern().is_match(line) {
            return self.create_complete_event();
        }

        // Check for Task failure
        if get_failed_pattern().is_match(line) {
            return self.create_failed_event();
        }

        // Check for progress (spinner activity)
        if !self.depth_stack.is_empty() {
            if let Some(caps) = get_progress_pattern().captures(line) {
                if let Some(description) = caps.get(1) {
                    let desc = description.as_str();
                    // Avoid matching Task: lines as progress
                    if !desc.starts_with("Task") {
                        return self.create_progress_event(desc);
                    }
                }
            }
        }

        None
    }

    /// Parse multiple lines
    pub fn parse_output(&mut self, output: &str) -> Vec<SubagentEvent> {
        output
            .lines()
            .filter_map(|line| self.parse_line(line))
            .collect()
    }

    /// Get current depth
    pub fn current_depth(&self) -> u32 {
        self.depth_stack.len() as u32
    }

    /// Get current active subagent ID
    pub fn current_subagent(&self) -> Option<&str> {
        self.depth_stack.last().map(|s| s.as_str())
    }

    /// Reset parser state
    pub fn reset(&mut self) {
        self.subagent_counter = 0;
        self.depth_stack.clear();
    }

    // Event creation helpers

    fn create_spawn_event(&mut self, description: &str) -> SubagentEvent {
        self.subagent_counter += 1;
        let subagent_id = format!("{}-sub-{}", self.parent_agent_id, self.subagent_counter);
        let depth = self.depth_stack.len() as u32;

        self.depth_stack.push(subagent_id.clone());

        SubagentEvent {
            event_type: SubagentEventType::Spawned,
            subagent_id,
            parent_agent_id: self.parent_agent_id.clone(),
            description: description.trim().to_string(),
            timestamp: Utc::now(),
            depth,
        }
    }

    fn create_complete_event(&mut self) -> Option<SubagentEvent> {
        self.depth_stack.pop().map(|subagent_id| SubagentEvent {
            event_type: SubagentEventType::Completed,
            subagent_id,
            parent_agent_id: self.parent_agent_id.clone(),
            description: "Task completed".to_string(),
            timestamp: Utc::now(),
            depth: self.depth_stack.len() as u32,
        })
    }

    fn create_failed_event(&mut self) -> Option<SubagentEvent> {
        self.depth_stack.pop().map(|subagent_id| SubagentEvent {
            event_type: SubagentEventType::Failed,
            subagent_id,
            parent_agent_id: self.parent_agent_id.clone(),
            description: "Task failed".to_string(),
            timestamp: Utc::now(),
            depth: self.depth_stack.len() as u32,
        })
    }

    fn create_progress_event(&self, description: &str) -> Option<SubagentEvent> {
        self.depth_stack.last().map(|subagent_id| SubagentEvent {
            event_type: SubagentEventType::Progress,
            subagent_id: subagent_id.clone(),
            parent_agent_id: self.parent_agent_id.clone(),
            description: description.trim().to_string(),
            timestamp: Utc::now(),
            depth: (self.depth_stack.len() - 1) as u32,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detects_task_spawn_in_output() {
        let mut parser = StreamingParser::new("agent-1");

        let event = parser.parse_line("⠋ Task: Search for files");
        assert!(event.is_some());

        let event = event.unwrap();
        assert_eq!(event.event_type, SubagentEventType::Spawned);
        assert_eq!(event.description, "Search for files");
    }

    #[test]
    fn test_extracts_subagent_description() {
        let mut parser = StreamingParser::new("agent-1");

        let event = parser.parse_line("Task: Implement feature X").unwrap();
        assert_eq!(event.description, "Implement feature X");

        // Reset for next test
        parser.reset();

        let event2 = parser.parse_line("⠙ Task: Run tests").unwrap();
        assert_eq!(event2.description, "Run tests");
    }

    #[test]
    fn test_tracks_parent_child_relationships() {
        let mut parser = StreamingParser::new("agent-1");
        let mut tree = SubagentTree::new();

        let event1 = parser.parse_line("Task: Parent task").unwrap();
        tree.add_event(event1.clone());

        assert_eq!(event1.parent_agent_id, "agent-1");
        assert!(event1.subagent_id.starts_with("agent-1-sub-"));
    }

    #[test]
    fn test_detects_subagent_completion() {
        let mut parser = StreamingParser::new("agent-1");

        // First spawn a task
        parser.parse_line("Task: Do something");

        // Then complete it
        let event = parser.parse_line("✓ Task completed");
        assert!(event.is_some());

        let event = event.unwrap();
        assert_eq!(event.event_type, SubagentEventType::Completed);
    }

    #[test]
    fn test_handles_nested_subagents() {
        let mut parser = StreamingParser::new("agent-1");

        // Spawn first task
        let event1 = parser.parse_line("Task: Outer task").unwrap();
        assert_eq!(event1.depth, 0);

        // Spawn nested task
        let event2 = parser.parse_line("Task: Inner task").unwrap();
        assert_eq!(event2.depth, 1);

        // Complete inner task
        let event3 = parser.parse_line("✓ Task completed").unwrap();
        assert_eq!(event3.depth, 1);

        // Complete outer task
        let event4 = parser.parse_line("✓ Task completed").unwrap();
        assert_eq!(event4.depth, 0);
    }

    #[test]
    fn test_ignores_non_subagent_output() {
        let mut parser = StreamingParser::new("agent-1");

        assert!(parser.parse_line("Regular log message").is_none());
        assert!(parser.parse_line("Building project...").is_none());
        assert!(parser.parse_line("Error: something went wrong").is_none());
    }

    #[test]
    fn test_subagent_tree_active_tracking() {
        let mut tree = SubagentTree::new();

        let spawn = SubagentEvent {
            event_type: SubagentEventType::Spawned,
            subagent_id: "sub-1".to_string(),
            parent_agent_id: "agent-1".to_string(),
            description: "Test".to_string(),
            timestamp: Utc::now(),
            depth: 0,
        };

        tree.add_event(spawn);
        assert!(tree.is_active("sub-1"));

        let complete = SubagentEvent {
            event_type: SubagentEventType::Completed,
            subagent_id: "sub-1".to_string(),
            parent_agent_id: "agent-1".to_string(),
            description: "Done".to_string(),
            timestamp: Utc::now(),
            depth: 0,
        };

        tree.add_event(complete);
        assert!(!tree.is_active("sub-1"));
    }

    #[test]
    fn test_parse_output() {
        let mut parser = StreamingParser::new("agent-1");

        let output = r#"
⠋ Task: Search for files
⠙ Searching...
✓ Task completed
⠋ Task: Run tests
✗ Task failed
"#;

        let events = parser.parse_output(output);

        assert_eq!(events.len(), 5);
        assert_eq!(events[0].event_type, SubagentEventType::Spawned);
        assert_eq!(events[1].event_type, SubagentEventType::Progress);
        assert_eq!(events[2].event_type, SubagentEventType::Completed);
        assert_eq!(events[3].event_type, SubagentEventType::Spawned);
        assert_eq!(events[4].event_type, SubagentEventType::Failed);
    }

    #[test]
    fn test_subagent_tree_hierarchy() {
        let mut tree = SubagentTree::new();

        let spawn1 = SubagentEvent {
            event_type: SubagentEventType::Spawned,
            subagent_id: "sub-1".to_string(),
            parent_agent_id: "agent-1".to_string(),
            description: "Task 1".to_string(),
            timestamp: Utc::now(),
            depth: 0,
        };

        let spawn2 = SubagentEvent {
            event_type: SubagentEventType::Spawned,
            subagent_id: "sub-2".to_string(),
            parent_agent_id: "agent-1".to_string(),
            description: "Task 2".to_string(),
            timestamp: Utc::now(),
            depth: 0,
        };

        tree.add_event(spawn1);
        tree.add_event(spawn2);

        let children = tree.get_children("agent-1");
        assert_eq!(children.len(), 2);
    }

    #[test]
    fn test_max_depth() {
        let mut tree = SubagentTree::new();

        tree.add_event(SubagentEvent {
            event_type: SubagentEventType::Spawned,
            subagent_id: "sub-1".to_string(),
            parent_agent_id: "agent-1".to_string(),
            description: "Level 0".to_string(),
            timestamp: Utc::now(),
            depth: 0,
        });

        tree.add_event(SubagentEvent {
            event_type: SubagentEventType::Spawned,
            subagent_id: "sub-2".to_string(),
            parent_agent_id: "agent-1".to_string(),
            description: "Level 2".to_string(),
            timestamp: Utc::now(),
            depth: 2,
        });

        assert_eq!(tree.max_depth(), 2);
    }
}
