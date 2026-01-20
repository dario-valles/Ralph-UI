// Tauri API wrappers for backend commands

import type {
  Session,
  Task,
  SessionStatus,
  TaskStatus,
  SessionTemplate,
  SessionRecoveryState,
  SessionComparison,
  SessionAnalytics,
  PRDDocument,
  PRDTemplate,
  CreatePRDRequest,
  UpdatePRDRequest,
  ExecutionConfig,
  ChatSession,
  ChatMessage,
  SendMessageResponse,
  QualityAssessment,
  GuidedQuestion,
  ExtractedPRDContent,
  ExtractedPRDStructure,
  ExportResult,
  PRDTypeValue,
  Project,
  IterationRecord,
  ExecutionStateSnapshot,
  IterationStats,
} from '@/types'
import { invoke } from './invoke'

// Session API
export const sessionApi = {
  create: async (name: string, projectPath: string): Promise<Session> => {
    return await invoke('create_session', { name, projectPath })
  },

  getAll: async (): Promise<Session[]> => {
    return await invoke('get_sessions')
  },

  getById: async (id: string): Promise<Session> => {
    return await invoke('get_session', { id })
  },

  update: async (session: Session): Promise<Session> => {
    return await invoke('update_session', { session })
  },

  delete: async (id: string): Promise<void> => {
    return await invoke('delete_session', { id })
  },

  updateStatus: async (sessionId: string, status: SessionStatus): Promise<void> => {
    return await invoke('update_session_status', { sessionId, status })
  },

  // Phase 6: Session Management Features
  exportJson: async (sessionId: string): Promise<string> => {
    return await invoke('export_session_json', { sessionId })
  },

  createTemplate: async (
    sessionId: string,
    templateName: string,
    description: string
  ): Promise<SessionTemplate> => {
    return await invoke('create_session_template', { sessionId, templateName, description })
  },

  getTemplates: async (): Promise<SessionTemplate[]> => {
    return await invoke('get_session_templates')
  },

  createFromTemplate: async (
    templateId: string,
    name: string,
    projectPath: string
  ): Promise<Session> => {
    return await invoke('create_session_from_template', { templateId, name, projectPath })
  },

  saveRecoveryState: async (sessionId: string): Promise<void> => {
    return await invoke('save_recovery_state', { sessionId })
  },

  getRecoveryState: async (sessionId: string): Promise<SessionRecoveryState | null> => {
    return await invoke('get_recovery_state', { sessionId })
  },

  compareSessions: async (
    session1Id: string,
    session2Id: string
  ): Promise<SessionComparison> => {
    return await invoke('compare_sessions', { session1Id, session2Id })
  },

  getAnalytics: async (sessionId: string): Promise<SessionAnalytics> => {
    return await invoke('get_session_analytics', { sessionId })
  },
}

// Task API
export const taskApi = {
  create: async (sessionId: string, task: Task): Promise<Task> => {
    return await invoke('create_task', { sessionId, task })
  },

  getById: async (taskId: string): Promise<Task> => {
    return await invoke('get_task', { taskId })
  },

  getForSession: async (sessionId: string): Promise<Task[]> => {
    return await invoke('get_tasks_for_session', { sessionId })
  },

  update: async (task: Task): Promise<Task> => {
    return await invoke('update_task', { task })
  },

  delete: async (taskId: string): Promise<void> => {
    return await invoke('delete_task', { taskId })
  },

  updateStatus: async (taskId: string, status: TaskStatus): Promise<void> => {
    return await invoke('update_task_status', { taskId, status })
  },

  importPRD: async (
    sessionId: string,
    content: string,
    format?: string
  ): Promise<Task[]> => {
    return await invoke('import_prd', { sessionId, content, format })
  },
}

// PRD API (Phase 7.5)
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

  execute: async (prdId: string, config: ExecutionConfig): Promise<string> => {
    return await invoke('execute_prd', { prdId, config })
  },
}

