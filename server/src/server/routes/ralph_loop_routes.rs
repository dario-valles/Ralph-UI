//! Ralph Loop command routing
//!
//! Handles all ralph loop related commands including PRD management,
//! story management, execution control, and iteration tracking.

use crate::commands;
use crate::commands::ralph_loop::RalphStoryInput;
use crate::ralph_loop::{ExecutionSnapshot, RalphConfig};
use serde::Serialize;
use serde_json::Value;

use super::{get_arg, get_opt_arg, route_sync, route_unit, ServerAppState};

/// Extract a field from an ExecutionSnapshot by execution ID
fn get_snapshot_field<T, F>(
    state: &ServerAppState,
    args: &Value,
    extractor: F,
) -> Result<Value, String>
where
    T: Serialize,
    F: FnOnce(&ExecutionSnapshot) -> T,
{
    let execution_id: String = super::get_arg(args, "executionId")?;
    match state.ralph_loop_state.get_snapshot(&execution_id) {
        Some(snapshot) => serde_json::to_value(extractor(&snapshot)).map_err(|e| e.to_string()),
        None => Err(format!("Execution {} not found", execution_id)),
    }
}

/// Route ralph loop related commands
pub async fn route_ralph_loop_command(
    cmd: &str,
    args: Value,
    state: &ServerAppState,
) -> Result<Value, String> {
    match cmd {
        "get_ralph_prd" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_prd(project_path, prd_name))
        }

        "get_ralph_prd_status" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_prd_status(
                project_path,
                prd_name
            ))
        }

        "get_ralph_progress" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_progress(
                project_path,
                prd_name
            ))
        }

        "get_ralph_progress_summary" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_progress_summary(
                project_path,
                prd_name
            ))
        }

        "get_ralph_prompt" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_prompt(
                project_path,
                prd_name
            ))
        }

        "has_ralph_files" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let has_files = commands::ralph_loop::has_ralph_files(project_path);
            serde_json::to_value(has_files).map_err(|e| e.to_string())
        }

        "get_ralph_files" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::ralph_loop::get_ralph_files(project_path))
        }

        "get_ralph_config" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::ralph_loop::get_ralph_config(project_path))
        }

        // US-2.3: View Parallel Progress - Assignment Commands
        "get_ralph_assignments" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_assignments(
                project_path,
                prd_name
            ))
        }

        "get_ralph_files_in_use" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_files_in_use(
                project_path,
                prd_name
            ))
        }

        // US-4.1: Priority-Based Assignment - Manual Override
        "manual_assign_ralph_story" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let input: commands::ralph_loop::ManualAssignStoryInput = get_arg(&args, "input")?;
            route_sync!(commands::ralph_loop::manual_assign_ralph_story(
                project_path,
                prd_name,
                input,
                Some(state.broadcaster.clone())
            ))
        }

        "release_ralph_story_assignment" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let story_id: String = get_arg(&args, "storyId")?;
            route_sync!(commands::ralph_loop::release_ralph_story_assignment(
                project_path,
                prd_name,
                story_id,
                Some(state.broadcaster.clone())
            ))
        }

        // US-6.1: View Current Brief
        "get_ralph_brief" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_brief(
                project_path,
                prd_name
            ))
        }

        "regenerate_ralph_brief" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::regenerate_ralph_brief(
                project_path,
                prd_name
            ))
        }

        "get_ralph_historical_briefs" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_historical_briefs(
                project_path,
                prd_name
            ))
        }

        // US-3.3: Manual Learning Entry
        "get_ralph_learnings" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::get_ralph_learnings(
                project_path,
                prd_name
            ))
        }

        "add_ralph_learning" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let input: commands::ralph_loop::AddLearningInput = get_arg(&args, "input")?;
            route_sync!(commands::ralph_loop::add_ralph_learning(
                project_path,
                prd_name,
                input
            ))
        }

        "update_ralph_learning" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let input: commands::ralph_loop::UpdateLearningInput = get_arg(&args, "input")?;
            route_sync!(commands::ralph_loop::update_ralph_learning(
                project_path,
                prd_name,
                input
            ))
        }

        "delete_ralph_learning" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let learning_id: String = get_arg(&args, "learningId")?;
            route_sync!(commands::ralph_loop::delete_ralph_learning(
                project_path,
                prd_name,
                learning_id
            ))
        }

        "export_ralph_learnings" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::export_ralph_learnings(
                project_path,
                prd_name
            ))
        }

        "list_ralph_loop_executions" => {
            route_sync!(commands::ralph_loop::list_ralph_loop_executions(
                &state.ralph_loop_state
            ))
        }

        "list_ralph_loop_executions_with_details" => {
            route_sync!(
                commands::ralph_loop::list_ralph_loop_executions_with_details(
                    &state.ralph_loop_state
                )
            )
        }

        "get_ralph_iteration_history" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let execution_id: String = get_arg(&args, "executionId")?;
            route_sync!(commands::ralph_loop::get_ralph_iteration_history(
                project_path,
                execution_id
            ))
        }

        "get_ralph_iteration_stats" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let execution_id: String = get_arg(&args, "executionId")?;
            route_sync!(commands::ralph_loop::get_ralph_iteration_stats(
                project_path,
                execution_id
            ))
        }

        "check_stale_ralph_executions" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let threshold_secs: Option<i64> = get_opt_arg(&args, "thresholdSecs")?;
            route_sync!(commands::ralph_loop::check_stale_ralph_executions(
                project_path,
                threshold_secs
            ))
        }

        "recover_stale_ralph_iterations" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let execution_id: String = get_arg(&args, "executionId")?;
            route_sync!(commands::ralph_loop::recover_stale_ralph_iterations(
                project_path,
                execution_id
            ))
        }

        "cleanup_ralph_iteration_history" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let days_to_keep: Option<i64> = get_opt_arg(&args, "daysToKeep")?;
            route_sync!(commands::ralph_loop::cleanup_ralph_iteration_history(
                project_path,
                days_to_keep
            ))
        }

        "init_ralph_prd" => {
            let request: commands::ralph_loop::InitRalphPrdRequest = get_arg(&args, "request")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_sync!(commands::ralph_loop::init_ralph_prd(request, prd_name))
        }

        "set_ralph_prompt" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let content: String = get_arg(&args, "content")?;
            route_unit!(commands::ralph_loop::set_ralph_prompt(
                project_path,
                prd_name,
                content
            ))
        }

        "set_ralph_config" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let config: RalphConfig = get_arg(&args, "config")?;
            route_unit!(commands::ralph_loop::set_ralph_config(project_path, config))
        }

        "init_ralph_config" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::ralph_loop::init_ralph_config(project_path))
        }

        "update_ralph_config" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let max_iterations: Option<u32> = get_opt_arg(&args, "maxIterations")?;
            let max_cost: Option<f64> = get_opt_arg(&args, "maxCost")?;
            let agent: Option<String> = get_opt_arg(&args, "agent")?;
            let model: Option<String> = get_opt_arg(&args, "model")?;
            let test_command: Option<String> = get_opt_arg(&args, "testCommand")?;
            let lint_command: Option<String> = get_opt_arg(&args, "lintCommand")?;
            let build_command: Option<String> = get_opt_arg(&args, "buildCommand")?;
            route_sync!(commands::ralph_loop::update_ralph_config(
                project_path,
                max_iterations,
                max_cost,
                agent,
                model,
                test_command,
                lint_command,
                build_command
            ))
        }

        "add_ralph_story" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let story: RalphStoryInput = get_arg(&args, "story")?;
            route_unit!(commands::ralph_loop::add_ralph_story(
                project_path,
                prd_name,
                story
            ))
        }

        "remove_ralph_story" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let story_id: String = get_arg(&args, "storyId")?;
            route_sync!(commands::ralph_loop::remove_ralph_story(
                project_path,
                prd_name,
                story_id
            ))
        }

        "mark_ralph_story_passing" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let story_id: String = get_arg(&args, "storyId")?;
            route_sync!(commands::ralph_loop::mark_ralph_story_passing(
                project_path,
                prd_name,
                story_id
            ))
        }

        "mark_ralph_story_failing" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let story_id: String = get_arg(&args, "storyId")?;
            route_sync!(commands::ralph_loop::mark_ralph_story_failing(
                project_path,
                prd_name,
                story_id
            ))
        }

        "add_ralph_progress_note" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let iteration: u32 = get_arg(&args, "iteration")?;
            let note: String = get_arg(&args, "note")?;
            route_unit!(commands::ralph_loop::add_ralph_progress_note(
                project_path,
                prd_name,
                iteration,
                note
            ))
        }

        "clear_ralph_progress" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_unit!(commands::ralph_loop::clear_ralph_progress(
                project_path,
                prd_name
            ))
        }

        "convert_prd_file_to_ralph" => {
            let request: commands::ralph_loop::ConvertPrdFileToRalphRequest =
                get_arg(&args, "request")?;
            route_sync!(commands::ralph_loop::convert_prd_file_to_ralph(request))
        }

        "cleanup_ralph_worktree" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let worktree_path: String = get_arg(&args, "worktreePath")?;
            let delete_directory: Option<bool> = get_opt_arg(&args, "deleteDirectory")?;
            route_unit!(commands::ralph_loop::cleanup_ralph_worktree(
                project_path,
                worktree_path,
                delete_directory
            ))
        }

        "list_ralph_worktrees" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_sync!(commands::ralph_loop::list_ralph_worktrees(project_path))
        }

        "get_all_ralph_iterations" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let execution_id: Option<String> = get_opt_arg(&args, "executionId")?;
            let outcome_filter: Option<String> = get_opt_arg(&args, "outcomeFilter")?;
            let limit: Option<u32> = get_opt_arg(&args, "limit")?;
            route_sync!(commands::ralph_loop::get_all_ralph_iterations(
                project_path,
                execution_id,
                outcome_filter,
                limit
            ))
        }

        "delete_ralph_iteration_history" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let execution_id: String = get_arg(&args, "executionId")?;
            route_sync!(commands::ralph_loop::delete_ralph_iteration_history(
                project_path,
                execution_id
            ))
        }

        "regenerate_ralph_prd_acceptance" => {
            let request: commands::ralph_loop::RegenerateAcceptanceRequest =
                get_arg(&args, "request")?;
            route_sync!(commands::ralph_loop::regenerate_ralph_prd_acceptance(
                request
            ))
        }

        "analyze_ralph_prd_stories" => {
            let request: commands::ralph_loop::AnalyzePrdStoriesRequest =
                get_arg(&args, "request")?;
            route_sync!(commands::ralph_loop::analyze_prd_stories(request))
        }

        "regenerate_ralph_prd_stories" => {
            let request: commands::ralph_loop::RegenerateStoriesRequest =
                get_arg(&args, "request")?;
            // Use server-compatible version with EventBroadcaster for streaming
            let response =
                super::regenerate_ralph_prd_stories_server(request, &state.broadcaster).await?;
            serde_json::to_value(response).map_err(|e| e.to_string())
        }

        // Ralph Loop execution commands
        "start_ralph_loop" => {
            let request: commands::ralph_loop::StartRalphLoopRequest = get_arg(&args, "request")?;
            let execution_id = super::start_ralph_loop_server(request, state).await?;
            serde_json::to_value(execution_id).map_err(|e| e.to_string())
        }

        "stop_ralph_loop" => {
            let execution_id: String = get_arg(&args, "executionId")?;
            super::stop_ralph_loop_server(execution_id, state).await?;
            Ok(serde_json::Value::Null)
        }

        "get_ralph_loop_state" => get_snapshot_field(state, &args, |s| s.state.clone()),
        "get_ralph_loop_metrics" => get_snapshot_field(state, &args, |s| s.metrics.clone()),
        "get_ralph_loop_current_agent" => {
            get_snapshot_field(state, &args, |s| s.current_agent_id.clone())
        }
        "get_ralph_loop_worktree_path" => {
            get_snapshot_field(state, &args, |s| s.worktree_path.clone())
        }

        "get_ralph_loop_snapshot" => {
            let execution_id: String = get_arg(&args, "executionId")?;
            let project_path: String = get_arg(&args, "projectPath")?;

            // Try in-memory snapshot first
            if let Some(snapshot) = state.ralph_loop_state.get_snapshot(&execution_id) {
                return Ok(serde_json::json!({
                    "state": snapshot.state,
                    "metrics": snapshot.metrics,
                    "worktreePath": snapshot.worktree_path,
                    "currentAgentId": snapshot.current_agent_id,
                }));
            }

            // Fall back to file-based snapshot
            let path = crate::utils::ralph_ui_dir(&project_path)
                .join("iterations")
                .join(format!("{}_snapshot.json", execution_id));

            if path.exists() {
                let content = std::fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read snapshot: {}", e))?;
                return serde_json::from_str(&content)
                    .map_err(|e| format!("Failed to parse snapshot: {}", e));
            }

            Err(format!("Execution {} not found", execution_id))
        }

        _ => Err(format!("Unknown ralph loop command: {}", cmd)),
    }
}

/// Check if a command is a ralph loop command
pub fn is_ralph_loop_command(cmd: &str) -> bool {
    cmd.starts_with("get_ralph_")
        || cmd.starts_with("set_ralph_")
        || cmd.starts_with("add_ralph_")
        || cmd.starts_with("update_ralph_")
        || cmd.starts_with("delete_ralph_")
        || cmd.starts_with("mark_ralph_")
        || cmd.starts_with("clear_ralph_")
        || cmd.starts_with("list_ralph_")
        || cmd.starts_with("export_ralph_")
        || cmd.starts_with("cleanup_ralph_")
        || cmd.starts_with("check_stale_ralph_")
        || cmd.starts_with("recover_stale_ralph_")
        || matches!(
            cmd,
            "has_ralph_files"
                | "init_ralph_prd"
                | "init_ralph_config"
                | "remove_ralph_story"
                | "convert_prd_file_to_ralph"
                | "regenerate_ralph_prd_acceptance"
                | "regenerate_ralph_prd_stories"
                | "analyze_ralph_prd_stories"
                | "start_ralph_loop"
                | "stop_ralph_loop"
                | "manual_assign_ralph_story"
                | "release_ralph_story_assignment"
                | "regenerate_ralph_brief"
        )
}
