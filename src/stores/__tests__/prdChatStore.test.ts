import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePRDChatStore } from '../prdChatStore'
import { prdChatApi } from '@/lib/tauri-api'
import { resetStore } from '@/test/store-test-utils'
import type { ChatSession, ChatMessage } from '@/types'

// Mock the tauri API
vi.mock('@/lib/tauri-api', () => ({
  prdChatApi: {
    startSession: vi.fn(),
    sendMessage: vi.fn(),
    getHistory: vi.fn(),
    getSessions: vi.fn(),
    deleteSession: vi.fn(),
    setStructuredMode: vi.fn(),
    clearExtractedStructure: vi.fn(),
    assessQuality: vi.fn(),
    getGuidedQuestions: vi.fn(),
    previewExtraction: vi.fn(),
    startWatchingPlanFile: vi.fn(),
    stopWatchingPlanFile: vi.fn(),
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
    structuredMode: false,
  }

  const mockSession2: ChatSession = {
    ...mockSession,
    id: 'session-2',
    title: 'Test Session 2',
    messageCount: 5,
  }

  const mockStructuredSession: ChatSession = {
    ...mockSession,
    id: 'session-structured',
    title: 'Structured Session',
    structuredMode: true,
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

  beforeEach(() => {
    resetStore(usePRDChatStore, {
      sessions: [],
      currentSession: null,
      messages: [],
      loading: false,
      streaming: false,
      error: null,
      extractedContent: null,
    })
    vi.clearAllMocks()
  })

  describe('startSession', () => {
    it('should start a new session successfully', async () => {
      vi.mocked(prdChatApi.startSession).mockResolvedValue(mockSession)
      // Mock getHistory to return welcome message (loaded in guided mode)
      vi.mocked(prdChatApi.getHistory).mockResolvedValue([mockAssistantMessage])

      const store = usePRDChatStore.getState()
      await store.startSession({ agentType: 'claude', projectPath: '/test/project' })

      expect(prdChatApi.startSession).toHaveBeenCalledWith('claude', '/test/project', undefined, undefined, undefined, undefined, undefined, undefined)
      expect(usePRDChatStore.getState().currentSession).toEqual(mockSession)
      expect(usePRDChatStore.getState().sessions).toContainEqual(mockSession)
      // In guided mode (default), welcome message is loaded
      expect(usePRDChatStore.getState().messages).toEqual([mockAssistantMessage])
      expect(usePRDChatStore.getState().loading).toBe(false)
    })

    it('should start a session without loading history when guidedMode is false', async () => {
      vi.mocked(prdChatApi.startSession).mockResolvedValue(mockSession)

      const store = usePRDChatStore.getState()
      await store.startSession({ agentType: 'claude', projectPath: '/test/project', guidedMode: false })

      expect(prdChatApi.getHistory).not.toHaveBeenCalled()
      expect(usePRDChatStore.getState().messages).toEqual([])
    })

    it('should start a session with prdId for context', async () => {
      const sessionWithPrd = { ...mockSession, prdId: 'prd-123' }
      vi.mocked(prdChatApi.startSession).mockResolvedValue(sessionWithPrd)

      const store = usePRDChatStore.getState()
      await store.startSession({ agentType: 'claude', projectPath: '/test/project', prdId: 'prd-123' })

      expect(prdChatApi.startSession).toHaveBeenCalledWith('claude', '/test/project', 'prd-123', undefined, undefined, undefined, undefined, undefined)
      expect(usePRDChatStore.getState().currentSession).toEqual(sessionWithPrd)
    })

    it('should add new session to beginning of sessions list', async () => {
      const store = usePRDChatStore.getState()
      store.sessions = [mockSession2]

      vi.mocked(prdChatApi.startSession).mockResolvedValue(mockSession)
      await store.startSession({ agentType: 'claude', projectPath: '/test/project' })

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
      await store.startSession({ agentType: 'claude', projectPath: '/test/project' })

      expect(loadingDuringCall).toBe(true)
    })

    it('should handle errors when starting session', async () => {
      const error = new Error('Failed to start session')
      vi.mocked(prdChatApi.startSession).mockRejectedValue(error)

      const store = usePRDChatStore.getState()
      await store.startSession({ agentType: 'claude', projectPath: '/test/project' })

      expect(usePRDChatStore.getState().error).toBe('Failed to start session')
      expect(usePRDChatStore.getState().loading).toBe(false)
      expect(usePRDChatStore.getState().currentSession).toBeNull()
    })

    it('should clear previous error when starting new session', async () => {
      const store = usePRDChatStore.getState()
      store.error = 'Previous error'

      vi.mocked(prdChatApi.startSession).mockResolvedValue(mockSession)
      await store.startSession({ agentType: 'claude', projectPath: '/test/project' })

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

      expect(prdChatApi.sendMessage).toHaveBeenCalledWith('session-1', 'Help me create a PRD for a todo app', '/test/project')
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

    it('should throw error if session has no project path', async () => {
      const store = usePRDChatStore.getState()
      store.currentSession = { ...mockSession, projectPath: undefined }

      await expect(store.sendMessage('Test')).rejects.toThrow('Session has no project path')
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
      store.currentSession = mockSession
      await store.loadHistory('session-1')

      expect(prdChatApi.getHistory).toHaveBeenCalledWith('session-1', '/test/project')
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
      store.currentSession = mockSession
      await store.loadHistory('session-1')

      expect(loadingDuringCall).toBe(true)
    })

    it('should handle errors when loading history', async () => {
      const error = new Error('Failed to load history')
      vi.mocked(prdChatApi.getHistory).mockRejectedValue(error)

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      await store.loadHistory('session-1')

      expect(usePRDChatStore.getState().error).toBe('Failed to load history')
      expect(usePRDChatStore.getState().loading).toBe(false)
    })

    it('should replace existing messages with loaded history', async () => {
      const newMessages = [mockAssistantMessage]
      vi.mocked(prdChatApi.getHistory).mockResolvedValue(newMessages)

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      store.messages = [mockUserMessage]
      await store.loadHistory('session-1')

      expect(usePRDChatStore.getState().messages).toEqual(newMessages)
    })

    it('should set error if no project path available', async () => {
      const store = usePRDChatStore.getState()
      store.currentSession = null

      await store.loadHistory('session-1')

      expect(usePRDChatStore.getState().error).toBe('No project path available')
      expect(prdChatApi.getHistory).not.toHaveBeenCalled()
    })
  })

  describe('loadSessions', () => {
    it('should load all sessions with project path', async () => {
      const sessions = [mockSession, mockSession2]
      vi.mocked(prdChatApi.getSessions).mockResolvedValue(sessions)

      const store = usePRDChatStore.getState()
      await store.loadSessions('/test/project')

      expect(prdChatApi.getSessions).toHaveBeenCalledWith('/test/project')
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
      await store.loadSessions('/test/project')

      expect(loadingDuringCall).toBe(true)
    })

    it('should handle errors when loading sessions', async () => {
      const error = new Error('Failed to load sessions')
      vi.mocked(prdChatApi.getSessions).mockRejectedValue(error)

      const store = usePRDChatStore.getState()
      await store.loadSessions('/test/project')

      expect(usePRDChatStore.getState().error).toBe('Failed to load sessions')
      expect(usePRDChatStore.getState().loading).toBe(false)
    })

    it('should set error if project path is not provided', async () => {
      const store = usePRDChatStore.getState()
      await store.loadSessions()

      expect(usePRDChatStore.getState().error).toBe('Project path is required to load sessions')
      expect(prdChatApi.getSessions).not.toHaveBeenCalled()
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

      expect(prdChatApi.deleteSession).toHaveBeenCalledWith(mockSession.id, '/test/project')
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
      store.sessions = [mockSession]
      await expect(store.deleteSession(mockSession.id)).rejects.toThrow('Failed to delete session')
      expect(usePRDChatStore.getState().error).toBe('Failed to delete session')
    })

    it('should set error if session has no project path', async () => {
      const sessionWithoutPath = { ...mockSession, projectPath: undefined }

      const store = usePRDChatStore.getState()
      store.sessions = [sessionWithoutPath]
      await store.deleteSession(sessionWithoutPath.id)

      expect(usePRDChatStore.getState().error).toBe('Cannot delete session without project path')
      expect(prdChatApi.deleteSession).not.toHaveBeenCalled()
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
      await store.startSession({ agentType: 'claude', projectPath: '/test/project' })

      // errorToString() uses String(error) for non-Error objects
      expect(usePRDChatStore.getState().error).toBe('String error')
    })

    it('should handle Error with empty message', async () => {
      vi.mocked(prdChatApi.startSession).mockRejectedValue(new Error(''))

      const store = usePRDChatStore.getState()
      await store.startSession({ agentType: 'claude', projectPath: '/test/project' })

      // errorToString() uses error.message which is empty string
      expect(usePRDChatStore.getState().error).toBe('')
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
      store.currentSession = mockSession

      await store.loadHistory('session-1')
      expect(usePRDChatStore.getState().messages).toEqual(session1Messages)

      await store.loadHistory('session-2')
      expect(usePRDChatStore.getState().messages).toEqual(session2Messages)
    })
  })

  // ============================================================================
  // Structured Mode Tests
  // ============================================================================

  describe('setStructuredMode', () => {
    it('should enable structured mode for current session', async () => {
      vi.mocked(prdChatApi.setStructuredMode).mockResolvedValue(undefined)

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      store.sessions = [mockSession]

      await store.setStructuredMode(true)

      expect(prdChatApi.setStructuredMode).toHaveBeenCalledWith('session-1', '/test/project', true)
      expect(usePRDChatStore.getState().currentSession?.structuredMode).toBe(true)
    })

    it('should disable structured mode for current session', async () => {
      vi.mocked(prdChatApi.setStructuredMode).mockResolvedValue(undefined)

      const store = usePRDChatStore.getState()
      store.currentSession = mockStructuredSession
      store.sessions = [mockStructuredSession]

      await store.setStructuredMode(false)

      expect(prdChatApi.setStructuredMode).toHaveBeenCalledWith('session-structured', '/test/project', false)
      expect(usePRDChatStore.getState().currentSession?.structuredMode).toBe(false)
    })

    it('should update session in sessions list when structured mode changes', async () => {
      vi.mocked(prdChatApi.setStructuredMode).mockResolvedValue(undefined)

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession
      store.sessions = [mockSession, mockSession2]

      await store.setStructuredMode(true)

      const updatedSession = usePRDChatStore.getState().sessions.find(s => s.id === 'session-1')
      expect(updatedSession?.structuredMode).toBe(true)
    })

    it('should do nothing if no current session', async () => {
      const store = usePRDChatStore.getState()
      store.currentSession = null

      await store.setStructuredMode(true)

      expect(prdChatApi.setStructuredMode).not.toHaveBeenCalled()
    })

    it('should handle errors when setting structured mode', async () => {
      vi.mocked(prdChatApi.setStructuredMode).mockRejectedValue(new Error('Failed to set structured mode'))

      const store = usePRDChatStore.getState()
      store.currentSession = mockSession

      await store.setStructuredMode(true)

      expect(usePRDChatStore.getState().error).toBe('Failed to set structured mode')
    })
  })

  describe('clearExtractedStructure', () => {
    it('should clear extracted structure for current session', async () => {
      vi.mocked(prdChatApi.clearExtractedStructure).mockResolvedValue(undefined)

      const store = usePRDChatStore.getState()
      store.currentSession = mockStructuredSession

      await store.clearExtractedStructure()

      expect(prdChatApi.clearExtractedStructure).toHaveBeenCalledWith('session-structured', '/test/project')
    })

    it('should do nothing if no current session', async () => {
      const store = usePRDChatStore.getState()
      store.currentSession = null

      await store.clearExtractedStructure()

      expect(prdChatApi.clearExtractedStructure).not.toHaveBeenCalled()
    })

    it('should handle errors when clearing extracted structure', async () => {
      vi.mocked(prdChatApi.clearExtractedStructure).mockRejectedValue(new Error('Failed to clear extracted structure'))

      const store = usePRDChatStore.getState()
      store.currentSession = mockStructuredSession

      await store.clearExtractedStructure()

      expect(usePRDChatStore.getState().error).toBe('Failed to clear extracted structure')
    })
  })

  describe('startSession with structuredMode', () => {
    it('should start a session with structured mode enabled', async () => {
      vi.mocked(prdChatApi.startSession).mockResolvedValue(mockStructuredSession)

      const store = usePRDChatStore.getState()
      await store.startSession({ agentType: 'claude', projectPath: '/test/project', structuredMode: true })

      expect(prdChatApi.startSession).toHaveBeenCalledWith('claude', '/test/project', undefined, undefined, undefined, undefined, true, undefined)
      expect(usePRDChatStore.getState().currentSession?.structuredMode).toBe(true)
    })
  })
})
