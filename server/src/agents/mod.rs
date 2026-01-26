// Agent process spawning and monitoring

pub mod ansi_stripper;
pub mod config;
pub mod format_parsers;
pub mod log_collector;
pub mod manager;
pub mod model_cache;
pub mod models;
pub mod output_parser;
pub mod path_resolver;
// Agent Plugin Trait Definition
pub mod plugin;
pub mod providers;
pub mod rate_limiter;
pub mod registry;
pub mod trace_parser;

// Re-export for convenience
pub use config::{ConfigField, ConfigFieldType, PluginConfigSchema};
pub use manager::{
    AgentCompletionEvent, AgentManager, AgentPtyDataEvent, AgentPtyExitEvent, AgentSpawnConfig,
    AgentSpawnMode, RateLimitEvent, ToolCallCompleteEvent, ToolCallStartEvent,
};
pub use plugin::AgentPlugin;
pub use registry::AgentRegistry;
// Note: CliPathResolver is used internally by providers, not re-exported
// Note: RateLimitDetector, RateLimitInfo, RateLimitType accessible via full path (agents::rate_limiter::*)
// Note: Fallback orchestration is handled by ralph_loop::FallbackOrchestrator
pub use model_cache::ModelCache;
pub use models::ModelInfo;
pub use trace_parser::{StreamingParser, SubagentEvent, SubagentEventType, SubagentTree};

// Re-export output parser types
pub use output_parser::{ParsedAgentOutput, ParsedToolCall, ParsedToolResult};

// Re-export format parsers
pub use format_parsers::{parse_agent_json_output, parse_agent_json_output_with_tools};
