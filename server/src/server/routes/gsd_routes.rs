//! GSD Workflow command routing
//!
//! Handles GSD (Get Stuff Done) workflow commands including:
//! start_gsd_session, get_gsd_state, list_gsd_sessions, delete_gsd_session,
//! get_available_research_agents, update_gsd_phase, update_questioning_context,
//! generate_project_document, start_research, get_research_results,
//! synthesize_research_cmd, load_synthesis, generate_requirements_from_research,
//! scope_requirements, validate_requirements, add_requirement, save_requirements,
//! load_requirements, create_roadmap, load_roadmap, verify_gsd_plans,
//! get_verification_history, clear_verification_history, export_gsd_to_ralph,
//! save_planning_file, read_gsd_planning_file, generate_requirements_from_prompt,
//! add_generated_requirements, detect_project_type, analyze_context_quality,
//! generate_context_suggestions, generate_idea_starters, generate_idea_variations,
//! analyze_market_opportunity, validate_idea_feasibility, explore_idea_space

use crate::commands;
use crate::gsd::requirements::{RequirementsDoc, ScopeSelection};
use crate::gsd::startup::ProjectType;
use crate::gsd::state::{GsdPhase, QuestioningContext};
use crate::ralph_loop::PrdExecutionConfig;
use serde_json::Value;

use super::{get_arg, get_opt_arg, route_async, route_unit_async, ServerAppState};

