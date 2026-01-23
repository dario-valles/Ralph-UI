//! Hierarchical Agent Team Manager (US-5.2)
//!
//! Manages hierarchical team execution where a primary agent reviews PRD and creates subtasks
//! that are assigned to assistants. The primary agent then reviews completed work before merge.

use crate::ralph_loop::types::{ExecutionMode, RalphStory, RalphSubtask};
use serde::{Deserialize, Serialize};

/// Represents a hierarchical team assignment (US-5.2)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HierarchicalTeamAssignment {
    /// Agent ID or name of the primary agent
    pub primary_agent_id: String,

    /// Model tier for the primary agent (e.g., "claude-opus-4-5")
    pub primary_model: String,

    /// List of assistant agent models assigned to this story
    pub assistant_models: Vec<String>,

    /// Story that was broken down into subtasks
    pub story_id: String,

    /// Subtasks created by primary agent
    pub subtasks: Vec<HierarchicalSubtaskAssignment>,

    /// Whether primary agent review is required before merge
    pub requires_primary_review: bool,

    /// When the assignment was created
    pub created_at: String,
}

/// Individual subtask assignment (US-5.2)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HierarchicalSubtaskAssignment {
    /// Subtask ID
    pub subtask_id: String,

    /// Agent ID or name of the assigned assistant
    pub assistant_agent_id: String,

    /// Model of the assistant
    pub assistant_model: String,

    /// Whether the subtask is complete
    pub completed: bool,

    /// Primary agent's review status (None = not reviewed, Some = approved/rejected)
    pub primary_review: Option<PrimaryReview>,
}

/// Primary agent's review of a subtask (US-5.2)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PrimaryReview {
    /// Approved for merge
    Approved {
        message: String,
    },
    /// Rejected - needs rework
    Rejected {
        message: String,
        reason: String,
    },
}

impl HierarchicalTeamAssignment {
    /// Create a new hierarchical team assignment
    pub fn new(
        primary_agent_id: impl Into<String>,
        primary_model: impl Into<String>,
        assistant_models: Vec<String>,
        story_id: impl Into<String>,
        requires_primary_review: bool,
    ) -> Self {
        Self {
            primary_agent_id: primary_agent_id.into(),
            primary_model: primary_model.into(),
            assistant_models,
            story_id: story_id.into(),
            subtasks: Vec::new(),
            requires_primary_review,
            created_at: chrono::Utc::now().to_rfc3339(),
        }
    }

    /// Add a subtask assignment
    pub fn add_subtask_assignment(
        &mut self,
        subtask_id: impl Into<String>,
        assistant_agent_id: impl Into<String>,
        assistant_model: impl Into<String>,
    ) {
        self.subtasks.push(HierarchicalSubtaskAssignment {
            subtask_id: subtask_id.into(),
            assistant_agent_id: assistant_agent_id.into(),
            assistant_model: assistant_model.into(),
            completed: false,
            primary_review: None,
        });
    }

    /// Get all unreviewed subtasks
    pub fn unreviewed_subtasks(&self) -> Vec<&HierarchicalSubtaskAssignment> {
        self.subtasks
            .iter()
            .filter(|st| st.primary_review.is_none() && st.completed)
            .collect()
    }

    /// Check if all subtasks are reviewed
    pub fn all_subtasks_reviewed(&self) -> bool {
        self.subtasks.iter().all(|st| st.primary_review.is_some())
    }

    /// Check if primary review is pending
    pub fn pending_primary_review(&self) -> bool {
        self.requires_primary_review && !self.all_subtasks_reviewed()
    }
}

impl HierarchicalSubtaskAssignment {
    /// Mark as approved by primary
    pub fn approve(&mut self, message: impl Into<String>) {
        self.primary_review = Some(PrimaryReview::Approved {
            message: message.into(),
        });
    }

    /// Mark as rejected by primary
    pub fn reject(&mut self, message: impl Into<String>, reason: impl Into<String>) {
        self.primary_review = Some(PrimaryReview::Rejected {
            message: message.into(),
            reason: reason.into(),
        });
    }

    /// Check if approved by primary
    pub fn is_approved(&self) -> bool {
        matches!(self.primary_review, Some(PrimaryReview::Approved { .. }))
    }

    /// Check if rejected by primary
    pub fn is_rejected(&self) -> bool {
        matches!(self.primary_review, Some(PrimaryReview::Rejected { .. }))
    }
}

/// Manager for hierarchical team execution (US-5.2)
pub struct HierarchicalTeamManager {
    assignments: Vec<HierarchicalTeamAssignment>,
}

impl HierarchicalTeamManager {
    /// Create a new hierarchical team manager
    pub fn new() -> Self {
        Self {
            assignments: Vec::new(),
        }
    }

