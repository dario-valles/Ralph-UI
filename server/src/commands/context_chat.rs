//! Context Chat commands - AI-assisted project context generation
//!
//! Provides a chat interface for generating project context files through
//! conversational AI that analyzes the codebase and asks targeted questions.

use crate::file_storage::context_ops;
use crate::models::context::{
    ContextChatMessage, ContextChatSession, ContextMode, DependencyInfo, ProjectAnalysis,
    TechStackInfo,
};
use crate::models::prd_chat::MessageRole;
use crate::server::EventBroadcaster;
use crate::utils::as_path;
use chrono::Utc;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::sync::Arc;
use uuid::Uuid;

// ============================================================================
// Request/Response Types
// ============================================================================

/// Request to start a context chat session
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartContextChatRequest {
    pub project_path: String,
    pub agent_type: String,
}

/// Request to send a message in context chat
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendContextChatMessageRequest {
    pub session_id: String,
    pub project_path: String,
    pub content: String,
}

/// Response from sending a message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendContextChatMessageResponse {
    pub user_message: ContextChatMessage,
    pub assistant_message: ContextChatMessage,
    /// Extracted context content if found in response
    pub extracted_context: Option<String>,
}

// ============================================================================
// Session Commands
// ============================================================================

/// Start a new context chat session
pub async fn start_context_chat_session(
    request: StartContextChatRequest,
) -> Result<ContextChatSession, String> {
    let project_path_str = request.project_path.clone();
    let project_path = as_path(&request.project_path);

    // Initialize .ralph-ui directory if needed
    crate::file_storage::init_ralph_ui_dir(project_path)
        .map_err(|e| format!("Failed to initialize .ralph-ui directory: {}", e))?;

    // Analyze the project to prepare context for the chat
    let analysis = analyze_project(project_path)?;

    let now = Utc::now();
    let session = ContextChatSession {
        id: Uuid::new_v4().to_string(),
        project_path: project_path_str,
        agent_type: request.agent_type,
        analysis,
        extracted_context: None,
        context_saved: false,
        created_at: now,
        updated_at: now,
        message_count: 0,
        external_session_id: None,
    };

    context_ops::create_context_chat_session(project_path, &session)?;

    Ok(session)
}

/// List all context chat sessions for a project
pub async fn list_context_chat_sessions(
    project_path: String,
) -> Result<Vec<ContextChatSession>, String> {
    context_ops::list_context_chat_sessions(as_path(&project_path))
}

/// Get a context chat session by ID
pub async fn get_context_chat_session(
    session_id: String,
    project_path: String,
) -> Result<ContextChatSession, String> {
    context_ops::get_context_chat_session(as_path(&project_path), &session_id)
}

/// Delete a context chat session
pub async fn delete_context_chat_session(
    session_id: String,
    project_path: String,
) -> Result<(), String> {
    context_ops::delete_context_chat_session(as_path(&project_path), &session_id)
}

/// Get all messages for a context chat session
pub async fn get_context_chat_messages(
    session_id: String,
    project_path: String,
) -> Result<Vec<ContextChatMessage>, String> {
    context_ops::get_context_chat_messages(as_path(&project_path), &session_id)
}

// ============================================================================
// Messaging Commands
// ============================================================================

