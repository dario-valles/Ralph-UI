// Tauri API wrappers for backend commands

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
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
} from '@/types'

// Check if we're running inside Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Safe invoke wrapper that handles the case when Tauri isn't available
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri || typeof tauriInvoke !== 'function') {
    throw new Error(`Tauri is not available. Command '${cmd}' cannot be executed outside of Tauri.`)
  }
  return tauriInvoke<T>(cmd, args)
}

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
