//! Learnings Manager - Structured storage for accumulated learnings
//!
//! The learnings.json file stores learnings in a structured format.
//! This enables:
//! - Crash recovery: Learnings persist across restarts
//! - Categorization: Learnings are typed (Architecture, Gotcha, Pattern, etc.)
//! - Better brief generation: Learnings can be grouped and prioritized
//! - Future analytics: Track most common gotchas, patterns, etc.
//!
//! File location: `.ralph-ui/briefs/{prd_name}/learnings.json`

use crate::file_storage::{atomic_write, ensure_dir, read_json};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Type/category of a learning
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LearningType {
    /// Architectural discovery about the codebase
    Architecture,
    /// Something that caused problems or confusion
    Gotcha,
    /// A coding pattern to follow
    Pattern,
    /// Testing-related insight
    Testing,
    /// Tooling or build system insight
    Tooling,
    /// General note or insight
    General,
}

impl Default for LearningType {
    fn default() -> Self {
        Self::General
    }
}

impl std::fmt::Display for LearningType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            LearningType::Architecture => write!(f, "Architecture"),
            LearningType::Gotcha => write!(f, "Gotcha"),
            LearningType::Pattern => write!(f, "Pattern"),
            LearningType::Testing => write!(f, "Testing"),
            LearningType::Tooling => write!(f, "Tooling"),
            LearningType::General => write!(f, "General"),
        }
    }
}

impl std::str::FromStr for LearningType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "architecture" => Ok(LearningType::Architecture),
            "gotcha" => Ok(LearningType::Gotcha),
            "pattern" => Ok(LearningType::Pattern),
            "testing" => Ok(LearningType::Testing),
            "tooling" => Ok(LearningType::Tooling),
            "general" => Ok(LearningType::General),
            _ => Err(format!("Unknown learning type: {}", s)),
        }
    }
}

/// A single learning entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningEntry {
    /// Unique identifier for deduplication
    pub id: String,
    /// Which iteration this learning was discovered in
    pub iteration: u32,
    /// Type/category of the learning
    #[serde(default)]
    pub learning_type: LearningType,
    /// The learning content (description)
    pub content: String,
    /// Associated story ID (if any)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub story_id: Option<String>,
    /// Optional code example
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_example: Option<String>,
    /// When this learning was recorded
    pub timestamp: String,
    /// Source of this learning (agent or human)
    #[serde(default = "default_source")]
    pub source: String,
}

fn default_source() -> String {
    "agent".to_string()
}

impl LearningEntry {
    /// Create a new learning entry
    pub fn new(iteration: u32, content: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            iteration,
            learning_type: LearningType::General,
            content: content.into(),
            story_id: None,
            code_example: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
            source: "agent".to_string(),
        }
    }

    /// Create a new learning with a type
    pub fn with_type(iteration: u32, learning_type: LearningType, content: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            iteration,
            learning_type,
            content: content.into(),
            story_id: None,
            code_example: None,
            timestamp: chrono::Utc::now().to_rfc3339(),
            source: "agent".to_string(),
        }
    }

    /// Set the story ID
    pub fn for_story(mut self, story_id: impl Into<String>) -> Self {
        self.story_id = Some(story_id.into());
        self
    }

    /// Add a code example
    pub fn with_code(mut self, code: impl Into<String>) -> Self {
        self.code_example = Some(code.into());
        self
    }

    /// Mark as manually added
    pub fn from_human(mut self) -> Self {
        self.source = "human".to_string();
        self
    }
}

/// The complete learnings file structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LearningsFile {
    /// List of all learnings
    pub entries: Vec<LearningEntry>,
    /// When this file was created
    pub created_at: String,
    /// When this file was last updated
    pub last_updated: String,
    /// Total iterations that have contributed learnings
    #[serde(default)]
    pub total_iterations: u32,
}

impl Default for LearningsFile {
    fn default() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            entries: Vec::new(),
            created_at: now.clone(),
            last_updated: now,
            total_iterations: 0,
        }
    }
}

impl LearningsFile {
    /// Add a learning entry
    pub fn add_entry(&mut self, entry: LearningEntry) {
        if entry.iteration > self.total_iterations {
            self.total_iterations = entry.iteration;
        }
        self.entries.push(entry);
        self.last_updated = chrono::Utc::now().to_rfc3339();
    }

