// Custom terminal commands store using Zustand with localStorage persistence

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface CustomCommand {
  id: string
  label: string
  command: string
  createdAt: number
}

interface CustomCommandsStore {
  // State
  commands: CustomCommand[]

  // Actions
  addCommand: (label: string, command: string) => void
  deleteCommand: (id: string) => void
  getCommands: () => CustomCommand[]
}

export const useCustomCommandsStore = create<CustomCommandsStore>()(
  persist(
    (set, get) => ({
      // Initial state
      commands: [],

      addCommand: (label: string, command: string) => {
        const { commands } = get()
        const newCommand: CustomCommand = {
          id: `cmd-${Date.now()}`,
          label,
          command,
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
    }),
    {
      name: 'ralph-custom-commands',
    }
  )
)
