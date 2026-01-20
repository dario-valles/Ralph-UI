// PRD Chat Tauri commands - AI-assisted PRD creation through conversation
//
// This module is organized into submodules:
// - types: Request/response types for the API
// - (commands remain in mod.rs for now)

mod types;

pub use types::*;

use crate::database::Database;
use crate::models::{
    AgentType, ChatMessage, ChatSession, ExtractedPRDContent, ExtractedPRDStructure,
    GuidedQuestion, MessageRole, PRDType, QualityAssessment, QuestionType,
};
use crate::parsers::structured_output;
use crate::session_files;
use crate::utils::lock_db;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;
use uuid::Uuid;

// ============================================================================
// Tauri Commands
// ============================================================================

/// Start a new PRD chat session
#[tauri::command]
pub async fn start_prd_chat_session(
    request: StartChatSessionRequest,
    db: State<'_, Mutex<Database>>,
) -> Result<ChatSession, String> {
    let db = lock_db(&db)?;

    // Validate agent type
    let _agent_type = parse_agent_type(&request.agent_type)?;

    // Validate and parse PRD type if provided
    let prd_type_enum = if let Some(ref prd_type) = request.prd_type {
        Some(prd_type.parse::<PRDType>()
            .map_err(|e| format!("Invalid PRD type: {}", e))?)
    } else {
        None
    };

    let now = chrono::Utc::now().to_rfc3339();
    let session_id = Uuid::new_v4().to_string();
    let guided_mode = request.guided_mode.unwrap_or(true);
    let structured_mode = request.structured_mode.unwrap_or(false);

    // Set default title based on PRD type
    let default_title = prd_type_enum.as_ref().map(|pt| get_prd_type_title(pt));

    let mut session = ChatSession {
        id: session_id.clone(),
        agent_type: request.agent_type,
        project_path: request.project_path,
        prd_id: request.prd_id,
        title: default_title,
        prd_type: request.prd_type,
        guided_mode,
        quality_score: None,
        template_id: request.template_id,
        structured_mode,
        extracted_structure: None,
        created_at: now.clone(),
        updated_at: now.clone(),
        message_count: Some(0),
    };

    db.create_chat_session(&session)
        .map_err(|e| format!("Failed to create chat session: {}", e))?;

    // Ensure .ralph-ui/prds/ directory exists for plan files
    if let Some(ref project_path) = session.project_path {
        let prds_dir = std::path::Path::new(project_path)
            .join(".ralph-ui")
            .join("prds");
        if let Err(e) = std::fs::create_dir_all(&prds_dir) {
            log::warn!("Failed to create PRD plan directory: {}", e);
            // Don't fail the session creation, just log the warning
        }
    }

    // If guided mode is enabled, add an initial welcome message with the first question
    if guided_mode {
        let welcome_message = generate_welcome_message(prd_type_enum.as_ref());

        let assistant_message = ChatMessage {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.clone(),
            role: MessageRole::Assistant,
            content: welcome_message,
            created_at: now,
        };

        db.create_chat_message(&assistant_message)
            .map_err(|e| format!("Failed to create welcome message: {}", e))?;

        // Update message count
        session.message_count = Some(1);
    }

    Ok(session)
}

/// Get a default title for a PRD type
fn get_prd_type_title(prd_type: &PRDType) -> String {
    match prd_type {
        PRDType::NewFeature => "New Feature PRD".to_string(),
        PRDType::BugFix => "Bug Fix PRD".to_string(),
        PRDType::Refactoring => "Refactoring PRD".to_string(),
        PRDType::ApiIntegration => "API Integration PRD".to_string(),
        PRDType::General => "General PRD".to_string(),
        PRDType::FullNewApp => "Full New App PRD".to_string(),
    }
}

/// Generate a welcome message with the first guided question based on PRD type
fn generate_welcome_message(prd_type: Option<&PRDType>) -> String {
    let type_context = match prd_type {
        Some(PRDType::NewFeature) => "new feature",
        Some(PRDType::BugFix) => "bug fix",
        Some(PRDType::Refactoring) => "refactoring effort",
        Some(PRDType::ApiIntegration) => "API integration",
        Some(PRDType::FullNewApp) => "new application",
        Some(PRDType::General) | None => "project",
    };

    let first_question = match prd_type {
        Some(PRDType::NewFeature) =>
            "What problem are you trying to solve with this new feature? Who are the target users, and what pain points are they currently experiencing?",
        Some(PRDType::BugFix) =>
            "Can you describe the bug you're trying to fix? What is the expected behavior vs. the actual behavior you're seeing?",
        Some(PRDType::Refactoring) =>
            "What part of the codebase are you looking to refactor? What are the main issues with the current implementation (e.g., performance, maintainability, technical debt)?",
        Some(PRDType::ApiIntegration) =>
            "Which API or service are you integrating with? What functionality do you need from this integration?",
        Some(PRDType::FullNewApp) =>
            "What kind of application are you planning to build? Please describe the main purpose and the problem it will solve for users.",
        Some(PRDType::General) | None =>
            "What would you like to build or accomplish? Please describe your project idea and its main goals.",
    };

    format!(
        "👋 Welcome! I'll help you create a comprehensive PRD for your {}.\n\n\
        I'll guide you through a series of questions to capture all the important details. \
        Feel free to provide as much context as you can - the more details, the better the PRD!\n\n\
        **Let's start:**\n\n{}",
        type_context,
        first_question
    )
}

/// Send a message to the chat and get an AI response
#[tauri::command]
pub async fn send_prd_chat_message(
    app_handle: tauri::AppHandle,
    request: SendMessageRequest,
    db: State<'_, Mutex<Database>>,
) -> Result<SendMessageResponse, String> {
    // First phase: read data and store user message (hold mutex briefly)
    let (session, history, user_message, prompt) = {
        let db_guard = lock_db(&db)?;

        // Get the session
        let session = db_guard.get_chat_session(&request.session_id)
            .map_err(|e| format!("Session not found: {}", e))?;

        let now = chrono::Utc::now().to_rfc3339();

        // Store user message
        let user_message = ChatMessage {
            id: Uuid::new_v4().to_string(),
            session_id: request.session_id.clone(),
            role: MessageRole::User,
            content: request.content.clone(),
            created_at: now.clone(),
        };

        db_guard.create_chat_message(&user_message)
            .map_err(|e| format!("Failed to store user message: {}", e))?;

        // Get chat history for context
        let history = db_guard.get_messages_by_session(&request.session_id)
            .map_err(|e| format!("Failed to get chat history: {}", e))?;

        // Build prompt with PRD context
        let prompt = build_prd_chat_prompt(&session, &history, &request.content);

        (session, history, user_message, prompt)
        // db_guard dropped here
    };

    // Parse agent type (no db access needed)
    let agent_type = parse_agent_type(&session.agent_type)?;

    // Execute CLI agent and get response with streaming (no mutex held)
    let response_content = execute_chat_agent(
        &app_handle,
        &request.session_id,
        agent_type,
        &prompt,
        session.project_path.as_deref()
    )
        .await
        .map_err(|e| format!("Agent execution failed: {}", e))?;

    // Second phase: store response and parse structured output (hold mutex briefly)
    let assistant_message = {
        let db_guard = lock_db(&db)?;

        let response_now = chrono::Utc::now().to_rfc3339();

        // Store assistant message
        let assistant_message = ChatMessage {
            id: Uuid::new_v4().to_string(),
            session_id: request.session_id.clone(),
            role: MessageRole::Assistant,
            content: response_content.clone(),
            created_at: response_now.clone(),
        };

        db_guard.create_chat_message(&assistant_message)
            .map_err(|e| format!("Failed to store assistant message: {}", e))?;

        // Update session timestamp
        update_chat_session_timestamp(db_guard.get_connection(), &request.session_id, &response_now)
            .map_err(|e| format!("Failed to update session: {}", e))?;

        // Auto-generate title from first message if not set
        if session.title.is_none() {
            let title = generate_session_title(&request.content, session.prd_type.as_deref());
            update_chat_session_title(db_guard.get_connection(), &request.session_id, &title)
                .ok(); // Ignore title update errors
        }

        // If structured mode is enabled, parse JSON blocks from response
        if session.structured_mode {
            let new_items = structured_output::extract_items(&response_content);
            if !new_items.is_empty() {
                // Load existing structure or create new
                let mut structure: ExtractedPRDStructure = session.extracted_structure
                    .as_ref()
                    .and_then(|s| serde_json::from_str(s).ok())
                    .unwrap_or_default();

                // Merge new items
                structured_output::merge_items(&mut structure, new_items);

                // Store updated structure
                let structure_json = serde_json::to_string(&structure)
                    .map_err(|e| format!("Failed to serialize structure: {}", e))?;
                db_guard.update_chat_session_extracted_structure(&request.session_id, Some(&structure_json))
                    .map_err(|e| format!("Failed to update structure: {}", e))?;
            }
        }

        assistant_message
        // db_guard dropped here
    };

    // Suppress unused variable warning
    let _ = history;

    Ok(SendMessageResponse {
        user_message,
        assistant_message,
    })
}

