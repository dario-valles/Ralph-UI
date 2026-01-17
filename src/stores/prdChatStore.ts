// PRD Chat State Management Store
import { create } from 'zustand'
import { prdChatApi } from '@/lib/tauri-api'
import type { ChatSession, ChatMessage, PRDDocument } from '@/types'

interface PRDChatStore {
  // State
  sessions: ChatSession[]
  currentSession: ChatSession | null
  messages: ChatMessage[]
  loading: boolean
  streaming: boolean
  error: string | null

  // Actions
  startSession: (agentType: string, projectPath?: string, prdId?: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  loadHistory: (sessionId: string) => Promise<void>
  loadSessions: () => Promise<void>
  setCurrentSession: (session: ChatSession | null) => void
  deleteSession: (sessionId: string) => Promise<void>
  exportToPRD: (title: string) => Promise<PRDDocument | null>
  clearError: () => void
}

export const usePRDChatStore = create<PRDChatStore>((set, get) => ({
  // Initial state
  sessions: [],
  currentSession: null,
  messages: [],
  loading: false,
  streaming: false,
  error: null,

  // Start a new chat session
  startSession: async (agentType: string, projectPath?: string, prdId?: string) => {
    set({ loading: true, error: null })
    try {
      const session = await prdChatApi.startSession(agentType, projectPath, prdId)
      set((state) => ({
        sessions: [session, ...state.sessions],
        currentSession: session,
        messages: [],
        loading: false,
      }))
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

      // Replace optimistic message with actual messages
      set((state) => ({
        messages: [
          ...state.messages.filter((m) => m.id !== optimisticMessage.id),
          response.userMessage,
          response.assistantMessage,
        ],
        streaming: false,
      }))
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
}))
