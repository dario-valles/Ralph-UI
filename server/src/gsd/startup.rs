//! Startup assistance for GSD workflow
//!
//! Handles project type detection, context quality analysis, and smart suggestions.

use crate::agents::providers::get_provider;
use crate::agents::{AgentSpawnConfig, AgentSpawnMode};
use crate::gsd::state::QuestioningContext;
use crate::models::AgentType;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::process::Stdio;
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::Mutex;

/// Project types with tailored question flows
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectType {
    WebApp,
    CliTool,
    ApiService,
    Library,
    MobileApp,
    DesktopApp,
    DataPipeline,
    DevopsTool,
    Documentation,
    Other,
}

impl Default for ProjectType {
    fn default() -> Self {
        Self::Other
    }
}

/// Result of project type detection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTypeDetection {
    pub detected_type: ProjectType,
    pub confidence: ConfidenceLevel,
    pub evidence: Vec<String>,
    pub suggested_frameworks: Vec<String>,
    pub needs_confirmation: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConfidenceLevel {
    High,
    Medium,
    Low,
}

/// Context quality analysis result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextQualityReport {
    pub specificity_score: u32,
    pub completeness_score: u32,
    pub actionability_score: u32,
    pub overall_score: u32,
    pub issues: Vec<ContextQualityIssue>,
    pub suggestions: Vec<String>,
    pub is_good_enough: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextQualityIssue {
    pub issue_type: String,
    pub message: String,
    pub severity: String, // error, warning, info
    pub field: String,    // what, why, who, done, general
}

/// Smart context suggestions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSuggestions {
    pub project_type: ProjectType,
    pub what: Vec<String>,
    pub why: Vec<String>,
    pub who: Vec<String>,
    pub done: Vec<String>,
}

/// AI-generated project idea
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedIdea {
    pub id: String,
    pub title: String,
    pub summary: String,
    pub context: QuestioningContext,
    pub suggested_features: Vec<String>,
    pub tech_stack: Option<Vec<String>>,
}

