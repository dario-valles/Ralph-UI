//! PRD Workflow state management
//!
//! Defines the unified workflow state, phases, and context structures.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use super::dependency::DependencyGraph;
use super::research::ResearchConfig;

/// Workflow phases (5 simplified phases)
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowPhase {
    /// Chat-based context gathering (what/why/who/done)
    Discovery,
    /// Parallel AI agent research (optional)
    Research,
    /// Define requirements with dependency tracking and scoping
    Requirements,
    /// Roadmap generation, dependency ordering, and verification
    Planning,
    /// Convert to RalphPrd format
    Export,
}

impl WorkflowPhase {
    /// Get all phases in order
    pub fn all() -> &'static [WorkflowPhase] {
        &[
            WorkflowPhase::Discovery,
            WorkflowPhase::Research,
            WorkflowPhase::Requirements,
            WorkflowPhase::Planning,
            WorkflowPhase::Export,
        ]
    }

    /// Get the next phase, if any
    pub fn next(&self) -> Option<WorkflowPhase> {
        match self {
            WorkflowPhase::Discovery => Some(WorkflowPhase::Research),
            WorkflowPhase::Research => Some(WorkflowPhase::Requirements),
            WorkflowPhase::Requirements => Some(WorkflowPhase::Planning),
            WorkflowPhase::Planning => Some(WorkflowPhase::Export),
            WorkflowPhase::Export => None,
        }
    }

    /// Get the previous phase, if any
    pub fn previous(&self) -> Option<WorkflowPhase> {
        match self {
            WorkflowPhase::Discovery => None,
            WorkflowPhase::Research => Some(WorkflowPhase::Discovery),
            WorkflowPhase::Requirements => Some(WorkflowPhase::Research),
            WorkflowPhase::Planning => Some(WorkflowPhase::Requirements),
            WorkflowPhase::Export => Some(WorkflowPhase::Planning),
        }
    }

    /// Get the display name for this phase
    pub fn display_name(&self) -> &'static str {
        match self {
            WorkflowPhase::Discovery => "Discovery",
            WorkflowPhase::Research => "Research",
            WorkflowPhase::Requirements => "Requirements",
            WorkflowPhase::Planning => "Planning",
            WorkflowPhase::Export => "Export",
        }
    }

    /// Get a short description of this phase
    pub fn description(&self) -> &'static str {
        match self {
            WorkflowPhase::Discovery => "Chat-based context gathering (what/why/who/done)",
            WorkflowPhase::Research => "Parallel AI agent research on requirements",
            WorkflowPhase::Requirements => "Define requirements with dependencies and scoping",
            WorkflowPhase::Planning => "Generate roadmap and verify coverage",
            WorkflowPhase::Export => "Convert to RalphPrd format",
        }
    }

    /// Get the phase index (0-based)
    pub fn index(&self) -> usize {
        match self {
            WorkflowPhase::Discovery => 0,
            WorkflowPhase::Research => 1,
            WorkflowPhase::Requirements => 2,
            WorkflowPhase::Planning => 3,
            WorkflowPhase::Export => 4,
        }
    }
}

impl Default for WorkflowPhase {
    fn default() -> Self {
        WorkflowPhase::Discovery
    }
}

/// Status of a phase
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PhaseStatus {
    /// Phase has not been started
    NotStarted,
    /// Phase is in progress
    InProgress,
    /// Phase is complete
    Complete,
    /// Phase was skipped (e.g., research when mode is "new" without codebase)
    Skipped,
}

impl Default for PhaseStatus {
    fn default() -> Self {
        PhaseStatus::NotStarted
    }
}

/// Workflow mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkflowMode {
    /// Greenfield project - no existing codebase
    New,
    /// Existing project - has codebase to analyze
    Existing,
}

impl Default for WorkflowMode {
    fn default() -> Self {
        WorkflowMode::New
    }
}

/// Execution mode for requirements
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExecutionMode {
    /// Execute requirements sequentially based on dependency order
    Sequential,
    /// Execute requirements in parallel where dependencies allow
    Parallel,
}

