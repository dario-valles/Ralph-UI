// PRD Chat messaging operations - send messages, get history, build prompts

use crate::file_storage::{attachments, chat_ops};
use crate::gsd::planning_storage::{read_planning_file, PlanningFile};
use crate::gsd::state::{GsdPhase, GsdWorkflowState, QuestioningContext};
use crate::models::{ChatMessage, ChatSession, ExtractedPRDStructure, MessageRole};
use std::path::Path;
use crate::parsers::structured_output;
use crate::utils::as_path;
use uuid::Uuid;

use super::agent_executor::{self, generate_session_title};
use super::types::{SendMessageRequest, SendMessageResponse};
use super::parse_agent_type;

// ============================================================================
// Message Commands
// ============================================================================

/// Planning documents available for context injection.
/// These persist across session resumption when conversation history is omitted.
struct PlanningContext {
    summary: Option<String>,
    requirements: Option<String>,
    roadmap: Option<String>,
}

/// Load all available planning documents for a GSD session.
/// Returns documents that exist, with None for missing ones.
fn load_planning_context(project_path: &Path, session_id: &str) -> PlanningContext {
    PlanningContext {
        summary: read_planning_file(project_path, session_id, PlanningFile::Summary).ok(),
        requirements: read_planning_file(project_path, session_id, PlanningFile::RequirementsMd)
            .ok(),
        roadmap: read_planning_file(project_path, session_id, PlanningFile::Roadmap).ok(),
    }
}

/// Extracts all attachment file paths from chat history.
/// Used to include historical image attachments in the prompt even when
/// conversation history text is omitted during session resumption.
fn extract_historical_attachment_paths(
    project_path: &Path,
    history: &[ChatMessage],
) -> Vec<String> {
    history
        .iter()
        .filter_map(|msg| {
            msg.attachments.as_ref().map(|atts| {
                atts.iter()
                    .filter_map(|att| {
                        let path = attachments::get_attachment_file_path(
                            project_path,
                            &msg.id,
                            att,
                        );
                        path.to_str().map(String::from)
                    })
                    .collect::<Vec<_>>()
            })
        })
        .flatten()
        .collect()
}

