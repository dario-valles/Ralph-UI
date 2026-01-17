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
    prdId?: string
  ): Promise<ChatSession> => {
    return await invoke('start_prd_chat_session', {
      request: { agentType, projectPath, prdId }
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

  exportToPRD: async (sessionId: string, title: string): Promise<PRDDocument> => {
    return await invoke('export_chat_to_prd', {
      request: { sessionId, title }
    })
  },
}
