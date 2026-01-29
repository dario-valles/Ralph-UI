// Configuration Backend commands

use crate::config::{
    get_config_paths, load_merged_config, ConfigLoader, ExecutionConfig, FallbackSettings,
    GitConfig, RalphConfig, ValidationConfig,
};
use crate::utils::ResultExt;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::RwLock;

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
        log::info!("[ConfigState::new] Loading config on startup...");
        let config = load_merged_config(None, None).unwrap_or_default();
        let (global_path, _) = get_config_paths(None);
        log::info!("[ConfigState::new] Global path: {:?}", global_path);
        log::info!(
            "[ConfigState::new] Loaded config: max_parallel={}, agent_type={}",
            config.execution.max_parallel,
            config.execution.agent_type
        );

        Self {
            config: RwLock::new(config),
            global_path,
            project_path: RwLock::new(None),
        }
    }

    /// Set project path and reload config
    pub fn set_project_path(&self, path: Option<PathBuf>) -> Result<(), String> {
        let mut project_path = self
            .project_path
            .write()
            .with_context("Failed to acquire lock")?;
        *project_path = path.clone();

        // Reload config with new project path
        let new_config =
            load_merged_config(path.as_deref(), None).with_context("Failed to load config")?;

        let mut config = self.config.write().with_context("Failed to acquire lock")?;
        *config = new_config;

        Ok(())
    }

    /// Get current config
    pub fn get_config(&self) -> Result<RalphConfig, String> {
        self.config
            .read()
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
pub async fn get_config(config_state: &ConfigState) -> Result<RalphConfig, String> {
    config_state.get_config()
}

/// Set project path and reload configuration
pub async fn set_config_project_path(
    project_path: Option<String>,
    config_state: &ConfigState,
) -> Result<RalphConfig, String> {
    let path = project_path.map(PathBuf::from);
    config_state.set_project_path(path)?;
    config_state.get_config()
}

/// Get configuration file paths
pub async fn get_config_paths_cmd(config_state: &ConfigState) -> Result<ConfigPaths, String> {
    let project_path = config_state
        .project_path
        .read()
        .with_context("Failed to acquire lock")?;

    let (global, project) = get_config_paths(project_path.as_deref());

    Ok(ConfigPaths {
        global_exists: global.as_ref().map(|p| p.exists()).unwrap_or(false),
        project_exists: project.as_ref().map(|p| p.exists()).unwrap_or(false),
        global_path: global.map(|p| p.to_string_lossy().to_string()),
        project_path: project.map(|p| p.to_string_lossy().to_string()),
    })
}

/// Update execution configuration
pub async fn update_execution_config(
    max_parallel: Option<i32>,
    max_iterations: Option<i32>,
    max_retries: Option<i32>,
    agent_type: Option<String>,
    strategy: Option<String>,
    model: Option<String>,
    config_state: &ConfigState,
) -> Result<ExecutionConfig, String> {
    let mut config = config_state
        .config
        .write()
        .with_context("Failed to acquire lock")?;

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

/// Update API provider
pub async fn update_api_provider(
    api_provider: Option<String>,
    config_state: &ConfigState,
) -> Result<(), String> {
    let mut config = config_state
        .config
        .write()
        .with_context("Failed to acquire lock")?;

    // Set to None for "anthropic" (default), or Some(provider_id) for alternatives
    config.execution.api_provider = api_provider.filter(|p| p != "anthropic");

    Ok(())
}

/// Update git configuration
pub async fn update_git_config(
    auto_create_prs: Option<bool>,
    draft_prs: Option<bool>,
    branch_pattern: Option<String>,
    config_state: &ConfigState,
) -> Result<GitConfig, String> {
    let mut config = config_state
        .config
        .write()
        .with_context("Failed to acquire lock")?;

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
pub async fn update_validation_config(
    run_tests: Option<bool>,
    run_lint: Option<bool>,
    test_command: Option<String>,
    lint_command: Option<String>,
    use_ai_for_acceptance_criteria: Option<bool>,
    config_state: &ConfigState,
) -> Result<ValidationConfig, String> {
    let mut config = config_state
        .config
        .write()
        .with_context("Failed to acquire lock")?;

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
    if let Some(v) = use_ai_for_acceptance_criteria {
        config.validation.use_ai_for_acceptance_criteria = v;
    }

    Ok(config.validation.clone())
}

/// Update fallback configuration
pub async fn update_fallback_config(
    enabled: Option<bool>,
    base_backoff_ms: Option<u64>,
    max_backoff_ms: Option<u64>,
    fallback_model: Option<String>,
    fallback_api_provider: Option<String>,
    error_strategy: Option<serde_json::Value>,
    fallback_chain: Option<Vec<String>>,
    test_primary_recovery: Option<bool>,
    recovery_test_interval: Option<u32>,
    config_state: &ConfigState,
) -> Result<FallbackSettings, String> {
    let mut config = config_state
        .config
        .write()
        .with_context("Failed to acquire lock")?;

    if let Some(v) = enabled {
        config.fallback.enabled = v;
    }
    if let Some(v) = base_backoff_ms {
        config.fallback.base_backoff_ms = v;
    }
    if let Some(v) = max_backoff_ms {
        config.fallback.max_backoff_ms = v;
    }
    if fallback_model.is_some() {
        config.fallback.fallback_model = fallback_model;
    }
    if fallback_api_provider.is_some() {
        config.fallback.fallback_api_provider = fallback_api_provider;
    }
    if let Some(v) = error_strategy {
        config.fallback.error_strategy = serde_json::from_value(v).ok();
    }
    if fallback_chain.is_some() {
        config.fallback.fallback_chain = fallback_chain;
    }
    if test_primary_recovery.is_some() {
        config.fallback.test_primary_recovery = test_primary_recovery;
    }
    if recovery_test_interval.is_some() {
        config.fallback.recovery_test_interval = recovery_test_interval;
    }

    Ok(config.fallback.clone())
}

/// Reload configuration from files
pub async fn reload_config(config_state: &ConfigState) -> Result<RalphConfig, String> {
    let project_path = config_state
        .project_path
        .read()
        .with_context("Failed to acquire lock")?;

    let new_config =
        load_merged_config(project_path.as_deref(), None).with_context("Failed to load config")?;

    let mut config = config_state
        .config
        .write()
        .with_context("Failed to acquire lock")?;
    *config = new_config.clone();

    Ok(new_config)
}

/// Save configuration to global config file
/// Settings from the Settings page are app-level defaults, so always save to global config
pub async fn save_config(config_state: &ConfigState) -> Result<(), String> {
    log::info!("[save_config] Starting save to global config...");

    let config = config_state
        .config
        .read()
        .with_context("Failed to acquire lock")?;

    log::info!(
        "[save_config] Config to save: max_parallel={}, agent_type={}, model={:?}",
        config.execution.max_parallel,
        config.execution.agent_type,
        config.execution.model
    );

    let loader = ConfigLoader::new();

    log::info!(
        "[save_config] Global config path: {:?}",
        loader.global_config_path()
    );

    loader.save_global(&config).map_err(|e| {
        log::error!("[save_config] Failed to save global config: {}", e);
        format!("Failed to save global config: {}", e)
    })?;

    log::info!("[save_config] Save completed successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_state_new() {
        let state = ConfigState::new();
        let config = state.get_config().unwrap();

        // Should have valid values (may load from global config if it exists)
        assert!(config.execution.max_parallel > 0);
        assert!(config.execution.max_iterations > 0);
    }
}
