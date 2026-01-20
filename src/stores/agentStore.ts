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
import { asyncAction, type AsyncState } from '@/lib/store-utils'

interface AgentStore extends AsyncState {
  // State
  agents: Agent[]
  activeAgentId: string | null

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
    await asyncAction(set, async () => {
      const agent = await getAgent(agentId)
      if (agent) {
        return { agents: [...get().agents.filter((a) => a.id !== agentId), agent] }
      }
      return {}
    })
  },

  // Load all agents for a session
  loadAgentsForSession: async (sessionId) => {
    await asyncAction(set, async () => {
      const agents = await getAgentsForSession(sessionId)
      return { agents }
    })
  },

  // Load all agents for a task
  loadAgentsForTask: async (taskId) => {
    await asyncAction(set, async () => {
      const agents = await getAgentsForTask(taskId)
      return { agents }
    })
  },

  // Load active agents for a session
  loadActiveAgents: async (sessionId) => {
    await asyncAction(set, async () => {
      const agents = await getActiveAgents(sessionId)
      return { agents }
    })
  },

  // Update agent status
  updateStatus: async (agentId, status) => {
    // Store previous state for rollback
    const previousAgents = get().agents
    const previousAgent = previousAgents.find((a) => a.id === agentId)

    // Optimistic update
    set((state) => ({
      agents: state.agents.map((agent) =>
        agent.id === agentId ? { ...agent, status } : agent
      ),
    }))

    try {
      await updateAgentStatus(agentId, status)
      // No need to reload - optimistic update is sufficient
    } catch (err) {
      // Rollback on error
      if (previousAgent) {
        set((state) => ({
          agents: state.agents.map((agent) =>
            agent.id === agentId ? previousAgent : agent
          ),
          error: err instanceof Error ? err.message : 'Failed to update agent status',
        }))
      } else {
        set({
          error: err instanceof Error ? err.message : 'Failed to update agent status',
        })
      }
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
            ? { ...agent, tokens, cost, iterationCount }
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
