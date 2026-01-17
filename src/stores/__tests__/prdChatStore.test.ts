import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePRDChatStore } from '../prdChatStore'
import { prdChatApi } from '@/lib/tauri-api'
import type { ChatSession, ChatMessage, PRDDocument } from '@/types'

// Mock the tauri API
vi.mock('@/lib/tauri-api', () => ({
  prdChatApi: {
    startSession: vi.fn(),
    sendMessage: vi.fn(),
    getHistory: vi.fn(),
    getSessions: vi.fn(),
    deleteSession: vi.fn(),
    exportToPRD: vi.fn(),
  },
}))

describe('prdChatStore', () => {
  const mockSession: ChatSession = {
    id: 'session-1',
    agentType: 'claude',
    projectPath: '/test/project',
    prdId: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    title: 'Test Session',
    messageCount: 0,
  }

  const mockSession2: ChatSession = {
    ...mockSession,
    id: 'session-2',
    title: 'Test Session 2',
    messageCount: 5,
  }

  const mockUserMessage: ChatMessage = {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'user',
    content: 'Help me create a PRD for a todo app',
    createdAt: new Date().toISOString(),
  }

  const mockAssistantMessage: ChatMessage = {
    id: 'msg-2',
    sessionId: 'session-1',
    role: 'assistant',
    content: 'I would be happy to help you create a PRD for a todo app. Let me ask you some questions...',
    createdAt: new Date().toISOString(),
  }

  const mockPRD: PRDDocument = {
    id: 'prd-1',
    title: 'Todo App PRD',
    description: 'A PRD for a simple todo application',
    content: JSON.stringify({ overview: 'Todo app' }),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
  }

  beforeEach(() => {
    const store = usePRDChatStore.getState()
    store.sessions = []
    store.currentSession = null
    store.messages = []
    store.loading = false
    store.streaming = false
    store.error = null
    vi.clearAllMocks()
  })

  describe('startSession', () => {
    it('should start a new session successfully', async () => {
      vi.mocked(prdChatApi.startSession).mockResolvedValue(mockSession)

      const store = usePRDChatStore.getState()
      await store.startSession('claude', '/test/project')

      expect(prdChatApi.startSession).toHaveBeenCalledWith('claude', '/test/project', undefined)
      expect(usePRDChatStore.getState().currentSession).toEqual(mockSession)
      expect(usePRDChatStore.getState().sessions).toContainEqual(mockSession)
      expect(usePRDChatStore.getState().messages).toEqual([])
      expect(usePRDChatStore.getState().loading).toBe(false)
    })

    it('should start a session with prdId for context', async () => {
      const sessionWithPrd = { ...mockSession, prdId: 'prd-123' }
      vi.mocked(prdChatApi.startSession).mockResolvedValue(sessionWithPrd)

      const store = usePRDChatStore.getState()
      await store.startSession('claude', '/test/project', 'prd-123')

      expect(prdChatApi.startSession).toHaveBeenCalledWith('claude', '/test/project', 'prd-123')
      expect(usePRDChatStore.getState().currentSession).toEqual(sessionWithPrd)
    })

    it('should add new session to beginning of sessions list', async () => {
      const store = usePRDChatStore.getState()
      store.sessions = [mockSession2]

      vi.mocked(prdChatApi.startSession).mockResolvedValue(mockSession)
      await store.startSession('claude')

      expect(usePRDChatStore.getState().sessions[0]).toEqual(mockSession)
      expect(usePRDChatStore.getState().sessions[1]).toEqual(mockSession2)
    })

    it('should set loading state during startSession', async () => {
      let loadingDuringCall = false
      vi.mocked(prdChatApi.startSession).mockImplementation(async () => {
        loadingDuringCall = usePRDChatStore.getState().loading
        return mockSession
      })

      const store = usePRDChatStore.getState()
      await store.startSession('claude')

      expect(loadingDuringCall).toBe(true)
    })

    it('should handle errors when starting session', async () => {
      const error = new Error('Failed to start session')
      vi.mocked(prdChatApi.startSession).mockRejectedValue(error)

      const store = usePRDChatStore.getState()
      await store.startSession('claude')

      expect(usePRDChatStore.getState().error).toBe('Failed to start session')
      expect(usePRDChatStore.getState().loading).toBe(false)
      expect(usePRDChatStore.getState().currentSession).toBeNull()
    })

    it('should clear previous error when starting new session', async () => {
      const store = usePRDChatStore.getState()
      store.error = 'Previous error'

      vi.mocked(prdChatApi.startSession).mockResolvedValue(mockSession)
      await store.startSession('claude')

      expect(usePRDChatStore.getState().error).toBeNull()
    })
  })

  describe('sendMessage', () => {
    it('should send message and receive response', async () => {
      const response = {
        userMessage: mockUserMessage,
        assistantMessage: mockAssistantMessage,
      }
      vi.mocked(prdChatApi.sendMessage).mockResolvedValue(response)

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      await store.sendMessage('Help me create a PRD for a todo app')

      expect(prdChatApi.sendMessage).toHaveBeenCalledWith('session-1', 'Help me create a PRD for a todo app')
      expect(usePRDChatStore.getState().messages).toContainEqual(mockUserMessage)
      expect(usePRDChatStore.getState().messages).toContainEqual(mockAssistantMessage)
    })

    it('should set streaming state while waiting for response', async () => {
      let streamingDuringCall = false
      vi.mocked(prdChatApi.sendMessage).mockImplementation(async () => {
        streamingDuringCall = usePRDChatStore.getState().streaming
        return {
          userMessage: mockUserMessage,
          assistantMessage: mockAssistantMessage,
        }
      })

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      await store.sendMessage('Test message')

      expect(streamingDuringCall).toBe(true)
      expect(usePRDChatStore.getState().streaming).toBe(false)
    })

    it('should add user message optimistically before response', async () => {
      let messagesBeforeResponse: ChatMessage[] = []
      vi.mocked(prdChatApi.sendMessage).mockImplementation(async () => {
        messagesBeforeResponse = [...usePRDChatStore.getState().messages]
        return {
          userMessage: mockUserMessage,
          assistantMessage: mockAssistantMessage,
        }
      })

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      await store.sendMessage('Help me create a PRD for a todo app')

      // Should have optimistic user message
      expect(messagesBeforeResponse.length).toBe(1)
      expect(messagesBeforeResponse[0].role).toBe('user')
      expect(messagesBeforeResponse[0].content).toBe('Help me create a PRD for a todo app')
    })

    it('should throw error if no current session', async () => {
      const store = usePRDChatStore.getState()
      store.currentSession = null

      await expect(store.sendMessage('Test')).rejects.toThrow('No active session')
    })

    it('should handle errors when sending message', async () => {
      const error = new Error('Failed to send message')
      vi.mocked(prdChatApi.sendMessage).mockRejectedValue(error)

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession

      await expect(store.sendMessage('Test')).rejects.toThrow('Failed to send message')
      expect(usePRDChatStore.getState().error).toBe('Failed to send message')
      expect(usePRDChatStore.getState().streaming).toBe(false)
    })

    it('should remove optimistic message on error', async () => {
      const error = new Error('Failed to send message')
      vi.mocked(prdChatApi.sendMessage).mockRejectedValue(error)

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      store.messages = []

      try {
        await store.sendMessage('Test message')
      } catch {
        // Expected to throw
      }

      // Optimistic message should be removed on error
      expect(usePRDChatStore.getState().messages).toEqual([])
    })

    it('should append messages to existing conversation', async () => {
      const existingMessage: ChatMessage = {
        id: 'msg-0',
        sessionId: 'session-1',
        role: 'assistant',
        content: 'Welcome! How can I help?',
        createdAt: new Date().toISOString(),
      }

      const response = {
        userMessage: mockUserMessage,
        assistantMessage: mockAssistantMessage,
      }
      vi.mocked(prdChatApi.sendMessage).mockResolvedValue(response)

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      store.messages = [existingMessage]
      await store.sendMessage('Help me create a PRD for a todo app')

      expect(usePRDChatStore.getState().messages).toHaveLength(3)
      expect(usePRDChatStore.getState().messages[0]).toEqual(existingMessage)
    })
  })

  describe('loadHistory', () => {
    it('should load message history for a session', async () => {
      const messages = [mockUserMessage, mockAssistantMessage]
      vi.mocked(prdChatApi.getHistory).mockResolvedValue(messages)

      const store = usePRDChatStore.getState()
      await store.loadHistory('session-1')

      expect(prdChatApi.getHistory).toHaveBeenCalledWith('session-1')
      expect(usePRDChatStore.getState().messages).toEqual(messages)
      expect(usePRDChatStore.getState().loading).toBe(false)
    })

    it('should set loading state during loadHistory', async () => {
      let loadingDuringCall = false
      vi.mocked(prdChatApi.getHistory).mockImplementation(async () => {
        loadingDuringCall = usePRDChatStore.getState().loading
        return []
      })

      const store = usePRDChatStore.getState()
      await store.loadHistory('session-1')

      expect(loadingDuringCall).toBe(true)
    })

    it('should handle errors when loading history', async () => {
      const error = new Error('Failed to load history')
      vi.mocked(prdChatApi.getHistory).mockRejectedValue(error)

      const store = usePRDChatStore.getState()
      await store.loadHistory('session-1')

      expect(usePRDChatStore.getState().error).toBe('Failed to load history')
      expect(usePRDChatStore.getState().loading).toBe(false)
    })

    it('should replace existing messages with loaded history', async () => {
      const newMessages = [mockAssistantMessage]
      vi.mocked(prdChatApi.getHistory).mockResolvedValue(newMessages)

      const store = usePRDChatStore.getState()
      store.messages = [mockUserMessage]
      await store.loadHistory('session-1')

      expect(usePRDChatStore.getState().messages).toEqual(newMessages)
    })
  })

  describe('loadSessions', () => {
    it('should load all sessions', async () => {
      const sessions = [mockSession, mockSession2]
      vi.mocked(prdChatApi.getSessions).mockResolvedValue(sessions)

      const store = usePRDChatStore.getState()
      await store.loadSessions()

      expect(prdChatApi.getSessions).toHaveBeenCalled()
      expect(usePRDChatStore.getState().sessions).toEqual(sessions)
      expect(usePRDChatStore.getState().loading).toBe(false)
    })

    it('should set loading state during loadSessions', async () => {
      let loadingDuringCall = false
      vi.mocked(prdChatApi.getSessions).mockImplementation(async () => {
        loadingDuringCall = usePRDChatStore.getState().loading
        return []
      })

      const store = usePRDChatStore.getState()
      await store.loadSessions()

      expect(loadingDuringCall).toBe(true)
    })

    it('should handle errors when loading sessions', async () => {
      const error = new Error('Failed to load sessions')
      vi.mocked(prdChatApi.getSessions).mockRejectedValue(error)

      const store = usePRDChatStore.getState()
      await store.loadSessions()

      expect(usePRDChatStore.getState().error).toBe('Failed to load sessions')
      expect(usePRDChatStore.getState().loading).toBe(false)
    })

    it('should clear previous error when loading sessions', async () => {
      const store = usePRDChatStore.getState()
      store.error = 'Previous error'

      vi.mocked(prdChatApi.getSessions).mockResolvedValue([])
      await store.loadSessions()

      expect(usePRDChatStore.getState().error).toBeNull()
    })
  })

  describe('setCurrentSession', () => {
    it('should set current session', () => {
      const store = usePRDChatStore.getState()
      store.setCurrentSession(mockSession)

      expect(usePRDChatStore.getState().currentSession).toEqual(mockSession)
    })

    it('should clear current session when null', () => {
      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      store.setCurrentSession(null)

      expect(usePRDChatStore.getState().currentSession).toBeNull()
    })

    it('should clear messages when setting new session', () => {
      const store = usePRDChatStore.getState()
      store.messages = [mockUserMessage, mockAssistantMessage]
      store.setCurrentSession(mockSession)

      expect(usePRDChatStore.getState().messages).toEqual([])
    })

    it('should clear messages when clearing session', () => {
      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      store.messages = [mockUserMessage]
      store.setCurrentSession(null)

      expect(usePRDChatStore.getState().messages).toEqual([])
    })
  })

  describe('deleteSession', () => {
    it('should delete a session', async () => {
      vi.mocked(prdChatApi.deleteSession).mockResolvedValue(undefined)

      const store = usePRDChatStore.getState()
      store.sessions = [mockSession, mockSession2]
      await store.deleteSession(mockSession.id)

      expect(prdChatApi.deleteSession).toHaveBeenCalledWith(mockSession.id)
      expect(usePRDChatStore.getState().sessions).toEqual([mockSession2])
    })

    it('should clear currentSession if deleted', async () => {
      vi.mocked(prdChatApi.deleteSession).mockResolvedValue(undefined)

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      store.sessions = [mockSession]
      await store.deleteSession(mockSession.id)

      expect(usePRDChatStore.getState().currentSession).toBeNull()
      expect(usePRDChatStore.getState().messages).toEqual([])
    })

    it('should not clear currentSession if different session deleted', async () => {
      vi.mocked(prdChatApi.deleteSession).mockResolvedValue(undefined)

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession2
      store.sessions = [mockSession, mockSession2]
      await store.deleteSession(mockSession.id)

      expect(usePRDChatStore.getState().currentSession).toEqual(mockSession2)
    })

    it('should set loading state during deleteSession', async () => {
      let loadingDuringCall = false
      vi.mocked(prdChatApi.deleteSession).mockImplementation(async () => {
        loadingDuringCall = usePRDChatStore.getState().loading
        return undefined
      })

      const store = usePRDChatStore.getState()
      store.sessions = [mockSession]
      await store.deleteSession(mockSession.id)

      expect(loadingDuringCall).toBe(true)
    })

    it('should handle errors when deleting session', async () => {
      const error = new Error('Failed to delete session')
      vi.mocked(prdChatApi.deleteSession).mockRejectedValue(error)

      const store = usePRDChatStore.getState()
      await expect(store.deleteSession(mockSession.id)).rejects.toThrow('Failed to delete session')
      expect(usePRDChatStore.getState().error).toBe('Failed to delete session')
    })
  })

  describe('exportToPRD', () => {
    it('should export chat to PRD', async () => {
      vi.mocked(prdChatApi.exportToPRD).mockResolvedValue(mockPRD)

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      const result = await store.exportToPRD('Todo App PRD')

      expect(prdChatApi.exportToPRD).toHaveBeenCalledWith('session-1', 'Todo App PRD')
      expect(result).toEqual(mockPRD)
      expect(usePRDChatStore.getState().loading).toBe(false)
    })

    it('should return null if no current session', async () => {
      const store = usePRDChatStore.getState()
      store.currentSession = null

      const result = await store.exportToPRD('Test PRD')

      expect(result).toBeNull()
      expect(prdChatApi.exportToPRD).not.toHaveBeenCalled()
    })

    it('should set loading state during export', async () => {
      let loadingDuringCall = false
      vi.mocked(prdChatApi.exportToPRD).mockImplementation(async () => {
        loadingDuringCall = usePRDChatStore.getState().loading
        return mockPRD
      })

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      await store.exportToPRD('Test PRD')

      expect(loadingDuringCall).toBe(true)
    })

    it('should handle errors when exporting to PRD', async () => {
      const error = new Error('Failed to export')
      vi.mocked(prdChatApi.exportToPRD).mockRejectedValue(error)

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession

      await expect(store.exportToPRD('Test PRD')).rejects.toThrow('Failed to export')
      expect(usePRDChatStore.getState().error).toBe('Failed to export')
      expect(usePRDChatStore.getState().loading).toBe(false)
    })
  })

  describe('clearError', () => {
    it('should clear error', () => {
      const store = usePRDChatStore.getState()
      store.error = 'Some error'

      store.clearError()

      expect(usePRDChatStore.getState().error).toBeNull()
    })

    it('should not affect other state', () => {
      const store = usePRDChatStore.getState()
      store.error = 'Some error'
      store.sessions = [mockSession]
      store.currentSession = mockSession
      store.messages = [mockUserMessage]

      store.clearError()

      expect(usePRDChatStore.getState().sessions).toEqual([mockSession])
      expect(usePRDChatStore.getState().currentSession).toEqual(mockSession)
      expect(usePRDChatStore.getState().messages).toEqual([mockUserMessage])
    })
  })

  describe('streaming state management', () => {
    it('should track streaming separately from loading', async () => {
      vi.mocked(prdChatApi.sendMessage).mockImplementation(async () => {
        // Both states should be independent
        const state = usePRDChatStore.getState()
        expect(state.streaming).toBe(true)
        expect(state.loading).toBe(false)
        return {
          userMessage: mockUserMessage,
          assistantMessage: mockAssistantMessage,
        }
      })

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      await store.sendMessage('Test')

      expect(usePRDChatStore.getState().streaming).toBe(false)
    })

    it('should not be streaming initially', () => {
      const store = usePRDChatStore.getState()
      expect(store.streaming).toBe(false)
    })
  })

  describe('error handling edge cases', () => {
    it('should handle non-Error objects in catch', async () => {
      vi.mocked(prdChatApi.startSession).mockRejectedValue('String error')

      const store = usePRDChatStore.getState()
      await store.startSession('claude')

      expect(usePRDChatStore.getState().error).toBe('Failed to start session')
    })

    it('should handle undefined error message', async () => {
      vi.mocked(prdChatApi.startSession).mockRejectedValue(new Error())

      const store = usePRDChatStore.getState()
      await store.startSession('claude')

      expect(usePRDChatStore.getState().error).toBe('Failed to start session')
    })
  })

  describe('state isolation', () => {
    it('should not leak state between sessions', async () => {
      const session1Messages = [mockUserMessage]
      const session2Messages = [mockAssistantMessage]

      vi.mocked(prdChatApi.getHistory)
        .mockResolvedValueOnce(session1Messages)
        .mockResolvedValueOnce(session2Messages)

      const store = usePRDChatStore.getState()

      await store.loadHistory('session-1')
      expect(usePRDChatStore.getState().messages).toEqual(session1Messages)

      await store.loadHistory('session-2')
      expect(usePRDChatStore.getState().messages).toEqual(session2Messages)
    })
  })
})
