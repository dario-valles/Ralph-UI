/**
 * Context Store - State Management for Project Context Files
 *
 * This store manages project-level context files that provide AI agents with
 * consistent understanding of a project's product vision, tech stack,
 * conventions, and workflow preferences.
 *
 * Features:
 * - Context file CRUD operations
 * - Context Chat sessions for AI-assisted context generation
 * - Tech stack auto-detection
 * - Context injection configuration
 */
import { create } from 'zustand'
import { invoke } from '@/lib/invoke'
import type {
  ContextConfig,
  ContextFile,
  ProjectContextState,
  ContextChatSession,
  ContextChatMessage,
  SendContextChatMessageResponse,
  ProjectAnalysis,
} from '@/types'
import { createDefaultProjectContext } from '@/types'

// ============================================================================
// Store Types
// ============================================================================

interface ContextStore {
  // ===== Context Files State =====
  /** Current project context (config + files) */
  projectContext: ProjectContextState | null
  /** Loading state for context operations */
  loading: boolean
  /** Error message if any */
  error: string | null
  /** Project path for current context */
  currentProjectPath: string | null

  // ===== Context Chat State =====
  /** Current context chat session */
  chatSession: ContextChatSession | null
  /** Messages in current chat session */
  chatMessages: ContextChatMessage[]
  /** Whether chat is in progress (waiting for AI response) */
  chatLoading: boolean
  /** Chat-specific error */
  chatError: string | null
  /** All context chat sessions for current project */
  chatSessions: ContextChatSession[]
  /** Session ID currently being processed (for streaming) */
  processingSessionId: string | null
  /** Timestamp when streaming started */
  streamingStartedAt: number | null

  // ===== Context Files Actions =====
  /** Load project context for a project path */
  loadProjectContext: (projectPath: string) => Promise<void>
  /** Save context configuration */
  saveContextConfig: (projectPath: string, config: ContextConfig) => Promise<void>
  /** Get a specific context file */
  getContextFile: (projectPath: string, name: string) => Promise<ContextFile | null>
  /** Save a context file */
  saveContextFile: (
    projectPath: string,
    name: string,
    content: string,
    mode?: 'single' | 'multi'
  ) => Promise<void>
  /** Delete a context file */
  deleteContextFile: (projectPath: string, name: string) => Promise<void>
  /** Delete all context files */
  deleteAllContextFiles: (projectPath: string) => Promise<void>
  /** Dismiss context setup prompt */
  dismissContextSetup: (projectPath: string) => Promise<void>
  /** Clear context setup dismissal */
  clearContextSetupDismissal: (projectPath: string) => Promise<void>
  /** Check if project has context files */
  hasContextFiles: (projectPath: string) => Promise<boolean>
  /** Get default context template */
  getDefaultContextTemplate: () => Promise<string>

  // ===== Context Chat Actions =====
  /** Start a new context chat session */
  startContextChatSession: (
    projectPath: string,
    agentType: string,
    providerId?: string
  ) => Promise<void>
  /** Load existing context chat sessions */
  loadContextChatSessions: (projectPath: string) => Promise<void>
  /** Get a specific chat session */
  getContextChatSession: (sessionId: string, projectPath: string) => Promise<void>
  /** Set current chat session */
  setCurrentChatSession: (session: ContextChatSession | null) => void
  /** Delete a chat session */
  deleteContextChatSession: (sessionId: string, projectPath: string) => Promise<void>
  /** Load messages for current session */
  loadChatMessages: (sessionId: string, projectPath: string) => Promise<void>
  /** Send a message in context chat */
  sendChatMessage: (
    sessionId: string,
    projectPath: string,
    content: string,
    modelId?: string
  ) => Promise<void>
  /** Save extracted context from chat */
  saveContextFromChat: (sessionId: string, projectPath: string, content?: string) => Promise<void>

