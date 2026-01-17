import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useAgentStore } from '../agentStore'
import {
  getAgent,
  getAgentsForSession,
  getAgentsForTask,
  getActiveAgents,
  updateAgentStatus,
  updateAgentMetrics,
  addAgentLog,
  getAgentLogs,
  type Agent,
  type AgentStatus,
  type LogEntry,
} from '@/lib/agent-api'

// Mock the agent API
vi.mock('@/lib/agent-api', () => ({
  getAgent: vi.fn(),
  getAgentsForSession: vi.fn(),
  getAgentsForTask: vi.fn(),
  getActiveAgents: vi.fn(),
  updateAgentStatus: vi.fn(),
  updateAgentMetrics: vi.fn(),
  addAgentLog: vi.fn(),
  getAgentLogs: vi.fn(),
}))

describe('agentStore', () => {
  const mockAgent: Agent = {
    id: 'agent-1',
    session_id: 'session-1',
    task_id: 'task-1',
    status: 'idle' as AgentStatus,
    process_id: 12345,
    worktree_path: '/path/to/worktree',
    branch: 'feature/test',
    iteration_count: 0,
    tokens: 0,
    cost: 0,
    logs: [],
    subagents: [],
  }

  const mockAgent2: Agent = {
    ...mockAgent,
    id: 'agent-2',
    status: 'thinking' as AgentStatus,
  }

  const mockLogEntry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'Test log message',
  }

  beforeEach(() => {
    // Reset store state
    const store = useAgentStore.getState()
    store.agents = []
    store.activeAgentId = null
    store.loading = false
    store.error = null
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('setActiveAgent', () => {
    it('should set active agent ID', () => {
      const store = useAgentStore.getState()
      store.setActiveAgent('agent-1')

      expect(useAgentStore.getState().activeAgentId).toBe('agent-1')
    })

    it('should clear active agent when setting to null', () => {
      const store = useAgentStore.getState()
      store.activeAgentId = 'agent-1'
      store.setActiveAgent(null)

      expect(useAgentStore.getState().activeAgentId).toBeNull()
    })
  })

  describe('loadAgent', () => {
    it('should load a single agent successfully', async () => {
      vi.mocked(getAgent).mockResolvedValue(mockAgent)

      const store = useAgentStore.getState()
      await store.loadAgent('agent-1')

      expect(getAgent).toHaveBeenCalledWith('agent-1')
      expect(useAgentStore.getState().agents).toContainEqual(mockAgent)
      expect(useAgentStore.getState().loading).toBe(false)
      expect(useAgentStore.getState().error).toBeNull()
    })

    it('should replace existing agent if already loaded', async () => {
      const updatedAgent = { ...mockAgent, status: 'thinking' as AgentStatus }
      vi.mocked(getAgent).mockResolvedValue(updatedAgent)

      const store = useAgentStore.getState()
      store.agents = [mockAgent]

      await store.loadAgent('agent-1')

      expect(useAgentStore.getState().agents).toHaveLength(1)
      expect(useAgentStore.getState().agents[0].status).toBe('thinking')
    })

    it('should handle load error', async () => {
      const errorMessage = 'Failed to load agent'
      vi.mocked(getAgent).mockRejectedValue(new Error(errorMessage))

      const store = useAgentStore.getState()
      await store.loadAgent('agent-1')

      expect(useAgentStore.getState().error).toBe(errorMessage)
      expect(useAgentStore.getState().loading).toBe(false)
    })

    it('should handle null agent response', async () => {
      vi.mocked(getAgent).mockResolvedValue(null)

      const store = useAgentStore.getState()
      await store.loadAgent('agent-1')

      expect(useAgentStore.getState().agents).toEqual([])
      expect(useAgentStore.getState().loading).toBe(false)
    })
  })

  describe('loadAgentsForSession', () => {
    it('should load all agents for a session', async () => {
      const mockAgents = [mockAgent, mockAgent2]
      vi.mocked(getAgentsForSession).mockResolvedValue(mockAgents)

      const store = useAgentStore.getState()
      await store.loadAgentsForSession('session-1')

      expect(getAgentsForSession).toHaveBeenCalledWith('session-1')
      expect(useAgentStore.getState().agents).toEqual(mockAgents)
      expect(useAgentStore.getState().loading).toBe(false)
    })

    it('should handle load error', async () => {
      const errorMessage = 'Failed to load agents'
      vi.mocked(getAgentsForSession).mockRejectedValue(new Error(errorMessage))

      const store = useAgentStore.getState()
      await store.loadAgentsForSession('session-1')

      expect(useAgentStore.getState().error).toBe(errorMessage)
    })
  })

  describe('loadAgentsForTask', () => {
    it('should load all agents for a task', async () => {
      const mockAgents = [mockAgent]
      vi.mocked(getAgentsForTask).mockResolvedValue(mockAgents)

      const store = useAgentStore.getState()
      await store.loadAgentsForTask('task-1')

      expect(getAgentsForTask).toHaveBeenCalledWith('task-1')
      expect(useAgentStore.getState().agents).toEqual(mockAgents)
    })

    it('should handle load error', async () => {
      const errorMessage = 'Failed to load agents for task'
      vi.mocked(getAgentsForTask).mockRejectedValue(new Error(errorMessage))

      const store = useAgentStore.getState()
      await store.loadAgentsForTask('task-1')

      expect(useAgentStore.getState().error).toBe(errorMessage)
    })
  })

  describe('loadActiveAgents', () => {
    it('should load active agents for a session', async () => {
      const activeAgents = [mockAgent2]
      vi.mocked(getActiveAgents).mockResolvedValue(activeAgents)

      const store = useAgentStore.getState()
      await store.loadActiveAgents('session-1')

      expect(getActiveAgents).toHaveBeenCalledWith('session-1')
      expect(useAgentStore.getState().agents).toEqual(activeAgents)
    })

    it('should handle load error', async () => {
      const errorMessage = 'Failed to load active agents'
      vi.mocked(getActiveAgents).mockRejectedValue(new Error(errorMessage))

      const store = useAgentStore.getState()
      await store.loadActiveAgents('session-1')

      expect(useAgentStore.getState().error).toBe(errorMessage)
    })
  })

  describe('updateStatus', () => {
    it('should update agent status successfully', async () => {
      vi.mocked(updateAgentStatus).mockResolvedValue(undefined)
      const updatedAgent = { ...mockAgent, status: 'thinking' as AgentStatus }
      vi.mocked(getAgent).mockResolvedValue(updatedAgent)

      const store = useAgentStore.getState()
      store.agents = [mockAgent]

      await store.updateStatus('agent-1', 'thinking')

      expect(updateAgentStatus).toHaveBeenCalledWith('agent-1', 'thinking')
      expect(useAgentStore.getState().agents[0].status).toBe('thinking')
    })

    it('should reload agent after status update', async () => {
      vi.mocked(updateAgentStatus).mockResolvedValue(undefined)
      vi.mocked(getAgent).mockResolvedValue(mockAgent)

      const store = useAgentStore.getState()
      store.agents = [mockAgent]

      await store.updateStatus('agent-1', 'thinking')

      expect(getAgent).toHaveBeenCalledWith('agent-1')
    })

    it('should handle update error', async () => {
      const errorMessage = 'Failed to update agent status'
      vi.mocked(updateAgentStatus).mockRejectedValue(new Error(errorMessage))

      const store = useAgentStore.getState()
      await store.updateStatus('agent-1', 'thinking')

      expect(useAgentStore.getState().error).toBe(errorMessage)
    })
  })

  describe('updateMetrics', () => {
    it('should update agent metrics successfully', async () => {
      vi.mocked(updateAgentMetrics).mockResolvedValue(undefined)

      const store = useAgentStore.getState()
      store.agents = [mockAgent]

      await store.updateMetrics('agent-1', 1000, 0.05, 5)

      expect(updateAgentMetrics).toHaveBeenCalledWith('agent-1', 1000, 0.05, 5)
      expect(useAgentStore.getState().agents[0].tokens).toBe(1000)
      expect(useAgentStore.getState().agents[0].cost).toBe(0.05)
      expect(useAgentStore.getState().agents[0].iteration_count).toBe(5)
    })

    it('should not affect other agents when updating metrics', async () => {
      vi.mocked(updateAgentMetrics).mockResolvedValue(undefined)

      const store = useAgentStore.getState()
      store.agents = [mockAgent, mockAgent2]

      await store.updateMetrics('agent-1', 1000, 0.05, 5)

      expect(useAgentStore.getState().agents[1]).toEqual(mockAgent2)
    })

    it('should handle update error', async () => {
      const errorMessage = 'Failed to update agent metrics'
      vi.mocked(updateAgentMetrics).mockRejectedValue(new Error(errorMessage))

      const store = useAgentStore.getState()
      await store.updateMetrics('agent-1', 1000, 0.05, 5)

      expect(useAgentStore.getState().error).toBe(errorMessage)
    })
  })

  describe('addLog', () => {
    it('should add a log entry successfully', async () => {
      vi.mocked(addAgentLog).mockResolvedValue(undefined)

      const store = useAgentStore.getState()
      store.agents = [mockAgent]

      await store.addLog('agent-1', mockLogEntry)

      expect(addAgentLog).toHaveBeenCalledWith('agent-1', mockLogEntry)
      expect(useAgentStore.getState().agents[0].logs).toContainEqual(mockLogEntry)
    })

    it('should append log to existing logs', async () => {
      const existingLog = { ...mockLogEntry, id: 'log-0' }
      vi.mocked(addAgentLog).mockResolvedValue(undefined)

      const store = useAgentStore.getState()
      store.agents = [{ ...mockAgent, logs: [existingLog] }]

      await store.addLog('agent-1', mockLogEntry)

      expect(useAgentStore.getState().agents[0].logs).toHaveLength(2)
      expect(useAgentStore.getState().agents[0].logs).toContainEqual(existingLog)
      expect(useAgentStore.getState().agents[0].logs).toContainEqual(mockLogEntry)
    })

    it('should handle add log error', async () => {
      const errorMessage = 'Failed to add log'
      vi.mocked(addAgentLog).mockRejectedValue(new Error(errorMessage))

      const store = useAgentStore.getState()
      await store.addLog('agent-1', mockLogEntry)

      expect(useAgentStore.getState().error).toBe(errorMessage)
    })
  })

  describe('refreshLogs', () => {
    it('should refresh logs for an agent', async () => {
      const newLogs = [mockLogEntry, { ...mockLogEntry, id: 'log-2' }]
      vi.mocked(getAgentLogs).mockResolvedValue(newLogs)

      const store = useAgentStore.getState()
      store.agents = [mockAgent]

      await store.refreshLogs('agent-1')

      expect(getAgentLogs).toHaveBeenCalledWith('agent-1')
      expect(useAgentStore.getState().agents[0].logs).toEqual(newLogs)
    })

    it('should replace existing logs', async () => {
      const existingLogs = [{ ...mockLogEntry, id: 'old-log' }]
      const newLogs = [mockLogEntry]
      vi.mocked(getAgentLogs).mockResolvedValue(newLogs)

      const store = useAgentStore.getState()
      store.agents = [{ ...mockAgent, logs: existingLogs }]

      await store.refreshLogs('agent-1')

      expect(useAgentStore.getState().agents[0].logs).toEqual(newLogs)
      expect(useAgentStore.getState().agents[0].logs).not.toContainEqual(existingLogs[0])
    })

    it('should handle refresh error', async () => {
      const errorMessage = 'Failed to refresh logs'
      vi.mocked(getAgentLogs).mockRejectedValue(new Error(errorMessage))

      const store = useAgentStore.getState()
      await store.refreshLogs('agent-1')

      expect(useAgentStore.getState().error).toBe(errorMessage)
    })
  })

  describe('clearError', () => {
    it('should clear error state', () => {
      const store = useAgentStore.getState()
      store.error = 'Some error'

      store.clearError()

      expect(useAgentStore.getState().error).toBeNull()
    })
  })

  describe('reset', () => {
    it('should reset all store state', () => {
      const store = useAgentStore.getState()
      store.agents = [mockAgent]
      store.activeAgentId = 'agent-1'
      store.loading = true
      store.error = 'Some error'

      store.reset()

      expect(useAgentStore.getState().agents).toEqual([])
      expect(useAgentStore.getState().activeAgentId).toBeNull()
      expect(useAgentStore.getState().loading).toBe(false)
      expect(useAgentStore.getState().error).toBeNull()
    })
  })

  describe('loading state management', () => {
    it('should set loading during async operations', async () => {
      let loadingDuringFetch = false
      vi.mocked(getAgentsForSession).mockImplementation(async () => {
        loadingDuringFetch = useAgentStore.getState().loading
        return []
      })

      const store = useAgentStore.getState()
      await store.loadAgentsForSession('session-1')

      expect(loadingDuringFetch).toBe(true)
      expect(useAgentStore.getState().loading).toBe(false)
    })
  })
})
