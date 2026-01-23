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
}
