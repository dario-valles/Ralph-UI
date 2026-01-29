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
  ResearchSessionInfo,
  CloneSessionOptions,
  RequirementsValidationResult,
  GeneratedRequirement,
  GenerateRequirementsResult,
  ProjectTypeDetection,
  ContextQualityReport,
  ContextSuggestions,
  GeneratedIdea,
  ProjectType,
  ValidatedIdea,
  VariationDimension,
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
    return await invoke('start_research', {
      projectPath,
      sessionId,
      context,
      agentType,
      model,
      researchTypes,
    })
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

  /** List all sessions with research results for a project */
  listProjectResearch: async (projectPath: string): Promise<ResearchSessionInfo[]> => {
    return await invoke('list_project_research', { projectPath })
  },

  /** Copy research files from one session to another */
  copyResearchToSession: async (
    projectPath: string,
    sourceSessionId: string,
    targetSessionId: string,
    researchTypes?: string[]
  ): Promise<number> => {
    return await invoke('copy_research_to_session', {
      projectPath,
      sourceSessionId,
      targetSessionId,
      researchTypes,
    })
  },

  /** Clone a GSD session with specified options */
  cloneSession: async (
    projectPath: string,
    sourceSessionId: string,
    options: CloneSessionOptions
  ): Promise<GsdWorkflowState> => {
    return await invoke('clone_gsd_session', {
      projectPath,
      sourceSessionId,
      options,
    })
  },

  /** Generate requirements from a natural language prompt using AI */
  generateRequirementsFromPrompt: async (
    projectPath: string,
    sessionId: string,
    prompt: string,
    count?: number,
    agentType?: string,
    model?: string
  ): Promise<GenerateRequirementsResult> => {
    return await invoke('generate_requirements_from_prompt', {
      projectPath,
      sessionId,
      prompt,
      count,
      agentType,
      model,
    })
  },

  /** Add multiple generated requirements to the requirements document */
  addGeneratedRequirements: async (
    projectPath: string,
    sessionId: string,
    requirements: GeneratedRequirement[]
  ): Promise<Requirement[]> => {
    return await invoke('add_generated_requirements', {
      projectPath,
      sessionId,
      requirements,
    })
  },

  /** Detect project type from configuration files */
  detectProjectType: async (projectPath: string): Promise<ProjectTypeDetection> => {
    return await invoke('detect_project_type', { projectPath })
  },

  /** Analyze context quality using AI */
  analyzeContextQuality: async (
    context: QuestioningContext,
    projectType?: ProjectType
  ): Promise<ContextQualityReport> => {
    return await invoke('analyze_context_quality', { context, projectType })
  },

  /** Generate smart context suggestions using AI */
  generateContextSuggestions: async (
    projectType: ProjectType,
    context: QuestioningContext
  ): Promise<ContextSuggestions> => {
    return await invoke('generate_context_suggestions', { projectType, context })
  },

  /** Improve context using AI */
  improveContextWithAi: async (
    context: QuestioningContext,
    projectType?: ProjectType
  ): Promise<QuestioningContext> => {
    return await invoke('improve_context_with_ai', { context, projectType })
  },

  /** Generate project idea starters using AI */
  generateIdeaStarters: async (
    projectType: ProjectType,
    context: QuestioningContext
  ): Promise<GeneratedIdea[]> => {
    return await invoke('generate_idea_starters', { projectType, context })
  },

  /** Generate idea variations based on dimensions */
  generateIdeaVariations: async (
    projectType: ProjectType,
    context: QuestioningContext,
    variationDimensions: VariationDimension[],
    count: number = 3
  ): Promise<ValidatedIdea[]> => {
    return await invoke('generate_idea_variations', {
      projectType,
      context,
      variationDimensions,
      count,
    })
  },

  /** Analyze market opportunity for an idea */
  analyzeMarketOpportunity: async (
    idea: GeneratedIdea
  ): Promise<import('@/types/gsd').MarketOpportunity> => {
    return await invoke('analyze_market_opportunity', { idea })
  },

  /** Validate technical feasibility of an idea */
  validateIdeaFeasibility: async (
    idea: GeneratedIdea,
    projectType: ProjectType
  ): Promise<import('@/types/gsd').IdeaFeasibility> => {
    return await invoke('validate_idea_feasibility', { idea, projectType })
  },

  /** Explore idea space from interests */
  exploreIdeaSpace: async (
    domain: string,
    interests: string[],
    count: number = 5
  ): Promise<ValidatedIdea[]> => {
    return await invoke('explore_idea_space', { domain, interests, count })
  },
}
