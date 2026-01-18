// Codex CLI model provider

use std::process::Command;

use crate::agents::path_resolver::CliPathResolver;
use crate::agents::models::{ModelInfo, format_model_name, infer_provider};
use crate::models::AgentType;
use super::ModelProvider;

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
    #[allow(dead_code)]
    pub fn is_installed(&self) -> bool {
        CliPathResolver::resolve_codex().is_some()
    }

    /// Try to discover models using `codex --list-models`
    fn try_list_models(&self) -> Result<Vec<ModelInfo>, String> {
        let path = CliPathResolver::resolve_codex()
            .ok_or_else(|| "Codex CLI not found".to_string())?;

        log::info!("[CodexProvider] Running: {:?} --list-models", path);

        let output = Command::new(&path)
            .arg("--list-models")
            .output()
            .map_err(|e| format!("Failed to run codex --list-models: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("codex --list-models failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        log::debug!("[CodexProvider] Output: {}", stdout);

        self.parse_models_output(&stdout)
    }

    /// Parse models output
    /// Expects either JSON array or line-separated model IDs
    fn parse_models_output(&self, output: &str) -> Result<Vec<ModelInfo>, String> {
        let trimmed = output.trim();

        // Try JSON parsing first
        if trimmed.starts_with('[') {
            return self.parse_json_models(trimmed);
        }

        // Fall back to line-separated format
        Ok(self.parse_line_models(trimmed))
    }

    /// Parse JSON array of models
    fn parse_json_models(&self, json: &str) -> Result<Vec<ModelInfo>, String> {
        #[derive(serde::Deserialize)]
        struct JsonModel {
            #[serde(alias = "model")]
            id: String,
            #[serde(alias = "display_name")]
            name: Option<String>,
            provider: Option<String>,
        }

        let json_models: Vec<JsonModel> = serde_json::from_str(json)
            .map_err(|e| format!("Failed to parse JSON models: {}", e))?;

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

impl ModelProvider for CodexProvider {
    fn discover_models(&self) -> Result<Vec<ModelInfo>, String> {
        self.try_list_models()
    }

    fn agent_type(&self) -> AgentType {
        AgentType::Codex
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
