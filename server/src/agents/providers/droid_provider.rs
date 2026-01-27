// Droid Agent provider

use std::path::Path;
use std::process::Command;

use crate::agents::manager::AgentSpawnConfig;
use crate::agents::models::ModelInfo;
use crate::agents::path_resolver::CliPathResolver;
use crate::agents::plugin::AgentPlugin;
use crate::models::AgentType;
use anyhow::{anyhow, Result};

pub struct DroidProvider;

impl DroidProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for DroidProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentPlugin for DroidProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Droid
    }

    fn is_available(&self) -> bool {
        CliPathResolver::resolve_droid().is_some()
    }

    fn discover_models(&self) -> Result<Vec<ModelInfo>> {
        // Droid CLI doesn't support model discovery yet
        Ok(vec![])
    }

    fn build_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        // Resolve Droid CLI path
        let droid_path =
            CliPathResolver::resolve_droid().ok_or_else(|| anyhow!("Droid CLI not found."))?;

        log::info!("[DroidProvider] Droid path: {:?}", droid_path);

        let mut cmd = Command::new(&droid_path);

        // Droid uses "exec" subcommand
        cmd.arg("exec");

        // Set working directory
        let worktree = Path::new(&config.worktree_path);
        if worktree.exists() {
            cmd.current_dir(&config.worktree_path);
        }

        // Add the prompt - requires non-empty prompt
        match &config.prompt {
            Some(prompt) if !prompt.trim().is_empty() => {
                cmd.arg("--prompt").arg(prompt);
            }
            _ => {
                return Err(anyhow!(
                    "Droid requires a non-empty prompt. Task description is empty for task {}",
                    config.task_id
                ));
            }
        }

        // Permission: --auto medium for autonomous execution
        cmd.arg("--auto").arg("medium");

        // Add model if specified
        if let Some(model) = &config.model {
            cmd.arg("--model").arg(model);
        }

        Ok(cmd)
    }

    fn parse_output(&self, line: &str) -> String {
        line.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::manager::AgentSpawnMode;

    #[test]
    fn test_droid_provider_new() {
        let provider = DroidProvider::new();
        assert_eq!(provider.agent_type(), AgentType::Droid);
    }

    #[test]
    fn test_droid_provider_default() {
        let provider = DroidProvider::default();
        assert_eq!(provider.agent_type(), AgentType::Droid);
    }

    #[test]
    fn test_discover_models_returns_empty() {
        let provider = DroidProvider::new();
        let models = provider.discover_models().unwrap();
        assert!(models.is_empty());
    }

    #[test]
    fn test_build_command() {
        let provider = DroidProvider::new();
        let config = AgentSpawnConfig {
            agent_type: AgentType::Droid,
            task_id: "test-task".to_string(),
            worktree_path: "/tmp".to_string(),
            branch: "main".to_string(),
            max_iterations: 10,
            prompt: Some("test prompt".to_string()),
            model: None,
            spawn_mode: AgentSpawnMode::Piped,
            plugin_config: None,
            env_vars: None,
            disable_tools: false,
        };

        // This test depends on environment, so we just check if it fails or returns command
        let _ = provider.build_command(&config);
    }
}
