//! Learning management: add, update, delete, export

use crate::ralph_loop::{LearningEntry, LearningType, LearningsFile, LearningsManager};
use crate::utils::to_path_buf;
use serde::{Deserialize, Serialize};

// ============================================================================
// Types
// ============================================================================

/// Input for adding a manual learning
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddLearningInput {
    /// Type/category of the learning
    pub learning_type: String,
    /// The learning content (description)
    pub content: String,
    /// Optional code example
    pub code_example: Option<String>,
    /// Optional associated story ID
    pub story_id: Option<String>,
}

/// Input for updating an existing learning
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLearningInput {
    /// ID of the learning to update
    pub id: String,
    /// Updated type/category (optional)
    pub learning_type: Option<String>,
    /// Updated content (optional)
    pub content: Option<String>,
    /// Updated code example (optional, None to keep, Some("") to remove)
    pub code_example: Option<String>,
    /// Updated story ID (optional, None to keep, Some("") to remove)
    pub story_id: Option<String>,
}

// ============================================================================
// US-3.3: Manual Learning Entry - CRUD commands for learnings
// ============================================================================

/// Get all learnings for a PRD (US-3.3: Manual Learning Entry)
///
/// Returns the learnings file containing all accumulated learnings for the specified PRD.
pub fn get_ralph_learnings(
    project_path: String,
    prd_name: String,
) -> Result<LearningsFile, String> {
    let manager = LearningsManager::new(&to_path_buf(&project_path), &prd_name);
    manager.read()
}

/// Add a manual learning entry (US-3.3: Manual Learning Entry)
///
/// Allows users to add learnings with type, content, and optional code.
/// Manual learnings are integrated with agent-reported learnings.
pub fn add_ralph_learning(
    project_path: String,
    prd_name: String,
    input: AddLearningInput,
) -> Result<LearningEntry, String> {
    let manager = LearningsManager::new(&to_path_buf(&project_path), &prd_name);

    // Parse learning type
    let learning_type: LearningType = input.learning_type.parse().unwrap_or(LearningType::General);

    // Get current iteration from learnings file (or default to 0 for manual entries)
    let file = manager.read()?;
    let iteration = file.total_iterations;

    // Create the learning entry
    let mut entry = LearningEntry::with_type(iteration, learning_type, &input.content).from_human();

    if let Some(story_id) = input.story_id {
        entry = entry.for_story(story_id);
    }

    if let Some(code) = input.code_example {
        entry = entry.with_code(code);
    }

    // Save the ID before adding (entry will be moved)
    let entry_id = entry.id.clone();

    // Add to file
    manager.add_learning(entry)?;

    // Return the created entry by reading it back
    let file = manager.read()?;
    file.entries
        .into_iter()
        .find(|e| e.id == entry_id)
        .ok_or_else(|| "Failed to find created learning entry".to_string())
}

/// Update an existing learning entry (US-3.3: Manual Learning Entry)
///
/// Edit capabilities for manual learnings.
pub fn update_ralph_learning(
    project_path: String,
    prd_name: String,
    input: UpdateLearningInput,
) -> Result<LearningEntry, String> {
    let manager = LearningsManager::new(&to_path_buf(&project_path), &prd_name);
    let mut file = manager.read()?;

    // Find the entry to update
    let entry_idx = file
        .entries
        .iter()
        .position(|e| e.id == input.id)
        .ok_or_else(|| format!("Learning with id '{}' not found", input.id))?;

    // Update fields
    if let Some(learning_type_str) = input.learning_type {
        file.entries[entry_idx].learning_type =
            learning_type_str.parse().unwrap_or(LearningType::General);
    }

    if let Some(content) = input.content {
        file.entries[entry_idx].content = content;
    }

    if let Some(code) = input.code_example {
        file.entries[entry_idx].code_example = if code.is_empty() { None } else { Some(code) };
    }

    if let Some(story_id) = input.story_id {
        file.entries[entry_idx].story_id = if story_id.is_empty() {
            None
        } else {
            Some(story_id)
        };
    }

    // Update timestamp
    file.last_updated = chrono::Utc::now().to_rfc3339();

    manager.write(&file)?;

    Ok(file.entries[entry_idx].clone())
}

/// Delete a learning entry (US-3.3: Manual Learning Entry)
///
/// Delete capabilities for manual learnings.
pub fn delete_ralph_learning(
    project_path: String,
    prd_name: String,
    learning_id: String,
) -> Result<bool, String> {
    let manager = LearningsManager::new(&to_path_buf(&project_path), &prd_name);
    let mut file = manager.read()?;

    let initial_len = file.entries.len();
    file.entries.retain(|e| e.id != learning_id);

    if file.entries.len() == initial_len {
        return Ok(false); // Entry not found
    }

    file.last_updated = chrono::Utc::now().to_rfc3339();
    manager.write(&file)?;

    Ok(true)
}

/// Export learnings to markdown (US-6.3: Learning Analytics)
///
/// Exports all learnings in a PRD to a markdown-formatted string for documentation.
/// Includes learning type grouping, syntax highlighting, and metadata.
pub fn export_ralph_learnings(project_path: String, prd_name: String) -> Result<String, String> {
    let manager = LearningsManager::new(&to_path_buf(&project_path), &prd_name);
    manager.export_markdown()
}
