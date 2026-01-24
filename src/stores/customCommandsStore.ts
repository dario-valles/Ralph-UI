// Custom terminal commands store using Zustand with localStorage persistence

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CustomCommand {
  id: string
  label: string
  command: string
  action: 'insert' | 'execute'
  category: string
  createdAt: number
}

interface CustomCommandsStore {
  // State
  commands: CustomCommand[]

  // Actions
  addCommand: (label: string, command: string, action: 'insert' | 'execute', category: string) => void
  deleteCommand: (id: string) => void
  getCommands: () => CustomCommand[]
  getCommandsByCategory: (category: string) => CustomCommand[]
  getAllCategories: () => string[]
}

export const useCustomCommandsStore = create<CustomCommandsStore>()(
  persist(
    (set, get) => ({
      // Initial state
      commands: [],

      addCommand: (label: string, command: string, action: 'insert' | 'execute', category: string) => {
        const { commands } = get()
        const newCommand: CustomCommand = {
          id: `cmd-${Date.now()}`,
          label,
          command,
          action,
          category,
          createdAt: Date.now(),
        }
        set({ commands: [...commands, newCommand] })
      },

      deleteCommand: (id: string) => {
        const { commands } = get()
        set({ commands: commands.filter((c) => c.id !== id) })
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