// PRD Chat API
export const prdChatApi = {
  startSession: async (
    agentType: string,
    projectPath?: string,
    prdId?: string,
    prdType?: PRDTypeValue,
    guidedMode?: boolean,
    templateId?: string,
    structuredMode?: boolean
  ): Promise<ChatSession> => {
    return await invoke('start_prd_chat_session', {
      request: { agentType, projectPath, prdId, prdType, guidedMode, templateId, structuredMode }
    })
  },

  sendMessage: async (
    sessionId: string,
    content: string
  ): Promise<SendMessageResponse> => {
    return await invoke('send_prd_chat_message', {
      request: { sessionId, content }
    })
  },

  getHistory: async (sessionId: string): Promise<ChatMessage[]> => {
    return await invoke('get_prd_chat_history', { sessionId })
  },

  getSessions: async (): Promise<ChatSession[]> => {
    return await invoke('list_prd_chat_sessions')
  },

  deleteSession: async (sessionId: string): Promise<void> => {
    return await invoke('delete_prd_chat_session', { sessionId })
  },

  exportToPRD: async (sessionId: string, title: string): Promise<ExportResult> => {
    return await invoke('export_chat_to_prd', {
      request: { sessionId, title }
    })
  },

  /** Assess the quality of a PRD chat session before export */
  assessQuality: async (sessionId: string): Promise<QualityAssessment> => {
    return await invoke('assess_prd_quality', { sessionId })
  },

  /** Get guided questions based on PRD type */
  getGuidedQuestions: async (prdType: PRDTypeValue): Promise<GuidedQuestion[]> => {
    return await invoke('get_guided_questions', { prdType })
  },

  /** Preview extracted PRD content before export */
  previewExtraction: async (sessionId: string): Promise<ExtractedPRDContent> => {
    return await invoke('preview_prd_extraction', { sessionId })
  },

  /** Check if an agent CLI is available in the system PATH */
  checkAgentAvailability: async (agentType: string): Promise<AgentAvailabilityResult> => {
    return await invoke('check_agent_availability', { agentType })
  },

  /** Get extracted PRD structure for a session */
  getExtractedStructure: async (sessionId: string): Promise<ExtractedPRDStructure> => {
    return await invoke('get_extracted_structure', { sessionId })
  },

  /** Set structured output mode for a session */
  setStructuredMode: async (sessionId: string, enabled: boolean): Promise<void> => {
    return await invoke('set_structured_mode', { sessionId, enabled })
  },

  /** Clear extracted structure for a session */
  clearExtractedStructure: async (sessionId: string): Promise<void> => {
    return await invoke('clear_extracted_structure', { sessionId })
  },

  /** Start watching a PRD plan file for changes */
  startWatchingPlanFile: async (sessionId: string): Promise<WatchFileResponse> => {
    return await invoke('start_watching_prd_file', { sessionId })
  },

  /** Stop watching a PRD plan file */
  stopWatchingPlanFile: async (sessionId: string): Promise<boolean> => {
    return await invoke('stop_watching_prd_file', { sessionId })
  },

  /** Get the current content of a PRD plan file */
  getPlanContent: async (sessionId: string): Promise<string | null> => {
    return await invoke('get_prd_plan_content', { sessionId })
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
  eventType: 'task_completed' | 'task_started' | 'task_failed' | 'agent_spawned' | 'session_started' | 'session_completed'
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

  /** Read the Ralph PRD from .ralph/prd.json */
  getPrd: async (projectPath: string): Promise<RalphPrd> => {
    return await invoke('get_ralph_prd', { projectPath })
  },

  /** Get the status of the Ralph PRD */
  getPrdStatus: async (projectPath: string): Promise<RalphPrdStatus> => {
    return await invoke('get_ralph_prd_status', { projectPath })
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
  getProgress: async (projectPath: string): Promise<string> => {
    return await invoke('get_ralph_progress', { projectPath })
  },

  /** Get progress summary */
  getProgressSummary: async (projectPath: string): Promise<RalphProgressSummary> => {
    return await invoke('get_ralph_progress_summary', { projectPath })
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
  getPrompt: async (projectPath: string): Promise<string> => {
    return await invoke('get_ralph_prompt', { projectPath })
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
}