    /// Get learnings by type
    pub fn get_by_type(&self, learning_type: LearningType) -> Vec<&LearningEntry> {
        self.entries
            .iter()
            .filter(|e| e.learning_type == learning_type)
            .collect()
    }

    /// Get learnings for a specific story
    pub fn get_for_story(&self, story_id: &str) -> Vec<&LearningEntry> {
        self.entries
            .iter()
            .filter(|e| e.story_id.as_ref().map(|s| s == story_id).unwrap_or(false))
            .collect()
    }

    /// Get learnings for a specific iteration
    pub fn get_for_iteration(&self, iteration: u32) -> Vec<&LearningEntry> {
        self.entries.iter().filter(|e| e.iteration == iteration).collect()
    }

    /// Get count by type
    pub fn count_by_type(&self) -> std::collections::HashMap<LearningType, usize> {
        let mut counts = std::collections::HashMap::new();
        for entry in &self.entries {
            *counts.entry(entry.learning_type).or_insert(0) += 1;
        }
        counts
    }

    /// Format learnings for inclusion in BRIEF.md
    pub fn format_for_brief(&self) -> String {
        if self.entries.is_empty() {
            return String::new();
        }

        let mut output = String::new();

        // Group by type
        let types = [
            LearningType::Gotcha,
            LearningType::Pattern,
            LearningType::Architecture,
            LearningType::Testing,
            LearningType::Tooling,
            LearningType::General,
        ];

        for learning_type in types {
            let entries = self.get_by_type(learning_type);
            if !entries.is_empty() {
                output.push_str(&format!("### {}\n\n", learning_type));
                for entry in entries {
                    output.push_str(&format!("- [Iter {}] {}\n", entry.iteration, entry.content));
                    if let Some(ref code) = entry.code_example {
                        output.push_str("  ```\n");
                        for line in code.lines() {
                            output.push_str(&format!("  {}\n", line));
                        }
                        output.push_str("  ```\n");
                    }
                }
                output.push('\n');
            }
        }

        output
    }

    /// Export learnings to markdown format
    pub fn export_to_markdown(&self) -> String {
        let mut output = String::new();
        output.push_str("# Accumulated Learnings\n\n");
        output.push_str(&format!(
            "Generated: {}\n",
            chrono::Utc::now().to_rfc3339()
        ));
        output.push_str(&format!("Total iterations: {}\n\n", self.total_iterations));

        output.push_str(&self.format_for_brief());

        output
    }
}

/// Learnings manager for file I/O
pub struct LearningsManager {
    /// Base project path
    project_path: PathBuf,
    /// PRD name
    prd_name: String,
}

impl LearningsManager {
    /// Create a new learnings manager
    pub fn new(project_path: &Path, prd_name: &str) -> Self {
        Self {
            project_path: project_path.to_path_buf(),
            prd_name: prd_name.to_string(),
        }
    }

    /// Get the briefs directory for this PRD
    fn briefs_dir(&self) -> PathBuf {
        self.project_path
            .join(".ralph-ui")
            .join("briefs")
            .join(&self.prd_name)
    }

    /// Get the path to learnings.json
    pub fn learnings_path(&self) -> PathBuf {
        self.briefs_dir().join("learnings.json")
    }

    /// Check if learnings file exists
    pub fn exists(&self) -> bool {
        self.learnings_path().exists()
    }

    /// Read learnings from file
    pub fn read(&self) -> Result<LearningsFile, String> {
        let path = self.learnings_path();
        if !path.exists() {
            return Ok(LearningsFile::default());
        }
        read_json(&path)
    }

    /// Write learnings to file (atomic)
    pub fn write(&self, learnings: &LearningsFile) -> Result<(), String> {
        ensure_dir(&self.briefs_dir())?;

        let content = serde_json::to_string_pretty(learnings)
            .map_err(|e| format!("Failed to serialize learnings: {}", e))?;

        atomic_write(&self.learnings_path(), &content)
    }

    /// Initialize learnings file
    pub fn initialize(&self) -> Result<LearningsFile, String> {
        let learnings = LearningsFile::default();
        self.write(&learnings)?;
        Ok(learnings)
    }

    /// Add a learning entry
    pub fn add_learning(&self, entry: LearningEntry) -> Result<(), String> {
        let mut file = self.read()?;
        file.add_entry(entry);
        self.write(&file)
    }

    /// Add a simple learning (from iteration + content)
    pub fn add_simple(&self, iteration: u32, content: &str) -> Result<(), String> {
        let entry = LearningEntry::new(iteration, content);
        self.add_learning(entry)
    }