/// Route GSD workflow commands
pub async fn route_gsd_command(
    cmd: &str,
    args: Value,
    state: &ServerAppState,
) -> Result<Value, String> {
    match cmd {
        "start_gsd_session" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let chat_session_id: String = get_arg(&args, "chatSessionId")?;
            route_async!(
                cmd,
                commands::gsd::start_gsd_session(project_path, chat_session_id)
            )
        }

        "get_gsd_state" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(cmd, commands::gsd::get_gsd_state(project_path, session_id))
        }

        "list_gsd_sessions" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::gsd::list_gsd_sessions(project_path))
        }

        "delete_gsd_session" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_unit_async!(commands::gsd::delete_gsd_session(project_path, session_id))
        }

        "get_available_research_agents" => {
            let agents = commands::gsd::get_available_research_agents();
            serde_json::to_value(agents).map_err(|e| e.to_string())
        }

        "update_gsd_phase" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let phase: GsdPhase = get_arg(&args, "phase")?;
            route_async!(
                cmd,
                commands::gsd::update_gsd_phase(project_path, session_id, phase)
            )
        }

        "update_questioning_context" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let context: QuestioningContext = get_arg(&args, "context")?;
            route_async!(
                cmd,
                commands::gsd::update_questioning_context(project_path, session_id, context)
            )
        }

        "generate_project_document" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::generate_project_document(project_path, session_id)
            )
        }

        "start_research" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let context: String = get_arg(&args, "context")?;
            let agent_type: Option<String> = get_opt_arg(&args, "agentType")?;
            let model: Option<String> = get_opt_arg(&args, "model")?;
            let research_types: Option<Vec<String>> = get_opt_arg(&args, "researchTypes")?;
            let prd_type: Option<String> = get_opt_arg(&args, "prdType")?;
            let env_vars = commands::providers::get_provider_env_vars(&state.config_state).ok();
            let result = commands::gsd::start_research(
                state.broadcaster.clone(),
                project_path,
                session_id,
                context,
                agent_type,
                model,
                research_types,
                env_vars,
                prd_type,
            )
            .await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        "get_research_results" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::get_research_results(project_path, session_id)
            )
        }

        "synthesize_research_cmd" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::synthesize_research_cmd(project_path, session_id)
            )
        }

        "load_synthesis" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(cmd, commands::gsd::load_synthesis(project_path, session_id))
        }

        "generate_requirements_from_research" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::generate_requirements_from_research(project_path, session_id)
            )
        }

        "scope_requirements" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let selections: ScopeSelection = get_arg(&args, "selections")?;
            route_async!(
                cmd,
                commands::gsd::scope_requirements(project_path, session_id, selections)
            )
        }

        "validate_requirements" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::validate_requirements(project_path, session_id)
            )
        }

        "add_requirement" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let category: String = get_arg(&args, "category")?;
            let title: String = get_arg(&args, "title")?;
            let description: String = get_arg(&args, "description")?;
            route_async!(
                cmd,
                commands::gsd::add_requirement(
                    project_path,
                    session_id,
                    category,
                    title,
                    description
                )
            )
        }

        "save_requirements" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let requirements: RequirementsDoc = get_arg(&args, "requirements")?;
            route_unit_async!(commands::gsd::save_requirements(
                project_path,
                session_id,
                requirements
            ))
        }

        "load_requirements" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::load_requirements(project_path, session_id)
            )
        }

        "create_roadmap" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(cmd, commands::gsd::create_roadmap(project_path, session_id))
        }

        "load_roadmap" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(cmd, commands::gsd::load_roadmap(project_path, session_id))
        }

        "verify_gsd_plans" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::verify_gsd_plans(project_path, session_id)
            )
        }

        "get_verification_history" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_async!(
                cmd,
                commands::gsd::get_verification_history(project_path, session_id)
            )
        }

        "clear_verification_history" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            route_unit_async!(commands::gsd::clear_verification_history(
                project_path,
                session_id
            ))
        }

        "export_gsd_to_ralph" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            let branch: String = get_arg(&args, "branch")?;
            let include_v2: Option<bool> = get_opt_arg(&args, "includeV2")?;
            let execution_config: Option<PrdExecutionConfig> =
                get_opt_arg(&args, "executionConfig")?;
            route_async!(
                cmd,
                commands::gsd::export_gsd_to_ralph(
                    project_path,
                    session_id,
                    prd_name,
                    branch,
                    include_v2,
                    execution_config
                )
            )
        }

        "save_planning_file" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let file_type: String = get_arg(&args, "fileType")?;
            let content: String = get_arg(&args, "content")?;
            route_async!(
                cmd,
                commands::gsd::save_planning_file(project_path, session_id, file_type, content)
            )
        }

        "read_gsd_planning_file" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let file_type: String = get_arg(&args, "fileType")?;
            route_async!(
                cmd,
                commands::gsd::read_gsd_planning_file(project_path, session_id, file_type)
            )
        }

        "list_project_research" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::gsd::list_project_research(project_path))
        }

        "copy_research_to_session" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let source_session_id: String = get_arg(&args, "sourceSessionId")?;
            let target_session_id: String = get_arg(&args, "targetSessionId")?;
            let research_types: Option<Vec<String>> = get_opt_arg(&args, "researchTypes")?;
            route_async!(
                cmd,
                commands::gsd::copy_research_to_session(
                    project_path,
                    source_session_id,
                    target_session_id,
                    research_types
                )
            )
        }

        "clone_gsd_session" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let source_session_id: String = get_arg(&args, "sourceSessionId")?;
            let options: commands::gsd::CloneSessionOptions = get_arg(&args, "options")?;
            route_async!(
                cmd,
                commands::gsd::clone_gsd_session(project_path, source_session_id, options)
            )
        }

        "generate_requirements_from_prompt" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let prompt: String = get_arg(&args, "prompt")?;
            let count: Option<u32> = get_opt_arg(&args, "count")?;
            let agent_type: Option<String> = get_opt_arg(&args, "agentType")?;
            let model: Option<String> = get_opt_arg(&args, "model")?;
            let env_vars = commands::providers::get_provider_env_vars(&state.config_state).ok();
            let result = commands::gsd::generate_requirements_from_prompt(
                state.broadcaster.clone(),
                project_path,
                session_id,
                prompt,
                count,
                agent_type,
                model,
                env_vars,
            )
            .await?;
            serde_json::to_value(result).map_err(|e| e.to_string())
        }

        "add_generated_requirements" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let session_id: String = get_arg(&args, "sessionId")?;
            let generated: Vec<commands::gsd::GeneratedRequirement> =
                get_arg(&args, "requirements")?;
            route_async!(
                cmd,
                commands::gsd::add_generated_requirements(project_path, session_id, generated)
            )
        }

        "detect_project_type" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(cmd, commands::gsd::detect_project_type(project_path))
        }

        "analyze_context_quality" => {
            let context: QuestioningContext = get_arg(&args, "context")?;
            let project_type: Option<ProjectType> = get_opt_arg(&args, "projectType")?;
            route_async!(
                cmd,
                commands::gsd::analyze_context_quality(context, project_type)
            )
        }

        "generate_context_suggestions" => {
            let project_type: ProjectType = get_arg(&args, "projectType")?;
            let context: QuestioningContext = get_arg(&args, "context")?;
            route_async!(
                cmd,
                commands::gsd::generate_context_suggestions(project_type, context)
            )
        }

        "generate_idea_starters" => {
            let project_type: ProjectType = get_arg(&args, "projectType")?;
            let context: QuestioningContext = get_arg(&args, "context")?;
            route_async!(
                cmd,
                commands::gsd::generate_idea_starters(project_type, context)
            )
        }

        "generate_idea_variations" => {
            let project_type: ProjectType = get_arg(&args, "projectType")?;
            let context: QuestioningContext = get_arg(&args, "context")?;
            let variation_dimensions: Vec<String> = get_arg(&args, "variationDimensions")?;
            let count: u8 = get_opt_arg(&args, "count")?.unwrap_or(3);
            route_async!(
                cmd,
                commands::gsd::generate_idea_variations(
                    project_type,
                    context,
                    variation_dimensions,
                    count
                )
            )
        }

        "analyze_market_opportunity" => {
            let idea: crate::gsd::startup::GeneratedIdea = get_arg(&args, "idea")?;
            route_async!(cmd, commands::gsd::analyze_market_opportunity(idea))
        }

        "validate_idea_feasibility" => {
            let idea: crate::gsd::startup::GeneratedIdea = get_arg(&args, "idea")?;
            let project_type: ProjectType = get_arg(&args, "projectType")?;
            route_async!(
                cmd,
                commands::gsd::validate_idea_feasibility(idea, project_type)
            )
        }

        "explore_idea_space" => {
            let domain: String = get_arg(&args, "domain")?;
            let interests: Vec<String> = get_arg(&args, "interests")?;
            let count: u8 = get_opt_arg(&args, "count")?.unwrap_or(5);
            route_async!(
                cmd,
                commands::gsd::explore_idea_space(domain, interests, count)
            )
        }

        _ => Err(format!("Unknown GSD command: {}", cmd)),
    }
}

