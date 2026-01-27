// Gemini CLI model provider
//
// Gemini CLI from @google/gemini-cli
// - Binary: gemini
// - Non-interactive: -p / --prompt
// - Output format: --output-format stream-json
// - Autonomous: --yolo / -y
// - Model: -m / --model (default: gemini-2.5-pro)
// - Resume: --resume <id>

use std::path::Path;
use std::process::Command;

use crate::agents::manager::AgentSpawnConfig;
use crate::agents::models::{format_model_name, ModelInfo};
use crate::agents::path_resolver::CliPathResolver;
use crate::agents::plugin::AgentPlugin;
use crate::models::AgentType;
use anyhow::{anyhow, Result};

/// Provider for Gemini CLI
pub struct GeminiProvider;

impl GeminiProvider {
    pub fn new() -> Self {
        Self
    }

    /// Check if Gemini CLI is installed
    fn is_installed(&self) -> bool {
        CliPathResolver::resolve_gemini().is_some()
    }

    /// Try to discover models using `gemini --list-models`
    fn try_list_models(&self) -> Result<Vec<ModelInfo>> {
        let path =
            CliPathResolver::resolve_gemini().ok_or_else(|| anyhow!("Gemini CLI not found"))?;

        log::info!("[GeminiProvider] Running: {:?} --list-models", path);

        let output = Command::new(&path)
            .arg("--list-models")
            .output()
            .map_err(|e| anyhow!("Failed to run gemini --list-models: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("gemini --list-models failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        log::debug!("[GeminiProvider] Output: {}", stdout);

        self.parse_models_output(&stdout)
    }

    /// Parse models output - expects line-separated model IDs
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
        }

        let json_models: Vec<JsonModel> = serde_json::from_str(json)
            .map_err(|e| anyhow!("Failed to parse JSON models: {}", e))?;

        let models = json_models
            .into_iter()
            .enumerate()
            .map(|(i, m)| ModelInfo {
                name: m.name.unwrap_or_else(|| format_model_name(&m.id)),
                provider: "google".to_string(),
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

            let name = format_model_name(line);

            models.push(ModelInfo {
                id: line.to_string(),
                name,
                provider: "google".to_string(),
                is_default: is_first,
            });

            is_first = false;
        }

        models
    }
}

impl Default for GeminiProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentPlugin for GeminiProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Gemini
    }

    fn is_available(&self) -> bool {
        self.is_installed()
    }

    fn discover_models(&self) -> Result<Vec<ModelInfo>> {
        self.try_list_models()
    }

    fn build_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        // Resolve Gemini CLI path
        let gemini_path = CliPathResolver::resolve_gemini().ok_or_else(|| {
            anyhow!("Gemini CLI not found. Install via: npm install -g @google/gemini-cli")
        })?;

        log::info!("[GeminiProvider] Gemini path: {:?}", gemini_path);

        let mut cmd = Command::new(&gemini_path);

        // Set working directory
        let worktree = Path::new(&config.worktree_path);
        if worktree.exists() {
            cmd.current_dir(&config.worktree_path);
        }

        // Add the prompt - requires non-empty prompt
        match &config.prompt {
            Some(prompt) if !prompt.trim().is_empty() => {
                cmd.arg("-p").arg(prompt);
            }
            _ => {
                return Err(anyhow!(
                    "Gemini requires a non-empty prompt. Task description is empty for task {}",
                    config.task_id
                ));
            }
        }

        // Enable autonomous mode (skip confirmations)
        cmd.arg("--yolo");

        // Add model if specified
        if let Some(model) = &config.model {
            cmd.arg("-m").arg(model);
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
    fn test_gemini_provider_new() {
        let provider = GeminiProvider::new();
        assert_eq!(provider.agent_type(), AgentType::Gemini);
    }

    #[test]
    fn test_parse_line_models() {
        let provider = GeminiProvider::new();
        let output = r#"
gemini-2.5-pro
gemini-2.5-flash
gemini-2.0-flash
"#;

        let models = provider.parse_line_models(output);
        assert_eq!(models.len(), 3);
        assert_eq!(models[0].id, "gemini-2.5-pro");
        assert_eq!(models[0].provider, "google");
        assert!(models[0].is_default);
    }

    #[test]
    fn test_parse_json_models() {
        let provider = GeminiProvider::new();
        let json = r#"[
            {"id": "gemini-2.5-pro", "name": "Gemini 2.5 Pro"},
            {"id": "gemini-2.5-flash", "name": "Gemini 2.5 Flash"}
        ]"#;

        let models = provider.parse_json_models(json).unwrap();
        assert_eq!(models.len(), 2);
        assert_eq!(models[0].id, "gemini-2.5-pro");
        assert!(models[0].is_default);
    }

    #[test]
    fn test_build_command() {
        let provider = GeminiProvider::new();
        let config = AgentSpawnConfig {
            agent_type: AgentType::Gemini,
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
