//! Progress Tracker - Manages progress.txt for learnings across iterations
//!
//! The progress.txt file accumulates learnings across agent iterations.
//! Each fresh agent instance reads this file to catch up on context
//! from previous iterations.
//!
//! File location: `.ralph-ui/prds/{prd_name}-progress.txt`

use super::types::{ProgressEntry, ProgressEntryType};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

/// Progress tracker for managing progress.txt files
///
/// Files are stored at `.ralph-ui/prds/{prd_name}-progress.txt`
pub struct ProgressTracker {
    /// Base project path
    project_path: PathBuf,
    /// PRD name (required)
    prd_name: String,
}

impl ProgressTracker {
    /// Create a new progress tracker
    ///
    /// # Arguments
    /// * `project_path` - Path to the project root
    /// * `prd_name` - The PRD filename (without extension), e.g., "my-feature-a1b2c3d4"
    pub fn new(project_path: &Path, prd_name: &str) -> Self {
        Self {
            project_path: project_path.to_path_buf(),
            prd_name: prd_name.to_string(),
        }
    }

    /// Get the path to progress.txt
    pub fn progress_path(&self) -> PathBuf {
        self.project_path
            .join(".ralph-ui")
            .join("prds")
            .join(format!("{}-progress.txt", self.prd_name))
    }

    /// Get the directory containing the progress file
    fn progress_dir(&self) -> PathBuf {
        self.project_path.join(".ralph-ui").join("prds")
    }

    /// Check if progress.txt exists
    pub fn progress_exists(&self) -> bool {
        self.progress_path().exists()
    }

    /// Initialize progress.txt with header
    pub fn initialize(&self) -> Result<(), String> {
        // Ensure progress directory exists
        let progress_dir = self.progress_dir();
        std::fs::create_dir_all(&progress_dir).map_err(|e| {
            format!(
                "Failed to create progress directory {:?}: {}",
                progress_dir, e
            )
        })?;

        let path = self.progress_path();

        // Don't overwrite if already exists
        if path.exists() {
            return Ok(());
        }

        let header = format!(
            "# Ralph Wiggum Loop Progress\n\
             # This file tracks learnings across agent iterations.\n\
             # Each agent reads this file to catch up on context.\n\
             # Initialized: {}\n\n",
            chrono::Utc::now().to_rfc3339()
        );

        std::fs::write(&path, header)
            .map_err(|e| format!("Failed to write progress.txt: {}", e))?;

        Ok(())
    }

    /// Append an entry to progress.txt
    pub fn append_entry(&self, entry: &ProgressEntry) -> Result<(), String> {
        let path = self.progress_path();

        // Initialize if doesn't exist
        if !path.exists() {
            self.initialize()?;
        }

        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .map_err(|e| format!("Failed to open progress.txt: {}", e))?;

        let line = format!(
            "[{}] [Iter {}] [{}] {}\n",
            entry.timestamp, entry.iteration, entry.entry_type, entry.content
        );

        file.write_all(line.as_bytes())
            .map_err(|e| format!("Failed to write to progress.txt: {}", e))?;

        Ok(())
    }

    /// Record the start of an iteration
    pub fn start_iteration(&self, iteration: u32) -> Result<(), String> {
        let entry = ProgressEntry {
            iteration,
            timestamp: chrono::Utc::now().to_rfc3339(),
            entry_type: ProgressEntryType::IterationStart,
            content: format!("Starting iteration {}", iteration),
        };
        self.append_entry(&entry)
    }

    /// Record the end of an iteration
    pub fn end_iteration(&self, iteration: u32, success: bool) -> Result<(), String> {
        let status = if success {
            "completed successfully"
        } else {
            "failed"
        };
        let entry = ProgressEntry {
            iteration,
            timestamp: chrono::Utc::now().to_rfc3339(),
            entry_type: ProgressEntryType::IterationEnd,
            content: format!("Iteration {} {}", iteration, status),
        };
        self.append_entry(&entry)
    }

    /// Record a learning/insight
    pub fn add_learning(&self, iteration: u32, learning: &str) -> Result<(), String> {
        let entry = ProgressEntry {
            iteration,
            timestamp: chrono::Utc::now().to_rfc3339(),
            entry_type: ProgressEntryType::Learning,
            content: learning.to_string(),
        };
        self.append_entry(&entry)
    }

    /// Record an error
    pub fn add_error(&self, iteration: u32, error: &str) -> Result<(), String> {
        let entry = ProgressEntry {
            iteration,
            timestamp: chrono::Utc::now().to_rfc3339(),
            entry_type: ProgressEntryType::Error,
            content: error.to_string(),
        };
        self.append_entry(&entry)
    }

