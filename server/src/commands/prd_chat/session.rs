// PRD Chat session operations - CRUD for chat sessions

use crate::file_storage::chat_ops;
use crate::models::{AgentType, ChatMessage, ChatSession, MessageRole, PRDType};
use crate::utils::as_path;
use uuid::Uuid;

use super::types::StartChatSessionRequest;
use super::{generate_welcome_message, get_prd_type_title, parse_agent_type};

// ============================================================================
// Session CRUD Commands
// ============================================================================

/// Start a new PRD chat session
pub async fn start_prd_chat_session(
    request: StartChatSessionRequest,
) -> Result<ChatSession, String> {
    // Validate agent type
    let _agent_type = parse_agent_type(&request.agent_type)?;

    // Require project_path for file-based storage
    let project_path = request
        .project_path
        .as_ref()
        .ok_or_else(|| "project_path is required for chat sessions".to_string())?;

    // Validate and parse PRD type if provided
    let prd_type_enum = if let Some(ref prd_type) = request.prd_type {
        Some(
            prd_type
                .parse::<PRDType>()
                .map_err(|e| format!("Invalid PRD type: {}", e))?,
        )
    } else {
        None
    };

    let now = chrono::Utc::now().to_rfc3339();
    let session_id = Uuid::new_v4().to_string();
    let guided_mode = request.guided_mode.unwrap_or(true);
    let structured_mode = request.structured_mode.unwrap_or(false);

    // Set title: use custom title if provided, otherwise default based on PRD type
    let default_title = if let Some(custom_title) = request.title {
        Some(custom_title)
    } else {
        prd_type_enum.as_ref().map(|pt| get_prd_type_title(pt))
    };

    let mut session = ChatSession {
        id: session_id.clone(),
        agent_type: request.agent_type,
        project_path: request.project_path.clone(),
        prd_id: None, // Will be set after computing/creating the PRD file
        title: default_title.clone(),
        prd_type: request.prd_type,
        guided_mode,
        quality_score: None,
        template_id: request.template_id,
        structured_mode,
        extracted_structure: None,
        created_at: now.clone(),
        updated_at: now.clone(),
        message_count: Some(0),
        pending_operation_started_at: None,
        external_session_id: None,
    };

    // Initialize .ralph-ui directory and save session to file
    let project_path_obj = as_path(project_path);
    crate::file_storage::init_ralph_ui_dir(project_path_obj)
        .map_err(|e| format!("Failed to initialize .ralph-ui directory: {}", e))?;

    // Generate PRD filename and create empty file upfront (if not already specified)
    // This ensures the UI knows the exact filename from the start
    let prd_id = if request.prd_id.is_some() {
        request.prd_id.clone()
    } else {
        // Compute filename from title or default "prd"
        let title_for_filename = default_title.as_deref().unwrap_or("prd");
        let prd_filename = crate::ralph_loop::make_prd_filename(title_for_filename, &session_id);

        // Create empty PRD file so the chat knows filename upfront
        let prds_dir = project_path_obj.join(".ralph-ui").join("prds");
        std::fs::create_dir_all(&prds_dir)
            .map_err(|e| format!("Failed to create prds directory: {}", e))?;

        let prd_path = prds_dir.join(format!("{}.md", prd_filename));

        if !prd_path.exists() {
            let initial_content = "# PRD\n\n<!-- This file will be populated by the AI agent -->\n";
            std::fs::write(&prd_path, initial_content)
                .map_err(|e| format!("Failed to create PRD file: {}", e))?;
        }

        Some(format!("file:{}", prd_filename))
    };

    // Update session with the computed prd_id
    session.prd_id = prd_id;

    chat_ops::create_chat_session(project_path_obj, &session)
        .map_err(|e| format!("Failed to create chat session: {}", e))?;

    // If guided mode is enabled, add an initial welcome message with the first question
    if guided_mode {
        let welcome_message = generate_welcome_message(prd_type_enum.as_ref());

        let assistant_message = ChatMessage {
            id: Uuid::new_v4().to_string(),
            session_id: session_id.clone(),
            role: MessageRole::Assistant,
            content: welcome_message,
            created_at: now,
            attachments: None,
        };

        chat_ops::create_chat_message(project_path_obj, &assistant_message)
            .map_err(|e| format!("Failed to create welcome message: {}", e))?;

        // Update message count
        session.message_count = Some(1);
    }

    Ok(session)
}

