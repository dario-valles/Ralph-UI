// PRD Tauri commands

use crate::database::{Database, prd::*};
use crate::parsers;
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
    pub execution_mode: String,
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

    // Load template if provided
    let content = if let Some(template_id) = &request.template_id {
        let template = db.get_template(template_id)
            .map_err(|e| format!("Failed to load template: {}", e))?;
        template.template_structure
    } else {
        // Default empty PRD structure
        r#"{
            "sections": [
                {"id": "overview", "title": "Overview", "content": "", "required": true},
                {"id": "requirements", "title": "Requirements", "content": "", "required": true},
                {"id": "tasks", "title": "Tasks", "content": "", "required": true}
            ]
        }"#.to_string()
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

/// Export PRD to different formats
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
        "json" => Ok(prd.content),
        "markdown" => {
            // Convert JSON content to Markdown
            convert_prd_to_markdown(&prd)
        }
        "yaml" => {
            // Convert JSON to YAML
            let json: serde_json::Value = serde_json::from_str(&prd.content)
                .map_err(|e| format!("Invalid PRD content: {}", e))?;
            serde_yaml::to_string(&json)
                .map_err(|e| format!("Failed to convert to YAML: {}", e))
        }
        _ => Err(format!("Unsupported format: {}", format))
    }
}

/// Analyze PRD quality
#[tauri::command]
pub async fn analyze_prd_quality(
    prd_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<PRDDocument, String> {
    let db = db.lock().map_err(|e| e.to_string())?;

    let mut prd = db.get_prd(&prd_id)
        .map_err(|e| format!("PRD not found: {}", e))?;

    // Parse PRD content
    let content: serde_json::Value = serde_json::from_str(&prd.content)
        .map_err(|e| format!("Invalid PRD content: {}", e))?;

    // Calculate quality scores
    let completeness = calculate_completeness(&content);
    let clarity = calculate_clarity(&content);
    let actionability = calculate_actionability(&content);
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

    // 2. Export PRD to markdown for parsing
    let markdown_content = convert_prd_to_markdown(&prd)?;

    // 3. Parse markdown into tasks
    let parsed_prd = parsers::parse_prd_auto(&markdown_content)
        .map_err(|e| format!("Failed to parse PRD: {}", e))?;

    // 4. Create session for this execution
    let session_id = Uuid::new_v4().to_string();
    let now = chrono::Utc::now();

    // Parse agent type
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

    // 5. Create tasks in database with PRD reference
    let mut task_ids = vec![];
    for prd_task in parsed_prd.tasks {
        let task_id = Uuid::new_v4().to_string();

        let task = crate::models::Task {
            id: task_id.clone(),
            title: prd_task.title,
            description: prd_task.description,
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

    // 6. Create PRD execution record
    let execution_id = Uuid::new_v4().to_string();
    let execution = PRDExecution {
        id: execution_id,
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

    // Drop the database guard before starting agents
    drop(db_guard);

    // 7. Agents will be started by the frontend/session manager
    // We just return the session ID so the UI can navigate to the agent monitor

    Ok(session_id)
}

// Helper functions

fn convert_prd_to_markdown(prd: &PRDDocument) -> Result<String, String> {
    let content: serde_json::Value = serde_json::from_str(&prd.content)
        .map_err(|e| format!("Invalid PRD content: {}", e))?;

    let mut markdown = format!("# {}\n\n", prd.title);

    if let Some(desc) = &prd.description {
        markdown.push_str(&format!("{}\n\n", desc));
    }

    if let Some(sections) = content.get("sections").and_then(|s| s.as_array()) {
        markdown.push_str("## Tasks\n\n");

        for section in sections {
            if let Some(title) = section.get("title").and_then(|t| t.as_str()) {
                if let Some(content_text) = section.get("content").and_then(|c| c.as_str()) {
                    if !content_text.is_empty() {
                        markdown.push_str(&format!("### {}\n\n{}\n\n", title, content_text));
                    }
                }
            }
        }
    }

    Ok(markdown)
}

fn calculate_completeness(content: &serde_json::Value) -> i32 {
    let sections = content.get("sections").and_then(|s| s.as_array());

    if let Some(sections) = sections {
        let required_sections: Vec<_> = sections.iter()
            .filter(|s| s.get("required").and_then(|r| r.as_bool()).unwrap_or(false))
            .collect();

        if required_sections.is_empty() {
            return 100;
        }

        let filled_sections = required_sections.iter()
            .filter(|s| {
                s.get("content")
                    .and_then(|c| c.as_str())
                    .map(|c| !c.trim().is_empty())
                    .unwrap_or(false)
            })
            .count();

        ((filled_sections as f32 / required_sections.len() as f32) * 100.0) as i32
    } else {
        0
    }
}

fn calculate_clarity(content: &serde_json::Value) -> i32 {
    let sections = content.get("sections").and_then(|s| s.as_array());

    if let Some(sections) = sections {
        let mut total_score = 0;
        let mut count = 0;

        for section in sections {
            if let Some(content_text) = section.get("content").and_then(|c| c.as_str()) {
                if content_text.trim().is_empty() {
                    continue;
                }

                count += 1;
                let mut score = 100;

                // Check for vague terms
                let vague_terms = ["simple", "easy", "fast", "good", "better", "nice", "clean"];
                for term in vague_terms {
                    if content_text.to_lowercase().contains(term) {
                        score -= 10;
                    }
                }

                // Check minimum length
                if content_text.len() < 50 {
                    score -= 20;
                }

                total_score += score.max(0);
            }
        }

        if count > 0 {
            total_score / count
        } else {
            0
        }
    } else {
        0
    }
}

fn calculate_actionability(content: &serde_json::Value) -> i32 {
    let sections = content.get("sections").and_then(|s| s.as_array());

    if let Some(sections) = sections {
        let has_task_section = sections.iter().any(|s| {
            s.get("id")
                .and_then(|id| id.as_str())
                .map(|id| id.contains("task") || id.contains("requirement"))
                .unwrap_or(false)
        });

        if has_task_section {
            // Check if tasks are well-defined
            let task_content_length: usize = sections.iter()
                .filter(|s| {
                    s.get("id")
                        .and_then(|id| id.as_str())
                        .map(|id| id.contains("task") || id.contains("requirement"))
                        .unwrap_or(false)
                })
                .filter_map(|s| s.get("content").and_then(|c| c.as_str()))
                .map(|c| c.len())
                .sum();

            if task_content_length > 200 {
                90
            } else if task_content_length > 100 {
                70
            } else if task_content_length > 0 {
                50
            } else {
                20
            }
        } else {
            40 // Has structure but no explicit task section
        }
    } else {
        0
    }
}