/// Send a message to the context chat and get an AI response
pub async fn send_context_chat_message(
    app_handle: Arc<EventBroadcaster>,
    request: SendContextChatMessageRequest,
) -> Result<SendContextChatMessageResponse, String> {
    let project_path = as_path(&request.project_path);

    // Get session
    let session = context_ops::get_context_chat_session(project_path, &request.session_id)?;

    let now = Utc::now();

    // Store user message
    let user_message = ContextChatMessage {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id.clone(),
        role: MessageRole::User,
        content: request.content.clone(),
        created_at: now,
    };

    context_ops::add_context_chat_message(project_path, &request.session_id, &user_message)?;

    // Get chat history
    let history = context_ops::get_context_chat_messages(project_path, &request.session_id)?;

    // Check if we have an existing external session for resume support
    let has_external_session = session.external_session_id.is_some();

    // Build prompt
    let prompt =
        build_context_chat_prompt(&session, &history, &request.content, has_external_session);

    // Parse agent type
    let agent_type = session
        .agent_type
        .parse::<crate::models::AgentType>()
        .map_err(|e| format!("Invalid agent type: {}", e))?;

    // Execute CLI agent
    let emitter = crate::commands::prd_chat::agent_executor::BroadcastEmitter::new(app_handle);
    let agent_result = crate::commands::prd_chat::agent_executor::execute_chat_agent(
        &emitter,
        &request.session_id,
        agent_type,
        &prompt,
        Some(&request.project_path),
        session.external_session_id.as_deref(),
    )
    .await
    .map_err(|e| format!("Agent execution failed: {}", e))?;

    let response_now = Utc::now();
    let response_content = agent_result.content;

    // Store assistant message
    let assistant_message = ContextChatMessage {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id.clone(),
        role: MessageRole::Assistant,
        content: response_content.clone(),
        created_at: response_now,
    };

    context_ops::add_context_chat_message(project_path, &request.session_id, &assistant_message)?;

    // If we captured a new external session ID, save it for future resume
    if let Some(captured_id) = agent_result.captured_session_id {
        if let Err(e) = context_ops::update_context_chat_external_id(
            project_path,
            &request.session_id,
            Some(captured_id),
        ) {
            log::warn!("Failed to save external session ID for resume: {}", e);
        }
    }

    // Extract context if present in response
    let extracted_context = extract_context_block(&response_content);
    if extracted_context.is_some() {
        context_ops::update_context_chat_extracted(
            project_path,
            &request.session_id,
            extracted_context.clone(),
        )?;
    }

    Ok(SendContextChatMessageResponse {
        user_message,
        assistant_message,
        extracted_context,
    })
}

/// Save extracted context from a chat session to the context file
pub async fn save_context_from_chat(
    session_id: String,
    project_path: String,
    content: Option<String>,
) -> Result<(), String> {
    let project_path_obj = as_path(&project_path);

    // Get content to save - either provided or from session
    let context_content = if let Some(content) = content {
        content
    } else {
        let session = context_ops::get_context_chat_session(project_path_obj, &session_id)?;
        session
            .extracted_context
            .ok_or_else(|| "No extracted context found in session".to_string())?
    };

    // Save to context file
    context_ops::save_context_content(
        project_path_obj,
        "context",
        &context_content,
        ContextMode::Single,
    )?;

    // Auto-enable context injection when saving from chat
    let mut config = context_ops::read_context_config(project_path_obj)?;
    config.enabled = true;
    config.include_in_prd_chat = true;
    context_ops::save_context_config(project_path_obj, &config)?;

    // Mark session as saved
    context_ops::mark_context_chat_saved(project_path_obj, &session_id)?;

    Ok(())
}

// ============================================================================
// Project Analysis
// ============================================================================

/// Analyze a project to gather context for the chat
fn analyze_project(project_path: &Path) -> Result<ProjectAnalysis, String> {
    let mut analysis = ProjectAnalysis::default();

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
            // Extract first ~500 chars as summary
            let summary: String = content.chars().take(500).collect();
            analysis.claude_md_summary = Some(if content.len() > 500 {
                format!("{}...", summary)
            } else {
                summary
            });
        }
    }

    // Detect tech stack from common files
    analysis.detected_stack = detect_tech_stack(project_path);

    // Summarize file structure
    analysis.file_structure_summary = summarize_file_structure(project_path);

    // Load existing context if any
    if let Ok(context) = context_ops::get_project_context(project_path) {
        if context.is_configured() {
            analysis.existing_context = Some(context.get_combined_content());
        }
    }

    Ok(analysis)
}