impl Default for ExecutionMode {
    fn default() -> Self {
        ExecutionMode::Sequential
    }
}

/// Project context gathered during discovery
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectContext {
    /// What is being built (the core idea)
    pub what: Option<String>,
    /// Why it's being built (motivation, problem being solved)
    pub why: Option<String>,
    /// Who will use it (target users)
    pub who: Option<String>,
    /// Definition of done (success criteria)
    pub done: Option<String>,
    /// Additional context notes
    pub notes: Vec<String>,
    /// Technical constraints identified
    pub constraints: Vec<String>,
    /// Explicit non-goals
    pub non_goals: Vec<String>,
}

impl ProjectContext {
    /// Check if all required context has been gathered
    pub fn is_complete(&self) -> bool {
        self.what.is_some() && self.why.is_some() && self.who.is_some() && self.done.is_some()
    }

    /// Get a list of missing context items
    pub fn missing_items(&self) -> Vec<&'static str> {
        let mut missing = Vec::new();
        if self.what.is_none() {
            missing.push("what");
        }
        if self.why.is_none() {
            missing.push("why");
        }
        if self.who.is_none() {
            missing.push("who");
        }
        if self.done.is_none() {
            missing.push("done");
        }
        missing
    }

    /// Calculate completion percentage (0-100)
    pub fn completion_percentage(&self) -> u8 {
        let total = 4;
        let complete = [
            self.what.is_some(),
            self.why.is_some(),
            self.who.is_some(),
            self.done.is_some(),
        ]
        .iter()
        .filter(|&&x| x)
        .count();
        ((complete as f32 / total as f32) * 100.0) as u8
    }
}

/// State description for current/desired state workflow (Copilot Workspace pattern)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StateDescription {
    /// Brief summary of the state
    pub summary: String,
    /// User flows in this state
    pub user_flows: Vec<String>,
    /// Components involved
    pub components: Vec<String>,
    /// Data models/structures
    pub data_models: Vec<String>,
    /// Constraints and limitations
    pub constraints: Vec<String>,
}

/// Current → Desired state specification (Copilot Workspace pattern)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SpecState {
    /// Current state description (what exists today)
    pub current: StateDescription,
    /// Desired state description (what should exist)
    pub desired: StateDescription,
    /// Implementation notes derived from the gap
    pub implementation_notes: Vec<String>,
}

/// Scope level for requirements
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScopeLevel {
    /// Must have for v1
    V1,
    /// Nice to have for v2
    V2,
    /// Explicitly out of scope
    OutOfScope,
    /// Not yet categorized
    Unscoped,
}

impl ScopeLevel {
    /// Get the display name for this scope level
    pub fn display_name(&self) -> &'static str {
        match self {
            ScopeLevel::V1 => "V1 (Must Have)",
            ScopeLevel::V2 => "V2 (Nice to Have)",
            ScopeLevel::OutOfScope => "Out of Scope",
            ScopeLevel::Unscoped => "Not Yet Scoped",
        }
    }
}

impl Default for ScopeLevel {
    fn default() -> Self {
        ScopeLevel::Unscoped
    }
}

/// Requirement category for organizing features
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequirementCategory {
    /// Core functionality
    Core,
    /// User interface
    Ui,
    /// Data and storage
    Data,
    /// Integration with external services
    Integration,
    /// Security features
    Security,
    /// Performance requirements
    Performance,
    /// Testing requirements
    Testing,
    /// Documentation
    Documentation,
    /// Other/misc
    Other,
}

