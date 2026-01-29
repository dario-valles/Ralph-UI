// Qwen Agent provider

use std::path::Path;
use std::process::Command;

use crate::agents::manager::AgentSpawnConfig;
use crate::agents::models::ModelInfo;
use crate::agents::path_resolver::CliPathResolver;
use crate::agents::plugin::AgentPlugin;
use crate::models::AgentType;
use anyhow::{anyhow, Result};

pub struct QwenProvider;

impl QwenProvider {
    pub fn new() -> Self {
        Self
    }
}

impl Default for QwenProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl AgentPlugin for QwenProvider {
    fn agent_type(&self) -> AgentType {
        AgentType::Qwen
    }

    fn is_available(&self) -> bool {
        CliPathResolver::resolve_qwen().is_some()
    }

    fn discover_models(&self) -> Result<Vec<ModelInfo>> {
        // Qwen CLI doesn't support model discovery yet
        Ok(vec![])
    }

    fn build_command(&self, config: &AgentSpawnConfig) -> Result<Command> {
        // Resolve Qwen CLI path
        let qwen_path =
            CliPathResolver::resolve_qwen().ok_or_else(|| anyhow!("Qwen CLI not found."))?;

        log::info!("[QwenProvider] Qwen path: {:?}", qwen_path);

        let mut cmd = Command::new(&qwen_path);

        // Inject environment variables if provided
        if let Some(ref env_vars) = config.env_vars {
            log::info!(
                "[QwenProvider] Injecting {} environment variables",
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
                    "Qwen requires a non-empty prompt. Task description is empty for task {}",
                    config.task_id
                ));
            }
        }

        // Permission: --yolo for fully autonomous execution (auto-approves all operations)
        cmd.arg("--yolo");

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
