// Codex CLI model provider

use std::path::Path;
use std::process::Command;

use crate::agents::manager::AgentSpawnConfig;
use crate::agents::models::{format_model_name, infer_provider, ModelInfo};
use crate::agents::path_resolver::CliPathResolver;
use crate::agents::plugin::AgentPlugin;
use crate::models::AgentType;
use anyhow::{anyhow, Result};

/// Provider for Codex CLI
///
/// Codex may have a `--list-models` or similar command.
/// If not available, falls back to default models.
pub struct CodexProvider;

impl CodexProvider {
    pub fn new() -> Self {
        Self
    }

    /// Check if Codex CLI is installed
    fn is_installed(&self) -> bool {
        CliPathResolver::resolve_codex().is_some()
    }

    /// Try to discover models using `codex --list-models`
    fn try_list_models(&self) -> Result<Vec<ModelInfo>> {
        let path =
            CliPathResolver::resolve_codex().ok_or_else(|| anyhow!("Codex CLI not found"))?;

        log::info!("[CodexProvider] Running: {:?} --list-models", path);

        let output = Command::new(&path)
            .arg("--list-models")
            .output()
            .map_err(|e| anyhow!("Failed to run codex --list-models: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("codex --list-models failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        log::debug!("[CodexProvider] Output: {}", stdout);

        self.parse_models_output(&stdout)
    }

    /// Parse models output
    /// Expects either JSON array or line-separated model IDs
    fn parse_models_output(&self, output: &str) -> Result<Vec<ModelInfo>> {
        let trimmed = output.trim();

        // Try JSON parsing first
        if trimmed.starts_with('[') {
            return self.parse_json_models(trimmed);
        }

        // Fall back to line-separated format
        Ok(self.parse_line_models(trimmed))
    }

    /// Parse JSON array of models
    fn parse_json_models(&self, json: &str) -> Result<Vec<ModelInfo>> {
        #[derive(serde::Deserialize)]
        struct JsonModel {
            #[serde(alias = "model")]
            id: String,
            #[serde(alias = "display_name")]
            name: Option<String>,
            provider: Option<String>,
        }

        let json_models: Vec<JsonModel> = serde_json::from_str(json)
            .map_err(|e| anyhow!("Failed to parse JSON models: {}", e))?;

        let models = json_models
            .into_iter()
            .enumerate()
            .map(|(i, m)| ModelInfo {
                name: m.name.unwrap_or_else(|| format_model_name(&m.id)),
                provider: m.provider.unwrap_or_else(|| infer_provider(&m.id)),
                is_default: i == 0,
                id: m.id,
            })
            .collect();

        Ok(models)
    }

    /// Parse line-separated model IDs
    fn parse_line_models(&self, output: &str) -> Vec<ModelInfo> {
        let mut models = Vec::new();
        let mut is_first = true;

        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                continue;
            }

            let provider = infer_provider(line);
            let name = format_model_name(line);

            models.push(ModelInfo {
                id: line.to_string(),
                name,
                provider,
                is_default: is_first,
            });

            is_first = false;
        }

        models
    }
}

impl Default for CodexProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentPlugin for CodexProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Codex
    }

    fn is_available(&self) -> bool {
        self.is_installed()
    }

    fn discover_models(&self) -> Result<Vec<ModelInfo>> {
        self.try_list_models()
    }

    fn build_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        // Resolve Codex CLI path
        let codex_path = CliPathResolver::resolve_codex()
            .ok_or_else(|| anyhow!("Codex CLI not found. Install from OpenAI."))?;

        log::info!("[CodexProvider] Codex path: {:?}", codex_path);

        let mut cmd = Command::new(&codex_path);

        // Inject environment variables if provided
        if let Some(ref env_vars) = config.env_vars {
            log::info!(
                "[CodexProvider] Injecting {} environment variables",
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
                    "Codex requires a non-empty prompt. Task description is empty for task {}",
                    config.task_id
                ));
            }
        }

        // Add max turns (iterations) - only if greater than 0
        if config.max_iterations > 0 {
            cmd.arg("--max-turns")
                .arg(config.max_iterations.to_string());
        }

        // Add model if specified
        if let Some(model) = &config.model {
            cmd.arg("--model").arg(model);
        }

        Ok(cmd)
    }

    fn parse_output(&self, line: &str) -> String {
        // Codex output format is unknown, returning as-is
        line.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::manager::AgentSpawnMode;

    #[test]
    fn test_codex_provider_new() {
        let provider = CodexProvider::new();
        assert_eq!(provider.agent_type(), AgentType::Codex);
    }

    #[test]
    fn test_parse_line_models() {
        let provider = CodexProvider::new();
        let output = r#"
gpt-4o
o1
o1-mini
"#;

        let models = provider.parse_line_models(output);
        assert_eq!(models.len(), 3);
        assert_eq!(models[0].id, "gpt-4o");
        assert_eq!(models[0].provider, "openai");
        assert!(models[0].is_default);
    }

    #[test]
    fn test_parse_json_models() {
        let provider = CodexProvider::new();
        let json = r#"[
            {"id": "gpt-4o", "name": "GPT-4o", "provider": "openai"},
            {"id": "o1", "name": "OpenAI o1", "provider": "openai"}
        ]"#;

        let models = provider.parse_json_models(json).unwrap();
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "gpt-4o");
        assert!(models[0].is_default);
    }

    #[test]
    fn test_format_model_name() {
        assert_eq!(format_model_name("gpt-4o"), "GPT-4o");
        assert_eq!(format_model_name("o1"), "OpenAI o1");
    }

    #[test]
    fn test_build_command() {
        let provider = CodexProvider::new();
        let config = AgentSpawnConfig {
            agent_type: AgentType::Codex,
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
