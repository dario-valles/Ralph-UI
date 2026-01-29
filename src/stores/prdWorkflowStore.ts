/**
 * PRD Workflow State Management Store
 *
 * Unified store for the centralized PRD workflow system.
 * This replaces the fragmented GSD state with a single source of truth.
 *
 * Features:
 * - 5-phase workflow (discovery, research, requirements, planning, export)
 * - Dependency graph with cycle detection
 * - Configurable research agents
 * - Requirements with scoping and status tracking
 */
import { create } from 'zustand'
import { prdWorkflowApi } from '@/lib/api/prd-workflow-api'
import { asyncAction, errorToString, type AsyncState } from '@/lib/store-utils'
import type {
  PrdWorkflowState,
  WorkflowPhase,
  WorkflowMode,
  WorkflowInfo,
  ProjectContext,
  SpecState,
  ResearchConfig,
  PrdWorkflowRequirement,
  PrdWorkflowCategory,
  PrdWorkflowScopeLevel,
  PrdWorkflowScopeSelection,
  RequirementStatus,
  DependencyValidationResult,
  PrdWorkflowExportResult,
  ExecutionMode,
} from '@/types'

// ============================================================================
// State Interface
// ============================================================================

interface PrdWorkflowStoreState extends AsyncState {
  /** Current workflow state (null if no workflow loaded) */
  currentWorkflow: PrdWorkflowState | null

  /** List of all workflows for the active project */
  workflows: WorkflowInfo[]

  /** Dependency validation result (cached) */
  dependencyValidation: DependencyValidationResult | null

  /** Execution order (topological sort, cached) */
  executionOrder: string[]

  /** Ready requirements (cached) */
  readyRequirements: PrdWorkflowRequirement[]

  /** Research running status */
  isResearchRunning: boolean

  /** Export result (after export) */
  lastExportResult: PrdWorkflowExportResult | null
}

// ============================================================================
// Actions Interface
// ============================================================================

interface PrdWorkflowStoreActions {
  // Workflow Lifecycle
  createWorkflow: (
    projectPath: string,
    workflowId: string,
    mode: WorkflowMode,
    chatSessionId?: string
  ) => Promise<PrdWorkflowState>
  loadWorkflow: (projectPath: string, workflowId: string) => Promise<void>
  listWorkflows: (projectPath: string) => Promise<void>
  deleteWorkflow: (projectPath: string, workflowId: string) => Promise<void>
  setCurrentWorkflow: (workflow: PrdWorkflowState | null) => void

  // Phase Management
  advancePhase: (projectPath: string, workflowId: string) => Promise<void>
  goBackPhase: (projectPath: string, workflowId: string) => Promise<void>
  skipPhase: (projectPath: string, workflowId: string) => Promise<void>
  setPhase: (projectPath: string, workflowId: string, phase: WorkflowPhase) => Promise<void>

  // Context & Spec
  updateContext: (
    projectPath: string,
    workflowId: string,
    context: ProjectContext
  ) => Promise<void>
  updateSpec: (projectPath: string, workflowId: string, spec: SpecState) => Promise<void>

  // Research
  updateResearchConfig: (
    projectPath: string,
    workflowId: string,
    config: ResearchConfig
  ) => Promise<void>
  getResearchFiles: (projectPath: string, workflowId: string) => Promise<string[]>
  readResearchFile: (
    projectPath: string,
    workflowId: string,
    filename: string
  ) => Promise<string>
  saveResearchResult: (
    projectPath: string,
    workflowId: string,
    agentId: string,
    content: string,
    outputFilename: string
  ) => Promise<string>
  saveResearchSynthesis: (
    projectPath: string,
    workflowId: string,
    synthesisContent: string
  ) => Promise<string>
  setResearchRunning: (running: boolean) => void

  // Requirements
  upsertRequirement: (
    projectPath: string,
    workflowId: string,
    requirement: PrdWorkflowRequirement
  ) => Promise<void>
  addRequirement: (
    projectPath: string,
    workflowId: string,
    category: PrdWorkflowCategory,
    title: string,
    description: string,
    dependsOn?: string[],
    scope?: PrdWorkflowScopeLevel
  ) => Promise<string>
  deleteRequirement: (
    projectPath: string,
    workflowId: string,
    requirementId: string
  ) => Promise<void>
  updateRequirementScope: (
    projectPath: string,
    workflowId: string,
    requirementId: string,
    scope: PrdWorkflowScopeLevel
  ) => Promise<void>
  updateRequirementStatus: (
    projectPath: string,
    workflowId: string,
    requirementId: string,
    status: RequirementStatus
  ) => Promise<void>
  applyScopeSelection: (
    projectPath: string,
    workflowId: string,
    selection: PrdWorkflowScopeSelection
  ) => Promise<void>

