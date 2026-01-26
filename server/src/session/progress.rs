// Progress file tracking for session recovery
// Maintains a progress.txt file that persists task state across interruptions

#![allow(dead_code)] // Progress tracking infrastructure

use anyhow::{anyhow, Result};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

/// Entry format for progress file
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProgressEntry {
    pub timestamp: DateTime<Utc>,
    pub session_id: String,
    pub task_id: String,
    pub status: ProgressStatus,
    pub message: Option<String>,
}

/// Status values for progress entries
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProgressStatus {
    Started,
    InProgress,
    Completed,
    Failed,
    Paused,
    Resumed,
}

impl std::fmt::Display for ProgressStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProgressStatus::Started => write!(f, "started"),
            ProgressStatus::InProgress => write!(f, "in_progress"),
            ProgressStatus::Completed => write!(f, "completed"),
            ProgressStatus::Failed => write!(f, "failed"),
            ProgressStatus::Paused => write!(f, "paused"),
            ProgressStatus::Resumed => write!(f, "resumed"),
        }
    }
}

impl std::str::FromStr for ProgressStatus {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        match s.to_lowercase().as_str() {
            "started" => Ok(ProgressStatus::Started),
            "in_progress" => Ok(ProgressStatus::InProgress),
            "completed" => Ok(ProgressStatus::Completed),
            "failed" => Ok(ProgressStatus::Failed),
            "paused" => Ok(ProgressStatus::Paused),
            "resumed" => Ok(ProgressStatus::Resumed),
            _ => Err(anyhow!("Unknown progress status: {}", s)),
        }
    }
}

/// Progress file manager
pub struct ProgressTracker {
    /// Base directory for progress files (typically .ralph-ui directory)
    base_dir: PathBuf,
}

impl ProgressTracker {
    /// Create a new progress tracker for a project
    pub fn new(project_path: impl AsRef<Path>) -> Self {
        let base_dir = project_path.as_ref().join(".ralph-ui");
        Self { base_dir }
    }

    /// Get the progress file path for a session
    pub fn get_progress_file(&self, session_id: &str) -> PathBuf {
        self.base_dir.join(format!("progress_{}.txt", session_id))
    }

    /// Ensure the base directory exists
    fn ensure_base_dir(&self) -> Result<()> {
        if !self.base_dir.exists() {
            fs::create_dir_all(&self.base_dir)
                .map_err(|e| anyhow!("Failed to create progress directory: {}", e))?;
        }
        Ok(())
    }

    /// Append a progress entry to the file
    pub fn append_progress(
        &self,
        session_id: &str,
        task_id: &str,
        status: ProgressStatus,
        message: Option<&str>,
    ) -> Result<()> {
        self.ensure_base_dir()?;

        let path = self.get_progress_file(session_id);
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| anyhow!("Failed to open progress file: {}", e))?;

        let timestamp = Utc::now();
        let message_part = message.map(|m| format!(" | {}", m)).unwrap_or_default();

        // Format: [timestamp] task_id: status | optional message
        writeln!(
            file,
            "[{}] {}: {}{}",
            timestamp.to_rfc3339(),
            task_id,
            status,
            message_part
        )
        .map_err(|e| anyhow!("Failed to write progress entry: {}", e))?;

