// PRD Chat messaging operations - send messages, get history, build prompts

use crate::file_storage::{attachments, chat_ops};
use crate::models::{
    get_discovery_questions, ChatMessage, ChatSession, DiscoveryCategory, DiscoveryProgress,
    DiscoveryQuestion, ExtractedPRDStructure, MessageRole,
};
use crate::parsers::structured_output;
use crate::prd_workflow::{read_research_file, WorkflowPhase};
use crate::templates::builtin::{get_builtin_template, PRD_CHAT_SYSTEM};
use crate::templates::engine::{TemplateContext, TemplateEngine};
use crate::utils::as_path;
use crate::watchers::PrdFileUpdate;
use serde_json;
use std::path::Path;
use uuid::Uuid;

use super::agent_executor::{self, generate_session_title};
use super::extraction;
use super::parse_agent_type_with_provider;
use super::types::{SendMessageRequest, SendMessageResponse};

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

/// Load all available planning documents for a PRD workflow session.
/// Returns documents that exist, with None for missing ones.
fn load_planning_context(project_path: &Path, workflow_id: &str) -> PlanningContext {
    PlanningContext {
        summary: read_research_file(project_path, workflow_id, "SUMMARY.md").ok(),
        requirements: read_research_file(project_path, workflow_id, "REQUIREMENTS.md").ok(),
        roadmap: read_research_file(project_path, workflow_id, "ROADMAP.md").ok(),
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
                        let path =
                            attachments::get_attachment_file_path(project_path, &msg.id, att);
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
    let historical_attachment_paths =
        extract_historical_attachment_paths(project_path_obj, &history);

    // Combine current message attachments with historical attachments
    let all_attachment_paths: Vec<String> = attachment_paths
        .into_iter()
        .chain(historical_attachment_paths)
        .collect();

    // Load planning documents for PRD workflow sessions.
    // These persist across session resumption when conversation history is omitted,
    // ensuring the agent always has access to research, requirements, and roadmap.
    let planning_context = if get_workflow_phase(&session, &history).is_some() {
        Some(load_planning_context(project_path_obj, &session.id))
    } else {
        None
    };

    // Build prompt based on mode - use discovery prompt for PRD workflow Discovery phase
    // When resuming an external session, history is omitted (agent maintains its own context)
    let prompt = match get_workflow_phase(&session, &history) {
        Some(WorkflowPhase::Discovery) => build_deep_questioning_prompt(
            &session,
            &history,
            &request.content,
            &all_attachment_paths,
            has_external_session,
            planning_context.as_ref(),
            Some(project_path_obj),
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

    // Parse agent type and provider
    let (agent_type, provider_id) = parse_agent_type_with_provider(&session.agent_type)?;

    // Build provider environment variables if applicable
    let provider_env_vars = if agent_type == crate::models::AgentType::Claude {
        if let Some(provider_id) = &provider_id {
            log::info!("🔄 Using Claude with provider: {}", provider_id);

            // Load provider token from secrets
            let secrets = crate::config::SecretsConfig::load()
                .map_err(|e| format!("Failed to load secrets: {}", e))?;
            let token = secrets.get_token(provider_id).cloned();

            if token.is_some() {
                log::info!("✓ Provider token loaded for: {}", provider_id);
            } else {
                log::warn!("⚠️  No token found for provider: {}", provider_id);
            }

            // Build environment variables for the provider
            let env_vars = crate::config::build_provider_env_vars(provider_id, token.as_deref());

            // Log the environment variables being set (with masked token)
            log::info!("🔧 Environment variables being set:");
            for (key, value) in &env_vars {
                if key.contains("TOKEN") || key.contains("KEY") {
                    log::info!("  {}=***MASKED***", key);
                } else {
                    log::info!("  {}={}", key, value);
                }
            }

            Some(env_vars)
        } else {
            log::info!("✓ Using Claude with default Anthropic provider");
            // No provider specified, use default (Anthropic)
            None
        }
    } else {
        log::info!("✓ Using agent: {} (no provider support)", agent_type);
        None
    };

    // Set pending operation before agent execution (for page reload recovery)
    if let Err(e) = chat_ops::set_pending_operation(project_path_obj, &request.session_id) {
        log::warn!("Failed to set pending operation: {}", e);
    }

    // Execute CLI agent and get response with streaming using the unified executor
    // Pass external_session_id to enable session resumption (saves 67-90% tokens)
    let emitter = agent_executor::BroadcastEmitter::new(app_handle.clone());
    let agent_result = match agent_executor::execute_chat_agent_with_env(
        &emitter,
        &request.session_id,
        agent_type,
        &prompt,
        session.project_path.as_deref(),
        session.external_session_id.as_deref(),
        provider_env_vars.as_ref(),
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

    // Update discovery progress after each message exchange
    // Include the new messages in analysis
    let mut updated_history = history.clone();
    updated_history.push(user_message.clone());
    updated_history.push(assistant_message.clone());
    let progress = analyze_discovery_progress(&updated_history);
    if let Err(e) = chat_ops::update_chat_session_discovery_progress(
        project_path_obj,
        &request.session_id,
        &progress,
    ) {
        log::warn!("Failed to update discovery progress: {}", e);
    }

    // Auto-generate title from first message if not set
    // Track the generated title so we can use it for PRD file path without reloading session
    let generated_title: Option<String> = if session.title.is_none() {
        let title = generate_session_title(&request.content, session.prd_type.as_deref());
        chat_ops::update_chat_session_title(project_path_obj, &request.session_id, &title).ok();
        Some(title)
    } else {
        None
    };

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

    // Auto-extract and save PRD content from agent response.
    // This ensures PRD content goes to the correct file path regardless of agent behavior.
    // Following the same pattern as Context Chat's extract_context_block.
    if let Some(project_path) = &session.project_path {
        if let Some(prd_content) = extraction::extract_prd_block(&response_content) {
            // Get the correct PRD file path
            // Use generated_title if we just created one, otherwise use existing session.title
            let effective_title = generated_title.as_deref().or(session.title.as_deref());

            let plan_path = crate::watchers::get_prd_plan_file_path(
                project_path,
                &request.session_id,
                effective_title,
                session.prd_id.as_deref(),
            );

            // Ensure directory exists
            if let Some(parent) = plan_path.parent() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    log::warn!("Failed to create PRD directory: {}", e);
                }
            }

            // Write the PRD content to the correct file
            match crate::file_storage::atomic_write(&plan_path, &prd_content) {
                Ok(()) => {
                    log::info!(
                        "Auto-saved PRD content to {} ({} chars)",
                        plan_path.display(),
                        prd_content.len()
                    );

                    // Emit prd:file_updated event so the frontend Plan panel updates
                    let update = PrdFileUpdate {
                        session_id: request.session_id.clone(),
                        content: prd_content,
                        path: plan_path.to_string_lossy().to_string(),
                    };
                    app_handle.broadcast("prd:file_updated", update);
                }
                Err(e) => {
                    log::warn!("Failed to auto-save PRD content: {}", e);
                }
            }
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

/// Analyze conversation content to determine which discovery areas are covered.
/// Returns a DiscoveryProgress struct with coverage status for each area.
pub fn analyze_discovery_progress(history: &[ChatMessage]) -> DiscoveryProgress {
    if history.is_empty() {
        return DiscoveryProgress::default();
    }

    // Combine all conversation content for analysis
    let content: String = history
        .iter()
        .map(|m| m.content.to_lowercase())
        .collect::<Vec<_>>()
        .join(" ");

    // WHAT - Problem/feature indicators
    let problem_covered = content.contains("problem")
        || content.contains("feature")
        || content.contains("build")
        || content.contains("create")
        || content.contains("implement")
        || content.contains("want to")
        || content.contains("need to")
        || content.contains("goal is");

    // WHO - User/target audience indicators
    let users_covered = content.contains("user")
        || content.contains("customer")
        || content.contains("audience")
        || content.contains("target")
        || content.contains("persona")
        || content.contains("who will")
        || content.contains("developers")
        || content.contains("team");

    // WHY - Motivation/value indicators
    let motivation_covered = content.contains("because")
        || content.contains("reason")
        || content.contains("motivation")
        || content.contains("value")
        || content.contains("benefit")
        || content.contains("pain point")
        || content.contains("currently")
        || content.contains("right now");

    // DONE - Success criteria indicators
    let success_covered = content.contains("success")
        || content.contains("criteria")
        || content.contains("measure")
        || content.contains("metric")
        || content.contains("kpi")
        || content.contains("done when")
        || content.contains("complete when")
        || content.contains("achieve");

    // TECH - Technical constraints (optional)
    let tech_covered = content.contains("tech")
        || content.contains("stack")
        || content.contains("framework")
        || content.contains("language")
        || content.contains("database")
        || content.contains("api")
        || content.contains("architecture")
        || content.contains("integration");

    // SCOPE - Boundaries (optional)
    let scope_covered = content.contains("scope")
        || content.contains("out of scope")
        || content.contains("boundary")
        || content.contains("mvp")
        || content.contains("phase 1")
        || content.contains("not include")
        || content.contains("later");

    DiscoveryProgress {
        problem_covered,
        users_covered,
        motivation_covered,
        success_covered,
        tech_covered,
        scope_covered,
        summary: None,
    }
}

/// Check if discovery is complete enough to transition to PRD writing.
/// Requires the 4 core areas (WHAT, WHO, WHY, DONE) to be covered.
/// Tech and Scope are optional and don't block transition.
pub fn is_discovery_complete(progress: &DiscoveryProgress) -> bool {
    progress.problem_covered
        && progress.users_covered
        && progress.motivation_covered
        && progress.success_covered
}

/// Get which discovery areas still need coverage (for future UI integration)
#[allow(dead_code)]
pub fn get_missing_discovery_areas(progress: &DiscoveryProgress) -> Vec<&'static str> {
    let mut missing = Vec::new();
    if !progress.problem_covered {
        missing.push("WHAT (problem/feature)");
    }
    if !progress.users_covered {
        missing.push("WHO (target users)");
    }
    if !progress.motivation_covered {
        missing.push("WHY (motivation/value)");
    }
    if !progress.success_covered {
        missing.push("DONE (success criteria)");
    }
    missing
}

/// Map DiscoveryProgress flags to the corresponding question IDs.
/// This allows the structured question list to show which questions have been answered
/// based on the content analysis from `analyze_discovery_progress`.
fn map_progress_to_question_ids(progress: &DiscoveryProgress) -> Vec<&'static str> {
    let mut ids = Vec::new();

    // Map progress flags to question IDs
    if progress.problem_covered {
        ids.push("problem");
        ids.push("solution"); // Problem discussion often includes solution
    }
    if progress.users_covered {
        ids.push("users");
    }
    if progress.motivation_covered {
        // Motivation maps to problem understanding (why this matters)
    }
    if progress.success_covered {
        ids.push("metrics");
        ids.push("constraints"); // Success criteria often include constraints
    }
    if progress.tech_covered {
        ids.push("codebase");
        ids.push("stack");
        ids.push("integrations");
        ids.push("performance");
    }
    if progress.scope_covered {
        ids.push("complexity");
        ids.push("timeline");
    }

    ids
}

/// Get the current workflow phase from a chat session based on conversation progress.
///
/// For new conversations or when discovery areas are incomplete, returns Discovery
/// phase to ensure the agent asks clarifying questions before jumping to PRD writing.
/// This prevents the agent from implementing code instead of gathering requirements.
///
/// Uses content-based analysis to check if key areas (WHAT, WHO, WHY, DONE) are covered.
pub fn get_workflow_phase(session: &ChatSession, history: &[ChatMessage]) -> Option<WorkflowPhase> {
    // For new conversations (no previous messages), use Discovery phase
    if history.is_empty() {
        return Some(WorkflowPhase::Discovery);
    }

    // Use stored discovery progress if available, otherwise analyze from history
    let progress = session
        .discovery_progress
        .clone()
        .unwrap_or_else(|| analyze_discovery_progress(history));

    // Check if core discovery areas are covered
    if !is_discovery_complete(&progress) {
        return Some(WorkflowPhase::Discovery);
    }

    // Also require minimum 2 assistant messages to ensure real conversation happened
    let assistant_count = history
        .iter()
        .filter(|m| m.role == MessageRole::Assistant)
        .count();
    if assistant_count < 2 {
        return Some(WorkflowPhase::Discovery);
    }

    // Discovery complete - switch to PRD writing mode
    None
}

/// Build prompt for Deep Questioning phase - focuses on discovery, not PRD creation
fn build_deep_questioning_prompt(
    session: &ChatSession,
    history: &[ChatMessage],
    current_message: &str,
    attachment_paths: &[String],
    has_external_session: bool,
    planning_context: Option<&PlanningContext>,
    project_path: Option<&Path>,
) -> String {
    let mut prompt = String::new();

    // Inject codebase analysis at the beginning if project path is available
    if let Some(path) = project_path {
        if let Ok(analysis) = super::analysis::analyze_project_for_prd(path) {
            let analysis_summary = super::analysis::format_analysis_for_prompt(&analysis);
            if !analysis_summary.is_empty() && analysis_summary != "No project analysis available."
            {
                prompt.push_str("=== PROJECT CODEBASE ANALYSIS ===\n");
                prompt.push_str(&analysis_summary);
                prompt.push_str("\n=== END ANALYSIS ===\n\n");
                prompt.push_str("Use this codebase context to ask relevant questions about how the new feature/change will integrate with existing patterns and architecture.\n\n");
            }
        }
    }

    // Discovery coach persona - NOT a PRD writer
    prompt.push_str(
        r#"## ⛔ CRITICAL: NO IMPLEMENTATION - DISCOVERY PHASE

**YOU MUST NOT IMPLEMENT CODE. IMPLEMENTATION HAPPENS ONLY IN THE RALPH LOOP.**

This is the DISCOVERY phase. Your ONLY job is to ask questions and understand requirements.

---

You are a friendly product discovery coach helping someone clarify their project idea.

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
- Do NOT write ANY code - implementation happens in Ralph Loop, not here
- This is the DISCOVERY phase - we're just understanding the idea through conversation

PHASE TRANSITION:
Stay in discovery until you clearly understand all four areas (WHAT, WHY, WHO, DONE).
When all four are clear, signal readiness to transition:

"I have a good understanding now. Here's what I gathered:
- **What**: [concise summary of the product/feature]
- **Why**: [the problem it solves]
- **Who**: [the target user]
- **Done**: [measurable success criteria]

Does this capture your vision? If so, I can switch to PRD writing mode and document the requirements formally. Once the PRD is complete, you can start a **Ralph Loop session** to implement the code."

**If the user asks you to "build it" or "implement it":**
→ Say: "Let me first document the requirements in a PRD. Once that's complete, you can start a Ralph Loop session to implement. What would you like to clarify about the requirements?"

When the user shares their idea, acknowledge it warmly, then ask a follow-up question to help them think more concretely about one aspect they haven't fully explained yet.

"#,
    );

    // Get structured discovery questions
    let discovery_questions = get_discovery_questions();

    // Analyze discovery progress and show status
    let progress = session
        .discovery_progress
        .clone()
        .unwrap_or_else(|| analyze_discovery_progress(history));

    // Map progress flags to question IDs that are considered answered
    let answered_question_ids = map_progress_to_question_ids(&progress);

    // Show discovery progress status with structured questions
    prompt.push_str("\n=== DISCOVERY QUESTIONS ===\n\n");

    // Essential Questions (Required)
    prompt.push_str("**Essential Questions (Required for PRD):**\n");
    let essential_questions: Vec<&DiscoveryQuestion> = discovery_questions
        .iter()
        .filter(|q| q.category == DiscoveryCategory::Essential)
        .collect();

    for q in &essential_questions {
        let answered = answered_question_ids.contains(&q.id.as_str());
        let status = if answered { "✓" } else { "○" };
        prompt.push_str(&format!(
            "{} **{}**: {}\n",
            status,
            q.id.to_uppercase(),
            q.question
        ));
        if !answered {
            prompt.push_str(&format!("   → Follow-up: {}\n", q.follow_up_hint));
        }
    }

    // Technical Questions (Optional)
    prompt.push_str("\n**Technical Questions (Optional):**\n");
    let technical_questions: Vec<&DiscoveryQuestion> = discovery_questions
        .iter()
        .filter(|q| q.category == DiscoveryCategory::Technical)
        .collect();

    for q in &technical_questions {
        let answered = answered_question_ids.contains(&q.id.as_str());
        let status = if answered { "✓" } else { "○" };
        prompt.push_str(&format!(
            "{} **{}**: {}\n",
            status,
            q.id.to_uppercase(),
            q.question
        ));
    }

    // Implementation Questions (Optional)
    prompt.push_str("\n**Implementation Questions (Optional):**\n");
    let implementation_questions: Vec<&DiscoveryQuestion> = discovery_questions
        .iter()
        .filter(|q| q.category == DiscoveryCategory::Implementation)
        .collect();

    for q in &implementation_questions {
        let answered = answered_question_ids.contains(&q.id.as_str());
        let status = if answered { "✓" } else { "○" };
        prompt.push_str(&format!(
            "{} **{}**: {}\n",
            status,
            q.id.to_uppercase(),
            q.question
        ));
    }

    prompt.push_str("\n=== END QUESTIONS ===\n\n");

    // Calculate progress summary
    let essential_answered = essential_questions
        .iter()
        .filter(|q| answered_question_ids.contains(&q.id.as_str()))
        .count();
    let total_essential = essential_questions.len();

    prompt.push_str(&format!(
        "**Progress: {}/{} essential questions answered**\n\n",
        essential_answered, total_essential
    ));

    // Find the next unanswered question to suggest
    let next_question = discovery_questions
        .iter()
        .filter(|q| q.required)
        .find(|q| !answered_question_ids.contains(&q.id.as_str()));

    if let Some(next_q) = next_question {
        prompt.push_str(&format!(
            "**NEXT QUESTION TO ASK:**\n\
             Ask about **{}** ({})\n\
             Follow-up hint: {}\n\n",
            next_q.id.to_uppercase(),
            next_q.question,
            next_q.follow_up_hint
        ));
    } else if essential_answered == total_essential {
        prompt.push_str(
            "**ALL ESSENTIAL QUESTIONS COVERED** - You can now offer to transition to PRD writing mode.\n\n",
        );
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

/// Build the prompt for PRD chat using the PRD_CHAT_SYSTEM template
fn build_prd_chat_prompt(
    session: &ChatSession,
    history: &[ChatMessage],
    current_message: &str,
    attachment_paths: &[String],
    has_external_session: bool,
    planning_context: Option<&PlanningContext>,
) -> String {
    // 1. Initialize Template Engine
    let engine = TemplateEngine::new();
    if let Some(template_str) = get_builtin_template(PRD_CHAT_SYSTEM) {
        if let Err(e) = engine.add_template(PRD_CHAT_SYSTEM, template_str) {
            log::error!("Failed to add PRD_CHAT_SYSTEM template: {}", e);
            return format!("Error: Failed to load system prompt template. {}", e);
        }
    } else {
        log::error!("PRD_CHAT_SYSTEM template not found in builtin templates");
        return "Error: System prompt template not found.".to_string();
    }

    // 2. Prepare Context Variables
    let mut context = TemplateContext::new();

    // Structured Mode
    if let Err(e) = context.add_custom_json("structured_mode", session.structured_mode) {
        log::error!("Failed to add structured_mode to context: {}", e);
    }

    // Project Path & Plan File Instruction
    if let Some(ref project_path) = session.project_path {
        context = context.with_custom("project_path", project_path);

        let instruction = get_prd_plan_instruction(
            project_path,
            &session.id,
            session.title.as_deref(),
            session.prd_id.as_deref(),
        );
        context = context.with_custom("plan_file_instruction", &instruction);

        let path_reminder = get_prd_path_reminder(
            project_path,
            &session.id,
            session.title.as_deref(),
            session.prd_id.as_deref(),
        );
        context = context.with_custom("path_reminder", &path_reminder);

        // Inject project context if available and enabled
        if let Some(context_content) =
            crate::file_storage::context_ops::get_context_for_injection(as_path(project_path), true)
        {
            context = context.with_custom("project_context_injection", &context_content);
        }
    }

    // History (Skip if resuming external session)
    if !has_external_session && !history.is_empty() {
        // We only need role and content for the template
        let history_data: Vec<serde_json::Value> = history
            .iter()
            .map(|msg| {
                serde_json::json!({
                    "role": match msg.role {
                        MessageRole::User => "User",
                        MessageRole::Assistant => "Assistant",
                        MessageRole::System => "System",
                    },
                    "content": msg.content
                })
            })
            .collect();
        if let Err(e) = context.add_custom_json("history", history_data) {
            log::error!("Failed to add history to context: {}", e);
        }
    }

    // Attachments
    if !attachment_paths.is_empty() {
        if let Err(e) = context.add_custom_json("attachments", attachment_paths) {
            log::error!("Failed to add attachments to context: {}", e);
        }
    }

    // Planning Context
    if let Some(ctx) = planning_context {
        let mut planning_str = String::new();
        inject_planning_context(&mut planning_str, Some(ctx));
        if !planning_str.is_empty() {
            context = context.with_custom("planning_context", &planning_str);
        }
    }

    // Current Message
    context = context.with_custom("current_message", current_message);

    // 3. Render Template
    match engine.render(PRD_CHAT_SYSTEM, &context) {
        Ok(rendered) => rendered,
        Err(e) => {
            log::error!("Failed to render PRD chat prompt: {}", e);
            format!("Error generating prompt: {}", e)
        }
    }
}

/// Generate a short, direct path reminder to be placed at the end of prompts.
/// This reinforces the PRD path instruction since LLMs pay more attention to the end of prompts.
/// Used in combination with `get_prd_plan_instruction` which provides full context earlier.
fn get_prd_path_reminder(
    project_path: &str,
    session_id: &str,
    title: Option<&str>,
    prd_id: Option<&str>,
) -> String {
    let prd_name = get_prd_filename(session_id, title, prd_id);
    format!(
        "\n---\n\
        ⚠️ FINAL REMINDER - PRD ONLY, NO CODE:\n\
        - Write PRD to: `{project_path}/.ralph-ui/prds/{prd_name}.md`\n\
        - DO NOT create code files, config files, or any other files\n\
        - DO NOT implement features - that happens in Ralph Loop, not here\n\
        - Your job: Document requirements. Implementation: Ralph Loop.\n\
        ---\n"
    )
}

/// Extract the PRD filename based on session, title, and prd_id.
/// Shared logic used by both `get_prd_plan_instruction` and `get_prd_path_reminder`.
fn get_prd_filename(session_id: &str, title: Option<&str>, prd_id: Option<&str>) -> String {
    if let Some(id) = prd_id {
        if id.starts_with("file:") {
            return id.trim_start_matches("file:").to_string();
        }
    }
    title
        .map(|t| crate::ralph_loop::make_prd_filename(t, session_id))
        .unwrap_or_else(|| crate::ralph_loop::make_prd_filename("prd", session_id))
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
    let prd_name = get_prd_filename(session_id, title, prd_id);

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
        ⚠️ FILE CREATION RESTRICTIONS:\n\
        - You may ONLY create/edit the PRD markdown file at the path above\n\
        - DO NOT create source code files (.js, .ts, .py, .rs, .css, .html, etc.)\n\
        - DO NOT create config files (package.json, manifest.json, Cargo.toml, etc.)\n\
        - DO NOT create directories or any files outside .ralph-ui/prds/\n\
        - If you feel the urge to write code, STOP and document it as a PRD requirement instead\n\n\
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
            pending_operation_started_at: None,
            external_session_id: None,
            discovery_progress: None,
        }
    }

    #[test]
    fn test_build_prd_chat_prompt_empty_history() {
        let session = make_test_session("test");

        let history: Vec<ChatMessage> = vec![];
        let prompt = build_prd_chat_prompt(
            &session,
            &history,
            "Create a PRD for a todo app",
            &[],
            false,
            None,
        );

        assert!(prompt.contains("Technical Product Manager"));
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

        let prompt = build_prd_chat_prompt(
            &session,
            &history,
            "Add a due date feature",
            &[],
            false,
            None,
        );

        assert!(prompt.contains("Project Path: /my/project"));
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
        let prompt = build_prd_chat_prompt(
            &session,
            &history,
            "Add a due date feature",
            &[],
            true,
            None,
        );

        assert!(prompt.contains("Project Path: /my/project"));
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

    #[test]
    fn test_get_prd_filename_with_title() {
        let filename = get_prd_filename("abc12345", Some("My Cool Feature"), None);
        // Should sanitize title and append 8-char session ID
        assert!(filename.starts_with("my-cool-feature-"));
        assert!(filename.contains("abc12345"));
    }

    #[test]
    fn test_get_prd_filename_without_title() {
        let filename = get_prd_filename("session123", None, None);
        // Should default to "prd" with session ID
        assert!(filename.starts_with("prd-"));
        assert!(filename.contains("session1"));
    }

    #[test]
    fn test_get_prd_filename_with_file_prd_id() {
        let filename = get_prd_filename(
            "session123",
            Some("Ignored Title"),
            Some("file:existing-prd"),
        );
        // Should use the file-based PRD ID directly
        assert_eq!(filename, "existing-prd");
    }

    #[test]
    fn test_get_prd_path_reminder_contains_exact_path() {
        let reminder =
            get_prd_path_reminder("/my/project", "session123", Some("Camera Feature"), None);

        // Should contain the exact path with .ralph-ui/prds/
        assert!(reminder.contains("/my/project/.ralph-ui/prds/"));
        assert!(reminder.contains("camera-feature-"));
        assert!(reminder.contains(".md"));
        // Should contain the warning markers
        assert!(reminder.contains("FINAL REMINDER"));
        assert!(reminder.contains("DO NOT create code files"));
        assert!(reminder.contains("Ralph Loop"));
    }

    #[test]
    fn test_build_prd_chat_prompt_includes_path_reminder_at_end() {
        let mut session = make_test_session("test12345678");
        session.project_path = Some("/my/project".to_string());
        session.title = Some("Cool Feature".to_string());

        let history: Vec<ChatMessage> = vec![];
        let prompt = build_prd_chat_prompt(&session, &history, "Create a PRD", &[], false, None);

        // Should contain both the full instruction AND the reminder
        assert!(prompt.contains("PLAN FILE INSTRUCTION"));
        assert!(prompt.contains("FINAL REMINDER - PRD ONLY, NO CODE"));

        // The path reminder should appear AFTER the planning context injection
        // and BEFORE the user message
        let reminder_pos = prompt.find("FINAL REMINDER - PRD ONLY, NO CODE").unwrap();
        let user_msg_pos = prompt.find("User: Create a PRD").unwrap();
        assert!(
            reminder_pos < user_msg_pos,
            "Path reminder should appear before user message"
        );

        // The path reminder should be near the end (after history section would be)
        let plan_instruction_pos = prompt.find("PLAN FILE INSTRUCTION").unwrap();
        assert!(
            reminder_pos > plan_instruction_pos,
            "Path reminder should appear after the main plan instruction"
        );
    }

    #[test]
    fn test_build_prd_chat_prompt_path_reminder_with_session_resumption() {
        let mut session = make_test_session("test12345678");
        session.project_path = Some("/my/project".to_string());
        session.title = Some("My Feature".to_string());

        let history = vec![ChatMessage {
            id: "1".to_string(),
            session_id: "test12345678".to_string(),
            role: MessageRole::User,
            content: "Previous message".to_string(),
            created_at: "2026-01-17T00:00:00Z".to_string(),
            attachments: None,
        }];

        // When has_external_session is true (session resumption)
        let prompt = build_prd_chat_prompt(
            &session,
            &history,
            "Continue working",
            &[],
            true, // Session resumption active
            None,
        );

        // History should be omitted (for token savings)
        assert!(!prompt.contains("Conversation History"));
        assert!(!prompt.contains("Previous message"));

        // But the path reminder should STILL be present
        assert!(prompt.contains("FINAL REMINDER - PRD ONLY, NO CODE"));
        assert!(prompt.contains(".ralph-ui/prds/my-feature-"));
    }

    #[test]
    fn test_build_prd_chat_prompt_no_path_reminder_without_project_path() {
        let session = make_test_session("test");
        // No project_path set

        let history: Vec<ChatMessage> = vec![];
        let prompt = build_prd_chat_prompt(&session, &history, "Create a PRD", &[], false, None);

        // Should NOT contain path reminder since there's no project path
        assert!(!prompt.contains("SYSTEM REQUIREMENT - PRD FILE PATH"));
        // Should also not contain the main plan instruction
        assert!(!prompt.contains("PLAN FILE INSTRUCTION"));
    }

    #[test]
    fn test_get_workflow_phase_empty_history_returns_discovery() {
        let session = make_test_session("test");
        let history: Vec<ChatMessage> = vec![];

        let phase = get_workflow_phase(&session, &history);

        assert_eq!(phase, Some(WorkflowPhase::Discovery));
    }

    #[test]
    fn test_get_workflow_phase_one_assistant_message_returns_discovery() {
        let session = make_test_session("test");
        let history = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "I want to build a game".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
                attachments: None,
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "What kind of game?".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
                attachments: None,
            },
        ];

        let phase = get_workflow_phase(&session, &history);

        // Still in discovery with only 1 assistant message
        assert_eq!(phase, Some(WorkflowPhase::Discovery));
    }

    #[test]
    fn test_get_workflow_phase_two_assistant_messages_exits_discovery() {
        let session = make_test_session("test");
        // Messages that cover all discovery areas: WHAT (problem/build), WHO (users), WHY (because/value), DONE (success/measure)
        let history = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                // Covers: problem, build (WHAT), users (WHO)
                content: "I want to build a game for casual users who need entertainment".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
                attachments: None,
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "What's the motivation behind this?".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
                attachments: None,
            },
            ChatMessage {
                id: "3".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                // Covers: because (WHY), success/measure (DONE)
                content: "Because existing games are too complex. Success would be measured by daily active users and retention".to_string(),
                created_at: "2026-01-17T00:02:00Z".to_string(),
                attachments: None,
            },
            ChatMessage {
                id: "4".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::Assistant,
                content: "Great, I understand the value proposition now".to_string(),
                created_at: "2026-01-17T00:03:00Z".to_string(),
                attachments: None,
            },
        ];

        let phase = get_workflow_phase(&session, &history);

        // After 2 assistant messages AND all areas covered, should exit discovery
        assert_eq!(phase, None);
    }

    #[test]
    fn test_get_workflow_phase_only_user_messages_returns_discovery() {
        let session = make_test_session("test");
        let history = vec![
            ChatMessage {
                id: "1".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "First message".to_string(),
                created_at: "2026-01-17T00:00:00Z".to_string(),
                attachments: None,
            },
            ChatMessage {
                id: "2".to_string(),
                session_id: "test".to_string(),
                role: MessageRole::User,
                content: "Second message".to_string(),
                created_at: "2026-01-17T00:01:00Z".to_string(),
                attachments: None,
            },
        ];

        let phase = get_workflow_phase(&session, &history);

        // No assistant messages yet, should still be in discovery
        assert_eq!(phase, Some(WorkflowPhase::Discovery));
    }
}
