//! GSD (Get Stuff Done) Style PRD Generation Module
//!
//! This module implements a structured workflow for generating high-quality PRDs
//! through deep questioning, parallel research, requirements scoping, and roadmap creation.
//!
//! ## Workflow Phases
//!
//! 1. **Deep Questioning** - Open-ended exploration to understand what the user wants to build
//! 2. **Project Document** - Create PROJECT.md capturing vision, goals, constraints
//! 3. **Research** - Parallel agents explore technical approaches
//! 4. **Requirements** - Enumerate all features with REQ-IDs
//! 5. **Scoping** - User selects v1/v2/out-of-scope features
//! 6. **Roadmap** - Derive phases from scoped requirements
//! 7. **Verification** - Check coverage and detect gaps
//! 8. **Export** - Convert planning docs to RalphPrd format
//!
//! ## Storage
//!
//! Planning documents are stored in `.ralph-ui/planning/{session-id}/`:
//! - `PROJECT.md` - Project vision and constraints
//! - `research/` - Research agent outputs
//! - `SUMMARY.md` - Synthesized research summary
//! - `REQUIREMENTS.md` - Full requirements list
//! - `SCOPED.md` - User-selected scope
//! - `ROADMAP.md` - Phased execution plan
//! - `VERIFICATION.md` - Gap analysis results

pub mod config;
pub mod conversion;
pub mod planning_storage;
pub mod requirements;
pub mod research;
pub mod roadmap;
pub mod state;
pub mod verification;

#[cfg(test)]
mod tests;

// Re-export main types
pub use config::GsdConfig;
pub use conversion::{convert_to_ralph_prd, ConversionOptions, ConversionResult};
pub use planning_storage::{
    get_planning_dir, init_planning_session, read_planning_file, write_planning_file, PlanningFile,
};
pub use requirements::{Requirement, RequirementsDoc, ScopeSelection};
pub use research::{run_research_agents, synthesize_research, ResearchResult, ResearchSynthesis};
pub use roadmap::{derive_roadmap, RoadmapDoc, RoadmapPhase};
pub use state::{GsdDecision, GsdPhase, GsdWorkflowState};
pub use verification::{verify_plans, VerificationResult};
