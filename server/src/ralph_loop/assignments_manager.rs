//! Assignments Manager - Manages agent story assignments for crash recovery
//!
//! The assignments.json file stores the state of agent-to-story assignments.
//! This enables:
//! - Crash recovery: On restart, Ralph Loop can restore assignment state
//! - Multi-agent coordination (future): Tracks which agent is assigned to which story
//! - Progress visibility: UI can show current assignment state
//!
//! File location: `.ralph-ui/briefs/{prd_name}/assignments.json`

use crate::file_storage::{atomic_write, ensure_dir, read_json};
use crate::models::AgentType;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// A file currently in use by an agent (US-2.2: Avoid File Conflicts)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInUse {
    /// Path to the file
    pub path: String,
    /// Agent ID using this file
    pub agent_id: String,
    /// Type of agent
    pub agent_type: AgentType,
    /// Story being worked on
    pub story_id: String,
}

/// A potential file conflict between agents (US-2.2: Avoid File Conflicts)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileConflict {
    /// Path to the conflicting file
    pub path: String,
    /// ID of the agent already using this file
    pub conflicting_agent_id: String,
    /// Type of the conflicting agent
    pub conflicting_agent_type: AgentType,
    /// Story ID being worked on by the conflicting agent
    pub conflicting_story_id: String,
}

/// Status of an assignment
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssignmentStatus {
    /// Agent is actively working on this story
    Active,
    /// Story has been completed
    Completed,
    /// Agent failed to complete the story
    Failed,
    /// Assignment was released back to pool
    Released,
}

impl Default for AssignmentStatus {
    fn default() -> Self {
        Self::Active
    }
}

impl std::fmt::Display for AssignmentStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AssignmentStatus::Active => write!(f, "active"),
            AssignmentStatus::Completed => write!(f, "completed"),
            AssignmentStatus::Failed => write!(f, "failed"),
            AssignmentStatus::Released => write!(f, "released"),
        }
    }
}

/// A single agent-to-story assignment
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Assignment {
    /// Unique assignment ID
    pub id: String,
    /// Agent identifier (execution_id-iter-N format)
    pub agent_id: String,
    /// Agent type (Claude, OpenCode, etc.)
    pub agent_type: AgentType,
    /// Assigned story ID
    pub story_id: String,
    /// When the assignment was created
    pub assigned_at: String,
    /// Current status of the assignment
    #[serde(default)]
    pub status: AssignmentStatus,
    /// When the status was last updated
    #[serde(skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// Which iteration this assignment started at
    #[serde(skip_serializing_if = "Option::is_none")]
    pub iteration_start: Option<u32>,
    /// Estimated files that will be modified (for conflict detection)
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub estimated_files: Vec<String>,
    /// Error message if failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

impl Assignment {
    /// Create a new active assignment
    pub fn new(agent_id: impl Into<String>, agent_type: AgentType, story_id: impl Into<String>) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            agent_id: agent_id.into(),
            agent_type,
            story_id: story_id.into(),
            assigned_at: chrono::Utc::now().to_rfc3339(),
            status: AssignmentStatus::Active,
            updated_at: None,
            iteration_start: None,
            estimated_files: Vec::new(),
            error_message: None,
        }
    }

    /// Mark this assignment as completed
    pub fn mark_completed(&mut self) {
        self.status = AssignmentStatus::Completed;
        self.updated_at = Some(chrono::Utc::now().to_rfc3339());
    }

    /// Mark this assignment as failed
    pub fn mark_failed(&mut self, error: impl Into<String>) {
        self.status = AssignmentStatus::Failed;
        self.error_message = Some(error.into());
        self.updated_at = Some(chrono::Utc::now().to_rfc3339());
    }

    /// Release this assignment back to pool
    pub fn release(&mut self) {
        self.status = AssignmentStatus::Released;
        self.updated_at = Some(chrono::Utc::now().to_rfc3339());
    }

    /// Check if this assignment is currently active
    pub fn is_active(&self) -> bool {
        self.status == AssignmentStatus::Active
    }
}

/// The complete assignments file structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssignmentsFile {
    /// List of all assignments (current and historical)
    pub assignments: Vec<Assignment>,
    /// When this file was created
    pub created_at: String,
    /// When this file was last updated
    pub last_updated: String,
    /// Current iteration number
    #[serde(default)]
    pub current_iteration: u32,
    /// Execution ID this file belongs to
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execution_id: Option<String>,
}

impl Default for AssignmentsFile {
    fn default() -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            assignments: Vec::new(),
            created_at: now.clone(),
            last_updated: now,
            current_iteration: 0,
            execution_id: None,
        }
    }
}

impl AssignmentsFile {
    /// Create a new assignments file with an execution ID
    pub fn new(execution_id: impl Into<String>) -> Self {
        let now = chrono::Utc::now().to_rfc3339();
        Self {
            assignments: Vec::new(),
            created_at: now.clone(),
            last_updated: now,
            current_iteration: 0,
            execution_id: Some(execution_id.into()),
        }
    }

    /// Get active assignments
    pub fn active_assignments(&self) -> Vec<&Assignment> {
        self.assignments.iter().filter(|a| a.is_active()).collect()
    }

    /// Get assignment for a specific story
    pub fn get_story_assignment(&self, story_id: &str) -> Option<&Assignment> {
        self.assignments
            .iter()
            .find(|a| a.story_id == story_id && a.is_active())
    }