impl RequirementCategory {
    /// Get the prefix for REQ-IDs in this category
    pub fn prefix(&self) -> &'static str {
        match self {
            RequirementCategory::Core => "CORE",
            RequirementCategory::Ui => "UI",
            RequirementCategory::Data => "DATA",
            RequirementCategory::Integration => "INT",
            RequirementCategory::Security => "SEC",
            RequirementCategory::Performance => "PERF",
            RequirementCategory::Testing => "TEST",
            RequirementCategory::Documentation => "DOC",
            RequirementCategory::Other => "OTHER",
        }
    }

    /// Get the display name for this category
    pub fn display_name(&self) -> &'static str {
        match self {
            RequirementCategory::Core => "Core Functionality",
            RequirementCategory::Ui => "User Interface",
            RequirementCategory::Data => "Data & Storage",
            RequirementCategory::Integration => "Integrations",
            RequirementCategory::Security => "Security",
            RequirementCategory::Performance => "Performance",
            RequirementCategory::Testing => "Testing",
            RequirementCategory::Documentation => "Documentation",
            RequirementCategory::Other => "Other",
        }
    }

    /// Parse from string prefix
    pub fn from_prefix(prefix: &str) -> Option<Self> {
        match prefix.to_uppercase().as_str() {
            "CORE" => Some(RequirementCategory::Core),
            "UI" => Some(RequirementCategory::Ui),
            "DATA" => Some(RequirementCategory::Data),
            "INT" => Some(RequirementCategory::Integration),
            "SEC" => Some(RequirementCategory::Security),
            "PERF" => Some(RequirementCategory::Performance),
            "TEST" => Some(RequirementCategory::Testing),
            "DOC" => Some(RequirementCategory::Documentation),
            "OTHER" => Some(RequirementCategory::Other),
            _ => None,
        }
    }
}

impl Default for RequirementCategory {
    fn default() -> Self {
        RequirementCategory::Core
    }
}

/// A single requirement in the workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Requirement {
    /// Unique requirement ID (e.g., CORE-01, UI-03)
    pub id: String,
    /// Category of the requirement
    pub category: RequirementCategory,
    /// Short title
    pub title: String,
    /// Detailed description
    pub description: String,
    /// User story format (optional)
    pub user_story: Option<String>,
    /// Acceptance criteria (BDD format supported)
    pub acceptance_criteria: Vec<String>,
    /// Scope level (v1, v2, out-of-scope)
    pub scope: ScopeLevel,
    /// IDs of requirements this depends on (must be completed first)
    pub depends_on: Vec<String>,
    /// Estimated effort (S/M/L/XL)
    pub effort: Option<String>,
    /// Priority within scope (1 = highest)
    pub priority: Option<u32>,
    /// Tags for filtering
    pub tags: Vec<String>,
    /// Requirement status
    pub status: RequirementStatus,
}

/// Status of a requirement
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RequirementStatus {
    /// Not started
    Pending,
    /// Blocked by dependencies
    Blocked,
    /// Ready to start (all dependencies complete)
    Ready,
    /// In progress
    InProgress,
    /// Complete
    Done,
}

impl Default for RequirementStatus {
    fn default() -> Self {
        RequirementStatus::Pending
    }
}

impl Requirement {
    /// Create a new unscoped requirement
    pub fn new(
        id: String,
        category: RequirementCategory,
        title: String,
        description: String,
    ) -> Self {
        Self {
            id,
            category,
            title,
            description,
            user_story: None,
            acceptance_criteria: Vec::new(),
            scope: ScopeLevel::Unscoped,
            depends_on: Vec::new(),
            effort: None,
            priority: None,
            tags: Vec::new(),
            status: RequirementStatus::Pending,
        }
    }

    /// Set the scope for this requirement
    pub fn with_scope(mut self, scope: ScopeLevel) -> Self {
        self.scope = scope;
        self
    }

    /// Add acceptance criteria
    pub fn with_acceptance(mut self, criteria: Vec<String>) -> Self {
        self.acceptance_criteria = criteria;
        self
    }

    /// Add dependencies
    pub fn with_depends_on(mut self, deps: Vec<String>) -> Self {
        self.depends_on = deps;
        self
    }
}

/// Research agent status
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchAgentStatus {
    /// Agent identifier
    pub agent_id: String,
    /// Display name
    pub name: String,
    /// Whether this research is running
    pub running: bool,
    /// Whether this research is complete
    pub complete: bool,
    /// Error message if failed
    pub error: Option<String>,
    /// Output file path (if complete)
    pub output_path: Option<String>,
}

