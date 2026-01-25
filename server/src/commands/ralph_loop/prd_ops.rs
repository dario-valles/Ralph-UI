//! PRD CRUD operations: init, get, update, delete

use crate::ralph_loop::{
    LoopConfig, PrdExecutionConfig, PrdExecutor, PrdStatus, ProgressTracker, ProjectConfig,
    PromptBuilder, RalphConfig, RalphLoopConfig, RalphPrd, RalphStory,
};
use crate::utils::{prds_dir, to_path_buf};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

use super::helpers::RalphFiles;
use super::story_ops::RalphStoryInput;

// ============================================================================
// Request/Response Types
// ============================================================================

/// Request to initialize a Ralph PRD
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InitRalphPrdRequest {
    /// Project path
    pub project_path: String,
    /// PRD title
    pub title: String,
    /// PRD description
    pub description: Option<String>,
    /// Branch name
    pub branch: String,
    /// Stories to add
    pub stories: Vec<RalphStoryInput>,
    /// Optional execution configuration to store with the PRD
    pub execution_config: Option<PrdExecutionConfig>,
}

/// Request to convert a file-based PRD to Ralph format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConvertPrdFileToRalphRequest {
    /// Project path
    pub project_path: String,
    /// PRD filename (without extension, e.g., "new-feature-prd-abc123")
    pub prd_name: String,
    /// Branch name to use
    pub branch: String,
    /// Agent type to use (claude, opencode, cursor, codex)
    pub agent_type: Option<String>,
    /// Model to use (e.g., "claude-sonnet-4-5")
    pub model: Option<String>,
    /// Maximum iterations (default: 50)
    pub max_iterations: Option<u32>,
    /// Maximum cost limit in dollars
    pub max_cost: Option<f64>,
    /// Whether to run tests (default: true)
    pub run_tests: Option<bool>,
    /// Whether to run lint (default: true)
    pub run_lint: Option<bool>,
    /// Whether to use a worktree for isolation
    pub use_worktree: Option<bool>,
    /// Template name to use for prompt generation (US-014)
    pub template_name: Option<String>,
}

/// Request to regenerate acceptance criteria for an existing Ralph PRD
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegenerateAcceptanceRequest {
    /// Project path
    pub project_path: String,
    /// PRD name (without .json extension)
    pub prd_name: String,
}

/// Request to regenerate stories using AI for an existing Ralph PRD
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegenerateStoriesRequest {
    /// Project path
    pub project_path: String,
    /// PRD name (without .json extension)
    pub prd_name: String,
    /// Agent type to use for extraction (claude, opencode, etc.)
    pub agent_type: String,
    /// Optional model override
    pub model: Option<String>,
}

/// Story extracted by AI
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedStory {
    pub id: String,
    pub title: String,
    pub acceptance_criteria: Vec<String>,
}

// ============================================================================
// PRD Operations
// ============================================================================

