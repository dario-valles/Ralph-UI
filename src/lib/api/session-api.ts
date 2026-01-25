// Session API wrappers

import type { Session, SessionIndexEntry } from '@/types'
import { invoke } from '../invoke'

export const sessionApi = {
  /**
   * Get all sessions for a project (lightweight index entries).
   * Use this for session list views where full task details aren't needed.
   */
  getIndex: async (projectPath: string): Promise<SessionIndexEntry[]> => {
    return await invoke('get_sessions_index', { projectPath })
  },

  /**
   * Get all sessions for a project (full session data with tasks).
   * Use getIndex() for list views to improve performance.
   */
  getAll: async (projectPath: string): Promise<Session[]> => {
    return await invoke('get_sessions', { projectPath })
  },

  /** Get a specific session by ID (full session data) */
  getById: async (id: string, projectPath: string): Promise<Session> => {
    return await invoke('get_session', { id, projectPath })
  },

  /** Update a session */
  update: async (session: Session): Promise<Session> => {
    return await invoke('update_session', { session })
  },

  /** Delete a session */
  delete: async (id: string, projectPath: string): Promise<void> => {
    return await invoke('delete_session', { id, projectPath })
  },
}
