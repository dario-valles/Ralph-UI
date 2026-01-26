// Task API wrappers for backend commands

import type { Task } from '@/types'
import { invoke } from '../invoke'

export const taskApi = {
  /**
   * Create a new task in a session
   */
  create: async (
    sessionId: string,
    projectPath: string,
    task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<Task> => {
    return await invoke('create_task', { sessionId, projectPath, task })
  },

  /**
   * Get a specific task by ID
   */
  getById: async (id: string, projectPath: string): Promise<Task> => {
    return await invoke('get_task', { id, projectPath })
  },

  /**
   * Get all tasks for a session
   */
  getForSession: async (sessionId: string, projectPath: string): Promise<Task[]> => {
    return await invoke('get_tasks_for_session', { sessionId, projectPath })
  },

  /**
   * Update a task
   */
  update: async (task: Task, projectPath: string): Promise<Task> => {
    return await invoke('update_task', { task, projectPath })
  },

  /**
   * Delete a task
   */
  delete: async (id: string, sessionId: string, projectPath: string): Promise<void> => {
    return await invoke('delete_task', { id, sessionId, projectPath })
  },
}