/// Detect tech stack from project files
fn detect_tech_stack(project_path: &Path) -> TechStackInfo {
    let mut info = TechStackInfo::default();

    // Check for package.json (Node.js/JavaScript)
    let package_json_path = project_path.join("package.json");
    if package_json_path.exists() {
        info.languages.push("JavaScript/TypeScript".to_string());
        info.package_manager = Some("npm/yarn/bun".to_string());

        if let Ok(content) = std::fs::read_to_string(&package_json_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                // Extract dependencies
                if let Some(deps) = json.get("dependencies").and_then(|d| d.as_object()) {
                    for (name, version) in deps.iter().take(10) {
                        let category = categorize_js_dependency(name);
                        info.dependencies.push(DependencyInfo {
                            name: name.clone(),
                            version: version.as_str().map(|s| s.to_string()),
                            category,
                            is_dev: false,
                        });
                    }
                }

                // Detect frameworks
                if json.get("dependencies").map(|d| d.get("react")).is_some() {
                    info.frameworks.push("React".to_string());
                }
                if json.get("dependencies").map(|d| d.get("next")).is_some() {
                    info.frameworks.push("Next.js".to_string());
                }
                if json.get("dependencies").map(|d| d.get("vue")).is_some() {
                    info.frameworks.push("Vue".to_string());
                }
            }
        }
    }

    // Check for Cargo.toml (Rust)
    let cargo_toml_path = project_path.join("Cargo.toml");
    if cargo_toml_path.exists() {
        info.languages.push("Rust".to_string());
        info.package_manager = Some("Cargo".to_string());

        if let Ok(content) = std::fs::read_to_string(&cargo_toml_path) {
            if let Ok(toml) = toml::from_str::<toml::Value>(&content) {
                if let Some(deps) = toml.get("dependencies").and_then(|d| d.as_table()) {
                    for (name, value) in deps.iter().take(10) {
                        let version = match value {
                            toml::Value::String(v) => Some(v.clone()),
                            toml::Value::Table(t) => t
                                .get("version")
                                .and_then(|v| v.as_str().map(|s| s.to_string())),
                            _ => None,
                        };
                        let category = categorize_rust_dependency(name);
                        info.dependencies.push(DependencyInfo {
                            name: name.clone(),
                            version,
                            category,
                            is_dev: false,
                        });

                        // Detect frameworks
                        if name == "axum" || name == "actix-web" || name == "rocket" {
                            info.frameworks.push(name.clone());
                        }
                    }
                }
            }
        }
    }

    // Check for pyproject.toml or requirements.txt (Python)
    let pyproject_path = project_path.join("pyproject.toml");
    let requirements_path = project_path.join("requirements.txt");
    if pyproject_path.exists() || requirements_path.exists() {
        info.languages.push("Python".to_string());
        info.package_manager = Some("pip/poetry".to_string());
    }

    // Check for go.mod (Go)
    let go_mod_path = project_path.join("go.mod");
    if go_mod_path.exists() {
        info.languages.push("Go".to_string());
        info.package_manager = Some("Go Modules".to_string());
    }

    // Detect tools
    if project_path.join(".eslintrc.js").exists()
        || project_path.join(".eslintrc.json").exists()
        || project_path.join("eslint.config.js").exists()
    {
        info.tools.push("ESLint".to_string());
    }
    if project_path.join(".prettierrc").exists() || project_path.join("prettier.config.js").exists()
    {
        info.tools.push("Prettier".to_string());
    }
    if project_path.join("vite.config.ts").exists() || project_path.join("vite.config.js").exists()
    {
        info.tools.push("Vite".to_string());
    }
    if project_path.join("Dockerfile").exists() {
        info.tools.push("Docker".to_string());
    }

    info
}

