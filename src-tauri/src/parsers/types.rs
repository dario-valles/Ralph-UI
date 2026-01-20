// Types for PRD (Product Requirements Document) parsing

use serde::{Deserialize, Serialize};

/// Represents a parsed PRD document
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PRDDocument {
    pub title: String,
    pub description: Option<String>,
    pub tasks: Vec<PRDTask>,
}

/// Represents a task from a PRD
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PRDTask {
    pub id: Option<String>,
    pub title: String,
    pub description: String,
    pub priority: Option<i32>,
    pub dependencies: Vec<String>,
    pub tags: Vec<String>,
    pub estimated_tokens: Option<i32>,
}

impl PRDTask {
    pub fn new(title: String, description: String) -> Self {
        Self {
            id: None,
            title,
            description,
            priority: None,
            dependencies: Vec::new(),
            tags: Vec::new(),
            estimated_tokens: None,
        }
    }

    pub fn with_id(mut self, id: String) -> Self {
        self.id = Some(id);
        self
    }

    pub fn with_priority(mut self, priority: i32) -> Self {
        self.priority = Some(priority);
        self
    }

    pub fn with_dependencies(mut self, dependencies: Vec<String>) -> Self {
        self.dependencies = dependencies;
        self
    }

    pub fn with_tags(mut self, tags: Vec<String>) -> Self {
        self.tags = tags;
        self
    }

    pub fn with_estimated_tokens(mut self, tokens: i32) -> Self {
        self.estimated_tokens = Some(tokens);
        self
    }
}
