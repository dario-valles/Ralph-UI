// Agent Plugin Trait Definition

use crate::agents::config::PluginConfigSchema;
use crate::agents::manager::AgentSpawnConfig;
use crate::agents::models::ModelInfo;
use crate::models::AgentType;
use anyhow::Result;
use std::process::Command;

/// Trait defining the interface for agent plugins
///
/// Plugins are responsible for:
/// 1. Discovery and capability reporting
/// 2. Command construction for process spawning
/// 3. Output parsing (text/JSON -> human readable)
pub trait AgentPlugin: Send + Sync {
    /// Unique identifier for the agent
    fn agent_type(&self) -> AgentType;

    /// Check if the agent's CLI tool is installed/available
    fn is_available(&self) -> bool;

    /// Discover available models for this agent
    fn discover_models(&self) -> Result<Vec<ModelInfo>>;

    /// Get the configuration schema for this agent plugin
    /// This allows the frontend to generate a settings form
    fn config_schema(&self) -> PluginConfigSchema {
        PluginConfigSchema::default()
    }

    /// Build the command to spawn the agent process
    fn build_command(&self, config: &AgentSpawnConfig) -> Result<Command>;

    /// Parse raw output line into display text (handling JSON/formatting)
    /// Returns the text to display. If empty, the line might be skipped.
    fn parse_output(&self, line: &str) -> String;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::AgentType;

    struct TestPlugin;

    impl AgentPlugin for TestPlugin {
        fn agent_type(&self) -> AgentType {
            AgentType::Claude
        }

        fn is_available(&self) -> bool {
            true
        }

        fn discover_models(&self) -> Result<Vec<ModelInfo>> {
            Ok(vec![])
        }

        fn build_command(&self, _config: &AgentSpawnConfig) -> Result<Command> {
            Ok(Command::new("echo"))
        }

        fn parse_output(&self, line: &str) -> String {
            line.to_string()
        }
    }

    #[test]
    fn test_trait_implementation() {
        let plugin = TestPlugin;
        assert_eq!(plugin.agent_type(), AgentType::Claude);
        assert!(plugin.is_available());
        assert!(plugin.discover_models().is_ok());
        assert_eq!(plugin.parse_output("test"), "test");
    }
}
