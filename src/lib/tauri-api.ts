// Tauri API wrappers for backend commands

import type {
  PRDDocument,
  PRDFile,
  PRDTemplate,
  CreatePRDRequest,
  UpdatePRDRequest,
  ChatSession,
  ChatMessage,
  SendMessageResponse,
  QualityAssessment,
  GuidedQuestion,
  ExtractedPRDContent,
  PRDTypeValue,
  Project,
  IterationRecord,
  ExecutionStateSnapshot,
  IterationStats,
  RalphLoopSnapshot,
  AgentType,
} from '@/types'
import { invoke } from './invoke'

// PRD API
export const prdApi = {
  create: async (request: CreatePRDRequest): Promise<PRDDocument> => {
    return await invoke('create_prd', { request })
  },

  getById: async (id: string): Promise<PRDDocument> => {
    return await invoke('get_prd', { id })
  },

  update: async (request: UpdatePRDRequest): Promise<PRDDocument> => {
    return await invoke('update_prd', { request })
  },

  delete: async (id: string): Promise<void> => {
    return await invoke('delete_prd', { id })
  },

  list: async (): Promise<PRDDocument[]> => {
    return await invoke('list_prds')
  },

  listTemplates: async (): Promise<PRDTemplate[]> => {
    return await invoke('list_prd_templates')
  },

  export: async (prdId: string, format: 'json' | 'markdown' | 'yaml'): Promise<string> => {
    return await invoke('export_prd', { prdId, format })
  },

  analyzeQuality: async (prdId: string): Promise<PRDDocument> => {
    return await invoke('analyze_prd_quality', { prdId })
  },

  /** Scan .ralph-ui/prds/ directory for PRD markdown files */
  scanFiles: async (projectPath: string): Promise<PRDFile[]> => {
    return await invoke('scan_prd_files', { projectPath })
  },

  /** Get a PRD file by name */
  getFile: async (projectPath: string, prdName: string): Promise<PRDFile> => {
    return await invoke('get_prd_file', { projectPath, prdName })
  },

  /** Update a PRD file's content */
  updateFile: async (projectPath: string, prdName: string, content: string): Promise<PRDFile> => {
    return await invoke('update_prd_file', { projectPath, prdName, content })
  },
}

// PRD Chat API
export const prdChatApi = {
  startSession: async (
    agentType: string,
    projectPath: string,
    prdId?: string,
    prdType?: PRDTypeValue,
    guidedMode?: boolean,
    templateId?: string,
    structuredMode?: boolean,
    gsdMode?: boolean
  ): Promise<ChatSession> => {
    return await invoke('start_prd_chat_session', {
      request: { agentType, projectPath, prdId, prdType, guidedMode, templateId, structuredMode, gsdMode },
    })
  },

  sendMessage: async (
    sessionId: string,
    content: string,
    projectPath: string
  ): Promise<SendMessageResponse> => {
    return await invoke('send_prd_chat_message', {
      request: { sessionId, content, projectPath },
    })
  },

  getHistory: async (sessionId: string, projectPath: string): Promise<ChatMessage[]> => {
    return await invoke('get_prd_chat_history', { sessionId, projectPath })
  },

  getSessions: async (projectPath: string): Promise<ChatSession[]> => {
    return await invoke('list_prd_chat_sessions', { projectPath })
  },

  /** Update agent type for a session */
  updateSessionAgent: async (
    sessionId: string,
    projectPath: string,
    agentType: string
  ): Promise<void> => {
    return await invoke('update_prd_chat_agent', { sessionId, projectPath, agentType })
  },

  deleteSession: async (sessionId: string, projectPath: string): Promise<void> => {
    return await invoke('delete_prd_chat_session', { sessionId, projectPath })
  },

  /** Assess the quality of a PRD chat session before export */
  assessQuality: async (sessionId: string, projectPath: string): Promise<QualityAssessment> => {
    return await invoke('assess_prd_quality', { sessionId, projectPath })
  },

  /** Get guided questions based on PRD type */
  getGuidedQuestions: async (prdType: PRDTypeValue): Promise<GuidedQuestion[]> => {
    return await invoke('get_guided_questions', { prdType })
  },

  /** Preview extracted PRD content before export */
  previewExtraction: async (
    sessionId: string,
    projectPath: string
  ): Promise<ExtractedPRDContent> => {
    return await invoke('preview_prd_extraction', { sessionId, projectPath })
  },

  /** Check if an agent CLI is available in the system PATH */
  checkAgentAvailability: async (agentType: string): Promise<AgentAvailabilityResult> => {
    return await invoke('check_agent_availability', { agentType })
  },

  /** Set structured output mode for a session */
  setStructuredMode: async (
    sessionId: string,
    projectPath: string,
    enabled: boolean
  ): Promise<void> => {
    return await invoke('set_structured_mode', { sessionId, projectPath, enabled })
  },

  /** Clear extracted structure for a session */
  clearExtractedStructure: async (sessionId: string, projectPath: string): Promise<void> => {
    return await invoke('clear_extracted_structure', { sessionId, projectPath })
  },

  /** Start watching a PRD plan file for changes */
  startWatchingPlanFile: async (
    sessionId: string,
    projectPath: string
  ): Promise<WatchFileResponse> => {
    return await invoke('start_watching_prd_file', { sessionId, projectPath })
  },

  /** Stop watching a PRD plan file */
  stopWatchingPlanFile: async (sessionId: string): Promise<boolean> => {
    return await invoke('stop_watching_prd_file', { sessionId })
  },

  /** Get the current content of a PRD plan file */
  getPlanContent: async (sessionId: string, projectPath: string): Promise<string | null> => {
    return await invoke('get_prd_plan_content', { sessionId, projectPath })
  },
}

