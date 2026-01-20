//! PRD Executor - File-based PRD management
//!
//! This module handles reading and writing prd.json files.
//! The PRD file is the source of truth for what tasks need to be done.

use super::types::{PrdStatus, RalphPrd, RalphStory};
use std::path::{Path, PathBuf};

/// PRD file executor for reading/writing .ralph/prd.json
pub struct PrdExecutor {
    /// Path to the .ralph directory
    ralph_dir: PathBuf,
}

impl PrdExecutor {
    /// Create a new PRD executor
    pub fn new(ralph_dir: &Path) -> Self {
        Self {
            ralph_dir: ralph_dir.to_path_buf(),
        }
    }

    /// Get the path to prd.json
    pub fn prd_path(&self) -> PathBuf {
        self.ralph_dir.join("prd.json")
    }

    /// Check if a PRD file exists
    pub fn prd_exists(&self) -> bool {
        self.prd_path().exists()
    }

    /// Read the PRD from disk
    pub fn read_prd(&self) -> Result<RalphPrd, String> {
        let path = self.prd_path();

        if !path.exists() {
            return Err(format!("PRD file not found at {:?}", path));
        }

        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Failed to read PRD file: {}", e))?;

        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse PRD file: {}", e))
    }

    /// Write the PRD to disk
    pub fn write_prd(&self, prd: &RalphPrd) -> Result<(), String> {
        // Ensure .ralph directory exists
        std::fs::create_dir_all(&self.ralph_dir)
            .map_err(|e| format!("Failed to create .ralph directory: {}", e))?;

        let path = self.prd_path();
        let content = serde_json::to_string_pretty(prd)
            .map_err(|e| format!("Failed to serialize PRD: {}", e))?;

        std::fs::write(&path, content)
            .map_err(|e| format!("Failed to write PRD file: {}", e))?;

        Ok(())
    }

    /// Update the PRD metadata timestamp
    pub fn touch_prd(&self) -> Result<(), String> {
        let mut prd = self.read_prd()?;

        if let Some(ref mut metadata) = prd.metadata {
            metadata.updated_at = Some(chrono::Utc::now().to_rfc3339());
        }

        self.write_prd(&prd)
    }

    /// Mark a story as passing
    pub fn mark_story_passing(&self, story_id: &str) -> Result<bool, String> {
        let mut prd = self.read_prd()?;
        let result = prd.mark_story_passing(story_id);

        if result {
            // Update metadata
            if let Some(ref mut metadata) = prd.metadata {
                metadata.updated_at = Some(chrono::Utc::now().to_rfc3339());
            }
            self.write_prd(&prd)?;
        }

        Ok(result)
    }