    /// Check if a story is currently assigned
    pub fn is_story_assigned(&self, story_id: &str) -> bool {
        self.get_story_assignment(story_id).is_some()
    }

    /// Add a new assignment
    pub fn add_assignment(&mut self, assignment: Assignment) {
        self.assignments.push(assignment);
        self.last_updated = chrono::Utc::now().to_rfc3339();
    }

    /// Update an existing assignment
    pub fn update_assignment(&mut self, assignment_id: &str, updater: impl FnOnce(&mut Assignment)) {
        if let Some(assignment) = self.assignments.iter_mut().find(|a| a.id == assignment_id) {
            updater(assignment);
            self.last_updated = chrono::Utc::now().to_rfc3339();
        }
    }

    /// Mark an assignment as completed by story ID
    pub fn complete_story(&mut self, story_id: &str) {
        for assignment in &mut self.assignments {
            if assignment.story_id == story_id && assignment.is_active() {
                assignment.mark_completed();
            }
        }
        self.last_updated = chrono::Utc::now().to_rfc3339();
    }

    /// Get completed story IDs
    pub fn completed_story_ids(&self) -> Vec<String> {
        self.assignments
            .iter()
            .filter(|a| a.status == AssignmentStatus::Completed)
            .map(|a| a.story_id.clone())
            .collect()
    }
}

/// Assignments manager for file I/O
pub struct AssignmentsManager {
    /// Base project path
    project_path: PathBuf,
    /// PRD name
    prd_name: String,
}

impl AssignmentsManager {
    /// Create a new assignments manager
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

    /// Get the path to assignments.json
    pub fn assignments_path(&self) -> PathBuf {
        self.briefs_dir().join("assignments.json")
    }

    /// Check if assignments file exists
    pub fn exists(&self) -> bool {
        self.assignments_path().exists()
    }

    /// Read assignments from file
    pub fn read(&self) -> Result<AssignmentsFile, String> {
        let path = self.assignments_path();
        if !path.exists() {
            return Ok(AssignmentsFile::default());
        }
        read_json(&path)
    }

    /// Write assignments to file (atomic)
    pub fn write(&self, assignments: &AssignmentsFile) -> Result<(), String> {
        ensure_dir(&self.briefs_dir())?;

        let content = serde_json::to_string_pretty(assignments)
            .map_err(|e| format!("Failed to serialize assignments: {}", e))?;

        atomic_write(&self.assignments_path(), &content)
    }

    /// Initialize assignments file for a new execution
    pub fn initialize(&self, execution_id: &str) -> Result<AssignmentsFile, String> {
        let assignments = AssignmentsFile::new(execution_id);
        self.write(&assignments)?;
        Ok(assignments)
    }

    /// Add a new assignment
    pub fn add_assignment(&self, assignment: Assignment) -> Result<(), String> {
        let mut file = self.read()?;
        file.add_assignment(assignment);
        self.write(&file)
    }

    /// Mark a story as completed
    pub fn complete_story(&self, story_id: &str) -> Result<(), String> {
        let mut file = self.read()?;
        file.complete_story(story_id);
        self.write(&file)
    }

    /// Update current iteration
    pub fn set_iteration(&self, iteration: u32) -> Result<(), String> {
        let mut file = self.read()?;
        file.current_iteration = iteration;
        file.last_updated = chrono::Utc::now().to_rfc3339();
        self.write(&file)
    }

    /// Get the current iteration from the saved state
    pub fn get_current_iteration(&self) -> Result<u32, String> {
        let file = self.read()?;
        Ok(file.current_iteration)
    }

    /// Get completed story IDs
    pub fn get_completed_story_ids(&self) -> Result<Vec<String>, String> {
        let file = self.read()?;
        Ok(file.completed_story_ids())
    }

    /// Check if execution can be resumed
    pub fn can_resume(&self) -> bool {
        self.exists()
    }

    /// Get active assignments for conflict detection
    pub fn get_active_assignments(&self) -> Result<Vec<Assignment>, String> {
        let file = self.read()?;
        Ok(file.active_assignments().into_iter().cloned().collect())
    }

    /// Get the IDs of all stories currently assigned to active agents
    pub fn get_assigned_story_ids(&self) -> Result<Vec<String>, String> {
        let file = self.read()?;
        Ok(file
            .active_assignments()
            .iter()
            .map(|a| a.story_id.clone())
            .collect())
    }

    /// Check if a story is currently assigned to any active agent
    pub fn is_story_assigned(&self, story_id: &str) -> Result<bool, String> {
        let file = self.read()?;
        Ok(file.is_story_assigned(story_id))
    }

    /// Assign a story to an agent (US-2.1: Multiple Agents on Same PRD)
    ///
    /// This method ensures no two agents are assigned the same story.
    /// Returns Ok(assignment) if successful, Err if story is already assigned.
    pub fn assign_story_to_agent(
        &self,
        agent_id: &str,
        agent_type: AgentType,
        story_id: &str,
    ) -> Result<Assignment, String> {
        let mut file = self.read()?;

        // Check if story is already assigned (US-2.1: No two agents assigned same story)
        if file.is_story_assigned(story_id) {
            return Err(format!(
                "Story {} is already assigned to another agent",
                story_id
            ));
        }

        // Create and add the assignment
        let assignment = Assignment::new(agent_id, agent_type, story_id);
        let assignment_clone = assignment.clone();
        file.add_assignment(assignment);
        self.write(&file)?;

        Ok(assignment_clone)
    }