/// Initialize a Ralph PRD at .ralph-ui/prds/{prd_name}.json
pub fn init_ralph_prd(request: InitRalphPrdRequest, prd_name: String) -> Result<RalphPrd, String> {
    let project_path = PathBuf::from(&request.project_path);
    let executor = PrdExecutor::new(&project_path, &prd_name);

    // Validate execution config if provided
    if let Some(ref exec_config) = request.execution_config {
        exec_config.validate()?;
        log::info!(
            "[init_ralph_prd] PRD '{}' includes stored execution config: agent={:?}, model={:?}, max_iterations={:?}",
            prd_name,
            exec_config.agent_type,
            exec_config.model,
            exec_config.max_iterations
        );
    } else {
        log::info!(
            "[init_ralph_prd] PRD '{}' has no stored execution config - will use global config at execution time",
            prd_name
        );
    }

    let mut prd = RalphPrd::new(&request.title, &request.branch);
    prd.description = request.description;
    prd.execution_config = request.execution_config.clone();

    for (index, story_input) in request.stories.iter().enumerate() {
        let mut story =
            RalphStory::new(&story_input.id, &story_input.title, &story_input.acceptance);
        story.description = story_input.description.clone();
        story.priority = story_input.priority.unwrap_or(index as u32);
        story.dependencies = story_input.dependencies.clone().unwrap_or_default();
        story.tags = story_input.tags.clone().unwrap_or_default();
        story.effort = story_input.effort.clone();
        prd.add_story(story);
    }

    executor.write_prd(&prd)?;

    // Also initialize progress.txt
    let tracker = ProgressTracker::new(&project_path, &prd_name);
    tracker.initialize()?;

    // Generate prompt.md - use execution config settings if provided
    let prompt_builder = PromptBuilder::new(&project_path, &prd_name);
    let exec_config = request.execution_config.as_ref();
    let config = RalphLoopConfig {
        project_path: project_path.clone(),
        prd_name: prd_name.clone(),
        run_tests: exec_config.and_then(|c| c.run_tests).unwrap_or(true),
        run_lint: exec_config.and_then(|c| c.run_lint).unwrap_or(true),
        template_name: exec_config.and_then(|c| c.template_name.clone()),
        ..Default::default()
    };
    prompt_builder.generate_prompt(&config)?;

    Ok(prd)
}

/// Find the newest PRD by checking main project and all worktrees.
///
/// Returns the PRD from whichever location has the most recently modified file.
/// This ensures correct data is shown after app restart even if a worktree
/// execution is ongoing.
pub(crate) fn find_newest_prd(
    project_path: &std::path::Path,
    prd_name: &str,
) -> Result<RalphPrd, String> {
    use std::time::SystemTime;

    let main_executor = PrdExecutor::new(project_path, prd_name);
    let main_prd_path = project_path
        .join(".ralph-ui")
        .join("prds")
        .join(format!("{}.json", prd_name));
    let main_modified = main_prd_path
        .metadata()
        .ok()
        .and_then(|m| m.modified().ok());

    let worktrees_dir = project_path.join(".worktrees");
    let mut best_prd: Option<RalphPrd> = None;
    let mut best_modified: Option<SystemTime> = main_modified;

    if worktrees_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&worktrees_dir) {
            for entry in entries.flatten() {
                let worktree_path = entry.path();
                if !worktree_path.is_dir() {
                    continue;
                }

                let worktree_prd_path = worktree_path
                    .join(".ralph-ui")
                    .join("prds")
                    .join(format!("{}.json", prd_name));

                let modified = worktree_prd_path
                    .metadata()
                    .ok()
                    .and_then(|m| m.modified().ok());

                let is_newer = match (modified, best_modified) {
                    (Some(m), Some(best)) => m > best,
                    (Some(_), None) => true,
                    _ => false,
                };

                if is_newer {
                    let worktree_executor = PrdExecutor::new(&worktree_path, prd_name);
                    if let Ok(prd) = worktree_executor.read_prd() {
                        log::debug!(
                            "[find_newest_prd] Found newer PRD in worktree {:?}",
                            worktree_path
                        );
                        best_prd = Some(prd);
                        best_modified = modified;
                    }
                }
            }
        }
    }

    match best_prd {
        Some(prd) => Ok(prd),
        None => main_executor.read_prd(),
    }
}

/// Read the Ralph PRD from .ralph-ui/prds/{prd_name}.json
///
/// This command checks both the main project and any existing worktrees,
/// returning the PRD from whichever has newer data. This ensures correct
/// data is shown after app restart even if a worktree execution is ongoing.
pub fn get_ralph_prd(project_path: String, prd_name: String) -> Result<RalphPrd, String> {
    find_newest_prd(&to_path_buf(&project_path), &prd_name)
}

