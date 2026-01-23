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

    /// Format learnings for inclusion in BRIEF.md (US-3.2)
    ///
    /// Learnings are:
    /// - Grouped by type for easy scanning
    /// - Sorted by most recent (highest iteration) first within each group
    /// - Code examples include syntax-highlighted code fences with language detection
    pub fn format_for_brief(&self) -> String {
        if self.entries.is_empty() {
            return String::new();
        }

        let mut output = String::new();

        // Group by type (Gotcha first as most actionable)
        let types = [
            LearningType::Gotcha,
            LearningType::Pattern,
            LearningType::Architecture,
            LearningType::Testing,
            LearningType::Tooling,
            LearningType::General,
        ];

        for learning_type in types {
            let mut entries: Vec<_> = self.get_by_type(learning_type);
            if !entries.is_empty() {
                // US-3.2: Sort by most recent iteration first (higher = more recent = more useful)
                entries.sort_by(|a, b| b.iteration.cmp(&a.iteration));

                output.push_str(&format!("### {}\n\n", learning_type));
                for entry in entries {
                    output.push_str(&format!("- [Iter {}] {}\n", entry.iteration, entry.content));
                    if let Some(ref code) = entry.code_example {
                        // US-3.2: Detect language for syntax highlighting
                        let lang = Self::detect_code_language(code);
                        output.push_str(&format!("  ```{}\n", lang));
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

    /// Detect programming language from code snippet for syntax highlighting (US-3.2)
    fn detect_code_language(code: &str) -> &'static str {
        let code_lower = code.to_lowercase();

        // Rust patterns
        if code.contains("fn ") || code.contains("let mut ")
            || code.contains("impl ") || code.contains("pub fn")
            || code.contains("::") && (code.contains("Result<") || code.contains("Option<"))
            || code.contains("unwrap()") || code.contains(".map_err(")
        {
            return "rust";
        }

        // TypeScript/JavaScript patterns
        if code.contains("const ") || code.contains("interface ")
            || code.contains("export ") || code.contains("import ")
            || code.contains("=> {") || code.contains("useState")
            || code.contains(": string") || code.contains(": number")
            || code.contains("async function") || code.contains(".tsx")
        {
            if code.contains(": string") || code.contains(": number")
                || code.contains("interface ") || code.contains("<T>")
            {
                return "typescript";
            }
            return "javascript";
        }

        // Python patterns
        if code.contains("def ") || code.contains("import ")
            || code_lower.contains("self.") || code.contains("__init__")
            || code.contains("elif ") || code.contains("print(")
        {
            return "python";
        }

        // JSON patterns
        if code.trim().starts_with('{') && code.trim().ends_with('}')
            && code.contains("\":")
        {
            return "json";
        }

        // Shell/bash patterns
        if code.contains("#!/") || code.starts_with("$")
            || code.contains("&&") || code.contains("echo ")
            || code.contains("cargo ") || code.contains("npm ")
            || code.contains("bun ") || code.contains("git ")
        {
            return "bash";
        }

        // Default to empty (markdown will still render as code block)
        ""
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

/// A learning parsed from agent output using the structured protocol
#[derive(Debug, Clone)]
pub struct ParsedLearning {
    /// Type/category of the learning
    pub learning_type: LearningType,
    /// The learning content (description)
    pub content: String,
    /// Optional code example
    pub code_example: Option<String>,
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

    /// Parse learnings from agent output using the structured protocol (US-3.1)
    ///
    /// Agents report learnings using XML-like tags:
    /// ```text
    /// <learning type="pattern">Description of the pattern</learning>
    /// <learning type="gotcha">
    /// Warning about something
    /// <code>
    /// example code here
    /// </code>
    /// </learning>
    /// ```
    ///
    /// This function extracts all `<learning>` tags from the output and parses
    /// them into structured `ParsedLearning` entries.
    pub fn parse_learnings_from_output(output: &str) -> Vec<ParsedLearning> {
        let mut learnings = Vec::new();

        // Using a simple state machine approach for robustness
        let mut pos = 0;

        while pos < output.len() {
            // Find opening tag
            let remaining = &output[pos..];
            if let Some(start_idx) = remaining.find("<learning") {
                let tag_start = pos + start_idx;
                let tag_content = &output[tag_start..];

                // Find the closing > of the opening tag
                if let Some(tag_end_offset) = tag_content.find('>') {
                    let opening_tag = &tag_content[..tag_end_offset + 1];

                    // Extract type attribute
                    let learning_type = Self::extract_type_attribute(opening_tag);

                    // Find the closing </learning> tag
                    let after_tag = &tag_content[tag_end_offset + 1..];
                    if let Some(close_idx) = after_tag.find("</learning>") {
                        let content = &after_tag[..close_idx];

                        // Parse content and optional code
                        let (text_content, code_example) = Self::parse_learning_content(content);

                        if !text_content.trim().is_empty() {
                            learnings.push(ParsedLearning {
                                learning_type,
                                content: text_content.trim().to_string(),
                                code_example,
                            });
                        }

                        // Move past this learning
                        pos = tag_start + tag_end_offset + 1 + close_idx + "</learning>".len();
                        continue;
                    }
                }
            }

            // No more learnings found
            break;
        }

        learnings
    }

    /// Extract the type attribute from an opening <learning type="..."> tag
    fn extract_type_attribute(opening_tag: &str) -> LearningType {
        // Look for type="..." or type='...'
        if let Some(type_start) = opening_tag.find("type=") {
            let after_type = &opening_tag[type_start + 5..];
            let quote_char = after_type.chars().next();

            if let Some(q) = quote_char {
                if q == '"' || q == '\'' {
                    let value_start = &after_type[1..];
                    if let Some(end_idx) = value_start.find(q) {
                        let type_value = &value_start[..end_idx];
                        return type_value.parse().unwrap_or(LearningType::General);
                    }
                }
            }
        }
        LearningType::General
    }

    /// Parse the content of a learning, extracting optional <code>...</code> block
    fn parse_learning_content(content: &str) -> (String, Option<String>) {
        // Look for <code>...</code> block
        if let Some(code_start) = content.find("<code>") {
            if let Some(code_end) = content.find("</code>") {
                let before_code = &content[..code_start];
                let code_content = &content[code_start + 6..code_end];
                let after_code = &content[code_end + 7..];

                let text_content = format!("{}{}", before_code.trim(), after_code.trim());
                let code = code_content.trim().to_string();

                return (
                    text_content,
                    if code.is_empty() { None } else { Some(code) },
                );
            }
        }

        (content.to_string(), None)
    }

    /// Extract learnings from agent output and save them to storage (US-3.1)
    ///
    /// This is the main integration point for the orchestrator. It:
    /// 1. Parses the agent output for <learning> tags
    /// 2. Creates LearningEntry objects with proper iteration and story context
    /// 3. Saves them to the learnings.json file
    ///
    /// Returns the number of learnings extracted.
    pub fn extract_and_save_learnings(
        &self,
        output: &str,
        iteration: u32,
        story_id: Option<&str>,
    ) -> Result<usize, String> {
        let parsed = Self::parse_learnings_from_output(output);

        if parsed.is_empty() {
            return Ok(0);
        }

        let mut file = self.read()?;

        for parsed_learning in &parsed {
            let mut entry = LearningEntry::with_type(
                iteration,
                parsed_learning.learning_type,
                &parsed_learning.content,
            );

            if let Some(sid) = story_id {
                entry = entry.for_story(sid);
            }

            if let Some(ref code) = parsed_learning.code_example {
                entry = entry.with_code(code);
            }

            file.add_entry(entry);
        }

        self.write(&file)?;

        Ok(parsed.len())
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

    // =========================================================================
    // US-3.1: Learning Protocol Parsing Tests
    // =========================================================================

    #[test]
    fn test_parse_simple_learning() {
        let output = r#"
Some agent output here
<learning type="pattern">Use atomic writes for file operations</learning>
More output
"#;

        let learnings = LearningsManager::parse_learnings_from_output(output);
        assert_eq!(learnings.len(), 1);
        assert_eq!(learnings[0].learning_type, LearningType::Pattern);
        assert_eq!(learnings[0].content, "Use atomic writes for file operations");
        assert!(learnings[0].code_example.is_none());
    }

    #[test]
    fn test_parse_learning_with_code() {
        let output = r#"
<learning type="pattern">
Use atomic writes for file operations
<code>
let temp_path = path.with_extension("tmp");
std::fs::write(&temp_path, content)?;
std::fs::rename(&temp_path, &path)?;
</code>
</learning>
"#;

        let learnings = LearningsManager::parse_learnings_from_output(output);
        assert_eq!(learnings.len(), 1);
        assert_eq!(learnings[0].learning_type, LearningType::Pattern);
        assert!(learnings[0].content.contains("atomic writes"));
        assert!(learnings[0].code_example.is_some());
        let code = learnings[0].code_example.as_ref().unwrap();
        assert!(code.contains("temp_path"));
        assert!(code.contains("rename"));
    }

    #[test]
    fn test_parse_multiple_learnings() {
        let output = r#"
<learning type="gotcha">Watch out for race conditions in async code</learning>
Some other text here
<learning type="architecture">Follow hexagonal architecture pattern</learning>
<learning type="testing">Use table-driven tests for exhaustive coverage</learning>
"#;

        let learnings = LearningsManager::parse_learnings_from_output(output);
        assert_eq!(learnings.len(), 3);

        assert_eq!(learnings[0].learning_type, LearningType::Gotcha);
        assert!(learnings[0].content.contains("race conditions"));

        assert_eq!(learnings[1].learning_type, LearningType::Architecture);
        assert!(learnings[1].content.contains("hexagonal"));

        assert_eq!(learnings[2].learning_type, LearningType::Testing);
        assert!(learnings[2].content.contains("table-driven"));
    }

    #[test]
    fn test_parse_learning_with_all_types() {
        let test_cases = vec![
            ("architecture", LearningType::Architecture),
            ("gotcha", LearningType::Gotcha),
            ("pattern", LearningType::Pattern),
            ("testing", LearningType::Testing),
            ("tooling", LearningType::Tooling),
        ];

        for (type_str, expected_type) in test_cases {
            let output = format!(r#"<learning type="{}">Test content</learning>"#, type_str);
            let learnings = LearningsManager::parse_learnings_from_output(&output);
            assert_eq!(learnings.len(), 1);
            assert_eq!(learnings[0].learning_type, expected_type, "Failed for type: {}", type_str);
        }
    }

    #[test]
    fn test_parse_learning_unknown_type_defaults_to_general() {
        let output = r#"<learning type="unknown">Some content</learning>"#;

        let learnings = LearningsManager::parse_learnings_from_output(output);
        assert_eq!(learnings.len(), 1);
        assert_eq!(learnings[0].learning_type, LearningType::General);
    }

    #[test]
    fn test_parse_learning_single_quotes() {
        let output = r#"<learning type='gotcha'>Watch out for this</learning>"#;

        let learnings = LearningsManager::parse_learnings_from_output(output);
        assert_eq!(learnings.len(), 1);
        assert_eq!(learnings[0].learning_type, LearningType::Gotcha);
    }

    #[test]
    fn test_parse_no_learnings() {
        let output = "Some regular output without any learnings";

        let learnings = LearningsManager::parse_learnings_from_output(output);
        assert!(learnings.is_empty());
    }

    #[test]
    fn test_parse_empty_learning_ignored() {
        let output = r#"<learning type="pattern">   </learning>"#;

        let learnings = LearningsManager::parse_learnings_from_output(output);
        assert!(learnings.is_empty());
    }

    #[test]
    fn test_extract_and_save_learnings() {
        let temp_dir = setup_test_dir();
        let manager = LearningsManager::new(temp_dir.path(), "test-prd");

        let output = r#"
Working on the task...
<learning type="pattern">Follow the existing component structure</learning>
<learning type="gotcha">
Don't forget to handle null values
<code>
if value.is_none() { return Err(...) }
</code>
</learning>
Task complete!
"#;

        let count = manager.extract_and_save_learnings(output, 1, Some("US-1.1")).unwrap();
        assert_eq!(count, 2);

        // Verify they were saved
        let file = manager.read().unwrap();
        assert_eq!(file.entries.len(), 2);

        // Check first learning
        assert_eq!(file.entries[0].learning_type, LearningType::Pattern);
        assert_eq!(file.entries[0].story_id, Some("US-1.1".to_string()));
        assert_eq!(file.entries[0].iteration, 1);

        // Check second learning has code
        assert_eq!(file.entries[1].learning_type, LearningType::Gotcha);
        assert!(file.entries[1].code_example.is_some());
    }

    #[test]
    fn test_extract_and_save_no_learnings() {
        let temp_dir = setup_test_dir();
        let manager = LearningsManager::new(temp_dir.path(), "test-prd");

        let output = "Just some regular output with no learning tags";

        let count = manager.extract_and_save_learnings(output, 1, None).unwrap();
        assert_eq!(count, 0);

        // Verify file was created but empty
        let file = manager.read().unwrap();
        assert!(file.entries.is_empty());
    }

    #[test]
    fn test_learnings_categorized_by_type() {
        // US-3.1: Learnings categorized by type: Architecture, Gotcha, Pattern, Testing, Tooling
        let temp_dir = setup_test_dir();
        let manager = LearningsManager::new(temp_dir.path(), "test-prd");

        // Add learnings of different types
        manager.add_typed(1, LearningType::Architecture, "Codebase uses MVC pattern").unwrap();
        manager.add_typed(1, LearningType::Gotcha, "Watch out for async timing").unwrap();
        manager.add_typed(2, LearningType::Pattern, "Use builder pattern for configs").unwrap();
        manager.add_typed(2, LearningType::Testing, "Always test edge cases").unwrap();
        manager.add_typed(3, LearningType::Tooling, "Run cargo fmt before commit").unwrap();

        let file = manager.read().unwrap();

        // Verify categorization
        let arch = file.get_by_type(LearningType::Architecture);
        assert_eq!(arch.len(), 1);
        assert!(arch[0].content.contains("MVC"));

        let gotchas = file.get_by_type(LearningType::Gotcha);
        assert_eq!(gotchas.len(), 1);
        assert!(gotchas[0].content.contains("async"));

        let patterns = file.get_by_type(LearningType::Pattern);
        assert_eq!(patterns.len(), 1);
        assert!(patterns[0].content.contains("builder"));

        let testing = file.get_by_type(LearningType::Testing);
        assert_eq!(testing.len(), 1);
        assert!(testing[0].content.contains("edge cases"));

        let tooling = file.get_by_type(LearningType::Tooling);
        assert_eq!(tooling.len(), 1);
        assert!(tooling[0].content.contains("cargo fmt"));
    }

    #[test]
    fn test_learnings_persist_across_sessions() {
        // US-3.1: Learnings persist across sessions and restarts
        let temp_dir = setup_test_dir();

        // Session 1: Add learnings
        {
            let manager = LearningsManager::new(temp_dir.path(), "test-prd");
            manager.add_typed(1, LearningType::Pattern, "Learning from session 1").unwrap();
            manager.add_typed(2, LearningType::Gotcha, "Another learning").unwrap();
        }

        // Session 2: Verify learnings persisted
        {
            let manager = LearningsManager::new(temp_dir.path(), "test-prd");
            let file = manager.read().unwrap();
            assert_eq!(file.entries.len(), 2);

            // Add more learnings
            manager.add_typed(3, LearningType::Architecture, "New learning").unwrap();
        }

        // Session 3: Verify all learnings present
        {
            let manager = LearningsManager::new(temp_dir.path(), "test-prd");
            let file = manager.read().unwrap();
            assert_eq!(file.entries.len(), 3);
            assert_eq!(file.total_iterations, 3);
        }
    }

    #[test]
    fn test_learnings_stored_in_structured_json() {
        // US-3.1: Learnings stored in structured JSON format
        let temp_dir = setup_test_dir();
        let manager = LearningsManager::new(temp_dir.path(), "test-prd");

        // Add a learning with code
        let entry = LearningEntry::with_type(1, LearningType::Pattern, "Use builder pattern")
            .for_story("US-1.1")
            .with_code("let config = ConfigBuilder::new().build();");
        manager.add_learning(entry).unwrap();

        // Read the raw JSON file
        let json_path = manager.learnings_path();
        let raw_json = std::fs::read_to_string(json_path).unwrap();

        // Verify it's valid JSON with expected structure
        let parsed: serde_json::Value = serde_json::from_str(&raw_json).unwrap();

        assert!(parsed.get("entries").is_some());
        assert!(parsed.get("createdAt").is_some());
        assert!(parsed.get("lastUpdated").is_some());

        let entries = parsed.get("entries").unwrap().as_array().unwrap();
        assert_eq!(entries.len(), 1);

        let entry = &entries[0];
        assert_eq!(entry.get("learningType").unwrap(), "pattern");
        assert_eq!(entry.get("storyId").unwrap(), "US-1.1");
        assert!(entry.get("codeExample").is_some());
    }

    // =========================================================================
    // US-3.2: Share Learnings in Brief Tests
    // =========================================================================

    #[test]
    fn test_learnings_grouped_by_type_in_brief() {
        // US-3.2: Learnings grouped by type for easy scanning
        let mut file = LearningsFile::default();

        file.add_entry(LearningEntry::with_type(1, LearningType::Pattern, "Pattern A"));
        file.add_entry(LearningEntry::with_type(2, LearningType::Gotcha, "Gotcha A"));
        file.add_entry(LearningEntry::with_type(3, LearningType::Architecture, "Arch A"));
        file.add_entry(LearningEntry::with_type(1, LearningType::Pattern, "Pattern B"));

        let formatted = file.format_for_brief();

        // Verify type headers are present
        assert!(formatted.contains("### Gotcha"));
        assert!(formatted.contains("### Pattern"));
        assert!(formatted.contains("### Architecture"));

        // Verify Gotcha comes before Pattern (prioritized as more actionable)
        let gotcha_pos = formatted.find("### Gotcha").unwrap();
        let pattern_pos = formatted.find("### Pattern").unwrap();
        assert!(gotcha_pos < pattern_pos, "Gotcha should appear before Pattern");
    }

    #[test]
    fn test_learnings_syntax_highlighted_code_rust() {
        // US-3.2: Code patterns include syntax-highlighted examples
        let mut file = LearningsFile::default();

        let rust_code = "fn main() {\n    let x = 5;\n    println!(\"{}\", x);\n}";
        let entry = LearningEntry::with_type(1, LearningType::Pattern, "Rust example")
            .with_code(rust_code);
        file.add_entry(entry);

        let formatted = file.format_for_brief();

        // Should contain rust language specifier
        assert!(formatted.contains("```rust"), "Should have rust syntax highlighting");
        assert!(formatted.contains("fn main()"));
    }

    #[test]
    fn test_learnings_syntax_highlighted_code_typescript() {
        // US-3.2: Code patterns include syntax-highlighted examples
        let mut file = LearningsFile::default();

        // Use clearer TypeScript-specific syntax with type annotations
        let ts_code = "interface Config { name: string; value: number }\nconst x: string = 'hello';";
        let entry = LearningEntry::with_type(1, LearningType::Pattern, "TypeScript example")
            .with_code(ts_code);
        file.add_entry(entry);

        let formatted = file.format_for_brief();

        // Should contain typescript language specifier
        assert!(formatted.contains("```typescript"), "Should have typescript syntax highlighting");
    }

    #[test]
    fn test_learnings_syntax_highlighted_code_bash() {
        // US-3.2: Code patterns include syntax-highlighted examples
        let mut file = LearningsFile::default();

        let bash_code = "cargo test && cargo build";
        let entry = LearningEntry::with_type(1, LearningType::Tooling, "Build command")
            .with_code(bash_code);
        file.add_entry(entry);

        let formatted = file.format_for_brief();

        // Should contain bash language specifier
        assert!(formatted.contains("```bash"), "Should have bash syntax highlighting");
    }

    #[test]
    fn test_learnings_prioritized_most_recent_first() {
        // US-3.2: Most useful learnings prioritized (by most recent iteration first)
        let mut file = LearningsFile::default();

        // Add learnings in order: iter 1, iter 3, iter 2
        file.add_entry(LearningEntry::with_type(1, LearningType::Pattern, "Old pattern from iter 1"));
        file.add_entry(LearningEntry::with_type(3, LearningType::Pattern, "Newest pattern from iter 3"));
        file.add_entry(LearningEntry::with_type(2, LearningType::Pattern, "Middle pattern from iter 2"));

        let formatted = file.format_for_brief();

        // Find positions - iter 3 should come first, then iter 2, then iter 1
        let iter3_pos = formatted.find("[Iter 3]").unwrap();
        let iter2_pos = formatted.find("[Iter 2]").unwrap();
        let iter1_pos = formatted.find("[Iter 1]").unwrap();

        assert!(iter3_pos < iter2_pos, "Iter 3 should appear before Iter 2");
        assert!(iter2_pos < iter1_pos, "Iter 2 should appear before Iter 1");
    }

    #[test]
    fn test_detect_code_language_rust() {
        assert_eq!(LearningsFile::detect_code_language("fn main() {}"), "rust");
        assert_eq!(LearningsFile::detect_code_language("let mut x = 5;"), "rust");
        assert_eq!(LearningsFile::detect_code_language("impl Foo for Bar"), "rust");
        assert_eq!(LearningsFile::detect_code_language("pub fn test() { x.unwrap() }"), "rust");
    }

    #[test]
    fn test_detect_code_language_typescript() {
        assert_eq!(LearningsFile::detect_code_language("const x: string = 'hello'"), "typescript");
        assert_eq!(LearningsFile::detect_code_language("interface Foo { bar: number }"), "typescript");
    }

    #[test]
    fn test_detect_code_language_javascript() {
        assert_eq!(LearningsFile::detect_code_language("const x = () => {}"), "javascript");
        assert_eq!(LearningsFile::detect_code_language("export default function foo()"), "javascript");
    }

    #[test]
    fn test_detect_code_language_bash() {
        assert_eq!(LearningsFile::detect_code_language("cargo build && cargo test"), "bash");
        assert_eq!(LearningsFile::detect_code_language("npm install express"), "bash");
        assert_eq!(LearningsFile::detect_code_language("git commit -m 'test'"), "bash");
    }

    #[test]
    fn test_detect_code_language_json() {
        assert_eq!(LearningsFile::detect_code_language("{\"key\": \"value\"}"), "json");
    }

    #[test]
    fn test_detect_code_language_unknown() {
        // Unknown code should return empty string (still renders as code block)
        assert_eq!(LearningsFile::detect_code_language("some random text"), "");
    }
}
