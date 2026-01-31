//! PRD Chat Codebase Analysis
//!
//! Analyzes the project codebase to provide context-aware PRD creation.
//! Reuses the analysis infrastructure from context_chat.

use serde::{Deserialize, Serialize};
use std::path::Path;

/// Analysis result for PRD context
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PrdCodebaseAnalysis {
    /// Project name
    pub project_name: Option<String>,
    /// Whether the project has a CLAUDE.md file
    pub has_claude_md: bool,
    /// Summary of CLAUDE.md content (if exists)
    pub claude_md_summary: Option<String>,
    /// Detected programming languages
    pub languages: Vec<String>,
    /// Detected frameworks
    pub frameworks: Vec<String>,
    /// Key dependencies
    pub key_dependencies: Vec<String>,
    /// Top-level directory structure
    pub directory_structure: Vec<String>,
    /// Whether existing context files are configured
    pub has_existing_context: bool,
    /// Suggestions based on codebase
    pub suggestions: Vec<String>,
}

/// Analyze a project for PRD context
pub fn analyze_project_for_prd(project_path: &Path) -> Result<PrdCodebaseAnalysis, String> {
    let mut analysis = PrdCodebaseAnalysis::default();

    // Get project name from directory
    analysis.project_name = project_path
        .file_name()
        .and_then(|n| n.to_str())
        .map(|s| s.to_string());

    // Check for and summarize CLAUDE.md
    let claude_md_path = project_path.join("CLAUDE.md");
    if claude_md_path.exists() {
        analysis.has_claude_md = true;
        if let Ok(content) = std::fs::read_to_string(&claude_md_path) {
            // Extract first ~300 chars as summary for PRD context
            let summary: String = content.chars().take(300).collect();
            analysis.claude_md_summary = Some(if content.len() > 300 {
                format!("{}...", summary)
            } else {
                summary
            });
        }
    }

    // Detect tech stack
    let stack = detect_tech_stack_for_prd(project_path);
    analysis.languages = stack.languages;
    analysis.frameworks = stack.frameworks;
    analysis.key_dependencies = stack.key_dependencies;

    // Get directory structure
    analysis.directory_structure = get_top_level_dirs(project_path);

    // Check for existing context
    let ralph_context = project_path.join(".ralph-ui").join("context");
    analysis.has_existing_context = ralph_context.exists();

    // Generate suggestions based on analysis
    analysis.suggestions = generate_suggestions(&analysis);

    Ok(analysis)
}

/// Format analysis as a markdown summary for injection into prompts
pub fn format_analysis_for_prompt(analysis: &PrdCodebaseAnalysis) -> String {
    let mut parts = Vec::new();

    if let Some(name) = &analysis.project_name {
        parts.push(format!("**Project**: {}", name));
    }

    if !analysis.languages.is_empty() {
        parts.push(format!("**Languages**: {}", analysis.languages.join(", ")));
    }

    if !analysis.frameworks.is_empty() {
        parts.push(format!(
            "**Frameworks**: {}",
            analysis.frameworks.join(", ")
        ));
    }

    if !analysis.key_dependencies.is_empty() {
        parts.push(format!(
            "**Key Dependencies**: {}",
            analysis.key_dependencies.join(", ")
        ));
    }

    if !analysis.directory_structure.is_empty() {
        parts.push(format!(
            "**Structure**: {}",
            analysis.directory_structure.join(", ")
        ));
    }

    if analysis.has_claude_md {
        if let Some(summary) = &analysis.claude_md_summary {
            parts.push(format!("**Project Context**: {}", summary));
        } else {
            parts.push("**Project Context**: CLAUDE.md exists".to_string());
        }
    }

    if analysis.has_existing_context {
        parts.push("**Note**: Project has existing Ralph context files".to_string());
    }

    if !analysis.suggestions.is_empty() {
        parts.push(format!(
            "**Considerations**: {}",
            analysis.suggestions.join("; ")
        ));
    }

    if parts.is_empty() {
        "No project analysis available.".to_string()
    } else {
        parts.join("\n")
    }
}