    /// Mark a story as failing
    pub fn mark_story_failing(&self, story_id: &str) -> Result<bool, String> {
        let mut prd = self.read_prd()?;

        if let Some(story) = prd.stories.iter_mut().find(|s| s.id == story_id) {
            story.passes = false;

            if let Some(ref mut metadata) = prd.metadata {
                metadata.updated_at = Some(chrono::Utc::now().to_rfc3339());
            }

            self.write_prd(&prd)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Get the status summary of the PRD
    pub fn get_status(&self, prd: &RalphPrd) -> PrdStatus {
        let total = prd.stories.len();
        let passed = prd.stories.iter().filter(|s| s.passes).count();
        let failed = total - passed;
        let all_pass = failed == 0 && total > 0;
        let progress_percent = if total > 0 {
            (passed as f32 / total as f32) * 100.0
        } else {
            0.0
        };

        let incomplete_story_ids: Vec<String> = prd
            .stories
            .iter()
            .filter(|s| !s.passes)
            .map(|s| s.id.clone())
            .collect();

        let next_story_id = prd.next_story().map(|s| s.id.clone());

        PrdStatus {
            total,
            passed,
            failed,
            all_pass,
            progress_percent,
            incomplete_story_ids,
            next_story_id,
        }
    }

    /// Update iteration count in metadata
    pub fn increment_iteration_count(&self) -> Result<u32, String> {
        let mut prd = self.read_prd()?;

        let new_count = if let Some(ref mut metadata) = prd.metadata {
            metadata.total_iterations += 1;
            metadata.updated_at = Some(chrono::Utc::now().to_rfc3339());
            metadata.total_iterations
        } else {
            prd.metadata = Some(super::types::PrdMetadata {
                created_at: None,
                updated_at: Some(chrono::Utc::now().to_rfc3339()),
                source_chat_id: None,
                total_iterations: 1,
                last_execution_id: None,
            });
            1
        };

        self.write_prd(&prd)?;
        Ok(new_count)
    }

    /// Set the last execution ID in metadata
    pub fn set_last_execution_id(&self, execution_id: &str) -> Result<(), String> {
        let mut prd = self.read_prd()?;

        if let Some(ref mut metadata) = prd.metadata {
            metadata.last_execution_id = Some(execution_id.to_string());
            metadata.updated_at = Some(chrono::Utc::now().to_rfc3339());
        }

        self.write_prd(&prd)
    }

    /// Add a new story to the PRD
    pub fn add_story(&self, story: RalphStory) -> Result<(), String> {
        let mut prd = self.read_prd()?;
        prd.add_story(story);

        if let Some(ref mut metadata) = prd.metadata {
            metadata.updated_at = Some(chrono::Utc::now().to_rfc3339());
        }

        self.write_prd(&prd)
    }

    /// Remove a story from the PRD
    pub fn remove_story(&self, story_id: &str) -> Result<bool, String> {
        let mut prd = self.read_prd()?;
        let initial_len = prd.stories.len();
        prd.stories.retain(|s| s.id != story_id);

        if prd.stories.len() != initial_len {
            if let Some(ref mut metadata) = prd.metadata {
                metadata.updated_at = Some(chrono::Utc::now().to_rfc3339());
            }
            self.write_prd(&prd)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Update a story's details (excluding passes status)
    pub fn update_story(&self, story_id: &str, updates: StoryUpdates) -> Result<bool, String> {
        let mut prd = self.read_prd()?;

        if let Some(story) = prd.stories.iter_mut().find(|s| s.id == story_id) {
            if let Some(title) = updates.title {
                story.title = title;
            }
            if let Some(description) = updates.description {
                story.description = Some(description);
            }
            if let Some(acceptance) = updates.acceptance {
                story.acceptance = acceptance;
            }
            if let Some(priority) = updates.priority {
                story.priority = priority;
            }
            if let Some(dependencies) = updates.dependencies {
                story.dependencies = dependencies;
            }
            if let Some(tags) = updates.tags {
                story.tags = tags;
            }
            if let Some(effort) = updates.effort {
                story.effort = Some(effort);
            }

            if let Some(ref mut metadata) = prd.metadata {
                metadata.updated_at = Some(chrono::Utc::now().to_rfc3339());
            }

            self.write_prd(&prd)?;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Reorder stories by priority
    pub fn reorder_stories(&self, story_ids: &[String]) -> Result<(), String> {
        let mut prd = self.read_prd()?;

        // Update priorities based on position in the provided list
        for (index, story_id) in story_ids.iter().enumerate() {
            if let Some(story) = prd.stories.iter_mut().find(|s| &s.id == story_id) {
                story.priority = index as u32;
            }
        }

        // Sort by priority
        prd.stories.sort_by_key(|s| s.priority);

        if let Some(ref mut metadata) = prd.metadata {
            metadata.updated_at = Some(chrono::Utc::now().to_rfc3339());
        }

        self.write_prd(&prd)
    }

    /// Convert from the old database PRD format
    pub fn convert_from_db_prd(
        &self,
        title: &str,
        content: &str,
        branch: &str,
        tasks: &[(String, String, String)], // (id, title, description)
    ) -> Result<RalphPrd, String> {
        let mut prd = RalphPrd::new(title, branch);
        prd.description = Some(content.to_string());

        for (index, (id, title, description)) in tasks.iter().enumerate() {
            let mut story = RalphStory::new(id, title, description);
            story.priority = index as u32;
            prd.add_story(story);
        }

        Ok(prd)
    }
}

/// Updates to apply to a story
#[derive(Debug, Clone, Default)]
pub struct StoryUpdates {
    pub title: Option<String>,
    pub description: Option<String>,
    pub acceptance: Option<String>,
    pub priority: Option<u32>,
    pub dependencies: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub effort: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn setup_test_dir() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn test_write_and_read_prd() {
        let temp_dir = setup_test_dir();
        let ralph_dir = temp_dir.path().join(".ralph");
        let executor = PrdExecutor::new(&ralph_dir);

        let mut prd = RalphPrd::new("Test PRD", "feature/test");
        prd.add_story(RalphStory::new("1", "First task", "Complete the first task"));

        // Write
        executor.write_prd(&prd).unwrap();
        assert!(executor.prd_exists());

        // Read back
        let read_prd = executor.read_prd().unwrap();
        assert_eq!(read_prd.title, "Test PRD");
        assert_eq!(read_prd.stories.len(), 1);
        assert_eq!(read_prd.stories[0].id, "1");
    }

    #[test]
    fn test_mark_story_passing() {
        let temp_dir = setup_test_dir();
        let ralph_dir = temp_dir.path().join(".ralph");
        let executor = PrdExecutor::new(&ralph_dir);

        let mut prd = RalphPrd::new("Test PRD", "feature/test");
        prd.add_story(RalphStory::new("1", "Task 1", "Description"));
        prd.add_story(RalphStory::new("2", "Task 2", "Description"));
        executor.write_prd(&prd).unwrap();

        // Mark first story as passing
        let result = executor.mark_story_passing("1").unwrap();
        assert!(result);

        // Verify
        let prd = executor.read_prd().unwrap();
        assert!(prd.stories[0].passes);
        assert!(!prd.stories[1].passes);
    }

    #[test]
    fn test_get_status() {
        let temp_dir = setup_test_dir();
        let ralph_dir = temp_dir.path().join(".ralph");
        let executor = PrdExecutor::new(&ralph_dir);

        let mut prd = RalphPrd::new("Test PRD", "feature/test");
        let mut story1 = RalphStory::new("1", "Task 1", "Description");
        story1.passes = true;
        prd.add_story(story1);
        prd.add_story(RalphStory::new("2", "Task 2", "Description"));
        prd.add_story(RalphStory::new("3", "Task 3", "Description"));

        let status = executor.get_status(&prd);
        assert_eq!(status.total, 3);
        assert_eq!(status.passed, 1);
        assert_eq!(status.failed, 2);
        assert!(!status.all_pass);
        assert!((status.progress_percent - 33.333).abs() < 0.01);
        assert_eq!(status.incomplete_story_ids, vec!["2", "3"]);
    }

    #[test]
    fn test_add_and_remove_story() {
        let temp_dir = setup_test_dir();
        let ralph_dir = temp_dir.path().join(".ralph");
        let executor = PrdExecutor::new(&ralph_dir);

        let prd = RalphPrd::new("Test PRD", "feature/test");
        executor.write_prd(&prd).unwrap();

        // Add story
        executor
            .add_story(RalphStory::new("1", "New task", "Description"))
            .unwrap();
        let prd = executor.read_prd().unwrap();
        assert_eq!(prd.stories.len(), 1);

        // Remove story
        let removed = executor.remove_story("1").unwrap();
        assert!(removed);
        let prd = executor.read_prd().unwrap();
        assert_eq!(prd.stories.len(), 0);
    }
}