/// Get the status of the Ralph PRD
///
/// This command checks both the main project and any existing worktrees,
/// returning status from whichever has newer data. This ensures correct
/// status is shown after app restart even if a worktree execution is ongoing.
pub fn get_ralph_prd_status(project_path: String, prd_name: String) -> Result<PrdStatus, String> {
    let project_path_buf = to_path_buf(&project_path);
    let prd = find_newest_prd(&project_path_buf, &prd_name)?;
    let executor = PrdExecutor::new(&project_path_buf, &prd_name);
    Ok(executor.get_status(&prd))
}

/// Check if a project has Ralph loop files
pub fn has_ralph_files(project_path: String) -> bool {
    let prds_dir = prds_dir(&project_path);

    // Check if any .json files exist in the prds directory
    if prds_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&prds_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.extension().map(|e| e == "json").unwrap_or(false) {
                    return true;
                }
            }
        }
    }

    false
}

/// Get all Ralph files for a project
pub fn get_ralph_files(project_path: String) -> Result<RalphFiles, String> {
    let prds_dir = prds_dir(&project_path);

    // Check new .ralph-ui/prds/ directory for any PRD JSON files
    let mut has_prd = false;
    let mut has_progress = false;
    let mut has_prompt = false;
    let mut prd_names: Vec<String> = Vec::new();

    if prds_dir.exists() {
        if let Ok(entries) = std::fs::read_dir(&prds_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if let Some(ext) = path.extension() {
                    if ext == "json" {
                        has_prd = true;
                        if let Some(stem) = path.file_stem() {
                            prd_names.push(stem.to_string_lossy().to_string());
                        }
                    }
                }
                // Check for progress and prompt files
                if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                    if name.ends_with("-progress.txt") {
                        has_progress = true;
                    }
                    if name.ends_with("-prompt.md") {
                        has_prompt = true;
                    }
                }
            }
        }
    }

    // Config is at .ralph-ui/config.yaml
    let config_path = crate::utils::config_path(&project_path);

    Ok(RalphFiles {
        has_prd,
        has_progress,
        has_prompt,
        has_config: config_path.exists(),
        prd_path: prds_dir.to_string_lossy().to_string(),
        progress_path: prds_dir.to_string_lossy().to_string(),
        prompt_path: prds_dir.to_string_lossy().to_string(),
        config_path: config_path.to_string_lossy().to_string(),
        prd_names,
    })
}