    /// Create subtasks for a story from PRD (US-5.2 acceptance criteria #1)
    ///
    /// Breaks down a story into smaller subtasks based on the acceptance criteria.
    /// This is called by the primary agent after reading the PRD.
    pub fn create_subtasks_for_story(story: &mut RalphStory, execution_mode: &ExecutionMode) -> Vec<RalphSubtask> {
        if let ExecutionMode::Hierarchical { .. } = execution_mode {
            // For hierarchical teams, we analyze the acceptance criteria and create subtasks
            // The primary agent will refine these, but we provide structure here
            Self::generate_subtasks_from_acceptance_criteria(story)
        } else {
            Vec::new()
        }
    }

    /// Generate subtasks from acceptance criteria
    fn generate_subtasks_from_acceptance_criteria(story: &RalphStory) -> Vec<RalphSubtask> {
        let mut subtasks = Vec::new();
        let mut subtask_index = 1;

        // Parse acceptance criteria (bullet points)
        for line in story.acceptance.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
                let criterion = trimmed.strip_prefix("- ").or(trimmed.strip_prefix("* ")).unwrap_or(trimmed);

                if !criterion.is_empty() {
                    let subtask_id = format!("{}-ST-{}", story.id, subtask_index);
                    let subtask = RalphSubtask::new(
                        subtask_id,
                        format!("Subtask: Implement criterion {}", subtask_index),
                        criterion.to_string(),
                    );
                    subtasks.push(subtask);
                    subtask_index += 1;
                }
            }
        }

        subtasks
    }

    /// Assign subtasks to assistant agents (US-5.2 acceptance criteria #2)
    pub fn assign_subtasks_to_assistants(
        &mut self,
        assignment: &mut HierarchicalTeamAssignment,
        assistant_agent_ids: Vec<String>,
    ) {
        // Distribute subtasks among assistants in round-robin fashion
        for (index, subtask) in assignment.subtasks.iter_mut().enumerate() {
            let assistant_idx = index % assignment.assistant_models.len();
            let assistant_id = assistant_agent_ids.get(assistant_idx).cloned().unwrap_or_else(|| {
                format!("assistant-{}", assistant_idx)
            });
            let assistant_model = assignment.assistant_models.get(assistant_idx).cloned().unwrap_or_default();

            subtask.assistant_agent_id = assistant_id;
            subtask.assistant_model = assistant_model;
        }
    }

    /// Check if primary review is required (US-5.2 acceptance criteria #3)
    pub fn requires_primary_review(&self, assignment: &HierarchicalTeamAssignment) -> bool {
        assignment.requires_primary_review && assignment.pending_primary_review()
    }

    /// Get pending reviews for primary agent
    pub fn get_pending_reviews(&self) -> Vec<&HierarchicalTeamAssignment> {
        self.assignments
            .iter()
            .filter(|a| a.requires_primary_review && !a.all_subtasks_reviewed())
            .collect()
    }

    /// Approve a subtask review
    pub fn approve_subtask(&mut self, assignment_id: usize, subtask_id: &str, message: impl Into<String>) -> Result<(), String> {
        if let Some(assignment) = self.assignments.get_mut(assignment_id) {
            if let Some(subtask) = assignment.subtasks.iter_mut().find(|st| st.subtask_id == subtask_id) {
                subtask.approve(message);
                Ok(())
            } else {
                Err(format!("Subtask {} not found", subtask_id))
            }
        } else {
            Err(format!("Assignment {} not found", assignment_id))
        }
    }

    /// Reject a subtask review
    pub fn reject_subtask(
        &mut self,
        assignment_id: usize,
        subtask_id: &str,
        message: impl Into<String>,
        reason: impl Into<String>,
    ) -> Result<(), String> {
        if let Some(assignment) = self.assignments.get_mut(assignment_id) {
            if let Some(subtask) = assignment.subtasks.iter_mut().find(|st| st.subtask_id == subtask_id) {
                subtask.reject(message, reason);
                Ok(())
            } else {
                Err(format!("Subtask {} not found", subtask_id))
            }
        } else {
            Err(format!("Assignment {} not found", assignment_id))
        }
    }

    /// Check if all subtasks are approved (US-5.2 acceptance criteria #3)
    pub fn all_subtasks_approved(&self, assignment_id: usize) -> bool {
        if let Some(assignment) = self.assignments.get(assignment_id) {
            assignment.subtasks.iter().all(|st| st.is_approved() || !st.completed)
        } else {
            false
        }
    }

    /// Check if execution mode is hierarchical with different model tiers (US-5.2 acceptance criteria #4)
    pub fn has_model_tiers(execution_mode: &ExecutionMode) -> bool {
        matches!(execution_mode, ExecutionMode::Hierarchical { .. })
    }
}

impl Default for HierarchicalTeamManager {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_hierarchical_team_assignment() {
        let assignment = HierarchicalTeamAssignment::new(
            "primary-agent",
            "claude-opus-4-5",
            vec!["claude-sonnet-4-5".to_string()],
            "US-1",
            true,
        );