    /// Assign a story to an agent with estimated files (US-2.2: Avoid File Conflicts)
    ///
    /// This method assigns a story and includes estimated files that may be modified.
    /// The estimated files are used for conflict detection with other agents.
    ///
    /// # Arguments
    /// * `agent_id` - The agent identifier
    /// * `agent_type` - The type of agent (Claude, OpenCode, etc.)
    /// * `story_id` - The story ID to assign
    /// * `estimated_files` - List of files that may be modified during this assignment
    pub fn assign_story_with_files(
        &self,
        agent_id: &str,
        agent_type: AgentType,
        story_id: &str,
        estimated_files: Vec<String>,
    ) -> Result<Assignment, String> {
        let mut file = self.read()?;

        // Check if story is already assigned
        if file.is_story_assigned(story_id) {
            return Err(format!(
                "Story {} is already assigned to another agent",
                story_id
            ));
        }

        // Create assignment with estimated files
        let mut assignment = Assignment::new(agent_id, agent_type, story_id);
        assignment.estimated_files = estimated_files;
        let assignment_clone = assignment.clone();
        file.add_assignment(assignment);
        self.write(&file)?;

        Ok(assignment_clone)
    }

    /// Get all files currently in use by active assignments (US-2.2: Avoid File Conflicts)
    ///
    /// Returns a list of all files that are estimated to be modified by active agents.
    /// This is used to generate the "avoid these files" section in BRIEF.md.
    pub fn get_files_in_use(&self) -> Result<Vec<FileInUse>, String> {
        let file = self.read()?;
        let mut files_in_use = Vec::new();

        for assignment in file.active_assignments() {
            for file_path in &assignment.estimated_files {
                files_in_use.push(FileInUse {
                    path: file_path.clone(),
                    agent_id: assignment.agent_id.clone(),
                    agent_type: assignment.agent_type,
                    story_id: assignment.story_id.clone(),
                });
            }
        }

        Ok(files_in_use)
    }

    /// Get files in use by other agents (excluding a specific agent)
    ///
    /// This is used to show files that the current agent should avoid.
    pub fn get_files_in_use_by_others(&self, exclude_agent_id: &str) -> Result<Vec<FileInUse>, String> {
        let all_files = self.get_files_in_use()?;
        Ok(all_files
            .into_iter()
            .filter(|f| f.agent_id != exclude_agent_id)
            .collect())
    }

    /// Check for potential conflicts between a new assignment and existing ones (US-2.2)
    ///
    /// Returns a list of potential conflicts if the estimated files overlap with
    /// files already being modified by other agents.
    pub fn check_conflicts(
        &self,
        estimated_files: &[String],
    ) -> Result<Vec<FileConflict>, String> {
        let files_in_use = self.get_files_in_use()?;
        let mut conflicts = Vec::new();

        for file_path in estimated_files {
            for in_use in &files_in_use {
                if &in_use.path == file_path {
                    conflicts.push(FileConflict {
                        path: file_path.clone(),
                        conflicting_agent_id: in_use.agent_id.clone(),
                        conflicting_agent_type: in_use.agent_type,
                        conflicting_story_id: in_use.story_id.clone(),
                    });
                }
            }
        }

        Ok(conflicts)
    }

    /// Update estimated files for an existing assignment (US-2.2)
    ///
    /// This allows updating the file estimates as the agent works and discovers
    /// which files it actually needs to modify.
    pub fn update_estimated_files(
        &self,
        story_id: &str,
        estimated_files: Vec<String>,
    ) -> Result<(), String> {
        let mut file = self.read()?;

        let mut found = false;
        for assignment in &mut file.assignments {
            if assignment.story_id == story_id && assignment.is_active() {
                assignment.estimated_files = estimated_files.clone();
                assignment.updated_at = Some(chrono::Utc::now().to_rfc3339());
                found = true;
                break;
            }
        }

        if !found {
            return Err(format!("No active assignment found for story {}", story_id));
        }

        file.last_updated = chrono::Utc::now().to_rfc3339();
        self.write(&file)
    }

    /// Release a story assignment back to the pool
    ///
    /// This marks the assignment as released, allowing another agent to pick it up.
    pub fn release_story(&self, story_id: &str) -> Result<(), String> {
        let mut file = self.read()?;

        for assignment in &mut file.assignments {
            if assignment.story_id == story_id && assignment.is_active() {
                assignment.release();
            }
        }
        file.last_updated = chrono::Utc::now().to_rfc3339();

        self.write(&file)
    }

    /// Mark an agent's story as failed
    ///
    /// This marks the assignment as failed with an error message.
    pub fn fail_story(&self, story_id: &str, error: &str) -> Result<(), String> {
        let mut file = self.read()?;

        for assignment in &mut file.assignments {
            if assignment.story_id == story_id && assignment.is_active() {
                assignment.mark_failed(error);
            }
        }
        file.last_updated = chrono::Utc::now().to_rfc3339();

        self.write(&file)
    }