/// Convert a file-based PRD (from .ralph-ui/prds/) to Ralph loop format
///
/// This reads a markdown PRD file and its associated structure JSON (if any),
/// then creates the Ralph loop files (prd.json, progress.txt, config.yaml, prompt.md).
/// Execution settings from the request are stored in the PRD JSON for future executions.
pub fn convert_prd_file_to_ralph(request: ConvertPrdFileToRalphRequest) -> Result<RalphPrd, String> {
    use std::fs;

    let project_path = PathBuf::from(&request.project_path);
    let prds_dir = project_path.join(".ralph-ui").join("prds");

    // Read the markdown file
    let md_path = prds_dir.join(format!("{}.md", request.prd_name));
    let content = fs::read_to_string(&md_path)
        .map_err(|e| format!("Failed to read PRD file {:?}: {}", md_path, e))?;

    // Extract title from first # heading or use prd_name
    let title = content
        .lines()
        .find(|line| line.starts_with("# "))
        .map(|line| line.trim_start_matches("# ").trim().to_string())
        .unwrap_or_else(|| request.prd_name.clone());

    // Try to read associated structure JSON
    let structure_path = prds_dir.join(format!("{}-structure.json", request.prd_name));
    let structure: Option<crate::models::ExtractedPRDStructure> = if structure_path.exists() {
        fs::read_to_string(&structure_path)
            .ok()
            .and_then(|json| serde_json::from_str(&json).ok())
    } else {
        None
    };

    // Create execution config from request parameters
    let execution_config = PrdExecutionConfig {
        agent_type: request.agent_type.clone(),
        model: request.model.clone(),
        max_iterations: request.max_iterations,
        max_cost: request.max_cost,
        run_tests: request.run_tests,
        run_lint: request.run_lint,
        use_worktree: request.use_worktree,
        template_name: request.template_name.clone(),
        ..Default::default()
    };

    // Validate the execution config
    execution_config.validate()?;

    // Log config storage
    if execution_config.has_any_fields() {
        log::info!(
            "[convert_prd_file_to_ralph] PRD '{}' storing execution config: agent={:?}, model={:?}, max_iterations={:?}",
            request.prd_name,
            execution_config.agent_type,
            execution_config.model,
            execution_config.max_iterations
        );
    }

    // Create Ralph PRD with stored execution config
    let mut ralph_prd = RalphPrd::new(&title, &request.branch);
    ralph_prd.execution_config = if execution_config.has_any_fields() {
        Some(execution_config)
    } else {
        None
    };

    // If we have extracted structure, use it
    if let Some(structure) = structure {
        for (index, task) in structure.tasks.iter().enumerate() {
            let mut story = RalphStory::new(
                &task.id,
                &task.title,
                task.acceptance_criteria
                    .as_ref()
                    .map(|v| v.join("\n"))
                    .unwrap_or_else(|| task.description.clone()),
            );
            story.description = Some(task.description.clone());
            story.priority = task.priority.map(|p| p as u32).unwrap_or(index as u32);
            story.dependencies = task.dependencies.clone().unwrap_or_default();
            story.tags = task.tags.clone().unwrap_or_default();
            ralph_prd.add_story(story);
        }
    } else {
        // Parse markdown to extract tasks with acceptance criteria
        let stories = parse_markdown_stories_with_acceptance(&content);

        for story in stories {
            ralph_prd.add_story(story);
        }

        // If STILL no tasks found, create a single task from the PRD
        if ralph_prd.stories.is_empty() {
            let story = RalphStory::new(
                "task-1",
                &title,
                "Complete the requirements specified in the PRD",
            );
            ralph_prd.add_story(story);
        }
    }

    // Use new multi-PRD path format
    let executor = PrdExecutor::new(&project_path, &request.prd_name);
    executor.write_prd(&ralph_prd)?;

    // Initialize progress
    let tracker = ProgressTracker::new(&project_path, &request.prd_name);
    tracker.initialize()?;

    // Create and write config.yaml
    // Note: config.yaml stays in .ralph-ui/prds/ for now as it's per-PRD
    let config_path = prds_dir.join(format!("{}-config.yaml", request.prd_name));
    let ralph_config = RalphConfig {
        project: ProjectConfig {
            name: Some(title.clone()),
            test_command: None,
            lint_command: None,
            build_command: None,
        },
        ralph: LoopConfig {
            max_iterations: request.max_iterations.unwrap_or(50),
            max_cost: request.max_cost,
            agent: request
                .agent_type
                .clone()
                .unwrap_or_else(|| "claude".to_string()),
            model: request.model.clone(),
            completion_promise: "<promise>COMPLETE</promise>".to_string(),
        },
    };
    let config_yaml =
        serde_yaml::to_string(&ralph_config).map_err(|e| format!("Failed to serialize config: {}", e))?;
    fs::write(&config_path, config_yaml).map_err(|e| format!("Failed to write config: {}", e))?;

    // Generate prompt.md
    let prompt_builder = PromptBuilder::new(&project_path, &request.prd_name);
    let loop_config = RalphLoopConfig {
        project_path: project_path.clone(),
        run_tests: request.run_tests.unwrap_or(true),
        run_lint: request.run_lint.unwrap_or(true),
        max_iterations: request.max_iterations.unwrap_or(50),
        max_cost: request.max_cost,
        model: request.model,
        prd_name: request.prd_name,
        template_name: request.template_name,
        ..Default::default()
    };
    prompt_builder.generate_prompt(&loop_config)?;

    Ok(ralph_prd)
}

