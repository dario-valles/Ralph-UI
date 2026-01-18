// Agent process spawning and monitoring

pub mod manager;
pub mod rate_limiter;
pub mod fallback;
pub mod trace_parser;

// Re-export for convenience
pub use manager::{AgentManager, AgentSpawnConfig, RateLimitEvent};
// Note: RateLimitDetector, RateLimitInfo, RateLimitType accessible via full path (agents::rate_limiter::*)
pub use fallback::{AgentFallbackManager, FallbackConfig};
pub use trace_parser::{SubagentTraceParser, SubagentEvent, SubagentEventType, SubagentTree};
