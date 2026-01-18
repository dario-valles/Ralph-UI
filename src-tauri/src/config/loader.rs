// Configuration file loading
#![allow(dead_code)]

use anyhow::{Result, anyhow};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Ralph configuration structure
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct RalphConfig {
    /// Execution settings
    #[serde(default)]
    pub execution: ExecutionConfig,
    /// Git settings
    #[serde(default)]
    pub git: GitConfig,
    /// Validation settings
    #[serde(default)]
    pub validation: ValidationConfig,
    /// Template settings
    #[serde(default)]
    pub templates: TemplateConfig,
    /// Agent fallback settings
    #[serde(default)]
    pub fallback: FallbackSettings,
}

/// Execution configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionConfig {
    /// Maximum parallel agents
    #[serde(rename = "maxParallel", alias = "max_parallel", default = "default_max_parallel")]
    pub max_parallel: i32,
    /// Maximum iterations per agent
    #[serde(rename = "maxIterations", alias = "max_iterations", default = "default_max_iterations")]
    pub max_iterations: i32,
    /// Maximum retries for failed tasks
    #[serde(rename = "maxRetries", alias = "max_retries", default = "default_max_retries")]
    pub max_retries: i32,
    /// Agent type to use
    #[serde(rename = "agentType", alias = "agent_type", default = "default_agent_type")]
    pub agent_type: String,
    /// Scheduling strategy
    #[serde(default = "default_strategy")]
    pub strategy: String,
    /// Dry-run mode: preview execution without actually spawning agents
    #[serde(rename = "dryRun", alias = "dry_run", default)]
    pub dry_run: bool,
    /// Default model to use for agents (e.g., "anthropic/claude-sonnet-4-5")
    #[serde(default)]
    pub model: Option<String>,
}

fn default_max_parallel() -> i32 { 3 }
fn default_max_iterations() -> i32 { 10 }
fn default_max_retries() -> i32 { 3 }
fn default_agent_type() -> String { "claude".to_string() }
fn default_strategy() -> String { "dependency_first".to_string() }

impl Default for ExecutionConfig {
    fn default() -> Self {
        Self {
            max_parallel: default_max_parallel(),
            max_iterations: default_max_iterations(),
            max_retries: default_max_retries(),
            agent_type: default_agent_type(),
            strategy: default_strategy(),
            dry_run: false,
            model: None,
        }
    }
}

/// Git configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitConfig {
    /// Automatically create PRs
    #[serde(rename = "autoCreatePrs", alias = "auto_create_prs", default = "default_true")]
    pub auto_create_prs: bool,
    /// Create draft PRs
    #[serde(rename = "draftPrs", alias = "draft_prs", default)]
    pub draft_prs: bool,
    /// Default branch name pattern
    #[serde(rename = "branchPattern", alias = "branch_pattern", default = "default_branch_pattern")]
    pub branch_pattern: String,
}

fn default_true() -> bool { true }
fn default_branch_pattern() -> String { "task/{task_id}".to_string() }

impl Default for GitConfig {
    fn default() -> Self {
        Self {
            auto_create_prs: default_true(),
            draft_prs: false,
            branch_pattern: default_branch_pattern(),
        }
    }
}

/// Validation configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationConfig {
    /// Run tests after completion
    #[serde(rename = "runTests", alias = "run_tests", default = "default_true")]
    pub run_tests: bool,
    /// Run linter after completion
    #[serde(rename = "runLint", alias = "run_lint", default = "default_true")]
    pub run_lint: bool,
    /// Custom test command
    #[serde(rename = "testCommand", alias = "test_command", default)]
    pub test_command: Option<String>,
    /// Custom lint command
    #[serde(rename = "lintCommand", alias = "lint_command", default)]
    pub lint_command: Option<String>,
}

impl Default for ValidationConfig {
    fn default() -> Self {
        Self {
            run_tests: default_true(),
            run_lint: default_true(),
            test_command: None,
            lint_command: None,
        }
    }
}

/// Template configuration
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct TemplateConfig {
    /// Default template for tasks
    #[serde(rename = "defaultTemplate", alias = "default_template", default)]
    pub default_template: Option<String>,
    /// Custom templates directory
    #[serde(rename = "templatesDir", alias = "templates_dir", default)]
    pub templates_dir: Option<String>,
}

