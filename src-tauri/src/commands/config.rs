// Configuration Tauri commands

use crate::config::{
    load_merged_config, get_config_paths, RalphConfig, ExecutionConfig, GitConfig, ValidationConfig,
    FallbackSettings,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::RwLock;
use tauri::State;

/// Application configuration state
pub struct ConfigState {
    /// Current merged configuration
    config: RwLock<RalphConfig>,
    /// Global config path
    #[allow(dead_code)]
    global_path: Option<PathBuf>,
    /// Project config path (set when project is opened)
    project_path: RwLock<Option<PathBuf>>,
}

impl ConfigState {
    /// Create new config state with defaults
    pub fn new() -> Self {
        let config = load_merged_config(None, None).unwrap_or_default();
        let (global_path, _) = get_config_paths(None);

        Self {
            config: RwLock::new(config),
            global_path,
            project_path: RwLock::new(None),
        }
    }

    /// Set project path and reload config
    pub fn set_project_path(&self, path: Option<PathBuf>) -> Result<(), String> {
        let mut project_path = self.project_path.write()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;
        *project_path = path.clone();

        // Reload config with new project path
        let new_config = load_merged_config(path.as_deref(), None)
            .map_err(|e| format!("Failed to load config: {}", e))?;

        let mut config = self.config.write()
            .map_err(|e| format!("Failed to acquire lock: {}", e))?;
        *config = new_config;

        Ok(())
    }

    /// Get current config
    pub fn get_config(&self) -> Result<RalphConfig, String> {
        self.config.read()
            .map(|c| c.clone())
            .map_err(|e| format!("Failed to acquire lock: {}", e))
    }
}

impl Default for ConfigState {
    fn default() -> Self {
        Self::new()
    }
}

/// Config paths response
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigPaths {
    pub global_path: Option<String>,
    pub project_path: Option<String>,
    pub global_exists: bool,
    pub project_exists: bool,
}

/// Get current configuration
#[tauri::command]
pub async fn get_config(
    config_state: State<'_, ConfigState>,
) -> Result<RalphConfig, String> {
    config_state.get_config()
}

/// Set project path and reload configuration
#[tauri::command]
pub async fn set_config_project_path(
    project_path: Option<String>,
    config_state: State<'_, ConfigState>,
) -> Result<RalphConfig, String> {
    let path = project_path.map(PathBuf::from);
    config_state.set_project_path(path)?;
    config_state.get_config()
}

/// Get configuration file paths
#[tauri::command]
pub async fn get_config_paths_cmd(
    config_state: State<'_, ConfigState>,
) -> Result<ConfigPaths, String> {
    let project_path = config_state.project_path.read()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    let (global, project) = get_config_paths(project_path.as_deref());

    Ok(ConfigPaths {
        global_exists: global.as_ref().map(|p| p.exists()).unwrap_or(false),
        project_exists: project.as_ref().map(|p| p.exists()).unwrap_or(false),
        global_path: global.map(|p| p.to_string_lossy().to_string()),
        project_path: project.map(|p| p.to_string_lossy().to_string()),
    })
}

/// Update execution configuration
#[tauri::command]
pub async fn update_execution_config(
    max_parallel: Option<i32>,
    max_iterations: Option<i32>,
    max_retries: Option<i32>,
    agent_type: Option<String>,
    strategy: Option<String>,
    model: Option<String>,
    config_state: State<'_, ConfigState>,
) -> Result<ExecutionConfig, String> {
    let mut config = config_state.config.write()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    if let Some(v) = max_parallel {
        if v > 0 {
            config.execution.max_parallel = v;
        }
    }
    if let Some(v) = max_iterations {
        if v > 0 {
            config.execution.max_iterations = v;
        }
    }
    if let Some(v) = max_retries {
        if v >= 0 {
            config.execution.max_retries = v;
        }
    }
    if let Some(v) = agent_type {
        config.execution.agent_type = v;
    }
    if let Some(v) = strategy {
        config.execution.strategy = v;
    }
    if model.is_some() {
        config.execution.model = model;
    }

    Ok(config.execution.clone())
}

/// Update git configuration
#[tauri::command]
pub async fn update_git_config(
    auto_create_prs: Option<bool>,
    draft_prs: Option<bool>,
    branch_pattern: Option<String>,
    config_state: State<'_, ConfigState>,
) -> Result<GitConfig, String> {
    let mut config = config_state.config.write()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    if let Some(v) = auto_create_prs {
        config.git.auto_create_prs = v;
    }
    if let Some(v) = draft_prs {
        config.git.draft_prs = v;
    }
    if let Some(v) = branch_pattern {
        config.git.branch_pattern = v;
    }

    Ok(config.git.clone())
}

/// Update validation configuration
#[tauri::command]
pub async fn update_validation_config(
    run_tests: Option<bool>,
    run_lint: Option<bool>,
    test_command: Option<String>,
    lint_command: Option<String>,
    config_state: State<'_, ConfigState>,
) -> Result<ValidationConfig, String> {
    let mut config = config_state.config.write()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    if let Some(v) = run_tests {
        config.validation.run_tests = v;
    }
    if let Some(v) = run_lint {
        config.validation.run_lint = v;
    }
    if test_command.is_some() {
        config.validation.test_command = test_command;
    }
    if lint_command.is_some() {
        config.validation.lint_command = lint_command;
    }

    Ok(config.validation.clone())
}

/// Update fallback configuration
#[tauri::command]
pub async fn update_fallback_config(
    enabled: Option<bool>,
    base_backoff_ms: Option<u64>,
    max_backoff_ms: Option<u64>,
    fallback_agent: Option<String>,
    config_state: State<'_, ConfigState>,
) -> Result<FallbackSettings, String> {
    let mut config = config_state.config.write()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    if let Some(v) = enabled {
        config.fallback.enabled = v;
    }
    if let Some(v) = base_backoff_ms {
        config.fallback.base_backoff_ms = v;
    }
    if let Some(v) = max_backoff_ms {
        config.fallback.max_backoff_ms = v;
    }
    if fallback_agent.is_some() {
        config.fallback.fallback_agent = fallback_agent;
    }

    Ok(config.fallback.clone())
}

/// Reload configuration from files
#[tauri::command]
pub async fn reload_config(
    config_state: State<'_, ConfigState>,
) -> Result<RalphConfig, String> {
    let project_path = config_state.project_path.read()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;

    let new_config = load_merged_config(project_path.as_deref(), None)
        .map_err(|e| format!("Failed to load config: {}", e))?;

    let mut config = config_state.config.write()
        .map_err(|e| format!("Failed to acquire lock: {}", e))?;
    *config = new_config.clone();

    Ok(new_config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_state_new() {
        let state = ConfigState::new();
        let config = state.get_config().unwrap();

        // Should have default values
        assert_eq!(config.execution.max_parallel, 3);
        assert!(config.fallback.enabled);
    }
}
