//! Config operations: get, set, init, update

use crate::ralph_loop::RalphConfig;
use crate::utils::{ralph_ui_dir, to_path_buf};

// ============================================================================
// Config Operations
// ============================================================================

/// Get Ralph config for a project
pub fn get_ralph_config(project_path: String) -> Result<RalphConfig, String> {
    use crate::ralph_loop::ConfigManager;

    let config_manager = ConfigManager::new(&to_path_buf(&project_path));
    config_manager.read()
}

/// Set Ralph config for a project
pub fn set_ralph_config(project_path: String, config: RalphConfig) -> Result<(), String> {
    use crate::ralph_loop::ConfigManager;

    let config_manager = ConfigManager::new(&to_path_buf(&project_path));
    config_manager.write(&config)
}

/// Initialize Ralph config with defaults
pub fn init_ralph_config(project_path: String) -> Result<RalphConfig, String> {
    use crate::ralph_loop::ConfigManager;

    let ralph_ui_path = ralph_ui_dir(&project_path);
    std::fs::create_dir_all(&ralph_ui_path)
        .map_err(|e| format!("Failed to create .ralph-ui directory: {}", e))?;

    let config_manager = ConfigManager::new(&to_path_buf(&project_path));
    config_manager.initialize()
}

/// Update specific Ralph config fields
pub fn update_ralph_config(
    project_path: String,
    max_iterations: Option<u32>,
    max_cost: Option<f64>,
    agent: Option<String>,
    model: Option<String>,
    test_command: Option<String>,
    lint_command: Option<String>,
    build_command: Option<String>,
) -> Result<RalphConfig, String> {
    use crate::ralph_loop::ConfigManager;

    let config_manager = ConfigManager::new(&to_path_buf(&project_path));

    config_manager.update(|config| {
        if let Some(v) = max_iterations {
            config.ralph.max_iterations = v;
        }
        if max_cost.is_some() {
            config.ralph.max_cost = max_cost;
        }
        if let Some(v) = agent {
            config.ralph.agent = v;
        }
        if model.is_some() {
            config.ralph.model = model;
        }
        if test_command.is_some() {
            config.project.test_command = test_command;
        }
        if lint_command.is_some() {
            config.project.lint_command = lint_command;
        }
        if build_command.is_some() {
            config.project.build_command = build_command;
        }
    })
}