/// Research status for all configured agents
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchStatus {
    /// Status of each research agent
    pub agents: Vec<ResearchAgentStatus>,
    /// Whether synthesis is complete
    pub synthesis_complete: bool,
    /// Overall completion percentage (0-100)
    pub completion_percentage: u8,
}

impl ResearchStatus {
    /// Check if all research is complete
    pub fn is_complete(&self) -> bool {
        self.agents.iter().all(|a| a.complete || a.error.is_some()) && self.synthesis_complete
    }

    /// Calculate completion percentage
    pub fn calculate_completion(&mut self) {
        if self.agents.is_empty() {
            self.completion_percentage = 0;
            return;
        }

        let total = self.agents.len();
        let complete = self.agents.iter().filter(|a| a.complete).count();
        self.completion_percentage = ((complete as f32 / total as f32) * 100.0) as u8;
    }
}

/// Complete unified state of a PRD workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrdWorkflowState {
    /// Unique workflow ID
    pub id: String,
    /// Project path
    pub project_path: String,
    /// Associated chat session ID (for linking to PRD Chat)
    pub chat_session_id: Option<String>,
    /// Workflow mode (new or existing)
    pub mode: WorkflowMode,
    /// Current phase
    pub phase: WorkflowPhase,
    /// Status of each phase
    pub phase_statuses: HashMap<String, PhaseStatus>,
    /// Project context gathered during discovery
    pub context: ProjectContext,
    /// Current/desired state specification
    pub spec: Option<SpecState>,
    /// Research configuration
    pub research_config: ResearchConfig,
    /// Research status
    pub research_status: ResearchStatus,
    /// Requirements indexed by ID
    pub requirements: HashMap<String, Requirement>,
    /// Dependency graph
    #[serde(default)]
    pub dependency_graph: DependencyGraph,
    /// Counters for ID generation per category
    #[serde(default)]
    pub category_counters: HashMap<String, u32>,
    /// Execution mode
    pub execution_mode: ExecutionMode,
    /// When the workflow started
    pub created_at: DateTime<Utc>,
    /// When the workflow was last updated
    pub updated_at: DateTime<Utc>,
    /// Whether the workflow is complete
    pub is_complete: bool,
    /// Error message if the workflow failed
    pub error: Option<String>,
}

impl PrdWorkflowState {
    /// Create a new workflow state
    pub fn new(id: String, project_path: String, mode: WorkflowMode) -> Self {
        let now = Utc::now();

        // Initialize phase statuses
        let mut phase_statuses = HashMap::new();
        for phase in WorkflowPhase::all() {
            let key = format!("{:?}", phase).to_lowercase();
            phase_statuses.insert(key, PhaseStatus::NotStarted);
        }
        // Discovery starts in progress
        phase_statuses.insert("discovery".to_string(), PhaseStatus::InProgress);

        Self {
            id,
            project_path,
            chat_session_id: None,
            mode,
            phase: WorkflowPhase::default(),
            phase_statuses,
            context: ProjectContext::default(),
            spec: None,
            research_config: ResearchConfig::default(),
            research_status: ResearchStatus::default(),
            requirements: HashMap::new(),
            dependency_graph: DependencyGraph::default(),
            category_counters: HashMap::new(),
            execution_mode: ExecutionMode::default(),
            created_at: now,
            updated_at: now,
            is_complete: false,
            error: None,
        }
    }

    /// Generate the next requirement ID for a category
    pub fn next_requirement_id(&mut self, category: &RequirementCategory) -> String {
        let prefix = category.prefix();
        let counter = self
            .category_counters
            .entry(prefix.to_string())
            .or_insert(0);
        *counter += 1;
        format!("{}-{:02}", prefix, counter)
    }

    /// Add a requirement with auto-generated ID
    pub fn add_requirement(
        &mut self,
        category: RequirementCategory,
        title: String,
        description: String,
    ) -> String {
        let id = self.next_requirement_id(&category);
        let req = Requirement::new(id.clone(), category, title, description);
        self.requirements.insert(id.clone(), req);
        self.updated_at = Utc::now();
        id
    }

