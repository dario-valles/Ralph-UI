use crate::agents::models::ModelInfo;
use crate::agents::plugin::AgentPlugin;
use crate::models::AgentType;
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};

/// Registry for managing agent plugins
pub struct AgentRegistry {
    plugins: RwLock<HashMap<AgentType, Arc<dyn AgentPlugin>>>,
}

impl AgentRegistry {
    /// Create a new empty registry
    pub fn new() -> Self {
        Self {
            plugins: RwLock::new(HashMap::new()),
        }
    }

    /// Register a plugin
    pub fn register(&self, plugin: Box<dyn AgentPlugin>) {
        let mut plugins = self.plugins.write().unwrap();
        let plugin_arc: Arc<dyn AgentPlugin> = Arc::from(plugin);
        plugins.insert(plugin_arc.agent_type(), plugin_arc);
    }

    /// Get a plugin by type
    pub fn get(&self, agent_type: AgentType) -> Option<Arc<dyn AgentPlugin>> {
        let plugins = self.plugins.read().unwrap();
        plugins.get(&agent_type).cloned()
    }

    /// List all available agent types (only those that are available on the system)
    pub fn list_available(&self) -> Vec<AgentType> {
        let plugins = self.plugins.read().unwrap();
        plugins
            .values()
            .filter(|p| p.is_available())
            .map(|p| p.agent_type())
            .collect()
    }

    /// Get models for a specific agent type
    pub fn get_models(&self, agent_type: AgentType) -> Result<Vec<ModelInfo>> {
        let plugin = self
            .get(agent_type)
            .ok_or_else(|| anyhow!("Agent type {:?} not found", agent_type))?;

        if !plugin.is_available() {
            return Err(anyhow!(
                "Agent {:?} is not available on this system",
                agent_type
            ));
        }

        plugin.discover_models()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::manager::AgentSpawnConfig;
    use std::process::Command;

    struct MockPlugin {
        agent_type: AgentType,
        available: bool,
    }

    impl AgentPlugin for MockPlugin {
        fn agent_type(&self) -> AgentType {
            self.agent_type
        }

        fn is_available(&self) -> bool {
            self.available
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
    fn test_registry_registration() {
        let registry = AgentRegistry::new();

        let plugin = MockPlugin {
            agent_type: AgentType::Claude,
            available: true,
        };

        registry.register(Box::new(plugin));

        assert!(registry.get(AgentType::Claude).is_some());
        assert!(registry.get(AgentType::Opencode).is_none());
    }

    #[test]
    fn test_list_available() {
        let registry = AgentRegistry::new();

        registry.register(Box::new(MockPlugin {
            agent_type: AgentType::Claude,
            available: true,
        }));

        registry.register(Box::new(MockPlugin {
            agent_type: AgentType::Opencode,
            available: false,
        }));

        let available = registry.list_available();
        assert_eq!(available.len(), 1);
        assert_eq!(available[0], AgentType::Claude);
    }
}
