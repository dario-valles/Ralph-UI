// Template Tauri commands

use crate::templates::{
    engine::{TemplateEngine, TemplateContext, DependencyContext, TaskContext},
    builtin::get_builtin_templates,
    resolver::{TemplateResolver, TemplateSource},
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::State;

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
}

/// List all available templates
#[tauri::command]
pub async fn list_templates(
    project_path: Option<String>,
) -> Result<Vec<TemplateInfo>, String> {
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
                TemplateSource::Builtin => "Built-in template".to_string(),
                TemplateSource::Global => "Global template (~/.config/ralph-ui/templates/)".to_string(),
                TemplateSource::Project => "Project template (.ralph-ui/templates/)".to_string(),
                TemplateSource::Custom => "Custom template".to_string(),
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
#[tauri::command]
pub async fn list_builtin_templates() -> Result<Vec<String>, String> {
    Ok(get_builtin_templates()
        .keys()
        .cloned()
        .collect())
}

/// Render a template with context
#[tauri::command]
pub async fn render_template(
    request: RenderRequest,
) -> Result<String, String> {
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

    // Render
    engine
        .render_string(template_content, &context)
        .map_err(|e| format!("Failed to render template: {}", e))
}

/// Render task prompt using template system
#[tauri::command]
pub async fn render_task_prompt(
    task_id: String,
    template_name: Option<String>,
    db: State<'_, std::sync::Mutex<crate::database::Database>>,
) -> Result<String, String> {
    let db = db.lock().map_err(|e| format!("Database lock error: {}", e))?;
    let conn = db.get_connection();

    // Get task
    let task = crate::database::tasks::get_task(conn, &task_id)
        .map_err(|e| format!("Failed to get task: {}", e))?;

    crate::templates::render_task_prompt(&task, template_name.as_deref())
        .map_err(|e| format!("Failed to render: {}", e))
}

/// Get template content by name
#[tauri::command]
pub async fn get_template_content(
    name: String,
    project_path: Option<String>,
) -> Result<String, String> {
    let mut resolver = if let Some(path) = project_path {
        TemplateResolver::new().with_project_path(std::path::Path::new(&path))
    } else {
        TemplateResolver::new()
    };

    let template = resolver.resolve(&name)
        .map_err(|e| format!("Failed to get template: {}", e))?;

    Ok(template.content)
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
        };

        let result = render_template(request).await.unwrap();
        assert!(result.contains("Test Task"));
        assert!(result.contains("Test description"));
    }
}
