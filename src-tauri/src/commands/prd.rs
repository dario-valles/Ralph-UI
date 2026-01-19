// PRD Tauri commands
// NOTE: PRD content is always markdown. JSON format support was removed as the app is not yet released.

use crate::database::{Database, prd::*};
use crate::parsers;
use crate::session_files;
use serde::{Deserialize, Serialize};
use tauri::State;
use std::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatePRDRequest {
    pub title: String,
    pub description: Option<String>,
    pub template_id: Option<String>,
    pub project_path: Option<String>,
    pub prd_type: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePRDRequest {
    pub id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub content: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionConfig {
    pub session_name: Option<String>,
    pub agent_type: String,
    /// Execution strategy: sequential, dependency_first, priority, fifo, cost_first
    pub strategy: String,
    pub max_parallel: u8,
    pub max_iterations: u32,
    pub max_retries: u32,
    #[serde(rename = "autoCreatePRs")]
    pub auto_create_prs: bool,
    #[serde(rename = "draftPRs")]
    pub draft_prs: bool,
    pub run_tests: bool,
    pub run_lint: bool,
    #[serde(default)]
    pub dry_run: bool,
    /// Optional model to use for agents
    #[serde(default)]
    pub model: Option<String>,
}

/// Create a new PRD document
#[tauri::command]
pub async fn create_prd(
    request: CreatePRDRequest,
    db: State<'_, Mutex<Database>>,
) -> Result<PRDDocument, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    let now = chrono::Utc::now().to_rfc3339();
    let prd_id = Uuid::new_v4().to_string();

    // Load template if provided, otherwise use empty markdown
    let content = if let Some(template_id) = &request.template_id {
        let template = db.get_template(template_id)
            .map_err(|e| format!("Failed to load template: {}", e))?;
        template.template_structure
    } else {
        // Default empty markdown PRD structure
        "## Overview\n\n## Requirements\n\n## Tasks\n\n".to_string()
    };

    let prd = PRDDocument {
        id: prd_id,
        title: request.title,
        description: request.description,
        template_id: request.template_id,
        content,
        quality_score_completeness: None,
        quality_score_clarity: None,
        quality_score_actionability: None,
        quality_score_overall: None,
        created_at: now.clone(),
        updated_at: now,
        version: 1,
        project_path: request.project_path,
        source_chat_session_id: None,
        prd_type: request.prd_type,
        extracted_structure: None,
    };

    db.create_prd(&prd)
        .map_err(|e| format!("Failed to create PRD: {}", e))?;

    Ok(prd)
}

/// Get a PRD document by ID
#[tauri::command]
pub async fn get_prd(
    id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<PRDDocument, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    db.get_prd(&id)
        .map_err(|e| format!("PRD not found: {}", e))
}

/// Update a PRD document
#[tauri::command]
pub async fn update_prd(
    request: UpdatePRDRequest,
    db: State<'_, Mutex<Database>>,
) -> Result<PRDDocument, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    let mut prd = db.get_prd(&request.id)
        .map_err(|e| format!("PRD not found: {}", e))?;

    if let Some(title) = request.title {
        prd.title = title;
    }
    if let Some(description) = request.description {
        prd.description = Some(description);
    }
    if let Some(content) = request.content {
        prd.content = content;
    }

    prd.updated_at = chrono::Utc::now().to_rfc3339();
    prd.version += 1;

    db.update_prd(&prd)
        .map_err(|e| format!("Failed to update PRD: {}", e))?;

    Ok(prd)
}

/// Delete a PRD document
#[tauri::command]
pub async fn delete_prd(
    id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<(), String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    db.delete_prd(&id)
        .map_err(|e| format!("Failed to delete PRD: {}", e))
}

/// List all PRD documents
#[tauri::command]
pub async fn list_prds(
    db: State<'_, Mutex<Database>>,
) -> Result<Vec<PRDDocument>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    db.list_prds()
        .map_err(|e| format!("Failed to list PRDs: {}", e))
}

/// Get all PRD templates
#[tauri::command]
pub async fn list_prd_templates(
    db: State<'_, Mutex<Database>>,
) -> Result<Vec<PRDTemplate>, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    db.list_templates()
        .map_err(|e| format!("Failed to list templates: {}", e))
}

/// Export PRD to different formats (content is always markdown)
#[tauri::command]
pub async fn export_prd(
    prd_id: String,
    format: String,
    db: State<'_, Mutex<Database>>,
) -> Result<String, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    let prd = db.get_prd(&prd_id)
        .map_err(|e| format!("PRD not found: {}", e))?;

    match format.as_str() {
        "markdown" => Ok(format_prd_markdown(&prd)),
        "yaml" => {
            let data = serde_json::json!({
                "title": prd.title,
                "description": prd.description,
                "content": prd.content
            });
            serde_yaml::to_string(&data)
                .map_err(|e| format!("Failed to convert to YAML: {}", e))
        }
        "json" => {
            let data = serde_json::json!({
                "title": prd.title,
                "description": prd.description,
                "content": prd.content
            });
            Ok(serde_json::to_string_pretty(&data).unwrap_or_default())
        }
        _ => Err(format!("Unsupported format: {}", format))
    }
}

