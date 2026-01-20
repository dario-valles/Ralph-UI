//! Type definitions for Ralph Wiggum Loop
//!
//! These types define the file-based state that persists across agent iterations:
//! - prd.json: Task list with pass/fail status
//! - progress.txt: Learnings accumulated across iterations

use serde::{Deserialize, Serialize};

/// A story/task in the PRD
///
/// This represents a single unit of work that the agent should complete.
/// The `passes` field is updated by the agent when the story is implemented and verified.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RalphStory {
    /// Unique identifier for the story
    pub id: String,

    /// Short title describing the story
    pub title: String,

    /// Detailed description of what needs to be done
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Acceptance criteria that must be met
    pub acceptance: String,

    /// Whether this story passes all acceptance criteria
    #[serde(default)]
    pub passes: bool,

    /// Priority level (lower = higher priority)
    #[serde(default = "default_priority")]
    pub priority: u32,

    /// Dependencies on other story IDs (must be completed first)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub dependencies: Vec<String>,

    /// Tags for categorization
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,

    /// Optional estimated effort (S/M/L/XL)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
}

fn default_priority() -> u32 {
    100
}

impl RalphStory {
    /// Create a new story with required fields
    pub fn new(id: impl Into<String>, title: impl Into<String>, acceptance: impl Into<String>) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            description: None,
            acceptance: acceptance.into(),
            passes: false,
            priority: default_priority(),
            dependencies: Vec::new(),
            tags: Vec::new(),
            effort: None,
        }
    }

    /// Check if all dependencies are satisfied (all pass)
    pub fn dependencies_satisfied(&self, stories: &[RalphStory]) -> bool {
        self.dependencies.iter().all(|dep_id| {
            stories
                .iter()
                .find(|s| &s.id == dep_id)
                .map(|s| s.passes)
                .unwrap_or(false)
        })
    }
}

/// The PRD document stored in .ralph/prd.json
///
/// This is the source of truth for what tasks need to be done and their status.
/// The agent reads this file at the start of each iteration to pick a task,
/// and updates it when a task is completed.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RalphPrd {
    /// Title of the PRD
    pub title: String,

    /// Description of the overall goal
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,

    /// Branch name for this PRD's work
    pub branch: String,

    /// List of stories/tasks to complete
    pub stories: Vec<RalphStory>,

    /// PRD metadata
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<PrdMetadata>,
}

/// Metadata about the PRD
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PrdMetadata {
    /// When the PRD was created
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<String>,

    /// When the PRD was last modified
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,

    /// Source chat session ID (if created from PRD chat)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_chat_id: Option<String>,

    /// Total iterations run against this PRD
    #[serde(default)]
    pub total_iterations: u32,

    /// Last execution ID
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_execution_id: Option<String>,
}

impl RalphPrd {
    /// Create a new PRD with required fields
    pub fn new(title: impl Into<String>, branch: impl Into<String>) -> Self {
        Self {
            title: title.into(),
            description: None,
            branch: branch.into(),
            stories: Vec::new(),
            metadata: Some(PrdMetadata {
                created_at: Some(chrono::Utc::now().to_rfc3339()),
                updated_at: None,
                source_chat_id: None,
                total_iterations: 0,
                last_execution_id: None,
            }),
        }
    }

    /// Add a story to the PRD
    pub fn add_story(&mut self, story: RalphStory) {
        self.stories.push(story);
    }

    /// Get all stories that haven't passed yet
    pub fn incomplete_stories(&self) -> Vec<&RalphStory> {
        self.stories.iter().filter(|s| !s.passes).collect()
    }

    /// Get the highest priority incomplete story with satisfied dependencies
    pub fn next_story(&self) -> Option<&RalphStory> {
        self.stories
            .iter()
            .filter(|s| !s.passes && s.dependencies_satisfied(&self.stories))
            .min_by_key(|s| s.priority)
    }

    /// Mark a story as passing
    pub fn mark_story_passing(&mut self, story_id: &str) -> bool {
        if let Some(story) = self.stories.iter_mut().find(|s| s.id == story_id) {
            story.passes = true;
            true
        } else {
            false
        }
    }

    /// Check if all stories pass
    pub fn all_pass(&self) -> bool {
        self.stories.iter().all(|s| s.passes)
    }

    /// Get progress stats
    pub fn progress(&self) -> (usize, usize) {
        let passed = self.stories.iter().filter(|s| s.passes).count();
        (passed, self.stories.len())
    }
}

/// Status summary for a PRD
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrdStatus {
    /// Total number of stories
    pub total: usize,

    /// Number of stories that pass
    pub passed: usize,

    /// Number of stories that fail
    pub failed: usize,

    /// Whether all stories pass
    pub all_pass: bool,

    /// Progress percentage (0-100)
    pub progress_percent: f32,

    /// IDs of incomplete stories
    pub incomplete_story_ids: Vec<String>,

    /// ID of next story to work on (highest priority with satisfied deps)
    pub next_story_id: Option<String>,
}