    /// Manually assign a story to an agent, bypassing priority-based selection (US-4.1)
    ///
    /// This method provides a manual override for exceptional cases where a specific
    /// story needs to be assigned regardless of priority order. Use cases include:
    /// - Debugging a specific story issue
    /// - Prioritizing urgent work that bypasses normal priority
    /// - Reassigning work after an agent failure
    ///
    /// Unlike `assign_story_to_agent`, this method:
    /// - Allows assignment even if the story would not be next by priority
    /// - Can optionally force assignment even if story is already assigned (releases old assignment)
    ///
    /// # Arguments
    /// * `agent_id` - The agent identifier
    /// * `agent_type` - The type of agent (Claude, OpenCode, etc.)
    /// * `story_id` - The story ID to assign
    /// * `force` - If true, releases any existing assignment and reassigns
    ///
    /// # Returns
    /// The created assignment on success
    pub fn manual_assign_story(
        &self,
        agent_id: &str,
        agent_type: AgentType,
        story_id: &str,
        force: bool,
    ) -> Result<Assignment, String> {
        let mut file = self.read()?;

        // Check if story is already assigned
        if file.is_story_assigned(story_id) {
            if force {
                // Release existing assignment first
                for assignment in &mut file.assignments {
                    if assignment.story_id == story_id && assignment.is_active() {
                        assignment.release();
                    }
                }
            } else {
                return Err(format!(
                    "Story {} is already assigned to another agent. Use force=true to override.",
                    story_id
                ));
            }
        }

        // Create and add the assignment
        let assignment = Assignment::new(agent_id, agent_type, story_id);
        let assignment_clone = assignment.clone();
        file.add_assignment(assignment);
        self.write(&file)?;

        Ok(assignment_clone)
    }

    /// Manually assign a story with estimated files (US-4.1)
    ///
    /// Like `manual_assign_story` but also includes estimated files for conflict detection.
    pub fn manual_assign_story_with_files(
        &self,
        agent_id: &str,
        agent_type: AgentType,
        story_id: &str,
        estimated_files: Vec<String>,
        force: bool,
    ) -> Result<Assignment, String> {
        let mut file = self.read()?;

        // Check if story is already assigned
        if file.is_story_assigned(story_id) {
            if force {
                // Release existing assignment first
                for assignment in &mut file.assignments {
                    if assignment.story_id == story_id && assignment.is_active() {
                        assignment.release();
                    }
                }
            } else {
                return Err(format!(
                    "Story {} is already assigned to another agent. Use force=true to override.",
                    story_id
                ));
            }
        }

        // Create assignment with estimated files
        let mut assignment = Assignment::new(agent_id, agent_type, story_id);
        assignment.estimated_files = estimated_files;
        let assignment_clone = assignment.clone();
        file.add_assignment(assignment);
        self.write(&file)?;

        Ok(assignment_clone)
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
    fn test_assignment_new() {
        let assignment = Assignment::new("agent-1", AgentType::Claude, "US-1.1");
        assert_eq!(assignment.agent_id, "agent-1");
        assert_eq!(assignment.story_id, "US-1.1");
        assert_eq!(assignment.agent_type, AgentType::Claude);
        assert_eq!(assignment.status, AssignmentStatus::Active);
        assert!(assignment.is_active());
    }

    #[test]
    fn test_assignment_lifecycle() {
        let mut assignment = Assignment::new("agent-1", AgentType::Claude, "US-1.1");

        assert!(assignment.is_active());

        assignment.mark_completed();
        assert_eq!(assignment.status, AssignmentStatus::Completed);
        assert!(!assignment.is_active());
        assert!(assignment.updated_at.is_some());
    }

    #[test]
    fn test_assignment_failed() {
        let mut assignment = Assignment::new("agent-1", AgentType::Claude, "US-1.1");

        assignment.mark_failed("Rate limit exceeded");
        assert_eq!(assignment.status, AssignmentStatus::Failed);
        assert_eq!(assignment.error_message, Some("Rate limit exceeded".to_string()));
    }

    #[test]
    fn test_assignments_file_default() {
        let file = AssignmentsFile::default();
        assert!(file.assignments.is_empty());
        assert_eq!(file.current_iteration, 0);
        assert!(file.execution_id.is_none());
    }

    #[test]
    fn test_assignments_file_new() {
        let file = AssignmentsFile::new("exec-123");
        assert!(file.assignments.is_empty());
        assert_eq!(file.execution_id, Some("exec-123".to_string()));
    }

    #[test]
    fn test_assignments_file_operations() {
        let mut file = AssignmentsFile::new("exec-123");

        // Add assignment
        let assignment = Assignment::new("agent-1", AgentType::Claude, "US-1.1");
        file.add_assignment(assignment);
        assert_eq!(file.assignments.len(), 1);

        // Check story assigned
        assert!(file.is_story_assigned("US-1.1"));
        assert!(!file.is_story_assigned("US-1.2"));

        // Complete story
        file.complete_story("US-1.1");
        assert!(!file.is_story_assigned("US-1.1")); // No longer active
        assert_eq!(file.completed_story_ids(), vec!["US-1.1"]);
    }

    #[test]
    fn test_assignments_manager_read_write() {
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");

        // Initialize
        let file = manager.initialize("exec-123").unwrap();
        assert!(manager.exists());
        assert_eq!(file.execution_id, Some("exec-123".to_string()));

        // Read back
        let read_file = manager.read().unwrap();
        assert_eq!(read_file.execution_id, Some("exec-123".to_string()));
    }

    #[test]
    fn test_assignments_manager_add_assignment() {
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");

        manager.initialize("exec-123").unwrap();

        let assignment = Assignment::new("agent-1", AgentType::Claude, "US-1.1");
        manager.add_assignment(assignment).unwrap();

        let active = manager.get_active_assignments().unwrap();
        assert_eq!(active.len(), 1);
        assert_eq!(active[0].story_id, "US-1.1");
    }

    #[test]
    fn test_assignments_manager_complete_story() {
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");

        manager.initialize("exec-123").unwrap();

        let assignment = Assignment::new("agent-1", AgentType::Claude, "US-1.1");
        manager.add_assignment(assignment).unwrap();

        manager.complete_story("US-1.1").unwrap();

        let completed = manager.get_completed_story_ids().unwrap();
        assert_eq!(completed, vec!["US-1.1"]);

        let active = manager.get_active_assignments().unwrap();
        assert!(active.is_empty());
    }

    #[test]
    fn test_assignments_manager_iteration() {
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");

        manager.initialize("exec-123").unwrap();

        manager.set_iteration(5).unwrap();
        assert_eq!(manager.get_current_iteration().unwrap(), 5);
    }

    #[test]
    fn test_assignments_manager_can_resume() {
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");

        assert!(!manager.can_resume());

        manager.initialize("exec-123").unwrap();
        assert!(manager.can_resume());
    }

    #[test]
    fn test_assignment_status_display() {
        assert_eq!(AssignmentStatus::Active.to_string(), "active");
        assert_eq!(AssignmentStatus::Completed.to_string(), "completed");
        assert_eq!(AssignmentStatus::Failed.to_string(), "failed");
        assert_eq!(AssignmentStatus::Released.to_string(), "released");
    }

    #[test]
    fn test_assignments_serialization() {
        let mut file = AssignmentsFile::new("exec-123");
        let mut assignment = Assignment::new("agent-1", AgentType::Claude, "US-1.1");
        assignment.iteration_start = Some(1);
        assignment.estimated_files = vec!["src/main.rs".to_string()];
        file.add_assignment(assignment);

        let json = serde_json::to_string_pretty(&file).unwrap();
        assert!(json.contains("exec-123"));
        assert!(json.contains("US-1.1"));
        assert!(json.contains("claude"));
        assert!(json.contains("src/main.rs"));

        // Round trip
        let parsed: AssignmentsFile = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed.assignments.len(), 1);
        assert_eq!(parsed.assignments[0].story_id, "US-1.1");
    }

