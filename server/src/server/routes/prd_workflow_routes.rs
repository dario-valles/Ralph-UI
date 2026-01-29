//! PRD Workflow command routing
//!
//! Routes for the centralized PRD workflow system including:
//! - Workflow lifecycle (create, get, list, delete)
//! - Phase management (advance, go_back, skip, set_phase)
//! - Context and spec updates
//! - Research configuration and execution
//! - Requirements management (upsert, delete, scope, status)
//! - Dependencies (add, remove, validate, execution order)
//! - Planning and export (roadmap, export to PRD, AGENTS.md)

use crate::commands;
use crate::commands::prd_workflow::{PhaseAction, ScopeSelection};
use crate::prd_workflow::{
    ExecutionMode, ProjectContext, Requirement, RequirementCategory, RequirementStatus,
    ResearchConfig, ScopeLevel, SpecState, WorkflowMode,
};
use serde_json::Value;
use std::path::Path;

use super::{get_arg, get_opt_arg, route_async, route_unit_async, ServerAppState};

/// Route PRD workflow commands
pub async fn route_prd_workflow_command(
    cmd: &str,
    args: Value,
    _state: &ServerAppState,
) -> Result<Value, String> {
    match cmd {
        // =====================================================================
        // Workflow Lifecycle
        // =====================================================================
        "create_prd_workflow" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let mode: WorkflowMode = get_arg(&args, "mode")?;
            let chat_session_id: Option<String> = get_opt_arg(&args, "chatSessionId")?;
            route_async!(
                cmd,
                commands::prd_workflow::create_prd_workflow(
                    project_path,
                    workflow_id,
                    mode,
                    chat_session_id
                )
            )
        }

        "get_prd_workflow" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            route_async!(
                cmd,
                commands::prd_workflow::get_prd_workflow(project_path, workflow_id)
            )
        }

        "list_prd_workflows" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            route_async!(
                cmd,
                commands::prd_workflow::list_prd_workflows(project_path)
            )
        }

        "delete_prd_workflow" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            route_unit_async!(commands::prd_workflow::delete_prd_workflow(
                project_path,
                workflow_id
            ))
        }

        // =====================================================================
        // Phase Management
        // =====================================================================
        "update_workflow_phase" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let action: PhaseAction = get_arg(&args, "action")?;
            route_async!(
                cmd,
                commands::prd_workflow::update_workflow_phase(project_path, workflow_id, action)
            )
        }

        // =====================================================================
        // Context & Spec
        // =====================================================================
        "update_workflow_context" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let context: ProjectContext = get_arg(&args, "context")?;
            route_async!(
                cmd,
                commands::prd_workflow::update_workflow_context(project_path, workflow_id, context)
            )
        }

        "update_workflow_spec" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let spec: SpecState = get_arg(&args, "spec")?;
            route_async!(
                cmd,
                commands::prd_workflow::update_workflow_spec(project_path, workflow_id, spec)
            )
        }

        // =====================================================================
        // Research
        // =====================================================================
        "update_research_config" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let config: ResearchConfig = get_arg(&args, "config")?;
            route_async!(
                cmd,
                commands::prd_workflow::update_research_config(project_path, workflow_id, config)
            )
        }

        "get_research_files" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            route_async!(
                cmd,
                commands::prd_workflow::get_research_files(project_path, workflow_id)
            )
        }

        "read_research_file_content" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let filename: String = get_arg(&args, "filename")?;
            let content = crate::prd_workflow::read_research_file(
                Path::new(&project_path),
                &workflow_id,
                &filename,
            )?;
            serde_json::to_value(content).map_err(|e| e.to_string())
        }

        "save_research_result" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let agent_id: String = get_arg(&args, "agentId")?;
            let content: String = get_arg(&args, "content")?;
            let output_filename: String = get_arg(&args, "outputFilename")?;
            route_async!(
                cmd,
                commands::prd_workflow::save_research_result(
                    project_path,
                    workflow_id,
                    agent_id,
                    content,
                    output_filename
                )
            )
        }

        "save_research_synthesis" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let synthesis_content: String = get_arg(&args, "synthesisContent")?;
            route_async!(
                cmd,
                commands::prd_workflow::save_research_synthesis(
                    project_path,
                    workflow_id,
                    synthesis_content
                )
            )
        }

        // =====================================================================
        // Requirements
        // =====================================================================
        "upsert_requirement" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let requirement: Requirement = get_arg(&args, "requirement")?;
            route_async!(
                cmd,
                commands::prd_workflow::upsert_requirement(project_path, workflow_id, requirement)
            )
        }

        "add_requirement" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let category: RequirementCategory = get_arg(&args, "category")?;
            let title: String = get_arg(&args, "title")?;
            let description: String = get_arg(&args, "description")?;
            let depends_on: Option<Vec<String>> = get_opt_arg(&args, "dependsOn")?;
            let scope: Option<ScopeLevel> = get_opt_arg(&args, "scope")?;
            route_async!(
                cmd,
                commands::prd_workflow::add_requirement(
                    project_path,
                    workflow_id,
                    category,
                    title,
                    description,
                    depends_on,
                    scope
                )
            )
        }

        "delete_requirement" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let requirement_id: String = get_arg(&args, "requirementId")?;
            route_async!(
                cmd,
                commands::prd_workflow::delete_requirement(
                    project_path,
                    workflow_id,
                    requirement_id
                )
            )
        }

        "update_requirement_scope" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let requirement_id: String = get_arg(&args, "requirementId")?;
            let scope: ScopeLevel = get_arg(&args, "scope")?;
            route_async!(
                cmd,
                commands::prd_workflow::update_requirement_scope(
                    project_path,
                    workflow_id,
                    requirement_id,
                    scope
                )
            )
        }

        "update_requirement_status" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let requirement_id: String = get_arg(&args, "requirementId")?;
            let status: RequirementStatus = get_arg(&args, "status")?;
            route_async!(
                cmd,
                commands::prd_workflow::update_requirement_status(
                    project_path,
                    workflow_id,
                    requirement_id,
                    status
                )
            )
        }

        "apply_scope_selection" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let selection: ScopeSelection = get_arg(&args, "selection")?;
            route_async!(
                cmd,
                commands::prd_workflow::apply_scope_selection(project_path, workflow_id, selection)
            )
        }

        // =====================================================================
        // Dependencies
        // =====================================================================
        "add_dependency" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let from_requirement_id: String = get_arg(&args, "fromRequirementId")?;
            let depends_on_id: String = get_arg(&args, "dependsOnId")?;
            route_async!(
                cmd,
                commands::prd_workflow::add_dependency(
                    project_path,
                    workflow_id,
                    from_requirement_id,
                    depends_on_id
                )
            )
        }

        "remove_dependency" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let from_requirement_id: String = get_arg(&args, "fromRequirementId")?;
            let depends_on_id: String = get_arg(&args, "dependsOnId")?;
            route_async!(
                cmd,
                commands::prd_workflow::remove_dependency(
                    project_path,
                    workflow_id,
                    from_requirement_id,
                    depends_on_id
                )
            )
        }

        "validate_dependencies" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            route_async!(
                cmd,
                commands::prd_workflow::validate_dependencies(project_path, workflow_id)
            )
        }

        "get_execution_order" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            route_async!(
                cmd,
                commands::prd_workflow::get_execution_order(project_path, workflow_id)
            )
        }

        "get_ready_requirements" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            route_async!(
                cmd,
                commands::prd_workflow::get_ready_requirements(project_path, workflow_id)
            )
        }

        // =====================================================================
        // Planning & Export
        // =====================================================================
        "generate_roadmap" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            route_async!(
                cmd,
                commands::prd_workflow::generate_roadmap(project_path, workflow_id)
            )
        }

        "export_workflow_to_prd" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let prd_name: String = get_arg(&args, "prdName")?;
            route_async!(
                cmd,
                commands::prd_workflow::export_workflow_to_prd(project_path, workflow_id, prd_name)
            )
        }

        "generate_agents_md" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let content: String = get_arg(&args, "content")?;
            route_async!(
                cmd,
                commands::prd_workflow::generate_agents_md(project_path, workflow_id, content)
            )
        }

        "update_workflow_execution_mode" => {
            let project_path: String = get_arg(&args, "projectPath")?;
            let workflow_id: String = get_arg(&args, "workflowId")?;
            let mode: ExecutionMode = get_arg(&args, "mode")?;
            route_async!(
                cmd,
                commands::prd_workflow::update_workflow_execution_mode(
                    project_path,
                    workflow_id,
                    mode
                )
            )
        }

        _ => Err(format!("Unknown PRD workflow command: {}", cmd)),
    }
}

/// Check if a command is a PRD workflow command
pub fn is_prd_workflow_command(cmd: &str) -> bool {
    matches!(
        cmd,
        // Workflow Lifecycle
        "create_prd_workflow"
            | "get_prd_workflow"
            | "list_prd_workflows"
            | "delete_prd_workflow"
            // Phase Management
            | "update_workflow_phase"
            // Context & Spec
            | "update_workflow_context"
            | "update_workflow_spec"
            // Research
            | "update_research_config"
            | "get_research_files"
            | "read_research_file_content"
            | "save_research_result"
            | "save_research_synthesis"
            // Requirements
            | "upsert_requirement"
            | "add_requirement"
            | "delete_requirement"
            | "update_requirement_scope"
            | "update_requirement_status"
            | "apply_scope_selection"
            // Dependencies
            | "add_dependency"
            | "remove_dependency"
            | "validate_dependencies"
            | "get_execution_order"
            | "get_ready_requirements"
            // Planning & Export
            | "generate_roadmap"
            | "export_workflow_to_prd"
            | "generate_agents_md"
            | "update_workflow_execution_mode"
    )
}
