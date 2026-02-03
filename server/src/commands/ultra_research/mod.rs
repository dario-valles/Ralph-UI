// Ultra Research Backend commands - Multi-agent deep research for PRD creation
//
// This module is organized into submodules:
// - orchestrator: Main orchestration logic for research sessions
// - agent_spawner: Parallel agent execution and management
// - discussion: Agent-to-agent discussion logic
// - synthesizer: Final PRD synthesis from findings
// - prompts: System prompts for each research role
//
// Storage: Research sessions are stored in {project}/.ralph-ui/research/{id}.json

mod agent_spawner;
mod discussion;
mod orchestrator;
mod prompts;
mod synthesizer;

// Re-export orchestrator commands (main API)
pub use orchestrator::{
    cancel_ultra_research, get_research_progress, get_research_session, list_research_sessions,
    start_ultra_research,
};

// Re-export types for server routing
pub use crate::models::{
    CancelResearchRequest, GetResearchProgressRequest, ResearchProgress, ResearchSession,
    StartUltraResearchRequest, StartUltraResearchResponse,
};
