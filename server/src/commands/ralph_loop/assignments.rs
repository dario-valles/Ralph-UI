//! Assignment operations: assign, release, get_files_in_use

use crate::models::AgentType;
use crate::ralph_loop::{AssignmentsFile, AssignmentsManager, FileInUse};
use crate::utils::to_path_buf;
use serde::{Deserialize, Serialize};

// ============================================================================
// Types
// ============================================================================

/// Input for manually assigning a story to an agent
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualAssignStoryInput {
    /// Agent identifier
    pub agent_id: String,
    /// Agent type (claude, opencode, cursor, codex)
    pub agent_type: String,
    /// Story ID to assign
    pub story_id: String,
    /// If true, releases any existing assignment and reassigns
    #[serde(default)]
    pub force: bool,
    /// Optional estimated files for conflict detection
    pub estimated_files: Option<Vec<String>>,
}

// ============================================================================
// Assignment Operations (US-2.3: View Parallel Progress)
// ============================================================================

/// Get all assignments for a PRD (US-2.3: View Parallel Progress)
///
/// Returns the assignments file containing all current and historical assignments
/// for the specified PRD. This enables the UI to display:
/// - All current agent assignments
/// - Each assignment's agent ID, story, start time, estimated files
/// - Assignment status (active, completed, failed, released)
pub fn get_ralph_assignments(
    project_path: String,
    prd_name: String,
) -> Result<AssignmentsFile, String> {
    let manager = AssignmentsManager::new(&to_path_buf(&project_path), &prd_name);
    manager.read()
}

/// Get files currently in use by active agents (US-2.3: View Parallel Progress)
///
/// Returns a list of files that are currently being modified by active agents.
/// This is used to display visual indicators for potential conflict zones.
pub fn get_ralph_files_in_use(
    project_path: String,
    prd_name: String,
) -> Result<Vec<FileInUse>, String> {
    let manager = AssignmentsManager::new(&to_path_buf(&project_path), &prd_name);
    manager.get_files_in_use()
}

// ============================================================================
// US-4.1: Priority-Based Assignment - Manual Override Commands
// ============================================================================

/// Manually assign a story to an agent (US-4.1: Priority-Based Assignment)
///
/// This provides a manual override for exceptional cases where a specific
/// story needs to be assigned regardless of priority order. Use cases include:
/// - Debugging a specific story issue
/// - Prioritizing urgent work that bypasses normal priority
/// - Reassigning work after an agent failure
///
/// If the story is already assigned and `force` is false, returns an error.
/// If `force` is true, releases the existing assignment first.
pub fn manual_assign_ralph_story(
    project_path: String,
    prd_name: String,
    input: ManualAssignStoryInput,
    broadcaster: Option<std::sync::Arc<crate::server::EventBroadcaster>>,
) -> Result<crate::ralph_loop::Assignment, String> {
    let manager = AssignmentsManager::new(&to_path_buf(&project_path), &prd_name);

    // Parse agent type
    let agent_type: AgentType = input
        .agent_type
        .parse()
        .map_err(|_| format!("Invalid agent type: {}", input.agent_type))?;

    // Use appropriate method based on whether files are provided
    let result = match input.estimated_files {
        Some(files) => manager.manual_assign_story_with_files(
            &input.agent_id,
            agent_type,
            &input.story_id,
            files,
            input.force,
        ),
        None => {
            manager.manual_assign_story(&input.agent_id, agent_type, &input.story_id, input.force)
        }
    };

    // Emit event on successful assignment (US-6.2: Real-Time Assignment Updates)
    if let Ok(assignment) = &result {
        if let Some(bc) = broadcaster {
            use crate::events::{AssignmentChangeType, AssignmentChangedPayload};
            let payload = AssignmentChangedPayload {
                change_type: AssignmentChangeType::Created,
                agent_id: input.agent_id.clone(),
                agent_type: input.agent_type.clone(),
                story_id: input.story_id.clone(),
                prd_name: prd_name.clone(),
                estimated_files: assignment.estimated_files.clone(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            };
            bc.broadcast("assignment:changed", &payload);
        }
    }

    result
}

/// Release a story assignment back to the pool (US-4.1: Priority-Based Assignment)
///
/// This allows manually releasing a story that was assigned to an agent,
/// making it available for automatic assignment to another agent.
pub fn release_ralph_story_assignment(
    project_path: String,
    prd_name: String,
    story_id: String,
    broadcaster: Option<std::sync::Arc<crate::server::EventBroadcaster>>,
) -> Result<(), String> {
    let manager = AssignmentsManager::new(&to_path_buf(&project_path), &prd_name);
    let result = manager.release_story(&story_id);

    // Emit event on successful release (US-6.2: Real-Time Assignment Updates)
    if result.is_ok() {
        if let Some(bc) = broadcaster {
            use crate::events::{AssignmentChangeType, AssignmentChangedPayload};
            let payload = AssignmentChangedPayload {
                change_type: AssignmentChangeType::Released,
                agent_id: String::new(),
                agent_type: String::new(),
                story_id: story_id.clone(),
                prd_name: prd_name.clone(),
                estimated_files: Vec::new(),
                timestamp: chrono::Utc::now().to_rfc3339(),
            };
            bc.broadcast("assignment:changed", &payload);
        }
    }

    result
}