// Project API
export const projectApi = {
  /** Register (or get existing) project from a folder path */
  register: async (path: string, name?: string): Promise<Project> => {
    return await invoke('register_project', { path, name })
  },

  /** Get a project by ID */
  getById: async (projectId: string): Promise<Project> => {
    return await invoke('get_project', { projectId })
  },

  /** Get a project by path */
  getByPath: async (path: string): Promise<Project> => {
    return await invoke('get_project_by_path', { path })
  },

  /** Get all projects */
  getAll: async (): Promise<Project[]> => {
    return await invoke('get_all_projects')
  },

  /** Get recent projects */
  getRecent: async (limit?: number): Promise<Project[]> => {
    return await invoke('get_recent_projects', { limit })
  },

  /** Get favorite projects */
  getFavorites: async (): Promise<Project[]> => {
    return await invoke('get_favorite_projects')
  },

  /** Update project name */
  updateName: async (projectId: string, name: string): Promise<void> => {
    return await invoke('update_project_name', { projectId, name })
  },

  /** Toggle project favorite status */
  toggleFavorite: async (projectId: string): Promise<boolean> => {
    return await invoke('toggle_project_favorite', { projectId })
  },

  /** Set project favorite status explicitly */
  setFavorite: async (projectId: string, isFavorite: boolean): Promise<void> => {
    return await invoke('set_project_favorite', { projectId, isFavorite })
  },

  /** Touch project (update last_used_at) */
  touch: async (projectId: string): Promise<void> => {
    return await invoke('touch_project', { projectId })
  },

  /** Delete a project */
  delete: async (projectId: string): Promise<void> => {
    return await invoke('delete_project', { projectId })
  },
}

export interface AgentAvailabilityResult {
  available: boolean
  agent: string
  path: string | null
  error: string | null
}

export interface WatchFileResponse {
  success: boolean
  path: string
  initialContent: string | null
  error: string | null
}

// Mission Control types and API
export interface ActivityEvent {
  id: string
  timestamp: string
  eventType:
    | 'task_completed'
    | 'task_started'
    | 'task_failed'
    | 'agent_spawned'
    | 'session_started'
    | 'session_completed'
  projectPath: string
  projectName: string
  sessionName: string
  description: string
}

export interface GlobalStats {
  activeAgentsCount: number
  tasksInProgress: number
  tasksCompletedToday: number
  totalCostToday: number
  activeProjectsCount: number
  totalProjects: number
}