    /// Record a story completion
    pub fn add_story_completed(
        &self,
        iteration: u32,
        story_id: &str,
        story_title: &str,
    ) -> Result<(), String> {
        let entry = ProgressEntry {
            iteration,
            timestamp: chrono::Utc::now().to_rfc3339(),
            entry_type: ProgressEntryType::StoryCompleted,
            content: format!("Story '{}' ({}) marked as passing", story_title, story_id),
        };
        self.append_entry(&entry)
    }

    /// Add a manual note
    pub fn add_note(&self, iteration: u32, note: &str) -> Result<(), String> {
        let entry = ProgressEntry {
            iteration,
            timestamp: chrono::Utc::now().to_rfc3339(),
            entry_type: ProgressEntryType::Note,
            content: note.to_string(),
        };
        self.append_entry(&entry)
    }

    /// Read all entries from progress.txt
    pub fn read_entries(&self) -> Result<Vec<ProgressEntry>, String> {
        let path = self.progress_path();

        if !path.exists() {
            return Ok(Vec::new());
        }

        let file = std::fs::File::open(&path)
            .map_err(|e| format!("Failed to open progress.txt: {}", e))?;

        let reader = BufReader::new(file);
        let mut entries = Vec::new();

        for line in reader.lines() {
            let line = line.map_err(|e| format!("Failed to read line: {}", e))?;

            // Skip comments and empty lines
            if line.starts_with('#') || line.trim().is_empty() {
                continue;
            }

            // Parse entry format: [timestamp] [Iter N] [TYPE] content
            if let Some(entry) = self.parse_entry_line(&line) {
                entries.push(entry);
            }
        }

        Ok(entries)
    }

    /// Parse a single entry line
    fn parse_entry_line(&self, line: &str) -> Option<ProgressEntry> {
        // Format: [timestamp] [Iter N] [TYPE] content
        let re = regex::Regex::new(r"^\[([^\]]+)\] \[Iter (\d+)\] \[([^\]]+)\] (.*)$").ok()?;

        let caps = re.captures(line)?;
        let timestamp = caps.get(1)?.as_str().to_string();
        let iteration: u32 = caps.get(2)?.as_str().parse().ok()?;
        let entry_type_str = caps.get(3)?.as_str();
        let content = caps.get(4)?.as_str().to_string();

        let entry_type = match entry_type_str {
            "START" => ProgressEntryType::IterationStart,
            "END" => ProgressEntryType::IterationEnd,
            "LEARNING" => ProgressEntryType::Learning,
            "ERROR" => ProgressEntryType::Error,
            "COMPLETED" => ProgressEntryType::StoryCompleted,
            "NOTE" => ProgressEntryType::Note,
            _ => return None,
        };

        Some(ProgressEntry {
            iteration,
            timestamp,
            entry_type,
            content,
        })
    }

    /// Read the raw content of progress.txt
    pub fn read_raw(&self) -> Result<String, String> {
        let path = self.progress_path();

        if !path.exists() {
            return Ok(String::new());
        }

        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read progress.txt: {}", e))
    }

    /// Get entries for a specific iteration
    pub fn get_iteration_entries(&self, iteration: u32) -> Result<Vec<ProgressEntry>, String> {
        let entries = self.read_entries()?;
        Ok(entries
            .into_iter()
            .filter(|e| e.iteration == iteration)
            .collect())
    }

    /// Get all learnings (filtering out other entry types)
    pub fn get_learnings(&self) -> Result<Vec<ProgressEntry>, String> {
        let entries = self.read_entries()?;
        Ok(entries
            .into_iter()
            .filter(|e| e.entry_type == ProgressEntryType::Learning)
            .collect())
    }

    /// Read learnings as a formatted string for inclusion in BRIEF.md
    ///
    /// Returns learnings formatted as bullet points for easy agent consumption.
    /// This is used by the BriefBuilder to include accumulated context.
    pub fn read_learnings(&self) -> Result<String, String> {
        let learnings = self.get_learnings()?;

        if learnings.is_empty() {
            return Ok(String::new());
        }

        let mut output = String::new();
        for entry in learnings {
            output.push_str(&format!("- [Iter {}] {}\n", entry.iteration, entry.content));
        }
        Ok(output)
    }