  // Dependencies
  addDependency: (
    projectPath: string,
    workflowId: string,
    fromRequirementId: string,
    dependsOnId: string
  ) => Promise<void>
  removeDependency: (
    projectPath: string,
    workflowId: string,
    fromRequirementId: string,
    dependsOnId: string
  ) => Promise<void>
  validateDependencies: (projectPath: string, workflowId: string) => Promise<void>
  refreshExecutionOrder: (projectPath: string, workflowId: string) => Promise<void>
  refreshReadyRequirements: (projectPath: string, workflowId: string) => Promise<void>

  // Planning & Export
  generateRoadmap: (projectPath: string, workflowId: string) => Promise<string>
  exportToPrd: (
    projectPath: string,
    workflowId: string,
    prdName: string
  ) => Promise<PrdWorkflowExportResult>
  generateAgentsMd: (
    projectPath: string,
    workflowId: string,
    content: string
  ) => Promise<string>
  updateExecutionMode: (
    projectPath: string,
    workflowId: string,
    mode: ExecutionMode
  ) => Promise<void>

  // Utility
  clearError: () => void
  reset: () => void
}

type PrdWorkflowStore = PrdWorkflowStoreState & PrdWorkflowStoreActions

// ============================================================================
// Initial State
// ============================================================================

const initialState: PrdWorkflowStoreState = {
  currentWorkflow: null,
  workflows: [],
  dependencyValidation: null,
  executionOrder: [],
  readyRequirements: [],
  isResearchRunning: false,
  lastExportResult: null,
  loading: false,
  error: null,
}

// ============================================================================
// Store Implementation
// ============================================================================

