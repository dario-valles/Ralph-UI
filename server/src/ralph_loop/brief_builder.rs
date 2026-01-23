//! Brief Builder - Generates BRIEF.md for agent context handoff
//!
//! The BRIEF.md file provides agents with a clear understanding of:
//! - What work has been completed (stories marked as passing)
//! - What work is in progress (current story)
//! - What work is pending (remaining stories)
//! - Accumulated learnings from previous iterations
//!
//! This enables agents to resume after rate limits, crashes, or context switches
//! by reading a single file that captures the complete project state.
//!
//! File location: `.ralph-ui/briefs/{prd_name}/BRIEF.md`

use super::types::{RalphPrd, RalphStory};
use std::path::{Path, PathBuf};

/// Brief builder for generating agent context files
///
/// Creates BRIEF.md files that allow agents to understand:
/// - Which stories are complete (skip these)
/// - Which story to work on next
/// - Learnings from previous iterations
pub struct BriefBuilder {
    /// Base project path
    project_path: PathBuf,
    /// PRD name (required)
    prd_name: String,
}

impl BriefBuilder {
    /// Create a new brief builder
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

    /// Get the directory for briefs
    fn briefs_dir(&self) -> PathBuf {
        self.project_path
            .join(".ralph-ui")
            .join("briefs")
            .join(&self.prd_name)
    }

    /// Get the path to BRIEF.md
    pub fn brief_path(&self) -> PathBuf {
        self.briefs_dir().join("BRIEF.md")
    }

    /// Generate BRIEF.md from PRD state and learnings
    ///
    /// # Arguments
    /// * `prd` - The PRD containing all stories
    /// * `learnings` - Accumulated learnings from progress file
    /// * `iteration` - Current iteration number (optional)
    pub fn generate_brief(
        &self,
        prd: &RalphPrd,
        learnings: Option<&str>,
        iteration: Option<u32>,
    ) -> Result<(), String> {
        // Ensure briefs directory exists
        let briefs_dir = self.briefs_dir();
        std::fs::create_dir_all(&briefs_dir)
            .map_err(|e| format!("Failed to create briefs directory {:?}: {}", briefs_dir, e))?;

        let brief = self.build_brief_content(prd, learnings, iteration);

        std::fs::write(self.brief_path(), brief)
            .map_err(|e| format!("Failed to write BRIEF.md: {}", e))?;

        Ok(())
    }

    /// Build the brief content as a string
    pub fn build_brief_content(
        &self,
        prd: &RalphPrd,
        learnings: Option<&str>,
        iteration: Option<u32>,
    ) -> String {
        let mut brief = String::new();

        // Header
        brief.push_str("# Agent Task Brief\n\n");
        brief.push_str(&format!("**PRD**: {}\n", prd.title));
        brief.push_str(&format!("**Branch**: {}\n", prd.branch));
        if let Some(iter) = iteration {
            brief.push_str(&format!("**Iteration**: {}\n", iter));
        }
        brief.push_str(&format!(
            "**Generated**: {}\n\n",
            chrono::Utc::now().to_rfc3339()
        ));

        // Progress summary
        let (passed, total) = prd.progress();
        let progress_pct = if total > 0 {
            (passed as f32 / total as f32 * 100.0) as u32
        } else {
            0
        };
        brief.push_str("## Progress Summary\n\n");
        brief.push_str(&format!(
            "**{}/{}** stories complete ({}%)\n\n",
            passed, total, progress_pct
        ));

        // Completed stories (so agent knows to skip these)
        let completed_stories: Vec<&RalphStory> =
            prd.stories.iter().filter(|s| s.passes).collect();
        if !completed_stories.is_empty() {
            brief.push_str("## Completed Stories (SKIP THESE)\n\n");
            brief.push_str("These stories have been implemented and verified. **Do not work on these.**\n\n");
            for story in &completed_stories {
                brief.push_str(&format!("- [x] **{}**: {}\n", story.id, story.title));
            }
            brief.push_str("\n");
        }

        // Next story to work on
        if let Some(next) = prd.next_story() {
            brief.push_str("## Current Story (WORK ON THIS)\n\n");
            brief.push_str(&format!("### {} - {}\n\n", next.id, next.title));

            if let Some(ref desc) = next.description {
                brief.push_str(&format!("**Description**: {}\n\n", desc));
            }

            brief.push_str("**Acceptance Criteria**:\n");
            // Parse acceptance criteria (usually bullet points in the acceptance field)
            for line in next.acceptance.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    // Ensure it starts with a bullet
                    if trimmed.starts_with('-') || trimmed.starts_with('*') {
                        brief.push_str(&format!("{}\n", trimmed));
                    } else {
                        brief.push_str(&format!("- {}\n", trimmed));
                    }
                }
            }
            brief.push_str("\n");