struct TechStackForPrd {
    languages: Vec<String>,
    frameworks: Vec<String>,
    key_dependencies: Vec<String>,
}

fn detect_tech_stack_for_prd(project_path: &Path) -> TechStackForPrd {
    let mut stack = TechStackForPrd {
        languages: Vec::new(),
        frameworks: Vec::new(),
        key_dependencies: Vec::new(),
    };

    // Check for package.json (Node.js/JavaScript)
    let package_json_path = project_path.join("package.json");
    if package_json_path.exists() {
        stack.languages.push("JavaScript/TypeScript".to_string());

        if let Ok(content) = std::fs::read_to_string(&package_json_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                // Extract key dependencies and frameworks
                if let Some(deps) = json.get("dependencies").and_then(|d| d.as_object()) {
                    for name in deps.keys() {
                        match name.as_str() {
                            "react" => stack.frameworks.push("React".to_string()),
                            "next" => stack.frameworks.push("Next.js".to_string()),
                            "vue" => stack.frameworks.push("Vue".to_string()),
                            "svelte" => stack.frameworks.push("Svelte".to_string()),
                            "express" => stack.frameworks.push("Express".to_string()),
                            "fastify" => stack.frameworks.push("Fastify".to_string()),
                            "zustand" | "redux" | "mobx" => {
                                stack.key_dependencies.push(name.clone());
                            }
                            "@tanstack/react-query" | "swr" => {
                                stack.key_dependencies.push(name.clone());
                            }
                            "tailwindcss" | "shadcn-ui" => {
                                stack.key_dependencies.push(name.clone());
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    // Check for Cargo.toml (Rust)
    let cargo_toml_path = project_path.join("Cargo.toml");
    if cargo_toml_path.exists() {
        stack.languages.push("Rust".to_string());

        if let Ok(content) = std::fs::read_to_string(&cargo_toml_path) {
            if let Ok(toml) = toml::from_str::<toml::Value>(&content) {
                if let Some(deps) = toml.get("dependencies").and_then(|d| d.as_table()) {
                    for name in deps.keys() {
                        match name.as_str() {
                            "axum" => stack.frameworks.push("Axum".to_string()),
                            "actix-web" => stack.frameworks.push("Actix".to_string()),
                            "rocket" => stack.frameworks.push("Rocket".to_string()),
                            "tokio" | "serde" | "sqlx" | "diesel" => {
                                stack.key_dependencies.push(name.clone());
                            }
                            _ => {}
                        }
                    }
                }
            }
        }
    }

    // Check for Python
    let pyproject_path = project_path.join("pyproject.toml");
    let requirements_path = project_path.join("requirements.txt");
    if pyproject_path.exists() || requirements_path.exists() {
        stack.languages.push("Python".to_string());
    }

    // Check for Go
    let go_mod_path = project_path.join("go.mod");
    if go_mod_path.exists() {
        stack.languages.push("Go".to_string());
    }

    // Check for Flutter/Dart
    let pubspec_path = project_path.join("pubspec.yaml");
    if pubspec_path.exists() {
        stack.languages.push("Dart".to_string());
        stack.frameworks.push("Flutter".to_string());
    }

    stack
}

fn get_top_level_dirs(project_path: &Path) -> Vec<String> {
    let mut dirs = Vec::new();

    if let Ok(entries) = std::fs::read_dir(project_path) {
        for entry in entries.filter_map(|e| e.ok()) {
            if entry.path().is_dir() {
                let name = entry.file_name().to_string_lossy().to_string();
                // Skip hidden, node_modules, target, dist
                if !name.starts_with('.')
                    && name != "node_modules"
                    && name != "target"
                    && name != "dist"
                    && name != "__pycache__"
                    && name != ".git"
                {
                    dirs.push(name);
                }
            }
        }
    }

    dirs.sort();
    dirs.truncate(10); // Keep top 10 directories
    dirs
}

fn generate_suggestions(analysis: &PrdCodebaseAnalysis) -> Vec<String> {
    let mut suggestions = Vec::new();

    // Framework-specific suggestions
    for framework in &analysis.frameworks {
        match framework.as_str() {
            "React" | "Vue" | "Svelte" => {
                suggestions
                    .push("Consider component architecture and state management".to_string());
            }
            "Next.js" => {
                suggestions
                    .push("Consider SSR/SSG strategy and API routes for new features".to_string());
            }
            "Axum" | "Actix" | "Express" | "Fastify" => {
                suggestions
                    .push("Consider API endpoint structure and middleware patterns".to_string());
            }
            "Flutter" => {
                suggestions
                    .push("Consider widget hierarchy and state management patterns".to_string());
            }
            _ => {}
        }
    }

    // Existing context suggestions
    if analysis.has_claude_md {
        suggestions.push("Review existing CLAUDE.md for project conventions".to_string());
    }

    if analysis.has_existing_context {
        suggestions.push("Leverage existing project context files".to_string());
    }

    suggestions
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_analyze_empty_project() {
        let temp_dir = TempDir::new().unwrap();
        let analysis = analyze_project_for_prd(temp_dir.path()).unwrap();

        assert!(analysis.project_name.is_some());
        assert!(!analysis.has_claude_md);
        assert!(analysis.languages.is_empty());
    }

    #[test]
    fn test_analyze_with_package_json() {
        let temp_dir = TempDir::new().unwrap();

        std::fs::write(
            temp_dir.path().join("package.json"),
            r#"{"dependencies": {"react": "^18.0.0", "zustand": "^4.0.0"}}"#,
        )
        .unwrap();

        let analysis = analyze_project_for_prd(temp_dir.path()).unwrap();

        assert!(analysis
            .languages
            .contains(&"JavaScript/TypeScript".to_string()));
        assert!(analysis.frameworks.contains(&"React".to_string()));
        assert!(analysis.key_dependencies.contains(&"zustand".to_string()));
    }

    #[test]
    fn test_analyze_with_cargo_toml() {
        let temp_dir = TempDir::new().unwrap();

        std::fs::write(
            temp_dir.path().join("Cargo.toml"),
            r#"[dependencies]
axum = "0.7"
tokio = { version = "1.0", features = ["full"] }"#,
        )
        .unwrap();

        let analysis = analyze_project_for_prd(temp_dir.path()).unwrap();

        assert!(analysis.languages.contains(&"Rust".to_string()));
        assert!(analysis.frameworks.contains(&"Axum".to_string()));
        assert!(analysis.key_dependencies.contains(&"tokio".to_string()));
    }

    #[test]
    fn test_analyze_with_claude_md() {
        let temp_dir = TempDir::new().unwrap();

        std::fs::write(
            temp_dir.path().join("CLAUDE.md"),
            "# Project Overview\n\nThis is a test project with coding conventions.",
        )
        .unwrap();

        let analysis = analyze_project_for_prd(temp_dir.path()).unwrap();

        assert!(analysis.has_claude_md);
        assert!(analysis.claude_md_summary.is_some());
    }

    #[test]
    fn test_format_analysis() {
        let analysis = PrdCodebaseAnalysis {
            project_name: Some("my-app".to_string()),
            languages: vec!["Rust".to_string()],
            frameworks: vec!["Axum".to_string()],
            key_dependencies: vec!["tokio".to_string()],
            directory_structure: vec!["src".to_string(), "tests".to_string()],
            ..Default::default()
        };

        let formatted = format_analysis_for_prompt(&analysis);

        assert!(formatted.contains("my-app"));
        assert!(formatted.contains("Rust"));
        assert!(formatted.contains("Axum"));
        assert!(formatted.contains("tokio"));
    }
}
