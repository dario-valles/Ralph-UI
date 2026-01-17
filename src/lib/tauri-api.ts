// Tauri API wrappers for backend commands

import { invoke } from '@tauri-apps/api/core'
import type { Session, Task, SessionStatus, TaskStatus } from '@/types'

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
