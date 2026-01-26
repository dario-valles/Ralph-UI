//! Brief Builder - Generates BRIEF.md for agent context handoff
//!
//! The BRIEF.md file provides agents with a clear understanding of:
//! - What work has been completed (stories marked as passing)
//! - What work is in progress (stories being worked on by other agents)
//! - What work is pending (remaining stories not yet assigned)
//! - Which files to avoid (files being modified by other agents) (US-2.2)
//! - Accumulated learnings from previous iterations
//!
//! This enables agents to resume after rate limits, crashes, or context switches
//! by reading a single file that captures the complete project state.
//!
//! ## US-1.3: Context Handoff Between Agents
//!
//! The BRIEF.md format is designed to be agent-agnostic (standard markdown) so that:
//! - Any AI coding agent can read and understand the brief
//! - Handoffs between different agent types (Claude, OpenCode, Cursor, Codex) work seamlessly
//! - Accumulated learnings from all previous agents are included
//!
//! ## US-2.2: Avoid File Conflicts
//!
//! The brief includes a "Files to Avoid" section that lists files currently being
//! modified by other agents. This helps prevent merge conflicts when multiple
//! agents work on the same PRD in parallel.
//!
//! File location: `.ralph-ui/briefs/{prd_name}/BRIEF.md`

use super::assignments_manager::{AssignmentStatus, AssignmentsManager, FileInUse};
use super::learnings_manager::LearningsManager;
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

    /// Get the path to BRIEF.md (current/latest)
    pub fn brief_path(&self) -> PathBuf {
        self.briefs_dir().join("BRIEF.md")
    }

    /// Get the path to a historical brief for a specific iteration
    pub fn brief_path_for_iteration(&self, iteration: u32) -> PathBuf {
        self.briefs_dir().join(format!("BRIEF-{}.md", iteration))
    }

    /// List all historical briefs (sorted by iteration number)
    pub fn list_historical_briefs(&self) -> Result<Vec<(u32, String)>, String> {
        let briefs_dir = self.briefs_dir();

        if !briefs_dir.exists() {
            return Ok(Vec::new());
        }

        let mut briefs: Vec<(u32, String)> = Vec::new();

        for entry in std::fs::read_dir(&briefs_dir)
            .map_err(|e| format!("Failed to read briefs directory: {}", e))?
        {
            let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
            let path = entry.path();

            if path.is_file() {
                let filename = path.file_name().and_then(|n| n.to_str()).unwrap_or("");

                // Match both BRIEF-N.md and BRIEF.md patterns
                if filename == "BRIEF.md" {
                    // Current brief
                    let content = std::fs::read_to_string(&path)
                        .map_err(|e| format!("Failed to read brief: {}", e))?;
                    briefs.push((0, content)); // Iteration 0 = current
                } else if filename.starts_with("BRIEF-") && filename.ends_with(".md") {
                    // Historical brief
                    if let Ok(iteration_str) = filename
                        .strip_prefix("BRIEF-")
                        .unwrap_or("")
                        .strip_suffix(".md")
                        .unwrap_or("")
                        .parse::<u32>()
                    {
                        let content = std::fs::read_to_string(&path)
                            .map_err(|e| format!("Failed to read brief: {}", e))?;
                        briefs.push((iteration_str, content));
                    }
                }
            }
        }

        // Sort by iteration number (ascending - oldest first)
        briefs.sort_by_key(|b| b.0);
        Ok(briefs)
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

        // Save to current BRIEF.md
        std::fs::write(self.brief_path(), &brief)
            .map_err(|e| format!("Failed to write BRIEF.md: {}", e))?;

        // Also save to historical brief if iteration is provided
        if let Some(iter) = iteration {
            let historical_path = self.brief_path_for_iteration(iter);
            std::fs::write(&historical_path, &brief)
                .map_err(|e| format!("Failed to write historical brief: {}", e))?;
        }

        Ok(())
    }

    /// Generate BRIEF.md using structured learnings from LearningsManager
    ///
    /// This is the preferred method for US-1.2 crash recovery as it uses
    /// the structured learnings.json file instead of parsing progress.txt.
    ///
    /// # Arguments
    /// * `prd` - The PRD containing all stories
    /// * `learnings_manager` - Manager for structured learnings storage
    /// * `iteration` - Current iteration number (optional)
    pub fn generate_brief_with_learnings_manager(
        &self,
        prd: &RalphPrd,
        learnings_manager: &LearningsManager,
        iteration: Option<u32>,
    ) -> Result<(), String> {
        // Ensure briefs directory exists
        let briefs_dir = self.briefs_dir();
        std::fs::create_dir_all(&briefs_dir)
            .map_err(|e| format!("Failed to create briefs directory {:?}: {}", briefs_dir, e))?;

        // Get formatted learnings from the structured storage
        let structured_learnings = learnings_manager.format_for_brief().ok();
        let learnings_ref = structured_learnings.as_deref();

        let brief = self.build_brief_content(prd, learnings_ref, iteration);

        // Save to current BRIEF.md
        std::fs::write(self.brief_path(), &brief)
            .map_err(|e| format!("Failed to write BRIEF.md: {}", e))?;

        // Also save to historical brief if iteration is provided
        if let Some(iter) = iteration {
            let historical_path = self.brief_path_for_iteration(iter);
            std::fs::write(&historical_path, &brief)
                .map_err(|e| format!("Failed to write historical brief: {}", e))?;
        }

        Ok(())
    }

    /// Generate BRIEF.md with full context handoff support (US-1.3)
    ///
    /// This method generates a comprehensive brief that includes:
    /// - Completed work (stories that have passed)
    /// - In-progress work (stories being worked on by other agents)
    /// - Pending work (stories waiting to be assigned)
    /// - Accumulated learnings from all previous agents
    ///
    /// The resulting BRIEF.md is agent-agnostic (standard markdown) and can be
    /// understood by any AI coding agent (Claude, OpenCode, Cursor, Codex, etc.).
    ///
    /// # Arguments
    /// * `prd` - The PRD containing all stories
    /// * `learnings_manager` - Manager for structured learnings storage
    /// * `assignments_manager` - Manager for tracking agent assignments
    /// * `iteration` - Current iteration number (optional)
    /// * `current_agent_id` - The ID of the current agent (to exclude from "in-progress")
    pub fn generate_brief_with_full_context(
        &self,
        prd: &RalphPrd,
        learnings_manager: &LearningsManager,
        assignments_manager: &AssignmentsManager,
        iteration: Option<u32>,
        current_agent_id: Option<&str>,
    ) -> Result<(), String> {
        // Ensure briefs directory exists
        let briefs_dir = self.briefs_dir();
        std::fs::create_dir_all(&briefs_dir)
            .map_err(|e| format!("Failed to create briefs directory {:?}: {}", briefs_dir, e))?;

        // Get formatted learnings from the structured storage
        let structured_learnings = learnings_manager.format_for_brief().ok();
        let learnings_ref = structured_learnings.as_deref();

        // Get active assignments from other agents
        let active_assignments = assignments_manager.get_active_assignments().ok();

        // US-2.2: Get files in use by other agents
        let files_in_use =
            current_agent_id.and_then(|id| assignments_manager.get_files_in_use_by_others(id).ok());

        let brief = self.build_brief_content_with_full_context(
            prd,
            learnings_ref,
            iteration,
            active_assignments.as_ref(),
            current_agent_id,
            files_in_use.as_ref(),
        );

        // Save to current BRIEF.md
        std::fs::write(self.brief_path(), &brief)
            .map_err(|e| format!("Failed to write BRIEF.md: {}", e))?;

        // Also save to historical brief if iteration is provided
        if let Some(iter) = iteration {
            let historical_path = self.brief_path_for_iteration(iter);
            std::fs::write(&historical_path, &brief)
                .map_err(|e| format!("Failed to write historical brief: {}", e))?;
        }

        Ok(())
    }

    /// Build the brief content as a string
    pub fn build_brief_content(
        &self,
        prd: &RalphPrd,
        learnings: Option<&str>,
        iteration: Option<u32>,
    ) -> String {
        // Delegate to the new method without assignments or files
        self.build_brief_content_with_full_context(prd, learnings, iteration, None, None, None)
    }

    /// Build the brief content with full context handoff support (US-1.3) and file conflicts (US-2.2)
    ///
    /// This method builds a comprehensive brief that includes:
    /// - Completed work (stories that have passed)
    /// - In-progress work (stories being worked on by other agents)
    /// - Files to avoid (files being modified by other agents) - US-2.2
    /// - Current story (the story this agent should work on)
    /// - Pending work (stories waiting to be assigned)
    /// - Accumulated learnings from all previous agents
    ///
    /// The format is agent-agnostic (standard markdown) for seamless handoffs.
    pub fn build_brief_content_with_full_context(
        &self,
        prd: &RalphPrd,
        learnings: Option<&str>,
        iteration: Option<u32>,
        active_assignments: Option<&Vec<super::assignments_manager::Assignment>>,
        current_agent_id: Option<&str>,
        files_in_use: Option<&Vec<FileInUse>>,
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
        let completed_stories: Vec<&RalphStory> = prd.stories.iter().filter(|s| s.passes).collect();
        if !completed_stories.is_empty() {
            brief.push_str("## Completed Stories (SKIP THESE)\n\n");
            brief.push_str(
                "These stories have been implemented and verified. **Do not work on these.**\n\n",
            );
            for story in &completed_stories {
                brief.push_str(&format!("- [x] **{}**: {}\n", story.id, story.title));
            }
            brief.push_str("\n");
        }

        // In-progress work by OTHER agents (US-1.3: Context Handoff)
        // This section shows what other agents are currently working on
        if let Some(assignments) = active_assignments {
            // Filter to only show active assignments from OTHER agents
            let other_agent_work: Vec<_> = assignments
                .iter()
                .filter(|a| {
                    a.status == AssignmentStatus::Active
                        && current_agent_id.map(|id| a.agent_id != id).unwrap_or(true)
                })
                .collect();

            if !other_agent_work.is_empty() {
                brief.push_str("## In-Progress Work (OTHER AGENTS)\n\n");
                brief.push_str("These stories are currently being worked on by other agents. **Do not work on these.**\n\n");
                for assignment in &other_agent_work {
                    // Find the story details
                    let story_title = prd
                        .stories
                        .iter()
                        .find(|s| s.id == assignment.story_id)
                        .map(|s| s.title.as_str())
                        .unwrap_or("Unknown");
                    brief.push_str(&format!(
                        "- [ ] **{}**: {} *(assigned to {} agent)*\n",
                        assignment.story_id, story_title, assignment.agent_type
                    ));
                }
                brief.push_str("\n");
            }
        }

        // US-2.2: Files to avoid (files being modified by other agents)
        if let Some(files) = files_in_use {
            if !files.is_empty() {
                brief.push_str("## Files to Avoid (AVOID MODIFYING)\n\n");
                brief.push_str("These files are currently being modified by other agents. **Avoid modifying these files** to prevent merge conflicts:\n\n");

                // Group files by agent/story for clarity
                let mut files_by_story: std::collections::HashMap<&str, Vec<&FileInUse>> =
                    std::collections::HashMap::new();
                for file in files {
                    files_by_story
                        .entry(file.story_id.as_str())
                        .or_default()
                        .push(file);
                }

                for (story_id, story_files) in files_by_story {
                    // Get agent info from first file (they're all the same for this story)
                    if let Some(first_file) = story_files.first() {
                        brief.push_str(&format!(
                            "**{}** (being worked on by {} agent `{}`):\n",
                            story_id, first_file.agent_type, first_file.agent_id
                        ));
                        for file in story_files {
                            brief.push_str(&format!("- `{}`\n", file.path));
                        }
                        brief.push_str("\n");
                    }
                }
            }
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

        // Pending stories (for context) - excluding in-progress work
        let in_progress_ids: std::collections::HashSet<&str> = active_assignments
            .map(|a| {
                a.iter()
                    .filter(|a| a.status == AssignmentStatus::Active)
                    .map(|a| a.story_id.as_str())
                    .collect()
            })
            .unwrap_or_default();

        let pending_stories: Vec<&RalphStory> = prd
            .stories
            .iter()
            .filter(|s| !s.passes && !in_progress_ids.contains(s.id.as_str()))
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

        // Accumulated learnings (US-1.3: Context Handoff - learnings from ALL agents)
        if let Some(learnings_content) = learnings {
            if !learnings_content.trim().is_empty() {
                brief.push_str("## Accumulated Learnings\n\n");
                brief.push_str(
                    "These insights were gathered from previous iterations by all agents. Use them to avoid mistakes:\n\n",
                );
                brief.push_str(learnings_content);
                brief.push_str("\n");
            }
        }

        // Instructions
        // US-3.1: Learning Reporting Protocol
        brief.push_str("## Reporting Learnings (US-3.1)\n\n");
        brief.push_str("When you discover something useful for future iterations, report it using this structured protocol.\n");
        brief.push_str("The Ralph Loop will automatically extract and persist these learnings for future agents.\n\n");
        brief.push_str("### Format\n\n");
        brief.push_str("Use the `<learning>` tag with a `type` attribute:\n\n");
        brief.push_str("```\n");
        brief.push_str(
            "<learning type=\"pattern\">Description of the coding pattern to follow</learning>\n",
        );
        brief.push_str(
            "<learning type=\"gotcha\">Warning about something that caused problems</learning>\n",
        );
        brief.push_str(
            "<learning type=\"architecture\">Insight about the codebase architecture</learning>\n",
        );
        brief.push_str("<learning type=\"testing\">Testing-related insight</learning>\n");
        brief.push_str("<learning type=\"tooling\">Build/tooling insight</learning>\n");
        brief.push_str("```\n\n");
        brief.push_str("### With Code Example\n\n");
        brief.push_str("```\n");
        brief.push_str("<learning type=\"pattern\">\n");
        brief.push_str("Use atomic writes for file operations\n");
        brief.push_str("<code>\n");
        brief.push_str("let temp_path = path.with_extension(\"tmp\");\n");
        brief.push_str("std::fs::write(&temp_path, content)?;\n");
        brief.push_str("std::fs::rename(&temp_path, &path)?;\n");
        brief.push_str("</code>\n");
        brief.push_str("</learning>\n");
        brief.push_str("```\n\n");
        brief.push_str("### Valid Types\n\n");
        brief.push_str("- `architecture` - Codebase structure insights\n");
        brief.push_str("- `gotcha` - Things that caused problems\n");
        brief.push_str("- `pattern` - Coding patterns to follow\n");
        brief.push_str("- `testing` - Testing approaches\n");
        brief.push_str("- `tooling` - Build/tool configuration\n\n");

        brief.push_str("---\n\n");
        brief.push_str("## Instructions\n\n");
        brief.push_str("1. **Focus on the Current Story above** - implement only this story\n");
        brief.push_str("2. **Skip Completed Stories** - they are already done\n");
        brief.push_str("3. **Avoid In-Progress Work** - other agents are working on those\n");
        brief.push_str(
            "4. **Avoid Files Listed Above** - other agents are modifying those (US-2.2)\n",
        );
        brief.push_str("5. **Meet all Acceptance Criteria** before marking as complete\n");
        brief.push_str("6. **Report useful discoveries** using `<learning>` tags (see above)\n");
        brief.push_str("7. **Update PRD JSON** - set `passes: true` for the story when complete\n");
        brief
            .push_str("8. **Commit your changes** with a clear message referencing the story ID\n");

        brief
    }

    /// Build the brief content with assignments (US-1.3)
    ///
    /// Delegates to `build_brief_content_with_full_context` without file conflict info.
    pub fn build_brief_content_with_assignments(
        &self,
        prd: &RalphPrd,
        learnings: Option<&str>,
        iteration: Option<u32>,
        active_assignments: Option<&Vec<super::assignments_manager::Assignment>>,
        current_agent_id: Option<&str>,
    ) -> String {
        // Delegate to full context method without file info
        self.build_brief_content_with_full_context(
            prd,
            learnings,
            iteration,
            active_assignments,
            current_agent_id,
            None, // No files in use info
        )
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

    // US-1.3: Context Handoff Between Agents tests

    #[test]
    fn test_brief_format_is_agent_agnostic() {
        // US-1.3: BRIEF.md format is agent-agnostic (standard markdown)
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        builder
            .generate_brief(&prd, Some("Test learning"), Some(1))
            .unwrap();

        let brief = builder.read_brief().unwrap();

        // Verify standard markdown structure
        assert!(brief.starts_with("# Agent Task Brief\n"));

        // Check for standard markdown headers (## sections)
        assert!(brief.contains("## Progress Summary"));
        assert!(brief.contains("## Completed Stories"));
        assert!(brief.contains("## Current Story"));
        assert!(brief.contains("## Instructions"));

        // Check for markdown checkboxes
        assert!(brief.contains("- [x]") || brief.contains("- [ ]"));

        // Check that it uses standard markdown bold
        assert!(brief.contains("**PRD**:"));
        assert!(brief.contains("**Branch**:"));
    }

    #[test]
    fn test_brief_includes_completed_inprogress_pending() {
        // US-1.3: Brief includes completed work, in-progress work, and pending work
        use crate::models::AgentType;
        use crate::ralph_loop::assignments_manager::{Assignment, AssignmentsManager};

        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");

        // Create PRD with multiple stories
        let mut prd = RalphPrd::new("Multi-Agent PRD", "feature/multi");

        let mut story1 = RalphStory::new("US-1", "Completed Story", "- Done");
        story1.passes = true;

        let mut story2 = RalphStory::new("US-2", "In Progress Story", "- Doing");
        story2.passes = false;

        let mut story3 = RalphStory::new("US-3", "Pending Story One", "- Todo");
        story3.passes = false;

        let mut story4 = RalphStory::new("US-4", "Pending Story Two", "- Todo");
        story4.passes = false;

        let mut story5 = RalphStory::new("US-5", "Pending Story Three", "- Todo");
        story5.passes = false;

        prd.add_story(story1);
        prd.add_story(story2);
        prd.add_story(story3);
        prd.add_story(story4);
        prd.add_story(story5);

        // Create assignments to simulate another agent working on US-2
        let assignments_manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        assignments_manager.initialize("exec-123").unwrap();

        let assignment = Assignment::new("other-agent-1", AgentType::Opencode, "US-2");
        assignments_manager.add_assignment(assignment).unwrap();

        // Generate brief with full context
        builder
            .generate_brief_with_full_context(
                &prd,
                &crate::ralph_loop::learnings_manager::LearningsManager::new(
                    temp_dir.path(),
                    "test-prd",
                ),
                &assignments_manager,
                Some(1),
                Some("current-agent"),
            )
            .unwrap();

        let brief = builder.read_brief().unwrap();

        // Check completed section
        assert!(brief.contains("Completed Stories (SKIP THESE)"));
        assert!(brief.contains("**US-1**"));

        // Check in-progress section (work by other agents)
        assert!(brief.contains("In-Progress Work (OTHER AGENTS)"));
        assert!(brief.contains("**US-2**"));
        assert!(brief.contains("opencode")); // Agent type should be shown

        // Check current story section (US-3 should be assigned to this agent)
        assert!(brief.contains("Current Story (WORK ON THIS)"));
        assert!(brief.contains("US-3"));

        // Check pending section (US-4 and US-5 should be pending)
        assert!(brief.contains("Pending Stories"));
        assert!(brief.contains("**US-4**"));
        assert!(brief.contains("**US-5**"));
    }

    #[test]
    fn test_brief_includes_accumulated_learnings_from_all_agents() {
        // US-1.3: Brief includes accumulated learnings from all previous agents
        use crate::ralph_loop::learnings_manager::{LearningEntry, LearningType, LearningsManager};

        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        // Create learnings from different agents/iterations
        let learnings_manager = LearningsManager::new(temp_dir.path(), "test-prd");
        learnings_manager.initialize().unwrap();

        // Add learning from iteration 1 (simulating Claude agent)
        let learning1 = LearningEntry::with_type(
            1,
            LearningType::Pattern,
            "Use existing patterns from codebase",
        );
        learnings_manager.add_learning(learning1).unwrap();

        // Add learning from iteration 2 (simulating OpenCode agent)
        let learning2 = LearningEntry::with_type(
            2,
            LearningType::Gotcha,
            "Watch out for async race conditions",
        );
        learnings_manager.add_learning(learning2).unwrap();

        // Add learning from iteration 3 (simulating Cursor agent)
        let learning3 = LearningEntry::with_type(
            3,
            LearningType::Architecture,
            "Follow hexagonal architecture",
        );
        learnings_manager.add_learning(learning3).unwrap();

        // Generate brief with learnings manager
        builder
            .generate_brief_with_learnings_manager(&prd, &learnings_manager, Some(4))
            .unwrap();

        let brief = builder.read_brief().unwrap();

        // Check learnings section exists and has content
        assert!(brief.contains("Accumulated Learnings"));
        assert!(brief.contains("gathered from previous iterations by all agents"));

        // Check all learnings are included (from different iterations)
        assert!(brief.contains("Use existing patterns"));
        assert!(brief.contains("Watch out for async race conditions"));
        assert!(brief.contains("Follow hexagonal architecture"));

        // Check learnings are grouped by type
        assert!(brief.contains("### Pattern"));
        assert!(brief.contains("### Gotcha"));
        assert!(brief.contains("### Architecture"));
    }

    #[test]
    fn test_brief_readable_by_any_agent() {
        // US-1.3: Any AI coding agent can read and understand the brief
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        builder
            .generate_brief(
                &prd,
                Some("### Test Section\n- Point 1\n- Point 2"),
                Some(1),
            )
            .unwrap();

        let brief = builder.read_brief().unwrap();

        // Verify the brief is pure UTF-8 text (no binary or special encoding)
        assert!(brief.is_ascii() || brief.chars().all(|c| c.is_ascii() || c == '🎉'));

        // Verify clear section markers that any agent can parse
        assert!(
            brief.contains("## Completed Stories (SKIP THESE)")
                || brief.contains("## Current Story")
        );
        assert!(brief.contains("## Instructions"));

        // Verify actionable instructions are clear and universal
        assert!(brief.contains("Focus on the Current Story"));
        assert!(brief.contains("Skip Completed Stories"));
        assert!(brief.contains("Meet all Acceptance Criteria"));

        // Verify PRD reference path pattern is included
        assert!(brief.contains("Update PRD JSON"));
        assert!(brief.contains("passes: true"));
    }

    #[test]
    fn test_brief_excludes_current_agent_from_inprogress() {
        // Ensure the current agent's work is not shown in "In-Progress" section
        use crate::models::AgentType;
        use crate::ralph_loop::assignments_manager::{Assignment, AssignmentsManager};

        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");

        let mut prd = RalphPrd::new("Test PRD", "feature/test");
        let mut story1 = RalphStory::new("US-1", "Story One", "- Test");
        story1.passes = false;
        let mut story2 = RalphStory::new("US-2", "Story Two", "- Test");
        story2.passes = false;
        prd.add_story(story1);
        prd.add_story(story2);

        // Create assignments
        let assignments_manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        assignments_manager.initialize("exec-123").unwrap();

        // Current agent is working on US-1
        let assignment1 = Assignment::new("current-agent", AgentType::Claude, "US-1");
        assignments_manager.add_assignment(assignment1).unwrap();

        // Other agent is working on US-2
        let assignment2 = Assignment::new("other-agent", AgentType::Opencode, "US-2");
        assignments_manager.add_assignment(assignment2).unwrap();

        // Generate brief as current-agent
        builder
            .generate_brief_with_full_context(
                &prd,
                &crate::ralph_loop::learnings_manager::LearningsManager::new(
                    temp_dir.path(),
                    "test-prd",
                ),
                &assignments_manager,
                Some(1),
                Some("current-agent"),
            )
            .unwrap();

        let brief = builder.read_brief().unwrap();

        // In-Progress should only show other agent's work (US-2), not current agent's work (US-1)
        if brief.contains("In-Progress Work") {
            assert!(brief.contains("**US-2**"));
            // US-1 should NOT be in the in-progress section
            // It might be in current story section instead
        }
    }

    // =========================================================================
    // US-2.2: Avoid File Conflicts Tests
    // =========================================================================

    #[test]
    fn test_brief_includes_files_to_avoid() {
        // US-2.2: Brief includes "avoid these files" section
        use crate::models::AgentType;
        use crate::ralph_loop::assignments_manager::AssignmentsManager;

        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");

        let mut prd = RalphPrd::new("Test PRD", "feature/test");
        let mut story1 = RalphStory::new("US-1", "Story One", "- Test");
        story1.passes = false;
        let mut story2 = RalphStory::new("US-2", "Story Two", "- Test");
        story2.passes = false;
        prd.add_story(story1);
        prd.add_story(story2);

        // Create assignments with file estimates
        let assignments_manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        assignments_manager.initialize("exec-123").unwrap();

        // Another agent is working on US-1 with these files
        assignments_manager
            .assign_story_with_files(
                "other-agent",
                AgentType::Opencode,
                "US-1",
                vec![
                    "src/components/Button.tsx".to_string(),
                    "src/stores/uiStore.ts".to_string(),
                ],
            )
            .unwrap();

        // Generate brief with full context for current-agent
        builder
            .generate_brief_with_full_context(
                &prd,
                &crate::ralph_loop::learnings_manager::LearningsManager::new(
                    temp_dir.path(),
                    "test-prd",
                ),
                &assignments_manager,
                Some(1),
                Some("current-agent"),
            )
            .unwrap();

        let brief = builder.read_brief().unwrap();

        // Check "Files to Avoid" section exists
        assert!(brief.contains("Files to Avoid"));
        assert!(brief.contains("AVOID MODIFYING"));

        // Check that files are listed
        assert!(brief.contains("src/components/Button.tsx"));
        assert!(brief.contains("src/stores/uiStore.ts"));

        // Check that story/agent info is included
        assert!(brief.contains("US-1"));
        assert!(brief.contains("other-agent") || brief.contains("opencode"));
    }

    #[test]
    fn test_brief_no_files_to_avoid_when_empty() {
        // US-2.2: No "Files to Avoid" section when no files are in use
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        // Generate brief without any file conflicts
        builder.generate_brief(&prd, None, None).unwrap();

        let brief = builder.read_brief().unwrap();

        // Should NOT contain files section when no files are in use
        assert!(!brief.contains("Files to Avoid"));
    }

    #[test]
    fn test_brief_instructions_mention_avoid_files() {
        // US-2.2: Instructions mention avoiding files
        use crate::models::AgentType;
        use crate::ralph_loop::assignments_manager::AssignmentsManager;

        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");

        let mut prd = RalphPrd::new("Test PRD", "feature/test");
        let mut story = RalphStory::new("US-1", "Story", "- Test");
        story.passes = false;
        prd.add_story(story);

        let assignments_manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        assignments_manager.initialize("exec-123").unwrap();

        builder
            .generate_brief_with_full_context(
                &prd,
                &crate::ralph_loop::learnings_manager::LearningsManager::new(
                    temp_dir.path(),
                    "test-prd",
                ),
                &assignments_manager,
                Some(1),
                Some("current-agent"),
            )
            .unwrap();

        let brief = builder.read_brief().unwrap();

        // Instructions should mention avoiding files (US-2.2)
        assert!(brief.contains("Avoid Files Listed Above"));
    }

    // =========================================================================
    // US-3.1: Learning Protocol Tests
    // =========================================================================

    #[test]
    fn test_brief_includes_learning_protocol_section() {
        // US-3.1: Agents can report learnings via structured protocol in BRIEF.md
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        builder.generate_brief(&prd, None, Some(1)).unwrap();

        let brief = builder.read_brief().unwrap();

        // Check for learning protocol section
        assert!(brief.contains("Reporting Learnings"));
        assert!(brief.contains("<learning"));
        assert!(brief.contains("type=\"pattern\""));
        assert!(brief.contains("type=\"gotcha\""));
        assert!(brief.contains("type=\"architecture\""));
        assert!(brief.contains("type=\"testing\""));
        assert!(brief.contains("type=\"tooling\""));

        // Check for code example format
        assert!(brief.contains("<code>"));
        assert!(brief.contains("</code>"));
        assert!(brief.contains("</learning>"));
    }

    #[test]
    fn test_brief_learning_protocol_with_valid_types() {
        // US-3.1: Learnings categorized by type
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        builder.generate_brief(&prd, None, None).unwrap();

        let brief = builder.read_brief().unwrap();

        // All five types should be documented
        assert!(brief.contains("`architecture`"));
        assert!(brief.contains("`gotcha`"));
        assert!(brief.contains("`pattern`"));
        assert!(brief.contains("`testing`"));
        assert!(brief.contains("`tooling`"));
    }

    #[test]
    fn test_brief_instructions_mention_learning_tags() {
        // US-3.1: Instructions should mention using <learning> tags
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        builder.generate_brief(&prd, None, None).unwrap();

        let brief = builder.read_brief().unwrap();

        // Instructions should mention reporting learnings
        assert!(brief.contains("Report useful discoveries"));
        assert!(brief.contains("<learning>"));
    }

    // =========================================================================
    // US-3.2: Share Learnings in Brief Tests
    // =========================================================================

    #[test]
    fn test_brief_learnings_grouped_by_type() {
        // US-3.2: Learnings grouped by type for easy scanning
        use crate::ralph_loop::learnings_manager::{LearningEntry, LearningType, LearningsManager};

        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        // Create learnings of different types
        let learnings_manager = LearningsManager::new(temp_dir.path(), "test-prd");
        learnings_manager.initialize().unwrap();

        learnings_manager
            .add_learning(LearningEntry::with_type(
                1,
                LearningType::Gotcha,
                "Gotcha warning",
            ))
            .unwrap();
        learnings_manager
            .add_learning(LearningEntry::with_type(
                2,
                LearningType::Pattern,
                "Pattern to follow",
            ))
            .unwrap();
        learnings_manager
            .add_learning(LearningEntry::with_type(
                3,
                LearningType::Architecture,
                "Architecture note",
            ))
            .unwrap();

        builder
            .generate_brief_with_learnings_manager(&prd, &learnings_manager, Some(4))
            .unwrap();
        let brief = builder.read_brief().unwrap();

        // Check learnings section exists
        assert!(brief.contains("## Accumulated Learnings"));

        // Check all types are present as headers
        assert!(brief.contains("### Gotcha"));
        assert!(brief.contains("### Pattern"));
        assert!(brief.contains("### Architecture"));

        // Verify Gotcha comes first (most actionable)
        let gotcha_pos = brief.find("### Gotcha").unwrap();
        let pattern_pos = brief.find("### Pattern").unwrap();
        assert!(
            gotcha_pos < pattern_pos,
            "Gotcha should appear before Pattern for easy scanning"
        );
    }

    #[test]
    fn test_brief_learnings_with_syntax_highlighted_code() {
        // US-3.2: Code patterns include syntax-highlighted examples
        use crate::ralph_loop::learnings_manager::{LearningEntry, LearningType, LearningsManager};

        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        let learnings_manager = LearningsManager::new(temp_dir.path(), "test-prd");
        learnings_manager.initialize().unwrap();

        // Add a learning with Rust code
        let entry = LearningEntry::with_type(1, LearningType::Pattern, "Use atomic writes")
            .with_code("fn main() { let x = 5; }");
        learnings_manager.add_learning(entry).unwrap();

        builder
            .generate_brief_with_learnings_manager(&prd, &learnings_manager, Some(2))
            .unwrap();
        let brief = builder.read_brief().unwrap();

        // Check that code block has language specifier for syntax highlighting
        assert!(
            brief.contains("```rust"),
            "Code should have rust syntax highlighting"
        );
    }

    #[test]
    fn test_brief_learnings_prioritized_by_iteration() {
        // US-3.2: Most useful learnings prioritized (by iteration - most recent first)
        use crate::ralph_loop::learnings_manager::{LearningEntry, LearningType, LearningsManager};

        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        let learnings_manager = LearningsManager::new(temp_dir.path(), "test-prd");
        learnings_manager.initialize().unwrap();

        // Add learnings in reverse order (1, 3, 2) - they should be sorted to 3, 2, 1
        learnings_manager
            .add_learning(LearningEntry::with_type(
                1,
                LearningType::Pattern,
                "Old learning iter 1",
            ))
            .unwrap();
        learnings_manager
            .add_learning(LearningEntry::with_type(
                3,
                LearningType::Pattern,
                "Recent learning iter 3",
            ))
            .unwrap();
        learnings_manager
            .add_learning(LearningEntry::with_type(
                2,
                LearningType::Pattern,
                "Middle learning iter 2",
            ))
            .unwrap();

        builder
            .generate_brief_with_learnings_manager(&prd, &learnings_manager, Some(4))
            .unwrap();
        let brief = builder.read_brief().unwrap();

        // Most recent iteration should appear first within the type section
        let iter3_pos = brief.find("[Iter 3]").unwrap();
        let iter2_pos = brief.find("[Iter 2]").unwrap();
        let iter1_pos = brief.find("[Iter 1]").unwrap();

        assert!(
            iter3_pos < iter2_pos,
            "Iteration 3 should appear before iteration 2"
        );
        assert!(
            iter2_pos < iter1_pos,
            "Iteration 2 should appear before iteration 1"
        );
    }

    // =========================================================================
    // US-6.1: View Current Brief - Historical Briefs
    // =========================================================================

    #[test]
    fn test_brief_path_for_iteration() {
        // Test that iteration-specific paths are generated correctly
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");

        let path1 = builder.brief_path_for_iteration(1);
        let path2 = builder.brief_path_for_iteration(5);

        assert!(path1.to_string_lossy().contains("BRIEF-1.md"));
        assert!(path2.to_string_lossy().contains("BRIEF-5.md"));
    }

    #[test]
    fn test_save_brief_with_iteration() {
        // Test that briefs are saved both to current and historical paths
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        // Save brief for iteration 2
        builder
            .generate_brief(&prd, Some("- Test learning"), Some(2))
            .unwrap();

        // Check both files exist
        assert!(
            builder.brief_path().exists(),
            "Current BRIEF.md should exist"
        );
        assert!(
            builder.brief_path_for_iteration(2).exists(),
            "BRIEF-2.md should exist"
        );

        // Check contents are identical
        let current = std::fs::read_to_string(builder.brief_path()).unwrap();
        let historical = std::fs::read_to_string(builder.brief_path_for_iteration(2)).unwrap();
        assert_eq!(
            current, historical,
            "Current and historical briefs should have same content"
        );
    }

    #[test]
    fn test_list_historical_briefs() {
        // Test that historical briefs are listed and sorted by iteration
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let prd = create_test_prd();

        // Save briefs for iterations 1, 3, 2 (out of order)
        builder.generate_brief(&prd, None, Some(1)).unwrap();
        builder.generate_brief(&prd, None, Some(3)).unwrap();
        builder.generate_brief(&prd, None, Some(2)).unwrap();

        let briefs = builder.list_historical_briefs().unwrap();

        // Should have 4 entries: iteration 0 (current) + 1, 2, 3
        assert_eq!(briefs.len(), 4, "Should have 4 briefs (0, 1, 2, 3)");

        // Check iteration numbers
        let iterations: Vec<u32> = briefs.iter().map(|(iter, _)| iter).copied().collect();
        assert_eq!(
            iterations,
            vec![0, 1, 2, 3],
            "Iterations should be sorted ascending"
        );

        // Check all content is non-empty
        for (_, content) in briefs {
            assert!(!content.is_empty(), "Brief content should not be empty");
            assert!(
                content.contains("# Agent Task Brief"),
                "Brief should contain header"
            );
        }
    }

    #[test]
    fn test_list_historical_briefs_empty() {
        // Test that listing briefs for non-existent PRD returns empty
        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "nonexistent-prd");

        let briefs = builder.list_historical_briefs().unwrap();
        assert_eq!(
            briefs.len(),
            0,
            "Should return empty list for non-existent PRD"
        );
    }

    #[test]
    fn test_brief_with_learnings_saves_historical() {
        // Test that generate_brief_with_learnings_manager saves historical versions
        use crate::ralph_loop::learnings_manager::LearningsManager;

        let temp_dir = setup_test_dir();
        let builder = BriefBuilder::new(temp_dir.path(), "test-prd");
        let learnings_manager = LearningsManager::new(temp_dir.path(), "test-prd");
        learnings_manager.initialize().unwrap();

        let prd = create_test_prd();

        // Save for iteration 5
        builder
            .generate_brief_with_learnings_manager(&prd, &learnings_manager, Some(5))
            .unwrap();

        // Both current and historical should exist
        assert!(builder.brief_path().exists());
        assert!(builder.brief_path_for_iteration(5).exists());

        // List should include both
        let briefs = builder.list_historical_briefs().unwrap();
        let iterations: Vec<u32> = briefs.iter().map(|(iter, _)| iter).copied().collect();
        assert!(iterations.contains(&0), "Should have iteration 0 (current)");
        assert!(
            iterations.contains(&5),
            "Should have iteration 5 (historical)"
        );
    }
}