/// Detect project type from file structure
pub fn detect_project_type(project_path: &Path) -> ProjectTypeDetection {
    let mut evidence = Vec::new();
    let mut frameworks = Vec::new();
    let mut detected_type = ProjectType::Other;
    let mut confidence = ConfidenceLevel::Low;

    // Check for package.json (Node.js)
    if project_path.join("package.json").exists() {
        evidence.push("Found package.json".to_string());

        // Try to read package.json for dependencies
        if let Ok(content) = std::fs::read_to_string(project_path.join("package.json")) {
            if content.contains("\"react\"")
                || content.contains("\"next\"")
                || content.contains("\"vue\"")
            {
                detected_type = ProjectType::WebApp;
                confidence = ConfidenceLevel::High;
                if content.contains("\"react\"") {
                    frameworks.push("React".to_string());
                }
                if content.contains("\"next\"") {
                    frameworks.push("Next.js".to_string());
                }
                if content.contains("\"vue\"") {
                    frameworks.push("Vue".to_string());
                }
                evidence.push("Found frontend framework dependencies".to_string());
            } else if content.contains("\"express\"")
                || content.contains("\"nest\"")
                || content.contains("\"fastify\"")
            {
                detected_type = ProjectType::ApiService;
                confidence = ConfidenceLevel::High;
                evidence.push("Found backend framework dependencies".to_string());
            } else if content.contains("\"commander\"")
                || content.contains("\"yargs\"")
                || content.contains("\"oclif\"")
            {
                detected_type = ProjectType::CliTool;
                confidence = ConfidenceLevel::High;
                evidence.push("Found CLI dependencies".to_string());
            } else if content.contains("\"electron\"") || content.contains("\"tauri\"") {
                detected_type = ProjectType::DesktopApp;
                confidence = ConfidenceLevel::High;
                evidence.push("Found desktop app dependencies".to_string());
            } else {
                // Generic JS project
                confidence = ConfidenceLevel::Medium;
            }
        }
    }

    // Check for Cargo.toml (Rust)
    if project_path.join("Cargo.toml").exists() {
        evidence.push("Found Cargo.toml".to_string());
        if confidence == ConfidenceLevel::Low {
            // Try to read Cargo.toml
            if let Ok(content) = std::fs::read_to_string(project_path.join("Cargo.toml")) {
                if content.contains("clap") || content.contains("structopt") {
                    detected_type = ProjectType::CliTool;
                    confidence = ConfidenceLevel::High;
                    evidence.push("Found CLI dependencies (clap)".to_string());
                } else if content.contains("axum")
                    || content.contains("actix-web")
                    || content.contains("rocket")
                {
                    detected_type = ProjectType::ApiService;
                    confidence = ConfidenceLevel::High;
                    evidence.push("Found web framework dependencies".to_string());
                } else if content.contains("tauri") {
                    detected_type = ProjectType::DesktopApp;
                    confidence = ConfidenceLevel::High;
                    evidence.push("Found Tauri dependency".to_string());
                } else {
                    detected_type = ProjectType::CliTool; // Default assumption for Rust
                    confidence = ConfidenceLevel::Medium;
                }
            }
        }
    }

    // Check for other indicators if still low confidence
    if confidence == ConfidenceLevel::Low {
        if project_path.join("index.html").exists()
            || project_path.join("public/index.html").exists()
        {
            detected_type = ProjectType::WebApp;
            confidence = ConfidenceLevel::Medium;
            evidence.push("Found index.html".to_string());
        } else if project_path.join("go.mod").exists() {
            evidence.push("Found go.mod".to_string());
            // Go is often used for CLIs or APIs
            detected_type = ProjectType::ApiService;
            confidence = ConfidenceLevel::Medium;
        } else if project_path.join("requirements.txt").exists()
            || project_path.join("pyproject.toml").exists()
        {
            evidence.push("Found Python configuration".to_string());
            // Python could be anything, assume Script/Data
            detected_type = ProjectType::DataPipeline;
            confidence = ConfidenceLevel::Low;
        }
    }

    ProjectTypeDetection {
        detected_type,
        confidence,
        evidence,
        suggested_frameworks: frameworks,
        needs_confirmation: confidence != ConfidenceLevel::High,
    }
}

/// Extract clean JSON content from Claude Code stream-json output.
///
/// Similar to the research orchestrator, this extracts structured JSON from
/// stream-json format output.
fn extract_json_from_stream<T: for<'de> Deserialize<'de>>(raw_output: &str) -> Result<T, String> {
    // Search from the end since the "result" message is typically last
    for line in raw_output.lines().rev() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if let Ok(json) = serde_json::from_str::<Value>(line) {
            // Look for {"type":"result","subtype":"success","result":{...}}
            if json.get("type").and_then(|t| t.as_str()) == Some("result") {
                if let Some(result) = json.get("result") {
                    if serde_json::from_value::<T>(result.clone()).is_ok() {
                        return serde_json::from_value::<T>(result.clone())
                            .map_err(|e| format!("Failed to parse result: {}", e));
                    }
                }
            }
        }
    }

    // Fallback: try to parse the entire output as JSON
    serde_json::from_str::<T>(raw_output).map_err(|e| format!("Failed to parse JSON output: {}", e))
}

