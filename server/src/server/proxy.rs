//! Command proxy handler that routes HTTP requests to Backend commands
//!
//! This implements the Command Proxy Pattern - a single /api/invoke endpoint
//! that routes to existing command functions without modifying them.
//!
//! Command routing is organized into focused sub-modules in the `routes/` directory:
//! - session_routes: Session management commands
//! - task_routes: Task management commands
//! - agent_routes: Agent management commands
//! - git_routes: Git and GitHub commands
//! - ralph_loop_routes: Ralph Loop execution commands
//! - prd_routes: PRD and chat commands
//! - gsd_routes: GSD workflow commands
//! - config_routes: Configuration and misc commands
//! - parallel_routes: Parallel execution commands

use super::events::EventBroadcaster;
use super::routes;
use super::ServerAppState;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use std::sync::Arc;

/// Request body for /api/invoke endpoint
#[derive(Debug, Deserialize)]
pub struct InvokeRequest {
    /// Command name (e.g., "get_sessions", "create_task")
    pub cmd: String,
    /// Command arguments as JSON object
    #[serde(default)]
    pub args: Value,
}

/// Response body for /api/invoke endpoint
#[derive(Debug, Serialize)]
pub struct InvokeResponse {
    /// Whether the command succeeded
    pub success: bool,
    /// Result data (on success)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<Value>,
    /// Error message (on failure)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

/// Error type for invoke handler
pub struct InvokeError {
    status: StatusCode,
    message: String,
}

impl IntoResponse for InvokeError {
    fn into_response(self) -> Response {
        let body = InvokeResponse {
            success: false,
            data: None,
            error: Some(self.message),
        };
        (self.status, Json(body)).into_response()
    }
}

// =============================================================================
// Main Handler
// =============================================================================

/// Main invoke handler - routes commands to their implementations
pub async fn invoke_handler(
    State(state): State<ServerAppState>,
    Json(req): Json<InvokeRequest>,
) -> Result<Json<InvokeResponse>, InvokeError> {
    log::debug!("Invoke command: {} with args: {:?}", req.cmd, req.args);

    let result = routes::route_command(&req.cmd, req.args, &state).await;

    match result {
        Ok(data) => Ok(Json(InvokeResponse {
            success: true,
            data: Some(data),
            error: None,
        })),
        Err(e) => {
            log::warn!("Command {} failed: {}", req.cmd, e);
            Err(InvokeError {
                status: StatusCode::BAD_REQUEST,
                message: e,
            })
        }
    }
}

// =============================================================================
// Server-specific PRD Chat Implementation
// =============================================================================

/// Server-compatible version of send_prd_chat_message that uses EventBroadcaster
/// instead of the old's app_handle for streaming events.
///
/// Uses the shared agent_executor module for unified chat agent execution.
pub async fn send_prd_chat_message_server(
    request: crate::commands::prd_chat::SendMessageRequest,
    broadcaster: &Arc<EventBroadcaster>,
) -> Result<crate::commands::prd_chat::SendMessageResponse, String> {
    use crate::commands::prd_chat::agent_executor::{
        execute_chat_agent, generate_session_title, BroadcastEmitter,
    };
    use crate::file_storage::chat_ops;
    use crate::models::{AgentType, ChatMessage, MessageRole};
    use crate::parsers::structured_output;
    use uuid::Uuid;

    let project_path_obj = Path::new(&request.project_path);

    // Get session
    let session = chat_ops::get_chat_session(project_path_obj, &request.session_id)
        .map_err(|e| format!("Session not found: {}", e))?;

    let now = chrono::Utc::now().to_rfc3339();

    // Validate request (including attachment constraints)
    request.validate()?;

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

    // Get chat history for context
    let history = chat_ops::get_messages_by_session(project_path_obj, &request.session_id)
        .map_err(|e| format!("Failed to get chat history: {}", e))?;

    // Build prompt using the server helper
    let prompt = build_server_chat_prompt(&session, &history, &request.content);

    // Parse agent type
    let agent_type: AgentType = session
        .agent_type
        .parse()
        .map_err(|e| format!("Invalid agent type: {}", e))?;

    // Execute agent using the shared executor with BroadcastEmitter
    // Pass external_session_id to enable session resumption (saves 67-90% tokens)
    let emitter = BroadcastEmitter::new(broadcaster.clone());
    let agent_result = execute_chat_agent(
        &emitter,
        &request.session_id,
        agent_type,
        &prompt,
        session.project_path.as_deref(),
        session.external_session_id.as_deref(),
    )
    .await
    .map_err(|e| format!("Agent execution failed: {}", e))?;

    let response_content = agent_result.content;

    // Store assistant message
    let response_now = chrono::Utc::now().to_rfc3339();
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

    // If we captured a new external session ID, save it for future resume
    if let Some(captured_id) = agent_result.captured_session_id {
        if let Err(e) = chat_ops::update_chat_session_external_id(
            project_path_obj,
            &request.session_id,
            Some(&captured_id),
        ) {
            log::warn!("Failed to save external session ID for resume: {}", e);
        }
    }

    // Update session timestamp
    chat_ops::update_chat_session_timestamp(project_path_obj, &request.session_id, &response_now)
        .map_err(|e| format!("Failed to update session: {}", e))?;

    // Auto-generate title if not set
    if session.title.is_none() {
        let title = generate_session_title(&request.content, session.prd_type.as_deref());
        chat_ops::update_chat_session_title(project_path_obj, &request.session_id, &title).ok();
    }

    // Handle structured mode
    if session.structured_mode {
        let new_items = structured_output::extract_items(&response_content);
        if !new_items.is_empty() {
            let mut structure: crate::models::ExtractedPRDStructure = session
                .extracted_structure
                .as_ref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_default();

            structured_output::merge_items(&mut structure, new_items);

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

    Ok(crate::commands::prd_chat::SendMessageResponse {
        user_message,
        assistant_message,
    })
}

/// Build a chat prompt for server mode
fn build_server_chat_prompt(
    session: &crate::models::ChatSession,
    history: &[crate::models::ChatMessage],
    user_message: &str,
) -> String {
    use crate::models::MessageRole;

    let mut prompt = String::from(
        "You are a helpful AI assistant helping to create a PRD (Product Requirements Document).\n\n",
    );

    if let Some(ref prd_type) = session.prd_type {
        prompt.push_str(&format!("PRD Type: {}\n\n", prd_type));
    }

    // Add conversation history (limited to last 20 messages)
    if !history.is_empty() {
        prompt.push_str("Previous conversation:\n");
        for msg in history.iter().take(20) {
            let role = match msg.role {
                MessageRole::User => "User",
                MessageRole::Assistant => "Assistant",
                MessageRole::System => "System",
            };
            prompt.push_str(&format!("{}: {}\n", role, msg.content));
        }
        prompt.push('\n');
    }

    prompt.push_str(&format!("User: {}\n\nAssistant:", user_message));
    prompt
}

// =============================================================================
// Server-specific Story Regeneration Implementation
// =============================================================================

/// Server-compatible version of regenerate_ralph_prd_stories that uses EventBroadcaster
/// instead of the old's app_handle for streaming events.
pub async fn regenerate_ralph_prd_stories_server(
    request: crate::commands::ralph_loop::RegenerateStoriesRequest,
    broadcaster: &Arc<EventBroadcaster>,
) -> Result<crate::ralph_loop::RalphPrd, String> {
    use crate::commands::prd_chat::agent_executor::{execute_chat_agent, BroadcastEmitter};
    use crate::models::AgentType;
    use crate::ralph_loop::{PrdExecutor, RalphStory};
    use std::fs;

    let project_path = std::path::PathBuf::from(&request.project_path);
    let prds_dir = project_path.join(".ralph-ui").join("prds");

    // Read the existing PRD JSON
    let executor = PrdExecutor::new(&project_path, &request.prd_name);
    let mut prd = executor.read_prd()?;

    // Read the markdown file
    let md_path = prds_dir.join(format!("{}.md", request.prd_name));
    let content = if md_path.exists() {
        fs::read_to_string(&md_path)
            .map_err(|e| format!("Failed to read PRD markdown file: {}", e))?
    } else {
        return Err(
            "No PRD markdown file found. Cannot regenerate stories without source content."
                .to_string(),
        );
    };

    // Parse agent type
    let agent_type: AgentType = request
        .agent_type
        .parse()
        .map_err(|_| format!("Invalid agent type: {}", request.agent_type))?;

    // Build prompt for AI extraction
    let prompt = build_story_extraction_prompt(&content);

    // Execute AI agent to extract stories using BroadcastEmitter
    let emitter = BroadcastEmitter::new(broadcaster.clone());
    let session_id = format!("story-regen-{}", uuid::Uuid::new_v4());

    let result = execute_chat_agent(
        &emitter,
        &session_id,
        agent_type,
        &prompt,
        Some(&request.project_path),
        None, // No session resumption for story regeneration
    )
    .await?;

    // Parse the AI response to extract stories
    let extracted_stories = parse_ai_story_response(&result.content)?;

    if extracted_stories.is_empty() {
        return Err(
            "AI did not extract any valid user stories. The PRD may need manual formatting."
                .to_string(),
        );
    }

    // Replace stories in the PRD, preserving any pass/fail status for matching IDs
    let old_status: std::collections::HashMap<String, bool> = prd
        .stories
        .iter()
        .map(|s| (s.id.clone(), s.passes))
        .collect();

    prd.stories = extracted_stories
        .into_iter()
        .map(|es| {
            let passes = old_status.get(&es.id).copied().unwrap_or(false);
            let acceptance = if es.acceptance_criteria.is_empty() {
                format!("Implement: {}", es.title)
            } else {
                es.acceptance_criteria
                    .iter()
                    .map(|c| format!("- {}", c))
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            let mut story = RalphStory::new(&es.id, &es.title, &acceptance);
            story.passes = passes;
            story
        })
        .collect();

    // Write the updated PRD
    executor.write_prd(&prd)?;

    log::info!(
        "[RalphLoop] Regenerated {} stories using AI for PRD '{}' (server mode)",
        prd.stories.len(),
        request.prd_name
    );

    Ok(prd)
}

/// Build prompt for AI to extract user stories from PRD content
fn build_story_extraction_prompt(prd_content: &str) -> String {
    format!(
        r#"Analyze this PRD document and extract all user stories in a structured format.

## PRD Content:
{}

## Instructions:
1. Identify all user stories, features, or tasks that should be implemented
2. Assign each a unique ID in the format US-X.X (e.g., US-1.1, US-1.2, US-2.1)
3. Extract or create clear acceptance criteria for each story

## Output Format:
Return ONLY a JSON array with no additional text. Each story should have:
- "id": string (US-X.X format)
- "title": string (brief, actionable title)
- "acceptance_criteria": array of strings

Example:
```json
[
  {{
    "id": "US-1.1",
    "title": "User Login",
    "acceptance_criteria": [
      "User can enter email and password",
      "Form validates inputs before submission",
      "Shows error message on invalid credentials"
    ]
  }},
  {{
    "id": "US-1.2",
    "title": "User Registration",
    "acceptance_criteria": [
      "User can create account with email",
      "Password must meet security requirements"
    ]
  }}
]
```

Extract the stories now and return ONLY the JSON array:"#,
        prd_content
    )
}

/// Parse AI response to extract stories
fn parse_ai_story_response(
    response: &str,
) -> Result<Vec<crate::commands::ralph_loop::ExtractedStory>, String> {
    // Try to find JSON array in the response
    let json_start = response.find('[');
    let json_end = response.rfind(']');

    match (json_start, json_end) {
        (Some(start), Some(end)) if start < end => {
            let json_str = &response[start..=end];
            serde_json::from_str::<Vec<crate::commands::ralph_loop::ExtractedStory>>(json_str)
                .map_err(|e| format!("Failed to parse AI response as JSON: {}", e))
        }
        _ => {
            // Try parsing the whole response as JSON
            serde_json::from_str::<Vec<crate::commands::ralph_loop::ExtractedStory>>(
                response.trim(),
            )
            .map_err(|e| format!("No valid JSON array found in AI response: {}", e))
        }
    }
}

// =============================================================================
// Server-specific Ralph Loop Implementation
// =============================================================================
//
// NOTE: This implementation mirrors `start_ralph_loop` in commands/ralph_loop.rs
// with the following differences:
// - Uses EventBroadcaster instead of the old's app_handle for event emission
// - Uses tokio::spawn instead of tokio::spawn
// - Accesses state via ServerAppState instead of the old State<>
// - Skips desktop notifications (server clients handle their own notifications)
//
// If you modify the Ralph loop logic, remember to update both implementations.
// Consider extracting shared logic into a trait-based abstraction if changes
// become frequent.
// =============================================================================

/// Server-compatible version of start_ralph_loop that uses EventBroadcaster
/// instead of the old's app_handle for events.
pub async fn start_ralph_loop_server(
    request: crate::commands::ralph_loop::StartRalphLoopRequest,
    state: &ServerAppState,
) -> Result<String, String> {
    use crate::events::{
        RalphLoopCompletedPayload, RalphLoopErrorPayload, RalphLoopErrorType,
        EVENT_RALPH_LOOP_COMPLETED, EVENT_RALPH_LOOP_ERROR,
    };
    use crate::file_storage::iterations as iteration_storage;
    use crate::models::AgentType;
    use crate::ralph_loop::{
        ErrorStrategy, ExecutionStateSnapshot, FallbackChainConfig, PrdExecutor, PrdMetadata,
        RalphLoopConfig, RalphLoopOrchestrator, RalphLoopState as RalphLoopExecutionState,
        RetryConfig,
    };
    use std::path::PathBuf;

    const HEARTBEAT_INTERVAL_SECS: u64 = 5;

    // Read PRD to get stored execution config
    let project_path_buf = PathBuf::from(&request.project_path);
    let executor = PrdExecutor::new(&project_path_buf, &request.prd_name);
    let prd = executor.read_prd()?;
    let prd_config = prd.execution_config.as_ref();

    // Get global config
    let user_config = state.config_state.get_config().ok();

    log::info!(
        "[start_ralph_loop_server] Config sources: request={}, prd_stored={}, global_config={}",
        "explicit",
        if prd_config.is_some() {
            "present"
        } else {
            "absent"
        },
        if user_config.is_some() {
            "present"
        } else {
            "absent"
        }
    );

    // Parse agent type
    let agent_type = match request.agent_type.to_lowercase().as_str() {
        "claude" => AgentType::Claude,
        "opencode" => AgentType::Opencode,
        "cursor" => AgentType::Cursor,
        "codex" => AgentType::Codex,
        _ => return Err(format!("Unknown agent type: {}", request.agent_type)),
    };

    // Resolve config values with precedence: request > prd > global > default
    let resolved_model = request
        .model
        .clone()
        .or_else(|| prd_config.and_then(|c| c.model.clone()))
        .or_else(|| user_config.as_ref().and_then(|c| c.execution.model.clone()));

    let resolved_max_iterations = request
        .max_iterations
        .or_else(|| prd_config.and_then(|c| c.max_iterations))
        .or_else(|| {
            user_config
                .as_ref()
                .map(|c| c.execution.max_iterations as u32)
        })
        .unwrap_or(50);

    let resolved_max_cost = request
        .max_cost
        .or_else(|| prd_config.and_then(|c| c.max_cost));

    let resolved_run_tests = request
        .run_tests
        .or_else(|| prd_config.and_then(|c| c.run_tests))
        .or_else(|| user_config.as_ref().map(|c| c.validation.run_tests))
        .unwrap_or(true);

    let resolved_run_lint = request
        .run_lint
        .or_else(|| prd_config.and_then(|c| c.run_lint))
        .or_else(|| user_config.as_ref().map(|c| c.validation.run_lint))
        .unwrap_or(true);

    let resolved_use_worktree = request
        .use_worktree
        .or_else(|| prd_config.and_then(|c| c.use_worktree))
        .unwrap_or(true);

    let resolved_agent_timeout = request
        .agent_timeout_secs
        .or_else(|| prd_config.and_then(|c| c.agent_timeout_secs))
        .unwrap_or(0);

    let resolved_template = request
        .template_name
        .clone()
        .or_else(|| prd_config.and_then(|c| c.template_name.clone()))
        .or_else(|| {
            user_config
                .as_ref()
                .and_then(|c| c.templates.default_template.clone())
        });

    let resolved_test_command = request
        .test_command
        .clone()
        .or_else(|| prd_config.and_then(|c| c.test_command.clone()))
        .or_else(|| {
            user_config
                .as_ref()
                .and_then(|c| c.validation.test_command.clone())
        });

    let resolved_lint_command = request
        .lint_command
        .clone()
        .or_else(|| prd_config.and_then(|c| c.lint_command.clone()))
        .or_else(|| {
            user_config
                .as_ref()
                .and_then(|c| c.validation.lint_command.clone())
        });

    let resolved_max_retries = user_config
        .as_ref()
        .map(|c| c.execution.max_retries as u32)
        .unwrap_or(3);

    log::info!(
        "[start_ralph_loop_server] Resolved config: agent={:?}, model={:?}, max_iterations={}, max_cost={:?}, run_tests={}, run_lint={}, use_worktree={}, agent_timeout={}",
        agent_type,
        resolved_model,
        resolved_max_iterations,
        resolved_max_cost,
        resolved_run_tests,
        resolved_run_lint,
        resolved_use_worktree,
        resolved_agent_timeout
    );

    // Get fallback config from user settings
    let fallback_config = user_config.as_ref().and_then(|config| {
        if config.fallback.enabled {
            #[allow(deprecated)]
            let fallback_chain = config
                .fallback
                .fallback_chain
                .clone()
                .map(|chain| {
                    chain
                        .into_iter()
                        .filter_map(|s| match s.to_lowercase().as_str() {
                            "claude" => Some(AgentType::Claude),
                            "opencode" => Some(AgentType::Opencode),
                            "cursor" => Some(AgentType::Cursor),
                            "codex" => Some(AgentType::Codex),
                            _ => None,
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_else(|| {
                    let mut chain = vec![agent_type];
                    #[allow(deprecated)]
                    if let Some(ref fallback_str) = config.fallback.fallback_agent {
                        log::warn!(
                            "[start_ralph_loop_server] DEPRECATED: Config uses 'fallback_agent' field. \
                             Migrating to 'fallback_chain'. Please update your config to use \
                             'fallback_chain' instead."
                        );
                        let legacy_fallback = match fallback_str.to_lowercase().as_str() {
                            "claude" => Some(AgentType::Claude),
                            "opencode" => Some(AgentType::Opencode),
                            "cursor" => Some(AgentType::Cursor),
                            "codex" => Some(AgentType::Codex),
                            _ => None,
                        };
                        if let Some(agent) = legacy_fallback {
                            if agent != agent_type {
                                chain.push(agent);
                            }
                        }
                    }
                    chain
                });

            Some(FallbackChainConfig {
                fallback_chain,
                test_primary_recovery: config.fallback.test_primary_recovery.unwrap_or(true),
                recovery_test_interval: config.fallback.recovery_test_interval.unwrap_or(5),
                base_backoff_ms: config.fallback.base_backoff_ms,
                max_backoff_ms: config.fallback.max_backoff_ms,
                enabled: true,
            })
        } else {
            None
        }
    });

    // Convert ErrorStrategyConfig from user settings to ErrorStrategy
    let error_strategy = user_config
        .and_then(|c| c.fallback.error_strategy)
        .map(|es| {
            use crate::config::ErrorStrategyConfig;
            match es {
                ErrorStrategyConfig::Retry {
                    max_attempts,
                    backoff_ms,
                } => ErrorStrategy::Retry {
                    max_attempts,
                    backoff_ms,
                },
                ErrorStrategyConfig::Skip => ErrorStrategy::Skip,
                ErrorStrategyConfig::Abort => ErrorStrategy::Abort,
            }
        })
        .unwrap_or_default();

    // Build RetryConfig using resolved max_retries from settings
    let retry_config = RetryConfig {
        max_attempts: resolved_max_retries,
        ..RetryConfig::default()
    };

    // Get provider env vars for Claude agent
    let env_vars = crate::commands::providers::get_provider_env_vars(&state.config_state).ok();

    // Build RalphLoopConfig
    let config = RalphLoopConfig {
        project_path: PathBuf::from(&request.project_path),
        agent_type,
        model: resolved_model,
        max_iterations: resolved_max_iterations,
        run_tests: resolved_run_tests,
        run_lint: resolved_run_lint,
        branch: request.branch,
        completion_promise: request.completion_promise,
        max_cost: resolved_max_cost,
        use_worktree: resolved_use_worktree,
        retry_config,
        error_strategy,
        fallback_config,
        agent_timeout_secs: resolved_agent_timeout,
        prd_name: request.prd_name.clone(),
        template_name: resolved_template,
        test_command: resolved_test_command,
        lint_command: resolved_lint_command,
        env_vars,
    };

    // Create orchestrator
    let mut orchestrator = RalphLoopOrchestrator::new(config.clone());
    let execution_id = orchestrator.execution_id().to_string();

    // Get shared snapshots Arc and pass to orchestrator
    let snapshots_arc = state.ralph_loop_state.snapshots_arc();
    orchestrator.set_snapshot_store(snapshots_arc.clone());

    // Initialize snapshot with idle state
    {
        use crate::ralph_loop::ExecutionSnapshot;
        let mut snapshots = snapshots_arc
            .lock()
            .map_err(|e| format!("Snapshot lock error: {}", e))?;
        snapshots.insert(
            execution_id.clone(),
            ExecutionSnapshot {
                state: Some(RalphLoopExecutionState::Idle),
                metrics: None,
                current_agent_id: None,
                worktree_path: None,
                project_path: Some(request.project_path.clone()),
            },
        );
    }

    // Update PRD metadata with current execution ID
    let mut prd = prd;
    if let Some(ref mut meta) = prd.metadata {
        meta.last_execution_id = Some(execution_id.clone());
        meta.updated_at = Some(chrono::Utc::now().to_rfc3339());
    } else {
        prd.metadata = Some(PrdMetadata {
            last_execution_id: Some(execution_id.clone()),
            created_at: Some(chrono::Utc::now().to_rfc3339()),
            updated_at: None,
            source_chat_id: None,
            total_iterations: 0,
            last_worktree_path: None,
        });
    }

    orchestrator.initialize(&prd)?;

    // Save initial execution state for crash recovery
    {
        let initial_state = ExecutionStateSnapshot {
            execution_id: execution_id.clone(),
            state: serde_json::to_string(&RalphLoopExecutionState::Idle).unwrap_or_default(),
            last_heartbeat: chrono::Utc::now().to_rfc3339(),
        };
        iteration_storage::save_execution_state(&project_path_buf, &initial_state)
            .map_err(|e| format!("Failed to save initial execution state: {}", e))?;
    }

    // Store orchestrator in state
    let orchestrator_arc = Arc::new(tokio::sync::Mutex::new(orchestrator));
    state
        .ralph_loop_state
        .insert_execution(execution_id.clone(), orchestrator_arc.clone())?;

    // Clone the agent manager Arc for the spawned task
    let agent_manager_arc = state.agent_manager.clone();

    log::info!(
        "[RalphLoop] Spawning background task for execution {} (server mode)",
        execution_id
    );

    // Clone for heartbeat task
    let execution_id_for_heartbeat = execution_id.clone();
    let project_path_for_heartbeat = project_path_buf.clone();
    let orchestrator_arc_for_heartbeat = orchestrator_arc.clone();

    // Spawn heartbeat task
    tokio::spawn(async move {
        let mut interval =
            tokio::time::interval(std::time::Duration::from_secs(HEARTBEAT_INTERVAL_SECS));

        loop {
            interval.tick().await;

            let is_running = {
                let orchestrator = orchestrator_arc_for_heartbeat.lock().await;
                matches!(
                    orchestrator.state(),
                    RalphLoopExecutionState::Running { .. }
                        | RalphLoopExecutionState::Retrying { .. }
                )
            };

            if !is_running {
                log::info!(
                    "[Heartbeat] Execution {} no longer running, stopping heartbeat",
                    execution_id_for_heartbeat
                );
                break;
            }

            let heartbeat = chrono::Utc::now().to_rfc3339();
            if let Err(e) = iteration_storage::update_heartbeat(
                &project_path_for_heartbeat,
                &execution_id_for_heartbeat,
                &heartbeat,
            ) {
                log::warn!(
                    "[Heartbeat] Failed to update heartbeat for {}: {}",
                    execution_id_for_heartbeat,
                    e
                );
            }
        }
    });

    // Clone for main loop task
    let execution_id_for_loop = execution_id.clone();
    let project_path_for_loop = project_path_buf.clone();
    let prd_name_for_loop = request.prd_name.clone();
    let broadcaster = state.broadcaster.clone();

    tokio::spawn(async move {
        log::info!(
            "[RalphLoop] Background task started for {} (server mode)",
            execution_id_for_loop
        );

        let mut orchestrator = orchestrator_arc.lock().await;
        let result = orchestrator.run(agent_manager_arc).await;

        // Clean up execution state from file storage
        if let Err(e) = iteration_storage::delete_execution_state(
            &project_path_for_loop,
            &execution_id_for_loop,
        ) {
            log::warn!(
                "[RalphLoop] Failed to delete execution state for {}: {}",
                execution_id_for_loop,
                e
            );
        }

        match result {
            Ok(metrics) => {
                log::info!(
                    "[RalphLoop] Loop {} completed: {} iterations, ${:.2} total cost (server mode)",
                    execution_id_for_loop,
                    metrics.total_iterations,
                    metrics.total_cost
                );

                let final_state = orchestrator.state().clone();

                match &final_state {
                    RalphLoopExecutionState::Completed { .. } => {
                        // Emit loop completed event via broadcaster
                        let payload = RalphLoopCompletedPayload {
                            execution_id: execution_id_for_loop.clone(),
                            prd_name: prd_name_for_loop.clone(),
                            total_iterations: metrics.total_iterations,
                            completed_stories: metrics.stories_completed,
                            total_stories: metrics.stories_completed + metrics.stories_remaining,
                            duration_secs: metrics.total_duration_secs,
                            total_cost: metrics.total_cost,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        };
                        broadcaster.broadcast(EVENT_RALPH_LOOP_COMPLETED, payload);
                    }
                    RalphLoopExecutionState::Failed { iteration, reason } => {
                        let error_type = if reason.contains("Max iterations") {
                            RalphLoopErrorType::MaxIterations
                        } else if reason.contains("Max cost") {
                            RalphLoopErrorType::MaxCost
                        } else {
                            RalphLoopErrorType::Unknown
                        };

                        let (stories_remaining, total_stories) =
                            if error_type == RalphLoopErrorType::MaxIterations {
                                (
                                    Some(metrics.stories_remaining),
                                    Some(metrics.stories_completed + metrics.stories_remaining),
                                )
                            } else {
                                (None, None)
                            };

                        let payload = RalphLoopErrorPayload {
                            execution_id: execution_id_for_loop.clone(),
                            prd_name: prd_name_for_loop.clone(),
                            error_type,
                            message: reason.clone(),
                            iteration: *iteration,
                            stories_remaining,
                            total_stories,
                            timestamp: chrono::Utc::now().to_rfc3339(),
                        };
                        broadcaster.broadcast(EVENT_RALPH_LOOP_ERROR, payload);
                    }
                    RalphLoopExecutionState::Cancelled { iteration } => {
                        log::info!(
                            "[RalphLoop] Loop {} was cancelled at iteration {} (server mode)",
                            execution_id_for_loop,
                            iteration
                        );
                    }
                    _ => {
                        log::warn!(
                            "[RalphLoop] Loop {} ended with unexpected state: {:?} (server mode)",
                            execution_id_for_loop,
                            final_state
                        );
                    }
                }
            }
            Err(e) => {
                log::error!(
                    "[RalphLoop] Loop {} failed: {} (server mode)",
                    execution_id_for_loop,
                    e
                );

                let metrics = orchestrator.metrics();
                let iteration = metrics.total_iterations;

                let error_str = e.to_lowercase();
                let error_type = if error_str.contains("rate limit")
                    || error_str.contains("429")
                    || error_str.contains("too many requests")
                {
                    RalphLoopErrorType::RateLimit
                } else if error_str.contains("max iterations") {
                    RalphLoopErrorType::MaxIterations
                } else if error_str.contains("max cost") {
                    RalphLoopErrorType::MaxCost
                } else if error_str.contains("timeout") || error_str.contains("timed out") {
                    RalphLoopErrorType::Timeout
                } else if error_str.contains("parse")
                    || error_str.contains("json")
                    || error_str.contains("deserialize")
                {
                    RalphLoopErrorType::ParseError
                } else if error_str.contains("conflict") || error_str.contains("merge") {
                    RalphLoopErrorType::GitConflict
                } else if error_str.contains("agent")
                    || error_str.contains("exit")
                    || error_str.contains("spawn")
                    || error_str.contains("crash")
                {
                    RalphLoopErrorType::AgentCrash
                } else {
                    RalphLoopErrorType::Unknown
                };

                let (stories_remaining, total_stories) =
                    if error_type == RalphLoopErrorType::MaxIterations {
                        (
                            Some(metrics.stories_remaining),
                            Some(metrics.stories_completed + metrics.stories_remaining),
                        )
                    } else {
                        (None, None)
                    };

                let payload = RalphLoopErrorPayload {
                    execution_id: execution_id_for_loop.clone(),
                    prd_name: prd_name_for_loop.clone(),
                    error_type,
                    message: e,
                    iteration,
                    stories_remaining,
                    total_stories,
                    timestamp: chrono::Utc::now().to_rfc3339(),
                };
                broadcaster.broadcast(EVENT_RALPH_LOOP_ERROR, payload);
            }
        }
    });

    Ok(execution_id)
}

/// Server-compatible version of stop_ralph_loop
pub async fn stop_ralph_loop_server(
    execution_id: String,
    state: &ServerAppState,
) -> Result<(), String> {
    use crate::ralph_loop::RalphLoopOrchestrator;

    let orchestrator_arc = state.ralph_loop_state.get_execution(&execution_id)?;

    if let Some(orchestrator_arc) = orchestrator_arc {
        let mut orchestrator: tokio::sync::MutexGuard<'_, RalphLoopOrchestrator> =
            orchestrator_arc.lock().await;
        orchestrator.cancel();
        Ok(())
    } else {
        Err(format!("No execution found with ID: {}", execution_id))
    }
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    /// Extract a required argument from JSON args (for tests)
    fn get_arg<T: serde::de::DeserializeOwned>(args: &Value, name: &str) -> Result<T, String> {
        serde_json::from_value(
            args.get(name)
                .ok_or_else(|| format!("Missing argument: {}", name))?
                .clone(),
        )
        .map_err(|e| format!("Invalid argument {}: {}", name, e))
    }

    /// Extract an optional argument from JSON args (for tests)
    fn get_opt_arg<T: serde::de::DeserializeOwned>(
        args: &Value,
        name: &str,
    ) -> Result<Option<T>, String> {
        match args.get(name) {
            Some(v) if !v.is_null() => serde_json::from_value(v.clone())
                .map(Some)
                .map_err(|e| format!("Invalid argument {}: {}", name, e)),
            _ => Ok(None),
        }
    }

    #[test]
    fn test_invoke_request_deserialization() {
        let json = r#"{"cmd": "get_sessions", "args": {"projectPath": "/tmp/test"}}"#;
        let req: InvokeRequest = serde_json::from_str(json).unwrap();
        assert_eq!(req.cmd, "get_sessions");
        assert_eq!(req.args["projectPath"], "/tmp/test");
    }

    #[test]
    fn test_invoke_response_serialization() {
        let resp = InvokeResponse {
            success: true,
            data: Some(serde_json::json!({"count": 5})),
            error: None,
        };
        let json = serde_json::to_string(&resp).unwrap();
        assert!(json.contains("\"success\":true"));
        assert!(json.contains("\"count\":5"));
        assert!(!json.contains("error"));
    }

    #[test]
    fn test_get_arg_success() {
        let args = serde_json::json!({"name": "test", "count": 42});
        let name: String = get_arg(&args, "name").unwrap();
        let count: i32 = get_arg(&args, "count").unwrap();
        assert_eq!(name, "test");
        assert_eq!(count, 42);
    }

    #[test]
    fn test_get_arg_missing() {
        let args = serde_json::json!({"name": "test"});
        let result: Result<i32, String> = get_arg(&args, "missing");
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("Missing argument"));
    }

    #[test]
    fn test_get_opt_arg() {
        let args = serde_json::json!({"name": "test"});
        let name: Option<String> = get_opt_arg(&args, "name").unwrap();
        let missing: Option<String> = get_opt_arg(&args, "missing").unwrap();
        assert_eq!(name, Some("test".to_string()));
        assert_eq!(missing, None);
    }

    // Note: generate_session_title tests are now in agent_executor module
}