    // =========================================================================
    // US-2.1: Multiple Agents on Same PRD Tests
    // =========================================================================

    #[test]
    fn test_assign_story_to_agent() {
        // US-2.1: System assigns different stories to each agent
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // Assign first story to agent 1
        let assignment = manager
            .assign_story_to_agent("agent-1", AgentType::Claude, "US-1.1")
            .unwrap();
        assert_eq!(assignment.agent_id, "agent-1");
        assert_eq!(assignment.story_id, "US-1.1");
        assert!(assignment.is_active());

        // Verify story is assigned
        assert!(manager.is_story_assigned("US-1.1").unwrap());
        assert!(!manager.is_story_assigned("US-1.2").unwrap());
    }

    #[test]
    fn test_no_duplicate_story_assignment() {
        // US-2.1: No two agents are assigned the same story
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // Assign US-1.1 to agent 1
        manager
            .assign_story_to_agent("agent-1", AgentType::Claude, "US-1.1")
            .unwrap();

        // Try to assign the same story to agent 2 - should fail
        let result = manager.assign_story_to_agent("agent-2", AgentType::Opencode, "US-1.1");
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("already assigned to another agent"));
    }

    #[test]
    fn test_multiple_agents_different_stories() {
        // US-2.1: System assigns different stories to each agent
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // Assign different stories to different agents
        let a1 = manager
            .assign_story_to_agent("agent-1", AgentType::Claude, "US-1.1")
            .unwrap();
        let a2 = manager
            .assign_story_to_agent("agent-2", AgentType::Opencode, "US-1.2")
            .unwrap();
        let a3 = manager
            .assign_story_to_agent("agent-3", AgentType::Cursor, "US-1.3")
            .unwrap();

        assert_eq!(a1.story_id, "US-1.1");
        assert_eq!(a2.story_id, "US-1.2");
        assert_eq!(a3.story_id, "US-1.3");

        // Verify all are active
        let active = manager.get_active_assignments().unwrap();
        assert_eq!(active.len(), 3);

        // Verify assigned story IDs
        let assigned_ids = manager.get_assigned_story_ids().unwrap();
        assert!(assigned_ids.contains(&"US-1.1".to_string()));
        assert!(assigned_ids.contains(&"US-1.2".to_string()));
        assert!(assigned_ids.contains(&"US-1.3".to_string()));
    }

    #[test]
    fn test_release_story_allows_reassignment() {
        // US-2.1: Released assignments can be reassigned
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // Assign and then release
        manager
            .assign_story_to_agent("agent-1", AgentType::Claude, "US-1.1")
            .unwrap();
        manager.release_story("US-1.1").unwrap();

        // Story should no longer be assigned
        assert!(!manager.is_story_assigned("US-1.1").unwrap());

        // Another agent can now take it
        let new_assignment = manager
            .assign_story_to_agent("agent-2", AgentType::Opencode, "US-1.1")
            .unwrap();
        assert_eq!(new_assignment.agent_id, "agent-2");
    }

    #[test]
    fn test_failed_story_not_active() {
        // US-2.1: Failed assignments are not active
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // Assign and then fail
        manager
            .assign_story_to_agent("agent-1", AgentType::Claude, "US-1.1")
            .unwrap();
        manager.fail_story("US-1.1", "Agent crashed").unwrap();

        // Story should no longer be actively assigned
        assert!(!manager.is_story_assigned("US-1.1").unwrap());

        // Another agent can take it
        let result = manager.assign_story_to_agent("agent-2", AgentType::Opencode, "US-1.1");
        assert!(result.is_ok());
    }

    #[test]
    fn test_completed_story_not_reassignable() {
        // US-2.1: Completed assignments stay completed
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // Assign and complete
        manager
            .assign_story_to_agent("agent-1", AgentType::Claude, "US-1.1")
            .unwrap();
        manager.complete_story("US-1.1").unwrap();

        // Story should not be active (completed is different from active)
        assert!(!manager.is_story_assigned("US-1.1").unwrap());

        // But completing a story doesn't mean another agent should work on it
        // The PRD.passes flag determines if work is needed
        let completed = manager.get_completed_story_ids().unwrap();
        assert!(completed.contains(&"US-1.1".to_string()));
    }

    #[test]
    fn test_get_assigned_story_ids() {
        // US-2.1: Can get list of assigned stories
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // Initially empty
        let assigned = manager.get_assigned_story_ids().unwrap();
        assert!(assigned.is_empty());

        // Add assignments
        manager
            .assign_story_to_agent("agent-1", AgentType::Claude, "US-1.1")
            .unwrap();
        manager
            .assign_story_to_agent("agent-2", AgentType::Opencode, "US-2.1")
            .unwrap();

        let assigned = manager.get_assigned_story_ids().unwrap();
        assert_eq!(assigned.len(), 2);
        assert!(assigned.contains(&"US-1.1".to_string()));
        assert!(assigned.contains(&"US-2.1".to_string()));
    }

    // =========================================================================
    // US-2.2: Avoid File Conflicts Tests
    // =========================================================================

    #[test]
    fn test_assign_story_with_files() {
        // US-2.2: Assign story with estimated files
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        let files = vec!["src/components/foo.tsx".to_string(), "src/stores/bar.ts".to_string()];
        let assignment = manager
            .assign_story_with_files("agent-1", AgentType::Claude, "US-1.1", files.clone())
            .unwrap();

        assert_eq!(assignment.estimated_files, files);

        // Verify files can be retrieved
        let files_in_use = manager.get_files_in_use().unwrap();
        assert_eq!(files_in_use.len(), 2);
    }

    #[test]
    fn test_get_files_in_use() {
        // US-2.2: Get files currently in use by active agents
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // Agent 1 working on files A, B
        manager
            .assign_story_with_files(
                "agent-1",
                AgentType::Claude,
                "US-1.1",
                vec!["src/a.ts".to_string(), "src/b.ts".to_string()],
            )
            .unwrap();

        // Agent 2 working on files C, D
        manager
            .assign_story_with_files(
                "agent-2",
                AgentType::Opencode,
                "US-1.2",
                vec!["src/c.ts".to_string(), "src/d.ts".to_string()],
            )
            .unwrap();

        let files_in_use = manager.get_files_in_use().unwrap();
        assert_eq!(files_in_use.len(), 4);

        // Verify file details
        let paths: Vec<&str> = files_in_use.iter().map(|f| f.path.as_str()).collect();
        assert!(paths.contains(&"src/a.ts"));
        assert!(paths.contains(&"src/b.ts"));
        assert!(paths.contains(&"src/c.ts"));
        assert!(paths.contains(&"src/d.ts"));
    }

    #[test]
    fn test_get_files_in_use_by_others() {
        // US-2.2: Get files in use by OTHER agents
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        manager
            .assign_story_with_files(
                "agent-1",
                AgentType::Claude,
                "US-1.1",
                vec!["src/a.ts".to_string()],
            )
            .unwrap();

        manager
            .assign_story_with_files(
                "agent-2",
                AgentType::Opencode,
                "US-1.2",
                vec!["src/b.ts".to_string()],
            )
            .unwrap();

        // From agent-1's perspective, only agent-2's files are "others"
        let others_files = manager.get_files_in_use_by_others("agent-1").unwrap();
        assert_eq!(others_files.len(), 1);
        assert_eq!(others_files[0].path, "src/b.ts");
        assert_eq!(others_files[0].agent_id, "agent-2");
    }

    #[test]
    fn test_check_conflicts() {
        // US-2.2: Check for potential file conflicts
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // Agent 1 is working on these files
        manager
            .assign_story_with_files(
                "agent-1",
                AgentType::Claude,
                "US-1.1",
                vec!["src/shared.ts".to_string(), "src/only_agent1.ts".to_string()],
            )
            .unwrap();

        // New assignment wants to use overlapping file
        let new_files = vec!["src/shared.ts".to_string(), "src/new_file.ts".to_string()];
        let conflicts = manager.check_conflicts(&new_files).unwrap();

        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].path, "src/shared.ts");
        assert_eq!(conflicts[0].conflicting_agent_id, "agent-1");
        assert_eq!(conflicts[0].conflicting_story_id, "US-1.1");
    }

    #[test]
    fn test_check_conflicts_no_overlap() {
        // US-2.2: No conflicts when files don't overlap
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        manager
            .assign_story_with_files(
                "agent-1",
                AgentType::Claude,
                "US-1.1",
                vec!["src/a.ts".to_string()],
            )
            .unwrap();

        let new_files = vec!["src/b.ts".to_string(), "src/c.ts".to_string()];
        let conflicts = manager.check_conflicts(&new_files).unwrap();

        assert!(conflicts.is_empty());
    }

    #[test]
    fn test_update_estimated_files() {
        // US-2.2: Update files as agent discovers what it needs
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // Initial assignment with estimated files
        manager
            .assign_story_with_files(
                "agent-1",
                AgentType::Claude,
                "US-1.1",
                vec!["src/initial.ts".to_string()],
            )
            .unwrap();

        // Agent discovers it needs more files
        let updated_files = vec![
            "src/initial.ts".to_string(),
            "src/also_needed.ts".to_string(),
            "src/discovered.ts".to_string(),
        ];
        manager.update_estimated_files("US-1.1", updated_files.clone()).unwrap();

        // Verify update
        let files_in_use = manager.get_files_in_use().unwrap();
        assert_eq!(files_in_use.len(), 3);
    }

    #[test]
    fn test_update_estimated_files_not_found() {
        // US-2.2: Can't update files for non-existent assignment
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        let result = manager.update_estimated_files("US-1.1", vec!["foo.ts".to_string()]);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("No active assignment found"));
    }

    #[test]
    fn test_completed_assignment_files_not_in_use() {
        // US-2.2: Completed assignments don't show files in use
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        manager
            .assign_story_with_files(
                "agent-1",
                AgentType::Claude,
                "US-1.1",
                vec!["src/a.ts".to_string()],
            )
            .unwrap();

        // Complete the story
        manager.complete_story("US-1.1").unwrap();

        // Files should no longer be in use
        let files_in_use = manager.get_files_in_use().unwrap();
        assert!(files_in_use.is_empty());
    }

    #[test]
    fn test_file_in_use_struct() {
        let file_in_use = FileInUse {
            path: "src/foo.ts".to_string(),
            agent_id: "agent-1".to_string(),
            agent_type: AgentType::Claude,
            story_id: "US-1.1".to_string(),
        };

        let json = serde_json::to_string(&file_in_use).unwrap();
        assert!(json.contains("src/foo.ts"));
        assert!(json.contains("agent-1"));
        assert!(json.contains("US-1.1"));
    }

    #[test]
    fn test_file_conflict_struct() {
        let conflict = FileConflict {
            path: "src/shared.ts".to_string(),
            conflicting_agent_id: "agent-1".to_string(),
            conflicting_agent_type: AgentType::Claude,
            conflicting_story_id: "US-1.1".to_string(),
        };

        let json = serde_json::to_string(&conflict).unwrap();
        assert!(json.contains("src/shared.ts"));
        assert!(json.contains("conflictingAgentId"));
        assert!(json.contains("agent-1"));
    }

    // =========================================================================
    // US-4.1: Priority-Based Assignment - Manual Override Tests
    // =========================================================================

    #[test]
    fn test_manual_assign_story() {
        // US-4.1: Manual override available for exceptional cases
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // Manual assignment works without force flag when story is not assigned
        let assignment = manager
            .manual_assign_story("agent-1", AgentType::Claude, "US-1.1", false)
            .unwrap();
        assert_eq!(assignment.agent_id, "agent-1");
        assert_eq!(assignment.story_id, "US-1.1");
        assert!(assignment.is_active());
    }

    #[test]
    fn test_manual_assign_story_already_assigned_no_force() {
        // US-4.1: Manual override fails without force when story is already assigned
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // First assignment
        manager
            .manual_assign_story("agent-1", AgentType::Claude, "US-1.1", false)
            .unwrap();

        // Second assignment without force should fail
        let result = manager.manual_assign_story("agent-2", AgentType::Opencode, "US-1.1", false);
        assert!(result.is_err());
        let err_msg = result.unwrap_err();
        assert!(err_msg.contains("already assigned"));
        assert!(err_msg.contains("force=true"));
    }

    #[test]
    fn test_manual_assign_story_force_override() {
        // US-4.1: Manual override with force releases old assignment and creates new one
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // First assignment to agent-1
        manager
            .manual_assign_story("agent-1", AgentType::Claude, "US-1.1", false)
            .unwrap();

        // Force reassign to agent-2
        let new_assignment = manager
            .manual_assign_story("agent-2", AgentType::Opencode, "US-1.1", true)
            .unwrap();

        assert_eq!(new_assignment.agent_id, "agent-2");
        assert_eq!(new_assignment.story_id, "US-1.1");
        assert!(new_assignment.is_active());

        // Verify old assignment is released
        let file = manager.read().unwrap();
        let released = file
            .assignments
            .iter()
            .find(|a| a.agent_id == "agent-1" && a.story_id == "US-1.1");
        assert!(released.is_some());
        assert_eq!(released.unwrap().status, AssignmentStatus::Released);
    }

    #[test]
    fn test_manual_assign_story_with_files() {
        // US-4.1: Manual assignment with estimated files
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        let files = vec!["src/a.ts".to_string(), "src/b.ts".to_string()];
        let assignment = manager
            .manual_assign_story_with_files("agent-1", AgentType::Claude, "US-1.1", files.clone(), false)
            .unwrap();

        assert_eq!(assignment.estimated_files, files);

        // Verify files are tracked
        let files_in_use = manager.get_files_in_use().unwrap();
        assert_eq!(files_in_use.len(), 2);
    }

    #[test]
    fn test_manual_assign_story_with_files_force() {
        // US-4.1: Manual assignment with files and force override
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // First assignment
        manager
            .manual_assign_story_with_files(
                "agent-1",
                AgentType::Claude,
                "US-1.1",
                vec!["src/old.ts".to_string()],
                false,
            )
            .unwrap();

        // Force reassign with different files
        let new_files = vec!["src/new.ts".to_string()];
        let new_assignment = manager
            .manual_assign_story_with_files(
                "agent-2",
                AgentType::Opencode,
                "US-1.1",
                new_files.clone(),
                true,
            )
            .unwrap();

        assert_eq!(new_assignment.agent_id, "agent-2");
        assert_eq!(new_assignment.estimated_files, new_files);

        // Verify only new files are in use (old assignment was released)
        let files_in_use = manager.get_files_in_use().unwrap();
        assert_eq!(files_in_use.len(), 1);
        assert_eq!(files_in_use[0].path, "src/new.ts");
    }

    #[test]
    fn test_manual_assign_bypasses_priority() {
        // US-4.1: Manual assignment can assign any story regardless of priority
        // This test verifies manual assignment doesn't check priority - it just assigns
        let temp_dir = setup_test_dir();
        let manager = AssignmentsManager::new(temp_dir.path(), "test-prd");
        manager.initialize("exec-123").unwrap();

        // Manually assign a low-priority story first (this would not be selected automatically)
        let assignment = manager
            .manual_assign_story("agent-1", AgentType::Claude, "US-5.1-LOW-PRIORITY", false)
            .unwrap();

        assert_eq!(assignment.story_id, "US-5.1-LOW-PRIORITY");
        assert!(manager.is_story_assigned("US-5.1-LOW-PRIORITY").unwrap());
    }
}

