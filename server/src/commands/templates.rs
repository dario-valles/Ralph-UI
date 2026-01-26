// Template Backend commands

use crate::templates::{
    builtin::get_builtin_templates,
    engine::{DependencyContext, TaskContext, TemplateContext, TemplateEngine},
    resolver::{TemplateResolver, TemplateSource},
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Template info for frontend
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    pub name: String,
    pub source: String,
    pub description: String,
}

/// Template render request
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RenderRequest {
    pub template_name: String,
    pub task_title: Option<String>,
    pub task_description: Option<String>,
    pub acceptance_criteria: Option<Vec<String>>,
    pub dependencies: Option<Vec<String>>,
    pub prd_content: Option<String>,
    pub custom_vars: Option<HashMap<String, String>>,
    /// Project path for resolving @filename references
    pub project_path: Option<String>,
}

/// List all available templates

pub async fn list_templates(project_path: Option<String>) -> Result<Vec<TemplateInfo>, String> {
    let resolver = if let Some(path) = project_path {
        TemplateResolver::new().with_project_path(std::path::Path::new(&path))
    } else {
        TemplateResolver::new()
    };

    let templates = resolver.list_all();

    Ok(templates
        .into_iter()
        .map(|(name, source)| {
            let description = match source {
                TemplateSource::Project => "Project template (.ralph-ui/templates/)".to_string(),
                TemplateSource::Global => "Global template (~/.ralph-ui/templates/)".to_string(),
                TemplateSource::Builtin => "Built-in template".to_string(),
            };

            TemplateInfo {
                name,
                source: format!("{:?}", source).to_lowercase(),
                description,
            }
        })
        .collect())
}

/// Get builtin template names

pub async fn list_builtin_templates() -> Result<Vec<String>, String> {
    Ok(get_builtin_templates().keys().cloned().collect())
}

/// Render a template with context

pub async fn render_template(request: RenderRequest) -> Result<String, String> {
    let engine = TemplateEngine::new();

    // Build context using builder pattern
    let mut context = TemplateContext::new();

    // Add task context if title/description provided
    if request.task_title.is_some() || request.task_description.is_some() {
        context.task = Some(TaskContext {
            id: "".to_string(),
            title: request.task_title.unwrap_or_default(),
            description: request.task_description.unwrap_or_default(),
            status: "pending".to_string(),
            priority: 0,
            branch: None,
            worktree_path: None,
        });
    }

    if let Some(criteria) = request.acceptance_criteria {
        context.acceptance_criteria = criteria;
    }

    if let Some(deps) = request.dependencies {
        context.dependencies = deps
            .into_iter()
            .map(|d| DependencyContext {
                id: "".to_string(),
                title: d,
                status: "completed".to_string(),
            })
            .collect();
    }

    if let Some(prd) = request.prd_content {
        context.prd_content = Some(prd);
    }

    if let Some(vars) = request.custom_vars {
        context.custom = vars;
    }

    // Get template content
    let builtin_templates = get_builtin_templates();
    let template_content = builtin_templates
        .get(&request.template_name)
        .ok_or_else(|| format!("Template '{}' not found", request.template_name))?;

    // Render the template
    let rendered = engine
        .render_string(template_content, &context)
        .map_err(|e| format!("Failed to render template: {}", e))?;

    // Resolve @filename references if project_path is provided
    if let Some(path) = request.project_path {
        let base_path = std::path::Path::new(&path);
        Ok(engine.resolve_file_references(&rendered, base_path))
    } else {
        Ok(rendered)
    }
}

/// Get template content by name

pub async fn get_template_content(
    name: String,
    project_path: Option<String>,
) -> Result<String, String> {
    let mut resolver = if let Some(path) = project_path {
        TemplateResolver::new().with_project_path(std::path::Path::new(&path))
    } else {
        TemplateResolver::new()
    };

    let template = resolver
        .resolve(&name)
        .map_err(|e| format!("Failed to get template: {}", e))?;

    Ok(template.content)
}

