// Template rendering engine using Tera

use crate::models::{Task, Session};
use anyhow::{Result, anyhow};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Mutex;
use tera::{Tera, Context};

/// Template context for rendering
#[derive(Debug, Clone, Serialize)]
pub struct TemplateContext {
    /// Task information
    pub task: Option<TaskContext>,
    /// Session information
    pub session: Option<SessionContext>,
    /// Acceptance criteria (if any)
    pub acceptance_criteria: Vec<String>,
    /// Completed dependencies
    pub dependencies: Vec<DependencyContext>,
    /// PRD content (if any)
    pub prd_content: Option<String>,
    /// Custom variables
    pub custom: HashMap<String, String>,
}

/// Task context for templates
#[derive(Debug, Clone, Serialize)]
pub struct TaskContext {
    pub id: String,
    pub title: String,
    pub description: String,
    pub status: String,
    pub priority: i32,
    pub branch: Option<String>,
    pub worktree_path: Option<String>,
}

impl From<&Task> for TaskContext {
    fn from(task: &Task) -> Self {
        Self {
            id: task.id.clone(),
            title: task.title.clone(),
            description: task.description.clone(),
            status: format!("{:?}", task.status),
            priority: task.priority,
            branch: task.branch.clone(),
            worktree_path: task.worktree_path.clone(),
        }
    }
}

/// Session context for templates
#[derive(Debug, Clone, Serialize)]
pub struct SessionContext {
    pub id: String,
    pub name: String,
    pub project_path: String,
    pub status: String,
    pub max_parallel: i32,
    pub max_iterations: i32,
}

impl From<&Session> for SessionContext {
    fn from(session: &Session) -> Self {
        Self {
            id: session.id.clone(),
            name: session.name.clone(),
            project_path: session.project_path.clone(),
            status: format!("{:?}", session.status),
            max_parallel: session.config.max_parallel,
            max_iterations: session.config.max_iterations,
        }
    }
}

/// Dependency context for templates
#[derive(Debug, Clone, Serialize)]
pub struct DependencyContext {
    pub id: String,
    pub title: String,
    pub status: String,
}

impl TemplateContext {
    /// Create a new empty context
    pub fn new() -> Self {
        Self {
            task: None,
            session: None,
            acceptance_criteria: Vec::new(),
            dependencies: Vec::new(),
            prd_content: None,
            custom: HashMap::new(),
        }
    }

    /// Build context from a task
    pub fn from_task(task: &Task) -> Self {
        Self {
            task: Some(TaskContext::from(task)),
            session: None,
            acceptance_criteria: Vec::new(),
            dependencies: Vec::new(),
            prd_content: None,
            custom: HashMap::new(),
        }
    }

    /// Add session to context
    pub fn with_session(mut self, session: &Session) -> Self {
        self.session = Some(SessionContext::from(session));
        self
    }

    /// Add acceptance criteria
    pub fn with_acceptance_criteria(mut self, criteria: Vec<String>) -> Self {
        self.acceptance_criteria = criteria;
        self
    }

    /// Add completed dependencies
    pub fn with_dependencies(mut self, deps: Vec<DependencyContext>) -> Self {
        self.dependencies = deps;
        self
    }

    /// Add PRD content
    pub fn with_prd(mut self, prd: &str) -> Self {
        self.prd_content = Some(prd.to_string());
        self
    }

    /// Add custom variable
    pub fn with_custom(mut self, key: &str, value: &str) -> Self {
        self.custom.insert(key.to_string(), value.to_string());
        self
    }

    /// Convert to Tera context
    pub fn to_tera_context(&self) -> Result<Context> {
        let mut ctx = Context::new();

        if let Some(task) = &self.task {
            ctx.insert("task", task);
        }

        if let Some(session) = &self.session {
            ctx.insert("session", session);
        }

        ctx.insert("acceptance_criteria", &self.acceptance_criteria);
        ctx.insert("dependencies", &self.dependencies);

        if let Some(prd) = &self.prd_content {
            ctx.insert("prd_content", prd);
        }

        for (key, value) in &self.custom {
            ctx.insert(key, value);
        }

        Ok(ctx)
    }
}

impl Default for TemplateContext {
    fn default() -> Self {
        Self::new()
    }
}

/// Template engine for rendering prompts
pub struct TemplateEngine {
    /// Tera instance with cached templates
    tera: Mutex<Tera>,
}

impl TemplateEngine {
    /// Create a new template engine
    pub fn new() -> Self {
        let tera = Tera::default();
        Self {
            tera: Mutex::new(tera),
        }
    }

    /// Add a template from string
    pub fn add_template(&self, name: &str, template: &str) -> Result<()> {
        let mut tera = self.tera.lock().map_err(|e| anyhow!("Lock error: {}", e))?;
        tera.add_raw_template(name, template)
            .map_err(|e| anyhow!("Failed to add template '{}': {}", name, e))?;
        Ok(())
    }

    /// Render a template with context
    pub fn render(&self, template_name: &str, context: &TemplateContext) -> Result<String> {
        let tera = self.tera.lock().map_err(|e| anyhow!("Lock error: {}", e))?;
        let ctx = context.to_tera_context()?;

        tera.render(template_name, &ctx)
            .map_err(|e| anyhow!("Failed to render template '{}': {}", template_name, e))
    }

    /// Render a template string directly (one-off)
    pub fn render_string(&self, template: &str, context: &TemplateContext) -> Result<String> {
        let mut tera = self.tera.lock().map_err(|e| anyhow!("Lock error: {}", e))?;
        let ctx = context.to_tera_context()?;

        tera.render_str(template, &ctx)
            .map_err(|e| anyhow!("Failed to render template string: {}", e))
    }

