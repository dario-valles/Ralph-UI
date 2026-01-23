//! GSD workflow state management
//!
//! Defines the phases, decisions, and overall state for the GSD workflow.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Phases in the GSD workflow
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum GsdPhase {
    /// Deep questioning to understand what user wants to build
    DeepQuestioning,
    /// Creating PROJECT.md with vision, goals, constraints
    ProjectDocument,
    /// Parallel research agents exploring technical approaches
    Research,
    /// Enumerating all features with REQ-IDs
    Requirements,
    /// User selecting v1/v2/out-of-scope features
    Scoping,
    /// Deriving phases from scoped requirements
    Roadmap,
    /// Checking coverage and detecting gaps
    Verification,
    /// Converting planning docs to RalphPrd format
    Export,
}

impl GsdPhase {
    /// Get all phases in order
    pub fn all() -> &'static [GsdPhase] {
        &[
            GsdPhase::DeepQuestioning,
            GsdPhase::ProjectDocument,
            GsdPhase::Research,
            GsdPhase::Requirements,
            GsdPhase::Scoping,
            GsdPhase::Roadmap,
            GsdPhase::Verification,
            GsdPhase::Export,
        ]
    }

    /// Get the next phase, if any
    pub fn next(&self) -> Option<GsdPhase> {
        match self {
            GsdPhase::DeepQuestioning => Some(GsdPhase::ProjectDocument),
            GsdPhase::ProjectDocument => Some(GsdPhase::Research),
            GsdPhase::Research => Some(GsdPhase::Requirements),
            GsdPhase::Requirements => Some(GsdPhase::Scoping),
            GsdPhase::Scoping => Some(GsdPhase::Roadmap),
            GsdPhase::Roadmap => Some(GsdPhase::Verification),
            GsdPhase::Verification => Some(GsdPhase::Export),
            GsdPhase::Export => None,
        }
    }

    /// Get the previous phase, if any
    pub fn previous(&self) -> Option<GsdPhase> {
        match self {
            GsdPhase::DeepQuestioning => None,
            GsdPhase::ProjectDocument => Some(GsdPhase::DeepQuestioning),
            GsdPhase::Research => Some(GsdPhase::ProjectDocument),
            GsdPhase::Requirements => Some(GsdPhase::Research),
            GsdPhase::Scoping => Some(GsdPhase::Requirements),
            GsdPhase::Roadmap => Some(GsdPhase::Scoping),
            GsdPhase::Verification => Some(GsdPhase::Roadmap),
            GsdPhase::Export => Some(GsdPhase::Verification),
        }
    }

    /// Get the display name for this phase
    pub fn display_name(&self) -> &'static str {
        match self {
            GsdPhase::DeepQuestioning => "Deep Questioning",
            GsdPhase::ProjectDocument => "Project Document",
            GsdPhase::Research => "Research",
            GsdPhase::Requirements => "Requirements",
            GsdPhase::Scoping => "Scoping",
            GsdPhase::Roadmap => "Roadmap",
            GsdPhase::Verification => "Verification",
            GsdPhase::Export => "Export",
        }
    }

    /// Get a short description of this phase
    pub fn description(&self) -> &'static str {
        match self {
            GsdPhase::DeepQuestioning => {
                "Open-ended exploration to understand what you want to build"
            }
            GsdPhase::ProjectDocument => "Create PROJECT.md capturing vision, goals, and constraints",
            GsdPhase::Research => "Parallel agents explore technical approaches",
            GsdPhase::Requirements => "Enumerate all features with REQ-IDs",
            GsdPhase::Scoping => "Select v1/v2/out-of-scope features",
            GsdPhase::Roadmap => "Derive phases from scoped requirements",
            GsdPhase::Verification => "Check coverage and detect gaps",
            GsdPhase::Export => "Convert planning docs to Ralph PRD format",
        }
    }

    /// Get the phase index (0-based)
    pub fn index(&self) -> usize {
        match self {
            GsdPhase::DeepQuestioning => 0,
            GsdPhase::ProjectDocument => 1,
            GsdPhase::Research => 2,
            GsdPhase::Requirements => 3,
            GsdPhase::Scoping => 4,
            GsdPhase::Roadmap => 5,
            GsdPhase::Verification => 6,
            GsdPhase::Export => 7,
        }
    }
}

impl Default for GsdPhase {
    fn default() -> Self {
        GsdPhase::DeepQuestioning
    }
}

/// Context gathered during deep questioning
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestioningContext {
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
}

impl QuestioningContext {
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
}

/// Status of research agents
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResearchStatus {
    /// Architecture research status
    pub architecture: AgentResearchStatus,
    /// Codebase analysis status
    pub codebase: AgentResearchStatus,
    /// Best practices research status
    pub best_practices: AgentResearchStatus,
    /// Risks and challenges research status
    pub risks: AgentResearchStatus,
}

impl Default for ResearchStatus {
    fn default() -> Self {
        Self {
            architecture: AgentResearchStatus::default(),
            codebase: AgentResearchStatus::default(),
            best_practices: AgentResearchStatus::default(),
            risks: AgentResearchStatus::default(),
        }
    }
}

impl ResearchStatus {
    /// Check if all research is complete
    pub fn is_complete(&self) -> bool {
        self.architecture.is_complete()
            && self.codebase.is_complete()
            && self.best_practices.is_complete()
            && self.risks.is_complete()
    }

