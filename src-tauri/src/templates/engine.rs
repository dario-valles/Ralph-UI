// Template rendering engine using Tera

#![allow(dead_code)] // Template engine infrastructure

use crate::models::{Task, Session};
use anyhow::{Result, anyhow};
use regex::Regex;
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
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

    // --- Rich Context Variables (US-011) ---
    /// Last N entries from progress file
    pub recent_progress: Option<String>,
    /// Content from PATTERNS.md or CLAUDE.md
    pub codebase_patterns: Option<String>,
    /// Number of completed stories in the PRD
    pub prd_completed_count: Option<i32>,
    /// Total story count in the PRD
    pub prd_total_count: Option<i32>,
    /// Why this task was selected (dependency order, priority, etc.)
    pub selection_reason: Option<String>,
    /// Current date for temporal context (YYYY-MM-DD)
    pub current_date: String,
    /// ISO timestamp
    pub timestamp: String,
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
    /// Create a new empty context with current timestamp
    pub fn new() -> Self {
        Self {
            task: None,
            session: None,
            acceptance_criteria: Vec::new(),
            dependencies: Vec::new(),
            prd_content: None,
            custom: HashMap::new(),
            // Rich context variables (US-011)
            recent_progress: None,
            codebase_patterns: None,
            prd_completed_count: None,
            prd_total_count: None,
            selection_reason: None,
            current_date: chrono::Utc::now().format("%Y-%m-%d").to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
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
            // Rich context variables (US-011)
            recent_progress: None,
            codebase_patterns: None,
            prd_completed_count: None,
            prd_total_count: None,
            selection_reason: None,
            current_date: chrono::Utc::now().format("%Y-%m-%d").to_string(),
            timestamp: chrono::Utc::now().to_rfc3339(),
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

    // --- Rich Context Variable Builders (US-011) ---

    /// Add recent progress entries from progress file
    pub fn with_recent_progress(mut self, progress: &str) -> Self {
        self.recent_progress = Some(progress.to_string());
        self
    }

    /// Add codebase patterns from PATTERNS.md or CLAUDE.md
    pub fn with_codebase_patterns(mut self, patterns: &str) -> Self {
        self.codebase_patterns = Some(patterns.to_string());
        self
    }

    /// Set PRD completed and total story counts
    pub fn with_prd_counts(mut self, completed: i32, total: i32) -> Self {
        self.prd_completed_count = Some(completed);
        self.prd_total_count = Some(total);
        self
    }

    /// Set the selection reason for why this task was chosen
    pub fn with_selection_reason(mut self, reason: &str) -> Self {
        self.selection_reason = Some(reason.to_string());
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

        // Rich context variables (US-011)
        if let Some(progress) = &self.recent_progress {
            ctx.insert("recent_progress", progress);
        }

        if let Some(patterns) = &self.codebase_patterns {
            ctx.insert("codebase_patterns", patterns);
        }

        if let Some(completed) = &self.prd_completed_count {
            ctx.insert("prd_completed_count", completed);
        }

        if let Some(total) = &self.prd_total_count {
            ctx.insert("prd_total_count", total);
        }

        if let Some(reason) = &self.selection_reason {
            ctx.insert("selection_reason", reason);
        }

        // Always include current_date and timestamp
        ctx.insert("current_date", &self.current_date);
        ctx.insert("timestamp", &self.timestamp);

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

    /// Resolve @filename references in a prompt string
    /// Replaces @path/to/file with the contents of that file
    /// Supports both relative paths (resolved against base_path) and absolute paths
    ///
    /// Examples:
    ///   - @README.md -> contents of README.md
    ///   - @src/main.rs -> contents of src/main.rs
    ///   - @/absolute/path/file.txt -> contents of absolute path
    pub fn resolve_file_references(&self, prompt: &str, base_path: &Path) -> String {
        // Match @ followed by a non-whitespace path
        // Stops at whitespace, newline, or end of string
        let re = Regex::new(r"@(\S+)").unwrap();

        re.replace_all(prompt, |caps: &regex::Captures| {
            let file_path = &caps[1];
            self.read_file_for_reference(file_path, base_path)
        })
        .to_string()
    }

    /// Read a file for @filename reference substitution
    fn read_file_for_reference(&self, file_path: &str, base_path: &Path) -> String {
        // Determine the full path
        let full_path = if file_path.starts_with('/') {
            // Absolute path
            std::path::PathBuf::from(file_path)
        } else {
            // Relative path - resolve against base_path
            base_path.join(file_path)
        };

        // Try to read the file
        match fs::read_to_string(&full_path) {
            Ok(contents) => {
                // Wrap in a code block with file info for context
                format!(
                    "\n--- Contents of {} ---\n{}\n--- End of {} ---\n",
                    file_path,
                    contents.trim(),
                    file_path
                )
            }
            Err(e) => {
                // Return a placeholder indicating the file couldn't be read
                log::warn!("Failed to read file '{}': {}", full_path.display(), e);
                format!("[Unable to read file '{}': {}]", file_path, e)
            }
        }
    }

    /// Check if a string contains @filename references
    pub fn has_file_references(&self, prompt: &str) -> bool {
        let re = Regex::new(r"@(\S+)").unwrap();
        re.is_match(prompt)
    }

    /// Extract all @filename references from a string
    pub fn extract_file_references(&self, prompt: &str) -> Vec<String> {
        let re = Regex::new(r"@(\S+)").unwrap();
        re.captures_iter(prompt)
            .map(|cap| cap[1].to_string())
            .collect()
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
    use crate::models::TaskStatus;

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

    // @filename Reference Tests

    #[test]
    fn test_resolve_single_file_reference() {
        use std::io::Write;
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let readme_path = temp_dir.path().join("README.md");
        let mut file = std::fs::File::create(&readme_path).unwrap();
        writeln!(file, "# Project Title\nThis is the readme.").unwrap();

        let engine = TemplateEngine::new();
        let prompt = "Check @README.md for details";
        let resolved = engine.resolve_file_references(prompt, temp_dir.path());

        assert!(resolved.contains("# Project Title"));
        assert!(resolved.contains("This is the readme."));
        assert!(resolved.contains("--- Contents of README.md ---"));
    }

    #[test]
    fn test_resolve_multiple_file_references() {
        use std::io::Write;
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();

        // Create two files
        let file1_path = temp_dir.path().join("file1.txt");
        let mut file1 = std::fs::File::create(&file1_path).unwrap();
        writeln!(file1, "Content of file 1").unwrap();

        let file2_path = temp_dir.path().join("file2.txt");
        let mut file2 = std::fs::File::create(&file2_path).unwrap();
        writeln!(file2, "Content of file 2").unwrap();

        let engine = TemplateEngine::new();
        let prompt = "See @file1.txt and @file2.txt for more info";
        let resolved = engine.resolve_file_references(prompt, temp_dir.path());

        assert!(resolved.contains("Content of file 1"));
        assert!(resolved.contains("Content of file 2"));
    }

    #[test]
    fn test_missing_file_reference_handled() {
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let engine = TemplateEngine::new();
        let prompt = "Check @nonexistent.txt for details";
        let resolved = engine.resolve_file_references(prompt, temp_dir.path());

        assert!(resolved.contains("[Unable to read file 'nonexistent.txt'"));
    }

    #[test]
    fn test_file_reference_with_path() {
        use std::io::Write;
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let subdir = temp_dir.path().join("src");
        std::fs::create_dir(&subdir).unwrap();

        let file_path = subdir.join("main.rs");
        let mut file = std::fs::File::create(&file_path).unwrap();
        writeln!(file, "fn main() {{ println!(\"Hello\"); }}").unwrap();

        let engine = TemplateEngine::new();
        let prompt = "Look at @src/main.rs for the entry point";
        let resolved = engine.resolve_file_references(prompt, temp_dir.path());

        assert!(resolved.contains("fn main()"));
        assert!(resolved.contains("--- Contents of src/main.rs ---"));
    }

    #[test]
    fn test_has_file_references() {
        let engine = TemplateEngine::new();

        assert!(engine.has_file_references("Check @README.md"));
        assert!(engine.has_file_references("See @file1.txt and @file2.txt"));
        assert!(!engine.has_file_references("No file references here"));
        // Note: Email addresses like test@example.com will match - this is a known limitation
        // In practice, file references use paths with dots/slashes which are distinguishable
        assert!(engine.has_file_references("Email: test@example.com"));
    }

    #[test]
    fn test_extract_file_references() {
        let engine = TemplateEngine::new();

        let refs = engine.extract_file_references("Check @README.md and @src/main.rs");
        assert_eq!(refs.len(), 2);
        assert!(refs.contains(&"README.md".to_string()));
        assert!(refs.contains(&"src/main.rs".to_string()));
    }

    #[test]
    fn test_no_file_references_returns_unchanged() {
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let engine = TemplateEngine::new();
        let prompt = "No file references in this prompt";
        let resolved = engine.resolve_file_references(prompt, temp_dir.path());

        assert_eq!(resolved, prompt);
    }

    #[test]
    fn test_file_reference_at_end_of_line() {
        use std::io::Write;
        use tempfile::TempDir;

        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("config.json");
        let mut file = std::fs::File::create(&file_path).unwrap();
        writeln!(file, "{{\"key\": \"value\"}}").unwrap();

        let engine = TemplateEngine::new();
        let prompt = "Use the configuration from @config.json";
        let resolved = engine.resolve_file_references(prompt, temp_dir.path());

        assert!(resolved.contains("\"key\": \"value\""));
    }

    // Rich Context Variable Tests (US-011)

    #[test]
    fn test_recent_progress_variable() {
        let engine = TemplateEngine::new();
        let ctx = TemplateContext::new()
            .with_recent_progress("- [Iter 1] Completed US-001\n- [Iter 2] Completed US-002");

        let result = engine.render_string("Progress:\n{{ recent_progress }}", &ctx).unwrap();
        assert!(result.contains("Completed US-001"));
        assert!(result.contains("Completed US-002"));
    }

    #[test]
    fn test_codebase_patterns_variable() {
        let engine = TemplateEngine::new();
        let ctx = TemplateContext::new()
            .with_codebase_patterns("## Patterns\n- Use Zustand for state management\n- Follow CLAUDE.md guidelines");

        let result = engine.render_string("Patterns:\n{{ codebase_patterns }}", &ctx).unwrap();
        assert!(result.contains("Zustand"));
        assert!(result.contains("CLAUDE.md"));
    }

    #[test]
    fn test_prd_counts_variables() {
        let engine = TemplateEngine::new();
        let ctx = TemplateContext::new()
            .with_prd_counts(5, 10);

        let result = engine.render_string("Completed: {{ prd_completed_count }}/{{ prd_total_count }}", &ctx).unwrap();
        assert_eq!(result, "Completed: 5/10");
    }

    #[test]
    fn test_selection_reason_variable() {
        let engine = TemplateEngine::new();
        let ctx = TemplateContext::new()
            .with_selection_reason("Highest priority with satisfied dependencies");

        let result = engine.render_string("Selected because: {{ selection_reason }}", &ctx).unwrap();
        assert!(result.contains("Highest priority with satisfied dependencies"));
    }

    #[test]
    fn test_current_date_variable() {
        let engine = TemplateEngine::new();
        let ctx = TemplateContext::new();

        let result = engine.render_string("Date: {{ current_date }}", &ctx).unwrap();
        // Should be in YYYY-MM-DD format
        assert!(result.starts_with("Date: "));
        assert!(result.contains("-"));
        // Check it looks like a date (4 digits - 2 digits - 2 digits)
        let date_part = result.strip_prefix("Date: ").unwrap();
        assert_eq!(date_part.len(), 10);
    }

    #[test]
    fn test_timestamp_variable() {
        let engine = TemplateEngine::new();
        let ctx = TemplateContext::new();

        let result = engine.render_string("Time: {{ timestamp }}", &ctx).unwrap();
        // Should be in ISO 8601 format
        assert!(result.contains("Time: "));
        assert!(result.contains("T")); // ISO format has T separator
    }

    #[test]
    fn test_all_rich_variables_combined() {
        let engine = TemplateEngine::new();
        let ctx = TemplateContext::new()
            .with_recent_progress("Previous work completed")
            .with_codebase_patterns("Use TypeScript strict mode")
            .with_prd_counts(3, 7)
            .with_selection_reason("Priority order");

        let template = r#"
Progress: {{ recent_progress }}
Patterns: {{ codebase_patterns }}
Status: {{ prd_completed_count }}/{{ prd_total_count }}
Reason: {{ selection_reason }}
Date: {{ current_date }}
Timestamp: {{ timestamp }}
"#;

        let result = engine.render_string(template, &ctx).unwrap();
        assert!(result.contains("Previous work completed"));
        assert!(result.contains("TypeScript strict mode"));
        assert!(result.contains("3/7"));
        assert!(result.contains("Priority order"));
        // current_date and timestamp are auto-populated
    }

    #[test]
    fn test_rich_variables_with_defaults() {
        let engine = TemplateEngine::new();
        // Test that missing optional variables can be handled with Tera defaults
        let ctx = TemplateContext::new(); // No rich variables set

        let template = r#"Progress: {{ recent_progress | default(value="No progress yet") }}"#;
        let result = engine.render_string(template, &ctx).unwrap();
        assert_eq!(result, "Progress: No progress yet");
    }

    #[test]
    fn test_existing_variables_preserved() {
        // Verify that existing variables (task, session, etc.) still work
        let engine = TemplateEngine::new();
        let task = create_test_task();
        let ctx = TemplateContext::from_task(&task)
            .with_acceptance_criteria(vec!["Must be fast".to_string()])
            .with_prd("PRD content here")
            .with_prd_counts(1, 5)
            .with_selection_reason("First priority");

        let template = r#"Task: {{ task.title }}
Criteria: {{ acceptance_criteria | first }}
PRD: {{ prd_content }}
Completed: {{ prd_completed_count }}/{{ prd_total_count }}
Reason: {{ selection_reason }}"#;

        let result = engine.render_string(template, &ctx).unwrap();
        assert!(result.contains("Implement feature X"));
        assert!(result.contains("Must be fast"));
        assert!(result.contains("PRD content here"));
        assert!(result.contains("1/5"));
        assert!(result.contains("First priority"));
    }
}
