// OpenCode CLI model provider

use std::path::Path;
use std::process::Command;

use crate::agents::config::{ConfigField, ConfigFieldType, PluginConfigSchema};
use crate::agents::manager::{truncate_string, AgentSpawnConfig};
use crate::agents::models::{format_model_name, infer_provider, ModelInfo};
use crate::agents::path_resolver::CliPathResolver;
use crate::agents::plugin::AgentPlugin;
use crate::models::AgentType;
use anyhow::{anyhow, Result};

/// Provider for OpenCode CLI
///
/// OpenCode has a `models` command that lists available models.
pub struct OpencodeProvider;

impl OpencodeProvider {
    pub fn new() -> Self {
        Self
    }

    /// Check if OpenCode CLI is installed
    fn is_installed(&self) -> bool {
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
            if line.starts_with("Available") || line.starts_with("Models:") || line.starts_with('-')
            {
                continue;
            }

            // Parse model ID: provider/model-name
            let (provider, name) = if line.contains('/') {
                let parts: Vec<&str> = line.splitn(2, '/').collect();
                (
                    parts[0].to_string(),
                    format_model_name(parts.get(1).unwrap_or(&"")),
                )
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

impl AgentPlugin for OpencodeProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Opencode
    }

    fn is_available(&self) -> bool {
        self.is_installed()
    }

    fn discover_models(&self) -> Result<Vec<ModelInfo>> {
        let path =
            CliPathResolver::resolve_opencode().ok_or_else(|| anyhow!("OpenCode CLI not found"))?;

        log::info!("[OpencodeProvider] Running: {:?} models", path);

        let output = Command::new(&path)
            .arg("models")
            .output()
            .map_err(|e| anyhow!("Failed to run opencode models: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("opencode models failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        log::debug!("[OpencodeProvider] Output: {}", stdout);

        Ok(self.parse_models_output(&stdout))
    }

    fn config_schema(&self) -> PluginConfigSchema {
        PluginConfigSchema::new().add_field(ConfigField {
            key: "permission".to_string(),
            label: "Permission Strategy".to_string(),
            description: Some("How to handle tool permission requests".to_string()),
            field_type: ConfigFieldType::Select {
                options: vec!["allow".to_string(), "deny".to_string(), "ask".to_string()],
            },
            default_value: Some(serde_json::json!("allow")),
            required: true,
            secret: false,
        })
    }

    fn build_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        // Resolve OpenCode path using path resolver
        let opencode_path = CliPathResolver::resolve_opencode()
            .ok_or_else(|| anyhow!("OpenCode not found. Install from https://opencode.ai"))?;

        log::info!("[OpencodeProvider] OpenCode path: {:?}", opencode_path);

        let mut cmd = Command::new(&opencode_path);

        // Set working directory - check if it exists first
        let worktree = Path::new(&config.worktree_path);

        // Get permission setting from config, default to "allow"
        let permission = if let Some(plugin_config) = &config.plugin_config {
            plugin_config
                .get("permission")
                .and_then(|v| v.as_str())
                .unwrap_or("allow")
        } else {
            "allow"
        };

        // Create opencode.json config in the working directory to skip permission prompts
        // OpenCode uses config-based permissions, not environment variables
        if worktree.exists() {
            let config_path = worktree.join("opencode.json");
            // Only create if it doesn't exist (don't overwrite user config)
            if !config_path.exists() {
                let config_content = format!(
                    r#"{{"$schema": "https://opencode.ai/config.json", "permission": "{}"}}"#,
                    permission
                );
                if let Err(e) = std::fs::write(&config_path, config_content) {
                    log::warn!(
                        "[OpencodeProvider] Failed to create opencode.json for permissions: {}",
                        e
                    );
                } else {
                    log::info!("[OpencodeProvider] Created opencode.json with permission: allow");
                }
            } else {
                log::info!(
                    "[OpencodeProvider] opencode.json already exists, using existing config"
                );
            }
        }

        // Set working directory
        if worktree.exists() {
            log::info!(
                "[OpencodeProvider] Using worktree path: {}",
                config.worktree_path
            );
            cmd.current_dir(&config.worktree_path);
        } else {
            log::warn!(
                "[OpencodeProvider] Worktree path doesn't exist: {}, using current directory",
                config.worktree_path
            );
        }

        // Use the 'run' subcommand for non-interactive execution
        cmd.arg("run");

        // Add the prompt as the message - opencode requires a non-empty message
        match &config.prompt {
            Some(prompt) if !prompt.trim().is_empty() => {
                cmd.arg(prompt);
            }
            _ => {
                return Err(anyhow!(
                    "OpenCode requires a non-empty prompt. Task description is empty for task {}",
                    config.task_id
                ));
            }
        }

        // Use JSON format for easier parsing
        cmd.arg("--format").arg("json");

        // Print logs to stderr for debugging
        cmd.arg("--print-logs");

        // Add model if specified
        if let Some(model) = &config.model {
            cmd.arg("--model").arg(model);
        }

        Ok(cmd)
    }

    fn parse_output(&self, line: &str) -> String {
        // Try to parse as JSON
        let json: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => return line.to_string(), // Not JSON, return as-is
        };

        // Check for OpenCode format (has "role" or "content" at top level)
        if json.get("role").is_some() || json.get("content").is_some() {
            let role = json
                .get("role")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");

            // Extract content - can be string or array
            let content = if let Some(content_str) = json.get("content").and_then(|v| v.as_str()) {
                content_str.to_string()
            } else if let Some(content_arr) = json.get("content").and_then(|v| v.as_array()) {
                content_arr
                    .iter()
                    .filter_map(|item| {
                        if let Some(text) = item.get("text").and_then(|t| t.as_str()) {
                            Some(text.to_string())
                        } else if let Some(tool) = item.get("tool_use") {
                            let name = tool.get("name").and_then(|n| n.as_str()).unwrap_or("tool");
                            Some(format!("\x1b[33m[Using tool: {}]\x1b[0m", name))
                        } else {
                            None
                        }
                    })
                    .collect::<Vec<_>>()
                    .join("\n")
            } else {
                String::new()
            };

            if content.is_empty() {
                return String::new();
            }

            match role {
                "assistant" => content,
                "user" => format!("\x1b[90m[User]: {}\x1b[0m", content),
                "system" => format!("\x1b[36m[System]: {}\x1b[0m", content),
                "tool" => {
                    let truncated = if content.len() > 200 {
                        format!("{}...", truncate_string(&content, 200))
                    } else {
                        content
                    };
                    format!("\x1b[90m[Tool result]: {}\x1b[0m", truncated)
                }
                _ => content,
            }
        } else {
            // Unknown JSON format - return as-is but formatted
            line.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::manager::AgentSpawnMode;

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
    fn test_build_command() {
        let provider = OpencodeProvider::new();
        let config = AgentSpawnConfig {
            agent_type: AgentType::Opencode,
            task_id: "test-task".to_string(),
            worktree_path: "/tmp".to_string(),
            branch: "main".to_string(),
            max_iterations: 10,
            prompt: Some("test prompt".to_string()),
            model: None,
            spawn_mode: AgentSpawnMode::Piped,
            plugin_config: None,
        };

        // This test depends on environment, so we just check if it fails or returns command
        let _ = provider.build_command(&config);
    }

    #[test]
    fn test_opencode_config_schema() {
        let provider = OpencodeProvider::new();
        let schema = provider.config_schema();
        assert_eq!(schema.fields.len(), 1);
        assert_eq!(schema.fields[0].key, "permission");
        assert_eq!(
            schema.fields[0].default_value,
            Some(serde_json::json!("allow"))
        );
    }
}
