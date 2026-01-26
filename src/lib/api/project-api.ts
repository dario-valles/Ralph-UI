// Project API wrappers

import type { Project } from '@/types'
import { invoke } from '../invoke'

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
