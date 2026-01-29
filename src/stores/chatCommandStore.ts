/**
 * Chat command store using Zustand
 *
 * Manages state for customizable slash commands in PRD Chat.
 * Commands are loaded from the backend and cached locally.
 */

import { create } from 'zustand'
import type { ChatCommandConfig, ChatCommandScope } from '@/types'
import {
  listChatCommands,
  updateChatCommand,
  createChatCommand,
  deleteChatCommand,
  resetChatCommand,
} from '@/lib/api/chat-command-api'

interface ChatCommandStore {
  // State
  commands: ChatCommandConfig[]
  loading: boolean
  error: string | null
  projectPath: string | null

  // Computed getters
  enabledCommands: () => ChatCommandConfig[]
  favoriteCommands: () => ChatCommandConfig[]
  builtinCommands: () => ChatCommandConfig[]
  customCommands: () => ChatCommandConfig[]

  // Actions
  loadCommands: (projectPath?: string) => Promise<void>
  setProjectPath: (path: string | null) => void
  toggleEnabled: (id: string, saveScope?: ChatCommandScope) => Promise<void>
  toggleFavorite: (id: string, saveScope?: ChatCommandScope) => Promise<void>
  updateCommand: (
    id: string,
    updates: {
      enabled?: boolean
      favorite?: boolean
      template?: string
      label?: string
      description?: string
    },
    saveScope?: ChatCommandScope
  ) => Promise<void>
  createCommand: (
    command: {
      id: string
      label: string
      description: string
      template: string
    },
    scope?: ChatCommandScope
  ) => Promise<void>
  deleteCommand: (id: string, scope: ChatCommandScope) => Promise<void>
  resetCommand: (id: string, scope?: ChatCommandScope) => Promise<void>
  getCommandById: (id: string) => ChatCommandConfig | undefined
}

export const useChatCommandStore = create<ChatCommandStore>()((set, get) => ({
  // Initial state
  commands: [],
  loading: false,
  error: null,
  projectPath: null,

  // Computed getters
  enabledCommands: () => get().commands.filter((cmd) => cmd.enabled),
  favoriteCommands: () => get().commands.filter((cmd) => cmd.favorite && cmd.enabled),
  builtinCommands: () => get().commands.filter((cmd) => cmd.scope === 'builtin'),
  customCommands: () => get().commands.filter((cmd) => cmd.scope !== 'builtin'),

  // Actions
  loadCommands: async (projectPath?: string) => {
    set({ loading: true, error: null })
    try {
      const path = projectPath ?? get().projectPath ?? undefined
      const commands = await listChatCommands(path)
      set({ commands, loading: false, projectPath: path ?? null })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load commands'
      set({ loading: false, error: message })
      console.error('Failed to load chat commands:', error)
    }
  },

  setProjectPath: (path: string | null) => {
    set({ projectPath: path })
  },

  toggleEnabled: async (id: string, saveScope?: ChatCommandScope) => {
    const { commands, projectPath } = get()
    const command = commands.find((c) => c.id === id)
    if (!command) return

    // Optimistic update
    const newEnabled = !command.enabled
    set({
      commands: commands.map((c) => (c.id === id ? { ...c, enabled: newEnabled } : c)),
    })

    try {
      await updateChatCommand({
        projectPath: projectPath ?? undefined,
        id,
        enabled: newEnabled,
        saveScope: saveScope ?? (command.scope === 'builtin' ? 'global' : command.scope),
      })
    } catch (error) {
      // Revert on failure
      set({
        commands: commands.map((c) => (c.id === id ? { ...c, enabled: command.enabled } : c)),
        error: error instanceof Error ? error.message : 'Failed to update command',
      })
      console.error('Failed to toggle command enabled:', error)
    }
  },

  toggleFavorite: async (id: string, saveScope?: ChatCommandScope) => {
    const { commands, projectPath } = get()
    const command = commands.find((c) => c.id === id)
    if (!command) return

    // Optimistic update
    const newFavorite = !command.favorite
    set({
      commands: commands.map((c) => (c.id === id ? { ...c, favorite: newFavorite } : c)),
    })

    try {
      await updateChatCommand({
        projectPath: projectPath ?? undefined,
        id,
        favorite: newFavorite,
        saveScope: saveScope ?? (command.scope === 'builtin' ? 'global' : command.scope),
      })
    } catch (error) {
      // Revert on failure
      set({
        commands: commands.map((c) => (c.id === id ? { ...c, favorite: command.favorite } : c)),
        error: error instanceof Error ? error.message : 'Failed to update command',
      })
      console.error('Failed to toggle command favorite:', error)
    }
  },

  updateCommand: async (id, updates, saveScope) => {
    const { commands, projectPath } = get()
    const command = commands.find((c) => c.id === id)
    if (!command) return

    // Optimistic update
    set({
      commands: commands.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })

    try {
      await updateChatCommand({
        projectPath: projectPath ?? undefined,
        id,
        ...updates,
        saveScope: saveScope ?? (command.scope === 'builtin' ? 'global' : command.scope),
      })
    } catch (error) {
      // Reload commands to get correct state
      await get().loadCommands()
      set({ error: error instanceof Error ? error.message : 'Failed to update command' })
      console.error('Failed to update command:', error)
      throw error
    }
  },

  createCommand: async (command, scope = 'global') => {
    const { commands, projectPath } = get()

    // Check for duplicate ID
    if (commands.some((c) => c.id === command.id)) {
      const error = `Command ID '${command.id}' already exists`
      set({ error })
      throw new Error(error)
    }

    try {
      await createChatCommand({
        projectPath: projectPath ?? undefined,
        ...command,
        scope,
      })

      // Reload to get the created command
      await get().loadCommands()
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to create command' })
      console.error('Failed to create command:', error)
      throw error
    }
  },

  deleteCommand: async (id, scope) => {
    const { commands, projectPath } = get()
    const command = commands.find((c) => c.id === id)
    if (!command) return

    // Can't delete builtin commands
    if (command.scope === 'builtin') {
      const error = "Cannot delete builtin commands. You can disable them instead."
      set({ error })
      throw new Error(error)
    }

    // Optimistic update
    set({
      commands: commands.filter((c) => c.id !== id),
    })

    try {
      await deleteChatCommand({
        projectPath: projectPath ?? undefined,
        id,
        scope,
      })
    } catch (error) {
      // Reload on failure
      await get().loadCommands()
      set({ error: error instanceof Error ? error.message : 'Failed to delete command' })
      console.error('Failed to delete command:', error)
      throw error
    }
  },

  resetCommand: async (id, scope) => {
    const { commands, projectPath } = get()
    const command = commands.find((c) => c.id === id)
    if (!command) return

    // Can only reset builtin commands
    if (command.scope !== 'builtin') {
      const error = "Can only reset builtin commands to defaults"
      set({ error })
      throw new Error(error)
    }

    try {
      await resetChatCommand({
        projectPath: projectPath ?? undefined,
        id,
        scope,
      })

      // Reload to get the reset state
      await get().loadCommands()
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to reset command' })
      console.error('Failed to reset command:', error)
      throw error
    }
  },

  getCommandById: (id: string) => {
    return get().commands.find((c) => c.id === id)
  },
}))
