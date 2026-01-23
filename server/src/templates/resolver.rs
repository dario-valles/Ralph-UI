// Template resolution with cascading lookup
//
// Resolution order (US-010):
// 1. Project (.ralph-ui/templates/) - project-specific templates
// 2. Global (~/.ralph-ui/templates/) - user's global templates
// 3. Builtin - compiled-in default templates

#![allow(dead_code)] // Template resolver infrastructure

use crate::templates::builtin;
use anyhow::{Result, anyhow};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use log::{debug, info};

/// Template source indicating where a template was resolved from
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TemplateSource {
    /// Project-level template in .ralph-ui/templates/
    Project,
    /// Global template in ~/.ralph-ui/templates/
    Global,
    /// Built-in template (compiled into the application)
    Builtin,
}

/// Resolved template info
#[derive(Debug, Clone)]
pub struct ResolvedTemplate {
    /// Template name
    pub name: String,
    /// Template content
    pub content: String,
    /// Source of the template
    pub source: TemplateSource,
    /// Path to the template file (if file-based)
    pub path: Option<PathBuf>,
}

/// Template resolver with cascading lookup
pub struct TemplateResolver {
    /// Project path for custom templates
    project_path: Option<PathBuf>,
    /// Cache of resolved templates
    cache: HashMap<String, ResolvedTemplate>,
    /// Whether to use caching
    use_cache: bool,
}

impl TemplateResolver {
    /// Create a new template resolver
    pub fn new() -> Self {
        Self {
            project_path: None,
            cache: HashMap::new(),
            use_cache: true,
        }
    }

    /// Set the project path for project-level templates
    pub fn with_project_path(mut self, path: &Path) -> Self {
        self.project_path = Some(path.to_path_buf());
        self
    }

    /// Enable or disable caching
    pub fn with_caching(mut self, enabled: bool) -> Self {
        self.use_cache = enabled;
        self
    }

    /// Resolve a template by name
    ///
    /// Resolution order (US-010):
    /// 1. Project (.ralph-ui/templates/) - first match wins
    /// 2. Global (~/.ralph-ui/templates/)
    /// 3. Builtin
    ///
    /// Logs which template was resolved and from where.
    pub fn resolve(&mut self, name: &str) -> Result<ResolvedTemplate> {
        debug!("Resolving template: {}", name);

        // Check cache first
        if self.use_cache {
            if let Some(cached) = self.cache.get(name) {
                debug!(
                    "Template '{}' resolved from cache (source: {:?})",
                    name, cached.source
                );
                return Ok(cached.clone());
            }
        }

        // Try project templates first (.ralph-ui/templates/)
        if let Some(template) = self.try_project_template(name)? {
            info!(
                "Template '{}' resolved from project (.ralph-ui/templates/): {:?}",
                name, template.path
            );
            if self.use_cache {
                self.cache.insert(name.to_string(), template.clone());
            }
            return Ok(template);
        }

        // Try global templates (~/.ralph-ui/templates/)
        if let Some(template) = self.try_global_template(name)? {
            info!(
                "Template '{}' resolved from global (~/.ralph-ui/templates/): {:?}",
                name, template.path
            );
            if self.use_cache {
                self.cache.insert(name.to_string(), template.clone());
            }
            return Ok(template);
        }

        // Try builtin templates (compiled-in defaults)
        if let Some(template) = self.try_builtin_template(name)? {
            info!(
                "Template '{}' resolved from builtin templates",
                name
            );
            if self.use_cache {
                self.cache.insert(name.to_string(), template.clone());
            }
            return Ok(template);
        }

        debug!("Template '{}' not found in any location", name);
        Err(anyhow!("Template '{}' not found in any location", name))
    }

    /// Check if a template exists in any location
    ///
    /// Checks: project (.ralph-ui/templates/) → global (~/.ralph-ui/templates/) → builtin
    pub fn exists(&self, name: &str) -> bool {
        self.project_template_path(name).map(|p| p.exists()).unwrap_or(false)
            || self.global_template_path(name).map(|p| p.exists()).unwrap_or(false)
            || builtin::get_builtin_template(name).is_some()
    }

    /// Get the template content without metadata
    pub fn get_content(&mut self, name: &str) -> Result<String> {
        let template = self.resolve(name)?;
        Ok(template.content)
    }

    /// Clear the cache
    pub fn clear_cache(&mut self) {
        self.cache.clear();
    }