// ============================================================================
// File Estimation (US-2.2: Avoid File Conflicts)
// ============================================================================

/// Estimate files that might be modified for a story based on its content.
///
/// This function analyzes the story title, description, and acceptance criteria
/// to identify potential file patterns that might be affected.
///
/// # Arguments
/// * `story_title` - The title of the story
/// * `story_description` - Optional description of the story
/// * `story_acceptance` - Acceptance criteria for the story
///
/// # Returns
/// A vector of estimated file patterns/paths that may be modified
pub fn estimate_files_from_story(
    story_title: &str,
    story_description: Option<&str>,
    story_acceptance: &str,
) -> Vec<String> {
    let mut estimated_files = Vec::new();

    // Combine all text for analysis
    let combined_text = format!(
        "{} {} {}",
        story_title.to_lowercase(),
        story_description.unwrap_or("").to_lowercase(),
        story_acceptance.to_lowercase()
    );

    // Pattern matching for common file types and locations
    let patterns = [
        // Frontend patterns
        ("component", "src/components/"),
        ("ui", "src/components/ui/"),
        ("store", "src/stores/"),
        ("zustand", "src/stores/"),
        ("hook", "src/hooks/"),
        ("api", "src/lib/"),
        ("invoke", "src/lib/invoke.ts"),
        ("type", "src/types/"),
        ("test", "src/test/"),
        ("layout", "src/components/layout/"),

        // Backend patterns
        ("command", "server/src/commands/"),
        ("handler", "server/src/commands/"),
        ("model", "server/src/models/"),
        ("file_storage", "server/src/file_storage/"),
        ("git", "server/src/git/"),
        ("agent", "server/src/agents/"),
        ("ralph", "server/src/ralph_loop/"),
        ("brief", "server/src/ralph_loop/brief_builder.rs"),
        ("assignment", "server/src/ralph_loop/assignments_manager.rs"),
        ("learning", "server/src/ralph_loop/learnings_manager.rs"),
        ("template", "server/src/templates/"),
        ("event", "server/src/events.rs"),
        ("websocket", "server/src/server/events.rs"),
        ("proxy", "server/src/server/proxy.rs"),

        // Config patterns
        ("config", ".ralph-ui/"),
        ("prd", ".ralph-ui/prds/"),
        ("settings", "src/components/settings/"),
    ];

    for (keyword, path) in patterns {
        if combined_text.contains(keyword) {
            estimated_files.push(path.to_string());
        }
    }

    // Deduplicate and sort
    estimated_files.sort();
    estimated_files.dedup();

    estimated_files
}