/// Regenerate acceptance criteria for stories in a Ralph PRD.
///
/// This reads the PRD markdown file and re-extracts acceptance criteria for each story,
/// updating the PRD JSON while preserving pass/fail status.
pub fn regenerate_ralph_prd_acceptance(
    request: RegenerateAcceptanceRequest,
) -> Result<RalphPrd, String> {
    use std::fs;

    let project_path = PathBuf::from(&request.project_path);
    let prds_dir = project_path.join(".ralph-ui").join("prds");

    // Read the existing PRD JSON
    let executor = PrdExecutor::new(&project_path, &request.prd_name);
    let mut prd = executor.read_prd()?;

    // Read the markdown file for content
    let md_path = prds_dir.join(format!("{}.md", request.prd_name));
    let content = if md_path.exists() {
        fs::read_to_string(&md_path).map_err(|e| format!("Failed to read PRD markdown file: {}", e))?
    } else {
        // No markdown file - use PRD description as context
        prd.description.clone().unwrap_or_default()
    };

    // Parse the markdown to extract stories with acceptance criteria
    let parsed_stories = parse_markdown_stories_with_acceptance(&content);

    // Create a map of parsed stories by ID for quick lookup
    let parsed_map: std::collections::HashMap<String, &RalphStory> =
        parsed_stories.iter().map(|s| (s.id.clone(), s)).collect();

    // Update each story's acceptance criteria while preserving pass/fail status
    for story in prd.stories.iter_mut() {
        if let Some(parsed) = parsed_map.get(&story.id) {
            // Only update if the parsed acceptance is different and better
            let current_is_just_title =
                story.acceptance == story.title || story.acceptance.is_empty();
            let parsed_is_better = !parsed.acceptance.is_empty()
                && parsed.acceptance != parsed.title
                && !parsed.acceptance.starts_with("Implement:");

            if current_is_just_title || parsed_is_better {
                story.acceptance = parsed.acceptance.clone();
            }
        }
    }

    // Write the updated PRD back
    executor.write_prd(&prd)?;

    log::info!(
        "[RalphLoop] Regenerated acceptance criteria for PRD '{}' ({} stories)",
        request.prd_name,
        prd.stories.len()
    );

    Ok(prd)
}

/// Regenerate stories using AI to properly extract user stories from PRD markdown.
///
/// This is useful when the initial story extraction created generic tasks like
/// "Problem Statement", "Solution" instead of proper US-X.X user stories.
pub async fn regenerate_ralph_prd_stories(
    app_handle: std::sync::Arc<crate::server::EventBroadcaster>,
    request: RegenerateStoriesRequest,
) -> Result<RalphPrd, String> {
    use crate::commands::prd_chat::agent_executor::{execute_chat_agent, BroadcastEmitter};
    use crate::models::AgentType;
    use std::fs;

    let project_path = PathBuf::from(&request.project_path);
    let prds_dir = project_path.join(".ralph-ui").join("prds");

    // Read the existing PRD JSON
    let executor = PrdExecutor::new(&project_path, &request.prd_name);
    let mut prd = executor.read_prd()?;

    // Read the markdown file
    let md_path = prds_dir.join(format!("{}.md", request.prd_name));
    let content = if md_path.exists() {
        fs::read_to_string(&md_path).map_err(|e| format!("Failed to read PRD markdown file: {}", e))?
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

    // Execute AI agent to extract stories
    let emitter = BroadcastEmitter::new(app_handle.clone());
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
    let old_status: std::collections::HashMap<String, bool> =
        prd.stories.iter().map(|s| (s.id.clone(), s.passes)).collect();

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
        "[RalphLoop] Regenerated {} stories using AI for PRD '{}'",
        prd.stories.len(),
        request.prd_name
    );

    Ok(prd)
}

// ============================================================================
// Helper Functions for Markdown Parsing
// ============================================================================