/// List all chat sessions for a project
pub async fn list_prd_chat_sessions(project_path: String) -> Result<Vec<ChatSession>, String> {
    let project_path_obj = as_path(&project_path);

    chat_ops::list_chat_sessions(project_path_obj)
        .map_err(|e| format!("Failed to list chat sessions: {}", e))
}

/// Delete a chat session and all its messages
pub async fn delete_prd_chat_session(
    session_id: String,
    project_path: String,
) -> Result<(), String> {
    let project_path_obj = as_path(&project_path);

    // Delete session (messages are embedded in the file)
    chat_ops::delete_chat_session(project_path_obj, &session_id)
        .map_err(|e| format!("Failed to delete session: {}", e))
}

/// Update agent type for a chat session
pub async fn update_prd_chat_agent(
    session_id: String,
    project_path: String,
    agent_type: String,
    provider_id: Option<String>,
) -> Result<(), String> {
    let project_path_obj = as_path(&project_path);

    // Build composite agent_type if provider is specified
    let composite_agent_type = if agent_type == "claude" {
        if let Some(provider) = &provider_id {
            if provider != "anthropic" {
                log::info!(
                    "🔄 Updating session {} to use Claude with provider: {}",
                    session_id,
                    provider
                );
                format!("{}:{}", agent_type, provider)
            } else {
                log::info!(
                    "✓ Updating session {} to use Claude (Anthropic)",
                    session_id
                );
                agent_type
            }
        } else {
            log::info!("✓ Updating session {} to use Claude (default)", session_id);
            agent_type
        }
    } else {
        log::info!(
            "✓ Updating session {} to use agent: {}",
            session_id,
            agent_type
        );
        agent_type
    };

    chat_ops::update_chat_session_agent(project_path_obj, &session_id, &composite_agent_type)
        .map_err(|e| format!("Failed to update agent type: {}", e))?;

    log::info!(
        "✓ Session agent updated successfully: {} -> {}",
        session_id,
        composite_agent_type
    );

    Ok(())
}

/// Get the extracted PRD structure for a session
pub async fn get_extracted_structure(
    session_id: String,
    project_path: String,
) -> Result<crate::models::ExtractedPRDStructure, String> {
    let project_path_obj = as_path(&project_path);

    let session = chat_ops::get_chat_session(project_path_obj, &session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    // Parse the stored structure or return empty
    let structure: crate::models::ExtractedPRDStructure = session
        .extracted_structure
        .as_ref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    Ok(structure)
}

/// Set structured output mode for a session
pub async fn set_structured_mode(
    session_id: String,
    project_path: String,
    enabled: bool,
) -> Result<(), String> {
    let project_path_obj = as_path(&project_path);

    chat_ops::update_chat_session_structured_mode(project_path_obj, &session_id, enabled)
        .map_err(|e| format!("Failed to update structured mode: {}", e))?;

    Ok(())
}

/// Clear extracted structure for a session
pub async fn clear_extracted_structure(
    session_id: String,
    project_path: String,
) -> Result<(), String> {
    let project_path_obj = as_path(&project_path);

    chat_ops::update_chat_session_extracted_structure(project_path_obj, &session_id, None)
        .map_err(|e| format!("Failed to clear structure: {}", e))?;

    Ok(())
}

/// Check if an agent CLI is available in the system PATH
pub async fn check_agent_availability(
    agent_type: String,
) -> Result<super::AgentAvailabilityResult, String> {
    let agent_type = parse_agent_type(&agent_type)?;

    let program = match agent_type {
        AgentType::Claude => "claude",
        AgentType::Opencode => "opencode",
        AgentType::Cursor => "cursor-agent",
        AgentType::Codex => "codex",
        AgentType::Qwen => "qwen",
        AgentType::Droid => "droid",
        AgentType::Gemini => "gemini",
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

            Ok(super::AgentAvailabilityResult {
                available,
                agent: program.to_string(),
                path,
                error: if available {
                    None
                } else {
                    Some(format!(
                        "'{}' not found in PATH. Please install it or add it to your PATH.",
                        program
                    ))
                },
            })
        }
        Err(e) => Ok(super::AgentAvailabilityResult {
            available: false,
            agent: program.to_string(),
            path: None,
            error: Some(format!("Failed to check for '{}': {}", program, e)),
        }),
    }
}
