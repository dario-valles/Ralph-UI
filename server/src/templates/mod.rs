// Template system for prompt generation

#![allow(dead_code)] // Template infrastructure (some builders not yet used)

pub mod builtin;
pub mod engine;
pub mod resolver;

// Re-export main types
pub use engine::{DependencyContext, TemplateContext, TemplateEngine};
pub use resolver::TemplateResolver;

use crate::models::{Session, Task};
use anyhow::Result;

/// Convenience function to render a task prompt
pub fn render_task_prompt(task: &Task, template_name: Option<&str>) -> Result<String> {
    let mut resolver = TemplateResolver::new();
    let engine = TemplateEngine::new();

    // Determine which template to use
    let template_name = template_name.unwrap_or(builtin::TASK_PROMPT);

    // Resolve the template
    let template = resolver.resolve(template_name)?;
    engine.add_template(template_name, &template.content)?;

    // Build context
    let context = TemplateContext::from_task(task);

    // Render
    engine.render(template_name, &context)
}

/// Convenience function to render a task prompt with full context
pub fn render_task_prompt_with_context(
    task: &Task,
    session: Option<&Session>,
    acceptance_criteria: Vec<String>,
    dependencies: Vec<DependencyContext>,
    template_name: Option<&str>,
) -> Result<String> {
    let mut resolver = TemplateResolver::new();
    let engine = TemplateEngine::new();

    // Determine which template to use
    let template_name = template_name.unwrap_or(builtin::TASK_PROMPT);

    // Resolve the template
    let template = resolver.resolve(template_name)?;
    engine.add_template(template_name, &template.content)?;

    // Build context
    let mut context = TemplateContext::from_task(task)
        .with_acceptance_criteria(acceptance_criteria)
        .with_dependencies(dependencies);

    if let Some(session) = session {
        context = context.with_session(session);
    }

    // Render
    engine.render(template_name, &context)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::TaskStatus;

    fn create_test_task() -> Task {
        Task {
            id: "task-1".to_string(),
            title: "Test Task".to_string(),
            description: "Test description".to_string(),
            status: TaskStatus::Pending,
            priority: 1,
            dependencies: vec![],
            assigned_agent: None,
            estimated_tokens: None,
            actual_tokens: None,
            started_at: None,
            completed_at: None,
            branch: None,
            worktree_path: None,
            error: None,
        }
    }

    #[test]
    fn test_render_task_prompt() {
        let task = create_test_task();
        let result = render_task_prompt(&task, None).unwrap();

        assert!(result.contains("Test Task"));
        assert!(result.contains("Test description"));
    }

    #[test]
    fn test_render_with_specific_template() {
        let task = create_test_task();
        let result = render_task_prompt(&task, Some(builtin::BUG_FIX)).unwrap();

        assert!(result.contains("Bug Fix"));
    }
}
