// Project state management store using Zustand
// Projects are stored in the backend SQLite database
// Only active project ID is persisted in localStorage (UI preference)

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { projectApi } from '@/lib/backend-api'
import { asyncAction, errorToString, type AsyncState } from '@/lib/store-utils'
import type { Project } from '@/types'
export type { Project }

interface ProjectState extends AsyncState {
  projects: Project[]
  activeProjectId: string | null
}

interface ProjectActions {
  // Load all projects from backend
  loadProjects: () => Promise<void>
  // Get or create a project from a folder path
  registerProject: (path: string, name?: string) => Promise<Project>
  // Set active project by ID
  setActiveProject: (projectId: string | null) => void
  // Set active project by path (convenience method)
  setActiveProjectByPath: (path: string) => Promise<void>
  // Toggle favorite status
  toggleFavorite: (projectId: string) => Promise<void>
  // Update project name
  updateProjectName: (projectId: string, name: string) => Promise<void>
  // Delete a project (just removes from list, doesn't delete sessions)
  deleteProject: (projectId: string) => Promise<void>
  // Get recent projects (from current state, sorted by lastUsedAt)
  getRecentProjects: (limit?: number) => Project[]
  // Get favorite projects (from current state)
  getFavoriteProjects: () => Project[]
  // Get project by path (from current state)
  getProjectByPath: (path: string) => Project | undefined
  // Get active project (from current state)
  getActiveProject: () => Project | undefined
  // Touch project (update lastUsedAt)
  touchProject: (projectId: string) => Promise<void>
  // Clear error
  clearError: () => void
}

type ProjectStore = ProjectState & ProjectActions

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      // Initial state
      projects: [],
      activeProjectId: null,
      loading: false,
      error: null,

      // Load all projects from backend
      loadProjects: async () => {
        await asyncAction(set, async () => {
          const projects = await projectApi.getAll()
          return { projects }
        })
      },

      // Register (or get) a project from a folder path
      registerProject: async (path: string, name?: string): Promise<Project> => {
        try {
          const project = await projectApi.register(path, name)
          // Update local state
          set((state) => {
            const existing = state.projects.find((p) => p.id === project.id)
            if (existing) {
              // Update existing project
              return {
                projects: state.projects.map((p) =>
                  p.id === project.id ? project : p
                ),
              }
            } else {
              // Add new project
              return { projects: [project, ...state.projects] }
            }
          })
          return project
        } catch (error) {
          set({ error: errorToString(error) })
          throw error
        }
      },

      // Set active project by ID
      setActiveProject: (projectId: string | null) => {
        set({ activeProjectId: projectId })
        // Touch the project in background if setting active
        if (projectId) {
          projectApi.touch(projectId).catch(console.error)
        }
      },

      // Set active project by path
      setActiveProjectByPath: async (path: string) => {
        try {
          const project = await get().registerProject(path)
          set({ activeProjectId: project.id })
        } catch (error) {
          console.error('Failed to set active project by path:', error)
        }
      },

      // Toggle favorite
      toggleFavorite: async (projectId: string) => {
        try {
          const newStatus = await projectApi.toggleFavorite(projectId)
          set((state) => ({
            projects: state.projects.map((p) =>
              p.id === projectId ? { ...p, isFavorite: newStatus } : p
            ),
          }))
        } catch (error) {
          set({ error: errorToString(error) })
        }
      },

      // Update project name
      updateProjectName: async (projectId: string, name: string) => {
        try {
          await projectApi.updateName(projectId, name)
          set((state) => ({
            projects: state.projects.map((p) =>
              p.id === projectId ? { ...p, name } : p
            ),
          }))
        } catch (error) {
          set({ error: errorToString(error) })
        }
      },

      // Delete project
      deleteProject: async (projectId: string) => {
        try {
          await projectApi.delete(projectId)
          set((state) => ({
            projects: state.projects.filter((p) => p.id !== projectId),
            activeProjectId: state.activeProjectId === projectId ? null : state.activeProjectId,
          }))
        } catch (error) {
          set({ error: errorToString(error) })
        }
      },

      // Get recent projects (sorted by lastUsedAt descending)
      getRecentProjects: (limit = 5): Project[] => {
        const { projects } = get()
        return [...projects]
          .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
          .slice(0, limit)
      },

      // Get favorite projects
      getFavoriteProjects: (): Project[] => {
        const { projects } = get()
        return projects.filter((p) => p.isFavorite)
      },

      // Get project by path
      getProjectByPath: (path: string): Project | undefined => {
        const { projects } = get()
        return projects.find((p) => p.path === path)
      },

      // Get active project
      getActiveProject: (): Project | undefined => {
        const { projects, activeProjectId } = get()
        if (!activeProjectId) return undefined
        return projects.find((p) => p.id === activeProjectId)
      },

      // Touch project (update lastUsedAt)
      touchProject: async (projectId: string) => {
        try {
          await projectApi.touch(projectId)
          const now = new Date().toISOString()
          set((state) => ({
            projects: state.projects.map((p) =>
              p.id === projectId ? { ...p, lastUsedAt: now } : p
            ),
          }))
        } catch (error) {
          console.error('Failed to touch project:', error)
        }
      },

      // Clear error
      clearError: () => {
        set({ error: null })
      },
    }),
    {
      name: 'ralph-projects-ui',
      // Only persist activeProjectId - projects come from backend
      partialize: (state) => ({ activeProjectId: state.activeProjectId }),
    }
  )
)
