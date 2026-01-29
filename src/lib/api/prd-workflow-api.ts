// PRD Workflow API wrappers

import type {
  PrdWorkflowState,
  WorkflowPhase,
  WorkflowMode,
  WorkflowInfo,
  ProjectContext,
  SpecState,
  ResearchConfig,
  Requirement,
  RequirementCategory,
  ScopeLevel,
  ScopeSelection,
  AddRequirementResult,
  DependencyValidationResult,
  ExportResult,
  RequirementStatus,
  ExecutionMode,
} from '@/types/prd-workflow'

// Re-export with prefixed names for consistency with index.ts
export type PrdWorkflowRequirement = Requirement
export type PrdWorkflowCategory = RequirementCategory
export type PrdWorkflowScopeLevel = ScopeLevel
export type PrdWorkflowScopeSelection = ScopeSelection
export type PrdWorkflowExportResult = ExportResult
import { invoke } from '../invoke'

export const prdWorkflowApi = {
  // ============================================================================
  // Workflow Lifecycle
  // ============================================================================

  /** Create a new PRD workflow */
  createWorkflow: async (
    projectPath: string,
    workflowId: string,
    mode: WorkflowMode,
    chatSessionId?: string
  ): Promise<PrdWorkflowState> => {
    return await invoke('create_prd_workflow', {
      projectPath,
      workflowId,
      mode,
      chatSessionId,
    })
  },

  /** Get a PRD workflow by ID */
  getWorkflow: async (
    projectPath: string,
    workflowId: string
  ): Promise<PrdWorkflowState | null> => {
    return await invoke('get_prd_workflow', { projectPath, workflowId })
  },

  /** List all PRD workflows for a project */
  listWorkflows: async (projectPath: string): Promise<WorkflowInfo[]> => {
    return await invoke('list_prd_workflows', { projectPath })
  },

  /** Delete a PRD workflow */
  deleteWorkflow: async (projectPath: string, workflowId: string): Promise<void> => {
    return await invoke('delete_prd_workflow', { projectPath, workflowId })
  },

  // ============================================================================
  // Phase Management
  // ============================================================================

  /** Advance to the next phase */
  advancePhase: async (projectPath: string, workflowId: string): Promise<PrdWorkflowState> => {
    return await invoke('update_workflow_phase', {
      projectPath,
      workflowId,
      action: { type: 'advance' },
    })
  },

  /** Go back to the previous phase */
  goBackPhase: async (projectPath: string, workflowId: string): Promise<PrdWorkflowState> => {
    return await invoke('update_workflow_phase', {
      projectPath,
      workflowId,
      action: { type: 'go_back' },
    })
  },

  /** Skip the current phase */
  skipPhase: async (projectPath: string, workflowId: string): Promise<PrdWorkflowState> => {
    return await invoke('update_workflow_phase', {
      projectPath,
      workflowId,
      action: { type: 'skip' },
    })
  },

  /** Set a specific phase */
  setPhase: async (
    projectPath: string,
    workflowId: string,
    phase: WorkflowPhase
  ): Promise<PrdWorkflowState> => {
    return await invoke('update_workflow_phase', {
      projectPath,
      workflowId,
      action: { type: 'set_phase', phase },
    })
  },

  // ============================================================================
  // Context & Spec
  // ============================================================================

  /** Update the project context */
  updateContext: async (
    projectPath: string,
    workflowId: string,
    context: ProjectContext
  ): Promise<PrdWorkflowState> => {
    return await invoke('update_workflow_context', { projectPath, workflowId, context })
  },

  /** Update the spec state (current/desired) */
  updateSpec: async (
    projectPath: string,
    workflowId: string,
    spec: SpecState
  ): Promise<PrdWorkflowState> => {
    return await invoke('update_workflow_spec', { projectPath, workflowId, spec })
  },

  // ============================================================================
  // Research
  // ============================================================================

  /** Update research configuration */
  updateResearchConfig: async (
    projectPath: string,
    workflowId: string,
    config: ResearchConfig
  ): Promise<PrdWorkflowState> => {
    return await invoke('update_research_config', { projectPath, workflowId, config })
  },

  /** Get all research files for a workflow */
  getResearchFiles: async (projectPath: string, workflowId: string): Promise<string[]> => {
    return await invoke('get_research_files', { projectPath, workflowId })
  },

  /** Read a research file content */
  readResearchFile: async (
    projectPath: string,
    workflowId: string,
    filename: string
  ): Promise<string> => {
    return await invoke('read_research_file_content', { projectPath, workflowId, filename })
  },

  /** Save research result from an agent */
  saveResearchResult: async (
    projectPath: string,
    workflowId: string,
    agentId: string,
    content: string,
    outputFilename: string
  ): Promise<string> => {
    return await invoke('save_research_result', {
      projectPath,
      workflowId,
      agentId,
      content,
      outputFilename,
    })
  },

  /** Save research synthesis */
  saveResearchSynthesis: async (
    projectPath: string,
    workflowId: string,
    synthesisContent: string
  ): Promise<string> => {
    return await invoke('save_research_synthesis', {
      projectPath,
      workflowId,
      synthesisContent,
    })
  },

  // ============================================================================
  // Requirements
  // ============================================================================

  /** Upsert a requirement (add or update) */
  upsertRequirement: async (
    projectPath: string,
    workflowId: string,
    requirement: PrdWorkflowRequirement
  ): Promise<PrdWorkflowState> => {
    return await invoke('upsert_requirement', { projectPath, workflowId, requirement })
  },

  /** Add a new requirement with auto-generated ID */
  addRequirement: async (
    projectPath: string,
    workflowId: string,
    category: PrdWorkflowCategory,
    title: string,
    description: string,
    dependsOn?: string[],
    scope?: PrdWorkflowScopeLevel
  ): Promise<AddRequirementResult> => {
    return await invoke('add_requirement', {
      projectPath,
      workflowId,
      category,
      title,
      description,
      dependsOn,
      scope,
    })
  },

  /** Delete a requirement */
  deleteRequirement: async (
    projectPath: string,
    workflowId: string,
    requirementId: string
  ): Promise<PrdWorkflowState> => {
    return await invoke('delete_requirement', { projectPath, workflowId, requirementId })
  },

  /** Update requirement scope */
  updateRequirementScope: async (
    projectPath: string,
    workflowId: string,
    requirementId: string,
    scope: PrdWorkflowScopeLevel
  ): Promise<PrdWorkflowState> => {
    return await invoke('update_requirement_scope', {
      projectPath,
      workflowId,
      requirementId,
      scope,
    })
  },

  /** Update requirement status */
  updateRequirementStatus: async (
    projectPath: string,
    workflowId: string,
    requirementId: string,
    status: RequirementStatus
  ): Promise<PrdWorkflowState> => {
    return await invoke('update_requirement_status', {
      projectPath,
      workflowId,
      requirementId,
      status,
    })
  },

  /** Apply bulk scope selection */
  applyScopeSelection: async (
    projectPath: string,
    workflowId: string,
    selection: PrdWorkflowScopeSelection
  ): Promise<PrdWorkflowState> => {
    return await invoke('apply_scope_selection', { projectPath, workflowId, selection })
  },

  // ============================================================================
  // Dependencies
  // ============================================================================

  /** Add a dependency between requirements */
  addDependency: async (
    projectPath: string,
    workflowId: string,
    fromRequirementId: string,
    dependsOnId: string
  ): Promise<PrdWorkflowState> => {
    return await invoke('add_dependency', {
      projectPath,
      workflowId,
      fromRequirementId,
      dependsOnId,
    })
  },

  /** Remove a dependency between requirements */
  removeDependency: async (
    projectPath: string,
    workflowId: string,
    fromRequirementId: string,
    dependsOnId: string
  ): Promise<PrdWorkflowState> => {
    return await invoke('remove_dependency', {
      projectPath,
      workflowId,
      fromRequirementId,
      dependsOnId,
    })
  },

  /** Validate the dependency graph (check for cycles) */
  validateDependencies: async (
    projectPath: string,
    workflowId: string
  ): Promise<DependencyValidationResult> => {
    return await invoke('validate_dependencies', { projectPath, workflowId })
  },

  /** Get the execution order for requirements (topological sort) */
  getExecutionOrder: async (projectPath: string, workflowId: string): Promise<string[]> => {
    return await invoke('get_execution_order', { projectPath, workflowId })
  },

  /** Get requirements that are ready to execute */
  getReadyRequirements: async (
    projectPath: string,
    workflowId: string
  ): Promise<PrdWorkflowRequirement[]> => {
    return await invoke('get_ready_requirements', { projectPath, workflowId })
  },

  // ============================================================================
  // Planning & Export
  // ============================================================================

  /** Generate the roadmap based on dependency order */
  generateRoadmap: async (projectPath: string, workflowId: string): Promise<string> => {
    return await invoke('generate_roadmap', { projectPath, workflowId })
  },

  /** Export workflow to Ralph PRD format */
  exportToPrd: async (
    projectPath: string,
    workflowId: string,
    prdName: string
  ): Promise<PrdWorkflowExportResult> => {
    return await invoke('export_workflow_to_prd', { projectPath, workflowId, prdName })
  },

  /** Generate AGENTS.md file for the project */
  generateAgentsMd: async (
    projectPath: string,
    workflowId: string,
    content: string
  ): Promise<string> => {
    return await invoke('generate_agents_md', { projectPath, workflowId, content })
  },

  /** Update the workflow execution mode (sequential or parallel) */
  updateExecutionMode: async (
    projectPath: string,
    workflowId: string,
    mode: ExecutionMode
  ): Promise<PrdWorkflowState> => {
    return await invoke('update_workflow_execution_mode', { projectPath, workflowId, mode })
  },
}

export default prdWorkflowApi
