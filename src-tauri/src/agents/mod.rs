// Agent process spawning and monitoring

pub mod manager;

// Re-export for convenience
pub use manager::{AgentManager, AgentSpawnConfig, AgentLogEvent};