/// Fallback settings for rate limiting
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FallbackSettings {
    /// Enable agent fallback
    #[serde(default = "default_true")]
    pub enabled: bool,
    /// Base backoff in milliseconds
    #[serde(rename = "baseBackoffMs", alias = "base_backoff_ms", default = "default_backoff")]
    pub base_backoff_ms: u64,
    /// Maximum backoff in milliseconds
    #[serde(rename = "maxBackoffMs", alias = "max_backoff_ms", default = "default_max_backoff")]
    pub max_backoff_ms: u64,
    /// Fallback agent type
    #[serde(rename = "fallbackAgent", alias = "fallback_agent", default)]
    pub fallback_agent: Option<String>,
}

fn default_backoff() -> u64 { 5000 }
fn default_max_backoff() -> u64 { 300000 }

impl Default for FallbackSettings {
    fn default() -> Self {
        Self {
            enabled: default_true(),
            base_backoff_ms: default_backoff(),
            max_backoff_ms: default_max_backoff(),
            fallback_agent: None,
        }
    }
}

/// Config loader
pub struct ConfigLoader {
    /// Global config path
    global_path: Option<PathBuf>,
    /// Project config path
    project_path: Option<PathBuf>,
}

impl ConfigLoader {
    /// Create a new config loader
    pub fn new() -> Self {
        Self {
            global_path: Self::get_global_config_path(),
            project_path: None,
        }
    }

    /// Set the project path
    pub fn with_project_path(mut self, path: &Path) -> Self {
        self.project_path = Some(path.join(".ralph-ui").join("config.toml"));
        self
    }

    /// Get the global config path
    fn get_global_config_path() -> Option<PathBuf> {
        dirs::config_dir().map(|p| p.join("ralph-ui").join("config.toml"))
    }

    /// Load global config
    pub fn load_global(&self) -> Result<Option<RalphConfig>> {
        if let Some(ref path) = self.global_path {
            self.load_from_path(path)
        } else {
            Ok(None)
        }
    }

    /// Load project config
    pub fn load_project(&self) -> Result<Option<RalphConfig>> {
        if let Some(ref path) = self.project_path {
            self.load_from_path(path)
        } else {
            Ok(None)
        }
    }

    /// Load config from a specific path
    pub fn load_from_path(&self, path: &Path) -> Result<Option<RalphConfig>> {
        if !path.exists() {
            return Ok(None);
        }

        let contents = fs::read_to_string(path)
            .map_err(|e| anyhow!("Failed to read config file '{}': {}", path.display(), e))?;

        let config: RalphConfig = toml::from_str(&contents)
            .map_err(|e| anyhow!("Failed to parse config file '{}': {}", path.display(), e))?;

        self.validate_config(&config)?;

        Ok(Some(config))
    }

    /// Validate config values
    fn validate_config(&self, config: &RalphConfig) -> Result<()> {
        if config.execution.max_parallel <= 0 {
            return Err(anyhow!("max_parallel must be greater than 0"));
        }

        if config.execution.max_iterations <= 0 {
            return Err(anyhow!("max_iterations must be greater than 0"));
        }

        if config.execution.max_retries < 0 {
            return Err(anyhow!("max_retries cannot be negative"));
        }

        Ok(())
    }

    /// Check if global config exists
    pub fn global_config_exists(&self) -> bool {
        self.global_path.as_ref().map(|p| p.exists()).unwrap_or(false)
    }

    /// Check if project config exists
    pub fn project_config_exists(&self) -> bool {
        self.project_path.as_ref().map(|p| p.exists()).unwrap_or(false)
    }

    /// Get the global config path
    pub fn global_config_path(&self) -> Option<&Path> {
        self.global_path.as_deref()
    }

    /// Get the project config path
    pub fn project_config_path(&self) -> Option<&Path> {
        self.project_path.as_deref()
    }

    /// Save config to global path
    pub fn save_global(&self, config: &RalphConfig) -> Result<()> {
        if let Some(ref path) = self.global_path {
            self.save_to_path(path, config)
        } else {
            Err(anyhow!("No global config path available"))
        }
    }

    /// Save config to project path
    pub fn save_project(&self, config: &RalphConfig) -> Result<()> {
        if let Some(ref path) = self.project_path {
            self.save_to_path(path, config)
        } else {
            Err(anyhow!("No project config path available"))
        }
    }

