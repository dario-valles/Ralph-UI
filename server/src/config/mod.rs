// Layered configuration system

pub mod loader;
pub mod merger;

// Re-export main types
pub use loader::{
    ConfigLoader, RalphConfig, ExecutionConfig, GitConfig,
    ValidationConfig, FallbackSettings, ErrorStrategyConfig,
};
pub use merger::{ConfigMerger, PartialConfig};

use anyhow::Result;
use std::path::Path;

/// Load and merge configuration from all sources
/// Priority: CLI -> Project -> Global -> Defaults
pub fn load_merged_config(
    project_path: Option<&Path>,
    cli_overrides: Option<PartialConfig>,
) -> Result<RalphConfig> {
    let loader = if let Some(path) = project_path {
        ConfigLoader::new().with_project_path(path)
    } else {
        ConfigLoader::new()
    };

    log::info!("[load_merged_config] Global config path: {:?}", loader.global_config_path());
    log::info!("[load_merged_config] Project config path: {:?}", loader.project_config_path());

    let global = match loader.load_global() {
        Ok(Some(cfg)) => {
            log::info!("[load_merged_config] Loaded global config: max_parallel={}, agent_type={}",
                cfg.execution.max_parallel, cfg.execution.agent_type);
            Some(cfg)
        }
        Ok(None) => {
            log::info!("[load_merged_config] No global config file found");
            None
        }
        Err(e) => {
            log::error!("[load_merged_config] Failed to load global config: {}", e);
            None
        }
    };

    let project = match loader.load_project() {
        Ok(Some(cfg)) => {
            log::info!("[load_merged_config] Loaded project config: max_parallel={}", cfg.execution.max_parallel);
            Some(cfg)
        }
        Ok(None) => {
            log::debug!("[load_merged_config] No project config file found");
            None
        }
        Err(e) => {
            log::error!("[load_merged_config] Failed to load project config: {}", e);
            None
        }
    };

    let config = ConfigMerger::new()
        .with_global(global)
        .with_project(project)
        .with_cli(cli_overrides)
        .merge();

    log::info!("[load_merged_config] Final merged config: max_parallel={}, agent_type={}",
        config.execution.max_parallel, config.execution.agent_type);

    Ok(config)
}

/// Get config file paths for debugging
pub fn get_config_paths(project_path: Option<&Path>) -> (Option<std::path::PathBuf>, Option<std::path::PathBuf>) {
    let loader = if let Some(path) = project_path {
        ConfigLoader::new().with_project_path(path)
    } else {
        ConfigLoader::new()
    };

    (
        loader.global_config_path().map(|p| p.to_path_buf()),
        loader.project_config_path().map(|p| p.to_path_buf()),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::merger::PartialExecutionConfig;
    use tempfile::TempDir;
    use std::fs;

    #[test]
    fn test_load_merged_config_defaults() {
        // Note: This test may load a real global config if one exists
        // We just verify the function doesn't error
        let config = load_merged_config(None, None).unwrap();

        // Default or loaded values should be positive
        assert!(config.execution.max_parallel > 0);
        assert!(config.execution.max_iterations > 0);
    }

    #[test]
    fn test_load_merged_config_with_project() {
        let temp_dir = TempDir::new().unwrap();
        let config_dir = temp_dir.path().join(".ralph-ui");
        fs::create_dir_all(&config_dir).unwrap();

        let config_content = r#"
[execution]
max_parallel = 5
"#;
        fs::write(config_dir.join("config.toml"), config_content).unwrap();

        let config = load_merged_config(Some(temp_dir.path()), None).unwrap();
        assert_eq!(config.execution.max_parallel, 5);
    }

    #[test]
    fn test_load_merged_config_with_cli_overrides() {
        let cli = PartialConfig {
            execution: Some(PartialExecutionConfig {
                max_parallel: Some(10),
                ..Default::default()
            }),
            ..Default::default()
        };

        let config = load_merged_config(None, Some(cli)).unwrap();
        assert_eq!(config.execution.max_parallel, 10);
    }
}
