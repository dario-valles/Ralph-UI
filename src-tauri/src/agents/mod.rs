// Agent process spawning and monitoring

pub mod manager;
pub mod path_resolver;
pub mod rate_limiter;
pub mod fallback;
pub mod trace_parser;
pub mod models;
pub mod model_cache;
pub mod providers;
pub mod ansi_stripper;

// Re-export for convenience
pub use manager::{AgentManager, AgentSpawnConfig, AgentSpawnMode, RateLimitEvent, AgentCompletionEvent};
// Note: CliPathResolver is used internally by providers, not re-exported
// Note: RateLimitDetector, RateLimitInfo, RateLimitType accessible via full path (agents::rate_limiter::*)
pub use fallback::{AgentFallbackManager, FallbackConfig};
pub use trace_parser::{SubagentTraceParser, SubagentEvent, SubagentEventType, SubagentTree};
pub use models::ModelInfo;
pub use model_cache::ModelCache;
pub use ansi_stripper::{strip_ansi, LineBuffer, RingBuffer};