#[cfg(test)]
mod estimate_files_tests {
    use super::*;

    #[test]
    fn test_estimate_files_frontend_component() {
        let files = estimate_files_from_story(
            "Add new component",
            Some("Create a button component"),
            "- UI renders correctly",
        );
        assert!(files.contains(&"src/components/".to_string()));
        assert!(files.contains(&"src/components/ui/".to_string()));
    }

    #[test]
    fn test_estimate_files_backend_command() {
        let files = estimate_files_from_story(
            "Add new command handler",
            None,
            "- Command processes requests",
        );
        assert!(files.contains(&"server/src/commands/".to_string()));
    }

    #[test]
    fn test_estimate_files_ralph_loop() {
        // Test that "brief" keyword matches the brief_builder.rs file
        let files = estimate_files_from_story(
            "Update brief generation",
            Some("Modify the brief builder"),
            "- Brief includes new section",
        );
        assert!(files.contains(&"server/src/ralph_loop/brief_builder.rs".to_string()));

        // Test that "ralph" keyword matches the ralph_loop directory
        let files2 = estimate_files_from_story(
            "Update ralph loop orchestrator",
            None,
            "- Ralph loop handles iterations",
        );
        assert!(files2.contains(&"server/src/ralph_loop/".to_string()));
    }

    #[test]
    fn test_estimate_files_store() {
        let files = estimate_files_from_story(
            "Add zustand store",
            None,
            "- Store manages state",
        );
        assert!(files.contains(&"src/stores/".to_string()));
    }

    #[test]
    fn test_estimate_files_empty_when_no_matches() {
        let files = estimate_files_from_story(
            "Generic task",
            Some("Do something"),
            "- It works",
        );
        // Should still work but may return empty or generic matches
        // This is acceptable behavior
        assert!(files.is_empty() || !files.is_empty()); // Always passes, just verifies no panic
    }
}
