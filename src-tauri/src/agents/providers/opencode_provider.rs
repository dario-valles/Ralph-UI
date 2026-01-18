// OpenCode CLI model provider

use std::process::Command;

use crate::agents::path_resolver::CliPathResolver;
use crate::agents::models::{ModelInfo, format_model_name, infer_provider};
use crate::models::AgentType;
use super::ModelProvider;

/// Provider for OpenCode CLI
///
/// OpenCode has a `models` command that lists available models.
pub struct OpencodeProvider;

impl OpencodeProvider {
    pub fn new() -> Self {
        Self
    }

    /// Check if OpenCode CLI is installed
    #[allow(dead_code)]
    pub fn is_installed(&self) -> bool {
        CliPathResolver::resolve_opencode().is_some()
    }

    /// Parse model list from `opencode models` output
    ///
    /// Expected format: one model ID per line, e.g.:
    /// ```text
    /// anthropic/claude-sonnet-4-5
    /// anthropic/claude-opus-4-5
    /// openai/gpt-4o
    /// ```
    fn parse_models_output(&self, output: &str) -> Vec<ModelInfo> {
        let mut models = Vec::new();
        let mut is_first = true;

        for line in output.lines() {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            // Skip header lines or non-model lines
            if line.starts_with("Available") || line.starts_with("Models:") || line.starts_with('-') {
                continue;
            }

            // Parse model ID: provider/model-name
            let (provider, name) = if line.contains('/') {
                let parts: Vec<&str> = line.splitn(2, '/').collect();
                (parts[0].to_string(), format_model_name(parts.get(1).unwrap_or(&"")))
            } else {
                // No provider prefix, infer from model name
                let provider = infer_provider(line);
                (provider, format_model_name(line))
            };

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

impl Default for OpencodeProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl ModelProvider for OpencodeProvider {
    fn discover_models(&self) -> Result<Vec<ModelInfo>, String> {
        let path = CliPathResolver::resolve_opencode()
            .ok_or_else(|| "OpenCode CLI not found".to_string())?;

        log::info!("[OpencodeProvider] Running: {:?} models", path);

        let output = Command::new(&path)
            .arg("models")
            .output()
            .map_err(|e| format!("Failed to run opencode models: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("opencode models failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        log::debug!("[OpencodeProvider] Output: {}", stdout);

        let models = self.parse_models_output(&stdout);
        Ok(models)
    }

    fn agent_type(&self) -> AgentType {
        AgentType::Opencode
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_opencode_provider_new() {
        let provider = OpencodeProvider::new();
        assert_eq!(provider.agent_type(), AgentType::Opencode);
    }

    #[test]
    fn test_parse_models_output() {
        let provider = OpencodeProvider::new();
        let output = r#"
anthropic/claude-sonnet-4-5
anthropic/claude-opus-4-5
openai/gpt-4o
openai/o1
"#;

        let models = provider.parse_models_output(output);
        assert_eq!(models.len(), 4);
        assert_eq!(models[0].id, "anthropic/claude-sonnet-4-5");
        assert_eq!(models[0].provider, "anthropic");
        assert!(models[0].is_default);
        assert!(!models[1].is_default);
    }

    #[test]
    fn test_parse_models_output_with_header() {
        let provider = OpencodeProvider::new();
        let output = r#"
Available models:
-----------------
anthropic/claude-sonnet-4-5
openai/gpt-4o
"#;

        let models = provider.parse_models_output(output);
        assert_eq!(models.len(), 2);
    }

    #[test]
    fn test_format_model_name() {
        assert_eq!(format_model_name("claude-sonnet-4-5"), "Claude Sonnet 4.5");
        assert_eq!(format_model_name("gpt-4o"), "GPT-4o");
        assert_eq!(format_model_name("custom-model-name"), "Custom Model Name");
    }

    #[test]
    fn test_infer_provider() {
        assert_eq!(infer_provider("claude-sonnet-4-5"), "anthropic");
        assert_eq!(infer_provider("gpt-4o"), "openai");
        assert_eq!(infer_provider("o1"), "openai");
        assert_eq!(infer_provider("gemini-pro"), "google");
        assert_eq!(infer_provider("unknown-model"), "unknown");
    }
}