/// Save a template to project or global location
///
/// - If project_path is provided, saves to {project_path}/.ralph-ui/templates/{name}.tera
/// - Otherwise saves to ~/.ralph-ui/templates/{name}.tera
/// - Cannot save to builtin templates (read-only)

pub async fn save_template(
    name: String,
    content: String,
    scope: String,
    project_path: Option<String>,
) -> Result<(), String> {
    use std::fs;
    use std::path::PathBuf;

    // Determine target directory based on scope
    let template_dir: PathBuf = match scope.as_str() {
        "project" => {
            let project =
                project_path.ok_or("Project path required for project-scoped template")?;
            PathBuf::from(&project).join(".ralph-ui").join("templates")
        }
        "global" => dirs::home_dir()
            .ok_or("Could not determine home directory")?
            .join(".ralph-ui")
            .join("templates"),
        "builtin" => {
            return Err("Cannot save to builtin templates (read-only)".to_string());
        }
        _ => {
            return Err(format!(
                "Invalid scope '{}'. Use 'project' or 'global'",
                scope
            ));
        }
    };

    // Create directory if it doesn't exist
    fs::create_dir_all(&template_dir)
        .map_err(|e| format!("Failed to create template directory: {}", e))?;

    // Write template file with .tera extension
    let template_path = template_dir.join(format!("{}.tera", name));
    fs::write(&template_path, &content).map_err(|e| format!("Failed to write template: {}", e))?;

    log::info!("Saved template '{}' to {:?}", name, template_path);

    Ok(())
}

/// Template preview result (US-013)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplatePreviewResult {
    /// Whether the template rendered successfully
    pub success: bool,
    /// The rendered output (if successful)
    pub output: Option<String>,
    /// Syntax error message (if failed)
    pub error: Option<String>,
    /// Line number where error occurred (if available)
    pub error_line: Option<usize>,
    /// List of variables used in the template
    pub variables_used: Vec<String>,
    /// List of variables available but not used
    pub variables_unused: Vec<String>,
    /// Sample context that was used for rendering
    pub sample_context: SampleContext,
}

/// Sample context data used for preview
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SampleContext {
    pub task_title: String,
    pub task_description: String,
    pub acceptance_criteria: Vec<String>,
    pub dependencies: Vec<String>,
    pub prd_content: String,
    pub recent_progress: String,
    pub codebase_patterns: String,
    pub prd_completed_count: i32,
    pub prd_total_count: i32,
    pub selection_reason: String,
    pub current_date: String,
    pub timestamp: String,
}

impl Default for SampleContext {
    fn default() -> Self {
        Self {
            task_title: "Implement user authentication".to_string(),
            task_description: "Add JWT-based authentication to the API endpoints with refresh token support.".to_string(),
            acceptance_criteria: vec![
                "Users can login with email and password".to_string(),
                "JWT tokens are issued on successful login".to_string(),
                "Refresh tokens extend session without re-login".to_string(),
            ],
            dependencies: vec![
                "Setup database schema".to_string(),
                "Configure environment variables".to_string(),
            ],
            prd_content: "# Authentication PRD\n\nThis document outlines the authentication requirements...".to_string(),
            recent_progress: "[2026-01-22] [Iter 1] Completed database schema setup\n[2026-01-22] [Iter 2] Added user model".to_string(),
            codebase_patterns: "## Patterns\n- Use Zustand for state management\n- Follow CLAUDE.md guidelines".to_string(),
            prd_completed_count: 3,
            prd_total_count: 10,
            selection_reason: "Highest priority with satisfied dependencies".to_string(),
            current_date: chrono::Utc::now().format("%Y-%m-%d").to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
        }
    }
}

