// PRD Chat State Management Store
import { create } from 'zustand'
import { prdChatApi } from '@/lib/tauri-api'
import { asyncAction, errorToString, type AsyncState } from '@/lib/store-utils'
import type {
  ChatSession,
  ChatMessage,
  ChatAttachment,
  QualityAssessment,
  GuidedQuestion,
  ExtractedPRDContent,
  PRDTypeValue,
} from '@/types'

interface StartSessionOptions {
  agentType: string
  projectPath: string // Required for file-based storage
  prdId?: string
  prdType?: PRDTypeValue
  guidedMode?: boolean
  templateId?: string
  structuredMode?: boolean
  gsdMode?: boolean // GSD workflow mode
}

interface PRDChatStore extends AsyncState {
  // State
  sessions: ChatSession[]
  currentSession: ChatSession | null
  messages: ChatMessage[]
  streaming: boolean
  qualityAssessment: QualityAssessment | null
  guidedQuestions: GuidedQuestion[]
  extractedContent: ExtractedPRDContent | null
  processingSessionId: string | null
  // PRD plan file watcher state
  watchedPlanContent: string | null
  watchedPlanPath: string | null
  isWatchingPlan: boolean

  // Actions
  startSession: (options: StartSessionOptions) => Promise<void>
  updateSessionAgent: (agentType: string) => Promise<void>
  sendMessage: (content: string, attachments?: ChatAttachment[]) => Promise<void>
  loadHistory: (sessionId: string) => Promise<void>
  loadSessions: (projectPath?: string) => Promise<void>
  setCurrentSession: (session: ChatSession | null) => void
  deleteSession: (sessionId: string) => Promise<void>
  clearError: () => void
  assessQuality: () => Promise<QualityAssessment | null>
  loadGuidedQuestions: (prdType: PRDTypeValue) => Promise<void>
  previewExtraction: () => Promise<ExtractedPRDContent | null>
  // Structured output actions
  setStructuredMode: (enabled: boolean) => Promise<void>
  clearExtractedStructure: () => Promise<void>
  // PRD plan file watcher actions
  startWatchingPlanFile: () => Promise<void>
  stopWatchingPlanFile: () => Promise<void>
  updatePlanContent: (content: string, path: string) => void
}