fn categorize_js_dependency(name: &str) -> String {
    match name {
        n if n.starts_with("@testing-library") || n.contains("jest") || n.contains("vitest") => {
            "testing".to_string()
        }
        n if n.contains("eslint") || n.contains("prettier") => "tooling".to_string(),
        n if n == "react" || n == "vue" || n == "angular" || n == "svelte" => {
            "framework".to_string()
        }
        n if n == "express" || n == "fastify" || n == "koa" || n == "hono" => "server".to_string(),
        n if n.contains("webpack") || n.contains("vite") || n.contains("rollup") => {
            "bundler".to_string()
        }
        _ => "library".to_string(),
    }
}

fn categorize_rust_dependency(name: &str) -> String {
    match name {
        "tokio" | "async-std" => "async runtime".to_string(),
        "serde" | "serde_json" => "serialization".to_string(),
        "axum" | "actix-web" | "rocket" | "warp" => "web framework".to_string(),
        "sqlx" | "diesel" | "sea-orm" => "database".to_string(),
        n if n.contains("test") => "testing".to_string(),
        _ => "library".to_string(),
    }
}

/// Summarize the file structure of a project
fn summarize_file_structure(project_path: &Path) -> String {
    let mut summary = String::new();

    // List top-level directories
    if let Ok(entries) = std::fs::read_dir(project_path) {
        let mut dirs: Vec<String> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.path().is_dir())
            .filter(|e| {
                let name = e.file_name().to_string_lossy().to_string();
                !name.starts_with('.')
                    && name != "node_modules"
                    && name != "target"
                    && name != "dist"
            })
            .map(|e| e.file_name().to_string_lossy().to_string())
            .collect();

        dirs.sort();

        if !dirs.is_empty() {
            summary.push_str("Key directories: ");
            summary.push_str(&dirs.join(", "));
        }
    }

    summary
}

// ============================================================================
// Prompt Building
// ============================================================================

/// Build the prompt for context chat
fn build_context_chat_prompt(
    session: &ContextChatSession,
    history: &[ContextChatMessage],
    current_message: &str,
    has_external_session: bool,
) -> String {
    let mut prompt = String::new();

    // System prompt for context gathering
    prompt.push_str(CONTEXT_CHAT_SYSTEM_PROMPT);

    // Add project analysis
    prompt.push_str("\n\n=== PRE-LOADED PROJECT ANALYSIS ===\n\n");

    if let Some(name) = &session.analysis.project_name {
        prompt.push_str(&format!("**Project Name:** {}\n\n", name));
    }

    if session.analysis.has_claude_md {
        prompt.push_str("**CLAUDE.md detected** - This project has an existing CLAUDE.md file.\n");
        if let Some(summary) = &session.analysis.claude_md_summary {
            prompt.push_str("Summary:\n```\n");
            prompt.push_str(summary);
            prompt.push_str("\n```\n\n");
        }
    }

    if !session.analysis.detected_stack.languages.is_empty() {
        prompt.push_str(&format!(
            "**Languages:** {}\n",
            session.analysis.detected_stack.languages.join(", ")
        ));
    }

    if !session.analysis.detected_stack.frameworks.is_empty() {
        prompt.push_str(&format!(
            "**Frameworks:** {}\n",
            session.analysis.detected_stack.frameworks.join(", ")
        ));
    }

    if !session.analysis.detected_stack.dependencies.is_empty() {
        prompt.push_str("**Key Dependencies:**\n");
        for dep in &session.analysis.detected_stack.dependencies {
            let version_str = dep.version.as_deref().unwrap_or("*");
            prompt.push_str(&format!(
                "- {} ({}) - {}\n",
                dep.name, version_str, dep.category
            ));
        }
        prompt.push('\n');
    }

    if !session.analysis.detected_stack.tools.is_empty() {
        prompt.push_str(&format!(
            "**Tools:** {}\n",
            session.analysis.detected_stack.tools.join(", ")
        ));
    }

    if !session.analysis.file_structure_summary.is_empty() {
        prompt.push_str(&format!(
            "**Structure:** {}\n",
            session.analysis.file_structure_summary
        ));
    }

    if let Some(existing) = &session.analysis.existing_context {
        prompt.push_str("\n**Existing Context (to update):**\n```markdown\n");
        prompt.push_str(existing);
        prompt.push_str("\n```\n");
    }

    prompt.push_str("\n=== END PROJECT ANALYSIS ===\n\n");

    // Include conversation history unless resuming external session
    if !has_external_session && !history.is_empty() {
        prompt.push_str("=== Conversation History ===\n\n");
        for msg in history {
            let role_label = match msg.role {
                MessageRole::User => "User",
                MessageRole::Assistant => "Assistant",
                MessageRole::System => "System",
            };
            prompt.push_str(&format!("{}: {}\n\n", role_label, msg.content));
        }
        prompt.push_str("=== End History ===\n\n");
    }

    prompt.push_str(&format!("User: {}\n\nAssistant:", current_message));
    prompt
}