/// Check if a command is a GSD command
pub fn is_gsd_command(cmd: &str) -> bool {
    matches!(
        cmd,
        "start_gsd_session"
            | "get_gsd_state"
            | "list_gsd_sessions"
            | "delete_gsd_session"
            | "get_available_research_agents"
            | "update_gsd_phase"
            | "update_questioning_context"
            | "generate_project_document"
            | "start_research"
            | "get_research_results"
            | "synthesize_research_cmd"
            | "load_synthesis"
            | "generate_requirements_from_research"
            | "scope_requirements"
            | "validate_requirements"
            | "add_requirement"
            | "save_requirements"
            | "load_requirements"
            | "create_roadmap"
            | "load_roadmap"
            | "verify_gsd_plans"
            | "get_verification_history"
            | "clear_verification_history"
            | "export_gsd_to_ralph"
            | "save_planning_file"
            | "read_gsd_planning_file"
            | "list_project_research"
            | "copy_research_to_session"
            | "clone_gsd_session"
            | "generate_requirements_from_prompt"
            | "add_generated_requirements"
            | "detect_project_type"
            | "analyze_context_quality"
            | "generate_context_suggestions"
            | "generate_idea_starters"
            | "generate_idea_variations"
            | "analyze_market_opportunity"
            | "validate_idea_feasibility"
            | "explore_idea_space"
    )
}
