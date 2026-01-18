// PRD Chat State Management Store
import { create } from 'zustand'
import { prdChatApi } from '@/lib/tauri-api'
import type {
  ChatSession,
  ChatMessage,
  PRDDocument,
  QualityAssessment,
  GuidedQuestion,
  ExtractedPRDContent,
  PRDTypeValue,
} from '@/types'

interface StartSessionOptions {
  agentType: string
  projectPath?: string
  prdId?: string
  prdType?: PRDTypeValue
  guidedMode?: boolean
  templateId?: string
}

interface PRDChatStore {
  // State
  sessions: ChatSession[]
  currentSession: ChatSession | null
  messages: ChatMessage[]
  loading: boolean
  streaming: boolean
  error: string | null
  qualityAssessment: QualityAssessment | null
  guidedQuestions: GuidedQuestion[]
  extractedContent: ExtractedPRDContent | null

  // Actions
  startSession: (options: StartSessionOptions) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  loadHistory: (sessionId: string) => Promise<void>
  loadSessions: () => Promise<void>
  setCurrentSession: (session: ChatSession | null) => void
  deleteSession: (sessionId: string) => Promise<void>
  exportToPRD: (title: string) => Promise<PRDDocument | null>
  clearError: () => void
  assessQuality: () => Promise<QualityAssessment | null>
  loadGuidedQuestions: (prdType: PRDTypeValue) => Promise<void>
  previewExtraction: () => Promise<ExtractedPRDContent | null>
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

  // Start a new chat session
  startSession: async (options: StartSessionOptions) => {
    set({ loading: true, error: null, qualityAssessment: null, guidedQuestions: [], extractedContent: null })
    try {
      const session = await prdChatApi.startSession(
        options.agentType,
        options.projectPath,
        options.prdId,
        options.prdType,
        options.guidedMode,
        options.templateId
      )
      set((state) => ({
        sessions: [session, ...state.sessions],
        currentSession: session,
        messages: [],
        loading: false,
      }))

      // Load history to get the welcome message (created by backend in guided mode)
      if (options.guidedMode !== false) {
        const messages = await prdChatApi.getHistory(session.id)
        set({ messages })
      }

      // Load guided questions if prdType is specified
      if (options.prdType && options.guidedMode !== false) {
        const questions = await prdChatApi.getGuidedQuestions(options.prdType)
        set({ guidedQuestions: questions })
      }
    } catch (error) {
      set({
        error: error instanceof Error && error.message ? error.message : 'Failed to start session',
        loading: false,
      })
    }
  },

  // Send a message and receive a response
  sendMessage: async (content: string) => {
    const { currentSession } = get()
    if (!currentSession) {
      throw new Error('No active session')
    }

    // Create optimistic user message
    const optimisticMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      sessionId: currentSession.id,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
    }

    // Add optimistic message and set streaming state
    set((state) => ({
      messages: [...state.messages, optimisticMessage],
      streaming: true,
      error: null,
    }))

    try {
      const response = await prdChatApi.sendMessage(currentSession.id, content)

      // Replace optimistic message with actual messages and update session message count
      set((state) => {
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
          currentSession: updatedSession,
          sessions: updatedSessions,
        }
      })
    } catch (error) {
      // Remove optimistic message on error
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== optimisticMessage.id),
        streaming: false,
        error: error instanceof Error && error.message ? error.message : 'Failed to send message',
      }))
      throw error
    }
  },

  // Load message history for a session
  loadHistory: async (sessionId: string) => {
    set({ loading: true, error: null })
    try {
      const messages = await prdChatApi.getHistory(sessionId)
      set({ messages, loading: false })
    } catch (error) {
      set({
        error: error instanceof Error && error.message ? error.message : 'Failed to load history',
        loading: false,
      })
    }
  },

  // Load all chat sessions
  loadSessions: async () => {
    set({ loading: true, error: null })
    try {
      const sessions = await prdChatApi.getSessions()
      set({ sessions, loading: false })
    } catch (error) {
      set({
        error: error instanceof Error && error.message ? error.message : 'Failed to load sessions',
        loading: false,
      })
    }
  },

  // Set the current session (clears messages)
  setCurrentSession: (session: ChatSession | null) => {
    set({
      currentSession: session,
      messages: [],
    })
  },

  // Delete a chat session
  deleteSession: async (sessionId: string) => {
    set({ loading: true, error: null })
    try {
      await prdChatApi.deleteSession(sessionId)
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== sessionId),
        currentSession: state.currentSession?.id === sessionId ? null : state.currentSession,
        messages: state.currentSession?.id === sessionId ? [] : state.messages,
        loading: false,
      }))
    } catch (error) {
      set({
        error: error instanceof Error && error.message ? error.message : 'Failed to delete session',
        loading: false,
      })
      throw error
    }
  },

  // Export the current chat to a PRD document
  exportToPRD: async (title: string) => {
    const { currentSession } = get()
    if (!currentSession) {
      return null
    }

    set({ loading: true, error: null })
    try {
      const prd = await prdChatApi.exportToPRD(currentSession.id, title)
      set({ loading: false })
      return prd
    } catch (error) {
      set({
        error: error instanceof Error && error.message ? error.message : 'Failed to export',
        loading: false,
      })
      throw error
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null })
  },

  // Assess quality of current session
  assessQuality: async () => {
    const { currentSession } = get()
    if (!currentSession) {
      return null
    }

    set({ loading: true, error: null })
    try {
      const assessment = await prdChatApi.assessQuality(currentSession.id)
      set({ qualityAssessment: assessment, loading: false })
      return assessment
    } catch (error) {
      set({
        error: error instanceof Error && error.message ? error.message : 'Failed to assess quality',
        loading: false,
      })
      return null
    }
  },

  // Load guided questions for a PRD type
  loadGuidedQuestions: async (prdType: PRDTypeValue) => {
    try {
      const questions = await prdChatApi.getGuidedQuestions(prdType)
      set({ guidedQuestions: questions })
    } catch (error) {
      set({
        error: error instanceof Error && error.message ? error.message : 'Failed to load guided questions',
      })
    }
  },

  // Preview extraction before export
  previewExtraction: async () => {
    const { currentSession } = get()
    if (!currentSession) {
      return null
    }

    set({ loading: true, error: null })
    try {
      const content = await prdChatApi.previewExtraction(currentSession.id)
      set({ extractedContent: content, loading: false })
      return content
    } catch (error) {
      set({
        error: error instanceof Error && error.message ? error.message : 'Failed to preview extraction',
        loading: false,
      })
      return null
    }
  },
}))
