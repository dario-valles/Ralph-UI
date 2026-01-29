// Configuration merging with priority

use crate::config::loader::{
    ErrorStrategyConfig, ExecutionConfig, FallbackSettings, GitConfig, RalphConfig, TemplateConfig,
    ValidationConfig,
};
use serde::{Deserialize, Serialize};

/// Partial configuration for merging
/// Uses Option<T> for all fields to support partial overrides
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PartialConfig {
    #[serde(default)]
    pub execution: Option<PartialExecutionConfig>,
    #[serde(default)]
    pub git: Option<PartialGitConfig>,
    #[serde(default)]
    pub validation: Option<PartialValidationConfig>,
    #[serde(default)]
    pub templates: Option<PartialTemplateConfig>,
    #[serde(default)]
    pub fallback: Option<PartialFallbackSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PartialExecutionConfig {
    pub max_parallel: Option<i32>,
    pub max_iterations: Option<i32>,
    pub max_retries: Option<i32>,
    pub agent_type: Option<String>,
    pub strategy: Option<String>,
    pub dry_run: Option<bool>,
    pub model: Option<String>,
    pub api_provider: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PartialGitConfig {
    pub auto_create_prs: Option<bool>,
    pub draft_prs: Option<bool>,
    pub branch_pattern: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PartialValidationConfig {
    pub run_tests: Option<bool>,
    pub run_lint: Option<bool>,
    pub test_command: Option<String>,
    pub lint_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PartialTemplateConfig {
    pub default_template: Option<String>,
    pub templates_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PartialFallbackSettings {
    pub enabled: Option<bool>,
    pub base_backoff_ms: Option<u64>,
    pub max_backoff_ms: Option<u64>,
    pub fallback_model: Option<String>,
    pub fallback_api_provider: Option<String>,
    pub error_strategy: Option<ErrorStrategyConfig>,
    pub fallback_chain: Option<Vec<String>>,
    pub test_primary_recovery: Option<bool>,
    pub recovery_test_interval: Option<u32>,
    /// DEPRECATED: Use fallback_chain instead. Kept for backward compatibility.
    #[serde(default, skip_serializing)]
    #[deprecated(note = "Use fallback_chain instead")]
    pub fallback_agent: Option<String>,
}

/// Configuration merger
/// Priority order: CLI -> Project -> Global -> Defaults
pub struct ConfigMerger {
    defaults: RalphConfig,
    global: Option<RalphConfig>,
    project: Option<RalphConfig>,
    cli: Option<PartialConfig>,
}

impl ConfigMerger {
    /// Create a new config merger with defaults
    pub fn new() -> Self {
        Self {
            defaults: RalphConfig::default(),
            global: None,
            project: None,
            cli: None,
        }
    }

    /// Set global config
    pub fn with_global(mut self, config: Option<RalphConfig>) -> Self {
        self.global = config;
        self
    }

    /// Set project config
    pub fn with_project(mut self, config: Option<RalphConfig>) -> Self {
        self.project = config;
        self
    }

    /// Set CLI overrides
    pub fn with_cli(mut self, config: Option<PartialConfig>) -> Self {
        self.cli = config;
        self
    }

    /// Merge all configs with priority
    pub fn merge(&self) -> RalphConfig {
        let mut result = self.defaults.clone();

        // Apply global config
        if let Some(ref global) = self.global {
            result = self.merge_full(&result, global);
        }

        // Apply project config (overrides global)
        if let Some(ref project) = self.project {
            result = self.merge_full(&result, project);
        }

        // Apply CLI overrides (highest priority)
        if let Some(ref cli) = self.cli {
            result = self.merge_partial(&result, cli);
        }

        result
    }

    /// Merge two full configs
    fn merge_full(&self, base: &RalphConfig, override_config: &RalphConfig) -> RalphConfig {
        RalphConfig {
            execution: self.merge_execution(&base.execution, &override_config.execution),
            git: self.merge_git(&base.git, &override_config.git),
            validation: self.merge_validation(&base.validation, &override_config.validation),
            templates: self.merge_templates(&base.templates, &override_config.templates),
            fallback: self.merge_fallback(&base.fallback, &override_config.fallback),
        }
    }

    /// Merge partial config into full config
    fn merge_partial(&self, base: &RalphConfig, partial: &PartialConfig) -> RalphConfig {
        RalphConfig {
            execution: partial
                .execution
                .as_ref()
                .map(|p| self.merge_partial_execution(&base.execution, p))
                .unwrap_or_else(|| base.execution.clone()),
            git: partial
                .git
                .as_ref()
                .map(|p| self.merge_partial_git(&base.git, p))
                .unwrap_or_else(|| base.git.clone()),
            validation: partial
                .validation
                .as_ref()
                .map(|p| self.merge_partial_validation(&base.validation, p))
                .unwrap_or_else(|| base.validation.clone()),
            templates: partial
                .templates
                .as_ref()
                .map(|p| self.merge_partial_templates(&base.templates, p))
                .unwrap_or_else(|| base.templates.clone()),
            fallback: partial
                .fallback
                .as_ref()
                .map(|p| self.merge_partial_fallback(&base.fallback, p))
                .unwrap_or_else(|| base.fallback.clone()),
        }
    }

    // Full config mergers

    fn merge_execution(&self, base: &ExecutionConfig, over: &ExecutionConfig) -> ExecutionConfig {
        ExecutionConfig {
            max_parallel: over.max_parallel,
            max_iterations: over.max_iterations,
            max_retries: over.max_retries,
            agent_type: over.agent_type.clone(),
            strategy: over.strategy.clone(),
            dry_run: over.dry_run,
            model: over.model.clone().or_else(|| base.model.clone()),
            api_provider: over
                .api_provider
                .clone()
                .or_else(|| base.api_provider.clone()),
        }
    }

    fn merge_git(&self, _base: &GitConfig, over: &GitConfig) -> GitConfig {
        GitConfig {
            auto_create_prs: over.auto_create_prs,
            draft_prs: over.draft_prs,
            branch_pattern: over.branch_pattern.clone(),
        }
    }

    fn merge_validation(
        &self,
        base: &ValidationConfig,
        over: &ValidationConfig,
    ) -> ValidationConfig {
        ValidationConfig {
            run_tests: over.run_tests,
            run_lint: over.run_lint,
            test_command: over
                .test_command
                .clone()
                .or_else(|| base.test_command.clone()),
            lint_command: over
                .lint_command
                .clone()
                .or_else(|| base.lint_command.clone()),
        }
    }

    fn merge_templates(&self, base: &TemplateConfig, over: &TemplateConfig) -> TemplateConfig {
        TemplateConfig {
            default_template: over
                .default_template
                .clone()
                .or_else(|| base.default_template.clone()),
            templates_dir: over
                .templates_dir
                .clone()
                .or_else(|| base.templates_dir.clone()),
        }
    }

    #[allow(deprecated)]
    fn merge_fallback(&self, base: &FallbackSettings, over: &FallbackSettings) -> FallbackSettings {
        FallbackSettings {
            enabled: over.enabled,
            base_backoff_ms: over.base_backoff_ms,
            max_backoff_ms: over.max_backoff_ms,
            fallback_model: over
                .fallback_model
                .clone()
                .or_else(|| base.fallback_model.clone()),
            fallback_api_provider: over
                .fallback_api_provider
                .clone()
                .or_else(|| base.fallback_api_provider.clone()),
            error_strategy: over
                .error_strategy
                .clone()
                .or_else(|| base.error_strategy.clone()),
            fallback_chain: over
                .fallback_chain
                .clone()
                .or_else(|| base.fallback_chain.clone()),
            test_primary_recovery: over.test_primary_recovery.or(base.test_primary_recovery),
            recovery_test_interval: over.recovery_test_interval.or(base.recovery_test_interval),
            // Deprecated field: prefer fallback_chain, but preserve for backward compat
            fallback_agent: over
                .fallback_agent
                .clone()
                .or_else(|| base.fallback_agent.clone()),
        }
    }

    // Partial config mergers

    fn merge_partial_execution(
        &self,
        base: &ExecutionConfig,
        partial: &PartialExecutionConfig,
    ) -> ExecutionConfig {
        ExecutionConfig {
            max_parallel: partial.max_parallel.unwrap_or(base.max_parallel),
            max_iterations: partial.max_iterations.unwrap_or(base.max_iterations),
            max_retries: partial.max_retries.unwrap_or(base.max_retries),
            agent_type: partial
                .agent_type
                .clone()
                .unwrap_or_else(|| base.agent_type.clone()),
            strategy: partial
                .strategy
                .clone()
                .unwrap_or_else(|| base.strategy.clone()),
            dry_run: partial.dry_run.unwrap_or(base.dry_run),
            model: partial.model.clone().or_else(|| base.model.clone()),
            api_provider: partial
                .api_provider
                .clone()
                .or_else(|| base.api_provider.clone()),
        }
    }

    fn merge_partial_git(&self, base: &GitConfig, partial: &PartialGitConfig) -> GitConfig {
        GitConfig {
            auto_create_prs: partial.auto_create_prs.unwrap_or(base.auto_create_prs),
            draft_prs: partial.draft_prs.unwrap_or(base.draft_prs),
            branch_pattern: partial
                .branch_pattern
                .clone()
                .unwrap_or_else(|| base.branch_pattern.clone()),
        }
    }

    fn merge_partial_validation(
        &self,
        base: &ValidationConfig,
        partial: &PartialValidationConfig,
    ) -> ValidationConfig {
        ValidationConfig {
            run_tests: partial.run_tests.unwrap_or(base.run_tests),
            run_lint: partial.run_lint.unwrap_or(base.run_lint),
            test_command: partial
                .test_command
                .clone()
                .or_else(|| base.test_command.clone()),
            lint_command: partial
                .lint_command
                .clone()
                .or_else(|| base.lint_command.clone()),
        }
    }

    fn merge_partial_templates(
        &self,
        base: &TemplateConfig,
        partial: &PartialTemplateConfig,
    ) -> TemplateConfig {
        TemplateConfig {
            default_template: partial
                .default_template
                .clone()
                .or_else(|| base.default_template.clone()),
            templates_dir: partial
                .templates_dir
                .clone()
                .or_else(|| base.templates_dir.clone()),
        }
    }

    #[allow(deprecated)]
    fn merge_partial_fallback(
        &self,
        base: &FallbackSettings,
        partial: &PartialFallbackSettings,
    ) -> FallbackSettings {
        FallbackSettings {
            enabled: partial.enabled.unwrap_or(base.enabled),
            base_backoff_ms: partial.base_backoff_ms.unwrap_or(base.base_backoff_ms),
            max_backoff_ms: partial.max_backoff_ms.unwrap_or(base.max_backoff_ms),
            fallback_model: partial
                .fallback_model
                .clone()
                .or_else(|| base.fallback_model.clone()),
            fallback_api_provider: partial
                .fallback_api_provider
                .clone()
                .or_else(|| base.fallback_api_provider.clone()),
            error_strategy: partial
                .error_strategy
                .clone()
                .or_else(|| base.error_strategy.clone()),
            fallback_chain: partial
                .fallback_chain
                .clone()
                .or_else(|| base.fallback_chain.clone()),
            test_primary_recovery: partial.test_primary_recovery.or(base.test_primary_recovery),
            recovery_test_interval: partial
                .recovery_test_interval
                .or(base.recovery_test_interval),
            // Deprecated field: prefer fallback_chain, but preserve for backward compat
            fallback_agent: partial
                .fallback_agent
                .clone()
                .or_else(|| base.fallback_agent.clone()),
        }
    }
}

impl Default for ConfigMerger {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_global_config() -> RalphConfig {
        RalphConfig {
            execution: ExecutionConfig {
                max_parallel: 5,
                max_iterations: 10,
                max_retries: 3,
                agent_type: "claude".to_string(),
                strategy: "priority".to_string(),
                dry_run: false,
                model: None,
                api_provider: None,
            },
            git: GitConfig {
                auto_create_prs: true,
                draft_prs: false,
                branch_pattern: "task/{task_id}".to_string(),
            },
            ..Default::default()
        }
    }

    fn create_project_config() -> RalphConfig {
        RalphConfig {
            execution: ExecutionConfig {
                max_parallel: 2,
                max_iterations: 15,
                max_retries: 5,
                agent_type: "opencode".to_string(),
                strategy: "fifo".to_string(),
                dry_run: false,
                model: Some("anthropic/claude-sonnet-4-5".to_string()),
                api_provider: None,
            },
            ..Default::default()
        }
    }

    #[test]
    fn test_cli_overrides_project_config() {
        let global = create_global_config();
        let project = create_project_config();
        let cli = PartialConfig {
            execution: Some(PartialExecutionConfig {
                max_parallel: Some(1),
                ..Default::default()
            }),
            ..Default::default()
        };

        let merger = ConfigMerger::new()
            .with_global(Some(global))
            .with_project(Some(project))
            .with_cli(Some(cli));

        let result = merger.merge();

        assert_eq!(result.execution.max_parallel, 1); // CLI wins
        assert_eq!(result.execution.max_iterations, 15); // Project wins
        assert_eq!(result.execution.agent_type, "opencode"); // Project wins
    }

    #[test]
    fn test_project_overrides_global_config() {
        let global = create_global_config();
        let project = create_project_config();

        let merger = ConfigMerger::new()
            .with_global(Some(global))
            .with_project(Some(project));

        let result = merger.merge();

        assert_eq!(result.execution.max_parallel, 2); // Project wins
        assert_eq!(result.execution.max_iterations, 15); // Project wins
    }

    #[test]
    fn test_global_overrides_defaults() {
        let global = create_global_config();

        let merger = ConfigMerger::new().with_global(Some(global));

        let result = merger.merge();

        assert_eq!(result.execution.max_parallel, 5); // Global wins
        assert_eq!(result.execution.strategy, "priority"); // Global wins
    }

    #[test]
    fn test_partial_configs_merge_correctly() {
        let cli = PartialConfig {
            execution: Some(PartialExecutionConfig {
                max_parallel: Some(4),
                // Other fields not set
                ..Default::default()
            }),
            ..Default::default()
        };

        let merger = ConfigMerger::new().with_cli(Some(cli));

        let result = merger.merge();

        assert_eq!(result.execution.max_parallel, 4); // CLI value
        assert_eq!(result.execution.max_iterations, 10); // Default value
    }

    #[test]
    fn test_returns_defaults_when_no_configs_exist() {
        let merger = ConfigMerger::new();
        let result = merger.merge();

        assert_eq!(result.execution.max_parallel, 3);
        assert_eq!(result.execution.max_iterations, 10);
        assert!(result.git.auto_create_prs);
    }

    #[test]
    fn test_option_fields_merge_correctly() {
        let global = RalphConfig {
            validation: ValidationConfig {
                test_command: Some("npm test".to_string()),
                ..Default::default()
            },
            ..Default::default()
        };

        let project = RalphConfig {
            validation: ValidationConfig {
                lint_command: Some("npm run lint".to_string()),
                ..Default::default()
            },
            ..Default::default()
        };

        let merger = ConfigMerger::new()
            .with_global(Some(global))
            .with_project(Some(project));

        let result = merger.merge();

        // test_command from global is preserved (project didn't override it)
        // lint_command from project wins
        assert_eq!(
            result.validation.lint_command,
            Some("npm run lint".to_string())
        );
    }

    #[test]
    fn test_priority_chain() {
        // Priority: CLI > Project > Global > Defaults
        let global = RalphConfig {
            execution: ExecutionConfig {
                max_parallel: 5,
                max_iterations: 20,
                max_retries: 2,
                agent_type: "claude".to_string(),
                strategy: "priority".to_string(),
                dry_run: false,
                model: None,
                api_provider: None,
            },
            ..Default::default()
        };

        let project = RalphConfig {
            execution: ExecutionConfig {
                max_parallel: 3,
                max_iterations: 15,
                max_retries: 3,
                agent_type: "opencode".to_string(),
                strategy: "fifo".to_string(),
                dry_run: false,
                model: Some("anthropic/claude-sonnet-4-5".to_string()),
                api_provider: None,
            },
            ..Default::default()
        };

        let cli = PartialConfig {
            execution: Some(PartialExecutionConfig {
                max_parallel: Some(1),
                max_iterations: Some(5),
                ..Default::default()
            }),
            ..Default::default()
        };

        let merger = ConfigMerger::new()
            .with_global(Some(global))
            .with_project(Some(project))
            .with_cli(Some(cli));

        let result = merger.merge();

        assert_eq!(result.execution.max_parallel, 1); // CLI
        assert_eq!(result.execution.max_iterations, 5); // CLI
        assert_eq!(result.execution.max_retries, 3); // Project
        assert_eq!(result.execution.agent_type, "opencode"); // Project
        assert_eq!(result.execution.strategy, "fifo"); // Project
    }
}