  // ===== Utility Actions =====
  /** Clear error state */
  clearError: () => void
  /** Clear chat error state */
  clearChatError: () => void
  /** Reset store state */
  reset: () => void
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useContextStore = create<ContextStore>((set, get) => ({
  // Initial state
  projectContext: null,
  loading: false,
  error: null,
  currentProjectPath: null,

  chatSession: null,
  chatMessages: [],
  chatLoading: false,
  chatError: null,
  chatSessions: [],
  processingSessionId: null,
  streamingStartedAt: null,

  // ===== Context Files Actions =====

  loadProjectContext: async (projectPath: string) => {
    set({ loading: true, error: null, currentProjectPath: projectPath })
    try {
      const context = await invoke<ProjectContextState>('get_project_context', {
        projectPath,
      })
      set({ projectContext: context, loading: false })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load project context'
      set({ error: errorMessage, loading: false, projectContext: createDefaultProjectContext() })
    }
  },

  saveContextConfig: async (projectPath: string, config: ContextConfig) => {
    set({ loading: true, error: null })
    try {
      await invoke('save_context_config', { projectPath, config })
      // Reload to get updated state
      await get().loadProjectContext(projectPath)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save context config'
      set({ error: errorMessage, loading: false })
      throw err
    }
  },

  getContextFile: async (projectPath: string, name: string) => {
    try {
      const file = await invoke<ContextFile | null>('get_context_file', {
        projectPath,
        name,
      })
      return file
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get context file'
      set({ error: errorMessage })
      return null
    }
  },

  saveContextFile: async (
    projectPath: string,
    name: string,
    content: string,
    mode?: 'single' | 'multi'
  ) => {
    set({ loading: true, error: null })
    try {
      await invoke('save_context_file', { projectPath, name, content, mode })
      // Reload to get updated state
      await get().loadProjectContext(projectPath)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save context file'
      set({ error: errorMessage, loading: false })
      throw err
    }
  },

  deleteContextFile: async (projectPath: string, name: string) => {
    set({ loading: true, error: null })
    try {
      await invoke('delete_context_file', { projectPath, name })
      // Reload to get updated state
      await get().loadProjectContext(projectPath)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete context file'
      set({ error: errorMessage, loading: false })
      throw err
    }
  },

  deleteAllContextFiles: async (projectPath: string) => {
    set({ loading: true, error: null })
    try {
      await invoke('delete_all_context_files', { projectPath })
      // Reload to get updated state
      await get().loadProjectContext(projectPath)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete all context files'
      set({ error: errorMessage, loading: false })
      throw err
    }
  },

  dismissContextSetup: async (projectPath: string) => {
    try {
      await invoke('dismiss_context_setup', { projectPath })
      // Reload to get updated state
      await get().loadProjectContext(projectPath)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to dismiss context setup'
      set({ error: errorMessage })
    }
  },

  clearContextSetupDismissal: async (projectPath: string) => {
    try {
      await invoke('clear_context_setup_dismissal', { projectPath })
      // Reload to get updated state
      await get().loadProjectContext(projectPath)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to clear context setup dismissal'
      set({ error: errorMessage })
    }
  },

  hasContextFiles: async (projectPath: string) => {
    try {
      const result = await invoke<boolean>('has_context_files', { projectPath })
      return result
    } catch {
      return false
    }
  },

  getDefaultContextTemplate: async () => {
    try {
      const template = await invoke<string>('get_default_context_template', {})
      return template
    } catch {
      // Return hardcoded default if backend call fails
      return `# Project Context

## Product
<!-- What is this product? Who is it for? What problems does it solve? -->

## Tech Stack
<!-- Key technologies, frameworks, languages, architecture patterns -->

## Conventions
<!-- Coding style, naming conventions, file organization patterns -->

## Workflow
<!-- Development process preferences (TDD, PR requirements, etc.) -->
`
    }
  },

  // ===== Context Chat Actions =====

  startContextChatSession: async (projectPath: string, agentType: string, providerId?: string) => {
    set({ chatLoading: true, chatError: null })
    try {
      const session = await invoke<ContextChatSession>('start_context_chat_session', {
        projectPath,
        agentType,
        providerId,
      })
      set({
        chatSession: session,
        chatMessages: [],
        chatLoading: false,
      })
      // Reload sessions list
      await get().loadContextChatSessions(projectPath)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to start context chat session'
      set({ chatError: errorMessage, chatLoading: false })
      throw err
    }
  },

  loadContextChatSessions: async (projectPath: string) => {
    try {
      const sessions = await invoke<ContextChatSession[]>('list_context_chat_sessions', {
        projectPath,
      })
      set({ chatSessions: sessions })
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load context chat sessions'
      set({ chatError: errorMessage })
    }
  },

  getContextChatSession: async (sessionId: string, projectPath: string) => {
    set({ chatLoading: true, chatError: null })
    try {
      const session = await invoke<ContextChatSession>('get_context_chat_session', {
        sessionId,
        projectPath,
      })
      set({ chatSession: session, chatLoading: false })
      // Load messages for this session
      await get().loadChatMessages(sessionId, projectPath)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to get context chat session'
      set({ chatError: errorMessage, chatLoading: false })
    }
  },

  setCurrentChatSession: (session: ContextChatSession | null) => {
    set({ chatSession: session, chatMessages: session ? get().chatMessages : [] })
  },

  deleteContextChatSession: async (sessionId: string, projectPath: string) => {
    try {
      await invoke('delete_context_chat_session', { sessionId, projectPath })
      // Clear current session if it was deleted
      if (get().chatSession?.id === sessionId) {
        set({ chatSession: null, chatMessages: [] })
      }
      // Reload sessions list
      await get().loadContextChatSessions(projectPath)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to delete context chat session'
      set({ chatError: errorMessage })
      throw err
    }
  },

  loadChatMessages: async (sessionId: string, projectPath: string) => {
    try {
      const messages = await invoke<ContextChatMessage[]>('get_context_chat_messages', {
        sessionId,
        projectPath,
      })
      set({ chatMessages: messages })
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to load chat messages'
      set({ chatError: errorMessage })
    }
  },

  sendChatMessage: async (
    sessionId: string,
    projectPath: string,
    content: string,
    modelId?: string
  ) => {
    set({
      chatLoading: true,
      chatError: null,
      processingSessionId: sessionId,
      streamingStartedAt: Date.now(),
    })

    // Add user message optimistically
    const userMessage: ContextChatMessage = {
      id: `temp-${Date.now()}`,
      sessionId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }
    set((state) => ({
      chatMessages: [...state.chatMessages, userMessage],
    }))

    try {
      const response = await invoke<SendContextChatMessageResponse>('send_context_chat_message', {
        sessionId,
        projectPath,
        content,
        modelId,
      })

      // Update with actual response - replace temp user message with real one, add assistant message
      set((state) => ({
        chatMessages: [
          ...state.chatMessages.filter((m) => !m.id.startsWith('temp-')),
          response.userMessage,
          response.assistantMessage,
        ],
        // Update session with extracted context if present
        chatSession: state.chatSession
          ? {
              ...state.chatSession,
              extractedContext: response.extractedContext ?? state.chatSession.extractedContext,
            }
          : state.chatSession,
        chatLoading: false,
        processingSessionId: null,
        streamingStartedAt: null,
      }))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send message'
      // Remove optimistic message on error
      set((state) => ({
        chatMessages: state.chatMessages.filter((m) => !m.id.startsWith('temp-')),
        chatError: errorMessage,
        chatLoading: false,
        processingSessionId: null,
        streamingStartedAt: null,
      }))
      throw err
    }
  },

  saveContextFromChat: async (sessionId: string, projectPath: string, content?: string) => {
    set({ loading: true, error: null })
    try {
      await invoke('save_context_from_chat', { sessionId, projectPath, content })
      // Reload context to see saved file
      await get().loadProjectContext(projectPath)
      // Update session to reflect saved state
      await get().getContextChatSession(sessionId, projectPath)
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Failed to save context from chat'
      set({ error: errorMessage, loading: false })
      throw err
    }
  },

  // ===== Utility Actions =====

  clearError: () => set({ error: null }),

  clearChatError: () => set({ chatError: null }),

  reset: () =>
    set({
      projectContext: null,
      loading: false,
      error: null,
      currentProjectPath: null,
      chatSession: null,
      chatMessages: [],
      chatLoading: false,
      chatError: null,
      chatSessions: [],
      processingSessionId: null,
      streamingStartedAt: null,
    }),
}))

// ============================================================================
// Selector Hooks
// ============================================================================

/**
 * Check if context is configured for current project
 */
export function useIsContextConfigured(): boolean {
  return useContextStore((state) => (state.projectContext?.files.length ?? 0) > 0)
}

/**
 * Get total token count for current context
 */
export function useTotalTokenCount(): number {
  return useContextStore((state) =>
    state.projectContext?.files.reduce((sum, f) => sum + f.tokenCount, 0) ?? 0
  )
}

/**
 * Check if context setup should be shown (not configured and not dismissed)
 */
export function useShouldShowContextSetup(): boolean {
  return useContextStore((state) => {
    const context = state.projectContext
    if (!context) return false
    return context.files.length === 0 && !context.setupDismissed
  })
}

/**
 * Get extracted context from current chat session
 */
export function useExtractedContext(): string | undefined {
  return useContextStore((state) => state.chatSession?.extractedContext)
}

/**
 * Get project analysis from current chat session
 */
export function useProjectAnalysis(): ProjectAnalysis | undefined {
  return useContextStore((state) => state.chatSession?.analysis)
}
