// Cursor Agent model provider

use std::path::Path;
use std::process::Command;

use crate::agents::manager::AgentSpawnConfig;
use crate::agents::models::{get_fallback_models, ModelInfo};
use crate::agents::path_resolver::CliPathResolver;
use crate::agents::plugin::AgentPlugin;
use crate::models::AgentType;
use anyhow::{anyhow, Result};

/// Provider for Cursor Agent
///
/// Cursor Agent doesn't have a CLI command to list models,
/// so this provider always returns an empty list to trigger fallback.
pub struct CursorProvider;

impl CursorProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for CursorProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentPlugin for CursorProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Cursor
    }

    fn is_available(&self) -> bool {
        CliPathResolver::resolve_cursor().is_some()
    }

    fn discover_models(&self) -> Result<Vec<ModelInfo>> {
        // Cursor Agent doesn't have model listing capability
        // Return empty to use fallback models
        log::info!("[CursorProvider] No CLI model discovery available, using fallback");
        Ok(get_fallback_models(&AgentType::Cursor))
    }

    fn build_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        // Resolve Cursor agent path
        let cursor_path = CliPathResolver::resolve_cursor()
            .ok_or_else(|| anyhow!("Cursor agent not found. Ensure Cursor is installed."))?;

        log::info!("[CursorProvider] Cursor path: {:?}", cursor_path);

        let mut cmd = Command::new(&cursor_path);

        // Inject environment variables if provided
        if let Some(ref env_vars) = config.env_vars {
            log::info!(
                "[CursorProvider] Injecting {} environment variables",
                env_vars.len()
            );
            cmd.envs(env_vars);
        }

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
                    "Cursor requires a non-empty prompt. Task description is empty for task {}",
                    config.task_id
                ));
            }
        }

        // Add --force to skip confirmation prompts
        cmd.arg("--force");

        // Add model if specified (Cursor may support model selection)
        if let Some(model) = &config.model {
            cmd.arg("--model").arg(model);
        }

        Ok(cmd)
    }

    fn parse_output(&self, line: &str) -> String {
        // Cursor output format is not standard JSON, just return line as is
        // Or implement specific parsing if known
        line.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::manager::AgentSpawnMode;

    #[test]
    fn test_cursor_provider_new() {
        let provider = CursorProvider::new();
        assert_eq!(provider.agent_type(), AgentType::Cursor);
    }

    #[test]
    fn test_cursor_provider_returns_fallback() {
        let provider = CursorProvider::new();
        // Since we changed discover_models to return Result<Vec<ModelInfo>>, we unwrap
        let models = provider.discover_models().unwrap();

        // Should return fallback models
        assert!(!models.is_empty());
        assert!(models.iter().any(|m| m.id == "claude-sonnet-4-5"));
    }

    #[test]
    fn test_build_command() {
        let provider = CursorProvider::new();
        let config = AgentSpawnConfig {
            agent_type: AgentType::Cursor,
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