/// Extract variable names from template content using regex
fn extract_template_variables(content: &str) -> Vec<String> {
    use regex::Regex;
    use std::collections::HashSet;

    let mut variables = HashSet::new();

    // Match {{ variable }} patterns - capture the variable name
    // Handles: {{ var }}, {{ var.field }}, {{ var | filter }}, {{ var.field | filter }}
    let var_pattern =
        Regex::new(r"\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)?)").unwrap();

    for cap in var_pattern.captures_iter(content) {
        if let Some(var) = cap.get(1) {
            // Get the base variable name (before any dot)
            let var_name = var.as_str().split('.').next().unwrap_or(var.as_str());
            variables.insert(var_name.to_string());
        }
    }

    // Match {% for item in collection %} patterns
    let for_pattern = Regex::new(r"\{%\s*for\s+\w+\s+in\s+([a-zA-Z_][a-zA-Z0-9_]*)").unwrap();
    for cap in for_pattern.captures_iter(content) {
        if let Some(var) = cap.get(1) {
            variables.insert(var.as_str().to_string());
        }
    }

    // Match {% if variable %} patterns
    let if_pattern = Regex::new(r"\{%\s*if\s+([a-zA-Z_][a-zA-Z0-9_]*)").unwrap();
    for cap in if_pattern.captures_iter(content) {
        if let Some(var) = cap.get(1) {
            variables.insert(var.as_str().to_string());
        }
    }

    let mut result: Vec<String> = variables.into_iter().collect();
    result.sort();
    result
}

/// Get list of all available template context variables
fn get_available_variables() -> Vec<String> {
    vec![
        "task".to_string(),
        "session".to_string(),
        "acceptance_criteria".to_string(),
        "dependencies".to_string(),
        "prd_content".to_string(),
        "recent_progress".to_string(),
        "codebase_patterns".to_string(),
        "prd_completed_count".to_string(),
        "prd_total_count".to_string(),
        "selection_reason".to_string(),
        "current_date".to_string(),
        "timestamp".to_string(),
    ]
}

/// Preview a template with sample context (US-013)
///
/// Renders the template content with sample data and returns:
/// - The rendered output (if successful)
/// - Syntax errors with line numbers (if failed)
/// - List of variables used/unused for highlighting

pub async fn preview_template(
    content: String,
    project_path: Option<String>,
) -> Result<TemplatePreviewResult, String> {
    let engine = TemplateEngine::new();
    let sample = SampleContext::default();

    // Build context with sample data
    let mut context = TemplateContext::new()
        .with_acceptance_criteria(sample.acceptance_criteria.clone())
        .with_dependencies(
            sample
                .dependencies
                .iter()
                .map(|d| DependencyContext {
                    id: "dep-1".to_string(),
                    title: d.clone(),
                    status: "completed".to_string(),
                })
                .collect(),
        )
        .with_prd(&sample.prd_content)
        .with_recent_progress(&sample.recent_progress)
        .with_codebase_patterns(&sample.codebase_patterns)
        .with_prd_counts(sample.prd_completed_count, sample.prd_total_count)
        .with_selection_reason(&sample.selection_reason);

    // Set task context (required for {{ task.title }} etc.)
    context.task = Some(TaskContext {
        id: "task-sample-001".to_string(),
        title: sample.task_title.clone(),
        description: sample.task_description.clone(),
        status: "pending".to_string(),
        priority: 1,
        branch: Some("feature/auth".to_string()),
        worktree_path: Some("/path/to/worktree".to_string()),
    });

    // Extract variables used in the template
    let variables_used = extract_template_variables(&content);

    // Calculate unused variables
    let available = get_available_variables();
    let variables_unused: Vec<String> = available
        .into_iter()
        .filter(|v| !variables_used.contains(v))
        .collect();

    // Try to render the template
    match engine.render_string(&content, &context) {
        Ok(mut rendered) => {
            // Resolve @filename references if project_path is provided
            if let Some(path) = project_path {
                let base_path = std::path::Path::new(&path);
                rendered = engine.resolve_file_references(&rendered, base_path);
            }

            Ok(TemplatePreviewResult {
                success: true,
                output: Some(rendered),
                error: None,
                error_line: None,
                variables_used,
                variables_unused,
                sample_context: sample,
            })
        }
        Err(e) => {
            // Parse error message to extract line number if available
            // Tera errors often contain "on line X" or "at line X"
            let error_msg = e.to_string();
            let error_line = extract_error_line(&error_msg);

            Ok(TemplatePreviewResult {
                success: false,
                output: None,
                error: Some(error_msg),
                error_line,
                variables_used,
                variables_unused,
                sample_context: sample,
            })
        }
    }
}