    /// Check if a template exists
    pub fn has_template(&self, name: &str) -> bool {
        let tera = self.tera.lock().ok();
        tera.map(|t| t.get_template_names().any(|n| n == name))
            .unwrap_or(false)
    }

    /// Get list of template names
    pub fn template_names(&self) -> Vec<String> {
        let tera = self.tera.lock().ok();
        tera.map(|t| t.get_template_names().map(|s| s.to_string()).collect())
            .unwrap_or_default()
    }

    /// Clear all templates
    pub fn clear(&self) -> Result<()> {
        let mut tera = self.tera.lock().map_err(|e| anyhow!("Lock error: {}", e))?;
        *tera = Tera::default();
        Ok(())
    }
}

impl Default for TemplateEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_task() -> Task {
        Task {
            id: "task-1".to_string(),
            title: "Implement feature X".to_string(),
            description: "Add feature X to the application".to_string(),
            status: TaskStatus::Pending,
            priority: 1,
            dependencies: vec![],
            assigned_agent: None,
            estimated_tokens: Some(1000),
            actual_tokens: None,
            started_at: None,
            completed_at: None,
            branch: Some("feature/x".to_string()),
            worktree_path: None,
            error: None,
        }
    }

    #[test]
    fn test_renders_simple_template_with_variables() {
        let engine = TemplateEngine::new();
        engine.add_template("simple", "Hello {{ task.title }}!").unwrap();

        let task = create_test_task();
        let ctx = TemplateContext::from_task(&task);

        let result = engine.render("simple", &ctx).unwrap();
        assert_eq!(result, "Hello Implement feature X!");
    }

    #[test]
    fn test_handles_missing_variables_gracefully() {
        let engine = TemplateEngine::new();
        engine.add_template("missing", "Title: {{ task.title | default(value='N/A') }}").unwrap();

        let ctx = TemplateContext::new(); // No task

        let result = engine.render("missing", &ctx).unwrap();
        assert_eq!(result, "Title: N/A");
    }

    #[test]
    fn test_caches_compiled_templates() {
        let engine = TemplateEngine::new();
        engine.add_template("cached", "{{ task.title }}").unwrap();

        assert!(engine.has_template("cached"));
        assert!(!engine.has_template("nonexistent"));
    }

    #[test]
    fn test_builds_context_from_task() {
        let task = create_test_task();
        let ctx = TemplateContext::from_task(&task);

        assert!(ctx.task.is_some());
        let task_ctx = ctx.task.unwrap();
        assert_eq!(task_ctx.id, "task-1");
        assert_eq!(task_ctx.title, "Implement feature X");
    }

    #[test]
    fn test_builds_context_from_session() {
        use chrono::Utc;
        use crate::models::{SessionConfig, SessionStatus, AgentType};

        let session = Session {
            id: "session-1".to_string(),
            name: "Test Session".to_string(),
            project_path: "/test/path".to_string(),
            created_at: Utc::now(),
            last_resumed_at: None,
            status: SessionStatus::Active,
            config: SessionConfig {
                max_parallel: 3,
                max_iterations: 10,
                max_retries: 3,
                agent_type: AgentType::Claude,
                auto_create_prs: true,
                draft_prs: false,
                run_tests: true,
                run_lint: true,
            },
            tasks: vec![],
            total_cost: 0.0,
            total_tokens: 0,
        };

        let ctx = TemplateContext::new().with_session(&session);

        assert!(ctx.session.is_some());
        let session_ctx = ctx.session.unwrap();
        assert_eq!(session_ctx.id, "session-1");
        assert_eq!(session_ctx.name, "Test Session");
    }

    #[test]
    fn test_includes_acceptance_criteria_in_context() {
        let engine = TemplateEngine::new();
        engine.add_template("criteria", r#"
{% for criterion in acceptance_criteria %}
- {{ criterion }}
{% endfor %}
"#.trim()).unwrap();

        let ctx = TemplateContext::new()
            .with_acceptance_criteria(vec![
                "Must be fast".to_string(),
                "Must be secure".to_string(),
            ]);

        let result = engine.render("criteria", &ctx).unwrap();
        assert!(result.contains("Must be fast"));
        assert!(result.contains("Must be secure"));
    }

    #[test]
    fn test_render_string_one_off() {
        let engine = TemplateEngine::new();
        let task = create_test_task();
        let ctx = TemplateContext::from_task(&task);

        let result = engine.render_string("Task: {{ task.title }}", &ctx).unwrap();
        assert_eq!(result, "Task: Implement feature X");
    }

    #[test]
    fn test_custom_variables() {
        let engine = TemplateEngine::new();
        let ctx = TemplateContext::new()
            .with_custom("project_name", "Ralph")
            .with_custom("version", "1.0.0");

        let result = engine.render_string("{{ project_name }} v{{ version }}", &ctx).unwrap();
        assert_eq!(result, "Ralph v1.0.0");
    }

    #[test]
    fn test_template_names() {
        let engine = TemplateEngine::new();
        engine.add_template("template1", "").unwrap();
        engine.add_template("template2", "").unwrap();

        let names = engine.template_names();
        assert!(names.contains(&"template1".to_string()));
        assert!(names.contains(&"template2".to_string()));
    }

    #[test]
    fn test_clear_templates() {
        let engine = TemplateEngine::new();
        engine.add_template("test", "").unwrap();
        assert!(engine.has_template("test"));

        engine.clear().unwrap();
        assert!(!engine.has_template("test"));
    }
}
