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

  // Update the agent type and optional provider for the current session
  updateSessionAgent: async (agentType: string, providerId?: string) => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return

    // Log provider selection
    console.log('🔄 [PRD Chat] Updating agent configuration:')
    console.log('  Agent Type:', agentType)
    console.log('  Provider ID:', providerId || '(default)')
    console.log('  Session ID:', ctx.session.id)

    try {
      await prdChatApi.updateSessionAgent(ctx.session.id, ctx.projectPath, agentType, providerId)

      console.log('✓ [PRD Chat] Agent configuration updated successfully')

      set((state) => ({
        currentSession: state.currentSession ? { ...state.currentSession, agentType, providerId } : null,
        sessions: state.sessions.map((s) =>
          s.id === ctx.session.id ? { ...s, agentType, providerId } : s
        ),
      }))
    } catch (error) {
      console.error('✗ [PRD Chat] Failed to update agent configuration:', error)
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
    const shouldRestoreStreaming = session?.pendingOperationStartedAt
      ? Date.now() - new Date(session.pendingOperationStartedAt).getTime() < 25 * 60 * 1000 // 25 minutes
      : false

    // Clear enhanced quality report when switching sessions
    set({
      currentSession: session,
      messages: [],
      enhancedQualityReport: null,
      ...(shouldRestoreStreaming && session
        ? {
            streaming: true,
            processingSessionId: session.id,
          }
        : {}),
    })

    // Load guided questions if session has a PRD type
    if (session?.prdType) {
      prdChatApi.getGuidedQuestions(session.prdType).then((questions) => {
        set({ guidedQuestions: questions })
      }).catch((err) => {
        console.error('Failed to load guided questions:', err)
      })
    } else {
      // Clear guided questions if no PRD type
      set({ guidedQuestions: [] })
    }
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