// Mission Control API
export const missionControlApi = {
  /** Get activity feed for Mission Control dashboard */
  getActivityFeed: async (limit?: number, offset?: number): Promise<ActivityEvent[]> => {
    return await invoke('get_activity_feed', { limit, offset })
  },

  /** Get global statistics for Mission Control dashboard */
  getGlobalStats: async (): Promise<GlobalStats> => {
    return await invoke('get_global_stats')
  },
}

// Import Ralph Loop types
import type {
  RalphPrd,
  RalphPrdStatus,
  RalphProgressSummary,
  RalphFiles,
  RalphConfig,
  InitRalphPrdRequest,
  RalphStoryInput,
  StartRalphLoopRequest,
  RalphLoopState,
  RalphLoopMetrics,
  RalphWorktreeInfo,
} from '@/types'

// Ralph Wiggum Loop API
export const ralphLoopApi = {
  /** Initialize a Ralph PRD at .ralph/prd.json */
  initPrd: async (request: InitRalphPrdRequest): Promise<RalphPrd> => {
    return await invoke('init_ralph_prd', { request })
  },

  /** Read the Ralph PRD from .ralph-ui/prds/{prdName}.json */
  getPrd: async (projectPath: string, prdName: string): Promise<RalphPrd> => {
    return await invoke('get_ralph_prd', { projectPath, prdName })
  },

  /** Get the status of the Ralph PRD */
  getPrdStatus: async (projectPath: string, prdName: string): Promise<RalphPrdStatus> => {
    return await invoke('get_ralph_prd_status', { projectPath, prdName })
  },

  /** Mark a story as passing in the PRD */
  markStoryPassing: async (projectPath: string, storyId: string): Promise<boolean> => {
    return await invoke('mark_ralph_story_passing', { projectPath, storyId })
  },

  /** Mark a story as failing in the PRD */
  markStoryFailing: async (projectPath: string, storyId: string): Promise<boolean> => {
    return await invoke('mark_ralph_story_failing', { projectPath, storyId })
  },

  /** Add a story to the PRD */
  addStory: async (projectPath: string, story: RalphStoryInput): Promise<void> => {
    return await invoke('add_ralph_story', { projectPath, story })
  },

  /** Remove a story from the PRD */
  removeStory: async (projectPath: string, storyId: string): Promise<boolean> => {
    return await invoke('remove_ralph_story', { projectPath, storyId })
  },

  /** Get progress.txt content */
  getProgress: async (projectPath: string, prdName: string): Promise<string> => {
    return await invoke('get_ralph_progress', { projectPath, prdName })
  },

  /** Get progress summary */
  getProgressSummary: async (
    projectPath: string,
    prdName: string
  ): Promise<RalphProgressSummary> => {
    return await invoke('get_ralph_progress_summary', { projectPath, prdName })
  },

  /** Add a note to progress.txt */
  addProgressNote: async (projectPath: string, iteration: number, note: string): Promise<void> => {
    return await invoke('add_ralph_progress_note', { projectPath, iteration, note })
  },

  /** Clear progress.txt and reinitialize */
  clearProgress: async (projectPath: string): Promise<void> => {
    return await invoke('clear_ralph_progress', { projectPath })
  },

  /** Get the prompt.md content */
  getPrompt: async (projectPath: string, prdName: string): Promise<string> => {
    return await invoke('get_ralph_prompt', { projectPath, prdName })
  },

  /** Update the prompt.md content */
  setPrompt: async (projectPath: string, content: string): Promise<void> => {
    return await invoke('set_ralph_prompt', { projectPath, content })
  },

  /** Start a Ralph loop execution */
  startLoop: async (request: StartRalphLoopRequest): Promise<string> => {
    return await invoke('start_ralph_loop', { request })
  },

  /** Stop a running Ralph loop */
  stopLoop: async (executionId: string): Promise<void> => {
    return await invoke('stop_ralph_loop', { executionId })
  },

  /** Get the state of a Ralph loop execution */
  getLoopState: async (executionId: string): Promise<RalphLoopState> => {
    return await invoke('get_ralph_loop_state', { executionId })
  },

  /** Get metrics for a Ralph loop execution */
  getLoopMetrics: async (executionId: string): Promise<RalphLoopMetrics> => {
    return await invoke('get_ralph_loop_metrics', { executionId })
  },

  /** List all active Ralph loop executions */
  listExecutions: async (): Promise<string[]> => {
    return await invoke('list_ralph_loop_executions')
  },

  /** Get current agent ID for terminal connection */
  getCurrentAgentId: async (executionId: string): Promise<string | null> => {
    return await invoke('get_ralph_loop_current_agent', { executionId })
  },

  /** Get worktree path for a Ralph loop execution */
  getWorktreePath: async (executionId: string): Promise<string | null> => {
    return await invoke('get_ralph_loop_worktree_path', { executionId })
  },

  /** Cleanup a Ralph loop worktree */
  cleanupWorktree: async (
    projectPath: string,
    worktreePath: string,
    deleteDirectory?: boolean
  ): Promise<void> => {
    return await invoke('cleanup_ralph_worktree', { projectPath, worktreePath, deleteDirectory })
  },

  /** List all Ralph worktrees for a project */
  listWorktrees: async (projectPath: string): Promise<RalphWorktreeInfo[]> => {
    return await invoke('list_ralph_worktrees', { projectPath })
  },

  /** Convert PRD chat export to Ralph PRD format */
  convertPrdToRalph: async (request: {
    prdId: string
    branch: string
    agentType?: string
    model?: string
    maxIterations?: number
    maxCost?: number
    runTests?: boolean
    runLint?: boolean
    useWorktree?: boolean
  }): Promise<RalphPrd> => {
    return await invoke('convert_prd_to_ralph', { request })
  },

  /** Convert a file-based PRD to Ralph loop format */
  convertPrdFileToRalph: async (request: {
    projectPath: string
    prdName: string
    branch: string
    agentType?: string
    model?: string
    maxIterations?: number
    maxCost?: number
    runTests?: boolean
    runLint?: boolean
    useWorktree?: boolean
  }): Promise<RalphPrd> => {
    return await invoke('convert_prd_file_to_ralph', { request })
  },

  /** Check if a project has Ralph loop files */
  hasRalphFiles: async (projectPath: string): Promise<boolean> => {
    return await invoke('has_ralph_files', { projectPath })
  },

  /** Get all Ralph files for a project */
  getRalphFiles: async (projectPath: string): Promise<RalphFiles> => {
    return await invoke('get_ralph_files', { projectPath })
  },

  /** Get Ralph config for a project */
  getConfig: async (projectPath: string): Promise<RalphConfig> => {
    return await invoke('get_ralph_config', { projectPath })
  },

  /** Set Ralph config for a project */
  setConfig: async (projectPath: string, config: RalphConfig): Promise<void> => {
    return await invoke('set_ralph_config', { projectPath, config })
  },

  /** Initialize Ralph config with defaults */
  initConfig: async (projectPath: string): Promise<RalphConfig> => {
    return await invoke('init_ralph_config', { projectPath })
  },

  /** Update specific Ralph config fields */
  updateConfig: async (
    projectPath: string,
    updates: {
      maxIterations?: number
      maxCost?: number
      agent?: string
      model?: string
      testCommand?: string
      lintCommand?: string
      buildCommand?: string
    }
  ): Promise<RalphConfig> => {
    return await invoke('update_ralph_config', { projectPath, ...updates })
  },

  // ============================================================================
  // Iteration History API
  // ============================================================================

  /** Get iteration history for an execution */
  getIterationHistory: async (executionId: string): Promise<IterationRecord[]> => {
    return await invoke('get_ralph_iteration_history', { executionId })
  },

  /** Get iteration statistics for an execution */
  getIterationStats: async (executionId: string): Promise<IterationStats> => {
    return await invoke('get_ralph_iteration_stats', { executionId })
  },

  /** Get all iterations with optional filters */
  getAllIterations: async (
    executionId?: string,
    outcomeFilter?: string,
    limit?: number
  ): Promise<IterationRecord[]> => {
    return await invoke('get_all_ralph_iterations', {
      executionId,
      outcomeFilter,
      limit,
    })
  },

  /** Check for stale executions (crash recovery) */
  checkStaleExecutions: async (thresholdSecs?: number): Promise<ExecutionStateSnapshot[]> => {
    return await invoke('check_stale_ralph_executions', { thresholdSecs })
  },

  /** Recover stale iterations (mark as interrupted) */
  recoverStaleIterations: async (executionId: string): Promise<number> => {
    return await invoke('recover_stale_ralph_iterations', { executionId })
  },

  /** Delete iteration history for an execution */
  deleteIterationHistory: async (executionId: string): Promise<number> => {
    return await invoke('delete_ralph_iteration_history', { executionId })
  },

  /** Get consolidated snapshot for efficient polling
   * Combines state, metrics, agent ID, worktree path, and iteration history in a single IPC call
   */
  getSnapshot: async (executionId: string): Promise<RalphLoopSnapshot> => {
    return await invoke('get_ralph_loop_snapshot', { executionId })
  },

  /** Cleanup old iteration history records (maintenance)
   * Deletes iterations older than the specified number of days (default: 30)
   * @returns Number of records deleted
   */
  cleanupIterationHistory: async (daysToKeep?: number): Promise<number> => {
    return await invoke('cleanup_ralph_iteration_history', { daysToKeep })
  },
}