        assert_eq!(assignment.primary_agent_id, "primary-agent");
        assert_eq!(assignment.primary_model, "claude-opus-4-5");
        assert_eq!(assignment.story_id, "US-1");
        assert!(assignment.requires_primary_review);
        assert!(assignment.subtasks.is_empty());
    }

    #[test]
    fn test_add_subtask_assignment() {
        let mut assignment = HierarchicalTeamAssignment::new(
            "primary-agent",
            "claude-opus-4-5",
            vec!["claude-sonnet-4-5".to_string()],
            "US-1",
            true,
        );

        assignment.add_subtask_assignment("US-1-ST-1", "assistant-1", "claude-sonnet-4-5");

        assert_eq!(assignment.subtasks.len(), 1);
        assert_eq!(assignment.subtasks[0].subtask_id, "US-1-ST-1");
    }

    #[test]
    fn test_generate_subtasks_from_acceptance_criteria() {
        let mut story = RalphStory::new("US-1", "Test Story", "- First criterion\n- Second criterion\n- Third criterion");
        let mode = ExecutionMode::Hierarchical {
            primary_model: "claude-opus-4-5".to_string(),
            assistant_models: vec!["claude-sonnet-4-5".to_string()],
            requires_primary_review: true,
        };

        let subtasks = HierarchicalTeamManager::create_subtasks_for_story(&mut story, &mode);

        assert_eq!(subtasks.len(), 3);
        assert_eq!(subtasks[0].id, "US-1-ST-1");
        assert_eq!(subtasks[1].id, "US-1-ST-2");
        assert_eq!(subtasks[2].id, "US-1-ST-3");
    }

    #[test]
    fn test_unreviewed_subtasks() {
        let mut assignment = HierarchicalTeamAssignment::new(
            "primary-agent",
            "claude-opus-4-5",
            vec!["claude-sonnet-4-5".to_string()],
            "US-1",
            true,
        );

        assignment.add_subtask_assignment("US-1-ST-1", "assistant-1", "claude-sonnet-4-5");
        assignment.subtasks[0].completed = true;

        let unreviewed = assignment.unreviewed_subtasks();
        assert_eq!(unreviewed.len(), 1);
    }

    #[test]
    fn test_approve_subtask() {
        let mut assignment = HierarchicalTeamAssignment::new(
            "primary-agent",
            "claude-opus-4-5",
            vec!["claude-sonnet-4-5".to_string()],
            "US-1",
            true,
        );

        assignment.add_subtask_assignment("US-1-ST-1", "assistant-1", "claude-sonnet-4-5");
        assignment.subtasks[0].approve("Looks good");

        assert!(assignment.subtasks[0].is_approved());
        assert!(!assignment.subtasks[0].is_rejected());
    }

    #[test]
    fn test_reject_subtask() {
        let mut assignment = HierarchicalTeamAssignment::new(
            "primary-agent",
            "claude-opus-4-5",
            vec!["claude-sonnet-4-5".to_string()],
            "US-1",
            true,
        );

        assignment.add_subtask_assignment("US-1-ST-1", "assistant-1", "claude-sonnet-4-5");
        assignment.subtasks[0].reject("Needs more work", "Missing error handling");

        assert!(!assignment.subtasks[0].is_approved());
        assert!(assignment.subtasks[0].is_rejected());
    }

    #[test]
    fn test_primary_review_required() {
        let mut assignment = HierarchicalTeamAssignment::new(
            "primary-agent",
            "claude-opus-4-5",
            vec!["claude-sonnet-4-5".to_string()],
            "US-1",
            true, // requires_primary_review = true
        );

        assignment.add_subtask_assignment("US-1-ST-1", "assistant-1", "claude-sonnet-4-5");
        assignment.subtasks[0].completed = true;

        assert!(assignment.pending_primary_review());
    }

    #[test]
    fn test_no_primary_review_required() {
        let assignment = HierarchicalTeamAssignment::new(
            "primary-agent",
            "claude-opus-4-5",
            vec!["claude-sonnet-4-5".to_string()],
            "US-1",
            false, // requires_primary_review = false
        );

        assert!(!assignment.pending_primary_review());
    }

    #[test]
    fn test_has_model_tiers() {
        let mode = ExecutionMode::Hierarchical {
            primary_model: "claude-opus-4-5".to_string(),
            assistant_models: vec!["claude-sonnet-4-5".to_string()],
            requires_primary_review: true,
        };

        assert!(HierarchicalTeamManager::has_model_tiers(&mode));
    }

    #[test]
    fn test_single_agent_mode_no_model_tiers() {
        let mode = ExecutionMode::SingleAgent;

        assert!(!HierarchicalTeamManager::has_model_tiers(&mode));
    }
}