export const usePrdWorkflowStore = create<PrdWorkflowStore>((set, get) => ({
  ...initialState,

  // ==========================================================================
  // Workflow Lifecycle
  // ==========================================================================

  createWorkflow: async (projectPath, workflowId, mode, chatSessionId) => {
    const workflow = await prdWorkflowApi.createWorkflow(
      projectPath,
      workflowId,
      mode,
      chatSessionId
    )
    set({
      currentWorkflow: workflow,
      dependencyValidation: null,
      executionOrder: [],
      readyRequirements: [],
    })
    // Refresh workflows list
    await get().listWorkflows(projectPath)
    return workflow
  },

  loadWorkflow: async (projectPath, workflowId) => {
    await asyncAction(set, async () => {
      const workflow = await prdWorkflowApi.getWorkflow(projectPath, workflowId)
      return {
        currentWorkflow: workflow,
        dependencyValidation: null,
        executionOrder: [],
        readyRequirements: [],
      }
    })
  },

  listWorkflows: async (projectPath) => {
    await asyncAction(
      set,
      async () => {
        const workflows = await prdWorkflowApi.listWorkflows(projectPath)
        return { workflows }
      },
      { silent: true }
    )
  },

  deleteWorkflow: async (projectPath, workflowId) => {
    await prdWorkflowApi.deleteWorkflow(projectPath, workflowId)
    set((state) => ({
      workflows: state.workflows.filter((w) => w.id !== workflowId),
      currentWorkflow: state.currentWorkflow?.id === workflowId ? null : state.currentWorkflow,
    }))
  },

  setCurrentWorkflow: (workflow) => {
    set({
      currentWorkflow: workflow,
      dependencyValidation: null,
      executionOrder: [],
      readyRequirements: [],
    })
  },

  // ==========================================================================
  // Phase Management
  // ==========================================================================

  advancePhase: async (projectPath, workflowId) => {
    try {
      const workflow = await prdWorkflowApi.advancePhase(projectPath, workflowId)
      set({ currentWorkflow: workflow })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  goBackPhase: async (projectPath, workflowId) => {
    try {
      const workflow = await prdWorkflowApi.goBackPhase(projectPath, workflowId)
      set({ currentWorkflow: workflow })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  skipPhase: async (projectPath, workflowId) => {
    try {
      const workflow = await prdWorkflowApi.skipPhase(projectPath, workflowId)
      set({ currentWorkflow: workflow })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  setPhase: async (projectPath, workflowId, phase) => {
    try {
      const workflow = await prdWorkflowApi.setPhase(projectPath, workflowId, phase)
      set({ currentWorkflow: workflow })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  // ==========================================================================
  // Context & Spec
  // ==========================================================================

  updateContext: async (projectPath, workflowId, context) => {
    try {
      const workflow = await prdWorkflowApi.updateContext(projectPath, workflowId, context)
      set({ currentWorkflow: workflow })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  updateSpec: async (projectPath, workflowId, spec) => {
    try {
      const workflow = await prdWorkflowApi.updateSpec(projectPath, workflowId, spec)
      set({ currentWorkflow: workflow })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  // ==========================================================================
  // Research
  // ==========================================================================

  updateResearchConfig: async (projectPath, workflowId, config) => {
    try {
      const workflow = await prdWorkflowApi.updateResearchConfig(projectPath, workflowId, config)
      set({ currentWorkflow: workflow })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  getResearchFiles: async (projectPath, workflowId) => {
    return await prdWorkflowApi.getResearchFiles(projectPath, workflowId)
  },

  readResearchFile: async (projectPath, workflowId, filename) => {
    return await prdWorkflowApi.readResearchFile(projectPath, workflowId, filename)
  },

  saveResearchResult: async (projectPath, workflowId, agentId, content, outputFilename) => {
    return await prdWorkflowApi.saveResearchResult(
      projectPath,
      workflowId,
      agentId,
      content,
      outputFilename
    )
  },

  saveResearchSynthesis: async (projectPath, workflowId, synthesisContent) => {
    return await prdWorkflowApi.saveResearchSynthesis(projectPath, workflowId, synthesisContent)
  },

  setResearchRunning: (running) => {
    set({ isResearchRunning: running })
  },

  // ==========================================================================
  // Requirements
  // ==========================================================================

  upsertRequirement: async (projectPath, workflowId, requirement) => {
    try {
      const workflow = await prdWorkflowApi.upsertRequirement(projectPath, workflowId, requirement)
      set({ currentWorkflow: workflow, dependencyValidation: null })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  addRequirement: async (projectPath, workflowId, category, title, description, dependsOn, scope) => {
    try {
      const result = await prdWorkflowApi.addRequirement(
        projectPath,
        workflowId,
        category,
        title,
        description,
        dependsOn,
        scope
      )
      set({ currentWorkflow: result.state, dependencyValidation: null })
      return result.id
    } catch (error) {
      set({ error: errorToString(error) })
      throw error
    }
  },

  deleteRequirement: async (projectPath, workflowId, requirementId) => {
    try {
      const workflow = await prdWorkflowApi.deleteRequirement(projectPath, workflowId, requirementId)
      set({ currentWorkflow: workflow, dependencyValidation: null })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  updateRequirementScope: async (projectPath, workflowId, requirementId, scope) => {
    try {
      const workflow = await prdWorkflowApi.updateRequirementScope(
        projectPath,
        workflowId,
        requirementId,
        scope
      )
      set({ currentWorkflow: workflow })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  updateRequirementStatus: async (projectPath, workflowId, requirementId, status) => {
    try {
      const workflow = await prdWorkflowApi.updateRequirementStatus(
        projectPath,
        workflowId,
        requirementId,
        status
      )
      set({ currentWorkflow: workflow })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  applyScopeSelection: async (projectPath, workflowId, selection) => {
    try {
      const workflow = await prdWorkflowApi.applyScopeSelection(projectPath, workflowId, selection)
      set({ currentWorkflow: workflow })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  // ==========================================================================
  // Dependencies
  // ==========================================================================

  addDependency: async (projectPath, workflowId, fromRequirementId, dependsOnId) => {
    try {
      const workflow = await prdWorkflowApi.addDependency(
        projectPath,
        workflowId,
        fromRequirementId,
        dependsOnId
      )
      set({ currentWorkflow: workflow, dependencyValidation: null })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  removeDependency: async (projectPath, workflowId, fromRequirementId, dependsOnId) => {
    try {
      const workflow = await prdWorkflowApi.removeDependency(
        projectPath,
        workflowId,
        fromRequirementId,
        dependsOnId
      )
      set({ currentWorkflow: workflow, dependencyValidation: null })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  validateDependencies: async (projectPath, workflowId) => {
    try {
      const result = await prdWorkflowApi.validateDependencies(projectPath, workflowId)
      set({ dependencyValidation: result })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  refreshExecutionOrder: async (projectPath, workflowId) => {
    try {
      const order = await prdWorkflowApi.getExecutionOrder(projectPath, workflowId)
      set({ executionOrder: order })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  refreshReadyRequirements: async (projectPath, workflowId) => {
    try {
      const ready = await prdWorkflowApi.getReadyRequirements(projectPath, workflowId)
      set({ readyRequirements: ready })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  // ==========================================================================
  // Planning & Export
  // ==========================================================================

  generateRoadmap: async (projectPath, workflowId) => {
    try {
      return await prdWorkflowApi.generateRoadmap(projectPath, workflowId)
    } catch (error) {
      set({ error: errorToString(error) })
      throw error
    }
  },

  exportToPrd: async (projectPath, workflowId, prdName) => {
    try {
      const result = await prdWorkflowApi.exportToPrd(projectPath, workflowId, prdName)
      set({ lastExportResult: result })
      return result
    } catch (error) {
      set({ error: errorToString(error) })
      throw error
    }
  },

  generateAgentsMd: async (projectPath, workflowId, content) => {
    try {
      return await prdWorkflowApi.generateAgentsMd(projectPath, workflowId, content)
    } catch (error) {
      set({ error: errorToString(error) })
      throw error
    }
  },

  updateExecutionMode: async (projectPath, workflowId, mode) => {
    try {
      const workflow = await prdWorkflowApi.updateExecutionMode(projectPath, workflowId, mode)
      set({ currentWorkflow: workflow })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  // ==========================================================================
  // Utility
  // ==========================================================================

  clearError: () => {
    set({ error: null })
  },

  reset: () => {
    set(initialState)
  },
}))

// ============================================================================
// Selectors (computed values)
// ============================================================================

/**
 * Get requirements grouped by category
 */
export function getRequirementsByCategory(workflow: PrdWorkflowState | null) {
  if (!workflow) return {}
  const grouped: Record<PrdWorkflowCategory, PrdWorkflowRequirement[]> = {
    core: [],
    ui: [],
    data: [],
    integration: [],
    security: [],
    performance: [],
    testing: [],
    documentation: [],
    other: [],
  }
  for (const req of Object.values(workflow.requirements)) {
    grouped[req.category].push(req)
  }
  return grouped
}

/**
 * Get requirements grouped by scope
 */
export function getRequirementsByScope(workflow: PrdWorkflowState | null) {
  if (!workflow) return {}
  const grouped: Record<PrdWorkflowScopeLevel, PrdWorkflowRequirement[]> = {
    v1: [],
    v2: [],
    out_of_scope: [],
    unscoped: [],
  }
  for (const req of Object.values(workflow.requirements)) {
    grouped[req.scope].push(req)
  }
  return grouped
}

/**
 * Get total requirement counts
 */
export function getRequirementCounts(workflow: PrdWorkflowState | null) {
  if (!workflow) return { total: 0, v1: 0, v2: 0, outOfScope: 0, unscoped: 0 }
  const reqs = Object.values(workflow.requirements)
  return {
    total: reqs.length,
    v1: reqs.filter((r) => r.scope === 'v1').length,
    v2: reqs.filter((r) => r.scope === 'v2').length,
    outOfScope: reqs.filter((r) => r.scope === 'out_of_scope').length,
    unscoped: reqs.filter((r) => r.scope === 'unscoped').length,
  }
}

/**
 * Check if workflow context is complete
 */
export function isContextComplete(workflow: PrdWorkflowState | null): boolean {
  if (!workflow) return false
  const { context } = workflow
  return Boolean(context.what && context.why && context.who && context.done)
}

/**
 * Get missing context items
 */
export function getMissingContextItems(workflow: PrdWorkflowState | null): string[] {
  if (!workflow) return ['what', 'why', 'who', 'done']
  const { context } = workflow
  const missing: string[] = []
  if (!context.what) missing.push('what')
  if (!context.why) missing.push('why')
  if (!context.who) missing.push('who')
  if (!context.done) missing.push('done')
  return missing
}

/**
 * Calculate workflow completion percentage
 */
export function getWorkflowCompletion(workflow: PrdWorkflowState | null): number {
  if (!workflow) return 0
  const totalPhases = 5
  const completePhases = Object.values(workflow.phaseStatuses).filter(
    (status) => status === 'complete' || status === 'skipped'
  ).length
  return Math.round((completePhases / totalPhases) * 100)
}