    /// Get summary statistics
    pub fn get_summary(&self) -> Result<ProgressSummary, String> {
        let entries = self.read_entries()?;

        let total_entries = entries.len();
        let total_iterations = entries.iter().map(|e| e.iteration).max().unwrap_or(0);

        let learnings_count = entries
            .iter()
            .filter(|e| e.entry_type == ProgressEntryType::Learning)
            .count();

        let errors_count = entries
            .iter()
            .filter(|e| e.entry_type == ProgressEntryType::Error)
            .count();

        let stories_completed = entries
            .iter()
            .filter(|e| e.entry_type == ProgressEntryType::StoryCompleted)
            .count();

        Ok(ProgressSummary {
            total_entries,
            total_iterations,
            learnings_count,
            errors_count,
            stories_completed,
        })
    }

    /// Clear progress.txt and reinitialize
    pub fn clear(&self) -> Result<(), String> {
        let path = self.progress_path();
        if path.exists() {
            std::fs::remove_file(&path)
                .map_err(|e| format!("Failed to remove progress.txt: {}", e))?;
        }
        self.initialize()
    }

    /// Append raw text (for agent-written content)
    pub fn append_raw(&self, content: &str) -> Result<(), String> {
        let path = self.progress_path();

        // Initialize if doesn't exist
        if !path.exists() {
            self.initialize()?;
        }

        let mut file = std::fs::OpenOptions::new()
            .append(true)
            .open(&path)
            .map_err(|e| format!("Failed to open progress.txt: {}", e))?;

        file.write_all(content.as_bytes())
            .map_err(|e| format!("Failed to write to progress.txt: {}", e))?;

        // Ensure newline at end
        if !content.ends_with('\n') {
            file.write_all(b"\n")
                .map_err(|e| format!("Failed to write newline: {}", e))?;
        }

        Ok(())
    }
}

/// Summary of progress.txt
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressSummary {
    pub total_entries: usize,
    pub total_iterations: u32,
    pub learnings_count: usize,
    pub errors_count: usize,
    pub stories_completed: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_test_dir() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn test_initialize() {
        let temp_dir = setup_test_dir();
        let tracker = ProgressTracker::new(temp_dir.path(), "test-prd");

        tracker.initialize().unwrap();
        assert!(tracker.progress_exists());

        let content = tracker.read_raw().unwrap();
        assert!(content.contains("Ralph Wiggum Loop Progress"));
    }

    #[test]
    fn test_append_entries() {
        let temp_dir = setup_test_dir();
        let tracker = ProgressTracker::new(temp_dir.path(), "test-prd");

        tracker.start_iteration(1).unwrap();
        tracker.add_learning(1, "Discovered API pattern").unwrap();
        tracker.end_iteration(1, true).unwrap();

        let entries = tracker.read_entries().unwrap();
        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].entry_type, ProgressEntryType::IterationStart);
        assert_eq!(entries[1].entry_type, ProgressEntryType::Learning);
        assert_eq!(entries[1].content, "Discovered API pattern");
        assert_eq!(entries[2].entry_type, ProgressEntryType::IterationEnd);
    }

    #[test]
    fn test_get_learnings() {
        let temp_dir = setup_test_dir();
        let tracker = ProgressTracker::new(temp_dir.path(), "test-prd");

        tracker.start_iteration(1).unwrap();
        tracker.add_learning(1, "Learning 1").unwrap();
        tracker.add_error(1, "Error 1").unwrap();
        tracker.add_learning(1, "Learning 2").unwrap();

        let learnings = tracker.get_learnings().unwrap();
        assert_eq!(learnings.len(), 2);
        assert_eq!(learnings[0].content, "Learning 1");
        assert_eq!(learnings[1].content, "Learning 2");
    }

    #[test]
    fn test_get_summary() {
        let temp_dir = setup_test_dir();
        let tracker = ProgressTracker::new(temp_dir.path(), "test-prd");

        tracker.start_iteration(1).unwrap();
        tracker.add_learning(1, "Learning").unwrap();
        tracker.add_error(1, "Error").unwrap();
        tracker
            .add_story_completed(1, "story-1", "Test Story")
            .unwrap();
        tracker.end_iteration(1, true).unwrap();

        let summary = tracker.get_summary().unwrap();
        assert_eq!(summary.total_iterations, 1);
        assert_eq!(summary.learnings_count, 1);
        assert_eq!(summary.errors_count, 1);
        assert_eq!(summary.stories_completed, 1);
    }

    #[test]
    fn test_clear() {
        let temp_dir = setup_test_dir();
        let tracker = ProgressTracker::new(temp_dir.path(), "test-prd");

        tracker.add_learning(1, "Test").unwrap();
        let entries = tracker.read_entries().unwrap();
        assert_eq!(entries.len(), 1);

        tracker.clear().unwrap();
        let entries = tracker.read_entries().unwrap();
        assert_eq!(entries.len(), 0);
    }
}
