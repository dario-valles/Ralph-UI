// Template resolution with cascading lookup

use crate::templates::builtin;
use anyhow::{Result, anyhow};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

/// Template source
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TemplateSource {
    /// Custom template in .ralph-ui/templates/
    Custom,
    /// Project-level template
    Project,
    /// Global template in ~/.config/ralph-ui/templates/
    Global,
    /// Built-in template
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

    /// Set the project path for custom templates
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
    /// Resolution order: custom -> project -> global -> builtin
    pub fn resolve(&mut self, name: &str) -> Result<ResolvedTemplate> {
        // Check cache first
        if self.use_cache {
            if let Some(cached) = self.cache.get(name) {
                return Ok(cached.clone());
            }
        }

        // Try custom templates first
        if let Some(template) = self.try_custom_template(name)? {
            if self.use_cache {
                self.cache.insert(name.to_string(), template.clone());
            }
            return Ok(template);
        }

        // Try project templates
        if let Some(template) = self.try_project_template(name)? {
            if self.use_cache {
                self.cache.insert(name.to_string(), template.clone());
            }
            return Ok(template);
        }

        // Try global templates
        if let Some(template) = self.try_global_template(name)? {
            if self.use_cache {
                self.cache.insert(name.to_string(), template.clone());
            }
            return Ok(template);
        }

        // Try builtin templates
        if let Some(template) = self.try_builtin_template(name)? {
            if self.use_cache {
                self.cache.insert(name.to_string(), template.clone());
            }
            return Ok(template);
        }

        Err(anyhow!("Template '{}' not found in any location", name))
    }

    /// Check if a template exists
    pub fn exists(&self, name: &str) -> bool {
        self.custom_template_path(name).map(|p| p.exists()).unwrap_or(false)
            || self.project_template_path(name).map(|p| p.exists()).unwrap_or(false)
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

    /// List all available templates
    pub fn list_all(&self) -> Vec<(String, TemplateSource)> {
        let mut templates = Vec::new();

        // Add builtin templates
        for name in builtin::list_builtin_templates() {
            templates.push((name.to_string(), TemplateSource::Builtin));
        }

        // Scan global templates
        if let Some(global_dir) = self.global_templates_dir() {
            if let Ok(entries) = fs::read_dir(&global_dir) {
                for entry in entries.flatten() {
                    if let Some(name) = entry.path().file_stem().and_then(|s| s.to_str()) {
                        if entry.path().extension().map_or(false, |e| e == "tera" || e == "txt") {
                            templates.push((name.to_string(), TemplateSource::Global));
                        }
                    }
                }
            }
        }

        // Scan project templates
        if let Some(ref project_path) = self.project_path {
            let project_dir = project_path.join(".ralph-ui").join("templates");
            if let Ok(entries) = fs::read_dir(&project_dir) {
                for entry in entries.flatten() {
                    if let Some(name) = entry.path().file_stem().and_then(|s| s.to_str()) {
                        if entry.path().extension().map_or(false, |e| e == "tera" || e == "txt") {
                            templates.push((name.to_string(), TemplateSource::Project));
                        }
                    }
                }
            }
        }

        // Scan custom templates
        if let Some(custom_dir) = self.custom_templates_dir() {
            if let Ok(entries) = fs::read_dir(&custom_dir) {
                for entry in entries.flatten() {
                    if let Some(name) = entry.path().file_stem().and_then(|s| s.to_str()) {
                        if entry.path().extension().map_or(false, |e| e == "tera" || e == "txt") {
                            templates.push((name.to_string(), TemplateSource::Custom));
                        }
                    }
                }
            }
        }

        // Deduplicate by name (first occurrence wins - highest priority)
        let mut seen = std::collections::HashSet::new();
        templates.retain(|(name, _)| seen.insert(name.clone()));

        templates
    }

    // Private methods

    fn custom_templates_dir(&self) -> Option<PathBuf> {
        self.project_path
            .as_ref()
            .map(|p| p.join(".ralph-ui").join("templates"))
    }

    fn project_templates_dir(&self) -> Option<PathBuf> {
        self.project_path
            .as_ref()
            .map(|p| p.join("templates"))
    }

    fn global_templates_dir(&self) -> Option<PathBuf> {
        dirs::config_dir().map(|p| p.join("ralph-ui").join("templates"))
    }

    fn custom_template_path(&self, name: &str) -> Option<PathBuf> {
        self.custom_templates_dir().map(|d| d.join(format!("{}.tera", name)))
    }

    fn project_template_path(&self, name: &str) -> Option<PathBuf> {
        self.project_templates_dir().map(|d| d.join(format!("{}.tera", name)))
    }

    fn global_template_path(&self, name: &str) -> Option<PathBuf> {
        self.global_templates_dir().map(|d| d.join(format!("{}.tera", name)))
    }

    fn try_custom_template(&self, name: &str) -> Result<Option<ResolvedTemplate>> {
        if let Some(path) = self.custom_template_path(name) {
            if path.exists() {
                let content = fs::read_to_string(&path)?;
                return Ok(Some(ResolvedTemplate {
                    name: name.to_string(),
                    content,
                    source: TemplateSource::Custom,
                    path: Some(path),
                }));
            }
        }
        Ok(None)
    }

    fn try_project_template(&self, name: &str) -> Result<Option<ResolvedTemplate>> {
        if let Some(path) = self.project_template_path(name) {
            if path.exists() {
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

    fn try_global_template(&self, name: &str) -> Result<Option<ResolvedTemplate>> {
        if let Some(path) = self.global_template_path(name) {
            if path.exists() {
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

    fn try_builtin_template(&self, name: &str) -> Result<Option<ResolvedTemplate>> {
        if let Some(content) = builtin::get_builtin_template(name) {
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
    fn test_finds_custom_template() {
        let temp_dir = create_test_dir();
        let custom_dir = temp_dir.path().join(".ralph-ui").join("templates");
        fs::create_dir_all(&custom_dir).unwrap();
        fs::write(custom_dir.join("my_template.tera"), "Custom content").unwrap();

        let mut resolver = TemplateResolver::new()
            .with_project_path(temp_dir.path());

        let template = resolver.resolve("my_template").unwrap();
        assert_eq!(template.source, TemplateSource::Custom);
        assert_eq!(template.content, "Custom content");
    }

    #[test]
    fn test_falls_back_to_project_template() {
        let temp_dir = create_test_dir();
        let project_dir = temp_dir.path().join("templates");
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
    }

    #[test]
    fn test_caches_templates() {
        let temp_dir = create_test_dir();
        let custom_dir = temp_dir.path().join(".ralph-ui").join("templates");
        fs::create_dir_all(&custom_dir).unwrap();
        fs::write(custom_dir.join("cached.tera"), "Cached content").unwrap();

        let mut resolver = TemplateResolver::new()
            .with_project_path(temp_dir.path())
            .with_caching(true);

        // First resolution
        let template1 = resolver.resolve("cached").unwrap();
        assert_eq!(template1.source, TemplateSource::Custom);

        // Modify the file
        fs::write(custom_dir.join("cached.tera"), "Modified content").unwrap();

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
    fn test_custom_overrides_builtin() {
        let temp_dir = create_test_dir();
        let custom_dir = temp_dir.path().join(".ralph-ui").join("templates");
        fs::create_dir_all(&custom_dir).unwrap();
        fs::write(custom_dir.join("task_prompt.tera"), "Custom task prompt").unwrap();

        let mut resolver = TemplateResolver::new()
            .with_project_path(temp_dir.path());

        let template = resolver.resolve("task_prompt").unwrap();
        assert_eq!(template.source, TemplateSource::Custom);
        assert_eq!(template.content, "Custom task prompt");
    }
}