    /// List all available templates from all sources
    ///
    /// Returns templates in resolution order priority:
    /// 1. Project (.ralph-ui/templates/)
    /// 2. Global (~/.ralph-ui/templates/)
    /// 3. Builtin
    ///
    /// Duplicates are removed, with higher priority sources winning.
    pub fn list_all(&self) -> Vec<(String, TemplateSource)> {
        let mut templates = Vec::new();
        let mut seen = std::collections::HashSet::new();

        // First: Scan project templates (.ralph-ui/templates/) - highest priority
        if let Some(project_dir) = self.project_templates_dir() {
            if let Ok(entries) = fs::read_dir(&project_dir) {
                for entry in entries.flatten() {
                    if let Some(name) = entry.path().file_stem().and_then(|s| s.to_str()) {
                        if entry.path().extension().map_or(false, |e| e == "tera") {
                            if seen.insert(name.to_string()) {
                                templates.push((name.to_string(), TemplateSource::Project));
                            }
                        }
                    }
                }
            }
        }

        // Second: Scan global templates (~/.ralph-ui/templates/)
        if let Some(global_dir) = self.global_templates_dir() {
            if let Ok(entries) = fs::read_dir(&global_dir) {
                for entry in entries.flatten() {
                    if let Some(name) = entry.path().file_stem().and_then(|s| s.to_str()) {
                        if entry.path().extension().map_or(false, |e| e == "tera") {
                            if seen.insert(name.to_string()) {
                                templates.push((name.to_string(), TemplateSource::Global));
                            }
                        }
                    }
                }
            }
        }

        // Third: Add builtin templates (lowest priority)
        for name in builtin::list_builtin_templates() {
            if seen.insert(name.to_string()) {
                templates.push((name.to_string(), TemplateSource::Builtin));
            }
        }

        templates
    }

    // Private methods for template directory and path resolution

    /// Get the project templates directory: {project}/.ralph-ui/templates/
    fn project_templates_dir(&self) -> Option<PathBuf> {
        self.project_path
            .as_ref()
            .map(|p| p.join(".ralph-ui").join("templates"))
    }

    /// Get the global templates directory: ~/.ralph-ui/templates/
    fn global_templates_dir(&self) -> Option<PathBuf> {
        dirs::home_dir().map(|p| p.join(".ralph-ui").join("templates"))
    }

    /// Get the path to a project template by name
    fn project_template_path(&self, name: &str) -> Option<PathBuf> {
        self.project_templates_dir().map(|d| d.join(format!("{}.tera", name)))
    }

    /// Get the path to a global template by name
    fn global_template_path(&self, name: &str) -> Option<PathBuf> {
        self.global_templates_dir().map(|d| d.join(format!("{}.tera", name)))
    }

    /// Try to load a template from the project directory
    fn try_project_template(&self, name: &str) -> Result<Option<ResolvedTemplate>> {
        if let Some(path) = self.project_template_path(name) {
            if path.exists() {
                debug!("Found project template at {:?}", path);
                let content = fs::read_to_string(&path)?;
                return Ok(Some(ResolvedTemplate {
                    name: name.to_string(),
                    content,
                    source: TemplateSource::Project,
                    path: Some(path),
                }));
            }
        }
        Ok(None)
    }

    /// Try to load a template from the global directory
    fn try_global_template(&self, name: &str) -> Result<Option<ResolvedTemplate>> {
        if let Some(path) = self.global_template_path(name) {
            if path.exists() {
                debug!("Found global template at {:?}", path);
                let content = fs::read_to_string(&path)?;
                return Ok(Some(ResolvedTemplate {
                    name: name.to_string(),
                    content,
                    source: TemplateSource::Global,
                    path: Some(path),
                }));
            }
        }
        Ok(None)
    }

    /// Try to load a builtin template
    fn try_builtin_template(&self, name: &str) -> Result<Option<ResolvedTemplate>> {
        if let Some(content) = builtin::get_builtin_template(name) {
            debug!("Found builtin template '{}'", name);
            return Ok(Some(ResolvedTemplate {
                name: name.to_string(),
                content: content.to_string(),
                source: TemplateSource::Builtin,
                path: None,
            }));
        }
        Ok(None)
    }
}

impl Default for TemplateResolver {
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
    fn test_finds_project_template() {
        // Project templates are in .ralph-ui/templates/
        let temp_dir = create_test_dir();
        let project_dir = temp_dir.path().join(".ralph-ui").join("templates");
        fs::create_dir_all(&project_dir).unwrap();
        fs::write(project_dir.join("my_template.tera"), "Project content").unwrap();

        let mut resolver = TemplateResolver::new()
            .with_project_path(temp_dir.path());

        let template = resolver.resolve("my_template").unwrap();
        assert_eq!(template.source, TemplateSource::Project);
        assert_eq!(template.content, "Project content");
    }

    #[test]
    fn test_falls_back_to_builtin_template() {
        let mut resolver = TemplateResolver::new();

        let template = resolver.resolve(builtin::TASK_PROMPT).unwrap();
        assert_eq!(template.source, TemplateSource::Builtin);
        assert!(template.content.contains("You are working on:"));
    }

    #[test]
    fn test_returns_error_for_nonexistent_template() {
        let mut resolver = TemplateResolver::new();

        let result = resolver.resolve("nonexistent_template");
        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not found"));
    }

    #[test]
    fn test_graceful_fallback_to_default() {
        // When a template is not found, the resolver returns an error
        // The caller should handle this by falling back to a default template
        let mut resolver = TemplateResolver::new();

        // Non-existent template fails
        let result = resolver.resolve("nonexistent_template");
        assert!(result.is_err());

        // But builtin templates are always available as fallback
        let fallback = resolver.resolve(builtin::TASK_PROMPT).unwrap();
        assert_eq!(fallback.source, TemplateSource::Builtin);
    }

