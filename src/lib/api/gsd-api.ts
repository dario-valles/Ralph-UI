// GSD Workflow API wrappers

import type { AgentType } from '@/types'
import type {
  GsdWorkflowState,
  GsdPhase,
  QuestioningContext,
  ResearchStatus,
  ResearchResult,
  ResearchSynthesis,
  PlanningSessionInfo,
  RequirementsValidationResult,
} from '@/types/gsd'
import type {
  RequirementsDoc,
  Requirement,
  RoadmapDoc,
  VerificationIterationResult,
  VerificationHistory,
  ScopeSelection,
  ConversionResult,
  PrdExecutionConfig,
} from '@/types/planning'
import { invoke } from '../invoke'

export const gsdApi = {
  /** Start a new GSD workflow session */
  startSession: async (projectPath: string, chatSessionId: string): Promise<GsdWorkflowState> => {
    return await invoke('start_gsd_session', { projectPath, chatSessionId })
  },

  /** Get the current GSD workflow state for a session */
  getState: async (projectPath: string, sessionId: string): Promise<GsdWorkflowState | null> => {
    return await invoke('get_gsd_state', { projectPath, sessionId })
  },

  /** Update the GSD workflow phase */
  updatePhase: async (
    projectPath: string,
    sessionId: string,
    phase: GsdPhase
  ): Promise<GsdWorkflowState> => {
    return await invoke('update_gsd_phase', { projectPath, sessionId, phase })
  },

  /** Update questioning context */
  updateQuestioningContext: async (
    projectPath: string,
    sessionId: string,
    context: QuestioningContext
  ): Promise<GsdWorkflowState> => {
    return await invoke('update_questioning_context', { projectPath, sessionId, context })
  },

  /** Generate PROJECT.md from questioning context */
  generateProjectDocument: async (projectPath: string, sessionId: string): Promise<string> => {
    return await invoke('generate_project_document', { projectPath, sessionId })
  },

  /** Start parallel research agents */
  startResearch: async (
    projectPath: string,
    sessionId: string,
    context: string,
    agentType?: string,
    model?: string,
    researchTypes?: string[]
  ): Promise<ResearchStatus> => {
    return await invoke('start_research', { projectPath, sessionId, context, agentType, model, researchTypes })
  },

  /** Get research results for a session */
  getResearchResults: async (projectPath: string, sessionId: string): Promise<ResearchResult[]> => {
    return await invoke('get_research_results', { projectPath, sessionId })
  },

  /** Synthesize research into SUMMARY.md */
  synthesizeResearch: async (
    projectPath: string,
    sessionId: string
  ): Promise<ResearchSynthesis> => {
    return await invoke('synthesize_research_cmd', { projectPath, sessionId })
  },

  /** Load existing research synthesis from disk (for restoring state on reload) */
  loadSynthesis: async (
    projectPath: string,
    sessionId: string
  ): Promise<ResearchSynthesis | null> => {
    return await invoke('load_synthesis', { projectPath, sessionId })
  },

  /** Generate requirements from research output */
  generateRequirementsFromResearch: async (
    projectPath: string,
    sessionId: string
  ): Promise<RequirementsDoc> => {
    return await invoke('generate_requirements_from_research', { projectPath, sessionId })
  },

  /** Apply scope selections to requirements */
  scopeRequirements: async (
    projectPath: string,
    sessionId: string,
    selections: ScopeSelection
  ): Promise<RequirementsDoc> => {
    return await invoke('scope_requirements', { projectPath, sessionId, selections })
  },

  /** Validate requirements quality */
  validateRequirements: async (
    projectPath: string,
    sessionId: string
  ): Promise<RequirementsValidationResult> => {
    return await invoke('validate_requirements', { projectPath, sessionId })
  },

  /** Add a custom requirement to the requirements document */
  addRequirement: async (
    projectPath: string,
    sessionId: string,
    category: string,
    title: string,
    description: string
  ): Promise<Requirement> => {
    return await invoke('add_requirement', { projectPath, sessionId, category, title, description })
  },

  /** Save requirements document */
  saveRequirements: async (
    projectPath: string,
    sessionId: string,
    requirements: RequirementsDoc
  ): Promise<void> => {
    return await invoke('save_requirements', { projectPath, sessionId, requirements })
  },

  /** Load requirements document */
  loadRequirements: async (
    projectPath: string,
    sessionId: string
  ): Promise<RequirementsDoc | null> => {
    return await invoke('load_requirements', { projectPath, sessionId })
  },

  /** Create roadmap from requirements */
  createRoadmap: async (projectPath: string, sessionId: string): Promise<RoadmapDoc> => {
    return await invoke('create_roadmap', { projectPath, sessionId })
  },

  /** Load roadmap document */
  loadRoadmap: async (projectPath: string, sessionId: string): Promise<RoadmapDoc | null> => {
    return await invoke('load_roadmap', { projectPath, sessionId })
  },

  /** Verify plans for completeness (with iteration tracking) */
  verifyPlans: async (
    projectPath: string,
    sessionId: string
  ): Promise<VerificationIterationResult> => {
    return await invoke('verify_gsd_plans', { projectPath, sessionId })
  },

  /** Get verification history for a session */
  getVerificationHistory: async (
    projectPath: string,
    sessionId: string
  ): Promise<VerificationHistory | null> => {
    return await invoke('get_verification_history', { projectPath, sessionId })
  },

  /** Clear verification history (start fresh) */
  clearVerificationHistory: async (projectPath: string, sessionId: string): Promise<void> => {
    return await invoke('clear_verification_history', { projectPath, sessionId })
  },

  /** Export GSD plans to Ralph PRD format */
  exportToRalph: async (
    projectPath: string,
    sessionId: string,
    prdName: string,
    branch: string,
    includeV2?: boolean,
    executionConfig?: PrdExecutionConfig
  ): Promise<ConversionResult> => {
    return await invoke('export_gsd_to_ralph', {
      projectPath,
      sessionId,
      prdName,
      branch,
      includeV2,
      executionConfig,
    })
  },

  /** Save a planning file (generic) */
  savePlanningFile: async (
    projectPath: string,
    sessionId: string,
    fileType: 'project' | 'summary' | 'requirements' | 'scoped' | 'roadmap' | 'verification',
    content: string
  ): Promise<string> => {
    return await invoke('save_planning_file', { projectPath, sessionId, fileType, content })
  },

  /** Read a planning file (generic) */
  readPlanningFile: async (
    projectPath: string,
    sessionId: string,
    fileType: 'project' | 'summary' | 'requirements' | 'scoped' | 'roadmap' | 'verification'
  ): Promise<string | null> => {
    return await invoke('read_gsd_planning_file', { projectPath, sessionId, fileType })
  },

  /** List all planning sessions for a project */
  listSessions: async (projectPath: string): Promise<PlanningSessionInfo[]> => {
    return await invoke('list_gsd_sessions', { projectPath })
  },

  /** Delete a planning session */
  deleteSession: async (projectPath: string, sessionId: string): Promise<void> => {
    return await invoke('delete_gsd_session', { projectPath, sessionId })
  },

  /** Get list of available CLI agents for research */
  getAvailableAgents: async (): Promise<AgentType[]> => {
    return await invoke('get_available_research_agents')
  },
}