/// Extract context block from AI response
fn extract_context_block(response: &str) -> Option<String> {
    // Look for <context>...</context> blocks
    let re = Regex::new(r"(?s)<context>(.*?)</context>").ok()?;
    if let Some(caps) = re.captures(response) {
        return Some(caps.get(1)?.as_str().trim().to_string());
    }

    // Also look for ```context blocks
    let re = Regex::new(r"(?s)```context\s*(.*?)```").ok()?;
    if let Some(caps) = re.captures(response) {
        return Some(caps.get(1)?.as_str().trim().to_string());
    }

    None
}

// ============================================================================
// System Prompt
// ============================================================================

const CONTEXT_CHAT_SYSTEM_PROMPT: &str = r#"You are a Project Context Analyst helping the user document their project for AI agents.

YOUR GOAL:
Generate a structured context.md file that helps AI coding agents understand this project.

The context should cover these areas:
1. **Product**: What is this project? Who uses it? What problems does it solve?
2. **Tech Stack**: Languages, frameworks, key dependencies, architecture patterns
3. **Conventions**: Coding style, naming patterns, file organization
4. **Workflow**: Development process (TDD, PR reviews, CI requirements)

INSTRUCTIONS:
- Review the pre-loaded project analysis to understand what's already known
- Ask focused questions about gaps in the analysis (2-3 questions at a time)
- After gathering enough information (typically 2-4 exchanges), offer to generate the context
- When ready, output the context file wrapped in <context> tags

QUESTION EXAMPLES:
- "What's the main purpose of this project in one sentence?"
- "Who are the target users?"
- "Are there specific coding conventions I should know about?"
- "What's your typical development workflow?"

CONTEXT FILE FORMAT:
When generating the final context, use this format:

<context>
# Project Context