/// Parse markdown content to extract user stories with their acceptance criteria.
///
/// This function handles two markdown formats:
/// 1. User Story format with "#### US-XXX: Title" headers followed by "**Acceptance Criteria**:" sections
/// 2. Generic headers as fallback
///
/// Returns a vector of RalphStory objects with proper acceptance criteria extracted.
/// Check if a line is a user story header (markdown or bold format)
/// Returns (is_story, id, title) if matched
pub(crate) fn parse_story_header(line: &str) -> Option<(String, String)> {
    let trimmed = line.trim();

    // Pattern 1: Markdown headers like "#### US-1.1: Title" or "### US-1.1: Title"
    if trimmed.contains("#### US-")
        || trimmed.contains("### US-")
        || trimmed.contains("#### T-")
        || trimmed.contains("### T-")
    {
        let header_marker = if trimmed.contains("#### ") {
            "#### "
        } else {
            "### "
        };
        if let Some(start_idx) = trimmed.find(header_marker) {
            let text = &trimmed[start_idx + header_marker.len()..];
            return extract_id_and_title(text);
        }
    }

    // Pattern 2: Bold format like "**US-1.1: Title**" or "**US-1.1:** Title"
    // This handles both "**US-1.1: Title**" and "**US-1.1:** Title" formats
    if trimmed.starts_with("**US-") || trimmed.starts_with("**T-") {
        // Remove leading **
        let without_prefix = trimmed.trim_start_matches("**");

        // Check for ":**" pattern FIRST (more specific)
        // This handles "**US-1.1:** Title" where only the ID is bold
        // Note: ":**" contains "**", so we must check this pattern first
        if let Some(colon_star_pos) = without_prefix.find(":**") {
            let id = without_prefix[..colon_star_pos].trim().to_string();
            let title = without_prefix[colon_star_pos + 3..].trim().to_string();
            if !id.is_empty() && !title.is_empty() {
                return Some((id, title));
            } else if !id.is_empty() {
                return Some((id.clone(), id));
            }
        } else if let Some(end_bold_pos) = without_prefix.find("**") {
            // Case: "**US-1.1: Title**" - ID and title both in bold
            let inside_bold = &without_prefix[..end_bold_pos];
            return extract_id_and_title(inside_bold);
        }
    }

    None
}

/// Extract ID and title from a string like "US-1.1: Some Title"
fn extract_id_and_title(text: &str) -> Option<(String, String)> {
    if let Some((id_part, title_part)) = text.split_once(':') {
        let id = id_part.trim().to_string();
        let title = title_part.trim().trim_end_matches("**").trim().to_string();
        if !id.is_empty() && !title.is_empty() {
            return Some((id, title));
        } else if !id.is_empty() {
            return Some((id.clone(), id));
        }
    } else {
        // Fallback: first word is ID, rest is title
        let parts: Vec<&str> = text.split_whitespace().collect();
        if !parts.is_empty() {
            return Some((parts[0].to_string(), text.to_string()));
        }
    }
    None
}

/// Check if a line is any kind of user story header (for stopping condition)
pub(crate) fn is_story_header(line: &str) -> bool {
    parse_story_header(line).is_some()
}

