// Claude Code CLI model provider

use std::process::Command;

use crate::agents::path_resolver::CliPathResolver;
use crate::agents::models::ModelInfo;
use crate::models::AgentType;
use super::ModelProvider;

/// Provider for Claude Code CLI
///
/// Note: Claude Code CLI doesn't have a dedicated model listing command,
/// so we use fallback models. In the future, this could parse --help output
/// or call the Anthropic API directly.
pub struct ClaudeProvider;

impl ClaudeProvider {
    pub fn new() -> Self {
        Self
    }

    /// Check if Claude CLI is installed
    #[allow(dead_code)]
    pub fn is_installed(&self) -> bool {
        CliPathResolver::resolve_claude().is_some()
    }

    /// Try to parse models from `claude --help` output
    /// Currently returns empty as Claude doesn't list models in help
    fn parse_help_for_models(&self) -> Result<Vec<ModelInfo>, String> {
        let path = CliPathResolver::resolve_claude()
            .ok_or_else(|| "Claude CLI not found".to_string())?;

        log::info!("[ClaudeProvider] Running: {:?} --help", path);

        let output = Command::new(&path)
            .arg("--help")
            .output()
            .map_err(|e| format!("Failed to run claude --help: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("claude --help failed: {}", stderr));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        log::debug!("[ClaudeProvider] Help output: {}", stdout);

        // Claude CLI doesn't list models in --help
        // Return empty to trigger fallback
        Ok(vec![])
    }
}

impl Default for ClaudeProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl ModelProvider for ClaudeProvider {
    fn discover_models(&self) -> Result<Vec<ModelInfo>, String> {
        // Claude CLI doesn't have a model listing command
        // Try parsing --help, but expect to fall back to defaults
        self.parse_help_for_models()
    }

    fn agent_type(&self) -> AgentType {
        AgentType::Claude
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_claude_provider_new() {
        let provider = ClaudeProvider::new();
        assert_eq!(provider.agent_type(), AgentType::Claude);
    }

    #[test]
    fn test_claude_provider_discover_models() {
        let provider = ClaudeProvider::new();
        // Should either succeed with empty or return an error
        // Either way, the cache will use fallback models
        let result = provider.discover_models();
        // Just verify it doesn't panic
        let _ = result;
    }
}