    /// Save config to a specific path
    pub fn save_to_path(&self, path: &Path, config: &RalphConfig) -> Result<()> {
        // Ensure parent directory exists
        if let Some(parent) = path.parent() {
            if !parent.exists() {
                fs::create_dir_all(parent)
                    .map_err(|e| anyhow!("Failed to create config directory '{}': {}", parent.display(), e))?;
            }
        }

        // Validate before saving
        self.validate_config(config)?;

        // Serialize to TOML
        let contents = toml::to_string_pretty(config)
            .map_err(|e| anyhow!("Failed to serialize config: {}", e))?;

        // Write to file
        fs::write(path, contents)
            .map_err(|e| anyhow!("Failed to write config file '{}': {}", path.display(), e))?;

        log::info!("Saved config to: {}", path.display());
        Ok(())
    }
}

impl Default for ConfigLoader {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_dir() -> TempDir {
        TempDir::new().unwrap()
    }

    #[test]
    fn test_loads_global_config() {
        let temp_dir = create_test_dir();
        let config_dir = temp_dir.path().join("ralph-ui");
        fs::create_dir_all(&config_dir).unwrap();

        let config_content = r#"
[execution]
max_parallel = 5
max_iterations = 15

[git]
auto_create_prs = false
"#;

        fs::write(config_dir.join("config.toml"), config_content).unwrap();

        let loader = ConfigLoader {
            global_path: Some(config_dir.join("config.toml")),
            project_path: None,
        };

        let config = loader.load_global().unwrap().unwrap();
        assert_eq!(config.execution.max_parallel, 5);
        assert_eq!(config.execution.max_iterations, 15);
        assert!(!config.git.auto_create_prs);
    }

    #[test]
    fn test_loads_project_config() {
        let temp_dir = create_test_dir();
        let config_dir = temp_dir.path().join(".ralph-ui");
        fs::create_dir_all(&config_dir).unwrap();

        let config_content = r#"
[execution]
max_parallel = 2

[validation]
run_tests = false
"#;

        fs::write(config_dir.join("config.toml"), config_content).unwrap();

        let loader = ConfigLoader::new().with_project_path(temp_dir.path());

        let config = loader.load_project().unwrap().unwrap();
        assert_eq!(config.execution.max_parallel, 2);
        assert!(!config.validation.run_tests);
    }

    #[test]
    fn test_handles_missing_config_files_gracefully() {
        let temp_dir = create_test_dir();
        let loader = ConfigLoader::new().with_project_path(temp_dir.path());

        // Global may or may not exist depending on system
        let global_result = loader.load_global();
        assert!(global_result.is_ok());

        // Project should not exist
        let project = loader.load_project().unwrap();
        assert!(project.is_none());
    }

    #[test]
    fn test_parses_all_config_fields() {
        let temp_dir = create_test_dir();
        let config_dir = temp_dir.path().join(".ralph-ui");
        fs::create_dir_all(&config_dir).unwrap();

        let config_content = r#"
[execution]
max_parallel = 3
max_iterations = 10
max_retries = 3
agent_type = "claude"
strategy = "priority"

[git]
auto_create_prs = true
draft_prs = false
branch_pattern = "feature/{task_id}"

[validation]
run_tests = true
run_lint = true
test_command = "npm test"

[templates]
default_template = "task_prompt"

[fallback]
enabled = true
base_backoff_ms = 5000
max_backoff_ms = 300000
"#;

        fs::write(config_dir.join("config.toml"), config_content).unwrap();

        let loader = ConfigLoader::new().with_project_path(temp_dir.path());
        let config = loader.load_project().unwrap().unwrap();

        assert_eq!(config.execution.agent_type, "claude");
        assert_eq!(config.git.branch_pattern, "feature/{task_id}");
        assert_eq!(config.validation.test_command, Some("npm test".to_string()));
        assert_eq!(config.templates.default_template, Some("task_prompt".to_string()));
        assert!(config.fallback.enabled);
    }

    #[test]
    fn test_validates_max_parallel_greater_than_zero() {
        let temp_dir = create_test_dir();
        let config_dir = temp_dir.path().join(".ralph-ui");
        fs::create_dir_all(&config_dir).unwrap();

        let config_content = r#"
[execution]
max_parallel = 0
"#;

        fs::write(config_dir.join("config.toml"), config_content).unwrap();

        let loader = ConfigLoader::new().with_project_path(temp_dir.path());
        let result = loader.load_project();

        assert!(result.is_err());
    }

    #[test]
    fn test_default_config_values() {
        let config = RalphConfig::default();

        assert_eq!(config.execution.max_parallel, 3);
        assert_eq!(config.execution.max_iterations, 10);
        assert!(config.git.auto_create_prs);
        assert!(config.validation.run_tests);
        assert!(config.fallback.enabled);
    }
}
