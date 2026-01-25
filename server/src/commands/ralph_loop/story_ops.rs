//! Story management: add, remove, mark passing/failing

use crate::ralph_loop::RalphStory;
use serde::{Deserialize, Serialize};

use super::helpers::prd_executor;

// ============================================================================
// Types
// ============================================================================

/// Input for creating a Ralph story
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RalphStoryInput {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub acceptance: String,
    pub priority: Option<u32>,
    pub dependencies: Option<Vec<String>>,
    pub tags: Option<Vec<String>>,
    pub effort: Option<String>,
}

// ============================================================================
// Story Operations
// ============================================================================

/// Mark a story as passing in the PRD
pub fn mark_ralph_story_passing(
    project_path: String,
    prd_name: String,
    story_id: String,
) -> Result<bool, String> {
    prd_executor(&project_path, &prd_name).mark_story_passing(&story_id)
}

/// Mark a story as failing in the PRD
pub fn mark_ralph_story_failing(
    project_path: String,
    prd_name: String,
    story_id: String,
) -> Result<bool, String> {
    prd_executor(&project_path, &prd_name).mark_story_failing(&story_id)
}

/// Add a story to the PRD
pub fn add_ralph_story(
    project_path: String,
    prd_name: String,
    story: RalphStoryInput,
) -> Result<(), String> {
    let mut ralph_story = RalphStory::new(&story.id, &story.title, &story.acceptance);
    ralph_story.description = story.description;
    ralph_story.priority = story.priority.unwrap_or(100);
    ralph_story.dependencies = story.dependencies.unwrap_or_default();
    ralph_story.tags = story.tags.unwrap_or_default();
    ralph_story.effort = story.effort;

    prd_executor(&project_path, &prd_name).add_story(ralph_story)
}

/// Remove a story from the PRD
pub fn remove_ralph_story(
    project_path: String,
    prd_name: String,
    story_id: String,
) -> Result<bool, String> {
    prd_executor(&project_path, &prd_name).remove_story(&story_id)
}