/// Analyze PRD quality (markdown content)
#[tauri::command]
pub async fn analyze_prd_quality(
    prd_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<PRDDocument, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    let mut prd = db.get_prd(&prd_id)
        .map_err(|e| format!("PRD not found: {}", e))?;

    // Calculate quality scores for markdown content
    let completeness = calculate_completeness(&prd.content);
    let clarity = calculate_clarity(&prd.content);
    let actionability = calculate_actionability(&prd.content);
    let overall = (completeness + clarity + actionability) / 3;

    prd.quality_score_completeness = Some(completeness);
    prd.quality_score_clarity = Some(clarity);
    prd.quality_score_actionability = Some(actionability);
    prd.quality_score_overall = Some(overall);
    prd.updated_at = chrono::Utc::now().to_rfc3339();

    db.update_prd(&prd)
        .map_err(|e| format!("Failed to update PRD: {}", e))?;

    Ok(prd)
}

/// Execute PRD: Create tasks and launch agents
#[tauri::command]
pub async fn execute_prd(
    prd_id: String,
    config: ExecutionConfig,
    db: State<'_, Mutex<Database>>,
) -> Result<String, String> {
    let db_guard = db.lock().map_err(|e| e.to_string())?;

    // 1. Load PRD from database
    let prd = db_guard.get_prd(&prd_id)
        .map_err(|e| format!("PRD not found: {}", e))?;

    // 2. Get tasks from extracted_structure (AI-extracted during export) or parse markdown
    let tasks_from_structure = prd.extracted_structure.as_ref()
        .and_then(|json| serde_json::from_str::<crate::models::ExtractedPRDStructure>(json).ok())
        .filter(|s| !s.tasks.is_empty());

    let parsed_prd = if let Some(structure) = tasks_from_structure {
        // Use AI-extracted tasks from the exported structure
        log::info!("[PRD Execute] Using {} tasks from extracted_structure", structure.tasks.len());
        parsers::types::PRDDocument {
            title: prd.title.clone(),
            description: prd.description.clone(),
            tasks: structure.tasks.iter().map(|t| {
                let mut task = parsers::types::PRDTask::new(
                    t.title.clone(),
                    t.description.clone(),
                );
                if let Some(p) = t.priority {
                    task = task.with_priority(p);
                }
                if let Some(deps) = &t.dependencies {
                    task = task.with_dependencies(deps.clone());
                }
                task
            }).collect(),
        }
    } else {
        // Parse markdown content directly
        log::info!("[PRD Execute] Parsing markdown content for tasks");
        let markdown_content = format_prd_markdown(&prd);
        parsers::parse_prd_auto(&markdown_content)
            .map_err(|e| format!("Failed to parse PRD: {}", e))?
    };

    // 3. Create session for this execution
    let session_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now();

    let agent_type = match config.agent_type.as_str() {
        "claude" => crate::models::AgentType::Claude,
        "opencode" => crate::models::AgentType::Opencode,
        "cursor" => crate::models::AgentType::Cursor,
        _ => crate::models::AgentType::Claude,
    };

    let session = crate::models::Session {
        id: session_id.clone(),
        name: config.session_name.clone().unwrap_or_else(|| format!("{} Execution", prd.title)),
        project_path: prd.project_path.clone().unwrap_or_else(|| ".".to_string()),
        created_at: now,
        last_resumed_at: None,
        status: crate::models::SessionStatus::Active,
        config: crate::models::SessionConfig {
            max_parallel: config.max_parallel as i32,
            max_iterations: config.max_iterations as i32,
            max_retries: config.max_retries as i32,
            agent_type,
            auto_create_prs: config.auto_create_prs,
            draft_prs: config.draft_prs,
            run_tests: config.run_tests,
            run_lint: config.run_lint,
        },
        tasks: vec![],
        total_cost: 0.0,
        total_tokens: 0,
    };

    let conn = db_guard.get_connection();
    crate::database::sessions::create_session(conn, &session)
        .map_err(|e| format!("Failed to create session: {}", e))?;

    // 4. Validate and create tasks
    if parsed_prd.tasks.is_empty() {
        return Err("No tasks found in PRD. Please add tasks with descriptions before executing.".to_string());
    }

    let mut task_ids = vec![];
    let mut warnings: Vec<String> = vec![];

    for prd_task in parsed_prd.tasks {
        let task_id = Uuid::new_v4().to_string();

        let description = if prd_task.description.trim().is_empty() {
            warnings.push(format!("Task '{}' has no description, using title as prompt", prd_task.title));
            format!("Implement the following task: {}", prd_task.title)
        } else {
            prd_task.description
        };

        let title = if prd_task.title.trim().is_empty() {
            warnings.push("Found task with empty title, using 'Untitled Task'".to_string());
            "Untitled Task".to_string()
        } else {
            prd_task.title
        };

        let task = crate::models::Task {
            id: task_id.clone(),
            title,
            description,
            status: crate::models::TaskStatus::Pending,
            priority: prd_task.priority.unwrap_or(0),
            dependencies: prd_task.dependencies,
            assigned_agent: None,
            estimated_tokens: prd_task.estimated_tokens,
            actual_tokens: None,
            started_at: None,
            completed_at: None,
            branch: None,
            worktree_path: None,
            error: None,
        };

        crate::database::tasks::create_task(conn, &session_id, &task)
            .map_err(|e| format!("Failed to create task: {}", e))?;

        task_ids.push(task_id);
    }

    if !warnings.is_empty() {
        log::warn!("[PRD Execute] Task validation warnings:\n{}", warnings.join("\n"));
    }

    // 5. Export session to file for git tracking
    if let Err(e) = session_files::export_session_to_file(conn, &session_id, Some(prd_id.clone())) {
        log::warn!("Failed to export session to file: {}", e);
    }

    // 6. Create PRD execution record
    let execution = PRDExecution {
        id: Uuid::new_v4().to_string(),
        prd_id: prd_id.clone(),
        session_id: session_id.clone(),
        status: "in_progress".to_string(),
        started_at: now.to_rfc3339(),
        completed_at: None,
        total_tasks: task_ids.len() as i32,
        completed_tasks: 0,
        failed_tasks: 0,
        config: serde_json::to_string(&config).unwrap_or_default(),
    };

    db_guard.create_prd_execution(&execution)
        .map_err(|e| format!("Failed to create PRD execution: {}", e))?;

    drop(db_guard);

    Ok(session_id)
}