            // Show dependencies if any
            if !next.dependencies.is_empty() {
                brief.push_str("**Dependencies**: ");
                brief.push_str(&next.dependencies.join(", "));
                brief.push_str(" (all completed)\n\n");
            }

            // Priority and effort
            brief.push_str(&format!("**Priority**: {}\n", next.priority));
            if let Some(ref effort) = next.effort {
                brief.push_str(&format!("**Estimated Effort**: {}\n", effort));
            }
            brief.push_str("\n");
        } else if prd.all_pass() {
            brief.push_str("## Status: ALL COMPLETE\n\n");
            brief.push_str("All stories have been completed! 🎉\n\n");
        } else {
            brief.push_str("## Status: BLOCKED\n\n");
            brief.push_str("No stories are available to work on. This may be because:\n");
            brief.push_str("- All remaining stories have unsatisfied dependencies\n");
            brief.push_str("- There's a circular dependency issue\n\n");
        }

        // Pending stories (for context)
        let pending_stories: Vec<&RalphStory> = prd
            .stories
            .iter()
            .filter(|s| !s.passes)
            .collect();
        if pending_stories.len() > 1 {
            // More than just the current story
            brief.push_str("## Pending Stories\n\n");
            brief.push_str("These stories are waiting to be completed:\n\n");
            for story in &pending_stories {
                let blocked = if !story.dependencies_satisfied(&prd.stories) {
                    " *(blocked by dependencies)*"
                } else {
                    ""
                };
                brief.push_str(&format!(
                    "- [ ] **{}**: {}{}\n",
                    story.id, story.title, blocked
                ));
            }
            brief.push_str("\n");
        }

        // Accumulated learnings
        if let Some(learnings_content) = learnings {
            if !learnings_content.trim().is_empty() {
                brief.push_str("## Accumulated Learnings\n\n");
                brief.push_str(
                    "These insights were gathered from previous iterations. Use them to avoid mistakes:\n\n",
                );
                brief.push_str(learnings_content);
                brief.push_str("\n");
            }
        }

        // Instructions
        brief.push_str("---\n\n");
        brief.push_str("## Instructions\n\n");
        brief.push_str("1. **Focus on the Current Story above** - implement only this story\n");
        brief.push_str("2. **Skip Completed Stories** - they are already done\n");
        brief.push_str("3. **Meet all Acceptance Criteria** before marking as complete\n");
        brief.push_str("4. **Add learnings** to `.ralph-ui/prds/{prd_name}-progress.txt` for future iterations\n");
        brief.push_str("5. **Update PRD JSON** - set `passes: true` for the story when complete\n");
        brief.push_str("6. **Commit your changes** with a clear message referencing the story ID\n");

        brief
    }

    /// Read the current brief
    pub fn read_brief(&self) -> Result<String, String> {
        if self.brief_path().exists() {
            std::fs::read_to_string(self.brief_path())
                .map_err(|e| format!("Failed to read BRIEF.md: {}", e))
        } else {
            Err("BRIEF.md does not exist".to_string())
        }
    }

    /// Check if a brief exists
    pub fn exists(&self) -> bool {
        self.brief_path().exists()
    }

    /// Parse completed story IDs from an existing brief
    ///
    /// This allows agents to quickly identify which stories are done
    /// without parsing the full PRD JSON.
    pub fn parse_completed_stories(&self) -> Result<Vec<String>, String> {
        let brief = self.read_brief()?;
        let mut completed = Vec::new();

        let mut in_completed_section = false;
        for line in brief.lines() {
            if line.contains("Completed Stories") {
                in_completed_section = true;
                continue;
            }
            if in_completed_section {
                // Check for section end
                if line.starts_with("## ") {
                    break;
                }
                // Parse completed story line: "- [x] **US-1.1**: title"
                if line.contains("[x]") && line.contains("**") {
                    if let Some(start) = line.find("**") {
                        if let Some(end) = line[start + 2..].find("**") {
                            let story_id = &line[start + 2..start + 2 + end];
                            // Story ID is before the colon if there is one
                            let id = story_id.split(':').next().unwrap_or(story_id).trim();
                            completed.push(id.to_string());
                        }
                    }
                }
            }
        }

        Ok(completed)
    }

    /// Parse the next story ID from an existing brief
    pub fn parse_next_story(&self) -> Result<Option<String>, String> {
        let brief = self.read_brief()?;

        for line in brief.lines() {
            // Look for "### US-1.1 - Title" pattern
            if line.starts_with("### ") && line.contains(" - ") {
                let after_hash = line.trim_start_matches("### ");
                if let Some(story_id) = after_hash.split(" - ").next() {
                    return Ok(Some(story_id.trim().to_string()));
                }
            }
        }

        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ralph_loop::types::RalphStory;
    use tempfile::TempDir;

    fn setup_test_dir() -> TempDir {
        TempDir::new().unwrap()
    }

    fn create_test_prd() -> RalphPrd {
        let mut prd = RalphPrd::new("Test PRD", "feature/test");

        let mut story1 = RalphStory::new("US-1.1", "First Story", "- Criterion 1\n- Criterion 2");
        story1.priority = 100;
        story1.passes = true; // Completed

        let mut story2 = RalphStory::new("US-1.2", "Second Story", "- Criterion A\n- Criterion B");
        story2.priority = 100;
        story2.passes = false; // Pending

        let mut story3 = RalphStory::new("US-1.3", "Third Story", "- Criterion X");
        story3.priority = 100;
        story3.passes = false;
        story3.dependencies = vec!["US-1.2".to_string()]; // Blocked

        prd.add_story(story1);
        prd.add_story(story2);
        prd.add_story(story3);

        prd
    }

    #[test]
    fn test_brief_builder_new() {
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");

        assert!(builder
            .brief_path()
            .to_string_lossy()
            .contains("briefs/test-prd/BRIEF.md"));
    }

    #[test]
    fn test_generate_brief() {
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        builder
            .generate_brief(&prd, Some("- Use existing patterns"), Some(3))
            .unwrap();

        assert!(builder.exists());

        let brief = builder.read_brief().unwrap();

        // Check header
        assert!(brief.contains("# Agent Task Brief"));
        assert!(brief.contains("Test PRD"));
        assert!(brief.contains("feature/test"));
        assert!(brief.contains("Iteration**: 3"));

        // Check progress
        assert!(brief.contains("1/3** stories complete"));

        // Check completed section
        assert!(brief.contains("Completed Stories (SKIP THESE)"));
        assert!(brief.contains("[x] **US-1.1**"));

        // Check current story
        assert!(brief.contains("Current Story (WORK ON THIS)"));
        assert!(brief.contains("US-1.2 - Second Story"));
        assert!(brief.contains("Criterion A"));
        assert!(brief.contains("Criterion B"));

        // Check pending section
        assert!(brief.contains("Pending Stories"));
        assert!(brief.contains("US-1.3"));
        assert!(brief.contains("blocked by dependencies"));

        // Check learnings
        assert!(brief.contains("Accumulated Learnings"));
        assert!(brief.contains("Use existing patterns"));

        // Check instructions
        assert!(brief.contains("Instructions"));
        assert!(brief.contains("Focus on the Current Story"));
    }

    #[test]
    fn test_parse_completed_stories() {
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        builder.generate_brief(&prd, None, None).unwrap();

        let completed = builder.parse_completed_stories().unwrap();
        assert_eq!(completed, vec!["US-1.1"]);
    }

    #[test]
    fn test_parse_next_story() {
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        builder.generate_brief(&prd, None, None).unwrap();

        let next = builder.parse_next_story().unwrap();
        assert_eq!(next, Some("US-1.2".to_string()));
    }

    #[test]
    fn test_all_complete_brief() {
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");

        let mut prd = RalphPrd::new("Complete PRD", "feature/done");
        let mut story = RalphStory::new("US-1", "Done Story", "- Done");
        story.passes = true;
        prd.add_story(story);

        builder.generate_brief(&prd, None, None).unwrap();

        let brief = builder.read_brief().unwrap();
        assert!(brief.contains("ALL COMPLETE"));
        assert!(brief.contains("🎉"));
    }

    #[test]
    fn test_blocked_stories_brief() {
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");

        let mut prd = RalphPrd::new("Blocked PRD", "feature/blocked");
        let mut story = RalphStory::new("US-1", "Blocked Story", "- Blocked");
        story.dependencies = vec!["nonexistent".to_string()];
        prd.add_story(story);

        builder.generate_brief(&prd, None, None).unwrap();

        let brief = builder.read_brief().unwrap();
        assert!(brief.contains("BLOCKED"));
        assert!(brief.contains("unsatisfied dependencies"));
    }

    #[test]
    fn test_brief_without_learnings() {
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        builder.generate_brief(&prd, None, None).unwrap();

        let brief = builder.read_brief().unwrap();
        // Should not contain learnings section when no learnings provided
        assert!(!brief.contains("Accumulated Learnings"));
    }
}