// Import GSD types
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
} from '@/types/planning'

// GSD Workflow API
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
  generateProjectDocument: async (
    projectPath: string,
    sessionId: string
  ): Promise<string> => {
    return await invoke('generate_project_document', { projectPath, sessionId })
  },

  /** Start parallel research agents */
  startResearch: async (
    projectPath: string,
    sessionId: string,
    context: string,
    agentType?: string
  ): Promise<ResearchStatus> => {
    return await invoke('start_research', { projectPath, sessionId, context, agentType })
  },

  /** Get research results for a session */
  getResearchResults: async (
    projectPath: string,
    sessionId: string
  ): Promise<ResearchResult[]> => {
    return await invoke('get_research_results', { projectPath, sessionId })
  },

  /** Synthesize research into SUMMARY.md */
  synthesizeResearch: async (
    projectPath: string,
    sessionId: string
  ): Promise<ResearchSynthesis> => {
    return await invoke('synthesize_research_cmd', { projectPath, sessionId })
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
  verifyPlans: async (projectPath: string, sessionId: string): Promise<VerificationIterationResult> => {
    return await invoke('verify_gsd_plans', { projectPath, sessionId })
  },

  /** Get verification history for a session */
  getVerificationHistory: async (projectPath: string, sessionId: string): Promise<VerificationHistory | null> => {
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
    includeV2?: boolean
  ): Promise<ConversionResult> => {
    return await invoke('export_gsd_to_ralph', { projectPath, sessionId, prdName, branch, includeV2 })
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

// Import TemplateInfo and TemplatePreviewResult types
import type { TemplateInfo, TemplatePreviewResult } from '@/types'

// Template Editor API (US-012, US-013)
export const templateApi = {
  /** List all available templates (project, global, builtin) */
  list: async (projectPath?: string): Promise<TemplateInfo[]> => {
    return await invoke('list_templates', { projectPath })
  },

  /** Get template content by name */
  getContent: async (name: string, projectPath?: string): Promise<string> => {
    return await invoke('get_template_content', { name, projectPath })
  },

  /** Save a template to project or global scope */
  save: async (
    name: string,
    content: string,
    scope: 'project' | 'global',
    projectPath?: string
  ): Promise<void> => {
    return await invoke('save_template', { name, content, scope, projectPath })
  },

  /** Delete a template from project or global scope */
  delete: async (
    name: string,
    scope: 'project' | 'global',
    projectPath?: string
  ): Promise<void> => {
    return await invoke('delete_template', { name, scope, projectPath })
  },

  /** List builtin template names */
  listBuiltin: async (): Promise<string[]> => {
    return await invoke('list_builtin_templates')
  },

  /** Preview a template with sample context (US-013) */
  preview: async (content: string, projectPath?: string): Promise<TemplatePreviewResult> => {
    return await invoke('preview_template', { content, projectPath })
  },
}
