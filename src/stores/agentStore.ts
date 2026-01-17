// Zustand store for agent state management

import { create } from 'zustand'
import {
  Agent,
  AgentStatus,
  LogEntry,
  getAgent,
  getAgentsForSession,
  getAgentsForTask,
  getActiveAgents,
  updateAgentStatus,
  updateAgentMetrics,
  addAgentLog,
  getAgentLogs,
} from '@/lib/agent-api'

interface AgentStore {
  // State
  agents: Agent[]
  activeAgentId: string | null
  loading: boolean
  error: string | null

  // Actions
  setActiveAgent: (agentId: string | null) => void
  loadAgent: (agentId: string) => Promise<void>
  loadAgentsForSession: (sessionId: string) => Promise<void>
  loadAgentsForTask: (taskId: string) => Promise<void>
  loadActiveAgents: (sessionId: string) => Promise<void>
  updateStatus: (agentId: string, status: AgentStatus) => Promise<void>
  updateMetrics: (agentId: string, tokens: number, cost: number, iterationCount: number) => Promise<void>
  addLog: (agentId: string, log: LogEntry) => Promise<void>
  refreshLogs: (agentId: string) => Promise<void>
  clearError: () => void
  reset: () => void
}

export const useAgentStore = create<AgentStore>((set, get) => ({
  // Initial state
  agents: [],
  activeAgentId: null,
  loading: false,
  error: null,

  // Set active agent
  setActiveAgent: (agentId) => {
    set({ activeAgentId: agentId })
  },

  // Load a single agent by ID
  loadAgent: async (agentId) => {
    set({ loading: true, error: null })
    try {
      const agent = await getAgent(agentId)
      if (agent) {
        set((state) => ({
          agents: [
            ...state.agents.filter((a) => a.id !== agentId),
            agent,
          ],
          loading: false,
        }))
      } else {
        set({ loading: false })
      }
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load agent',
        loading: false,
      })
    }
  },

  // Load all agents for a session
  loadAgentsForSession: async (sessionId) => {
    set({ loading: true, error: null })
    try {
      const agents = await getAgentsForSession(sessionId)
      set({ agents, loading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load agents',
        loading: false,
      })
    }
  },

  // Load all agents for a task
  loadAgentsForTask: async (taskId) => {
    set({ loading: true, error: null })
    try {
      const agents = await getAgentsForTask(taskId)
      set({ agents, loading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load agents for task',
        loading: false,
      })
    }
  },

  // Load active agents for a session
  loadActiveAgents: async (sessionId) => {
    set({ loading: true, error: null })
    try {
      const agents = await getActiveAgents(sessionId)
      set({ agents, loading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to load active agents',
        loading: false,
      })
    }
  },

  // Update agent status
  updateStatus: async (agentId, status) => {
    try {
      await updateAgentStatus(agentId, status)

      // Update local state
      set((state) => ({
        agents: state.agents.map((agent) =>
          agent.id === agentId ? { ...agent, status } : agent
        ),
      }))

      // Reload the agent to get latest data
      await get().loadAgent(agentId)
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update agent status',
      })
    }
  },

  // Update agent metrics
  updateMetrics: async (agentId, tokens, cost, iterationCount) => {
    try {
      await updateAgentMetrics(agentId, tokens, cost, iterationCount)

      // Update local state
      set((state) => ({
        agents: state.agents.map((agent) =>
          agent.id === agentId
            ? { ...agent, tokens, cost, iteration_count: iterationCount }
            : agent
        ),
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to update agent metrics',
      })
    }
  },

  // Add a log entry
  addLog: async (agentId, log) => {
    try {
      await addAgentLog(agentId, log)

      // Update local state
      set((state) => ({
        agents: state.agents.map((agent) =>
          agent.id === agentId
            ? { ...agent, logs: [...agent.logs, log] }
            : agent
        ),
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to add log',
      })
    }
  },

  // Refresh logs for an agent
  refreshLogs: async (agentId) => {
    try {
      const logs = await getAgentLogs(agentId)

      set((state) => ({
        agents: state.agents.map((agent) =>
          agent.id === agentId ? { ...agent, logs } : agent
        ),
      }))
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to refresh logs',
      })
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null })
  },

  // Reset store
  reset: () => {
    set({
      agents: [],
      activeAgentId: null,
      loading: false,
      error: null,
    })
  },
}))
