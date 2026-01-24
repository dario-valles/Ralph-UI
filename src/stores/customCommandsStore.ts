// Custom terminal commands store using Zustand with localStorage persistence
// and project-level storage via .ralph-ui/terminal/commands.json

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { invoke } from '@/lib/invoke'

export interface CustomCommand {
  id: string
  label: string
  command: string
  action: 'insert' | 'execute'
  category: string
  scope: 'local' | 'project' | 'global'
  createdAt: number
  sortOrder: number
}

interface CustomCommandsStore {
  // State
  commands: CustomCommand[]
  projectPath: string | null
  loading: boolean

  // Actions
  addCommand: (label: string, command: string, action: 'insert' | 'execute', category: string, scope: 'local' | 'project' | 'global') => Promise<void>
  deleteCommand: (id: string) => Promise<void>
  editCommand: (id: string, label: string, command: string, action: 'insert' | 'execute', category: string, scope?: 'local' | 'project' | 'global') => Promise<void>
  reorderCommands: (commands: CustomCommand[]) => Promise<void>
  setProjectPath: (path: string | null) => void
  loadProjectCommands: (projectPath: string) => Promise<void>
  getCommands: () => CustomCommand[]
  getCommandsByCategory: (category: string) => CustomCommand[]
  getAllCategories: () => string[]
}

export const useCustomCommandsStore = create<CustomCommandsStore>()(
  persist(
    (set, get) => ({
      // Initial state
      commands: [],
      projectPath: null,
      loading: false,

      addCommand: async (label: string, command: string, action: 'insert' | 'execute', category: string, scope: 'local' | 'project' | 'global') => {
        const { commands, projectPath } = get()
        const newCommand: CustomCommand = {
          id: `cmd-${Date.now()}`,
          label,
          command,
          action,
          category,
          scope,
          createdAt: Date.now(),
          sortOrder: commands.filter((c) => c.scope === scope).length,
        }

        // If saving to project scope, sync with backend
        if (scope === 'project' && projectPath) {
          try {
            await invoke('save_project_commands', {
              projectPath,
              commands: [...commands.filter((c) => c.scope === 'project'), newCommand],
            })
          } catch (error) {
            console.error('Failed to save project commands:', error)
            throw error
          }
        }

        set({ commands: [...commands, newCommand] })
      },

      deleteCommand: async (id: string) => {
        const { commands, projectPath } = get()
        const commandToDelete = commands.find((c) => c.id === id)
        const updatedCommands = commands.filter((c) => c.id !== id)

        // If deleting from project scope, sync with backend
        if (commandToDelete?.scope === 'project' && projectPath) {
          try {
            await invoke('save_project_commands', {
              projectPath,
              commands: updatedCommands.filter((c) => c.scope === 'project'),
            })
          } catch (error) {
            console.error('Failed to save project commands:', error)
            throw error
          }
        }

        set({ commands: updatedCommands })
      },

      editCommand: async (id: string, label: string, command: string, action: 'insert' | 'execute', category: string, scope?: 'local' | 'project' | 'global') => {
        const { commands, projectPath } = get()
        const commandToEdit = commands.find((c) => c.id === id)
        const newScope = scope || commandToEdit?.scope || 'local'

        const updatedCommands = commands.map((c) =>
          c.id === id ? { ...c, label, command, action, category, scope: newScope } : c
        )

        // If editing a project command, sync with backend
        if (newScope === 'project' && projectPath) {
          try {
            await invoke('save_project_commands', {
              projectPath,
              commands: updatedCommands.filter((c) => c.scope === 'project'),
            })
          } catch (error) {
            console.error('Failed to save project commands:', error)
            throw error
          }
        }

        set({ commands: updatedCommands })
      },

      reorderCommands: async (reorderedCommands: CustomCommand[]) => {
        const { projectPath } = get()

        // Sync project commands with backend if any exist
        const projectCommands = reorderedCommands.filter((c) => c.scope === 'project')
        if (projectCommands.length > 0 && projectPath) {
          try {
            await invoke('save_project_commands', {
              projectPath,
              commands: projectCommands,
            })
          } catch (error) {
            console.error('Failed to save project commands:', error)
            throw error
          }
        }

        set({ commands: reorderedCommands })
      },

      setProjectPath: (path: string | null) => {
        set({ projectPath: path })
      },

      loadProjectCommands: async (projectPath: string) => {
        set({ loading: true, projectPath })
        try {
          const projectCommands = await invoke<CustomCommand[]>('load_project_commands', {
            projectPath,
          })
          const { commands } = get()
          // Merge project commands with local commands
          const mergedCommands = [
            ...commands.filter((c) => c.scope === 'local'),
            ...projectCommands,
          ]
          set({ commands: mergedCommands, loading: false })
        } catch (error) {
          console.error('Failed to load project commands:', error)
          set({ loading: false })
        }
      },

      getCommands: () => {
        return get().commands
      },

      getCommandsByCategory: (category: string) => {
        const { commands } = get()
        return commands.filter((c) => c.category === category)
      },

      getAllCategories: () => {
        const { commands } = get()
        const categories = new Set(commands.map((c) => c.category))
        return Array.from(categories).sort()
      },
    }),
    {
      name: 'ralph-custom-commands',
    }
  )
)