/// Run an AI agent and extract structured JSON output
async fn run_agent_for_json<T: for<'de> Deserialize<'de>>(
    agent_type: AgentType,
    prompt: &str,
    project_path: &Path,
    model: Option<String>,
    env_vars: Option<std::collections::HashMap<String, String>>,
) -> Result<T, String> {
    let provider = get_provider(&agent_type);

    // Check if the agent is available
    if !provider.is_available() {
        return Err(format!(
            "{:?} CLI not found. Please ensure it is installed and in PATH.",
            agent_type
        ));
    }

    // Build the agent spawn config for text generation
    let spawn_config = AgentSpawnConfig {
        agent_type,
        task_id: format!("gsd-startup-{}", uuid::Uuid::new_v4()),
        worktree_path: project_path.display().to_string(),
        branch: "main".to_string(),
        max_iterations: 1, // Single turn for JSON generation
        prompt: Some(prompt.to_string()),
        model,
        spawn_mode: AgentSpawnMode::Piped,
        plugin_config: None,
        env_vars,
        disable_tools: true, // Disable tools for pure text generation
    };

    // Build the command using the provider
    let std_cmd = provider
        .build_command(&spawn_config)
        .map_err(|e| format!("Failed to build command: {}", e))?;

    // Convert to tokio command
    let mut cmd = Command::from(std_cmd);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // Spawn the process
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn {:?}: {}", agent_type, e))?;

    // Take stdout for streaming
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    // Collect output
    let output_buffer = Arc::new(Mutex::new(String::new()));
    let output_clone = output_buffer.clone();

    // Stream stdout
    let stdout_reader = BufReader::new(stdout);
    let mut lines = stdout_reader.lines();

    // Process lines as they come in
    while let Ok(Some(line)) = lines.next_line().await {
        // Append raw line to buffer for extraction later
        let mut buffer = output_clone.lock().await;
        buffer.push_str(&line);
        buffer.push('\n');
    }

    // Wait for process to complete
    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for {:?}: {}", agent_type, e))?;

    // Collect any stderr
    let stderr_reader = BufReader::new(stderr);
    let mut stderr_lines = stderr_reader.lines();
    let mut stderr_output = String::new();
    while let Ok(Some(line)) = stderr_lines.next_line().await {
        stderr_output.push_str(&line);
        stderr_output.push('\n');
    }

    // Get final output
    let output = output_buffer.lock().await;

    if !status.success() {
        let error_msg = if !stderr_output.trim().is_empty() {
            stderr_output
        } else {
            format!("Process exited with status: {}", status)
        };
        return Err(format!("{:?} failed: {}", agent_type, error_msg));
    }

    if output.trim().is_empty() {
        return Err(format!("{:?} returned empty output", agent_type));
    }

    // Extract JSON from stream
    extract_json_from_stream::<T>(&output)
}

/// Analyze context quality using AI
pub async fn analyze_context_quality(
    context: &QuestioningContext,
    project_type: Option<ProjectType>,
    project_path: &Path,
    model: Option<String>,
    env_vars: Option<std::collections::HashMap<String, String>>,
) -> Result<ContextQualityReport, String> {
    let agent_type = AgentType::Claude; // Default to Claude for now

    // Build the prompt for context quality analysis
    let prompt = format!(
        r#"You are an expert product manager analyzing a project idea for quality and completeness.

Analyze the following project context and provide a detailed quality assessment.

**Project Type:** {:?}
**What:** {}
**Why:** {}
**Who:** {}
**Done:** {}

Provide your assessment as a JSON object with this exact structure:
{{
  "specificityScore": <0-100 number>,
  "completenessScore": <0-100 number>,
  "actionabilityScore": <0-100 number>,
  "overallScore": <0-100 number>,
  "issues": [
    {{
      "issueType": <"vague" | "missing" | "unclear" | "incomplete">,
      "message": <specific, actionable feedback>,
      "severity": <"error" | "warning" | "info">,
      "field": <"what" | "why" | "who" | "done" | "general">
    }}
  ],
  "suggestions": [
    <specific, actionable suggestions for improvement>
  ],
  "isGoodEnough": <true if overallScore >= 70, false otherwise>
}}

Scoring criteria:
- **Specificity** (0-100): How specific and concrete is the description?
- **Completeness** (0-100): Are all 4 fields (what/why/who/done) filled out?
- **Actionability** (0-100): Can a developer start working based on this?
- **Overall** (0-100): Weighted average (specificity: 40%, completeness: 30%, actionability: 30%)

Return ONLY the JSON object, no additional text."#,
        project_type.unwrap_or(ProjectType::Other),
        context.what.as_deref().unwrap_or("(not provided)"),
        context.why.as_deref().unwrap_or("(not provided)"),
        context.who.as_deref().unwrap_or("(not provided)"),
        context.done.as_deref().unwrap_or("(not provided)")
    );

    run_agent_for_json::<ContextQualityReport>(agent_type, &prompt, project_path, model, env_vars)
        .await
}