/// Extract line number from Tera error message
fn extract_error_line(error_msg: &str) -> Option<usize> {
    use regex::Regex;

    // Tera error format: "... on line X" or "... at line X" or "line X"
    let patterns = [
        Regex::new(r"(?:on|at)\s+line\s+(\d+)").ok()?,
        Regex::new(r"line\s+(\d+)").ok()?,
    ];

    for pattern in patterns.iter() {
        if let Some(cap) = pattern.captures(error_msg) {
            if let Some(line_match) = cap.get(1) {
                if let Ok(line) = line_match.as_str().parse::<usize>() {
                    return Some(line);
                }
            }
        }
    }

    None
}

/// Delete a template from project or global location
///
/// - If project_path is provided, deletes from {project_path}/.ralph-ui/templates/{name}.tera
/// - Otherwise deletes from ~/.ralph-ui/templates/{name}.tera
/// - Cannot delete builtin templates (read-only)

pub async fn delete_template(
    name: String,
    scope: String,
    project_path: Option<String>,
) -> Result<(), String> {
    use std::fs;
    use std::path::PathBuf;

    // Determine target directory based on scope
    let template_path: PathBuf = match scope.as_str() {
        "project" => {
            let project =
                project_path.ok_or("Project path required for project-scoped template")?;
            PathBuf::from(&project)
                .join(".ralph-ui")
                .join("templates")
                .join(format!("{}.tera", name))
        }
        "global" => dirs::home_dir()
            .ok_or("Could not determine home directory")?
            .join(".ralph-ui")
            .join("templates")
            .join(format!("{}.tera", name)),
        "builtin" => {
            return Err("Cannot delete builtin templates (read-only)".to_string());
        }
        _ => {
            return Err(format!(
                "Invalid scope '{}'. Use 'project' or 'global'",
                scope
            ));
        }
    };

    // Check if file exists
    if !template_path.exists() {
        return Err(format!(
            "Template '{}' not found at {:?}",
            name, template_path
        ));
    }

    // Delete the file
    fs::remove_file(&template_path).map_err(|e| format!("Failed to delete template: {}", e))?;

    log::info!("Deleted template '{}' from {:?}", name, template_path);

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_list_builtin_templates() {
        let templates = list_builtin_templates().await.unwrap();
        assert!(templates.contains(&"task_prompt".to_string()));
        assert!(templates.contains(&"bug_fix".to_string()));
    }

    #[tokio::test]
    async fn test_render_template() {
        let request = RenderRequest {
            template_name: "task_prompt".to_string(),
            task_title: Some("Test Task".to_string()),
            task_description: Some("Test description".to_string()),
            acceptance_criteria: Some(vec!["Criterion 1".to_string()]),
            dependencies: None,
            prd_content: None,
            custom_vars: None,
            project_path: None,
        };

        let result = render_template(request).await.unwrap();
        assert!(result.contains("Test Task"));
        assert!(result.contains("Test description"));
    }

    // Template Preview Tests (US-013)

    #[tokio::test]
    async fn test_preview_template_success() {
        let content = "Task: {{ task.title }}\nDescription: {{ task.description }}".to_string();
        let result = preview_template(content, None).await.unwrap();

        assert!(result.success);
        assert!(result.output.is_some());
        assert!(result.error.is_none());
        assert!(result.error_line.is_none());

        let output = result.output.unwrap();
        assert!(output.contains("Implement user authentication"));
        assert!(output.contains("JWT-based authentication"));
    }

    #[tokio::test]
    async fn test_preview_template_syntax_error() {
        // Invalid Tera syntax - unclosed tag
        let content = "{{ task.title }}\n{% if true %}\nMissing endif".to_string();
        let result = preview_template(content, None).await.unwrap();

        assert!(!result.success);
        assert!(result.output.is_none());
        assert!(result.error.is_some());
        // Error message should mention the syntax issue
        let error = result.error.unwrap();
        assert!(error.len() > 0);
    }

    #[tokio::test]
    async fn test_preview_template_variables_used() {
        let content =
            "{{ task.title }} - {{ acceptance_criteria }} - {{ current_date }}".to_string();
        let result = preview_template(content, None).await.unwrap();

        assert!(result.success);
        assert!(result.variables_used.contains(&"task".to_string()));
        assert!(result
            .variables_used
            .contains(&"acceptance_criteria".to_string()));
        assert!(result.variables_used.contains(&"current_date".to_string()));
    }

    #[tokio::test]
    async fn test_preview_template_variables_unused() {
        // Only use task variable, others should be unused
        let content = "{{ task.title }}".to_string();
        let result = preview_template(content, None).await.unwrap();

        assert!(result.success);
        assert!(result.variables_used.contains(&"task".to_string()));
        // These should be in unused list
        assert!(result
            .variables_unused
            .contains(&"acceptance_criteria".to_string()));
        assert!(result.variables_unused.contains(&"prd_content".to_string()));
        assert!(result
            .variables_unused
            .contains(&"recent_progress".to_string()));
    }

    #[tokio::test]
    async fn test_preview_template_sample_context() {
        let content = "Test".to_string();
        let result = preview_template(content, None).await.unwrap();

        // Check that sample context has expected values
        assert_eq!(
            result.sample_context.task_title,
            "Implement user authentication"
        );
        assert_eq!(result.sample_context.prd_completed_count, 3);
        assert_eq!(result.sample_context.prd_total_count, 10);
        assert!(result.sample_context.acceptance_criteria.len() > 0);
    }

    #[tokio::test]
    async fn test_preview_template_with_for_loop() {
        let content = r#"
{% for criterion in acceptance_criteria %}
- {{ criterion }}
{% endfor %}
"#
        .to_string();
        let result = preview_template(content, None).await.unwrap();

        assert!(result.success);
        let output = result.output.unwrap();
        assert!(output.contains("Users can login"));
        assert!(output.contains("JWT tokens"));
    }

    #[tokio::test]
    async fn test_preview_template_with_conditionals() {
        let content = r#"
{% if prd_completed_count %}
Completed: {{ prd_completed_count }}/{{ prd_total_count }}
{% endif %}
"#
        .to_string();
        let result = preview_template(content, None).await.unwrap();

        assert!(result.success);
        let output = result.output.unwrap();
        assert!(output.contains("Completed: 3/10"));
    }

    #[test]
    fn test_extract_template_variables() {
        let content = "{{ task.title }} {{ acceptance_criteria }} {% for d in dependencies %} {{ d }} {% endfor %}";
        let vars = extract_template_variables(content);

        assert!(vars.contains(&"task".to_string()));
        assert!(vars.contains(&"acceptance_criteria".to_string()));
        assert!(vars.contains(&"dependencies".to_string()));
    }

    #[test]
    fn test_extract_error_line() {
        assert_eq!(extract_error_line("Error on line 5"), Some(5));
        assert_eq!(extract_error_line("Failed at line 12 with error"), Some(12));
        assert_eq!(extract_error_line("Something went wrong line 3"), Some(3));
        assert_eq!(extract_error_line("No line number here"), None);
    }
}