/// A single entry in progress.txt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEntry {
    /// Iteration number
    pub iteration: u32,

    /// Timestamp
    pub timestamp: String,

    /// Type of entry
    pub entry_type: ProgressEntryType,

    /// Content of the entry
    pub content: String,
}

/// Types of progress entries
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ProgressEntryType {
    /// Iteration started
    IterationStart,
    /// Iteration ended
    IterationEnd,
    /// Learning/insight recorded
    Learning,
    /// Error or issue encountered
    Error,
    /// Story completed
    StoryCompleted,
    /// Manual note added
    Note,
}

impl std::fmt::Display for ProgressEntryType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProgressEntryType::IterationStart => write!(f, "START"),
            ProgressEntryType::IterationEnd => write!(f, "END"),
            ProgressEntryType::Learning => write!(f, "LEARNING"),
            ProgressEntryType::Error => write!(f, "ERROR"),
            ProgressEntryType::StoryCompleted => write!(f, "COMPLETED"),
            ProgressEntryType::Note => write!(f, "NOTE"),
        }
    }
}

/// Configuration from .ralph/config.yaml (optional)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RalphConfig {
    /// Project settings
    #[serde(default)]
    pub project: ProjectConfig,

    /// Ralph loop settings
    #[serde(default)]
    pub ralph: LoopConfig,
}

/// Project-specific configuration
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProjectConfig {
    /// Project name
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// Command to run tests
    #[serde(skip_serializing_if = "Option::is_none")]
    pub test_command: Option<String>,

    /// Command to run linter
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lint_command: Option<String>,

    /// Command to build the project
    #[serde(skip_serializing_if = "Option::is_none")]
    pub build_command: Option<String>,
}

/// Loop-specific configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoopConfig {
    /// Maximum iterations
    #[serde(default = "default_max_iterations")]
    pub max_iterations: u32,

    /// Completion promise string
    #[serde(default = "default_completion_promise")]
    pub completion_promise: String,

    /// Agent to use
    #[serde(default = "default_agent")]
    pub agent: String,

    /// Model to use
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,

    /// Maximum cost in dollars
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_cost: Option<f64>,
}

fn default_max_iterations() -> u32 {
    50
}

fn default_completion_promise() -> String {
    "<promise>COMPLETE</promise>".to_string()
}

fn default_agent() -> String {
    "claude".to_string()
}

impl Default for LoopConfig {
    fn default() -> Self {
        Self {
            max_iterations: default_max_iterations(),
            completion_promise: default_completion_promise(),
            agent: default_agent(),
            model: None,
            max_cost: None,
        }
    }
}

impl Default for RalphConfig {
    fn default() -> Self {
        Self {
            project: ProjectConfig::default(),
            ralph: LoopConfig::default(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ralph_story_creation() {
        let story = RalphStory::new("1", "Add login", "User can log in with email/password");
        assert_eq!(story.id, "1");
        assert!(!story.passes);
        assert_eq!(story.priority, 100);
    }

    #[test]
    fn test_ralph_prd_next_story() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");

        let mut story1 = RalphStory::new("1", "First task", "Complete first");
        story1.priority = 1;

        let mut story2 = RalphStory::new("2", "Second task", "Complete second");
        story2.priority = 2;
        story2.dependencies = vec!["1".to_string()];

        prd.add_story(story1);
        prd.add_story(story2);

        // First story should be next (no deps, highest priority)
        let next = prd.next_story();
        assert_eq!(next.unwrap().id, "1");

        // After marking first as passing, second should be next
        prd.mark_story_passing("1");
        let next = prd.next_story();
        assert_eq!(next.unwrap().id, "2");
    }

    #[test]
    fn test_prd_serialization() {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");
        prd.add_story(RalphStory::new("1", "Test story", "Must pass test"));

        let json = serde_json::to_string_pretty(&prd).unwrap();
        assert!(json.contains("Test PRD"));
        assert!(json.contains("Test story"));

        // Deserialize back
        let parsed: RalphPrd = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.title, "Test PRD");
        assert_eq!(parsed.stories.len(), 1);
    }

    #[test]
    fn test_dependencies_satisfied() {
        let stories = vec![
            {
                let mut s = RalphStory::new("1", "First", "A");
                s.passes = true;
                s
            },
            {
                let mut s = RalphStory::new("2", "Second", "B");
                s.passes = false;
                s
            },
        ];

        let mut story_with_dep = RalphStory::new("3", "Third", "C");
        story_with_dep.dependencies = vec!["1".to_string()];
        assert!(story_with_dep.dependencies_satisfied(&stories));

        story_with_dep.dependencies = vec!["2".to_string()];
        assert!(!story_with_dep.dependencies_satisfied(&stories));

        story_with_dep.dependencies = vec!["1".to_string(), "2".to_string()];
        assert!(!story_with_dep.dependencies_satisfied(&stories));
    }
}