## Product
[1-2 sentences about what this project is and who it's for]

## Tech Stack
- **Languages**: [list]
- **Frameworks**: [list]
- **Key Libraries**: [list with brief descriptions]
- **Architecture**: [brief description]

## Conventions
- [Key coding convention 1]
- [Key coding convention 2]
- [File organization pattern]

## Workflow
- [Development process note]
- [Testing requirement]
- [PR/review process]
</context>

Keep the context concise (~500-1500 characters). Focus on information that helps AI agents write better code.

DO NOT:
- Write actual code or modify files (except generating the context)
- Make assumptions about things not mentioned
- Include unnecessary details or boilerplate
"#;

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn test_extract_context_block_with_tags() {
        let response = r#"Here's the context I generated:

<context>
# Project Context

## Product
A todo app for developers.

## Tech Stack
- TypeScript
- React
</context>

Let me know if you'd like any changes!"#;

        let extracted = extract_context_block(response);
        assert!(extracted.is_some());
        let content = extracted.unwrap();
        assert!(content.contains("# Project Context"));
        assert!(content.contains("## Product"));
    }

    #[test]
    fn test_extract_context_block_with_code_fence() {
        let response = r#"Here's the context:

```context
# Project Context

## Product
A CLI tool.
```

Done!"#;

        let extracted = extract_context_block(response);
        assert!(extracted.is_some());
        assert!(extracted.unwrap().contains("# Project Context"));
    }

    #[test]
    fn test_extract_context_block_no_match() {
        let response = "Just a regular response without context blocks.";
        let extracted = extract_context_block(response);
        assert!(extracted.is_none());
    }

    #[test]
    fn test_analyze_project_basic() {
        let temp_dir = TempDir::new().unwrap();

        let analysis = analyze_project(temp_dir.path()).unwrap();

        assert!(analysis.project_name.is_some());
        assert!(!analysis.has_claude_md);
    }

    #[test]
    fn test_analyze_project_with_claude_md() {
        let temp_dir = TempDir::new().unwrap();

        // Create a CLAUDE.md file
        std::fs::write(
            temp_dir.path().join("CLAUDE.md"),
            "# Project Instructions\n\nThis is a test project.",
        )
        .unwrap();

        let analysis = analyze_project(temp_dir.path()).unwrap();

        assert!(analysis.has_claude_md);
        assert!(analysis.claude_md_summary.is_some());
        assert!(analysis
            .claude_md_summary
            .unwrap()
            .contains("Project Instructions"));
    }

    #[test]
    fn test_detect_tech_stack_node() {
        let temp_dir = TempDir::new().unwrap();

        // Create package.json
        std::fs::write(
            temp_dir.path().join("package.json"),
            r#"{
                "name": "test-app",
                "dependencies": {
                    "react": "^18.0.0",
                    "express": "^4.18.0"
                }
            }"#,
        )
        .unwrap();

        let stack = detect_tech_stack(temp_dir.path());

        assert!(stack
            .languages
            .contains(&"JavaScript/TypeScript".to_string()));
        assert!(stack.frameworks.contains(&"React".to_string()));
        assert!(!stack.dependencies.is_empty());
    }

    #[test]
    fn test_detect_tech_stack_rust() {
        let temp_dir = TempDir::new().unwrap();

        // Create Cargo.toml
        std::fs::write(
            temp_dir.path().join("Cargo.toml"),
            r#"[package]
name = "test-app"
version = "0.1.0"

[dependencies]
axum = "0.7"
tokio = { version = "1", features = ["full"] }
"#,
        )
        .unwrap();

        let stack = detect_tech_stack(temp_dir.path());

        assert!(stack.languages.contains(&"Rust".to_string()));
        assert!(stack.frameworks.contains(&"axum".to_string()));
    }

    #[test]
    fn test_categorize_js_dependency() {
        assert_eq!(categorize_js_dependency("jest"), "testing");
        assert_eq!(categorize_js_dependency("react"), "framework");
        assert_eq!(categorize_js_dependency("express"), "server");
        assert_eq!(categorize_js_dependency("eslint"), "tooling");
        assert_eq!(categorize_js_dependency("lodash"), "library");
    }

    #[test]
    fn test_categorize_rust_dependency() {
        assert_eq!(categorize_rust_dependency("tokio"), "async runtime");
        assert_eq!(categorize_rust_dependency("axum"), "web framework");
        assert_eq!(categorize_rust_dependency("serde"), "serialization");
        assert_eq!(categorize_rust_dependency("uuid"), "library");
    }

    #[tokio::test]
    async fn test_start_context_chat_session() {
        let temp_dir = TempDir::new().unwrap();
        crate::file_storage::init_ralph_ui_dir(temp_dir.path()).unwrap();

        let request = StartContextChatRequest {
            project_path: temp_dir.path().to_string_lossy().to_string(),
            agent_type: "claude".to_string(),
        };

        let session = start_context_chat_session(request).await.unwrap();

        assert!(!session.id.is_empty());
        assert_eq!(session.agent_type, "claude");
        assert!(!session.context_saved);
    }
}
