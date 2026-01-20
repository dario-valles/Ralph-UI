import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useSessionStore } from '../sessionStore'
import { sessionApi } from '@/lib/tauri-api'
import type { Session, SessionStatus } from '@/types'

// Mock the Tauri API
vi.mock('@/lib/tauri-api', () => ({
  sessionApi: {
    create: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
  },
}))

describe('sessionStore', () => {
  const mockSession: Session = {
    id: 'session-1',
    name: 'Test Session',
    projectPath: '/test/path',
    createdAt: '2026-01-17T10:00:00Z',
    lastResumedAt: undefined,
    status: 'active' as SessionStatus,
    config: {
      maxParallel: 3,
      maxIterations: 10,
      maxRetries: 3,
      agentType: 'claude',
      autoCreatePRs: true,
      draftPRs: false,
      runTests: true,
      runLint: true,
    },
    tasks: [],
    totalCost: 0,
    totalTokens: 0,
  }

  const mockSession2: Session = {
    ...mockSession,
    id: 'session-2',
    name: 'Test Session 2',
  }

  beforeEach(() => {
    // Reset store state before each test
    const store = useSessionStore.getState()
    store.sessions = []
    store.currentSession = null
    store.loading = false
    store.error = null
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchSessions', () => {
    it('should fetch all sessions successfully', async () => {
      const mockSessions = [mockSession, mockSession2]
      vi.mocked(sessionApi.getAll).mockResolvedValue(mockSessions)

      const store = useSessionStore.getState()
      await store.fetchSessions()

      expect(sessionApi.getAll).toHaveBeenCalled()
      expect(useSessionStore.getState().sessions).toEqual(mockSessions)
      expect(useSessionStore.getState().loading).toBe(false)
      expect(useSessionStore.getState().error).toBeNull()
    })

    it('should handle fetch sessions error', async () => {
      const errorMessage = 'Failed to fetch sessions'
      vi.mocked(sessionApi.getAll).mockRejectedValue(new Error(errorMessage))

      const store = useSessionStore.getState()
      await store.fetchSessions()

      expect(useSessionStore.getState().sessions).toEqual([])
      expect(useSessionStore.getState().loading).toBe(false)
      expect(useSessionStore.getState().error).toBe(`Error: ${errorMessage}`)
    })

    it('should set loading state during fetch', async () => {
      let loadingDuringFetch = false
      vi.mocked(sessionApi.getAll).mockImplementation(async () => {
        loadingDuringFetch = useSessionStore.getState().loading
        return []
      })

      const store = useSessionStore.getState()
      await store.fetchSessions()

      expect(loadingDuringFetch).toBe(true)
    })
  })

  describe('fetchSession', () => {
    it('should fetch a single session by ID', async () => {
      vi.mocked(sessionApi.getById).mockResolvedValue(mockSession)

      const store = useSessionStore.getState()
      await store.fetchSession('session-1')

      expect(sessionApi.getById).toHaveBeenCalledWith('session-1')
      expect(useSessionStore.getState().currentSession).toEqual(mockSession)
      expect(useSessionStore.getState().loading).toBe(false)
      expect(useSessionStore.getState().error).toBeNull()
    })

    it('should handle fetch session error', async () => {
      const errorMessage = 'Session not found'
      vi.mocked(sessionApi.getById).mockRejectedValue(new Error(errorMessage))

      const store = useSessionStore.getState()
      await store.fetchSession('nonexistent')

      expect(useSessionStore.getState().currentSession).toBeNull()
      expect(useSessionStore.getState().error).toBe(`Error: ${errorMessage}`)
    })
  })

  describe('createSession', () => {
    it('should create a new session successfully', async () => {
      vi.mocked(sessionApi.create).mockResolvedValue(mockSession)

      const store = useSessionStore.getState()
      const result = await store.createSession('Test Session', '/test/path')

      expect(sessionApi.create).toHaveBeenCalledWith('Test Session', '/test/path')
      expect(result).toEqual(mockSession)
      expect(useSessionStore.getState().sessions).toContain(mockSession)
      expect(useSessionStore.getState().currentSession).toEqual(mockSession)
      expect(useSessionStore.getState().loading).toBe(false)
      expect(useSessionStore.getState().error).toBeNull()
    })

    it('should handle create session error', async () => {
      const errorMessage = 'Failed to create session'
      vi.mocked(sessionApi.create).mockRejectedValue(new Error(errorMessage))

      const store = useSessionStore.getState()
      const result = await store.createSession('Test', '/test')

      expect(result).toBeNull()
      expect(useSessionStore.getState().error).toBe(`Error: ${errorMessage}`)
    })

    it('should add new session to existing sessions', async () => {
      const store = useSessionStore.getState()
      store.sessions = [mockSession]

      vi.mocked(sessionApi.create).mockResolvedValue(mockSession2)

      await store.createSession('Test Session 2', '/test/path2')

      expect(useSessionStore.getState().sessions).toHaveLength(2)
      expect(useSessionStore.getState().sessions).toContain(mockSession)
      expect(useSessionStore.getState().sessions).toContain(mockSession2)
    })
  })

  describe('updateSession', () => {
    it('should update an existing session', async () => {
      const updatedSession = { ...mockSession, name: 'Updated Session' }
      vi.mocked(sessionApi.update).mockResolvedValue(updatedSession)

      const store = useSessionStore.getState()
      store.sessions = [mockSession, mockSession2]
      store.currentSession = mockSession

      await store.updateSession(updatedSession)

      expect(sessionApi.update).toHaveBeenCalledWith(updatedSession)
      expect(useSessionStore.getState().sessions[0]).toEqual(updatedSession)
      expect(useSessionStore.getState().currentSession).toEqual(updatedSession)
      expect(useSessionStore.getState().loading).toBe(false)
      expect(useSessionStore.getState().error).toBeNull()
    })

    it('should update session in list without affecting currentSession if not current', async () => {
      const updatedSession = { ...mockSession2, name: 'Updated Session 2' }
      vi.mocked(sessionApi.update).mockResolvedValue(updatedSession)

      const store = useSessionStore.getState()
      store.sessions = [mockSession, mockSession2]
      store.currentSession = mockSession

      await store.updateSession(updatedSession)

      expect(useSessionStore.getState().sessions[1]).toEqual(updatedSession)
      expect(useSessionStore.getState().currentSession).toEqual(mockSession)
    })

    it('should handle update session error', async () => {
      const errorMessage = 'Failed to update session'
      vi.mocked(sessionApi.update).mockRejectedValue(new Error(errorMessage))

      const store = useSessionStore.getState()
      await store.updateSession(mockSession)

      expect(useSessionStore.getState().error).toBe(`Error: ${errorMessage}`)
    })
  })

  describe('deleteSession', () => {
    it('should delete a session successfully', async () => {
      vi.mocked(sessionApi.delete).mockResolvedValue(undefined)

      const store = useSessionStore.getState()
      store.sessions = [mockSession, mockSession2]

      await store.deleteSession('session-1')

      expect(sessionApi.delete).toHaveBeenCalledWith('session-1')
      expect(useSessionStore.getState().sessions).toHaveLength(1)
      expect(useSessionStore.getState().sessions).not.toContainEqual(mockSession)
      expect(useSessionStore.getState().sessions).toContainEqual(mockSession2)
      expect(useSessionStore.getState().loading).toBe(false)
      expect(useSessionStore.getState().error).toBeNull()
    })

    it('should clear currentSession if deleting current session', async () => {
      vi.mocked(sessionApi.delete).mockResolvedValue(undefined)

      const store = useSessionStore.getState()
      store.sessions = [mockSession, mockSession2]
      store.currentSession = mockSession

      await store.deleteSession('session-1')

      expect(useSessionStore.getState().currentSession).toBeNull()
    })

    it('should not clear currentSession if deleting different session', async () => {
      vi.mocked(sessionApi.delete).mockResolvedValue(undefined)

      const store = useSessionStore.getState()
      store.sessions = [mockSession, mockSession2]
      store.currentSession = mockSession

      await store.deleteSession('session-2')

      expect(useSessionStore.getState().currentSession).toEqual(mockSession)
    })

    it('should handle delete session error', async () => {
      const errorMessage = 'Failed to delete session'
      vi.mocked(sessionApi.delete).mockRejectedValue(new Error(errorMessage))

      const store = useSessionStore.getState()
      store.sessions = [mockSession]

      await store.deleteSession('session-1')

      expect(useSessionStore.getState().sessions).toContainEqual(mockSession)
      expect(useSessionStore.getState().error).toBe(`Error: ${errorMessage}`)
    })
  })

  describe('updateSessionStatus', () => {
    it('should update session status successfully', async () => {
      vi.mocked(sessionApi.updateStatus).mockResolvedValue(undefined)

      const store = useSessionStore.getState()
      store.sessions = [mockSession, mockSession2]
      store.currentSession = mockSession

      await store.updateSessionStatus('session-1', 'paused')

      expect(sessionApi.updateStatus).toHaveBeenCalledWith('session-1', 'paused')
      expect(useSessionStore.getState().sessions[0].status).toBe('paused')
      expect(useSessionStore.getState().currentSession?.status).toBe('paused')
      expect(useSessionStore.getState().loading).toBe(false)
      expect(useSessionStore.getState().error).toBeNull()
    })

    it('should update status in list without affecting currentSession if not current', async () => {
      vi.mocked(sessionApi.updateStatus).mockResolvedValue(undefined)

      const store = useSessionStore.getState()
      store.sessions = [mockSession, mockSession2]
      store.currentSession = mockSession

      await store.updateSessionStatus('session-2', 'completed')

      expect(useSessionStore.getState().sessions[1].status).toBe('completed')
      expect(useSessionStore.getState().currentSession?.status).toBe('active')
    })

    it('should handle update status error', async () => {
      const errorMessage = 'Failed to update status'
      vi.mocked(sessionApi.updateStatus).mockRejectedValue(new Error(errorMessage))

      const store = useSessionStore.getState()
      await store.updateSessionStatus('session-1', 'paused')

      expect(useSessionStore.getState().error).toBe(`Error: ${errorMessage}`)
    })
  })

  describe('setCurrentSession', () => {
    it('should set current session', () => {
      const store = useSessionStore.getState()
      store.setCurrentSession(mockSession)

      expect(useSessionStore.getState().currentSession).toEqual(mockSession)
    })

    it('should clear current session when setting to null', () => {
      const store = useSessionStore.getState()
      store.currentSession = mockSession
      store.setCurrentSession(null)

      expect(useSessionStore.getState().currentSession).toBeNull()
    })
  })

  describe('error handling', () => {
    it('should handle string errors', async () => {
      vi.mocked(sessionApi.getAll).mockRejectedValue('String error')

      const store = useSessionStore.getState()
      await store.fetchSessions()

      expect(useSessionStore.getState().error).toBe('String error')
    })

    it('should handle unknown error types', async () => {
      vi.mocked(sessionApi.getAll).mockRejectedValue({ custom: 'error' })

      const store = useSessionStore.getState()
      await store.fetchSessions()

      expect(useSessionStore.getState().error).toBeTruthy()
    })
  })
})
