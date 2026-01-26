//! Configuration file handling for Ralph Loop
//!
//! Reads and writes .ralph-ui/config.yaml for project-specific settings.

use crate::ralph_loop::types::{LoopConfig, RalphConfig};
use std::path::Path;

/// Configuration file manager
pub struct ConfigManager {
    config_path: std::path::PathBuf,
}

impl ConfigManager {
    /// Create a new config manager for a project
    pub fn new(project_path: &Path) -> Self {
        Self {
            config_path: project_path.join(".ralph-ui").join("config.yaml"),
        }
    }

    /// Check if config file exists
    pub fn exists(&self) -> bool {
        self.config_path.exists()
    }

    /// Read config from file, returning defaults if not found
    pub fn read(&self) -> Result<RalphConfig, String> {
        if !self.config_path.exists() {
            return Ok(RalphConfig::default());
        }

        let content = std::fs::read_to_string(&self.config_path)
            .map_err(|e| format!("Failed to read config file: {}", e))?;

        serde_yaml::from_str(&content).map_err(|e| format!("Failed to parse config file: {}", e))
    }

    /// Write config to file
    pub fn write(&self, config: &RalphConfig) -> Result<(), String> {
        // Ensure parent directory exists
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create config directory: {}", e))?;
        }

        let content = serde_yaml::to_string(config)
            .map_err(|e| format!("Failed to serialize config: {}", e))?;

        std::fs::write(&self.config_path, content)
            .map_err(|e| format!("Failed to write config file: {}", e))
    }

    /// Initialize config with defaults if it doesn't exist
    pub fn initialize(&self) -> Result<RalphConfig, String> {
        if self.exists() {
            return self.read();
        }

        let config = RalphConfig::default();
        self.write(&config)?;
        Ok(config)
    }

    /// Update specific fields in the config
    pub fn update<F>(&self, updater: F) -> Result<RalphConfig, String>
    where
        F: FnOnce(&mut RalphConfig),
    {
        let mut config = self.read()?;
        updater(&mut config);
        self.write(&config)?;
        Ok(config)
    }

    /// Get the config file path
    pub fn path(&self) -> &Path {
        &self.config_path
    }
}

/// Merge config values with command-line/UI overrides
pub fn merge_config(
    file_config: &RalphConfig,
    max_iterations: Option<u32>,
    max_cost: Option<f64>,
    agent: Option<&str>,
    model: Option<&str>,
    completion_promise: Option<&str>,
) -> LoopConfig {
    LoopConfig {
        max_iterations: max_iterations.unwrap_or(file_config.ralph.max_iterations),
        max_cost: max_cost.or(file_config.ralph.max_cost),
        agent: agent
            .map(|s| s.to_string())
            .unwrap_or_else(|| file_config.ralph.agent.clone()),
        model: model
            .map(|s| s.to_string())
            .or_else(|| file_config.ralph.model.clone()),
        completion_promise: completion_promise
            .map(|s| s.to_string())
            .unwrap_or_else(|| file_config.ralph.completion_promise.clone()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ralph_loop::types::ProjectConfig;
    use tempfile::TempDir;

    #[test]
    fn test_config_read_defaults_when_missing() {
        let temp_dir = TempDir::new().unwrap();
        let manager = ConfigManager::new(temp_dir.path());

        let config = manager.read().unwrap();
        assert_eq!(config.ralph.max_iterations, 50);
        assert_eq!(config.ralph.agent, "claude");
    }

    #[test]
    fn test_config_write_and_read() {
        let temp_dir = TempDir::new().unwrap();
        let ralph_ui_dir = temp_dir.path().join(".ralph-ui");
        std::fs::create_dir_all(&ralph_ui_dir).unwrap();
        let manager = ConfigManager::new(temp_dir.path());

        let mut config = RalphConfig::default();
        config.ralph.max_iterations = 100;
        config.project.test_command = Some("npm test".to_string());

        manager.write(&config).unwrap();

        let read_config = manager.read().unwrap();
        assert_eq!(read_config.ralph.max_iterations, 100);
        assert_eq!(
            read_config.project.test_command,
            Some("npm test".to_string())
        );
    }

    #[test]
    fn test_config_update() {
        let temp_dir = TempDir::new().unwrap();
        let ralph_ui_dir = temp_dir.path().join(".ralph-ui");
        std::fs::create_dir_all(&ralph_ui_dir).unwrap();
        let manager = ConfigManager::new(temp_dir.path());

        manager.initialize().unwrap();

        let updated = manager
            .update(|c| {
                c.ralph.max_cost = Some(10.0);
            })
            .unwrap();

        assert_eq!(updated.ralph.max_cost, Some(10.0));
    }

    #[test]
    fn test_merge_config() {
        let file_config = RalphConfig {
            project: ProjectConfig::default(),
            ralph: LoopConfig {
                max_iterations: 50,
                max_cost: Some(5.0),
                agent: "claude".to_string(),
                model: Some("claude-sonnet-4-5".to_string()),
                completion_promise: "<promise>COMPLETE</promise>".to_string(),
            },
        };

        // Override some values
        let merged = merge_config(&file_config, Some(100), None, Some("opencode"), None, None);

        assert_eq!(merged.max_iterations, 100); // overridden
        assert_eq!(merged.max_cost, Some(5.0)); // from file
        assert_eq!(merged.agent, "opencode"); // overridden
        assert_eq!(merged.model, Some("claude-sonnet-4-5".to_string())); // from file
    }
}