/// Get all messages for a chat session
#[tauri::command]
pub async fn get_prd_chat_history(
    session_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<Vec<ChatMessage>, String> {
    let db = lock_db(&db)?;

    db.get_messages_by_session(&session_id)
        .map_err(|e| format!("Failed to get chat history: {}", e))
}

/// List all chat sessions
#[tauri::command]
pub async fn list_prd_chat_sessions(
    db: State<'_, Mutex<Database>>,
) -> Result<Vec<ChatSession>, String> {
    let db = lock_db(&db)?;

    db.list_chat_sessions()
        .map_err(|e| format!("Failed to list chat sessions: {}", e))
}

/// Delete a chat session and all its messages
#[tauri::command]
pub async fn delete_prd_chat_session(
    session_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<(), String> {
    let db = lock_db(&db)?;

    // Delete messages first (foreign key constraint)
    db.delete_messages_by_session(&session_id)
        .map_err(|e| format!("Failed to delete messages: {}", e))?;

    // Delete session
    db.delete_chat_session(&session_id)
        .map_err(|e| format!("Failed to delete session: {}", e))
}

/// Export chat conversation to a new PRD document, creating a session and tasks
#[tauri::command]
pub async fn export_chat_to_prd(
    app_handle: tauri::AppHandle,
    request: ExportToPRDRequest,
    db: State<'_, Mutex<Database>>,
) -> Result<ExportResult, String> {
    // First, get session data and determine content source
    // We need to release the lock before async AI call
    let (session, content, assessment, from_plan_file) = {
        let db_guard = lock_db(&db)?;

        // Get session
        let session = db_guard.get_chat_session(&request.session_id)
            .map_err(|e| format!("Session not found: {}", e))?;

        // Try to get content from PRD plan file first (this has the actual PRD)
        // Fall back to chat messages if the file doesn't exist or can't be read
        let (content, assessment, from_plan_file) = if let Some(ref project_path) = session.project_path {
            let plan_path = crate::watchers::get_prd_plan_file_path(
                project_path,
                &request.session_id,
                session.title.as_deref(),
            );

            if plan_path.exists() {
                // Use the actual PRD file content
                match std::fs::read_to_string(&plan_path) {
                    Ok(file_content) => {
                        log::info!("Exporting PRD from plan file: {:?}", plan_path);
                        let assessment = calculate_quality_from_markdown(
                            &file_content,
                            session.prd_type.as_deref(),
                        );
                        (file_content, assessment, true)
                    }
                    Err(e) => {
                        log::warn!("Failed to read PRD plan file, falling back to messages: {}", e);
                        let (c, a) = export_content_from_messages(&db_guard, &request.session_id, &session)?;
                        (c, a, false)
                    }
                }
            } else {
                // No plan file yet, use messages
                let (c, a) = export_content_from_messages(&db_guard, &request.session_id, &session)?;
                (c, a, false)
            }
        } else {
            // No project path, use messages
            let (c, a) = export_content_from_messages(&db_guard, &request.session_id, &session)?;
            (c, a, false)
        };

        (session, content, assessment, from_plan_file)
    }; // Release db lock here before async AI call

    // Extract structured items via AI if we have substantial content
    // Run extraction for any substantial content (plan file or messages)
    let has_substantial_content = !content.trim().is_empty() && content.len() > 100;

    let extracted_structure = if has_substantial_content {
        log::info!("Extracting structured items via AI for export (from_plan_file: {})...", from_plan_file);

        // Parse the agent type for the session
        let agent_type = parse_agent_type(&session.agent_type)
            .unwrap_or(AgentType::Claude);

        match extract_items_via_ai(
            &app_handle,
            &content,
            session.prd_type.as_deref(),
            agent_type,
            session.project_path.as_deref(),
        ).await {
            Ok(structure) if structure.has_items() => {
                log::info!("Extracted {} items from PRD", structure.total_items());
                match serde_json::to_string(&structure) {
                    Ok(json) => Some(json),
                    Err(e) => {
                        log::warn!("Failed to serialize extracted structure: {}", e);
                        // Fall back to session's existing structure
                        session.extracted_structure.clone()
                    }
                }
            }
            Ok(_) => {
                log::info!("AI extraction returned no items, using session's existing structure");
                session.extracted_structure.clone()
            }
            Err(e) => {
                log::warn!("AI extraction failed ({}), using session's existing structure", e);
                session.extracted_structure.clone()
            }
        }
    } else {
        // For short content, check if session already has extracted structure
        log::info!("Content too short for AI extraction, using session's existing structure");
        session.extracted_structure.clone()
    };

    let now = chrono::Utc::now().to_rfc3339();
    let prd_id = Uuid::new_v4().to_string();

    let prd = crate::database::prd::PRDDocument {
        id: prd_id,
        title: request.title,
        description: Some("Generated from PRD chat conversation".to_string()),
        template_id: session.template_id.clone(),
        content,
        // Transfer quality scores from chat assessment
        quality_score_completeness: Some(assessment.completeness as i32),
        quality_score_clarity: Some(assessment.clarity as i32),
        quality_score_actionability: Some(assessment.actionability as i32),
        quality_score_overall: Some(assessment.overall as i32),
        created_at: now.clone(),
        updated_at: now,
        version: 1,
        project_path: session.project_path,
        // Track the source chat session
        source_chat_session_id: Some(request.session_id.clone()),
        prd_type: session.prd_type.clone(),
        // Store the AI-extracted structured items
        extracted_structure,
    };

    // Re-acquire lock to save to database
    let db_guard = lock_db(&db)?;
    db_guard.create_prd(&prd)
        .map_err(|e| format!("Failed to create PRD: {}", e))?;

    // Save PRD content to file for debugging/inspection
    if let Some(ref project_path) = prd.project_path {
        log::info!("Saving PRD files to project path: {}", project_path);
        let prds_dir = std::path::Path::new(project_path).join(".ralph-ui").join("prds");
        if let Err(e) = std::fs::create_dir_all(&prds_dir) {
            log::warn!("Failed to create prds directory: {}", e);
        } else {
            // Save PRD markdown content
            // Include short ID (first 8 chars of UUID) to make filename unique
            let title_part = crate::watchers::sanitize_filename(&prd.title);
            let short_id = &prd.id[..8.min(prd.id.len())];
            let prd_filename = format!("{}-{}", title_part, short_id);
            let prd_path = prds_dir.join(format!("{}.md", prd_filename));
            if let Err(e) = std::fs::write(&prd_path, &prd.content) {
                log::warn!("Failed to write PRD file: {}", e);
            } else {
                log::info!("Saved PRD to {:?}", prd_path);
            }

            // Save extracted structure JSON for debugging
            if let Some(ref structure_json) = prd.extracted_structure {
                let structure_path = prds_dir.join(format!("{}-structure.json", prd_filename));
                // Pretty-print the JSON for readability
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(structure_json) {
                    if let Ok(pretty) = serde_json::to_string_pretty(&parsed) {
                        if let Err(e) = std::fs::write(&structure_path, &pretty) {
                            log::warn!("Failed to write structure file: {}", e);
                        } else {
                            log::info!("Saved extracted structure to {:?}", structure_path);
                        }
                    }
                }
            } else {
                log::info!("No extracted structure JSON to save");
            }
        }
    } else {
        log::warn!("PRD has no project_path set - cannot save files to .ralph-ui/prds/. \
                   The chat session was likely created without a project context.");
    }

    // Note: Session and tasks are NOT created during export.
    // The user should use the PRD Execution Dialog to create sessions/tasks
    // via execute_prd (for parallel scheduler) or convert_prd_to_ralph (for Ralph Loop).
    // This avoids duplicate session/task creation.

    Ok(ExportResult {
        prd,
        session_id: None,
        task_count: 0,
    })
}

/// Create a work session and tasks from an exported PRD with extracted structure
/// Note: This is currently unused - session/task creation moved to execute_prd command
#[allow(dead_code)]
fn create_session_and_tasks_from_prd(
    db: &Database,
    prd: &crate::database::prd::PRDDocument,
    structure: &ExtractedPRDStructure,
) -> Result<(String, usize), String> {
    use crate::database;
    use crate::models::{Session, SessionConfig, SessionStatus, Task, TaskStatus};
    use chrono::Utc;

    // Create a new session for this PRD
    let session_id = Uuid::new_v4().to_string();
    let project_path = prd.project_path.clone()
        .ok_or_else(|| "PRD has no project path, cannot create session".to_string())?;

    let session = Session {
        id: session_id.clone(),
        name: prd.title.clone(),
        project_path,
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

    // Save the session
    database::sessions::create_session(db.get_connection(), &session)
        .map_err(|e| format!("Failed to create session: {}", e))?;

    // Convert extracted tasks to Task records
    // Prefix task IDs with short session ID to make them unique across sessions
    // while preserving the meaningful ID structure (e.g., "abc12345-T-1.1")
    let short_session_id = &session_id[..8.min(session_id.len())];

    // Build a map of original ID -> new ID for dependency remapping
    let id_map: std::collections::HashMap<String, String> = structure.tasks.iter()
        .map(|t| (t.id.clone(), format!("{}-{}", short_session_id, t.id)))
        .collect();

    let mut task_count = 0;
    for prd_item in structure.tasks.iter() {
        // Remap dependencies to use new prefixed IDs
        let remapped_deps = prd_item.dependencies.as_ref()
            .map(|deps| deps.iter()
                .map(|dep| id_map.get(dep).cloned().unwrap_or_else(|| dep.clone()))
                .collect())
            .unwrap_or_default();

        let task = Task {
            // Use session-prefixed ID to ensure uniqueness across executions
            id: format!("{}-{}", short_session_id, prd_item.id),
            title: prd_item.title.clone(),
            description: prd_item.description.clone(),
            status: TaskStatus::Pending,
            priority: match prd_item.priority {
                Some(p) if p >= 1 && p <= 5 => p,
                _ => 3, // Default to medium priority (3) if invalid or missing
            },
            dependencies: remapped_deps,
            assigned_agent: None,
            estimated_tokens: None,
            actual_tokens: None,
            started_at: None,
            completed_at: None,
            branch: None,
            worktree_path: None,
            error: None,
        };

        database::tasks::create_task(db.get_connection(), &session_id, &task)
            .map_err(|e| format!("Failed to create task: {}", e))?;
        task_count += 1;
    }

    // Export session to file for git tracking and portability
    // Pass PRD ID to preserve the PRD-session relationship
    if let Err(e) = session_files::export_session_to_file(
        db.get_connection(),
        &session_id,
        Some(prd.id.clone()),
    ) {
        log::warn!("Failed to export session to file: {}", e);
        // Don't fail - session is in DB
    }

    Ok((session_id, task_count))
}

/// Helper function to extract PRD content and quality from chat messages
/// Used as a fallback when no PRD plan file exists
fn export_content_from_messages(
    db: &Database,
    session_id: &str,
    session: &ChatSession,
) -> Result<(String, QualityAssessment), String> {
    let messages = db.get_messages_by_session(session_id)
        .map_err(|e| format!("Failed to get messages: {}", e))?;

    let assessment = calculate_quality_assessment(&messages, session.prd_type.as_deref());

    // Convert conversation to PRD content
    // Use extracted structure if available for structured mode sessions
    let content = if session.structured_mode {
        if let Some(ref structure_json) = session.extracted_structure {
            if let Ok(structure) = serde_json::from_str::<ExtractedPRDStructure>(structure_json) {
                convert_structure_to_prd_content(&structure, &messages)
            } else {
                convert_chat_to_prd_content(&messages)
            }
        } else {
            convert_chat_to_prd_content(&messages)
        }
    } else {
        convert_chat_to_prd_content(&messages)
    };

    Ok((content, assessment))
}

/// Assess the quality of a PRD chat session before export
/// Prioritizes the PRD plan file content if it exists, falls back to chat messages
#[tauri::command]
pub async fn assess_prd_quality(
    session_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<QualityAssessment, String> {
    let db = lock_db(&db)?;

    // Get session
    let session = db.get_chat_session(&session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    // Try to use PRD plan file content first if available
    let assessment = if let Some(ref project_path) = session.project_path {
        let plan_path = crate::watchers::get_prd_plan_file_path(
            project_path,
            &session_id,
            session.title.as_deref(),
        );

        if plan_path.exists() {
            // Use PRD plan file for quality assessment
            match std::fs::read_to_string(&plan_path) {
                Ok(content) => {
                    log::info!("Assessing quality from PRD plan file: {:?}", plan_path);
                    calculate_quality_from_markdown(&content, session.prd_type.as_deref())
                }
                Err(e) => {
                    log::warn!("Failed to read PRD plan file, falling back to messages: {}", e);
                    // Fall back to messages
                    let messages = db.get_messages_by_session(&session_id)
                        .map_err(|e| format!("Failed to get messages: {}", e))?;
                    calculate_quality_assessment(&messages, session.prd_type.as_deref())
                }
            }
        } else {
            // No plan file yet, use messages
            let messages = db.get_messages_by_session(&session_id)
                .map_err(|e| format!("Failed to get messages: {}", e))?;
            calculate_quality_assessment(&messages, session.prd_type.as_deref())
        }
    } else {
        // No project path, use messages
        let messages = db.get_messages_by_session(&session_id)
            .map_err(|e| format!("Failed to get messages: {}", e))?;
        calculate_quality_assessment(&messages, session.prd_type.as_deref())
    };

    // Update session with quality score
    update_chat_session_quality_score(
        db.get_connection(),
        &session_id,
        assessment.overall as i32,
    ).map_err(|e| format!("Failed to update quality score: {}", e))?;

    Ok(assessment)
}

/// Get guided questions based on PRD type
#[tauri::command]
pub async fn get_guided_questions(
    prd_type: String,
) -> Result<Vec<GuidedQuestion>, String> {
    let prd_type = prd_type.parse::<PRDType>()
        .map_err(|e| format!("Invalid PRD type: {}", e))?;

    Ok(generate_guided_questions(prd_type))
}

/// Extract content from chat for preview before export
#[tauri::command]
pub async fn preview_prd_extraction(
    session_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<ExtractedPRDContent, String> {
    let db = lock_db(&db)?;

    // Get all messages
    let messages = db.get_messages_by_session(&session_id)
        .map_err(|e| format!("Failed to get messages: {}", e))?;

    // Extract content using improved algorithm
    Ok(extract_prd_content_advanced(&messages))
}

/// Check if an agent CLI is available in the system PATH
#[tauri::command]
pub async fn check_agent_availability(
    agent_type: String,
) -> Result<AgentAvailabilityResult, String> {
    let agent_type = parse_agent_type(&agent_type)?;

    let program = match agent_type {
        AgentType::Claude => "claude",
        AgentType::Opencode => "opencode",
        AgentType::Cursor => "cursor-agent",
        AgentType::Codex => "codex",
        AgentType::Qwen => "qwen",
        AgentType::Droid => "droid",
    };

    // Check if the program exists in PATH using `which` on Unix or `where` on Windows
    let check_result = std::process::Command::new(if cfg!(windows) { "where" } else { "which" })
        .arg(program)
        .output();

    match check_result {
        Ok(output) => {
            let available = output.status.success();
            let path = if available {
                Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
            } else {
                None
            };

            Ok(AgentAvailabilityResult {
                available,
                agent: program.to_string(),
                path,
                error: if available { None } else {
                    Some(format!("'{}' not found in PATH. Please install it or add it to your PATH.", program))
                },
            })
        }
        Err(e) => {
            Ok(AgentAvailabilityResult {
                available: false,
                agent: program.to_string(),
                path: None,
                error: Some(format!("Failed to check for '{}': {}", program, e)),
            })
        }
    }
}

/// Get the extracted PRD structure for a session
#[tauri::command]
pub async fn get_extracted_structure(
    session_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<ExtractedPRDStructure, String> {
    let db = lock_db(&db)?;

    let session = db.get_chat_session(&session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    // Parse the stored structure or return empty
    let structure: ExtractedPRDStructure = session.extracted_structure
        .as_ref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    Ok(structure)
}

/// Set structured output mode for a session
#[tauri::command]
pub async fn set_structured_mode(
    session_id: String,
    enabled: bool,
    db: State<'_, Mutex<Database>>,
) -> Result<(), String> {
    let db = lock_db(&db)?;

    db.update_chat_session_structured_mode(&session_id, enabled)
        .map_err(|e| format!("Failed to update structured mode: {}", e))?;

    Ok(())
}

/// Clear extracted structure for a session
#[tauri::command]
pub async fn clear_extracted_structure(
    session_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<(), String> {
    let db = lock_db(&db)?;

    db.update_chat_session_extracted_structure(&session_id, None)
        .map_err(|e| format!("Failed to clear structure: {}", e))?;

    Ok(())
}

// ============================================================================
// AI Item Extraction
// ============================================================================

/// Extract structured items from PRD content using AI
/// This is called during export to automatically populate the extracted items
async fn extract_items_via_ai(
    app_handle: &tauri::AppHandle,
    prd_content: &str,
    prd_type: Option<&str>,
    agent_type: AgentType,
    working_dir: Option<&str>,
) -> Result<ExtractedPRDStructure, String> {
    let prd_type_hint = prd_type
        .map(|t| format!("This is a {} PRD.", t.replace("_", " ")))
        .unwrap_or_default();

    let prompt = format!(r#"Extract all structured items from this PRD document and return them as JSON.

{prd_type_hint}

PRD Content:
```
{prd_content}
```

Analyze the PRD and extract these types of items:
1. **Epics**: High-level phases or major feature groups (e.g., "Phase 1: Foundation", "Authentication System")
2. **User Stories**: User-focused requirements starting with "As a..." or describing user needs
3. **Tasks**: Implementation tasks, often with IDs like T-1.2.3 or numbered items
4. **Acceptance Criteria**: Quality criteria, success conditions, or testing requirements

**CRITICAL - Markdown Table Parsing:**
If the PRD contains tasks in markdown table format like:
| # | Task ID | Task | Description | Status |
|---|---------|------|-------------|--------|
| 1 | T-1.1.1 | Initialize scene | Create WebGL renderer | ⬜ |

You MUST:
- Extract the "Task" column as the title (e.g., "Initialize scene")
- Extract the "Description" column as the description (e.g., "Create WebGL renderer")
- DO NOT include raw markdown table syntax in title or description fields
- Parse each row into a separate task object
- Infer priority from the Task ID pattern (lower numbers = higher priority): T-1.x.x = priority 1-2, T-2.x.x = priority 2-3, etc.

Return a JSON object with this exact structure (no markdown formatting, just raw JSON):
{{
  "epics": [
    {{
      "type": "epic",
      "id": "Phase-1",
      "parentId": null,
      "title": "Phase Title",
      "description": "Full description",
      "acceptanceCriteria": null,
      "priority": 1,
      "dependencies": null,
      "estimatedEffort": null,
      "tags": null
    }}
  ],
  "userStories": [
    {{
      "type": "user_story",
      "id": "US-1.1",
      "parentId": "Phase-1",
      "title": "Short title",
      "description": "As a user, I want...",
      "acceptanceCriteria": ["Given...", "When...", "Then..."],
      "priority": 2,
      "dependencies": null,
      "estimatedEffort": "medium",
      "tags": null
    }}
  ],
  "tasks": [
    {{
      "type": "task",
      "id": "T-1.1.1",
      "parentId": "US-1.1",
      "title": "Task title",
      "description": "Implementation details",
      "acceptanceCriteria": null,
      "priority": 3,
      "dependencies": ["T-1.1.0"],
      "estimatedEffort": "small",
      "tags": null
    }}
  ],
  "acceptanceCriteria": [
    {{
      "type": "acceptance_criteria",
      "id": "AC-1",
      "parentId": "US-1.1",
      "title": "Criteria title",
      "description": "The system should...",
      "acceptanceCriteria": null,
      "priority": null,
      "dependencies": null,
      "estimatedEffort": null,
      "tags": null
    }}
  ]
}}

Important:
- Use hierarchical parentId relationships (tasks belong to stories, stories to epics)
- Generate meaningful IDs that reflect hierarchy (Phase-1, US-1.1, T-1.1.1)
- estimatedEffort can only be: "small", "medium", or "large" (or null)
- Return ONLY the JSON object, no explanatory text or markdown code blocks

CRITICAL RULES FOR TASKS:

**Task Filtering - ONLY extract actual implementation tasks:**
- ONLY extract items from "Tasks:" tables or lists with IDs like T-X.Y.Z or similar numbered patterns
- DO NOT extract section headers (e.g., "Product Vision", "Solution", "Problem Statement")
- DO NOT extract technology recommendations (e.g., "Recommended: Three.js")
- DO NOT extract executive summaries, alternatives considered, or informational sections
- A valid task MUST have an implementation description describing code/work to be done

**Priority Rules (MANDATORY):**
- Priority MUST be a value from 1 to 5:
  - 1 = Critical/blocking tasks (must be done first, blocks everything)
  - 2 = Core functionality (essential features)
  - 3 = Standard features (normal priority)
  - 4 = Enhancements (nice improvements)
  - 5 = Low priority (polish, optional)
- NEVER use 0 as a priority value
- When unsure, default to priority 3

**Dependency Rules:**
- For tasks with sequential IDs (T-1.1.1, T-1.1.2, T-1.1.3), each task depends on the prior one:
  - T-1.1.2 should have dependencies: ["T-1.1.1"]
  - T-1.1.3 should have dependencies: ["T-1.1.2"]
- The first task in a sequence (e.g., T-1.1.1) may have no dependencies or depend on setup tasks
- Tasks in different user stories are generally independent unless explicitly stated
- Use the task ID format to infer sequential dependencies within the same user story
"#);

    // Use a dummy session ID for extraction (not stored)
    let extraction_session_id = format!("extract-{}", Uuid::new_v4());

    // Call the AI to extract items
    let response = execute_chat_agent(
        app_handle,
        &extraction_session_id,
        agent_type,
        &prompt,
        working_dir,
    ).await?;

    // Parse the JSON response
    // Try to extract JSON from the response (AI might add extra text)
    let json_str = extract_json_from_response(&response)?;

    let mut structure: ExtractedPRDStructure = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse AI extraction response: {}. Response was: {}", e, json_str))?;

    // Post-process extracted tasks to fix common issues
    post_process_extracted_tasks(&mut structure);

    Ok(structure)
}

/// Extract JSON object from AI response that might contain extra text
fn extract_json_from_response(response: &str) -> Result<String, String> {
    let trimmed = response.trim();

    // If it starts with {, try to find the matching }
    if trimmed.starts_with('{') {
        // Find the last } to handle nested objects
        if let Some(end_pos) = trimmed.rfind('}') {
            return Ok(trimmed[..=end_pos].to_string());
        }
    }

    // Try to find JSON block in markdown code fence
    if let Some(start) = trimmed.find("```json") {
        let after_fence = &trimmed[start + 7..];
        if let Some(end) = after_fence.find("```") {
            return Ok(after_fence[..end].trim().to_string());
        }
    }

    // Try to find JSON block in plain code fence
    if let Some(start) = trimmed.find("```\n{") {
        let after_fence = &trimmed[start + 4..];
        if let Some(end) = after_fence.find("```") {
            return Ok(after_fence[..end].trim().to_string());
        }
    }

    // Try to find any JSON object in the response
    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            if end > start {
                return Ok(trimmed[start..=end].to_string());
            }
        }
    }

    Err(format!("No valid JSON found in response: {}", trimmed.chars().take(200).collect::<String>()))
}

// ============================================================================
// Post-Processing for Extracted Tasks
// ============================================================================

/// Check if a task title represents a valid implementation task
/// Returns false for section headers, recommendations, and informational items
fn is_valid_task(title: &str) -> bool {
    let invalid_patterns = [
        "Product Vision",
        "Problem Statement",
        "Solution",
        "Executive Summary",
        "Alternatives Considered",
        "Technology Decision",
        "Target Platform",
        "Target Audience",
        "Technical Architecture",
        "Overview",
        "Background",
        "Goals",
        "Non-Goals",
        "Success Metrics",
        "Timeline",
        "Risks",
        "Open Questions",
    ];

    // Check for exact or partial matches with invalid patterns
    for pattern in invalid_patterns.iter() {
        if title.contains(pattern) {
            return false;
        }
    }

    // Check for recommendation notes (e.g., "Recommended: Three.js")
    if title.starts_with("Recommended:") || title.starts_with("Recommendation:") {
        return false;
    }

    // Check for common section header patterns (single words that are likely headers)
    let header_words = ["Introduction", "Conclusion", "Summary", "Appendix", "References"];
    for word in header_words.iter() {
        if title.trim() == *word {
            return false;
        }
    }

    true
}

/// Infer sequential dependencies from task IDs
/// Tasks with IDs like T-1.1.2 will depend on T-1.1.1
fn infer_sequential_dependencies(tasks: &mut [crate::models::StructuredPRDItem]) {
    use std::collections::HashMap;

    // Build a map of task IDs for quick lookup
    let task_ids: HashMap<String, usize> = tasks
        .iter()
        .enumerate()
        .map(|(i, t)| (t.id.clone(), i))
        .collect();

    // Regex to match task IDs like T-1.1.1, T-1.2.3, etc.
    let task_id_regex = Regex::new(r"^T-(\d+)\.(\d+)\.(\d+)$").ok();

    for i in 0..tasks.len() {
        let task = &tasks[i];

        // Skip if task already has dependencies
        if task.dependencies.as_ref().map(|d| !d.is_empty()).unwrap_or(false) {
            continue;
        }

        // Try to parse the task ID
        if let Some(ref regex) = task_id_regex {
            if let Some(captures) = regex.captures(&task.id) {
                if let (Some(x), Some(y), Some(z)) = (
                    captures.get(1).and_then(|m| m.as_str().parse::<u32>().ok()),
                    captures.get(2).and_then(|m| m.as_str().parse::<u32>().ok()),
                    captures.get(3).and_then(|m| m.as_str().parse::<u32>().ok()),
                ) {
                    // If z > 1, this task should depend on T-X.Y.(Z-1)
                    if z > 1 {
                        let prev_id = format!("T-{}.{}.{}", x, y, z - 1);
                        if task_ids.contains_key(&prev_id) {
                            tasks[i].dependencies = Some(vec![prev_id]);
                        }
                    }
                }
            }
        }
    }
}

/// Clean markdown table syntax from a description string
/// This handles cases where the AI extracted raw table rows instead of clean descriptions
fn clean_description(description: &str) -> String {
    let trimmed = description.trim();

    // If it doesn't contain table syntax, return as-is
    if !trimmed.contains('|') {
        return trimmed.to_string();
    }

    // Check if this looks like a markdown table (starts with | or contains table patterns)
    let looks_like_table = trimmed.starts_with('|')
        || trimmed.contains("|---|")
        || trimmed.contains("| # |")
        || trimmed.contains("| Task ID |")
        || trimmed.contains("| Status |");

    if !looks_like_table {
        return trimmed.to_string();
    }

    // Try to extract actual description from table format
    // Tables typically have format: | # | Task ID | Task | Description | Status |
    // We want to extract the Description column content

    let mut cleaned_parts: Vec<String> = Vec::new();

    for line in trimmed.lines() {
        let line = line.trim();

        // Skip header/separator rows
        if line.is_empty()
            || line.contains("|---|")
            || line.contains("| # |")
            || line.contains("| Task ID |")
            || line.contains("| Task |")
            || line.contains("| Status |")
            || line.starts_with("|---")
        {
            continue;
        }

        // Split by pipe and try to find meaningful content
        if line.starts_with('|') {
            let cells: Vec<&str> = line.split('|')
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect();

            // For a typical task table: [#, Task ID, Task Title, Description, Status]
            // The Description is usually index 3 (4th column)
            if cells.len() >= 4 {
                // Get the description column (index 3) if it looks like actual content
                let desc_candidate = cells[3];
                if !desc_candidate.is_empty()
                    && !desc_candidate.chars().all(|c| c == '-' || c.is_whitespace())
                    && !desc_candidate.starts_with("P")  // Not a status like "Pending"
                {
                    cleaned_parts.push(desc_candidate.to_string());
                }
            } else if cells.len() >= 2 {
                // Try to find the longest cell as it's likely the description
                if let Some(longest) = cells.iter()
                    .filter(|s| !s.chars().all(|c| c == '-' || c.is_whitespace() || c.is_numeric()))
                    .max_by_key(|s| s.len())
                {
                    if longest.len() > 10 {  // Only if substantial
                        cleaned_parts.push(longest.to_string());
                    }
                }
            }
        }
    }

    if cleaned_parts.is_empty() {
        // Fallback: strip all pipe characters and clean up
        trimmed
            .replace('|', " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        cleaned_parts.join(" ")
    }
}

/// Post-process extracted tasks to fix common issues:
/// 1. Filter out invalid tasks (headers, recommendations)
/// 2. Clean descriptions (remove markdown table syntax)
/// 3. Ensure priority > 0 (default to 3 if 0 or null)
/// 4. Infer sequential dependencies from task IDs
pub fn post_process_extracted_tasks(structure: &mut ExtractedPRDStructure) {
    // Filter out invalid tasks
    structure.tasks.retain(|t| is_valid_task(&t.title));

    // Fix tasks: clean descriptions and ensure valid priorities
    for task in structure.tasks.iter_mut() {
        // Clean description (remove markdown table syntax)
        task.description = clean_description(&task.description);

        // Also clean title if it contains table syntax
        if task.title.contains('|') {
            task.title = clean_description(&task.title);
        }

        // Fix priorities (ensure they're between 1-5, default to 3)
        match task.priority {
            Some(p) if p >= 1 && p <= 5 => {
                // Valid priority, keep it
            }
            _ => {
                // Invalid or missing priority, default to 3 (standard)
                task.priority = Some(3);
            }
        }
    }

    // Infer dependencies from task IDs if not already set
    infer_sequential_dependencies(&mut structure.tasks);
}

// ============================================================================
// PRD Plan File Watcher Commands
// ============================================================================

/// Response for starting a file watch
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WatchFileResponse {
    pub success: bool,
    pub path: String,
    pub initial_content: Option<String>,
    pub error: Option<String>,
}

/// Start watching a PRD plan file for changes
#[tauri::command]
pub async fn start_watching_prd_file(
    session_id: String,
    db: State<'_, Mutex<Database>>,
    watcher_state: State<'_, crate::PrdFileWatcherState>,
) -> Result<WatchFileResponse, String> {
    // Get the session to determine the file path
    let (project_path, title) = {
        let db_guard = lock_db(&db)?;
        let session = db_guard.get_chat_session(&session_id)
            .map_err(|e| format!("Session not found: {}", e))?;
        (session.project_path, session.title)
    };

    let project_path = project_path
        .ok_or("Session has no project path - cannot watch PRD plan file")?;

    // Calculate the plan file path
    let plan_path = crate::watchers::get_prd_plan_file_path(
        &project_path,
        &session_id,
        title.as_deref(),
    );

    // Get the watcher manager and start watching
    let manager = watcher_state.manager.lock()
        .map_err(|e| format!("Failed to lock watcher manager: {}", e))?;

    if let Some(ref manager) = *manager {
        let result = manager.watch_file(&session_id, &plan_path);
        Ok(WatchFileResponse {
            success: result.success,
            path: result.path,
            initial_content: result.initial_content,
            error: result.error,
        })
    } else {
        Err("Watcher manager not initialized".to_string())
    }
}

/// Stop watching a PRD plan file
#[tauri::command]
pub async fn stop_watching_prd_file(
    session_id: String,
    watcher_state: State<'_, crate::PrdFileWatcherState>,
) -> Result<bool, String> {
    let manager = watcher_state.manager.lock()
        .map_err(|e| format!("Failed to lock watcher manager: {}", e))?;

    if let Some(ref manager) = *manager {
        Ok(manager.unwatch_file(&session_id))
    } else {
        Err("Watcher manager not initialized".to_string())
    }
}

/// Get the current content of a PRD plan file
#[tauri::command]
pub async fn get_prd_plan_content(
    session_id: String,
    db: State<'_, Mutex<Database>>,
) -> Result<Option<String>, String> {
    // Get the session to determine the file path
    let (project_path, title) = {
        let db_guard = lock_db(&db)?;
        let session = db_guard.get_chat_session(&session_id)
            .map_err(|e| format!("Session not found: {}", e))?;
        (session.project_path, session.title)
    };

    let project_path = match project_path {
        Some(p) => p,
        None => return Ok(None),
    };

    // Calculate the plan file path
    let plan_path = crate::watchers::get_prd_plan_file_path(
        &project_path,
        &session_id,
        title.as_deref(),
    );

    // Read the file content if it exists
    if plan_path.exists() {
        match std::fs::read_to_string(&plan_path) {
            Ok(content) => Ok(Some(content)),
            Err(e) => {
                log::warn!("Failed to read PRD plan file: {}", e);
                Ok(None)
            }
        }
    } else {
        Ok(None)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentAvailabilityResult {
    pub available: bool,
    pub agent: String,
    pub path: Option<String>,
    pub error: Option<String>,
}

// ============================================================================
// Helper Functions
// ============================================================================

fn parse_agent_type(agent_type: &str) -> Result<AgentType, String> {
    match agent_type.to_lowercase().as_str() {
        "claude" => Ok(AgentType::Claude),
        "opencode" => Ok(AgentType::Opencode),
        "cursor" => Ok(AgentType::Cursor),
        _ => Err(format!("Unknown agent type: {}", agent_type)),
    }
}

// ============================================================================
// Quality Assessment Functions
// ============================================================================

fn calculate_quality_assessment(messages: &[ChatMessage], prd_type: Option<&str>) -> QualityAssessment {
    let extracted = extract_prd_content_advanced(messages);

    let mut missing_sections = vec![];
    let mut suggestions = vec![];

    // Calculate completeness score based on required sections
    let mut completeness_score = 0u8;

    if !extracted.overview.is_empty() && extracted.overview.len() > 50 {
        completeness_score += 15;
    } else {
        missing_sections.push("Problem Statement / Overview".to_string());
        suggestions.push("Describe the problem you're solving and why it matters".to_string());
    }

    if !extracted.user_stories.is_empty() {
        completeness_score += 15;
    } else {
        missing_sections.push("User Stories".to_string());
        suggestions.push("Add user stories in the format: 'As a [user], I want [feature] so that [benefit]'".to_string());
    }

    if !extracted.functional_requirements.is_empty() {
        completeness_score += 15;
    } else {
        missing_sections.push("Functional Requirements".to_string());
        suggestions.push("List what the system must do using 'must', 'shall', or 'should' language".to_string());
    }

    if !extracted.tasks.is_empty() {
        completeness_score += 15;
    } else {
        missing_sections.push("Implementation Tasks".to_string());
        suggestions.push("Break down the feature into actionable implementation tasks".to_string());
    }

    if !extracted.acceptance_criteria.is_empty() {
        completeness_score += 15;
    } else {
        missing_sections.push("Acceptance Criteria".to_string());
        suggestions.push("Define clear acceptance criteria for when the feature is complete".to_string());
    }

    if !extracted.success_metrics.is_empty() {
        completeness_score += 10;
    } else {
        missing_sections.push("Success Metrics".to_string());
        suggestions.push("How will you measure if this feature is successful?".to_string());
    }

    if !extracted.technical_constraints.is_empty() {
        completeness_score += 8;
    }

    if !extracted.out_of_scope.is_empty() {
        completeness_score += 7;
    }

    // Calculate clarity score based on content quality
    let clarity_score = calculate_clarity_score(&extracted, messages);

    // Calculate actionability score
    let actionability_score = calculate_actionability_score(&extracted, prd_type);

    // Calculate overall score (weighted average)
    let overall = ((completeness_score as f32 * 0.4) +
                   (clarity_score as f32 * 0.3) +
                   (actionability_score as f32 * 0.3)) as u8;

    // Add PRD type-specific suggestions
    if let Some(prd_type_str) = prd_type {
        if let Ok(pt) = prd_type_str.parse::<PRDType>() {
            add_type_specific_suggestions(&mut suggestions, pt, &extracted);
        }
    }

    let ready_for_export = overall >= 60 && missing_sections.len() <= 2;

    QualityAssessment {
        completeness: completeness_score,
        clarity: clarity_score,
        actionability: actionability_score,
        overall,
        missing_sections,
        suggestions,
        ready_for_export,
    }
}

/// Check if content contains a numbered task list (e.g., "1. Implement X", "2. Create Y")
fn has_numbered_task_list(content: &str) -> bool {
    let task_verbs = [
        "implement",
        "create",
        "build",
        "add",
        "develop",
        "design",
        "configure",
        "set up",
        "integrate",
        "write",
        "test",
        "update",
        "remove",
        "refactor",
        "migrate",
    ];

    // Count numbered items that look like tasks
    let mut task_count = 0;
    for line in content.lines() {
        let trimmed = line.trim();
        // Check for numbered list items: "1.", "2)", "1:", etc.
        if trimmed.len() > 3 {
            let first_chars: String = trimmed.chars().take(4).collect();
            if first_chars
                .chars()
                .next()
                .map(|c| c.is_ascii_digit())
                .unwrap_or(false)
                && (first_chars.contains('.') || first_chars.contains(')') || first_chars.contains(':'))
            {
                // Check if it contains a task verb
                let lower_line = trimmed.to_lowercase();
                if task_verbs.iter().any(|v| lower_line.contains(v)) {
                    task_count += 1;
                }
            }
        }
    }

    // Consider it a task list if there are 3+ numbered task items
    task_count >= 3
}

/// Calculate quality assessment from PRD markdown file content
fn calculate_quality_from_markdown(content: &str, prd_type: Option<&str>) -> QualityAssessment {
    let content_lower = content.to_lowercase();
    let mut missing_sections = vec![];
    let mut suggestions = vec![];
    let mut completeness_score = 0u8;

    // Check for key PRD sections in the markdown
    // Overview / Problem Statement / Executive Summary
    if content_lower.contains("## overview")
        || content_lower.contains("## problem")
        || content_lower.contains("## executive summary")
        || content_lower.contains("# overview")
        || content_lower.contains("### product vision")
    {
        completeness_score += 15;
    } else {
        missing_sections.push("Problem Statement / Overview".to_string());
        suggestions.push("Add an Overview or Problem Statement section".to_string());
    }

    // User Stories
    if content_lower.contains("user stor")
        || content_lower.contains("as a ")
        || content_lower.contains("## stories")
    {
        completeness_score += 15;
    } else {
        missing_sections.push("User Stories".to_string());
        suggestions.push("Add user stories in the format: 'As a [user], I want [feature] so that [benefit]'".to_string());
    }

    // Requirements (functional/technical)
    if content_lower.contains("requirement")
        || content_lower.contains("## features")
        || content_lower.contains("### features")
        || content_lower.contains("## functionality")
    {
        completeness_score += 15;
    } else {
        missing_sections.push("Functional Requirements".to_string());
        suggestions.push("List what the system must do using clear requirement language".to_string());
    }

    // Tasks / Implementation - Check for various common patterns
    let has_tasks = content_lower.contains("## task")
        || content_lower.contains("# task")
        || content_lower.contains("### task")
        || content_lower.contains("## implementation")
        || content_lower.contains("# implementation")
        || content_lower.contains("### implementation")
        || content_lower.contains("## phases")
        || content_lower.contains("## phase ")
        || content_lower.contains("# phase ")
        || content_lower.contains("## checklist")
        || content_lower.contains("## master checklist")
        || content_lower.contains("## development")
        || content_lower.contains("## action item")
        || content_lower.contains("## todo")
        || content_lower.contains("## to-do")
        || content_lower.contains("## work breakdown")
        // Also check for numbered phase/task/step headers (common LLM format)
        || Regex::new(r"(?m)^#{1,3}\s*(?:phase\s*\d|task\s*\d|step\s*\d)")
            .map(|r| r.is_match(&content_lower))
            .unwrap_or(false)
        // Check for substantial numbered lists with action verbs
        || has_numbered_task_list(&content_lower);

    if has_tasks {
        completeness_score += 15;
    } else {
        missing_sections.push("Implementation Tasks".to_string());
        suggestions.push("Break down the feature into actionable implementation tasks".to_string());
    }

    // Acceptance Criteria
    if content_lower.contains("acceptance")
        || content_lower.contains("## criteria")
        || content_lower.contains("definition of done")
    {
        completeness_score += 15;
    } else {
        missing_sections.push("Acceptance Criteria".to_string());
        suggestions.push("Define clear acceptance criteria for when the feature is complete".to_string());
    }

    // Success Metrics
    if content_lower.contains("metric")
        || content_lower.contains("success")
        || content_lower.contains("kpi")
        || content_lower.contains("measure")
    {
        completeness_score += 10;
    } else {
        missing_sections.push("Success Metrics".to_string());
        suggestions.push("How will you measure if this feature is successful?".to_string());
    }

    // Technical constraints / considerations
    if content_lower.contains("technical")
        || content_lower.contains("constraint")
        || content_lower.contains("technology")
        || content_lower.contains("architecture")
    {
        completeness_score += 8;
    }

    // Out of scope
    if content_lower.contains("out of scope")
        || content_lower.contains("non-goal")
        || content_lower.contains("not included")
        || content_lower.contains("scope")
    {
        completeness_score += 7;
    }

    // Calculate clarity score based on markdown structure
    let clarity_score = calculate_clarity_from_markdown(content);

    // Calculate actionability score based on content
    let actionability_score = calculate_actionability_from_markdown(content, prd_type);

    // Calculate overall score (weighted average)
    let overall = ((completeness_score as f32 * 0.4) +
                   (clarity_score as f32 * 0.3) +
                   (actionability_score as f32 * 0.3)) as u8;

    // Add PRD type-specific suggestions
    if let Some(prd_type_str) = prd_type {
        if let Ok(pt) = prd_type_str.parse::<PRDType>() {
            // Reuse type-specific suggestions logic with empty extracted content
            let extracted = ExtractedPRDContent {
                overview: String::new(),
                user_stories: vec![],
                functional_requirements: vec![],
                non_functional_requirements: vec![],
                technical_constraints: vec![],
                acceptance_criteria: vec![],
                tasks: vec![],
                success_metrics: vec![],
                out_of_scope: vec![],
            };
            add_type_specific_suggestions(&mut suggestions, pt, &extracted);
        }
    }

    let ready_for_export = overall >= 60 && missing_sections.len() <= 2;

    QualityAssessment {
        completeness: completeness_score,
        clarity: clarity_score,
        actionability: actionability_score,
        overall,
        missing_sections,
        suggestions,
        ready_for_export,
    }
}

/// Calculate clarity score from markdown content
fn calculate_clarity_from_markdown(content: &str) -> u8 {
    let mut score = 50u8;

    // Bonus for having headers (well-structured)
    let header_count = content.matches("\n#").count() + content.matches("\n##").count();
    if header_count >= 3 {
        score = score.saturating_add(15);
    } else if header_count >= 1 {
        score = score.saturating_add(5);
    }

    // Bonus for having lists (organized)
    let list_count = content.matches("\n- ").count() + content.matches("\n* ").count();
    if list_count >= 5 {
        score = score.saturating_add(10);
    }

    // Bonus for code blocks (technical detail)
    if content.contains("```") {
        score = score.saturating_add(5);
    }

    // Bonus for tables (structured data)
    if content.contains("|--") || content.contains("| -") {
        score = score.saturating_add(10);
    }

    // Penalize if too short
    if content.len() < 500 {
        score = score.saturating_sub(20);
    } else if content.len() > 2000 {
        score = score.saturating_add(10);
    }

    // Bonus for requirement language
    let action_verb_pattern = Regex::new(r"(?i)\b(must|shall|should|will|can|may)\b").unwrap();
    let action_count = action_verb_pattern.find_iter(content).count();
    if action_count > 5 {
        score = score.saturating_add(10);
    }

    score.min(100)
}

/// Calculate actionability score from markdown content
fn calculate_actionability_from_markdown(content: &str, prd_type: Option<&str>) -> u8 {
    let mut score = 40u8;
    let content_lower = content.to_lowercase();

    // Bonus for numbered lists (actionable steps)
    let numbered_pattern = Regex::new(r"\n\d+\.").unwrap();
    let numbered_count = numbered_pattern.find_iter(content).count();
    if numbered_count >= 3 {
        score = score.saturating_add(15);
    }

    // Bonus for task-like language
    let task_patterns = ["implement", "create", "build", "design", "test", "deploy", "configure", "add", "remove", "update"];
    let task_count: usize = task_patterns.iter()
        .map(|p| content_lower.matches(p).count())
        .sum();
    if task_count >= 5 {
        score = score.saturating_add(15);
    }

    // Bonus for priority/phase indicators
    if content_lower.contains("priority") || content_lower.contains("phase") || content_lower.contains("milestone") {
        score = score.saturating_add(10);
    }

    // Bonus for time estimates
    if content_lower.contains("hour") || content_lower.contains("day") || content_lower.contains("week") || content_lower.contains("sprint") {
        score = score.saturating_add(10);
    }

    // Type-specific bonuses
    if let Some(pt) = prd_type {
        match pt {
            "new_feature" => {
                if content_lower.contains("mvp") || content_lower.contains("minimum viable") {
                    score = score.saturating_add(10);
                }
            }
            "bug_fix" => {
                if content_lower.contains("root cause") || content_lower.contains("reproduce") {
                    score = score.saturating_add(10);
                }
            }
            "refactor" => {
                if content_lower.contains("before") && content_lower.contains("after") {
                    score = score.saturating_add(10);
                }
            }
            "integration" => {
                if content_lower.contains("api") || content_lower.contains("endpoint") {
                    score = score.saturating_add(10);
                }
            }
            _ => {}
        }
    }

    score.min(100)
}

fn calculate_clarity_score(extracted: &ExtractedPRDContent, messages: &[ChatMessage]) -> u8 {
    let mut score = 50u8; // Base score

    // Penalize if overview is too short
    if extracted.overview.len() < 100 {
        score = score.saturating_sub(15);
    } else if extracted.overview.len() > 200 {
        score = score.saturating_add(10);
    }

    // Bonus for well-formatted requirements (contain action verbs)
    let action_verb_pattern = Regex::new(r"(?i)\b(must|shall|should|will|can|may)\b").unwrap();
    let reqs_with_action = extracted.functional_requirements.iter()
        .filter(|r| action_verb_pattern.is_match(r))
        .count();
    if reqs_with_action > 0 {
        score = score.saturating_add((reqs_with_action * 5).min(20) as u8);
    }

    // Bonus for having numbered or bulleted tasks
    let task_count = extracted.tasks.len();
    if task_count >= 3 && task_count <= 15 {
        score = score.saturating_add(15);
    } else if task_count > 15 {
        score = score.saturating_add(10); // Slightly penalize too many tasks
    }

    // Check for contradictions or confusion (multiple "?" in assistant messages)
    let confusion_count = messages.iter()
        .filter(|m| m.role == MessageRole::Assistant)
        .filter(|m| m.content.matches('?').count() > 3)
        .count();
    if confusion_count > 2 {
        score = score.saturating_sub(10);
    }

    score.min(100)
}

fn calculate_actionability_score(extracted: &ExtractedPRDContent, prd_type: Option<&str>) -> u8 {
    let mut score = 40u8; // Base score

    // Bonus for having tasks
    let task_count = extracted.tasks.len();
    score = score.saturating_add((task_count * 5).min(25) as u8);

    // Bonus for acceptance criteria
    let ac_count = extracted.acceptance_criteria.len();
    score = score.saturating_add((ac_count * 5).min(20) as u8);

    // Bonus for having out-of-scope items (shows bounded scope)
    if !extracted.out_of_scope.is_empty() {
        score = score.saturating_add(10);
    }

    // PRD type-specific adjustments
    if let Some(prd_type_str) = prd_type {
        if let Ok(pt) = prd_type_str.parse::<PRDType>() {
            match pt {
                PRDType::BugFix => {
                    // Bug fixes should have clear reproduction steps
                    if extracted.overview.to_lowercase().contains("reproduce") ||
                       extracted.overview.to_lowercase().contains("steps") {
                        score = score.saturating_add(10);
                    }
                }
                PRDType::ApiIntegration => {
                    // API integrations should mention endpoints or data formats
                    if extracted.technical_constraints.iter()
                        .any(|c| c.to_lowercase().contains("endpoint") ||
                                 c.to_lowercase().contains("api") ||
                                 c.to_lowercase().contains("json")) {
                        score = score.saturating_add(10);
                    }
                }
                _ => {}
            }
        }
    }

    score.min(100)
}

fn add_type_specific_suggestions(suggestions: &mut Vec<String>, prd_type: PRDType, extracted: &ExtractedPRDContent) {
    match prd_type {
        PRDType::BugFix => {
            if !extracted.overview.to_lowercase().contains("reproduce") {
                suggestions.push("Include steps to reproduce the bug".to_string());
            }
            if !extracted.overview.to_lowercase().contains("expected") {
                suggestions.push("Describe expected vs actual behavior".to_string());
            }
        }
        PRDType::NewFeature => {
            if extracted.user_stories.is_empty() {
                suggestions.push("Add user stories to clarify who benefits and how".to_string());
            }
        }
        PRDType::ApiIntegration => {
            if !extracted.technical_constraints.iter().any(|c| c.to_lowercase().contains("endpoint")) {
                suggestions.push("Document the API endpoints that will be used".to_string());
            }
            if !extracted.technical_constraints.iter().any(|c| c.to_lowercase().contains("auth")) {
                suggestions.push("Describe the authentication requirements".to_string());
            }
        }
        PRDType::Refactoring => {
            if !extracted.out_of_scope.iter().any(|s| s.to_lowercase().contains("behavior")) {
                suggestions.push("Clarify that existing behavior should not change".to_string());
            }
        }
        PRDType::General => {}
        PRDType::FullNewApp => {
            if !extracted.overview.to_lowercase().contains("persona") && !extracted.overview.to_lowercase().contains("user") {
                suggestions.push("Add user personas to clarify target audience".to_string());
            }
            if !extracted.overview.to_lowercase().contains("mvp") && !extracted.overview.to_lowercase().contains("minimum viable") {
                suggestions.push("Define MVP scope to focus initial development".to_string());
            }
            if !extracted.technical_constraints.iter().any(|c| c.to_lowercase().contains("stack") || c.to_lowercase().contains("framework")) {
                suggestions.push("Document technology stack choices".to_string());
            }
            if !extracted.technical_constraints.iter().any(|c| c.to_lowercase().contains("deploy") || c.to_lowercase().contains("host")) {
                suggestions.push("Include deployment and hosting strategy".to_string());
            }
        }
    }
}

// ============================================================================
// Guided Questions Generator
// ============================================================================

fn generate_guided_questions(prd_type: PRDType) -> Vec<GuidedQuestion> {
    let mut questions = vec![
        // Common questions for all PRD types
        GuidedQuestion {
            id: "problem_statement".to_string(),
            question: "What problem are you trying to solve?".to_string(),
            question_type: QuestionType::FreeText,
            options: None,
            required: true,
            hint: Some("Describe the pain point or need that this addresses".to_string()),
        },
        GuidedQuestion {
            id: "target_user".to_string(),
            question: "Who is the target user for this?".to_string(),
            question_type: QuestionType::FreeText,
            options: None,
            required: true,
            hint: Some("Be specific about the user persona or role".to_string()),
        },
    ];

    // Add type-specific questions
    match prd_type {
        PRDType::NewFeature => {
            questions.extend(vec![
                GuidedQuestion {
                    id: "user_story".to_string(),
                    question: "Can you describe a user story? (As a [user], I want [feature] so that [benefit])".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("User stories help clarify the value proposition".to_string()),
                },
                GuidedQuestion {
                    id: "success_metrics".to_string(),
                    question: "How will you measure success?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: false,
                    hint: Some("e.g., user adoption rate, time saved, error reduction".to_string()),
                },
                GuidedQuestion {
                    id: "out_of_scope".to_string(),
                    question: "What is explicitly out of scope for this feature?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: false,
                    hint: Some("Defining boundaries helps prevent scope creep".to_string()),
                },
            ]);
        }
        PRDType::BugFix => {
            questions.extend(vec![
                GuidedQuestion {
                    id: "repro_steps".to_string(),
                    question: "What are the steps to reproduce this bug?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("List numbered steps to reliably trigger the bug".to_string()),
                },
                GuidedQuestion {
                    id: "expected_behavior".to_string(),
                    question: "What is the expected behavior?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: None,
                },
                GuidedQuestion {
                    id: "actual_behavior".to_string(),
                    question: "What is the actual (buggy) behavior?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: None,
                },
                GuidedQuestion {
                    id: "severity".to_string(),
                    question: "What is the severity of this bug?".to_string(),
                    question_type: QuestionType::MultipleChoice,
                    options: Some(vec![
                        "Critical - System unusable".to_string(),
                        "High - Major feature broken".to_string(),
                        "Medium - Feature partially broken".to_string(),
                        "Low - Minor inconvenience".to_string(),
                    ]),
                    required: true,
                    hint: None,
                },
            ]);
        }
        PRDType::Refactoring => {
            questions.extend(vec![
                GuidedQuestion {
                    id: "current_state".to_string(),
                    question: "What is the current state of the code you want to refactor?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("Describe the code smell or architectural issue".to_string()),
                },
                GuidedQuestion {
                    id: "desired_state".to_string(),
                    question: "What is the desired state after refactoring?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("Describe the target architecture or patterns".to_string()),
                },
                GuidedQuestion {
                    id: "behavior_change".to_string(),
                    question: "Should this refactoring change any external behavior?".to_string(),
                    question_type: QuestionType::Confirmation,
                    options: Some(vec![
                        "No, behavior must remain identical".to_string(),
                        "Yes, some behavior changes are acceptable".to_string(),
                    ]),
                    required: true,
                    hint: None,
                },
            ]);
        }
        PRDType::ApiIntegration => {
            questions.extend(vec![
                GuidedQuestion {
                    id: "api_provider".to_string(),
                    question: "What API or service are you integrating with?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("Name of the service and link to API docs if available".to_string()),
                },
                GuidedQuestion {
                    id: "auth_method".to_string(),
                    question: "What authentication method does the API use?".to_string(),
                    question_type: QuestionType::MultipleChoice,
                    options: Some(vec![
                        "API Key".to_string(),
                        "OAuth 2.0".to_string(),
                        "JWT/Bearer Token".to_string(),
                        "Basic Auth".to_string(),
                        "No Authentication".to_string(),
                        "Other".to_string(),
                    ]),
                    required: true,
                    hint: None,
                },
                GuidedQuestion {
                    id: "data_flow".to_string(),
                    question: "Describe the data flow: what data do you send and receive?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("Include request/response formats if known".to_string()),
                },
                GuidedQuestion {
                    id: "error_handling".to_string(),
                    question: "How should API errors be handled?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: false,
                    hint: Some("Retry strategy, fallbacks, user messaging".to_string()),
                },
            ]);
        }
        PRDType::General => {
            questions.extend(vec![
                GuidedQuestion {
                    id: "description".to_string(),
                    question: "Describe what you want to build or change.".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: None,
                },
                GuidedQuestion {
                    id: "constraints".to_string(),
                    question: "Are there any technical constraints or dependencies?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: false,
                    hint: Some("e.g., must work with existing database, specific framework requirements".to_string()),
                },
            ]);
        }
        PRDType::FullNewApp => {
            questions.extend(vec![
                // Vision questions
                GuidedQuestion {
                    id: "project_vision".to_string(),
                    question: "What is the vision and main goals for this application?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("Describe what success looks like and the core value proposition".to_string()),
                },
                GuidedQuestion {
                    id: "target_audience".to_string(),
                    question: "Who is the target audience? Describe your user personas.".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("Include demographics, needs, and pain points".to_string()),
                },
                GuidedQuestion {
                    id: "success_metrics".to_string(),
                    question: "How will you measure success for this application?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: false,
                    hint: Some("e.g., user adoption, revenue, engagement metrics".to_string()),
                },
                // Technical questions
                GuidedQuestion {
                    id: "tech_stack".to_string(),
                    question: "What type of application are you building?".to_string(),
                    question_type: QuestionType::MultipleChoice,
                    options: Some(vec![
                        "Web Application".to_string(),
                        "Mobile Application".to_string(),
                        "Desktop Application".to_string(),
                        "CLI Tool".to_string(),
                        "API/Backend Service".to_string(),
                    ]),
                    required: true,
                    hint: None,
                },
                GuidedQuestion {
                    id: "frontend_framework".to_string(),
                    question: "Do you have a frontend framework preference?".to_string(),
                    question_type: QuestionType::MultipleChoice,
                    options: Some(vec![
                        "React".to_string(),
                        "Vue".to_string(),
                        "Svelte".to_string(),
                        "None/Not applicable".to_string(),
                        "Other".to_string(),
                    ]),
                    required: false,
                    hint: None,
                },
                GuidedQuestion {
                    id: "backend_database".to_string(),
                    question: "What are your backend and database requirements?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("Include language preferences, database type, and any infrastructure needs".to_string()),
                },
                GuidedQuestion {
                    id: "auth_needs".to_string(),
                    question: "What authentication does your app need?".to_string(),
                    question_type: QuestionType::MultipleChoice,
                    options: Some(vec![
                        "Email/Password".to_string(),
                        "OAuth (Google, GitHub, etc.)".to_string(),
                        "No authentication needed".to_string(),
                        "Other".to_string(),
                    ]),
                    required: true,
                    hint: None,
                },
                GuidedQuestion {
                    id: "core_features".to_string(),
                    question: "What are the core features for the MVP?".to_string(),
                    question_type: QuestionType::FreeText,
                    options: None,
                    required: true,
                    hint: Some("List the essential features needed for first release".to_string()),
                },
                GuidedQuestion {
                    id: "deployment_target".to_string(),
                    question: "Where will this application be deployed?".to_string(),
                    question_type: QuestionType::MultipleChoice,
                    options: Some(vec![
                        "Cloud (AWS, GCP, Azure, etc.)".to_string(),
                        "Self-hosted".to_string(),
                        "Desktop application".to_string(),
                        "Mobile app stores".to_string(),
                    ]),
                    required: true,
                    hint: None,
                },
            ]);
        }
    }

    // Add common closing questions
    questions.push(GuidedQuestion {
        id: "acceptance_criteria".to_string(),
        question: "What are the acceptance criteria for this to be considered complete?".to_string(),
        question_type: QuestionType::FreeText,
        options: None,
        required: true,
        hint: Some("List specific, testable criteria".to_string()),
    });

    questions
}

// ============================================================================
// Advanced Extraction Algorithm
// ============================================================================

fn extract_prd_content_advanced(messages: &[ChatMessage]) -> ExtractedPRDContent {
    let all_content: String = messages.iter()
        .map(|m| m.content.clone())
        .collect::<Vec<_>>()
        .join("\n\n");

    let user_content: String = messages.iter()
        .filter(|m| m.role == MessageRole::User)
        .map(|m| m.content.clone())
        .collect::<Vec<_>>()
        .join("\n\n");

    let assistant_content: String = messages.iter()
        .filter(|m| m.role == MessageRole::Assistant)
        .map(|m| m.content.clone())
        .collect::<Vec<_>>()
        .join("\n\n");

    ExtractedPRDContent {
        overview: extract_overview_advanced(&user_content, &assistant_content),
        user_stories: extract_user_stories(&all_content),
        functional_requirements: extract_functional_requirements(&all_content),
        non_functional_requirements: extract_non_functional_requirements(&all_content),
        technical_constraints: extract_technical_constraints(&all_content),
        success_metrics: extract_success_metrics(&all_content),
        tasks: extract_tasks_advanced(&all_content),
        acceptance_criteria: extract_acceptance_criteria(&all_content),
        out_of_scope: extract_out_of_scope(&all_content),
    }
}

fn extract_overview_advanced(user_content: &str, assistant_content: &str) -> String {
    // First, try to get the user's initial problem statement
    let first_user_statement = user_content.lines()
        .take(5)
        .filter(|l| !l.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    // Then get any summary from the assistant
    let summary_patterns = [
        r"(?i)(?:summary|overview|problem statement|in summary)[:\s]+([^\n]{30,})",
        r"(?i)(?:you want to|you're looking to|the goal is)[:\s]*([^\n]{30,})",
    ];

    let mut assistant_summary = String::new();
    for pattern in summary_patterns {
        if let Ok(re) = Regex::new(pattern) {
            if let Some(cap) = re.captures(assistant_content) {
                if let Some(m) = cap.get(1) {
                    assistant_summary = m.as_str().trim().to_string();
                    break;
                }
            }
        }
    }

    if !assistant_summary.is_empty() {
        format!("{}\n\n{}", first_user_statement, assistant_summary)
    } else {
        first_user_statement
    }
}

fn extract_user_stories(content: &str) -> Vec<String> {
    let mut stories = vec![];

    // Pattern: "As a [user], I want [feature] so that [benefit]"
    let user_story_pattern = Regex::new(
        r"(?i)as (?:a|an) ([^,]+),?\s*I want ([^,]+?)(?:,?\s*so that ([^\n.]+))?"
    ).unwrap();

    for cap in user_story_pattern.captures_iter(content) {
        let user = cap.get(1).map_or("", |m| m.as_str()).trim();
        let want = cap.get(2).map_or("", |m| m.as_str()).trim();
        let benefit = cap.get(3).map_or("", |m| m.as_str()).trim();

        if !benefit.is_empty() {
            stories.push(format!("As a {}, I want {} so that {}", user, want, benefit));
        } else {
            stories.push(format!("As a {}, I want {}", user, want));
        }
    }

    // Deduplicate
    stories.sort();
    stories.dedup();
    stories
}

fn extract_functional_requirements(content: &str) -> Vec<String> {
    let mut requirements = vec![];

    // Pattern: Lines containing requirement keywords
    let requirement_pattern = Regex::new(
        r"(?i)(?:^|\n)\s*[-*•]?\s*(?:the system |the app(?:lication)? |it |users? )?(?:must|shall|should|will|needs? to)\s+([^\n.]+[.\n])"
    ).unwrap();

    for cap in requirement_pattern.captures_iter(content) {
        if let Some(m) = cap.get(1) {
            let req = m.as_str().trim().trim_end_matches('.');
            if req.len() > 10 { // Skip very short matches
                requirements.push(req.to_string());
            }
        }
    }

    // Also look for numbered requirements
    let numbered_pattern = Regex::new(
        r"(?i)(?:^|\n)\s*\d+[.)]\s*([^\n]{15,})"
    ).unwrap();

    for cap in numbered_pattern.captures_iter(content) {
        if let Some(m) = cap.get(1) {
            let req = m.as_str().trim();
            // Check if it looks like a requirement
            if req.to_lowercase().contains("must") ||
               req.to_lowercase().contains("shall") ||
               req.to_lowercase().contains("should") ||
               req.to_lowercase().contains("require") {
                requirements.push(req.trim_end_matches('.').to_string());
            }
        }
    }

    // Deduplicate and limit
    requirements.sort();
    requirements.dedup();
    requirements.truncate(20);
    requirements
}

fn extract_non_functional_requirements(content: &str) -> Vec<String> {
    let mut nfrs = vec![];

    let nfr_keywords = [
        "performance", "scalab", "secur", "reliab", "availab",
        "maintainab", "usab", "access", "latency", "throughput",
        "response time", "uptime", "backup", "compliance", "gdpr"
    ];

    for line in content.lines() {
        let lower = line.to_lowercase();
        if nfr_keywords.iter().any(|kw| lower.contains(kw)) {
            let trimmed = line.trim().trim_start_matches(|c: char| c == '-' || c == '*' || c == '•' || c.is_ascii_digit() || c == '.' || c == ')').trim();
            if trimmed.len() > 15 {
                nfrs.push(trimmed.to_string());
            }
        }
    }

    nfrs.sort();
    nfrs.dedup();
    nfrs.truncate(10);
    nfrs
}

fn extract_technical_constraints(content: &str) -> Vec<String> {
    let mut constraints = vec![];

    let constraint_keywords = [
        "constraint", "limitation", "must use", "required to use",
        "compatible with", "integrate with", "api", "endpoint",
        "database", "framework", "library", "version", "protocol"
    ];

    for line in content.lines() {
        let lower = line.to_lowercase();
        if constraint_keywords.iter().any(|kw| lower.contains(kw)) {
            let trimmed = line.trim().trim_start_matches(|c: char| c == '-' || c == '*' || c == '•' || c.is_ascii_digit() || c == '.' || c == ')').trim();
            if trimmed.len() > 10 {
                constraints.push(trimmed.to_string());
            }
        }
    }

    constraints.sort();
    constraints.dedup();
    constraints.truncate(10);
    constraints
}

fn extract_success_metrics(content: &str) -> Vec<String> {
    let mut metrics = vec![];

    let metric_keywords = [
        "metric", "measure", "kpi", "success", "goal", "target",
        "increase", "decrease", "reduce", "improve", "%", "percent"
    ];

    // Pattern for metrics with numbers
    let metric_pattern = Regex::new(
        r"(?i)(?:increase|decrease|reduce|improve|achieve|reach|target)[:\s]+[^\n]*\d+[^\n]*"
    ).unwrap();

    for cap in metric_pattern.find_iter(content) {
        let metric = cap.as_str().trim();
        if metric.len() > 10 {
            metrics.push(metric.to_string());
        }
    }

    // Also look for lines with metric keywords
    for line in content.lines() {
        let lower = line.to_lowercase();
        if metric_keywords.iter().any(|kw| lower.contains(kw)) {
            let trimmed = line.trim().trim_start_matches(|c: char| c == '-' || c == '*' || c == '•' || c.is_ascii_digit() || c == '.' || c == ')').trim();
            if trimmed.len() > 10 && !metrics.contains(&trimmed.to_string()) {
                metrics.push(trimmed.to_string());
            }
        }
    }

    metrics.truncate(10);
    metrics
}

fn extract_tasks_advanced(content: &str) -> Vec<String> {
    let mut tasks = vec![];

    // Pattern: Task-like sentences with action verbs
    let task_pattern = Regex::new(
        r"(?i)(?:^|\n)\s*[-*•]?\s*(?:\d+[.)]\s*)?(?:implement|create|build|add|update|fix|refactor|design|develop|integrate|write|test|deploy|configure|set up|remove|delete|modify)\s+([^\n]{10,})"
    ).unwrap();

    for cap in task_pattern.captures_iter(content) {
        if let Some(m) = cap.get(0) {
            let task = m.as_str().trim()
                .trim_start_matches(|c: char| c == '-' || c == '*' || c == '•' || c.is_ascii_digit() || c == '.' || c == ')' || c.is_whitespace())
                .trim();
            if task.len() > 10 {
                tasks.push(task.to_string());
            }
        }
    }

    // Look for numbered lists that might be tasks
    let numbered_task_pattern = Regex::new(
        r"(?:^|\n)\s*(\d+)[.)]\s+([^\n]{15,})"
    ).unwrap();

    for cap in numbered_task_pattern.captures_iter(content) {
        if let Some(m) = cap.get(2) {
            let task = m.as_str().trim();
            let lower = task.to_lowercase();
            // Check if it looks like a task
            if lower.starts_with("implement") || lower.starts_with("create") ||
               lower.starts_with("build") || lower.starts_with("add") ||
               lower.starts_with("update") || lower.starts_with("fix") ||
               lower.starts_with("refactor") || lower.starts_with("design") ||
               lower.contains("should") || lower.contains("need to") {
                if !tasks.contains(&task.to_string()) {
                    tasks.push(task.to_string());
                }
            }
        }
    }

    // Deduplicate and limit
    tasks.sort();
    tasks.dedup();
    tasks.truncate(15);
    tasks
}

fn extract_acceptance_criteria(content: &str) -> Vec<String> {
    let mut criteria = vec![];

    // Look for acceptance criteria section
    let ac_section_pattern = Regex::new(
        r"(?i)acceptance criteria[:\s]*\n((?:[-*•]?\s*[^\n]+\n?)+)"
    ).unwrap();

    if let Some(cap) = ac_section_pattern.captures(content) {
        if let Some(m) = cap.get(1) {
            for line in m.as_str().lines() {
                let trimmed = line.trim()
                    .trim_start_matches(|c: char| c == '-' || c == '*' || c == '•' || c.is_ascii_digit() || c == '.' || c == ')' || c == '[' || c == ']')
                    .trim();
                if trimmed.len() > 5 {
                    criteria.push(trimmed.to_string());
                }
            }
        }
    }

    // Also look for "Given/When/Then" patterns
    let gwt_pattern = Regex::new(
        r"(?i)(given[^\n]+when[^\n]+then[^\n]+)"
    ).unwrap();

    for cap in gwt_pattern.captures_iter(content) {
        if let Some(m) = cap.get(1) {
            criteria.push(m.as_str().trim().to_string());
        }
    }

    // Look for "verify that" or "ensure that" patterns
    let verify_pattern = Regex::new(
        r"(?i)(?:verify|ensure|confirm|check) that\s+([^\n.]+)"
    ).unwrap();

    for cap in verify_pattern.captures_iter(content) {
        if let Some(m) = cap.get(1) {
            let criterion = format!("Verify that {}", m.as_str().trim());
            if !criteria.contains(&criterion) {
                criteria.push(criterion);
            }
        }
    }

    criteria.truncate(15);
    criteria
}

fn extract_out_of_scope(content: &str) -> Vec<String> {
    let mut out_of_scope = vec![];

    // Look for out of scope section
    let oos_patterns = [
        r"(?i)(?:out of scope|not in scope|excluded|won't include|will not include)[:\s]*\n((?:[-*•]?\s*[^\n]+\n?)+)",
        r"(?i)(?:this (?:does not|doesn't|won't|will not) include)[:\s]*([^\n]+)",
    ];

    for pattern in oos_patterns {
        if let Ok(re) = Regex::new(pattern) {
            for cap in re.captures_iter(content) {
                if let Some(m) = cap.get(1) {
                    for line in m.as_str().lines() {
                        let trimmed = line.trim()
                            .trim_start_matches(|c: char| c == '-' || c == '*' || c == '•' || c.is_ascii_digit() || c == '.' || c == ')')
                            .trim();
                        if trimmed.len() > 5 && !out_of_scope.contains(&trimmed.to_string()) {
                            out_of_scope.push(trimmed.to_string());
                        }
                    }
                }
            }
        }
    }

    out_of_scope.truncate(10);
    out_of_scope
}

fn build_prd_chat_prompt(
    session: &ChatSession,
    history: &[ChatMessage],
    current_message: &str,
) -> String {
    let mut prompt = String::new();

    // System context for PRD creation
    prompt.push_str("You are an expert product manager helping to create a Product Requirements Document (PRD). ");
    prompt.push_str("Your goal is to help the user articulate their product requirements clearly and comprehensively.\n\n");

    prompt.push_str("Focus on:\n");
    prompt.push_str("- Understanding the problem being solved\n");
    prompt.push_str("- Defining clear user stories and acceptance criteria\n");
    prompt.push_str("- Breaking down features into actionable tasks\n");
    prompt.push_str("- Identifying technical requirements and constraints\n");
    prompt.push_str("- Suggesting success metrics and validation criteria\n\n");

    // Add structured output instructions if enabled
    if session.structured_mode {
        prompt.push_str("=== STRUCTURED OUTPUT MODE ===\n\n");
        prompt.push_str("When defining PRD items, output them as JSON code blocks. This enables real-time tracking and organization.\n\n");
        prompt.push_str("Output format examples:\n\n");
        prompt.push_str("For epics:\n");
        prompt.push_str("```json\n");
        prompt.push_str("{\n");
        prompt.push_str("  \"type\": \"epic\",\n");
        prompt.push_str("  \"id\": \"EP-1\",\n");
        prompt.push_str("  \"title\": \"User Authentication System\",\n");
        prompt.push_str("  \"description\": \"Complete authentication flow with login, signup, and password reset\"\n");
        prompt.push_str("}\n");
        prompt.push_str("```\n\n");
        prompt.push_str("For user stories:\n");
        prompt.push_str("```json\n");
        prompt.push_str("{\n");
        prompt.push_str("  \"type\": \"user_story\",\n");
        prompt.push_str("  \"id\": \"US-1.1\",\n");
        prompt.push_str("  \"parentId\": \"EP-1\",\n");
        prompt.push_str("  \"title\": \"User Login\",\n");
        prompt.push_str("  \"description\": \"As a user, I want to log in with email and password so that I can access my account\",\n");
        prompt.push_str("  \"acceptanceCriteria\": [\n");
        prompt.push_str("    \"User can enter email and password\",\n");
        prompt.push_str("    \"Invalid credentials show error message\",\n");
        prompt.push_str("    \"Successful login redirects to dashboard\"\n");
        prompt.push_str("  ],\n");
        prompt.push_str("  \"priority\": 1,\n");
        prompt.push_str("  \"estimatedEffort\": \"medium\"\n");
        prompt.push_str("}\n");
        prompt.push_str("```\n\n");
        prompt.push_str("For tasks:\n");
        prompt.push_str("```json\n");
        prompt.push_str("{\n");
        prompt.push_str("  \"type\": \"task\",\n");
        prompt.push_str("  \"id\": \"T-1.1.1\",\n");
        prompt.push_str("  \"parentId\": \"US-1.1\",\n");
        prompt.push_str("  \"title\": \"Create login form component\",\n");
        prompt.push_str("  \"description\": \"Build React component with email/password inputs and validation\",\n");
        prompt.push_str("  \"estimatedEffort\": \"small\"\n");
        prompt.push_str("}\n");
        prompt.push_str("```\n\n");
        prompt.push_str("Guidelines:\n");
        prompt.push_str("- Use sequential IDs: EP-1, EP-2 for epics; US-1.1, US-1.2 for stories under EP-1; T-1.1.1 for tasks under US-1.1\n");
        prompt.push_str("- Link items using parentId to maintain hierarchy\n");
        prompt.push_str("- Priority is 1-5 (1 = highest priority)\n");
        prompt.push_str("- estimatedEffort is 'small', 'medium', or 'large'\n");
        prompt.push_str("- Continue conversation naturally, outputting JSON blocks when defining new PRD items\n\n");
        prompt.push_str("=== END STRUCTURED OUTPUT MODE ===\n\n");
    }

    // Include project context if available
    if let Some(ref project_path) = session.project_path {
        prompt.push_str(&format!("Project path: {}\n\n", project_path));

        // Add plan file instruction
        let plan_file_instruction = get_prd_plan_instruction(project_path, &session.id, session.title.as_deref());
        prompt.push_str(&plan_file_instruction);
    }

    // Include conversation history
    if !history.is_empty() {
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

    // Current user message
    prompt.push_str(&format!("User: {}\n\nAssistant:", current_message));

    prompt
}

/// Generate the plan file instruction to be injected into prompts
/// This instructs the AI to maintain a living plan document
fn get_prd_plan_instruction(project_path: &str, session_id: &str, title: Option<&str>) -> String {
    let prd_name = title
        .map(|t| sanitize_filename_for_prd(t))
        .unwrap_or_else(|| format!("prd-{}", session_id));

    format!(
        "\n=== PLAN FILE INSTRUCTION ===\n\n\
        Maintain a living plan document at: `{project_path}/.ralph-ui/prds/{prd_name}.md`\n\n\
        This file should contain:\n\
        - Current understanding of requirements\n\
        - Key decisions and rationale\n\
        - Draft user stories and tasks as they emerge\n\
        - Open questions to resolve\n\n\
        UPDATE THIS FILE NOW with any new insights from this exchange.\n\
        Write the file content using your file writing capabilities.\n\n\
        === END PLAN FILE INSTRUCTION ===\n\n"
    )
}

/// Sanitize a string for use as a filename (for PRD plan files)
fn sanitize_filename_for_prd(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else if c.is_whitespace() {
                '-'
            } else {
                '_'
            }
        })
        .collect::<String>()
        .to_lowercase()
        .chars()
        .take(50) // Limit length
        .collect()
}

/// Default timeout for agent execution (25 minutes - 5x multiplier for longer agent operations)
const AGENT_TIMEOUT_SECS: u64 = 1500;

async fn execute_chat_agent(
    app_handle: &tauri::AppHandle,
    session_id: &str,
    agent_type: AgentType,
    prompt: &str,
    working_dir: Option<&str>,
) -> Result<String, String> {
    use crate::events::{emit_prd_chat_chunk, PrdChatChunkPayload};
    use std::process::Stdio;
    use tokio::io::{AsyncBufReadExt, BufReader};
    use tokio::process::Command;
    use tokio::time::{timeout, Duration};

    let (program, args) = match agent_type {
        AgentType::Claude => {
            // Use claude CLI in print mode for single response
            // --dangerously-skip-permissions allows file writes for plan documents
            ("claude", vec![
                "-p".to_string(),
                "--dangerously-skip-permissions".to_string(),
                prompt.to_string(),
            ])
        }
        AgentType::Opencode => {
            // Use opencode CLI
            ("opencode", vec!["chat".to_string(), prompt.to_string()])
        }
        AgentType::Cursor => {
            // Use cursor agent CLI
            ("cursor-agent", vec!["--prompt".to_string(), prompt.to_string()])
        }
        AgentType::Codex => {
            // Use codex CLI
            ("codex", vec!["--prompt".to_string(), prompt.to_string()])
        }
        AgentType::Qwen => {
            // Use qwen CLI
            ("qwen", vec!["--prompt".to_string(), prompt.to_string()])
        }
        AgentType::Droid => {
            // Use droid CLI
            ("droid", vec!["chat".to_string(), "--prompt".to_string(), prompt.to_string()])
        }
    };

    let mut cmd = Command::new(program);
    cmd.args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(dir) = working_dir {
        cmd.current_dir(dir);
    }

    // Spawn the process instead of waiting for full output
    let mut child = cmd.spawn()
        .map_err(|e| format!("Failed to spawn {}: {}", program, e))?;

    // Take ownership of stdout for streaming
    let stdout = child.stdout.take()
        .ok_or_else(|| "Failed to capture stdout".to_string())?;

    // Create async buffered reader for line-by-line streaming
    let mut reader = BufReader::new(stdout).lines();
    let mut accumulated = String::new();

    // Stream lines with overall timeout
    let stream_result = timeout(Duration::from_secs(AGENT_TIMEOUT_SECS), async {
        while let Some(line) = reader.next_line().await.map_err(|e| format!("Read error: {}", e))? {
            // Add line to accumulated response
            if !accumulated.is_empty() {
                accumulated.push('\n');
            }
            accumulated.push_str(&line);

            // Emit streaming chunk event to frontend
            let _ = emit_prd_chat_chunk(
                app_handle,
                PrdChatChunkPayload {
                    session_id: session_id.to_string(),
                    content: line,
                },
            );
        }
        Ok::<(), String>(())
    }).await;

    // Handle streaming timeout
    if let Err(_) = stream_result {
        // Try to kill the hung process
        let _ = child.kill().await;
        return Err(format!(
            "Agent timed out after {} seconds. The process may have hung or be unresponsive.",
            AGENT_TIMEOUT_SECS
        ));
    }

    // Check for streaming errors
    stream_result.unwrap()?;

    // Wait for process to complete and check exit status
    let status = child.wait().await
        .map_err(|e| format!("Failed to wait for process: {}", e))?;

    if !status.success() {
        // Check for common interrupt signals
        if let Some(code) = status.code() {
            if code == 130 || code == 137 || code == 143 {
                return Err("Agent process was interrupted (SIGINT/SIGTERM)".to_string());
            }
        }
        // If we got some output before failure, return it with a warning
        if !accumulated.is_empty() {
            return Ok(accumulated.trim().to_string());
        }
        return Err(format!("Agent returned error (exit code: {:?})", status.code()));
    }

    // Clean up response (remove any trailing whitespace)
    Ok(accumulated.trim().to_string())
}

fn convert_chat_to_prd_content(messages: &[ChatMessage]) -> String {
    // Extract key information from conversation to build PRD structure
    let mut sections = vec![];

    // Overview section from conversation
    let overview = extract_overview_from_messages(messages);
    sections.push(serde_json::json!({
        "id": "overview",
        "title": "Overview",
        "content": overview,
        "required": true
    }));

    // Requirements section
    let requirements = extract_requirements_from_messages(messages);
    sections.push(serde_json::json!({
        "id": "requirements",
        "title": "Requirements",
        "content": requirements,
        "required": true
    }));

    // Tasks section
    let tasks = extract_tasks_from_messages(messages);
    sections.push(serde_json::json!({
        "id": "tasks",
        "title": "Tasks",
        "content": tasks,
        "required": true
    }));

    // Full conversation for reference
    let conversation = messages
        .iter()
        .map(|m| {
            let role_label = match m.role {
                MessageRole::User => "User",
                MessageRole::Assistant => "Assistant",
                MessageRole::System => "System",
            };
            format!("**{}**: {}", role_label, m.content)
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    sections.push(serde_json::json!({
        "id": "conversation",
        "title": "Original Conversation",
        "content": conversation,
        "required": false
    }));

    serde_json::json!({ "sections": sections }).to_string()
}

/// Convert extracted structure to PRD content (used when structured mode enabled)
fn convert_structure_to_prd_content(structure: &ExtractedPRDStructure, messages: &[ChatMessage]) -> String {
    let mut sections = vec![];

    // Overview from first assistant messages
    let overview = extract_overview_from_messages(messages);
    sections.push(serde_json::json!({
        "id": "overview",
        "title": "Overview",
        "content": overview,
        "required": true
    }));

    // Epics section
    if !structure.epics.is_empty() {
        let epics_content = structure.epics.iter()
            .map(|epic| {
                let mut content = format!("## {} - {}\n\n{}", epic.id, epic.title, epic.description);
                if let Some(ref deps) = epic.dependencies {
                    if !deps.is_empty() {
                        content.push_str(&format!("\n\n**Dependencies:** {}", deps.join(", ")));
                    }
                }
                content
            })
            .collect::<Vec<_>>()
            .join("\n\n---\n\n");

        sections.push(serde_json::json!({
            "id": "epics",
            "title": "Epics",
            "content": epics_content,
            "required": true
        }));
    }

    // User Stories section
    if !structure.user_stories.is_empty() {
        let stories_content = structure.user_stories.iter()
            .map(|story| {
                let mut content = format!("### {} - {}\n\n{}", story.id, story.title, story.description);

                if let Some(ref parent) = story.parent_id {
                    content.push_str(&format!("\n\n**Epic:** {}", parent));
                }

                if let Some(priority) = story.priority {
                    content.push_str(&format!("\n**Priority:** P{}", priority));
                }

                if let Some(ref effort) = story.estimated_effort {
                    content.push_str(&format!("\n**Estimated Effort:** {:?}", effort));
                }

                if let Some(ref criteria) = story.acceptance_criteria {
                    if !criteria.is_empty() {
                        content.push_str("\n\n**Acceptance Criteria:**\n");
                        for (i, ac) in criteria.iter().enumerate() {
                            content.push_str(&format!("{}. {}\n", i + 1, ac));
                        }
                    }
                }

                content
            })
            .collect::<Vec<_>>()
            .join("\n\n---\n\n");

        sections.push(serde_json::json!({
            "id": "user_stories",
            "title": "User Stories",
            "content": stories_content,
            "required": true
        }));
    }

    // Tasks section
    if !structure.tasks.is_empty() {
        let tasks_content = structure.tasks.iter()
            .map(|task| {
                let mut content = format!("- **{}**: {}", task.id, task.title);

                if !task.description.is_empty() {
                    content.push_str(&format!("\n  {}", task.description));
                }

                if let Some(ref parent) = task.parent_id {
                    content.push_str(&format!("\n  *User Story: {}*", parent));
                }

                if let Some(ref effort) = task.estimated_effort {
                    content.push_str(&format!(" [{:?}]", effort));
                }

                content
            })
            .collect::<Vec<_>>()
            .join("\n");

        sections.push(serde_json::json!({
            "id": "tasks",
            "title": "Tasks",
            "content": tasks_content,
            "required": true
        }));
    }

    // Summary statistics
    let summary = format!(
        "**PRD Summary:**\n- {} Epics\n- {} User Stories\n- {} Tasks\n- {} Acceptance Criteria",
        structure.epics.len(),
        structure.user_stories.len(),
        structure.tasks.len(),
        structure.acceptance_criteria.len()
    );
    sections.push(serde_json::json!({
        "id": "summary",
        "title": "Summary",
        "content": summary,
        "required": false
    }));

    // Full conversation for reference
    let conversation = messages
        .iter()
        .map(|m| {
            let role_label = match m.role {
                MessageRole::User => "User",
                MessageRole::Assistant => "Assistant",
                MessageRole::System => "System",
            };
            format!("**{}**: {}", role_label, m.content)
        })
        .collect::<Vec<_>>()
        .join("\n\n");

    sections.push(serde_json::json!({
        "id": "conversation",
        "title": "Original Conversation",
        "content": conversation,
        "required": false
    }));

    serde_json::json!({ "sections": sections }).to_string()
}

fn extract_overview_from_messages(messages: &[ChatMessage]) -> String {
    // Get the first few exchanges to establish context
    let early_messages: Vec<_> = messages.iter().take(4).collect();

    if early_messages.is_empty() {
        return String::new();
    }

    // Combine early messages for overview
    early_messages
        .iter()
        .filter(|m| m.role == MessageRole::Assistant)
        .map(|m| m.content.clone())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn extract_requirements_from_messages(messages: &[ChatMessage]) -> String {
    // Look for messages that contain requirement-like content
    let requirement_keywords = ["must", "should", "need", "require", "feature", "functionality"];

    let mut requirements: Vec<String> = Vec::new();

    for message in messages.iter() {
        let content_lower = message.content.to_lowercase();
        if !requirement_keywords.iter().any(|kw| content_lower.contains(kw)) {
            continue;
        }

        // Extract full content, preserving bullet points and structure
        for line in message.content.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Check if this line contains a requirement keyword
            let line_lower = trimmed.to_lowercase();
            if requirement_keywords.iter().any(|kw| line_lower.contains(kw)) {
                // Clean up bullet points for consistent formatting
                let cleaned = trimmed
                    .trim_start_matches(|c: char| c == '-' || c == '*' || c == '•' || c.is_ascii_digit() || c == '.' || c == ')')
                    .trim();
                if !cleaned.is_empty() {
                    requirements.push(format!("- {}", cleaned));
                }
            }
        }
    }

    requirements.dedup();
    requirements.truncate(20);
    requirements.join("\n")
}

fn extract_tasks_from_messages(messages: &[ChatMessage]) -> String {
    // Look for task-like content in assistant messages
    let task_indicators = ["implement", "create", "build", "add", "update", "fix", "refactor", "design", "set up", "configure", "develop", "write"];

    let mut tasks: Vec<String> = Vec::new();

    for message in messages.iter().filter(|m| m.role == MessageRole::Assistant) {
        let content_lower = message.content.to_lowercase();

        // Check if this message contains task-like content
        if !task_indicators.iter().any(|ind| content_lower.contains(ind)) {
            continue;
        }

        // Track initial task count to know if we found structured tasks in this message
        let initial_task_count = tasks.len();

        // Try to extract structured tasks from the message
        let lines: Vec<&str> = message.content.lines().collect();

        let mut current_task_title: Option<String> = None;
        let mut current_task_content = String::new();

        for line in &lines {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Check if this is a new numbered task (e.g., "1.", "2.", "1)", "2)")
            let is_numbered = trimmed.chars().next().map(|c| c.is_ascii_digit()).unwrap_or(false)
                && (trimmed.contains('.') || trimmed.contains(')'));

            // Check if this is a bullet point
            let is_bullet = trimmed.starts_with('-') || trimmed.starts_with('*') || trimmed.starts_with('•');

            // Check if this looks like a task (contains task indicator)
            let has_indicator = task_indicators.iter().any(|ind| trimmed.to_lowercase().contains(ind));

            if (is_numbered || is_bullet) && has_indicator {
                // Save previous task if exists
                if let Some(title) = current_task_title.take() {
                    let full_task = if current_task_content.trim().is_empty() {
                        title
                    } else {
                        format!("{}\n{}", title, current_task_content.trim())
                    };
                    if !full_task.trim().is_empty() {
                        tasks.push(full_task);
                    }
                    current_task_content.clear();
                }

                // Start new task - strip the number/bullet prefix
                let task_title = trimmed
                    .trim_start_matches(|c: char| c.is_ascii_digit() || c == '.' || c == ')' || c == '-' || c == '*' || c == '•' || c.is_whitespace())
                    .trim()
                    .to_string();

                if !task_title.is_empty() {
                    current_task_title = Some(task_title);
                }
            } else if current_task_title.is_some() {
                // Continuation of current task - add as description (sub-bullets, details)
                if !current_task_content.is_empty() {
                    current_task_content.push('\n');
                }
                current_task_content.push_str(trimmed);
            }
        }

        // Save last task from structured parsing
        if let Some(title) = current_task_title.take() {
            let full_task = if current_task_content.trim().is_empty() {
                title
            } else {
                format!("{}\n{}", title, current_task_content.trim())
            };
            if !full_task.trim().is_empty() {
                tasks.push(full_task);
            }
        }

        // If no structured tasks found in THIS message, use the entire message content
        if tasks.len() == initial_task_count && !message.content.trim().is_empty() {
            // Take meaningful content, preserving structure
            let content = message.content.trim();
            if content.len() > 1000 {
                // Truncate long messages but keep structure
                tasks.push(format!("{}...", &content[..1000]));
            } else {
                tasks.push(content.to_string());
            }
        }
    }

    // Deduplicate and limit
    tasks.dedup();
    tasks.truncate(15);

    tasks
        .into_iter()
        .enumerate()
        .map(|(i, task)| format!("{}. {}", i + 1, task))
        .collect::<Vec<_>>()
        .join("\n\n")
}

// ============================================================================
// Database Helper Functions (for specific update operations)
// ============================================================================

use rusqlite::{params, Connection, Result};

fn update_chat_session_timestamp(conn: &Connection, id: &str, timestamp: &str) -> Result<()> {
    conn.execute(
        "UPDATE chat_sessions SET updated_at = ?1 WHERE id = ?2",
        params![timestamp, id],
    )?;
    Ok(())
}

fn update_chat_session_quality_score(conn: &Connection, id: &str, score: i32) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE chat_sessions SET quality_score = ?1, updated_at = ?2 WHERE id = ?3",
        params![score, now, id],
    )?;
    Ok(())
}

fn update_chat_session_title(conn: &Connection, id: &str, title: &str) -> Result<()> {
    let now = chrono::Utc::now().to_rfc3339();
    conn.execute(
        "UPDATE chat_sessions SET title = ?1, updated_at = ?2 WHERE id = ?3",
        params![title, now, id],
    )?;
    Ok(())
}

/// Generate a session title from the first user message and PRD type
fn generate_session_title(first_message: &str, prd_type: Option<&str>) -> String {
    // Extract a meaningful title from the first message
    let message_title = first_message
        .lines()
        .next()
        .unwrap_or(first_message)
        .trim();

    // Truncate to 50 characters and add ellipsis if needed
    let truncated = if message_title.len() > 50 {
        format!("{}...", &message_title[..47])
    } else {
        message_title.to_string()
    };

    // If too short, use PRD type as fallback
    if truncated.len() < 5 {
        match prd_type {
            Some("new_feature") => "New Feature PRD".to_string(),
            Some("bug_fix") => "Bug Fix PRD".to_string(),
            Some("refactoring") => "Refactoring PRD".to_string(),
            Some("api_integration") => "API Integration PRD".to_string(),
            _ => "PRD Chat".to_string(),
        }
    } else {
        truncated
    }
}

// ============================================================================
// Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;

    fn create_test_db() -> Database {
        let db = Database::new(":memory:").unwrap();
        db.init().unwrap();
        // Chat tables are created in migration v4 by db.init()
        db
    }

    // Helper to create a test session with default new fields
    fn make_test_session(id: &str) -> ChatSession {
        ChatSession {
            id: id.to_string(),
            agent_type: "claude".to_string(),
            project_path: None,
            prd_id: None,
            title: None,
            prd_type: None,
            guided_mode: true,
            quality_score: None,
            template_id: None,
            structured_mode: false,
            extracted_structure: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        }
    }

    // -------------------------------------------------------------------------
    // Database Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_create_chat_session() {
        let db = create_test_db();

        let mut session = make_test_session("test-session-1");
        session.project_path = Some("/test/project".to_string());
        session.title = Some("Test Session".to_string());

        let result = db.create_chat_session(&session);
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_chat_session_by_id() {
        let db = create_test_db();

        let mut session = make_test_session("test-session-2");
        session.agent_type = "opencode".to_string();
        session.project_path = Some("/test/path".to_string());
        session.prd_type = Some("new_feature".to_string());
        session.quality_score = Some(75);

        db.create_chat_session(&session).unwrap();
        let retrieved = db.get_chat_session("test-session-2").unwrap();

        assert_eq!(retrieved.id, "test-session-2");
        assert_eq!(retrieved.agent_type, "opencode");
        assert_eq!(retrieved.project_path, Some("/test/path".to_string()));
        assert_eq!(retrieved.prd_id, None);
        assert_eq!(retrieved.prd_type, Some("new_feature".to_string()));
        assert!(retrieved.guided_mode);
        assert_eq!(retrieved.quality_score, Some(75));
    }

    #[test]
    fn test_list_chat_sessions() {
        let db = create_test_db();

        let mut session1 = make_test_session("session-1");
        session1.updated_at = "2026-01-17T01:00:00Z".to_string();

        let mut session2 = make_test_session("session-2");
        session2.agent_type = "cursor".to_string();
        session2.updated_at = "2026-01-17T02:00:00Z".to_string();

        db.create_chat_session(&session1).unwrap();
        db.create_chat_session(&session2).unwrap();

        let sessions = db.list_chat_sessions().unwrap();

        assert_eq!(sessions.len(), 2);
        // Should be ordered by updated_at DESC
        assert_eq!(sessions[0].id, "session-2");
        assert_eq!(sessions[1].id, "session-1");
    }

    #[test]
    fn test_delete_chat_session() {
        let db = create_test_db();

        let session = make_test_session("delete-test");

        db.create_chat_session(&session).unwrap();
        db.delete_chat_session("delete-test").unwrap();

        let result = db.get_chat_session("delete-test");
        assert!(result.is_err());
    }

    #[test]
    fn test_update_chat_session_timestamp() {
        let db = create_test_db();

        let session = make_test_session("timestamp-test");

        db.create_chat_session(&session).unwrap();
        update_chat_session_timestamp(db.get_connection(), "timestamp-test", "2026-01-17T12:00:00Z").unwrap();

        let retrieved = db.get_chat_session("timestamp-test").unwrap();
        assert_eq!(retrieved.updated_at, "2026-01-17T12:00:00Z");
    }

    #[test]
    fn test_update_chat_session_quality_score() {
        let db = create_test_db();

        let session = make_test_session("quality-test");

        db.create_chat_session(&session).unwrap();
        update_chat_session_quality_score(db.get_connection(), "quality-test", 85).unwrap();

        let retrieved = db.get_chat_session("quality-test").unwrap();
        assert_eq!(retrieved.quality_score, Some(85));
    }

    #[test]
    fn test_create_chat_message() {
        let db = create_test_db();

        // Create session first
        let session = make_test_session("msg-session");
        db.create_chat_session(&session).unwrap();

        let message = ChatMessage {
            id: "msg-1".to_string(),
            session_id: "msg-session".to_string(),
            role: MessageRole::User,
            content: "Help me create a PRD".to_string(),
            created_at: "2026-01-17T00:01:00Z".to_string(),
        };

        let result = db.create_chat_message(&message);
        assert!(result.is_ok());
    }

    #[test]
    fn test_get_messages_for_session() {
        let db = create_test_db();

        let session = make_test_session("history-session");
        db.create_chat_session(&session).unwrap();

        let msg1 = ChatMessage {
            id: "msg-1".to_string(),
            session_id: "history-session".to_string(),
            role: MessageRole::User,
            content: "Hello".to_string(),
            created_at: "2026-01-17T00:01:00Z".to_string(),
        };

        let msg2 = ChatMessage {
            id: "msg-2".to_string(),
            session_id: "history-session".to_string(),
            role: MessageRole::Assistant,
            content: "Hi! How can I help?".to_string(),
            created_at: "2026-01-17T00:02:00Z".to_string(),
        };

        let msg3 = ChatMessage {
            id: "msg-3".to_string(),
            session_id: "history-session".to_string(),
            role: MessageRole::User,
            content: "I need a PRD".to_string(),
            created_at: "2026-01-17T00:03:00Z".to_string(),
        };

        db.create_chat_message(&msg1).unwrap();
        db.create_chat_message(&msg2).unwrap();
        db.create_chat_message(&msg3).unwrap();

        let messages = db.get_messages_by_session("history-session").unwrap();

        assert_eq!(messages.len(), 3);
        // Should be ordered by created_at ASC
        assert_eq!(messages[0].id, "msg-1");
        assert_eq!(messages[0].role, MessageRole::User);
        assert_eq!(messages[1].id, "msg-2");
        assert_eq!(messages[1].role, MessageRole::Assistant);
        assert_eq!(messages[2].id, "msg-3");
    }

    #[test]
    fn test_delete_messages_for_session() {
        let db = create_test_db();

        let session = make_test_session("delete-msgs-session");
        db.create_chat_session(&session).unwrap();

        let msg = ChatMessage {
            id: "to-delete".to_string(),
            session_id: "delete-msgs-session".to_string(),
            role: MessageRole::User,
            content: "Delete me".to_string(),
            created_at: "2026-01-17T00:01:00Z".to_string(),
        };
        db.create_chat_message(&msg).unwrap();

        db.delete_messages_by_session("delete-msgs-session").unwrap();

        let messages = db.get_messages_by_session("delete-msgs-session").unwrap();
        assert_eq!(messages.len(), 0);
    }

    // -------------------------------------------------------------------------
    // Helper Function Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_parse_agent_type_claude() {
        let result = parse_agent_type("claude");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), AgentType::Claude);
    }

    #[test]
    fn test_parse_agent_type_opencode() {
        let result = parse_agent_type("opencode");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), AgentType::Opencode);
    }

    #[test]
    fn test_parse_agent_type_cursor() {
        let result = parse_agent_type("cursor");
        assert!(result.is_ok());
        assert_eq!(result.unwrap(), AgentType::Cursor);
    }

    #[test]
    fn test_parse_agent_type_case_insensitive() {
        assert!(parse_agent_type("CLAUDE").is_ok());
        assert!(parse_agent_type("Claude").is_ok());
        assert!(parse_agent_type("OPENCODE").is_ok());
    }

    #[test]
    fn test_parse_agent_type_invalid() {
        let result = parse_agent_type("invalid_agent");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Unknown agent type"));
    }

    #[test]
    fn test_build_prd_chat_prompt_empty_history() {
        let session = make_test_session("test");

        let history: Vec<ChatMessage> = vec![];
        let prompt = build_prd_chat_prompt(&session, &history, "Create a PRD for a todo app");

        assert!(prompt.contains("expert product manager"));
        assert!(prompt.contains("Create a PRD for a todo app"));
        assert!(!prompt.contains("Conversation History"));
    }

    #[test]
    fn test_build_prd_chat_prompt_with_history() {
        let mut session = make_test_session("test");
        session.project_path = Some("/my/project".to_string());

        let history = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "I want to build a todo app".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Great! Let me help you define the requirements.".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
        ];

        let prompt = build_prd_chat_prompt(&session, &history, "Add a due date feature");

        assert!(prompt.contains("Project path: /my/project"));
        assert!(prompt.contains("Conversation History"));
        assert!(prompt.contains("I want to build a todo app"));
        assert!(prompt.contains("Let me help you define"));
        assert!(prompt.contains("Add a due date feature"));
    }

    #[test]
    fn test_convert_chat_to_prd_content() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "I need a todo app that must support multiple lists".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "I'll help you create a todo app. We should implement task creation first.".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
        ];

        let content = convert_chat_to_prd_content(&messages);

        // Verify it's valid JSON
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        // Verify structure
        assert!(parsed.get("sections").is_some());
        let sections = parsed["sections"].as_array().unwrap();

        // Should have overview, requirements, tasks, and conversation sections
        assert!(sections.len() >= 4);

        let section_ids: Vec<_> = sections
            .iter()
            .filter_map(|s| s["id"].as_str())
            .collect();

        assert!(section_ids.contains(&"overview"));
        assert!(section_ids.contains(&"requirements"));
        assert!(section_ids.contains(&"tasks"));
        assert!(section_ids.contains(&"conversation"));
    }

    #[test]
    fn test_extract_overview_from_messages() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "User question".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "This is the overview content from assistant.".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
        ];

        let overview = extract_overview_from_messages(&messages);

        assert!(overview.contains("overview content from assistant"));
        assert!(!overview.contains("User question")); // Should only include assistant messages
    }

    #[test]
    fn test_extract_requirements_from_messages() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "The app must support offline mode".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Users should be able to sync when online".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
            ChatMessage {
                id: "3".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "Just a regular message".to_string(),
                created_at: "2026-01-17T00:02:00Z".to_string(),
            },
        ];

        let requirements = extract_requirements_from_messages(&messages);

        assert!(requirements.contains("must support offline"));
        assert!(requirements.contains("should be able to sync"));
        // Regular message without keywords should not be included
    }

    #[test]
    fn test_extract_tasks_from_messages() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "We should implement the login flow first".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Then we need to create the database schema".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
            ChatMessage {
                id: "3".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "User message should not be a task".to_string(),
                created_at: "2026-01-17T00:02:00Z".to_string(),
            },
        ];

        let tasks = extract_tasks_from_messages(&messages);

        assert!(tasks.contains("1."));
        assert!(tasks.contains("2."));
        assert!(tasks.contains("implement"));
        assert!(tasks.contains("create"));
        assert!(!tasks.contains("User message")); // User messages should not be tasks
    }

    // -------------------------------------------------------------------------
    // Integration Tests (without actual CLI execution)
    // -------------------------------------------------------------------------

    #[test]
    fn test_full_session_workflow() {
        let db = create_test_db();
        let conn = db.get_connection();

        // 1. Create session
        let session = ChatSession {
            id: "workflow-session".to_string(),
            agent_type: "claude".to_string(),
            project_path: Some("/project".to_string()),
            prd_id: None,
            title: None,
            prd_type: None,
            guided_mode: true,
            quality_score: None,
            template_id: None,
            structured_mode: false,
            extracted_structure: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            message_count: None,
        };
        db.create_chat_session(&session).unwrap();

        // 2. Add messages
        let user_msg = ChatMessage {
            id: "u1".to_string(),
            session_id: "workflow-session".to_string(),
            role: MessageRole::User,
            content: "Create a PRD for a task manager".to_string(),
            created_at: "2026-01-17T00:01:00Z".to_string(),
        };
        db.create_chat_message(&user_msg).unwrap();

        let assistant_msg = ChatMessage {
            id: "a1".to_string(),
            session_id: "workflow-session".to_string(),
            role: MessageRole::Assistant,
            content: "I'll help you create a comprehensive PRD for a task manager.".to_string(),
            created_at: "2026-01-17T00:02:00Z".to_string(),
        };
        db.create_chat_message(&assistant_msg).unwrap();

        // 3. Verify history
        let history = db.get_messages_by_session("workflow-session").unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].role, MessageRole::User);
        assert_eq!(history[1].role, MessageRole::Assistant);

        // 4. Update timestamp
        update_chat_session_timestamp(conn, "workflow-session", "2026-01-17T00:02:00Z").unwrap();

        // 5. Verify session list
        let sessions = db.list_chat_sessions().unwrap();
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].updated_at, "2026-01-17T00:02:00Z");

        // 6. Delete and verify
        db.delete_messages_by_session("workflow-session").unwrap();
        db.delete_chat_session("workflow-session").unwrap();

        let sessions = db.list_chat_sessions().unwrap();
        assert_eq!(sessions.len(), 0);
    }

    #[test]
    fn test_session_with_prd_reference() {
        let db = create_test_db();

        // Create a PRD first
        let prd = crate::database::prd::PRDDocument {
            id: "prd-ref".to_string(),
            title: "Linked PRD".to_string(),
            description: None,
            template_id: None,
            content: "{}".to_string(),
            quality_score_completeness: None,
            quality_score_clarity: None,
            quality_score_actionability: None,
            quality_score_overall: None,
            created_at: "2026-01-17T00:00:00Z".to_string(),
            updated_at: "2026-01-17T00:00:00Z".to_string(),
            version: 1,
            project_path: None,
            source_chat_session_id: None,
            prd_type: None,
            extracted_structure: None,
        };
        db.create_prd(&prd).unwrap();

        // Create session linked to PRD
        let mut session = make_test_session("linked-session");
        session.prd_id = Some("prd-ref".to_string());
        db.create_chat_session(&session).unwrap();

        let retrieved = db.get_chat_session("linked-session").unwrap();
        assert_eq!(retrieved.prd_id, Some("prd-ref".to_string()));
    }

    #[test]
    fn test_multiple_sessions_isolation() {
        let db = create_test_db();

        // Create two sessions
        let session1 = make_test_session("session-a");
        let mut session2 = make_test_session("session-b");
        session2.agent_type = "opencode".to_string();

        db.create_chat_session(&session1).unwrap();
        db.create_chat_session(&session2).unwrap();

        // Add messages to each session
        let msg_a = ChatMessage {
            id: "msg-a".to_string(),
            session_id: "session-a".to_string(),
            role: MessageRole::User,
            content: "Message for session A".to_string(),
            created_at: "2026-01-17T00:01:00Z".to_string(),
        };
        let msg_b = ChatMessage {
            id: "msg-b".to_string(),
            session_id: "session-b".to_string(),
            role: MessageRole::User,
            content: "Message for session B".to_string(),
            created_at: "2026-01-17T00:01:00Z".to_string(),
        };

        db.create_chat_message(&msg_a).unwrap();
        db.create_chat_message(&msg_b).unwrap();

        // Verify isolation
        let messages_a = db.get_messages_by_session("session-a").unwrap();
        let messages_b = db.get_messages_by_session("session-b").unwrap();

        assert_eq!(messages_a.len(), 1);
        assert_eq!(messages_b.len(), 1);
        assert_eq!(messages_a[0].content, "Message for session A");
        assert_eq!(messages_b[0].content, "Message for session B");
    }

    #[test]
    fn test_export_generates_valid_prd_structure() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "I need a user authentication feature".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Let's implement OAuth2 with Google and GitHub support".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
        ];

        let content = convert_chat_to_prd_content(&messages);

        // Verify valid JSON structure matching PRD format
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        // Check required sections exist
        let sections = parsed["sections"].as_array().unwrap();

        let has_overview = sections.iter().any(|s| s["id"] == "overview" && s["required"] == true);
        let has_requirements = sections.iter().any(|s| s["id"] == "requirements" && s["required"] == true);
        let has_tasks = sections.iter().any(|s| s["id"] == "tasks" && s["required"] == true);

        assert!(has_overview, "Missing required overview section");
        assert!(has_requirements, "Missing required requirements section");
        assert!(has_tasks, "Missing required tasks section");
    }

    // -------------------------------------------------------------------------
    // MessageRole Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_message_role_as_str() {
        assert_eq!(MessageRole::User.as_str(), "user");
        assert_eq!(MessageRole::Assistant.as_str(), "assistant");
        assert_eq!(MessageRole::System.as_str(), "system");
    }

    #[test]
    fn test_message_role_from_str() {
        assert_eq!("user".parse::<MessageRole>().unwrap(), MessageRole::User);
        assert_eq!("assistant".parse::<MessageRole>().unwrap(), MessageRole::Assistant);
        assert_eq!("system".parse::<MessageRole>().unwrap(), MessageRole::System);
    }

    #[test]
    fn test_message_role_from_str_case_insensitive() {
        assert_eq!("USER".parse::<MessageRole>().unwrap(), MessageRole::User);
        assert_eq!("Assistant".parse::<MessageRole>().unwrap(), MessageRole::Assistant);
        assert_eq!("SYSTEM".parse::<MessageRole>().unwrap(), MessageRole::System);
    }

    #[test]
    fn test_message_role_from_str_invalid() {
        let result = "invalid".parse::<MessageRole>();
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Invalid message role"));
    }

    #[test]
    fn test_message_role_display() {
        assert_eq!(format!("{}", MessageRole::User), "user");
        assert_eq!(format!("{}", MessageRole::Assistant), "assistant");
        assert_eq!(format!("{}", MessageRole::System), "system");
    }

    #[test]
    fn test_message_role_serde_serialize() {
        let user = MessageRole::User;
        let serialized = serde_json::to_string(&user).unwrap();
        assert_eq!(serialized, "\"user\"");

        let assistant = MessageRole::Assistant;
        let serialized = serde_json::to_string(&assistant).unwrap();
        assert_eq!(serialized, "\"assistant\"");

        let system = MessageRole::System;
        let serialized = serde_json::to_string(&system).unwrap();
        assert_eq!(serialized, "\"system\"");
    }

    #[test]
    fn test_message_role_serde_deserialize() {
        let user: MessageRole = serde_json::from_str("\"user\"").unwrap();
        assert_eq!(user, MessageRole::User);

        let assistant: MessageRole = serde_json::from_str("\"assistant\"").unwrap();
        assert_eq!(assistant, MessageRole::Assistant);

        let system: MessageRole = serde_json::from_str("\"system\"").unwrap();
        assert_eq!(system, MessageRole::System);
    }

    #[test]
    fn test_chat_message_serde_roundtrip() {
        let message = ChatMessage {
            id: "test-id".to_string(),
            session_id: "session-id".to_string(),
            role: MessageRole::Assistant,
            content: "Hello, world!".to_string(),
            created_at: "2026-01-17T00:00:00Z".to_string(),
        };

        let serialized = serde_json::to_string(&message).unwrap();
        let deserialized: ChatMessage = serde_json::from_str(&serialized).unwrap();

        assert_eq!(deserialized.id, message.id);
        assert_eq!(deserialized.session_id, message.session_id);
        assert_eq!(deserialized.role, message.role);
        assert_eq!(deserialized.content, message.content);
        assert_eq!(deserialized.created_at, message.created_at);
    }

    // -------------------------------------------------------------------------
    // Quality Assessment Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_quality_assessment_empty_conversation() {
        let messages: Vec<ChatMessage> = vec![];
        let assessment = calculate_quality_assessment(&messages, None);

        assert_eq!(assessment.completeness, 0);
        assert!(assessment.missing_sections.len() > 0);
        assert!(!assessment.ready_for_export);
    }

    #[test]
    fn test_quality_assessment_basic_conversation() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "I want to build a todo app that must support multiple lists and must allow task prioritization".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "I'll help you create a comprehensive PRD for your todo app. Here's the overview: The todo application will support multiple task lists with prioritization features.".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
        ];

        let assessment = calculate_quality_assessment(&messages, Some("new_feature"));

        // Should have some completeness score
        assert!(assessment.completeness > 0);
        // Should have suggestions
        assert!(assessment.suggestions.len() > 0);
    }

    #[test]
    fn test_quality_assessment_complete_conversation() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "I want to build a todo app. As a user, I want to create tasks so that I can track my work.".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "The app must support task creation. The system shall allow task prioritization. We should implement a clean UI.".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
            ChatMessage {
                id: "3".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "The acceptance criteria: verify that tasks can be created, ensure tasks appear in list".to_string(),
                created_at: "2026-01-17T00:02:00Z".to_string(),
            },
            ChatMessage {
                id: "4".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Tasks to implement: 1. Create task model 2. Build task list component 3. Add task creation form. Success metric: increase task completion by 20%".to_string(),
                created_at: "2026-01-17T00:03:00Z".to_string(),
            },
        ];

        let assessment = calculate_quality_assessment(&messages, Some("new_feature"));

        // Should have higher completeness with more content
        assert!(assessment.completeness > 30);
        assert!(assessment.overall > 20);
    }

    // -------------------------------------------------------------------------
    // Guided Questions Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_guided_questions_new_feature() {
        let questions = generate_guided_questions(PRDType::NewFeature);

        // Should have common questions plus feature-specific ones
        assert!(questions.len() >= 4);

        // Should have problem statement
        assert!(questions.iter().any(|q| q.id == "problem_statement"));

        // Should have user story question for new features
        assert!(questions.iter().any(|q| q.id == "user_story"));

        // All questions should have required field set
        assert!(questions.iter().all(|q| q.question.len() > 0));
    }

    #[test]
    fn test_guided_questions_bug_fix() {
        let questions = generate_guided_questions(PRDType::BugFix);

        // Bug fix should have reproduction steps
        assert!(questions.iter().any(|q| q.id == "repro_steps"));

        // Should have expected vs actual behavior
        assert!(questions.iter().any(|q| q.id == "expected_behavior"));
        assert!(questions.iter().any(|q| q.id == "actual_behavior"));

        // Should have severity
        assert!(questions.iter().any(|q| q.id == "severity"));
    }

    #[test]
    fn test_guided_questions_api_integration() {
        let questions = generate_guided_questions(PRDType::ApiIntegration);

        // API integration should ask about the API
        assert!(questions.iter().any(|q| q.id == "api_provider"));

        // Should ask about auth method
        assert!(questions.iter().any(|q| q.id == "auth_method"));

        // Auth method should have multiple choice options
        let auth_q = questions.iter().find(|q| q.id == "auth_method").unwrap();
        assert!(auth_q.options.is_some());
        assert!(auth_q.options.as_ref().unwrap().len() >= 4);
    }

    // -------------------------------------------------------------------------
    // Advanced Extraction Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_extract_user_stories() {
        let content = "As a developer, I want to deploy my code quickly so that I can iterate faster. As an admin, I want to manage users.";
        let stories = extract_user_stories(content);

        assert!(stories.len() >= 2);
        assert!(stories.iter().any(|s| s.contains("developer")));
        assert!(stories.iter().any(|s| s.contains("admin")));
    }

    #[test]
    fn test_extract_functional_requirements() {
        let content = "The system must validate user input.\nUsers should be able to export data.\nThe app needs to support offline mode.";
        let reqs = extract_functional_requirements(content);

        assert!(reqs.len() >= 2);
    }

    #[test]
    fn test_extract_tasks_advanced() {
        let content = "1. Implement user authentication\n2. Create database schema\n3. Build the API endpoints\n4. Add unit tests";
        let tasks = extract_tasks_advanced(content);

        assert!(tasks.len() >= 3);
    }

    #[test]
    fn test_extract_acceptance_criteria() {
        let content = "Acceptance criteria:\n- Users can log in\n- Tasks are saved\nVerify that the system handles errors gracefully.";
        let criteria = extract_acceptance_criteria(content);

        assert!(criteria.len() >= 1);
    }

    #[test]
    fn test_extract_prd_content_advanced() {
        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "I need a user authentication system. As a user, I want to log in so that I can access my data.".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Summary: You want to build a secure authentication system.\n\nThe system must support OAuth2. Users should be able to reset passwords.\n\nTasks:\n1. Implement login endpoint\n2. Create session management\n3. Add password reset flow".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
            },
        ];

        let extracted = extract_prd_content_advanced(&messages);

        // Should extract overview
        assert!(!extracted.overview.is_empty());

        // Should extract user stories
        assert!(!extracted.user_stories.is_empty());

        // Should extract requirements
        assert!(!extracted.functional_requirements.is_empty());

        // Should extract tasks
        assert!(!extracted.tasks.is_empty());
    }

    // -------------------------------------------------------------------------
    // PRD Type Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_prd_type_parsing() {
        assert_eq!("new_feature".parse::<PRDType>().unwrap(), PRDType::NewFeature);
        assert_eq!("bug_fix".parse::<PRDType>().unwrap(), PRDType::BugFix);
        assert_eq!("refactoring".parse::<PRDType>().unwrap(), PRDType::Refactoring);
        assert_eq!("api_integration".parse::<PRDType>().unwrap(), PRDType::ApiIntegration);
        assert_eq!("general".parse::<PRDType>().unwrap(), PRDType::General);
    }

    #[test]
    fn test_prd_type_display() {
        assert_eq!(PRDType::NewFeature.as_str(), "new_feature");
        assert_eq!(PRDType::BugFix.display_name(), "Bug Fix");
    }

    #[test]
    fn test_prd_type_invalid() {
        let result = "invalid_type".parse::<PRDType>();
        assert!(result.is_err());
    }

    // -------------------------------------------------------------------------
    // Structured Mode Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_create_session_with_structured_mode() {
        let db = create_test_db();

        let mut session = make_test_session("structured-session");
        session.structured_mode = true;
        db.create_chat_session(&session).unwrap();

        let retrieved = db.get_chat_session("structured-session").unwrap();
        assert!(retrieved.structured_mode);
        assert!(retrieved.extracted_structure.is_none());
    }

    #[test]
    fn test_update_structured_mode() {
        let db = create_test_db();

        let session = make_test_session("mode-test");
        db.create_chat_session(&session).unwrap();

        // Initially false
        let retrieved = db.get_chat_session("mode-test").unwrap();
        assert!(!retrieved.structured_mode);

        // Update to true
        db.update_chat_session_structured_mode("mode-test", true).unwrap();
        let retrieved = db.get_chat_session("mode-test").unwrap();
        assert!(retrieved.structured_mode);

        // Update back to false
        db.update_chat_session_structured_mode("mode-test", false).unwrap();
        let retrieved = db.get_chat_session("mode-test").unwrap();
        assert!(!retrieved.structured_mode);
    }

    #[test]
    fn test_update_extracted_structure() {
        let db = create_test_db();

        let mut session = make_test_session("structure-test");
        session.structured_mode = true;
        db.create_chat_session(&session).unwrap();

        // Set extracted structure
        let structure_json = r#"{"epics":[{"type":"epic","id":"EP-1","title":"Auth","description":"Auth system"}],"userStories":[],"tasks":[],"acceptanceCriteria":[]}"#;
        db.update_chat_session_extracted_structure("structure-test", Some(structure_json)).unwrap();

        let retrieved = db.get_chat_session("structure-test").unwrap();
        assert!(retrieved.extracted_structure.is_some());
        assert!(retrieved.extracted_structure.as_ref().unwrap().contains("EP-1"));
    }

    #[test]
    fn test_clear_extracted_structure() {
        let db = create_test_db();

        let mut session = make_test_session("clear-structure");
        session.structured_mode = true;
        session.extracted_structure = Some(r#"{"epics":[],"userStories":[],"tasks":[],"acceptanceCriteria":[]}"#.to_string());
        db.create_chat_session(&session).unwrap();

        // Clear structure
        db.update_chat_session_extracted_structure("clear-structure", None).unwrap();

        let retrieved = db.get_chat_session("clear-structure").unwrap();
        assert!(retrieved.extracted_structure.is_none());
    }

    #[test]
    fn test_build_prd_chat_prompt_structured_mode() {
        let mut session = make_test_session("test");
        session.structured_mode = true;

        let history: Vec<ChatMessage> = vec![];
        let prompt = build_prd_chat_prompt(&session, &history, "Create epics for an auth system");

        // Should include structured output instructions
        assert!(prompt.contains("STRUCTURED OUTPUT MODE"));
        assert!(prompt.contains("JSON code block"));
        assert!(prompt.contains("\"type\": \"epic\""));
        assert!(prompt.contains("\"type\": \"user_story\""));
        assert!(prompt.contains("\"type\": \"task\""));
        assert!(prompt.contains("estimatedEffort"));
        assert!(prompt.contains("EP-1"));
        assert!(prompt.contains("US-1.1"));
    }

    #[test]
    fn test_build_prd_chat_prompt_without_structured_mode() {
        let session = make_test_session("test"); // structured_mode: false

        let history: Vec<ChatMessage> = vec![];
        let prompt = build_prd_chat_prompt(&session, &history, "Create a PRD");

        // Should NOT include structured output instructions
        assert!(!prompt.contains("STRUCTURED OUTPUT MODE"));
        assert!(!prompt.contains("JSON code block"));
    }

    #[test]
    fn test_convert_structure_to_prd_content() {
        let structure = ExtractedPRDStructure {
            epics: vec![
                crate::models::StructuredPRDItem {
                    item_type: crate::models::PRDItemType::Epic,
                    id: "EP-1".to_string(),
                    parent_id: None,
                    title: "User Auth".to_string(),
                    description: "Complete authentication system".to_string(),
                    acceptance_criteria: None,
                    priority: Some(1),
                    dependencies: None,
                    estimated_effort: Some(crate::models::EffortSize::Large),
                    tags: None,
                },
            ],
            user_stories: vec![
                crate::models::StructuredPRDItem {
                    item_type: crate::models::PRDItemType::UserStory,
                    id: "US-1.1".to_string(),
                    parent_id: Some("EP-1".to_string()),
                    title: "User Login".to_string(),
                    description: "As a user, I want to log in".to_string(),
                    acceptance_criteria: Some(vec!["Email validation".to_string(), "Password validation".to_string()]),
                    priority: Some(1),
                    dependencies: None,
                    estimated_effort: Some(crate::models::EffortSize::Medium),
                    tags: None,
                },
            ],
            tasks: vec![
                crate::models::StructuredPRDItem {
                    item_type: crate::models::PRDItemType::Task,
                    id: "T-1.1.1".to_string(),
                    parent_id: Some("US-1.1".to_string()),
                    title: "Create login form".to_string(),
                    description: "Build React login component".to_string(),
                    acceptance_criteria: None,
                    priority: None,
                    dependencies: None,
                    estimated_effort: Some(crate::models::EffortSize::Small),
                    tags: None,
                },
            ],
            acceptance_criteria: vec![],
        };

        let messages = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Let me help you create an authentication system.".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
            },
        ];

        let content = convert_structure_to_prd_content(&structure, &messages);

        // Verify it's valid JSON
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();
        assert!(parsed.get("sections").is_some());

        let sections = parsed["sections"].as_array().unwrap();

        // Find section IDs
        let section_ids: Vec<_> = sections
            .iter()
            .filter_map(|s| s["id"].as_str())
            .collect();

        // Should have epics, user_stories, tasks sections
        assert!(section_ids.contains(&"epics"));
        assert!(section_ids.contains(&"user_stories"));
        assert!(section_ids.contains(&"tasks"));

        // Verify content includes our items
        let epics_section = sections.iter().find(|s| s["id"] == "epics").unwrap();
        assert!(epics_section["content"].as_str().unwrap().contains("EP-1"));
        assert!(epics_section["content"].as_str().unwrap().contains("User Auth"));

        let stories_section = sections.iter().find(|s| s["id"] == "user_stories").unwrap();
        assert!(stories_section["content"].as_str().unwrap().contains("US-1.1"));
        assert!(stories_section["content"].as_str().unwrap().contains("Email validation"));

        let tasks_section = sections.iter().find(|s| s["id"] == "tasks").unwrap();
        assert!(tasks_section["content"].as_str().unwrap().contains("T-1.1.1"));
    }

    #[test]
    fn test_session_structured_mode_persists_across_operations() {
        let db = create_test_db();

        // Create session with structured mode
        let mut session = make_test_session("persist-test");
        session.structured_mode = true;
        db.create_chat_session(&session).unwrap();

        // Add some messages
        let msg = ChatMessage {
            id: "msg-1".to_string(),
            session_id: "persist-test".to_string(),
            role: MessageRole::User,
            content: "Test message".to_string(),
            created_at: "2026-01-17T00:01:00Z".to_string(),
        };
        db.create_chat_message(&msg).unwrap();

        // Update timestamp
        update_chat_session_timestamp(db.get_connection(), "persist-test", "2026-01-17T12:00:00Z").unwrap();

        // Update quality score
        update_chat_session_quality_score(db.get_connection(), "persist-test", 75).unwrap();

        // Verify structured_mode is still true
        let retrieved = db.get_chat_session("persist-test").unwrap();
        assert!(retrieved.structured_mode);
        assert_eq!(retrieved.quality_score, Some(75));
    }

    // -------------------------------------------------------------------------
    // has_numbered_task_list Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_has_numbered_task_list_with_task_verbs() {
        let content = r#"