/// Generate smart context suggestions using AI
pub async fn generate_context_suggestions(
    project_type: ProjectType,
    context: &QuestioningContext,
    project_path: &Path,
    model: Option<String>,
    env_vars: Option<std::collections::HashMap<String, String>>,
) -> Result<ContextSuggestions, String> {
    let agent_type = AgentType::Claude; // Default to Claude for now

    // Build the prompt for context suggestions
    let prompt = format!(
        r#"You are an expert product manager helping a user flesh out their project idea.

**Project Type:** {:?}
**Current Context:**
- What: {}
- Why: {}
- Who: {}
- Done: {}

Generate 3 specific, actionable suggestions for EACH empty or vague field (what/why/who/done).
Suggestions should be:
- Specific to the project type
- Actionable and concrete
- Different from each other (variety)
- Based on the current context if available

Provide your suggestions as a JSON object with this exact structure:
{{
  "projectType": {:?},
  "what": [
    <3 specific suggestions for the "what" field, or empty if already good>
  ],
  "why": [
    <3 specific suggestions for the "why" field>
  ],
  "who": [
    <3 specific suggestions for the "who" field>
  ],
  "done": [
    <3 specific suggestions for the "done" field>
  ]
}}

Each suggestion should be 1-2 sentences, concrete and actionable.

Return ONLY the JSON object, no additional text."#,
        project_type,
        context.what.as_deref().unwrap_or("(not provided)"),
        context.why.as_deref().unwrap_or("(not provided)"),
        context.who.as_deref().unwrap_or("(not provided)"),
        context.done.as_deref().unwrap_or("(not provided)"),
        project_type
    );

    run_agent_for_json::<ContextSuggestions>(agent_type, &prompt, project_path, model, env_vars)
        .await
}

/// Generate project idea starters using AI
pub async fn generate_idea_starters(
    project_type: ProjectType,
    context: &QuestioningContext,
    project_path: &Path,
    model: Option<String>,
    env_vars: Option<std::collections::HashMap<String, String>>,
) -> Result<Vec<GeneratedIdea>, String> {
    let agent_type = AgentType::Claude; // Default to Claude for now

    // Build the prompt for idea starters
    let prompt = format!(
        r#"You are an expert product manager helping a user brainstorm project ideas.

**Project Type:** {:?}
**Current Context:**
- What: {}
- Why: {}
- Who: {}
- Done: {}

Generate 3 complete, concrete project ideas based on the project type and any context provided.
Each idea should be ready to implement and include all 4 context fields (what/why/who/done).

Provide your ideas as a JSON array with this exact structure:
[
  {{
    "id": <unique ID like "idea-1">,
    "title": <catchy, descriptive title>,
    "summary": <2-3 sentence overview of the idea>,
    "techStack": [
      <3-5 relevant technologies for this project type>
    ],
    "suggestedFeatures": [
      <3-5 key features, each 3-5 words>
    ],
    "context": {{
      "what": <specific description of what to build, 2-3 sentences>,
      "why": <clear problem statement and motivation, 2-3 sentences>,
      "who": <target users/stakeholders, 1-2 sentences>,
      "done": <clear success criteria, 2-3 sentences>
    }}
  }}
]

Ideas should be:
- Specific to the project type
- Realistic and implementable
- Diverse (different approaches/use cases)
- Complete with all context fields
- Actionable with clear success criteria

Return ONLY the JSON array, no additional text."#,
        project_type,
        context.what.as_deref().unwrap_or("(not provided)"),
        context.why.as_deref().unwrap_or("(not provided)"),
        context.who.as_deref().unwrap_or("(not provided)"),
        context.done.as_deref().unwrap_or("(not provided)")
    );

    run_agent_for_json::<Vec<GeneratedIdea>>(agent_type, &prompt, project_path, model, env_vars)
        .await
}
