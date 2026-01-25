/**
 * Chat Session Slice
 *
 * Handles session lifecycle: starting, loading, switching, and deleting sessions.
 */
import { prdChatApi } from '@/lib/backend-api'
import { asyncAction, errorToString } from '@/lib/store-utils'
import type {
  SetState,
  GetState,
  ChatSessionSlice,
  StartSessionOptions,
} from './prdChatTypes'
import { getSessionWithPath } from './prdChatTypes'
import type { ChatSession } from '@/types'

/**
 * Creates the chat session slice
 */
export const createChatSessionSlice = (
  set: SetState,
  get: GetState
): ChatSessionSlice => ({
  // Start a new chat session
  startSession: async (options: StartSessionOptions) => {
    set({
      loading: true,
      error: null,
      qualityAssessment: null,
      guidedQuestions: [],
      extractedContent: null,
      watchedPlanContent: null,
      watchedPlanPath: null,
      isWatchingPlan: false,
    })
    try {
      const session = await prdChatApi.startSession(
        options.agentType,
        options.projectPath,
        options.prdId,
        options.prdType,
        options.guidedMode,
        options.templateId,
        options.structuredMode,
        options.title
      )
      set((state) => ({
        sessions: [session, ...state.sessions],
        currentSession: session,
        messages: [],
        loading: false,
      }))

      // Load history to get the welcome message (created by backend in guided mode)
      if (options.guidedMode !== false) {
        const messages = await prdChatApi.getHistory(session.id, options.projectPath)
        set({ messages })
      }

      // Load guided questions if prdType is specified
      if (options.prdType && options.guidedMode !== false) {
        const questions = await prdChatApi.getGuidedQuestions(options.prdType)
        set({ guidedQuestions: questions })
      }
    } catch (error) {
      set({ error: errorToString(error), loading: false })
    }
  },

  // Update the agent type for the current session
  updateSessionAgent: async (agentType: string) => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return

    try {
      await prdChatApi.updateSessionAgent(ctx.session.id, ctx.projectPath, agentType)

      set((state) => ({
        currentSession: state.currentSession ? { ...state.currentSession, agentType } : null,
        sessions: state.sessions.map((s) =>
          s.id === ctx.session.id ? { ...s, agentType } : s
        ),
      }))
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  // Load all chat sessions (requires project path from current context)
  loadSessions: async (projectPath?: string) => {
    if (!projectPath) {
      set({ error: 'Project path is required to load sessions' })
      return
    }
    await asyncAction(set, async () => {
      const sessions = await prdChatApi.getSessions(projectPath)
      return { sessions }
    })
  },

  // Set the current session (clears messages)
  // Also restores streaming state if session has a pending operation (for page reload recovery)
  setCurrentSession: (session: ChatSession | null) => {
    const currentState = get()

    // Don't interfere with active streaming - only update session and messages
    // This prevents bugs where session selection during streaming would kill the stream
    if (currentState.streaming) {
      set({
        currentSession: session,
        messages: [],
      })
      return
    }

    // Check if session has a pending operation that may still be running (page reload recovery)
    let shouldRestoreStreaming = false
    if (session?.pendingOperationStartedAt) {
      const startedAt = new Date(session.pendingOperationStartedAt)
      const elapsedMs = Date.now() - startedAt.getTime()
      const timeoutMs = 25 * 60 * 1000 // 25 minutes (AGENT_TIMEOUT_SECS from backend)

      if (elapsedMs < timeoutMs) {
        // Operation may still be running - restore streaming state
        shouldRestoreStreaming = true
      }
    }

    set({
      currentSession: session,
      messages: [],
      ...(shouldRestoreStreaming && session
        ? {
            streaming: true,
            processingSessionId: session.id,
          }
        : {}), // Don't reset streaming state if not restoring - leave it as-is
    })
  },

  // Delete a chat session
  deleteSession: async (sessionId: string) => {
    const state = get()
    const sessionToDelete = state.sessions.find((s) => s.id === sessionId)
    if (!sessionToDelete?.projectPath) {
      set({ error: 'Cannot delete session without project path' })
      return
    }
    await asyncAction(
      set,
      async () => {
        await prdChatApi.deleteSession(sessionId, sessionToDelete.projectPath!)
        const currentState = get()
        return {
          sessions: currentState.sessions.filter((s) => s.id !== sessionId),
          currentSession:
            currentState.currentSession?.id === sessionId ? null : currentState.currentSession,
          messages: currentState.currentSession?.id === sessionId ? [] : currentState.messages,
        }
      },
      { rethrow: true }
    )
  },

  // Clear error
  clearError: () => {
    set({ error: null })
  },
})
