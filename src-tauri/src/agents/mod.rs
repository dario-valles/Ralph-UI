// Agent process spawning and monitoring

pub mod manager;
pub mod rate_limiter;
pub mod fallback;
pub mod trace_parser;

// Re-export for convenience
pub use manager::{AgentManager, AgentSpawnConfig, AgentLogEvent};
pub use rate_limiter::{RateLimitDetector, RateLimitInfo, RateLimitType};
pub use fallback::{AgentFallbackManager, FallbackConfig, RateLimitedAgent, FallbackEvent};
pub use trace_parser::{SubagentTraceParser, SubagentEvent, SubagentEventType, SubagentTree};