pub(crate) fn parse_markdown_stories_with_acceptance(content: &str) -> Vec<RalphStory> {
    let lines: Vec<&str> = content.lines().collect();
    let mut stories = Vec::new();

    // First pass: Look for explicit US patterns with acceptance criteria
    // Now supports both markdown headers (#### US-1.1:) and bold format (**US-1.1:**)
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i];

        // Try to parse as a story header
        if let Some((id, title)) = parse_story_header(line) {
            // Now look for "**Acceptance Criteria**:" or "Acceptance Criteria:" section
            let mut acceptance_lines = Vec::new();
            let mut j = i + 1;
            let mut found_acceptance_section = false;

            while j < lines.len() {
                let current_line = lines[j];

                // Stop at next user story header (any format) or major section
                if is_story_header(current_line) || current_line.starts_with("## ") {
                    break;
                }

                // Check for acceptance criteria section header
                let lower = current_line.to_lowercase();
                if lower.contains("acceptance criteria") {
                    found_acceptance_section = true;
                    j += 1;
                    continue;
                }

                // If we're in the acceptance section, collect bullet points
                if found_acceptance_section {
                    let trimmed = current_line.trim();

                    // Stop at next section header within the story (bold headers that aren't acceptance)
                    if trimmed.starts_with("**") && !lower.contains("acceptance") {
                        // But don't stop if this is another story header (handled above)
                        if !trimmed.starts_with("**US-") && !trimmed.starts_with("**T-") {
                            break;
                        }
                    }

                    // Collect bullet points (lines starting with - or *)
                    if trimmed.starts_with("- ") || trimmed.starts_with("* ") {
                        // Remove the bullet and checkbox markers like "[ ]"
                        let criterion = trimmed
                            .trim_start_matches("- ")
                            .trim_start_matches("* ")
                            .trim_start_matches("[ ] ")
                            .trim_start_matches("[x] ")
                            .trim_start_matches("[X] ")
                            .trim();
                        if !criterion.is_empty() {
                            acceptance_lines.push(criterion.to_string());
                        }
                    }
                }

                j += 1;
            }

            // Create the acceptance criteria string
            let acceptance = if acceptance_lines.is_empty() {
                // No acceptance criteria found - use a placeholder that's better than just the title
                format!("Implement: {}", title)
            } else {
                acceptance_lines
                    .iter()
                    .map(|s| format!("- {}", s))
                    .collect::<Vec<_>>()
                    .join("\n")
            };

            stories.push(RalphStory::new(&id, &title, &acceptance));
            i = j;
            continue;
        }

        i += 1;
    }

    // Second pass: Fallback to generic headers if no explicit stories found
    if stories.is_empty() {
        let mut task_index = 0;
        let skip_headers = [
            "overview",
            "requirements",
            "tasks",
            "summary",
            "description",
            "background",
            "phase",
            "feature",
            "metrics",
            "notes",
            "questions",
            "table",
            "dependency",
            "migration",
            "technical",
            "architecture",
            "files",
            "implementation",
            "open",
            "success",
            "deferred",
        ];

        for line in lines.iter() {
            if line.starts_with("## ") || line.starts_with("### ") {
                let task_title = line.trim_start_matches('#').trim();
                let lower_title = task_title.to_lowercase();

                // Skip common section headers
                if !skip_headers.iter().any(|s| lower_title.starts_with(s)) {
                    stories.push(RalphStory::new(
                        &format!("task-{}", task_index + 1),
                        task_title,
                        &format!("Implement: {}", task_title),
                    ));
                    task_index += 1;
                }
            }
        }
    }

    // Deduplicate stories by ID (keep only the first occurrence of each ID)
    let mut seen_ids = std::collections::HashSet::new();
    stories.retain(|story| seen_ids.insert(story.id.clone()));

    stories
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
fn parse_ai_story_response(response: &str) -> Result<Vec<ExtractedStory>, String> {
    // Try to find JSON array in the response
    let json_start = response.find('[');
    let json_end = response.rfind(']');

    match (json_start, json_end) {
        (Some(start), Some(end)) if start < end => {
            let json_str = &response[start..=end];
            serde_json::from_str::<Vec<ExtractedStory>>(json_str)
                .map_err(|e| format!("Failed to parse AI response as JSON: {}", e))
        }
        _ => {
            // Try parsing the whole response as JSON
            serde_json::from_str::<Vec<ExtractedStory>>(response.trim())
                .map_err(|e| format!("No valid JSON array found in AI response: {}", e))
        }
    }
}

/// Get the prompt.md content
pub fn get_ralph_prompt(project_path: String, prd_name: String) -> Result<String, String> {
    super::helpers::prompt_builder(&project_path, &prd_name).read_prompt()
}

/// Update the prompt.md content
pub fn set_ralph_prompt(project_path: String, prd_name: String, content: String) -> Result<(), String> {
    super::helpers::prompt_builder(&project_path, &prd_name).write_prompt(&content)
}
