//! Research module for GSD workflow
//!
//! Manages parallel research agents that explore different aspects of a project:
//! - Architecture: Design patterns and system architecture
//! - Codebase: Existing code analysis and conventions
//! - Best Practices: Industry standards and recommendations
//! - Risks: Potential challenges and mitigations

pub mod orchestrator;
pub mod prompts;
pub mod synthesizer;

// Re-export main types
pub use orchestrator::{get_available_agents, run_research_agents, ResearchOrchestrator, ResearchResult};
pub use prompts::ResearchPrompts;
pub use synthesizer::{synthesize_research, ResearchSynthesis};