    #[test]
    fn test_caches_templates() {
        let temp_dir = create_test_dir();
        let project_dir = temp_dir.path().join(".ralph-ui").join("templates");
        fs::create_dir_all(&project_dir).unwrap();
        fs::write(project_dir.join("cached.tera"), "Cached content").unwrap();

        let mut resolver = TemplateResolver::new()
            .with_project_path(temp_dir.path())
            .with_caching(true);

        // First resolution
        let template1 = resolver.resolve("cached").unwrap();
        assert_eq!(template1.source, TemplateSource::Project);

        // Modify the file
        fs::write(project_dir.join("cached.tera"), "Modified content").unwrap();

        // Second resolution should return cached version
        let template2 = resolver.resolve("cached").unwrap();
        assert_eq!(template2.content, "Cached content");

        // Clear cache and resolve again
        resolver.clear_cache();
        let template3 = resolver.resolve("cached").unwrap();
        assert_eq!(template3.content, "Modified content");
    }

    #[test]
    fn test_exists() {
        let resolver = TemplateResolver::new();

        assert!(resolver.exists(builtin::TASK_PROMPT));
        assert!(!resolver.exists("nonexistent"));
    }

    #[test]
    fn test_list_all() {
        let resolver = TemplateResolver::new();
        let templates = resolver.list_all();

        // Should include builtin templates
        assert!(templates.iter().any(|(name, _)| name == builtin::TASK_PROMPT));
        assert!(templates.iter().any(|(name, _)| name == builtin::BUG_FIX));
    }

    #[test]
    fn test_project_overrides_builtin() {
        // Project templates (.ralph-ui/templates/) override builtin templates
        let temp_dir = create_test_dir();
        let project_dir = temp_dir.path().join(".ralph-ui").join("templates");
        fs::create_dir_all(&project_dir).unwrap();
        fs::write(project_dir.join("task_prompt.tera"), "Custom task prompt").unwrap();

        let mut resolver = TemplateResolver::new()
            .with_project_path(temp_dir.path());

        let template = resolver.resolve("task_prompt").unwrap();
        assert_eq!(template.source, TemplateSource::Project);
        assert_eq!(template.content, "Custom task prompt");
    }

    #[test]
    fn test_resolution_order_project_global_builtin() {
        // Test that resolution order is: project -> global -> builtin
        // Since we can't easily mock ~/.ralph-ui/templates/, we test project vs builtin
        let temp_dir = create_test_dir();
        let project_dir = temp_dir.path().join(".ralph-ui").join("templates");
        fs::create_dir_all(&project_dir).unwrap();

        // Create a project template that overrides a builtin
        fs::write(project_dir.join("task_prompt.tera"), "Project override").unwrap();

        let mut resolver = TemplateResolver::new()
            .with_project_path(temp_dir.path());

        // Project template should win
        let template = resolver.resolve("task_prompt").unwrap();
        assert_eq!(template.source, TemplateSource::Project);
        assert_eq!(template.content, "Project override");

        // Without project path, falls back to builtin
        let mut resolver_no_project = TemplateResolver::new();
        let builtin_template = resolver_no_project.resolve("task_prompt").unwrap();
        assert_eq!(builtin_template.source, TemplateSource::Builtin);
    }

    #[test]
    fn test_tera_extension_required() {
        // Templates must have .tera extension
        let temp_dir = create_test_dir();
        let project_dir = temp_dir.path().join(".ralph-ui").join("templates");
        fs::create_dir_all(&project_dir).unwrap();

        // Write template with wrong extension
        fs::write(project_dir.join("my_template.txt"), "Wrong extension").unwrap();

        let mut resolver = TemplateResolver::new()
            .with_project_path(temp_dir.path());

        // Should not find it
        let result = resolver.resolve("my_template");
        assert!(result.is_err());

        // Write template with correct extension
        fs::write(project_dir.join("my_template.tera"), "Correct extension").unwrap();

        // Now should find it
        let template = resolver.resolve("my_template").unwrap();
        assert_eq!(template.content, "Correct extension");
    }

    #[test]
    fn test_list_all_includes_source() {
        let temp_dir = create_test_dir();
        let project_dir = temp_dir.path().join(".ralph-ui").join("templates");
        fs::create_dir_all(&project_dir).unwrap();
        fs::write(project_dir.join("custom_template.tera"), "Custom").unwrap();

        let resolver = TemplateResolver::new()
            .with_project_path(temp_dir.path());

        let templates = resolver.list_all();

        // Should have project template with correct source
        let custom = templates.iter().find(|(name, _)| name == "custom_template");
        assert!(custom.is_some());
        assert_eq!(custom.unwrap().1, TemplateSource::Project);

        // Should have builtin templates with correct source
        let builtin = templates.iter().find(|(name, _)| name == builtin::TASK_PROMPT);
        assert!(builtin.is_some());
        assert_eq!(builtin.unwrap().1, TemplateSource::Builtin);
    }
}
