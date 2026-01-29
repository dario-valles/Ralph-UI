//! PRD Workflow Module - Centralized PRD Creation System
//!
//! This module provides a streamlined workflow for generating high-quality PRDs
//! with dependency orchestration, configurable research, and action-based commands.
//!
//! ## Workflow Phases (5 phases, simplified from GSD's 8)
//!
//! 1. **Discovery** - Chat-based context gathering (what/why/who/done)
//! 2. **Research** - Parallel AI agent research (optional, configurable)
//! 3. **Requirements** - Define requirements with dependency tracking
//! 4. **Planning** - Roadmap generation and verification
//! 5. **Export** - Convert to RalphPrd format
//!
//! ## Key Features
//!
//! - **Dependency Graph**: Topological sort with cycle detection (Kahn's algorithm)
//! - **Configurable Research**: Not hardcoded 4 types, custom agents supported
//! - **Unified State**: Single source of truth, frontend derives computed state
//! - **Mode Support**: "new" for greenfield, "existing" for codebase analysis
//!
//! ## Storage
//!
//! Workflow data is stored in `.ralph-ui/workflows/{workflow-id}/`:
//! - `state.json` - Unified workflow state
//! - `SPEC.md` - Current/desired state specification
//! - `research/` - Research agent outputs
//! - `SUMMARY.md` - Synthesized research summary
//! - `requirements.json` - Requirements with dependencies
//! - `ROADMAP.md` - Execution plan based on dependency order
//! - `AGENTS.md` - Generated agent guidance file (optional)

pub mod dependency;
pub mod research;
pub mod state;
pub mod storage;

#[cfg(test)]
mod tests;

// Re-export main types
pub use dependency::{DependencyGraph, DependencyValidationError};
pub use research::{ResearchAgentConfig, ResearchConfig};
pub use state::{
    ExecutionMode, PhaseStatus, PrdWorkflowState, ProjectContext, Requirement, RequirementCategory,
    RequirementStatus, ScopeLevel, SpecState, StateDescription, WorkflowMode, WorkflowPhase,
};
pub use storage::{
    delete_workflow, get_workflow_dir, init_workflow, list_workflows, load_workflow_state,
    read_research_file, save_workflow_state, write_research_file, WorkflowFile, WorkflowInfo,
};
