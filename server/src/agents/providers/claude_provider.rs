// Claude Code CLI model provider

use std::path::Path;
use std::process::Command;

use crate::agents::format_parsers::truncate_string;
use crate::agents::manager::AgentSpawnConfig;
use crate::agents::models::ModelInfo;
use crate::agents::path_resolver::CliPathResolver;
use crate::agents::plugin::AgentPlugin;
use crate::models::AgentType;
use anyhow::{anyhow, Result};

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
    fn is_installed(&self) -> bool {
        CliPathResolver::resolve_claude().is_some()
    }

    /// Try to parse models from `claude --help` output
    /// Currently returns empty as Claude doesn't list models in help
    fn parse_help_for_models(&self) -> Result<Vec<ModelInfo>> {
        let path =
            CliPathResolver::resolve_claude().ok_or_else(|| anyhow!("Claude CLI not found"))?;

        log::info!("[ClaudeProvider] Running: {:?} --help", path);

        let output = Command::new(&path)
            .arg("--help")
            .output()
            .map_err(|e| anyhow!("Failed to run claude --help: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow!("claude --help failed: {}", stderr));
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

impl AgentPlugin for ClaudeProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Claude
    }

    fn is_available(&self) -> bool {
        self.is_installed()
    }

    fn discover_models(&self) -> Result<Vec<ModelInfo>> {
        // Claude CLI doesn't have a model listing command
        // Try parsing --help, but expect to fall back to defaults
        self.parse_help_for_models()
    }

    fn build_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        // Resolve Claude CLI path using path resolver
        let claude_path = CliPathResolver::resolve_claude().ok_or_else(|| {
            anyhow!("Claude CLI not found. Install: npm install -g @anthropic-ai/claude-code")
        })?;

        log::info!("[ClaudeProvider] Claude path: {:?}", claude_path);

        let mut cmd = Command::new(&claude_path);

        // 🆕 Inject provider-specific environment variables (Z.AI, MiniMax, etc.)
        if let Some(ref env_vars) = config.env_vars {
            log::info!(
                "[ClaudeProvider] Injecting {} environment variables",
                env_vars.len()
            );
            cmd.envs(env_vars);
        } else {
            log::info!(
                "[ClaudeProvider] No custom environment variables (using default Anthropic)"
            );
        }

        // Set working directory - check if it exists first
        let worktree = Path::new(&config.worktree_path);
        if worktree.exists() {
            log::info!(
                "[ClaudeProvider] Using worktree path: {}",
                config.worktree_path
            );
            cmd.current_dir(&config.worktree_path);
        } else {
            log::warn!(
                "[ClaudeProvider] Worktree path doesn't exist: {}, using current directory",
                config.worktree_path
            );
        }

        // Validate prompt is non-empty
        let prompt = match &config.prompt {
            Some(prompt) if !prompt.trim().is_empty() => prompt.clone(),
            _ => {
                return Err(anyhow!(
                    "Claude requires a non-empty prompt. Task description is empty for task {}",
                    config.task_id
                ));
            }
        };

        // Add --print first to output to stdout instead of interactive TUI
        // Note: -p is the short form of --print, NOT a prompt flag!
        cmd.arg("--print");

        // Use stream-json for real-time streaming (text format buffers until complete)
        // Requires --verbose when using stream-json
        cmd.arg("--output-format").arg("stream-json");
        cmd.arg("--verbose");

        // Add --dangerously-skip-permissions to skip permission prompts
        cmd.arg("--dangerously-skip-permissions");

        // Add max turns (iterations) - only if greater than 0
        // max_iterations of 0 or negative means no limit (don't pass flag)
        // When disable_tools is true, we force max_turns=1 to get a single response
        let max_turns = if config.disable_tools && config.max_iterations == 0 {
            1 // Force single turn for pure text generation
        } else {
            config.max_iterations
        };

        if max_turns > 0 {
            cmd.arg("--max-turns").arg(max_turns.to_string());
        }

        // Add model if specified
        if let Some(model) = &config.model {
            cmd.arg("--model").arg(model);
        }

        // Disable all built-in tools for pure text generation tasks (e.g., JSON generation)
        // This prevents the model from using file operations and focuses on text output
        // Note: MCP tools may still be available but --max-turns 1 limits their usage
        if config.disable_tools {
            // Use --tools="" as a single argument to ensure the empty string is passed correctly
            cmd.arg("--tools=");
            log::info!(
                "[ClaudeProvider] Tools disabled for task {}",
                config.task_id
            );
        }

        // Add the prompt as the LAST positional argument
        // Claude CLI syntax: claude [options] [prompt]
        cmd.arg(&prompt);

        Ok(cmd)
    }

    fn parse_output(&self, line: &str) -> String {
        // Try to parse as JSON
        let json: serde_json::Value = match serde_json::from_str(line) {
            Ok(v) => v,
            Err(_) => return line.to_string(), // Not JSON, return as-is
        };

        // Check for Claude stream-json format (has "type" field)
        if let Some(msg_type) = json.get("type").and_then(|v| v.as_str()) {
            match msg_type {
                "system" => {
                    let subtype = json.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
                    if subtype == "init" {
                        let model = json
                            .get("model")
                            .and_then(|v| v.as_str())
                            .unwrap_or("unknown");
                        format!("\x1b[36m[System] Initialized with model: {}\x1b[0m", model)
                    } else {
                        format!("\x1b[36m[System] {}\x1b[0m", subtype)
                    }
                }
                "assistant" => {
                    if let Some(message) = json.get("message") {
                        if let Some(content) = message.get("content").and_then(|c| c.as_array()) {
                            let texts: Vec<String> = content
                                .iter()
                                .filter_map(|item| {
                                    if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                                        item.get("text").and_then(|t| t.as_str()).map(String::from)
                                    } else if item.get("type").and_then(|t| t.as_str())
                                        == Some("tool_use")
                                    {
                                        let tool_name = item
                                            .get("name")
                                            .and_then(|n| n.as_str())
                                            .unwrap_or("tool");
                                        Some(format!("\x1b[33m[Using tool: {}]\x1b[0m", tool_name))
                                    } else {
                                        None
                                    }
                                })
                                .collect();
                            if !texts.is_empty() {
                                return texts.join("\n");
                            }
                        }
                    }
                    String::new()
                }
                "user" => {
                    if let Some(message) = json.get("message") {
                        if let Some(content) = message.get("content").and_then(|c| c.as_array()) {
                            for item in content {
                                if item.get("type").and_then(|t| t.as_str()) == Some("tool_result")
                                {
                                    let tool_id = item
                                        .get("tool_use_id")
                                        .and_then(|t| t.as_str())
                                        .unwrap_or("");
                                    let content_str =
                                        item.get("content").and_then(|c| c.as_str()).unwrap_or("");
                                    let truncated = if content_str.len() > 200 {
                                        format!("{}...", truncate_string(content_str, 200))
                                    } else {
                                        content_str.to_string()
                                    };
                                    return format!(
                                        "\x1b[90m[Tool result {}]: {}\x1b[0m",
                                        &tool_id[..8.min(tool_id.len())],
                                        truncated
                                    );
                                }
                            }
                        }
                    }
                    String::new()
                }
                "result" => {
                    let subtype = json.get("subtype").and_then(|v| v.as_str()).unwrap_or("");
                    let duration = json
                        .get("duration_ms")
                        .and_then(|v| v.as_u64())
                        .unwrap_or(0);
                    let cost = json
                        .get("total_cost_usd")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0);
                    format!(
                        "\x1b[32m[Complete] {} - Duration: {}ms, Cost: ${:.4}\x1b[0m",
                        subtype, duration, cost
                    )
                }
                _ => String::new(),
            }
        } else {
            // Not Claude stream-json, return formatted JSON or original
            line.to_string()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agents::manager::AgentSpawnMode;

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

    #[test]
    fn test_build_command() {
        let provider = ClaudeProvider::new();
        let config = AgentSpawnConfig {
            agent_type: AgentType::Claude,
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
        // if claude is not installed it returns Err, otherwise Ok
        let _ = provider.build_command(&config);
    }

    #[test]
    fn test_build_command_with_disabled_tools() {
        let provider = ClaudeProvider::new();
        let config = AgentSpawnConfig {
            agent_type: AgentType::Claude,
            task_id: "test-task".to_string(),
            worktree_path: "/tmp".to_string(),
            branch: "main".to_string(),
            max_iterations: 0,
            prompt: Some("Generate JSON".to_string()),
            model: None,
            spawn_mode: AgentSpawnMode::Piped,
            plugin_config: None,
            env_vars: None,
            disable_tools: true,
        };

        // This test verifies the command is built (or fails if Claude not installed)
        // When disable_tools is true and max_iterations is 0, we expect:
        // 1. --max-turns 1 to force single turn
        // 2. --tools= to disable built-in tools
        if let Ok(cmd) = provider.build_command(&config) {
            let args: Vec<_> = cmd.get_args().collect();

            // Check that --max-turns is set to 1
            let max_turns_idx = args.iter().position(|a| *a == "--max-turns");
            assert!(
                max_turns_idx.is_some(),
                "Expected --max-turns flag when disable_tools is true with max_iterations=0"
            );
            if let Some(idx) = max_turns_idx {
                assert!(idx + 1 < args.len(), "Expected value after --max-turns");
                assert_eq!(
                    args[idx + 1],
                    "1",
                    "Expected --max-turns 1 for disable_tools"
                );
            }

            // Check that --tools= flag is present
            let has_tools_empty = args.iter().any(|a| *a == "--tools=");
            assert!(
                has_tools_empty,
                "Expected --tools= flag when disable_tools is true"
            );
        }
    }
}