        Ok(())
    }

    /// Read all progress entries for a session
    pub fn read_progress(&self, session_id: &str) -> Result<Vec<ProgressEntry>> {
        let path = self.get_progress_file(session_id);

        if !path.exists() {
            return Ok(Vec::new());
        }

        let file =
            fs::File::open(&path).map_err(|e| anyhow!("Failed to open progress file: {}", e))?;

        let reader = BufReader::new(file);
        let mut entries = Vec::new();

        for line in reader.lines() {
            let line = line.map_err(|e| anyhow!("Failed to read line: {}", e))?;
            if let Some(entry) = self.parse_line(&line, session_id) {
                entries.push(entry);
            }
        }

        Ok(entries)
    }

    /// Parse a progress file line into an entry
    fn parse_line(&self, line: &str, session_id: &str) -> Option<ProgressEntry> {
        // Format: [timestamp] task_id: status | optional message
        // Example: [2025-01-18T12:00:00Z] task-1: completed | All tests passed

        let line = line.trim();
        if line.is_empty() {
            return None;
        }

        // Extract timestamp
        let timestamp_end = line.find(']')?;
        let timestamp_str = &line[1..timestamp_end];
        let timestamp = DateTime::parse_from_rfc3339(timestamp_str).ok()?.to_utc();

        // Extract task_id and status
        let rest = &line[timestamp_end + 2..]; // Skip "] "
        let colon_pos = rest.find(':')?;
        let task_id = rest[..colon_pos].trim().to_string();

        let after_colon = &rest[colon_pos + 1..].trim();

        // Check for message separator
        let (status_str, message) = if let Some(pipe_pos) = after_colon.find(" | ") {
            (
                after_colon[..pipe_pos].trim(),
                Some(after_colon[pipe_pos + 3..].to_string()),
            )
        } else {
            (*after_colon, None)
        };

        let status = status_str.parse().ok()?;

        Some(ProgressEntry {
            timestamp,
            session_id: session_id.to_string(),
            task_id,
            status,
            message,
        })
    }

    /// Get the last status for a specific task
    pub fn get_task_last_status(
        &self,
        session_id: &str,
        task_id: &str,
    ) -> Result<Option<ProgressEntry>> {
        let entries = self.read_progress(session_id)?;
        Ok(entries.into_iter().filter(|e| e.task_id == task_id).last())
    }

    /// Get all completed task IDs for a session
    pub fn get_completed_tasks(&self, session_id: &str) -> Result<Vec<String>> {
        let entries = self.read_progress(session_id)?;

        // Track last status for each task
        let mut task_status: std::collections::HashMap<String, ProgressStatus> =
            std::collections::HashMap::new();

        for entry in entries {
            task_status.insert(entry.task_id.clone(), entry.status);
        }

        Ok(task_status
            .into_iter()
            .filter(|(_, status)| *status == ProgressStatus::Completed)
            .map(|(task_id, _)| task_id)
            .collect())
    }

    /// Get all in-progress task IDs for a session (for recovery)
    pub fn get_in_progress_tasks(&self, session_id: &str) -> Result<Vec<String>> {
        let entries = self.read_progress(session_id)?;

        let mut task_status: std::collections::HashMap<String, ProgressStatus> =
            std::collections::HashMap::new();

        for entry in entries {
            task_status.insert(entry.task_id.clone(), entry.status);
        }

        Ok(task_status
            .into_iter()
            .filter(|(_, status)| {
                matches!(
                    *status,
                    ProgressStatus::Started | ProgressStatus::InProgress
                )
            })
            .map(|(task_id, _)| task_id)
            .collect())
    }

    /// Check if a progress file exists for a session
    pub fn progress_file_exists(&self, session_id: &str) -> bool {
        self.get_progress_file(session_id).exists()
    }

    /// Delete the progress file for a session
    pub fn delete_progress(&self, session_id: &str) -> Result<()> {
        let path = self.get_progress_file(session_id);
        if path.exists() {
            fs::remove_file(&path).map_err(|e| anyhow!("Failed to delete progress file: {}", e))?;
        }
        Ok(())
    }

    /// Clear all entries for a session (truncate the file)
    pub fn clear_progress(&self, session_id: &str) -> Result<()> {
        let path = self.get_progress_file(session_id);
        if path.exists() {
            fs::write(&path, "").map_err(|e| anyhow!("Failed to clear progress file: {}", e))?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_tracker() -> (ProgressTracker, TempDir) {
        let temp_dir = TempDir::new().unwrap();
        let tracker = ProgressTracker::new(temp_dir.path());
        (tracker, temp_dir)
    }

    #[test]
    fn test_append_progress_creates_file() {
        let (tracker, _temp) = create_test_tracker();

        let result = tracker.append_progress(
            "session-1",
            "task-1",
            ProgressStatus::Started,
            Some("Task started"),
        );

        assert!(result.is_ok());
        assert!(tracker.progress_file_exists("session-1"));
    }

    #[test]
    fn test_append_progress_appends_entries() {
        let (tracker, _temp) = create_test_tracker();

        tracker
            .append_progress("session-1", "task-1", ProgressStatus::Started, None)
            .unwrap();
        tracker
            .append_progress("session-1", "task-1", ProgressStatus::InProgress, None)
            .unwrap();
        tracker
            .append_progress(
                "session-1",
                "task-1",
                ProgressStatus::Completed,
                Some("Done"),
            )
            .unwrap();

        let entries = tracker.read_progress("session-1").unwrap();
        assert_eq!(entries.len(), 3);
    }

    #[test]
    fn test_read_progress_returns_entries() {
        let (tracker, _temp) = create_test_tracker();

        tracker
            .append_progress("session-1", "task-1", ProgressStatus::Started, None)
            .unwrap();
        tracker
            .append_progress("session-1", "task-2", ProgressStatus::Started, None)
            .unwrap();

        let entries = tracker.read_progress("session-1").unwrap();
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].task_id, "task-1");
        assert_eq!(entries[1].task_id, "task-2");
    }

    #[test]
    fn test_read_progress_empty_for_nonexistent_session() {
        let (tracker, _temp) = create_test_tracker();

        let entries = tracker.read_progress("nonexistent").unwrap();
        assert!(entries.is_empty());
    }

    #[test]
    fn test_progress_file_location() {
        let (tracker, temp) = create_test_tracker();

        let expected = temp.path().join(".ralph-ui").join("progress_session-1.txt");
        let actual = tracker.get_progress_file("session-1");

        assert_eq!(actual, expected);
    }

    #[test]
    fn test_get_task_last_status() {
        let (tracker, _temp) = create_test_tracker();

        tracker
            .append_progress("session-1", "task-1", ProgressStatus::Started, None)
            .unwrap();
        tracker
            .append_progress("session-1", "task-1", ProgressStatus::InProgress, None)
            .unwrap();
        tracker
            .append_progress("session-1", "task-1", ProgressStatus::Completed, None)
            .unwrap();

        let last = tracker.get_task_last_status("session-1", "task-1").unwrap();
        assert!(last.is_some());
        assert_eq!(last.unwrap().status, ProgressStatus::Completed);
    }

    #[test]
    fn test_get_completed_tasks() {
        let (tracker, _temp) = create_test_tracker();

        tracker
            .append_progress("session-1", "task-1", ProgressStatus::Completed, None)
            .unwrap();
        tracker
            .append_progress("session-1", "task-2", ProgressStatus::Failed, None)
            .unwrap();
        tracker
            .append_progress("session-1", "task-3", ProgressStatus::Completed, None)
            .unwrap();

        let completed = tracker.get_completed_tasks("session-1").unwrap();
        assert_eq!(completed.len(), 2);
        assert!(completed.contains(&"task-1".to_string()));
        assert!(completed.contains(&"task-3".to_string()));
    }

    #[test]
    fn test_get_in_progress_tasks() {
        let (tracker, _temp) = create_test_tracker();

        tracker
            .append_progress("session-1", "task-1", ProgressStatus::Started, None)
            .unwrap();
        tracker
            .append_progress("session-1", "task-2", ProgressStatus::InProgress, None)
            .unwrap();
        tracker
            .append_progress("session-1", "task-3", ProgressStatus::Completed, None)
            .unwrap();

        let in_progress = tracker.get_in_progress_tasks("session-1").unwrap();
        assert_eq!(in_progress.len(), 2);
    }

    #[test]
    fn test_delete_progress() {
        let (tracker, _temp) = create_test_tracker();

        tracker
            .append_progress("session-1", "task-1", ProgressStatus::Started, None)
            .unwrap();
        assert!(tracker.progress_file_exists("session-1"));

        tracker.delete_progress("session-1").unwrap();
        assert!(!tracker.progress_file_exists("session-1"));
    }

    #[test]
    fn test_clear_progress() {
        let (tracker, _temp) = create_test_tracker();

        tracker
            .append_progress("session-1", "task-1", ProgressStatus::Started, None)
            .unwrap();
        tracker
            .append_progress("session-1", "task-2", ProgressStatus::Started, None)
            .unwrap();

        tracker.clear_progress("session-1").unwrap();

        let entries = tracker.read_progress("session-1").unwrap();
        assert!(entries.is_empty());
        assert!(tracker.progress_file_exists("session-1")); // File still exists, just empty
    }

    #[test]
    fn test_progress_status_display() {
        assert_eq!(format!("{}", ProgressStatus::Started), "started");
        assert_eq!(format!("{}", ProgressStatus::Completed), "completed");
        assert_eq!(format!("{}", ProgressStatus::Failed), "failed");
    }

    #[test]
    fn test_progress_status_from_str() {
        assert_eq!(
            "started".parse::<ProgressStatus>().unwrap(),
            ProgressStatus::Started
        );
        assert_eq!(
            "completed".parse::<ProgressStatus>().unwrap(),
            ProgressStatus::Completed
        );
        assert_eq!(
            "FAILED".parse::<ProgressStatus>().unwrap(),
            ProgressStatus::Failed
        );
    }

    #[test]
    fn test_parse_line_with_message() {
        let (tracker, _temp) = create_test_tracker();

        let line = "[2025-01-18T12:00:00+00:00] task-1: completed | All tests passed";
        let entry = tracker.parse_line(line, "session-1");

        assert!(entry.is_some());
        let entry = entry.unwrap();
        assert_eq!(entry.task_id, "task-1");
        assert_eq!(entry.status, ProgressStatus::Completed);
        assert_eq!(entry.message, Some("All tests passed".to_string()));
    }

    #[test]
    fn test_parse_line_without_message() {
        let (tracker, _temp) = create_test_tracker();

        let line = "[2025-01-18T12:00:00+00:00] task-2: started";
        let entry = tracker.parse_line(line, "session-1");

        assert!(entry.is_some());
        let entry = entry.unwrap();
        assert_eq!(entry.task_id, "task-2");
        assert_eq!(entry.status, ProgressStatus::Started);
        assert!(entry.message.is_none());
    }
}