// Helper functions

/// Format PRD as markdown with title
fn format_prd_markdown(prd: &PRDDocument) -> String {
    let mut markdown = format!("# {}\n\n", prd.title);
    if let Some(desc) = &prd.description {
        if !desc.is_empty() {
            markdown.push_str(&format!("{}\n\n", desc));
        }
    }
    markdown.push_str(&prd.content);
    markdown
}

/// Calculate completeness score for markdown PRD
fn calculate_completeness(content: &str) -> i32 {
    let mut score = 0;
    let content_lower = content.to_lowercase();

    // Check for key sections (indicated by headings)
    let key_sections = ["overview", "requirements", "tasks", "goals", "scope", "background"];
    let found_sections = key_sections.iter()
        .filter(|s| content_lower.contains(&format!("# {}", s)) || content_lower.contains(&format!("## {}", s)))
        .count();

    score += (found_sections as i32 * 15).min(60);

    // Check content length
    if content.len() > 2000 {
        score += 30;
    } else if content.len() > 1000 {
        score += 20;
    } else if content.len() > 500 {
        score += 10;
    }

    // Bonus for multiple headings (well-structured)
    let heading_count = content.lines()
        .filter(|line| line.starts_with('#'))
        .count();
    if heading_count >= 5 {
        score += 10;
    } else if heading_count >= 3 {
        score += 5;
    }

    score.min(100)
}

/// Calculate clarity score for markdown PRD
fn calculate_clarity(content: &str) -> i32 {
    let mut score = 80;
    let content_lower = content.to_lowercase();

    // Check for vague terms
    let vague_terms = ["simple", "easy", "fast", "good", "better", "nice", "clean", "somehow", "maybe", "probably"];
    for term in vague_terms {
        let count = content_lower.matches(term).count();
        score -= (count as i32 * 3).min(15);
    }

    // Check for lists (indicates structured thinking)
    if content.contains("- ") || content.contains("* ") || content.contains("1. ") {
        score += 10;
    }

    // Check for code blocks
    if content.contains("```") {
        score += 5;
    }

    // Penalize very short content
    if content.len() < 200 {
        score -= 20;
    }

    score.max(0).min(100)
}

/// Calculate actionability score for markdown PRD
fn calculate_actionability(content: &str) -> i32 {
    let content_lower = content.to_lowercase();

    // Look for task-related sections
    let has_tasks = content_lower.contains("## task")
        || content_lower.contains("### task")
        || content_lower.contains("## implementation")
        || content_lower.contains("## epic")
        || content_lower.contains("### epic");

    // Count list items (potential tasks)
    let list_items: usize = content.lines()
        .filter(|line| {
            let trimmed = line.trim();
            trimmed.starts_with("- ") || trimmed.starts_with("* ") ||
            (trimmed.len() > 2 && trimmed.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false) && trimmed.contains(". "))
        })
        .count();

    // Count task headings (level 3+)
    let task_headings: usize = content.lines()
        .filter(|line| line.starts_with("### ") || line.starts_with("#### "))
        .count();

    let mut score = 0;

    if has_tasks {
        score += 30;
    }

    score += (list_items as i32 * 3).min(30);
    score += (task_headings as i32 * 5).min(30);

    // Bonus for action verbs
    let action_verbs = ["implement", "create", "build", "add", "update", "fix", "refactor", "design", "test", "deploy"];
    let action_count: usize = action_verbs.iter()
        .map(|v| content_lower.matches(v).count())
        .sum();
    score += (action_count as i32 * 2).min(20);

    score.min(100)
}
