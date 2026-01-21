// Agent process spawning and monitoring

pub mod ansi_stripper;
pub mod fallback;
pub mod manager;
pub mod model_cache;
pub mod models;
pub mod path_resolver;
pub mod plugin;
pub mod providers;
pub mod rate_limiter;
pub mod trace_parser;

// Re-export for convenience
pub use manager::{
    AgentCompletionEvent, AgentManager, AgentPtyDataEvent, AgentSpawnConfig, AgentSpawnMode,
    RateLimitEvent,
};
pub use plugin::AgentPlugin;
// Note: CliPathResolver is used internally by providers, not re-exported
// Note: RateLimitDetector, RateLimitInfo, RateLimitType accessible via full path (agents::rate_limiter::*)
// Fallback infrastructure for future use (Phase 4)
#[allow(unused_imports)]
pub use fallback::{AgentFallbackManager, FallbackConfig};
pub use model_cache::ModelCache;
pub use models::ModelInfo;
pub use trace_parser::{StreamingParser, SubagentEvent, SubagentEventType, SubagentTree};