export const usePRDChatStore = create<PRDChatStore>((set, get) => ({
  // Initial state
  sessions: [],
  currentSession: null,
  messages: [],
  loading: false,
  streaming: false,
  error: null,
  qualityAssessment: null,
  guidedQuestions: [],
  extractedContent: null,
  processingSessionId: null,
  watchedPlanContent: null,
  watchedPlanPath: null,
  isWatchingPlan: false,

  // Start a new chat session
  startSession: async (options: StartSessionOptions) => {
    set({ loading: true, error: null, qualityAssessment: null, guidedQuestions: [], extractedContent: null, watchedPlanContent: null, watchedPlanPath: null, isWatchingPlan: false })
    try {
      const session = await prdChatApi.startSession(
        options.agentType,
        options.projectPath,
        options.prdId,
        options.prdType,
        options.guidedMode,
        options.templateId,
        options.structuredMode,
        options.gsdMode
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

  updateSessionAgent: async (agentType: string) => {
    const { currentSession } = get()
    if (!currentSession || !currentSession.projectPath) return

    try {
      await prdChatApi.updateSessionAgent(currentSession.id, currentSession.projectPath, agentType)

      set((state) => ({
        currentSession: state.currentSession ? { ...state.currentSession, agentType } : null,
        sessions: state.sessions.map((s) => s.id === currentSession.id ? { ...s, agentType } : s)
      }))
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  // Send a message and receive a response
  sendMessage: async (content: string, attachments?: ChatAttachment[]) => {
    const { currentSession } = get()
    if (!currentSession) {
      throw new Error('No active session')
    }
    if (!currentSession.projectPath) {
      throw new Error('Session has no project path')
    }

    // Capture session ID at start to verify it hasn't changed when response arrives
    const sessionId = currentSession.id
    const projectPath = currentSession.projectPath

    // Create optimistic user message with UUID to prevent collision
    const optimisticMessage: ChatMessage = {
      id: `temp-${crypto.randomUUID()}`,
      sessionId: sessionId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      attachments,
    }

    // Add optimistic message and set streaming state
    set((state) => ({
      messages: [...state.messages, optimisticMessage],
      streaming: true,
      processingSessionId: sessionId,
      error: null,
    }))

    try {
      const response = await prdChatApi.sendMessage(sessionId, content, projectPath, attachments)

      // Replace optimistic message with actual messages and update session message count
      set((state) => {
        // If user switched to a different session while processing,
        // don't update messages - just clear streaming state
        if (state.currentSession?.id !== sessionId) {
          return {
            streaming: false,
            processingSessionId: null,
          }
        }

        // Update current session's message count locally
        const updatedSession = state.currentSession
          ? {
            ...state.currentSession,
            messageCount: (state.currentSession.messageCount || 0) + 2,
          }
          : null

        // Also update the session in the sessions list
        const updatedSessions = state.sessions.map((s) =>
          s.id === updatedSession?.id ? updatedSession : s
        )

        return {
          messages: [
            ...state.messages.filter((m) => m.id !== optimisticMessage.id),
            response.userMessage,
            response.assistantMessage,
          ],
          streaming: false,
          processingSessionId: null,
          currentSession: updatedSession,
          sessions: updatedSessions,
        }
      })
    } catch (error) {
      // Remove optimistic message on error (only if still on same session)
      set((state) => {
        // If user switched sessions, just clear streaming state
        if (state.currentSession?.id !== sessionId) {
          return {
            streaming: false,
            processingSessionId: null,
            error: errorToString(error),
          }
        }
        return {
          messages: state.messages.filter((m) => m.id !== optimisticMessage.id),
          streaming: false,
          processingSessionId: null,
          error: errorToString(error),
        }
      })
      throw error
    }
  },

  // Load message history for a session
  loadHistory: async (sessionId: string) => {
    const { currentSession } = get()
    if (!currentSession?.projectPath) {
      set({ error: 'No project path available' })
      return
    }
    await asyncAction(set, async () => {
      const messages = await prdChatApi.getHistory(sessionId, currentSession.projectPath!)
      return { messages }
    })
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
    const sessionToDelete = state.sessions.find(s => s.id === sessionId)
    if (!sessionToDelete?.projectPath) {
      set({ error: 'Cannot delete session without project path' })
      return
    }
    await asyncAction(set, async () => {
      await prdChatApi.deleteSession(sessionId, sessionToDelete.projectPath!)
      const currentState = get()
      return {
        sessions: currentState.sessions.filter((s) => s.id !== sessionId),
        currentSession: currentState.currentSession?.id === sessionId ? null : currentState.currentSession,
        messages: currentState.currentSession?.id === sessionId ? [] : currentState.messages,
      }
    }, { rethrow: true })
  },

  // Clear error
  clearError: () => {
    set({ error: null })
  },

  // Assess quality of current session
  assessQuality: async () => {
    const { currentSession } = get()
    if (!currentSession || !currentSession.projectPath) {
      return null
    }

    set({ loading: true, error: null })
    try {
      const assessment = await prdChatApi.assessQuality(currentSession.id, currentSession.projectPath)
      set({ qualityAssessment: assessment, loading: false })
      return assessment
    } catch (error) {
      set({ error: errorToString(error), loading: false })
      return null
    }
  },

  // Load guided questions for a PRD type
  loadGuidedQuestions: async (prdType: PRDTypeValue) => {
    try {
      const questions = await prdChatApi.getGuidedQuestions(prdType)
      set({ guidedQuestions: questions })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  // Preview extraction before export
  previewExtraction: async () => {
    const { currentSession } = get()
    if (!currentSession || !currentSession.projectPath) {
      return null
    }

    set({ loading: true, error: null })
    try {
      const content = await prdChatApi.previewExtraction(currentSession.id, currentSession.projectPath)
      set({ extractedContent: content, loading: false })
      return content
    } catch (error) {
      set({ error: errorToString(error), loading: false })
      return null
    }
  },

  // Set structured output mode for current session
  setStructuredMode: async (enabled: boolean) => {
    const { currentSession } = get()
    if (!currentSession || !currentSession.projectPath) {
      return
    }

    try {
      await prdChatApi.setStructuredMode(currentSession.id, currentSession.projectPath, enabled)
      // Update local state
      set((state) => {
        const updatedSession = state.currentSession
          ? { ...state.currentSession, structuredMode: enabled }
          : null
        const updatedSessions = state.sessions.map((s) =>
          s.id === currentSession.id ? { ...s, structuredMode: enabled } : s
        )
        return {
          currentSession: updatedSession,
          sessions: updatedSessions,
        }
      })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  // Clear extracted structure for current session
  clearExtractedStructure: async () => {
    const { currentSession } = get()
    if (!currentSession || !currentSession.projectPath) {
      return
    }

    try {
      await prdChatApi.clearExtractedStructure(currentSession.id, currentSession.projectPath)
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  // Start watching the PRD plan file for the current session
  startWatchingPlanFile: async () => {
    const { currentSession, isWatchingPlan } = get()
    if (!currentSession || !currentSession.projectPath || isWatchingPlan) {
      return
    }

    try {
      const result = await prdChatApi.startWatchingPlanFile(currentSession.id, currentSession.projectPath)
      if (result.success) {
        set({
          isWatchingPlan: true,
          watchedPlanPath: result.path,
          watchedPlanContent: result.initialContent,
        })
      } else {
        // Don't show error for missing project path - it's expected for some sessions
        if (result.error && !result.error.includes('no project path')) {
          set({
            error: result.error,
          })
        }
      }
    } catch (error) {
      // Silently fail - not all sessions have project paths
      console.warn('Failed to start watching plan file:', error)
    }
  },

  // Stop watching the PRD plan file
  stopWatchingPlanFile: async () => {
    const { currentSession, isWatchingPlan } = get()
    if (!currentSession || !isWatchingPlan) {
      return
    }

    try {
      await prdChatApi.stopWatchingPlanFile(currentSession.id)
    } catch {
      // Ignore errors when stopping
    } finally {
      set({
        isWatchingPlan: false,
        watchedPlanContent: null,
        watchedPlanPath: null,
      })
    }
  },

  // Update plan content (called from event listener)
  updatePlanContent: (content: string, path: string) => {
    set({
      watchedPlanContent: content,
      watchedPlanPath: path,
    })
  },
}))