    /// Add a typed learning
    pub fn add_typed(
        &self,
        iteration: u32,
        learning_type: LearningType,
        content: &str,
    ) -> Result<(), String> {
        let entry = LearningEntry::with_type(iteration, learning_type, content);
        self.add_learning(entry)
    }

    /// Get formatted learnings for BRIEF.md
    pub fn format_for_brief(&self) -> Result<String, String> {
        let file = self.read()?;
        Ok(file.format_for_brief())
    }

    /// Get learnings count by type
    pub fn get_counts(&self) -> Result<std::collections::HashMap<LearningType, usize>, String> {
        let file = self.read()?;
        Ok(file.count_by_type())
    }

    /// Export to markdown
    pub fn export_markdown(&self) -> Result<String, String> {
        let file = self.read()?;
        Ok(file.export_to_markdown())
    }

    /// Check if there are any learnings
    pub fn has_learnings(&self) -> Result<bool, String> {
        let file = self.read()?;
        Ok(!file.entries.is_empty())
    }

    /// Get total learning count
    pub fn count(&self) -> Result<usize, String> {
        let file = self.read()?;
        Ok(file.entries.len())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_test_dir() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn test_learning_type_display() {
        assert_eq!(LearningType::Architecture.to_string(), "Architecture");
        assert_eq!(LearningType::Gotcha.to_string(), "Gotcha");
        assert_eq!(LearningType::Pattern.to_string(), "Pattern");
        assert_eq!(LearningType::Testing.to_string(), "Testing");
        assert_eq!(LearningType::Tooling.to_string(), "Tooling");
        assert_eq!(LearningType::General.to_string(), "General");
    }

    #[test]
    fn test_learning_type_from_str() {
        assert_eq!("architecture".parse::<LearningType>().unwrap(), LearningType::Architecture);
        assert_eq!("gotcha".parse::<LearningType>().unwrap(), LearningType::Gotcha);
        assert_eq!("PATTERN".parse::<LearningType>().unwrap(), LearningType::Pattern);
        assert!("unknown".parse::<LearningType>().is_err());
    }

    #[test]
    fn test_learning_entry_new() {
        let entry = LearningEntry::new(1, "Test learning");
        assert_eq!(entry.iteration, 1);
        assert_eq!(entry.content, "Test learning");
        assert_eq!(entry.learning_type, LearningType::General);
        assert_eq!(entry.source, "agent");
        assert!(entry.story_id.is_none());
    }

    #[test]
    fn test_learning_entry_builder() {
        let entry = LearningEntry::with_type(2, LearningType::Gotcha, "Watch out for this")
            .for_story("US-1.1")
            .with_code("let x = 1;")
            .from_human();

        assert_eq!(entry.iteration, 2);
        assert_eq!(entry.learning_type, LearningType::Gotcha);
        assert_eq!(entry.story_id, Some("US-1.1".to_string()));
        assert_eq!(entry.code_example, Some("let x = 1;".to_string()));
        assert_eq!(entry.source, "human");
    }

    #[test]
    fn test_learnings_file_default() {
        let file = LearningsFile::default();
        assert!(file.entries.is_empty());
        assert_eq!(file.total_iterations, 0);
    }

    #[test]
    fn test_learnings_file_add_entry() {
        let mut file = LearningsFile::default();

        file.add_entry(LearningEntry::new(1, "First"));
        assert_eq!(file.entries.len(), 1);
        assert_eq!(file.total_iterations, 1);

        file.add_entry(LearningEntry::new(5, "Fifth"));
        assert_eq!(file.entries.len(), 2);
        assert_eq!(file.total_iterations, 5);
    }

    #[test]
    fn test_learnings_file_get_by_type() {
        let mut file = LearningsFile::default();

        file.add_entry(LearningEntry::with_type(1, LearningType::Gotcha, "Gotcha 1"));
        file.add_entry(LearningEntry::with_type(1, LearningType::Pattern, "Pattern 1"));
        file.add_entry(LearningEntry::with_type(2, LearningType::Gotcha, "Gotcha 2"));

        let gotchas = file.get_by_type(LearningType::Gotcha);
        assert_eq!(gotchas.len(), 2);

        let patterns = file.get_by_type(LearningType::Pattern);
        assert_eq!(patterns.len(), 1);
    }

    #[test]
    fn test_learnings_file_format_for_brief() {
        let mut file = LearningsFile::default();

        file.add_entry(LearningEntry::with_type(1, LearningType::Gotcha, "Watch out for X"));
        file.add_entry(LearningEntry::with_type(2, LearningType::Pattern, "Use pattern Y"));

        let formatted = file.format_for_brief();
        assert!(formatted.contains("### Gotcha"));
        assert!(formatted.contains("Watch out for X"));
        assert!(formatted.contains("### Pattern"));
        assert!(formatted.contains("Use pattern Y"));
    }

    #[test]
    fn test_learnings_file_format_with_code() {
        let mut file = LearningsFile::default();

        let entry = LearningEntry::with_type(1, LearningType::Pattern, "Use this pattern")
            .with_code("fn example() {}");
        file.add_entry(entry);

        let formatted = file.format_for_brief();
        assert!(formatted.contains("```"));
        assert!(formatted.contains("fn example() {}"));
    }

    #[test]
    fn test_learnings_manager_read_write() {
        let temp_dir = setup_test_dir();
        let manager = LearningsManager::new(temp_dir.path(), "test-prd");

        // Initialize
        let file = manager.initialize().unwrap();
        assert!(manager.exists());
        assert!(file.entries.is_empty());

        // Read back
        let read_file = manager.read().unwrap();
        assert!(read_file.entries.is_empty());
    }

    #[test]
    fn test_learnings_manager_add_learning() {
        let temp_dir = setup_test_dir();
        let manager = LearningsManager::new(temp_dir.path(), "test-prd");

        manager.add_simple(1, "Test learning").unwrap();
        assert!(manager.exists());

        let file = manager.read().unwrap();
        assert_eq!(file.entries.len(), 1);
        assert_eq!(file.entries[0].content, "Test learning");
    }

    #[test]
    fn test_learnings_manager_add_typed() {
        let temp_dir = setup_test_dir();
        let manager = LearningsManager::new(temp_dir.path(), "test-prd");

        manager.add_typed(1, LearningType::Gotcha, "Watch out!").unwrap();

        let counts = manager.get_counts().unwrap();
        assert_eq!(counts.get(&LearningType::Gotcha), Some(&1));
    }

    #[test]
    fn test_learnings_manager_format_for_brief() {
        let temp_dir = setup_test_dir();
        let manager = LearningsManager::new(temp_dir.path(), "test-prd");

        manager.add_typed(1, LearningType::Pattern, "Use pattern X").unwrap();
        manager.add_typed(2, LearningType::Gotcha, "Avoid Y").unwrap();

        let formatted = manager.format_for_brief().unwrap();
        assert!(formatted.contains("### Gotcha"));
        assert!(formatted.contains("### Pattern"));
    }

    #[test]
    fn test_learnings_manager_has_learnings() {
        let temp_dir = setup_test_dir();
        let manager = LearningsManager::new(temp_dir.path(), "test-prd");

        assert!(!manager.has_learnings().unwrap());

        manager.add_simple(1, "Test").unwrap();
        assert!(manager.has_learnings().unwrap());
    }

    #[test]
    fn test_learnings_serialization() {
        let mut file = LearningsFile::default();
        let entry = LearningEntry::with_type(1, LearningType::Gotcha, "Watch out")
            .for_story("US-1.1")
            .with_code("example code");
        file.add_entry(entry);

        let json = serde_json::to_string_pretty(&file).unwrap();
        assert!(json.contains("gotcha"));
        assert!(json.contains("Watch out"));
        assert!(json.contains("US-1.1"));
        assert!(json.contains("example code"));

        // Round trip
        let parsed: LearningsFile = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.entries.len(), 1);
        assert_eq!(parsed.entries[0].learning_type, LearningType::Gotcha);
    }

    #[test]
    fn test_count_by_type() {
        let mut file = LearningsFile::default();

        file.add_entry(LearningEntry::with_type(1, LearningType::Gotcha, "G1"));
        file.add_entry(LearningEntry::with_type(2, LearningType::Gotcha, "G2"));
        file.add_entry(LearningEntry::with_type(3, LearningType::Pattern, "P1"));

        let counts = file.count_by_type();
        assert_eq!(counts.get(&LearningType::Gotcha), Some(&2));
        assert_eq!(counts.get(&LearningType::Pattern), Some(&1));
        assert_eq!(counts.get(&LearningType::Architecture), None);
    }
}