    /// Upsert a requirement (update if exists, insert if not)
    pub fn upsert_requirement(&mut self, requirement: Requirement) -> Result<(), String> {
        // Update counter if this ID is higher
        if let Some((prefix, num_str)) = requirement.id.split_once('-') {
            if let Ok(num) = num_str.parse::<u32>() {
                let counter = self
                    .category_counters
                    .entry(prefix.to_string())
                    .or_insert(0);
                if num > *counter {
                    *counter = num;
                }
            }
        }

        // Update dependency graph
        for dep_id in &requirement.depends_on {
            self.dependency_graph
                .add_dependency(&requirement.id, dep_id)?;
        }

        self.requirements
            .insert(requirement.id.clone(), requirement);
        self.updated_at = Utc::now();
        Ok(())
    }

    /// Get a requirement by ID
    pub fn get_requirement(&self, id: &str) -> Option<&Requirement> {
        self.requirements.get(id)
    }

    /// Get a mutable reference to a requirement
    pub fn get_requirement_mut(&mut self, id: &str) -> Option<&mut Requirement> {
        self.requirements.get_mut(id)
    }

    /// Update requirement statuses based on dependency graph
    pub fn update_requirement_statuses(&mut self) {
        let completed: std::collections::HashSet<String> = self
            .requirements
            .values()
            .filter(|r| r.status == RequirementStatus::Done)
            .map(|r| r.id.clone())
            .collect();

        let ready = self.dependency_graph.get_ready(&completed);

        for req in self.requirements.values_mut() {
            if req.status == RequirementStatus::Done || req.status == RequirementStatus::InProgress
            {
                continue;
            }

            if ready.contains(&req.id) {
                req.status = RequirementStatus::Ready;
            } else if !req.depends_on.is_empty() {
                let all_deps_done = req.depends_on.iter().all(|d| completed.contains(d));
                if all_deps_done {
                    req.status = RequirementStatus::Ready;
                } else {
                    req.status = RequirementStatus::Blocked;
                }
            } else {
                req.status = RequirementStatus::Ready;
            }
        }
    }

    /// Advance to the next phase
    pub fn advance_phase(&mut self) -> Option<WorkflowPhase> {
        // Mark current phase as complete
        let current_key = format!("{:?}", self.phase).to_lowercase();
        self.phase_statuses
            .insert(current_key, PhaseStatus::Complete);

        if let Some(next) = self.phase.next() {
            self.phase = next;
            let next_key = format!("{:?}", next).to_lowercase();
            self.phase_statuses
                .insert(next_key, PhaseStatus::InProgress);
            self.updated_at = Utc::now();
            Some(next)
        } else {
            self.is_complete = true;
            self.updated_at = Utc::now();
            None
        }
    }

    /// Go back to the previous phase
    pub fn go_back(&mut self) -> Option<WorkflowPhase> {
        if let Some(prev) = self.phase.previous() {
            // Mark current phase as not started (reverting)
            let current_key = format!("{:?}", self.phase).to_lowercase();
            self.phase_statuses
                .insert(current_key, PhaseStatus::NotStarted);

            self.phase = prev;
            let prev_key = format!("{:?}", prev).to_lowercase();
            self.phase_statuses
                .insert(prev_key, PhaseStatus::InProgress);
            self.updated_at = Utc::now();
            Some(prev)
        } else {
            None
        }
    }

    /// Skip the current phase
    pub fn skip_phase(&mut self) -> Option<WorkflowPhase> {
        let current_key = format!("{:?}", self.phase).to_lowercase();
        self.phase_statuses
            .insert(current_key, PhaseStatus::Skipped);

        if let Some(next) = self.phase.next() {
            self.phase = next;
            let next_key = format!("{:?}", next).to_lowercase();
            self.phase_statuses
                .insert(next_key, PhaseStatus::InProgress);
            self.updated_at = Utc::now();
            Some(next)
        } else {
            self.is_complete = true;
            self.updated_at = Utc::now();
            None
        }
    }

    /// Set an error
    pub fn set_error(&mut self, error: String) {
        self.error = Some(error);
        self.updated_at = Utc::now();
    }

    /// Clear the error
    pub fn clear_error(&mut self) {
        self.error = None;
        self.updated_at = Utc::now();
    }