    /// Get the overall completion percentage (0-100)
    pub fn completion_percentage(&self) -> u8 {
        let total = 4;
        let complete = [
            self.architecture.is_complete(),
            self.codebase.is_complete(),
            self.best_practices.is_complete(),
            self.risks.is_complete(),
        ]
        .iter()
        .filter(|&&x| x)
        .count();
        ((complete as f32 / total as f32) * 100.0) as u8
    }
}

/// Status of a single research agent
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResearchStatus {
    /// Whether this research is running
    pub running: bool,
    /// Whether this research is complete
    pub complete: bool,
    /// Error message if failed
    pub error: Option<String>,
    /// Output file path (if complete)
    pub output_path: Option<String>,
}

impl AgentResearchStatus {
    pub fn is_complete(&self) -> bool {
        self.complete && self.error.is_none()
    }
}

/// User decisions made during the workflow
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum GsdDecision {
    /// Ready to proceed to next phase
    Proceed,
    /// Go back to previous phase
    GoBack,
    /// User made a scope selection
    ScopeSelection {
        /// Requirements selected for v1
        v1: Vec<String>,
        /// Requirements selected for v2
        v2: Vec<String>,
        /// Requirements marked out of scope
        out_of_scope: Vec<String>,
    },
    /// User approved verification results
    VerificationApproved,
    /// User wants to edit requirements
    EditRequirements { requirement_ids: Vec<String> },
    /// User exported to PRD
    Exported { prd_name: String },
}

/// Complete state of a GSD workflow session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GsdWorkflowState {
    /// Session ID (links to chat session)
    pub session_id: String,
    /// Current phase
    pub current_phase: GsdPhase,
    /// Context gathered during questioning
    pub questioning_context: QuestioningContext,
    /// Status of research agents
    pub research_status: ResearchStatus,
    /// History of decisions made
    pub decisions: Vec<GsdDecision>,
    /// When the workflow started
    pub started_at: DateTime<Utc>,
    /// When the workflow was last updated
    pub updated_at: DateTime<Utc>,
    /// Whether the workflow is complete
    pub is_complete: bool,
    /// Error message if the workflow failed
    pub error: Option<String>,
}

impl GsdWorkflowState {
    /// Create a new workflow state for a session
    pub fn new(session_id: String) -> Self {
        let now = Utc::now();
        Self {
            session_id,
            current_phase: GsdPhase::default(),
            questioning_context: QuestioningContext::default(),
            research_status: ResearchStatus::default(),
            decisions: Vec::new(),
            started_at: now,
            updated_at: now,
            is_complete: false,
            error: None,
        }
    }

    /// Advance to the next phase
    pub fn advance_phase(&mut self) -> Option<GsdPhase> {
        if let Some(next) = self.current_phase.next() {
            self.current_phase = next;
            self.updated_at = Utc::now();
            Some(next)
        } else {
            self.is_complete = true;
            self.updated_at = Utc::now();
            None
        }
    }

    /// Go back to the previous phase
    pub fn go_back(&mut self) -> Option<GsdPhase> {
        if let Some(prev) = self.current_phase.previous() {
            self.current_phase = prev;
            self.updated_at = Utc::now();
            Some(prev)
        } else {
            None
        }
    }

    /// Record a decision
    pub fn record_decision(&mut self, decision: GsdDecision) {
        self.decisions.push(decision);
        self.updated_at = Utc::now();
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

    /// Get the completion percentage (0-100) based on current phase
    pub fn completion_percentage(&self) -> u8 {
        let total_phases = GsdPhase::all().len();
        let current_index = self.current_phase.index();
        ((current_index as f32 / total_phases as f32) * 100.0) as u8
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_phase_transitions() {
        assert_eq!(
            GsdPhase::DeepQuestioning.next(),
            Some(GsdPhase::ProjectDocument)
        );
        assert_eq!(GsdPhase::Export.next(), None);
        assert_eq!(GsdPhase::DeepQuestioning.previous(), None);
        assert_eq!(
            GsdPhase::ProjectDocument.previous(),
            Some(GsdPhase::DeepQuestioning)
        );
    }

    #[test]
    fn test_phase_all() {
        let phases = GsdPhase::all();
        assert_eq!(phases.len(), 8);
        assert_eq!(phases[0], GsdPhase::DeepQuestioning);
        assert_eq!(phases[7], GsdPhase::Export);
    }

    #[test]
    fn test_questioning_context_completion() {
        let mut ctx = QuestioningContext::default();
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
        let mut state = GsdWorkflowState::new("test-session".to_string());
        assert_eq!(state.current_phase, GsdPhase::DeepQuestioning);

        let next = state.advance_phase();
        assert_eq!(next, Some(GsdPhase::ProjectDocument));
        assert_eq!(state.current_phase, GsdPhase::ProjectDocument);

        // Advance to the end
        for _ in 0..6 {
            state.advance_phase();
        }
        assert_eq!(state.current_phase, GsdPhase::Export);
        assert!(!state.is_complete);

        // One more advance completes the workflow
        let final_next = state.advance_phase();
        assert_eq!(final_next, None);
        assert!(state.is_complete);
    }

    #[test]
    fn test_research_status_completion() {
        let mut status = ResearchStatus::default();
        assert!(!status.is_complete());
        assert_eq!(status.completion_percentage(), 0);

        status.architecture.complete = true;
        assert_eq!(status.completion_percentage(), 25);

        status.codebase.complete = true;
        status.best_practices.complete = true;
        status.risks.complete = true;
        assert!(status.is_complete());
        assert_eq!(status.completion_percentage(), 100);
    }
}