/// Send a message to the chat and get an AI response
pub async fn send_prd_chat_message(
    app_handle: std::sync::Arc<crate::server::EventBroadcaster>,
    request: SendMessageRequest,
) -> Result<SendMessageResponse, String> {
    // Validate request (including attachment constraints)
    request.validate()?;

    // Get project_path from request (required for file storage)
    let project_path_obj = as_path(&request.project_path);

    // First phase: read data and store user message
    let session = chat_ops::get_chat_session(project_path_obj, &request.session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();

    // Store user message with any attachments
    let user_message = ChatMessage {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id.clone(),
        role: MessageRole::User,
        content: request.content.clone(),
        created_at: now.clone(),
        attachments: request.attachments.clone(),
    };

    chat_ops::create_chat_message(project_path_obj, &user_message)
        .map_err(|e| format!("Failed to store user message: {}", e))?;

    // Save attachments to disk if present and get their file paths
    let attachment_paths: Vec<String> = if let Some(ref attachments_list) = request.attachments {
        if !attachments_list.is_empty() {
            let paths = attachments::save_message_attachments(
                project_path_obj,
                &user_message.id,
                attachments_list,
            )
            .map_err(|e| format!("Failed to save attachments: {}", e))?;

            paths
                .into_iter()
                .filter_map(|p| p.to_str().map(String::from))
                .collect()
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    // Get chat history for context
    let history = chat_ops::get_messages_by_session(project_path_obj, &request.session_id)
        .map_err(|e| format!("Failed to get chat history: {}", e))?;

    // Check if we have an existing external session for resume support
    let has_external_session = session.external_session_id.is_some();

    // Extract attachment paths from historical messages.
    // This ensures the agent can see images from previous messages even when
    // conversation history text is omitted during session resumption.
    let historical_attachment_paths = extract_historical_attachment_paths(project_path_obj, &history);

    // Combine current message attachments with historical attachments
    let all_attachment_paths: Vec<String> = attachment_paths
        .into_iter()
        .chain(historical_attachment_paths)
        .collect();

    // Load planning documents for GSD sessions.
    // These persist across session resumption when conversation history is omitted,
    // ensuring the agent always has access to research, requirements, and roadmap.
    let planning_context = if get_gsd_phase(&session).is_some() {
        Some(load_planning_context(project_path_obj, &session.id))
    } else {
        None
    };

    // Build prompt based on mode - use deep questioning prompt for GSD DeepQuestioning phase
    // When resuming an external session, history is omitted (agent maintains its own context)
    let prompt = match get_gsd_phase(&session) {
        Some(GsdPhase::DeepQuestioning) => build_deep_questioning_prompt(
            &session,
            &history,
            &request.content,
            &all_attachment_paths,
            has_external_session,
            planning_context.as_ref(),
        ),
        _ => build_prd_chat_prompt(
            &session,
            &history,
            &request.content,
            &all_attachment_paths,
            has_external_session,
            planning_context.as_ref(),
        ),
    };

    // Parse agent type
    let agent_type = parse_agent_type(&session.agent_type)?;

    // Set pending operation before agent execution (for page reload recovery)
    if let Err(e) = chat_ops::set_pending_operation(project_path_obj, &request.session_id) {
        log::warn!("Failed to set pending operation: {}", e);
    }

    // Execute CLI agent and get response with streaming using the unified executor
    // Pass external_session_id to enable session resumption (saves 67-90% tokens)
    let emitter = agent_executor::BroadcastEmitter::new(app_handle.clone());
    let agent_result = match agent_executor::execute_chat_agent(
        &emitter,
        &request.session_id,
        agent_type,
        &prompt,
        session.project_path.as_deref(),
        session.external_session_id.as_deref(),
    )
    .await
    {
        Ok(result) => result,
        Err(e) => {
            // Clear pending operation on error
            if let Err(clear_err) =
                chat_ops::clear_pending_operation(project_path_obj, &request.session_id)
            {
                log::warn!(
                    "Failed to clear pending operation after error: {}",
                    clear_err
                );
            }
            return Err(format!("Agent execution failed: {}", e));
        }
    };

    // Second phase: store response and parse structured output
    let response_now = chrono::Utc::now().to_rfc3339();
    let response_content = agent_result.content;

    // Store assistant message
    let assistant_message = ChatMessage {
        id: Uuid::new_v4().to_string(),
        session_id: request.session_id.clone(),
        role: MessageRole::Assistant,
        content: response_content.clone(),
        created_at: response_now.clone(),
        attachments: None,
    };

    chat_ops::create_chat_message(project_path_obj, &assistant_message)
        .map_err(|e| format!("Failed to store assistant message: {}", e))?;

    // Clear pending operation after successful execution
    if let Err(e) = chat_ops::clear_pending_operation(project_path_obj, &request.session_id) {
        log::warn!("Failed to clear pending operation: {}", e);
    }

    // If we captured a new external session ID, save it for future resume
    // This enables 67-90% token savings on subsequent messages
    if let Some(captured_id) = agent_result.captured_session_id {
        if let Err(e) = chat_ops::update_chat_session_external_id(
            project_path_obj,
            &request.session_id,
            Some(&captured_id),
        ) {
            log::warn!("Failed to save external session ID for resume: {}", e);
        } else {
            log::info!("Captured external session ID for resume: {}", captured_id);
        }
    }

    // Update session timestamp
    chat_ops::update_chat_session_timestamp(project_path_obj, &request.session_id, &response_now)
        .map_err(|e| format!("Failed to update session: {}", e))?;

    // Auto-generate title from first message if not set
    if session.title.is_none() {
        let title = generate_session_title(&request.content, session.prd_type.as_deref());
        chat_ops::update_chat_session_title(project_path_obj, &request.session_id, &title).ok();
        // Ignore title update errors
    }

    // If structured mode is enabled, parse JSON blocks from response
    if session.structured_mode {
        let new_items = structured_output::extract_items(&response_content);
        if !new_items.is_empty() {
            // Load existing structure or create new
            let mut structure: ExtractedPRDStructure = session
                .extracted_structure
                .as_ref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default();

            // Merge new items
            structured_output::merge_items(&mut structure, new_items);

            // Store updated structure
            let structure_json = serde_json::to_string(&structure)
                .map_err(|e| format!("Failed to serialize structure: {}", e))?;
            chat_ops::update_chat_session_extracted_structure(
                project_path_obj,
                &request.session_id,
                Some(&structure_json),
            )
            .map_err(|e| format!("Failed to update structure: {}", e))?;
        }
    }

    // Suppress unused variable warning
    let _ = history;

    Ok(SendMessageResponse {
        user_message,
        assistant_message,
    })
}

/// Get all messages for a chat session
pub async fn get_prd_chat_history(
    session_id: String,
    project_path: String,
) -> Result<Vec<ChatMessage>, String> {
    let project_path_obj = as_path(&project_path);

    chat_ops::get_messages_by_session(project_path_obj, &session_id)
        .map_err(|e| format!("Failed to get chat history: {}", e))
}

// ============================================================================
// Prompt Building Functions
// ============================================================================

/// Get the current GSD phase from a chat session
pub fn get_gsd_phase(session: &ChatSession) -> Option<GsdPhase> {
    if !session.gsd_mode {
        return None;
    }
    session.gsd_state.as_ref().and_then(|state_json| {
        serde_json::from_str::<GsdWorkflowState>(state_json)
            .ok()
            .map(|state| state.current_phase)
    })
}

/// Extract questioning context from GSD state
fn get_questioning_context(session: &ChatSession) -> Option<QuestioningContext> {
    session.gsd_state.as_ref().and_then(|state_json| {
        serde_json::from_str::<GsdWorkflowState>(state_json)
            .ok()
            .map(|state| state.questioning_context)
    })
}

/// Build prompt for Deep Questioning phase - focuses on discovery, not PRD creation
fn build_deep_questioning_prompt(
    session: &ChatSession,
    history: &[ChatMessage],
    current_message: &str,
    attachment_paths: &[String],
    has_external_session: bool,
    planning_context: Option<&PlanningContext>,
) -> String {
    let mut prompt = String::new();

    // Discovery coach persona - NOT a PRD writer
    prompt.push_str(
        r#"You are a friendly product discovery coach helping someone clarify their project idea.

YOUR ROLE:
- Ask thoughtful, probing questions to understand what they want to build
- Help them articulate their ideas more concretely and specifically
- Extract key information about: What (the core idea), Why (motivation/problem), Who (target users), and Done (success criteria)
- Stay conversational, curious, and encouraging
- One question at a time - don't overwhelm them

WHAT YOU MUST NOT DO:
- Do NOT create PRD documents, files, or structured outputs
- Do NOT write user stories, epics, or acceptance criteria yet
- Do NOT break things into tasks or features yet
- Do NOT write to any files
- This is the DISCOVERY phase - we're just understanding the idea through conversation

PROBING QUESTION EXAMPLES:
- "Can you describe the main action or workflow a user would take?"
- "What problem does the user have RIGHT NOW that this solves?"
- "Can you describe a specific person who would use this?"
- "What would a user be able to accomplish that they couldn't before?"
- "What does the MVP look like? What's the smallest thing you could ship?"

When the user shares their idea, acknowledge it warmly, then ask a follow-up question to help them think more concretely about one aspect they haven't fully explained yet.

"#,
    );

    // Add context status if available
    if let Some(context) = get_questioning_context(session) {
        prompt.push_str("CURRENT CONTEXT STATUS:\n");
        prompt.push_str(&format!(
            "- What: {}\n",
            if context.what.is_some() {
                "filled"
            } else {
                "needs input"
            }
        ));
        prompt.push_str(&format!(
            "- Why: {}\n",
            if context.why.is_some() {
                "filled"
            } else {
                "needs input"
            }
        ));
        prompt.push_str(&format!(
            "- Who: {}\n",
            if context.who.is_some() {
                "filled"
            } else {
                "needs input"
            }
        ));
        prompt.push_str(&format!(
            "- Done: {}\n\n",
            if context.done.is_some() {
                "filled"
            } else {
                "needs input"
            }
        ));
        prompt.push_str("Focus your questions on the items that still need input.\n\n");
    }

    // Include conversation history only if we don't have an active external session
    // When resuming an external session, the CLI agent maintains its own context,
    // so we skip history to save tokens (67-90% savings depending on conversation length)
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

    // Add attachment references if present
    if !attachment_paths.is_empty() {
        prompt.push_str("\n=== Attached Images ===\n");
        prompt.push_str(
            "The user has attached the following images. You can view them using the Read tool:\n",
        );
        for path in attachment_paths {
            prompt.push_str(&format!("- {}\n", path));
        }
        prompt.push_str("=== End Attached Images ===\n\n");
    }

    // Include planning documents if available (persists across session resumption)
    inject_planning_context(&mut prompt, planning_context);

    prompt.push_str(&format!("User: {}\n\nAssistant:", current_message));
    prompt
}

/// Inject planning documents into a prompt if available.
/// These documents persist across session resumption when conversation history is omitted.
fn inject_planning_context(prompt: &mut String, ctx: Option<&PlanningContext>) {
    let Some(ctx) = ctx else { return };

    if let Some(summary) = &ctx.summary {
        prompt.push_str("\n=== Research Summary ===\n");
        prompt.push_str(summary);
        prompt.push_str("\n=== End Research Summary ===\n\n");
    }
    if let Some(reqs) = &ctx.requirements {
        prompt.push_str("\n=== Requirements ===\n");
        prompt.push_str(reqs);
        prompt.push_str("\n=== End Requirements ===\n\n");
    }
    if let Some(roadmap) = &ctx.roadmap {
        prompt.push_str("\n=== Roadmap ===\n");
        prompt.push_str(roadmap);
        prompt.push_str("\n=== End Roadmap ===\n\n");
    }
}

/// Build the prompt for PRD chat
///
/// When `has_external_session` is true, conversation history is omitted because
/// the CLI agent maintains its own context through native session resumption.
/// This significantly reduces token usage for multi-turn conversations.
fn build_prd_chat_prompt(
    session: &ChatSession,
    history: &[ChatMessage],
    current_message: &str,
    attachment_paths: &[String],
    has_external_session: bool,
    planning_context: Option<&PlanningContext>,
) -> String {
    let mut prompt = String::new();

    // System context for PRD creation
    prompt.push_str("You are an expert product manager helping to create a Product Requirements Document (PRD). ");
    prompt.push_str(
        "Your goal is to help the user articulate their product requirements clearly and comprehensively.\n\n",
    );

    prompt.push_str("Focus on:\n");
    prompt.push_str("- Understanding the problem being solved\n");
    prompt.push_str("- Defining clear user stories and acceptance criteria\n");
    prompt.push_str("- Breaking down features into actionable tasks\n");
    prompt.push_str("- Identifying technical requirements and constraints\n");
    prompt.push_str("- Suggesting success metrics and validation criteria\n\n");

    prompt.push_str("When defining user stories for a feature, you MUST use this 5-point recipe to ensure completeness:\n");
    prompt.push_str("1. **Core Implementation**: The main happy-path functionality.\n");
    prompt.push_str(
        "2. **Input Validation & Error Handling**: How invalid inputs and error states are handled.\n",
    );
    prompt.push_str("3. **Observability**: Logging, metrics, and how success is tracked.\n");
    prompt.push_str(
        "4. **Edge Cases**: Robustness against system limits, concurrency, network issues, etc.\n",
    );
    prompt.push_str("5. **Documentation**: User guides, tooltips, or API documentation.\n\n");

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
        prompt.push_str(
            "- Continue conversation naturally, outputting JSON blocks when defining new PRD items\n\n",
        );
        prompt.push_str("=== END STRUCTURED OUTPUT MODE ===\n\n");
    }

    // Include project context if available
    if let Some(ref project_path) = session.project_path {
        prompt.push_str(&format!("Project path: {}\n\n", project_path));

        // Add plan file instruction
        let plan_file_instruction = get_prd_plan_instruction(
            project_path,
            &session.id,
            session.title.as_deref(),
            session.prd_id.as_deref(),
        );
        prompt.push_str(&plan_file_instruction);
    }

    // Include conversation history only if we don't have an active external session
    // When resuming an external session, the CLI agent maintains its own context,
    // so we skip history to save tokens (67-90% savings depending on conversation length)
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

    // Add attachment references if present
    if !attachment_paths.is_empty() {
        prompt.push_str("\n=== Attached Images ===\n");
        prompt.push_str(
            "The user has attached the following images. You can view them using the Read tool:\n",
        );
        for path in attachment_paths {
            prompt.push_str(&format!("- {}\n", path));
        }
        prompt.push_str("=== End Attached Images ===\n\n");
    }

    // Include planning documents if available (persists across session resumption)
    inject_planning_context(&mut prompt, planning_context);

    // Current user message
    prompt.push_str(&format!("User: {}\n\nAssistant:", current_message));

    prompt
}

/// Generate the plan file instruction to be injected into prompts
/// This instructs the AI to maintain a living plan document
///
/// The PRD filename uses `make_prd_filename` from ralph_loop::types for consistency:
/// Format: `{sanitized-title}-{8-char-session-id}`
///
/// If `prd_id` starts with "file:", that filename is used directly (for existing PRDs).
pub fn get_prd_plan_instruction(
    project_path: &str,
    session_id: &str,
    title: Option<&str>,
    prd_id: Option<&str>,
) -> String {
    // If we have a file-based PRD ID, use that filename directly (same logic as get_prd_plan_file_path)
    let prd_name = if let Some(id) = prd_id {
        if id.starts_with("file:") {
            id.trim_start_matches("file:").to_string()
        } else {
            title
                .map(|t| crate::ralph_loop::make_prd_filename(t, session_id))
                .unwrap_or_else(|| crate::ralph_loop::make_prd_filename("prd", session_id))
        }
    } else {
        title
            .map(|t| crate::ralph_loop::make_prd_filename(t, session_id))
            .unwrap_or_else(|| crate::ralph_loop::make_prd_filename("prd", session_id))
    };

    format!(
        "\n=== PLAN FILE INSTRUCTION ===\n\n\
        **CRITICAL: You MUST use this EXACT filename - do not change it:**\n\
        `{project_path}/.ralph-ui/prds/{prd_name}.md`\n\n\
        ⚠️ IMPORTANT: The system tracks this specific file. Using any other filename will cause the PRD to be lost and not appear in the UI.\n\n\
        This file should contain:\n\
        - Current understanding of requirements\n\
        - Key decisions and rationale\n\
        - User stories with acceptance criteria\n\
        - Open questions to resolve\n\n\
        **IMPORTANT: User Story Format**\n\
        When writing user stories, ALWAYS use markdown headers (not bold text):\n\n\
        ```markdown\n\
        #### US-1.1: Story Title\n\n\
        **Acceptance Criteria:**\n\
        - Criterion 1\n\
        - Criterion 2\n\
        ```\n\n\
        Never use `**US-1.1:**` bold format. Always use `#### US-X.X:` headers.\n\n\
        UPDATE THIS FILE NOW at the exact path specified above.\n\
        Write to: `{project_path}/.ralph-ui/prds/{prd_name}.md`\n\n\
        === END PLAN FILE INSTRUCTION ===\n\n"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

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
            gsd_mode: false,
            gsd_state: None,
            pending_operation_started_at: None,
            external_session_id: None,
        }
    }

    #[test]
    fn test_build_prd_chat_prompt_empty_history() {
        let session = make_test_session("test");

        let history: Vec<ChatMessage> = vec![];
        let prompt =
            build_prd_chat_prompt(&session, &history, "Create a PRD for a todo app", &[], false, None);

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
                attachments: None,
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Great! Let me help you define the requirements.".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
                attachments: None,
            },
        ];

        let prompt =
            build_prd_chat_prompt(&session, &history, "Add a due date feature", &[], false, None);

        assert!(prompt.contains("Project path: /my/project"));
        assert!(prompt.contains("Conversation History"));
        assert!(prompt.contains("I want to build a todo app"));
        assert!(prompt.contains("Let me help you define"));
        assert!(prompt.contains("Add a due date feature"));
    }

    #[test]
    fn test_build_prd_chat_prompt_with_external_session_skips_history() {
        let mut session = make_test_session("test");
        session.project_path = Some("/my/project".to_string());

        let history = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "I want to build a todo app".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
                attachments: None,
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Great! Let me help you define the requirements.".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
                attachments: None,
            },
        ];

        // When has_external_session is true, history should be omitted (token savings)
        let prompt =
            build_prd_chat_prompt(&session, &history, "Add a due date feature", &[], true, None);

        assert!(prompt.contains("Project path: /my/project"));
        // History should NOT be included when resuming external session
        assert!(!prompt.contains("Conversation History"));
        assert!(!prompt.contains("I want to build a todo app"));
        // Current message should still be included
        assert!(prompt.contains("Add a due date feature"));
    }

    #[test]
    fn test_build_prd_chat_prompt_structured_mode() {
        let mut session = make_test_session("test");
        session.structured_mode = true;

        let history: Vec<ChatMessage> = vec![];
        let prompt = build_prd_chat_prompt(
            &session,
            &history,
            "Create epics for an auth system",
            &[],
            false,
            None,
        );

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
        let prompt = build_prd_chat_prompt(&session, &history, "Create a PRD", &[], false, None);

        // Should NOT include structured output instructions
        assert!(!prompt.contains("STRUCTURED OUTPUT MODE"));
        assert!(!prompt.contains("JSON code block"));
    }

    #[test]
    fn test_build_prd_chat_prompt_with_planning_context() {
        let session = make_test_session("test");

        let planning_context = Some(PlanningContext {
            summary: Some("# Research Summary\nThis is the research synthesis.".to_string()),
            requirements: Some("# Requirements\n- Req 1\n- Req 2".to_string()),
            roadmap: Some("# Roadmap\nPhase 1: MVP".to_string()),
        });

        let history: Vec<ChatMessage> = vec![];
        let prompt = build_prd_chat_prompt(
            &session,
            &history,
            "What are the requirements?",
            &[],
            true, // Simulating session resumption
            planning_context.as_ref(),
        );

        // Planning context should be included even when history is omitted
        assert!(prompt.contains("=== Research Summary ==="));
        assert!(prompt.contains("This is the research synthesis."));
        assert!(prompt.contains("=== Requirements ==="));
        assert!(prompt.contains("- Req 1"));
        assert!(prompt.contains("=== Roadmap ==="));
        assert!(prompt.contains("Phase 1: MVP"));
        // History should not be included
        assert!(!prompt.contains("Conversation History"));
    }

    #[test]
    fn test_build_prd_chat_prompt_with_partial_planning_context() {
        let session = make_test_session("test");

        // Only summary available
        let planning_context = Some(PlanningContext {
            summary: Some("# Research Summary\nOnly summary exists.".to_string()),
            requirements: None,
            roadmap: None,
        });

        let history: Vec<ChatMessage> = vec![];
        let prompt = build_prd_chat_prompt(
            &session,
            &history,
            "What do we know so far?",
            &[],
            false,
            planning_context.as_ref(),
        );

        // Only summary should be included
        assert!(prompt.contains("=== Research Summary ==="));
        assert!(prompt.contains("Only summary exists."));
        assert!(!prompt.contains("=== Requirements ==="));
        assert!(!prompt.contains("=== Roadmap ==="));
    }

    #[test]
    fn test_extract_historical_attachment_paths_empty_history() {
        let project_path = Path::new("/home/user/project");
        let history: Vec<ChatMessage> = vec![];

        let paths = extract_historical_attachment_paths(project_path, &history);

        assert!(paths.is_empty());
    }

    #[test]
    fn test_extract_historical_attachment_paths_no_attachments() {
        let project_path = Path::new("/home/user/project");
        let history = vec![
            ChatMessage {
                id: "msg-1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "Hello".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
                attachments: None,
            },
            ChatMessage {
                id: "msg-2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Hi there".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
                attachments: None,
            },
        ];

        let paths = extract_historical_attachment_paths(project_path, &history);

        assert!(paths.is_empty());
    }

    #[test]
    fn test_extract_historical_attachment_paths_with_attachments() {
        use crate::models::{AttachmentMimeType, ChatAttachment};

        let project_path = Path::new("/home/user/project");
        let history = vec![
            ChatMessage {
                id: "msg-1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "Here is an image".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
                attachments: Some(vec![ChatAttachment {
                    id: "att-1".to_string(),
                    mime_type: AttachmentMimeType::ImagePng,
                    data: String::new(), // Data not needed for path extraction
                    filename: Some("screenshot.png".to_string()),
                    size: 1000,
                    width: Some(800),
                    height: Some(600),
                }]),
            },
            ChatMessage {
                id: "msg-2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "I see the image".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
                attachments: None,
            },
            ChatMessage {
                id: "msg-3".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "Here is another".to_string(),
                created_at: "2026-01-17T00:02:00Z".to_string(),
                attachments: Some(vec![ChatAttachment {
                    id: "att-2".to_string(),
                    mime_type: AttachmentMimeType::ImageJpeg,
                    data: String::new(),
                    filename: Some("photo.jpg".to_string()),
                    size: 2000,
                    width: Some(1024),
                    height: Some(768),
                }]),
            },
        ];

        let paths = extract_historical_attachment_paths(project_path, &history);

        assert_eq!(paths.len(), 2);
        assert!(paths[0].contains("msg-1"));
        assert!(paths[0].contains("screenshot.png"));
        assert!(paths[1].contains("msg-3"));
        assert!(paths[1].contains("photo.jpg"));
    }

    #[test]
    fn test_extract_historical_attachment_paths_multiple_per_message() {
        use crate::models::{AttachmentMimeType, ChatAttachment};

        let project_path = Path::new("/home/user/project");
        let history = vec![ChatMessage {
            id: "msg-1".to_string(),
            session_id: "test".to_string(),
            role: MessageRole::User,
            content: "Multiple images".to_string(),
            created_at: "2026-01-17T00:00:00Z".to_string(),
            attachments: Some(vec![
                ChatAttachment {
                    id: "att-1".to_string(),
                    mime_type: AttachmentMimeType::ImagePng,
                    data: String::new(),
                    filename: Some("img1.png".to_string()),
                    size: 1000,
                    width: Some(800),
                    height: Some(600),
                },
                ChatAttachment {
                    id: "att-2".to_string(),
                    mime_type: AttachmentMimeType::ImageGif,
                    data: String::new(),
                    filename: Some("img2.gif".to_string()),
                    size: 500,
                    width: Some(400),
                    height: Some(300),
                },
            ]),
        }];

        let paths = extract_historical_attachment_paths(project_path, &history);

        assert_eq!(paths.len(), 2);
        assert!(paths[0].contains("img1.png"));
        assert!(paths[1].contains("img2.gif"));
    }
}