    /// Get the completion percentage (0-100) based on phases
    pub fn completion_percentage(&self) -> u8 {
        let total_phases = WorkflowPhase::all().len();
        let complete = self
            .phase_statuses
            .values()
            .filter(|s| **s == PhaseStatus::Complete || **s == PhaseStatus::Skipped)
            .count();
        ((complete as f32 / total_phases as f32) * 100.0) as u8
    }

    /// Get requirements by scope
    pub fn get_requirements_by_scope(&self, scope: ScopeLevel) -> Vec<&Requirement> {
        self.requirements
            .values()
            .filter(|r| r.scope == scope)
            .collect()
    }

    /// Get requirements in execution order (topological sort)
    pub fn get_execution_order(&self) -> Result<Vec<String>, String> {
        self.dependency_graph.execution_order()
    }

    /// Get requirements that are ready to execute
    pub fn get_ready_requirements(&self) -> Vec<&Requirement> {
        self.requirements
            .values()
            .filter(|r| r.status == RequirementStatus::Ready)
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_phase_transitions() {
        assert_eq!(
            WorkflowPhase::Discovery.next(),
            Some(WorkflowPhase::Research)
        );
        assert_eq!(WorkflowPhase::Export.next(), None);
        assert_eq!(WorkflowPhase::Discovery.previous(), None);
        assert_eq!(
            WorkflowPhase::Research.previous(),
            Some(WorkflowPhase::Discovery)
        );
    }

    #[test]
    fn test_phase_all() {
        let phases = WorkflowPhase::all();
        assert_eq!(phases.len(), 5);
        assert_eq!(phases[0], WorkflowPhase::Discovery);
        assert_eq!(phases[4], WorkflowPhase::Export);
    }

    #[test]
    fn test_project_context_completion() {
        let mut ctx = ProjectContext::default();
        assert!(!ctx.is_complete());
        assert_eq!(ctx.missing_items().len(), 4);

        ctx.what = Some("A chat app".to_string());
        ctx.why = Some("To communicate".to_string());
        ctx.who = Some("Remote teams".to_string());
        assert!(!ctx.is_complete());
        assert_eq!(ctx.missing_items(), vec!["done"]);

        ctx.done = Some("Users can send messages".to_string());
        assert!(ctx.is_complete());
        assert!(ctx.missing_items().is_empty());
    }

    #[test]
    fn test_workflow_state_advance() {
        let mut state = PrdWorkflowState::new(
            "test-workflow".to_string(),
            "/path/to/project".to_string(),
            WorkflowMode::New,
        );
        assert_eq!(state.phase, WorkflowPhase::Discovery);

        let next = state.advance_phase();
        assert_eq!(next, Some(WorkflowPhase::Research));
        assert_eq!(state.phase, WorkflowPhase::Research);

        // Advance to the end
        for _ in 0..3 {
            state.advance_phase();
        }
        assert_eq!(state.phase, WorkflowPhase::Export);
        assert!(!state.is_complete);

        // One more advance completes the workflow
        let final_next = state.advance_phase();
        assert_eq!(final_next, None);
        assert!(state.is_complete);
    }

    #[test]
    fn test_requirement_id_generation() {
        let mut state =
            PrdWorkflowState::new("test".to_string(), "/path".to_string(), WorkflowMode::New);

        let id1 = state.add_requirement(
            RequirementCategory::Core,
            "Auth".to_string(),
            "User auth".to_string(),
        );
        assert_eq!(id1, "CORE-01");

        let id2 = state.add_requirement(
            RequirementCategory::Core,
            "Profile".to_string(),
            "User profile".to_string(),
        );
        assert_eq!(id2, "CORE-02");

        let id3 = state.add_requirement(
            RequirementCategory::Ui,
            "Dashboard".to_string(),
            "Main dashboard".to_string(),
        );
        assert_eq!(id3, "UI-01");
    }

    #[test]
    fn test_scope_level_default() {
        let scope: ScopeLevel = Default::default();
        assert_eq!(scope, ScopeLevel::Unscoped);
    }
}
