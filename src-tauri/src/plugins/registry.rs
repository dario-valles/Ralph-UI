use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum PluginType {
    Agent,
    Tracker,
    Core,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plugin {
    pub id: String,
    pub name: String,
    pub description: String,
    pub version: String,
    pub plugin_type: PluginType,
    pub enabled: bool,
    pub author: Option<String>,
    pub repository: Option<String>,
}

pub struct PluginRegistry {
    plugins: HashMap<String, Plugin>,
}

impl PluginRegistry {
    pub fn new() -> Self {
        Self {
            plugins: HashMap::new(),
        }
    }

    pub fn register(&mut self, plugin: Plugin) -> Result<(), String> {
        if self.plugins.contains_key(&plugin.id) {
            return Err(format!("Plugin with ID {} already registered", plugin.id));
        }
        self.plugins.insert(plugin.id.clone(), plugin);
        Ok(())
    }

    pub fn get(&self, id: &str) -> Option<&Plugin> {
        self.plugins.get(id)
    }

    pub fn list(&self) -> Vec<Plugin> {
        self.plugins.values().cloned().collect()
    }

    pub fn unregister(&mut self, id: &str) -> Option<Plugin> {
        self.plugins.remove(id)
    }

    pub fn set_enabled(&mut self, id: &str, enabled: bool) -> Result<(), String> {
        if let Some(plugin) = self.plugins.get_mut(id) {
            plugin.enabled = enabled;
            Ok(())
        } else {
            Err(format!("Plugin with ID {} not found", id))
        }
    }
}

impl Default for PluginRegistry {
    fn default() -> Self {
        Self::new()
    }
}