Here are the implementation steps:
1. Implement the user authentication module
2. Create the database schema
3. Build the API endpoints
4. Test the integration
"#;
        assert!(has_numbered_task_list(content));
    }

    #[test]
    fn test_has_numbered_task_list_with_parentheses() {
        let content = r#"
Tasks:
1) Create the login form
2) Implement password validation
3) Add session management
"#;
        assert!(has_numbered_task_list(content));
    }

    #[test]
    fn test_has_numbered_task_list_insufficient_items() {
        // Only 2 items - should return false (need 3+)
        let content = r#"
1. Implement feature
2. Test feature
"#;
        assert!(!has_numbered_task_list(content));
    }

    #[test]
    fn test_has_numbered_task_list_no_task_verbs() {
        // Numbered list but no task verbs
        let content = r#"
1. First item here
2. Second item here
3. Third item here
"#;
        assert!(!has_numbered_task_list(content));
    }

    #[test]
    fn test_has_numbered_task_list_mixed_verbs() {
        let content = r#"
1. Design the architecture
2. Develop the backend services
3. Integrate with third-party APIs
4. Write unit tests
"#;
        assert!(has_numbered_task_list(content));
    }

    // -------------------------------------------------------------------------
    // calculate_quality_from_markdown Task Detection Tests
    // -------------------------------------------------------------------------

    #[test]
    fn test_quality_from_markdown_detects_implementation_tasks_header() {
        let content = r#"
# Feature PRD

## Overview
This is the overview.

## Implementation Tasks
1. First task
2. Second task
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment.missing_sections.contains(&"Implementation Tasks".to_string()),
            "Should detect '## Implementation Tasks' header"
        );
    }

    #[test]
    fn test_quality_from_markdown_detects_h1_tasks() {
        let content = r#"
# Tasks

1. Implement authentication
2. Build the dashboard
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment.missing_sections.contains(&"Implementation Tasks".to_string()),
            "Should detect '# Tasks' header"
        );
    }

    #[test]
    fn test_quality_from_markdown_detects_phase_sections() {
        let content = r#"
## Overview
Feature description here.

## Phase 1: Setup
Initial setup tasks.

## Phase 2: Implementation
Core implementation.
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment.missing_sections.contains(&"Implementation Tasks".to_string()),
            "Should detect '## Phase X' headers"
        );
    }

    #[test]
    fn test_quality_from_markdown_detects_checklist() {
        let content = r#"
## Overview
Description.

## Master Checklist
- [ ] Task 1
- [ ] Task 2
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment.missing_sections.contains(&"Implementation Tasks".to_string()),
            "Should detect '## Master Checklist' header"
        );
    }

    #[test]
    fn test_quality_from_markdown_detects_numbered_task_list_fallback() {
        // No explicit task header, but has numbered tasks with action verbs
        let content = r#"
## Overview
We need to build a new feature.

## Requirements
The system must do X.

Here's what we need to do:
1. Implement the data model
2. Create the API endpoints
3. Build the frontend components
4. Write integration tests
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment.missing_sections.contains(&"Implementation Tasks".to_string()),
            "Should detect numbered task list via fallback"
        );
    }

    #[test]
    fn test_quality_from_markdown_missing_tasks_when_none_present() {
        let content = r#"
## Overview
This is a feature description.

## Requirements
The system should work well.
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            assessment.missing_sections.contains(&"Implementation Tasks".to_string()),
            "Should report missing Implementation Tasks when none present"
        );
    }

    #[test]
    fn test_quality_from_markdown_detects_work_breakdown() {
        let content = r#"
## Overview
Feature overview.

## Work Breakdown
- Component A
- Component B
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment.missing_sections.contains(&"Implementation Tasks".to_string()),
            "Should detect '## Work Breakdown' header"
        );
    }

    #[test]
    fn test_quality_from_markdown_detects_todo_section() {
        let content = r#"
## Overview
Description.

## TODO
- Item 1
- Item 2
"#;
        let assessment = calculate_quality_from_markdown(content, None);
        assert!(
            !assessment.missing_sections.contains(&"Implementation Tasks".to_string()),
            "Should detect '## TODO' header"
        );
    }
}
