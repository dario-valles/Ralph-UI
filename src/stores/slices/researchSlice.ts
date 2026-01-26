/**
 * Research Slice
 *
 * Handles parallel research operations for hybrid GSD workflow:
 * - Starting/checking research status
 * - Loading available agents
 * - Synthesizing research results
 */
import { gsdApi } from '@/lib/backend-api'
import { errorToString } from '@/lib/store-utils'
import type {
  SetState,
  GetState,
  ResearchSlice,
} from './prdChatTypes'
import { getSessionWithPath, INITIAL_RESEARCH_STATUS } from './prdChatTypes'
import type { AgentType } from '@/types'
import type { ResearchStatus, ResearchSynthesis } from '@/types/gsd'

/**
 * Creates the research slice
 */
export const createResearchSlice = (
  set: SetState,
  get: GetState
): ResearchSlice => ({
  // Initial state
  researchStatus: INITIAL_RESEARCH_STATUS,
  researchResults: [],
  researchSynthesis: null,
  selectedResearchAgent: null,
  availableResearchAgents: [],
  isResearchRunning: false,
  isSynthesizing: false,

  // Load available research agents
  loadAvailableAgents: async () => {
    try {
      const agents = await gsdApi.getAvailableAgents()
      set({ availableResearchAgents: agents })
      // Auto-select first available agent if none selected
      if (agents.length > 0 && !get().selectedResearchAgent) {
        set({ selectedResearchAgent: agents[0] })
      }
    } catch (error) {
      console.error('Failed to load available agents:', error)
      // Fallback to claude
      set({ availableResearchAgents: ['claude'] as AgentType[] })
      if (!get().selectedResearchAgent) {
        set({ selectedResearchAgent: 'claude' as AgentType })
      }
    }
  },

  // Set selected research agent
  setSelectedResearchAgent: (agent) => {
    set({ selectedResearchAgent: agent })
  },

  // Set research status (used by components to sync local state with store)
  // status can be null to only update isRunning flag
  setResearchStatus: (status, isRunning) => {
    const updates: Partial<{ researchStatus: ResearchStatus; isResearchRunning: boolean }> = {}
    if (status !== null) {
      updates.researchStatus = status
    }
    if (isRunning !== undefined) {
      updates.isResearchRunning = isRunning
    }
    set(updates)
  },

  // Check if research is currently running (for reconnecting to in-progress research)
  checkResearchStatus: async () => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return

    try {
      const state = await gsdApi.getState(ctx.projectPath, ctx.session.id)
      if (state?.researchStatus) {
        const { architecture, codebase, bestPractices, risks } = state.researchStatus
        const isRunning =
          architecture.running || codebase.running || bestPractices.running || risks.running
        const isComplete =
          architecture.complete && codebase.complete && bestPractices.complete && risks.complete

        set({
          researchStatus: state.researchStatus,
          isResearchRunning: isRunning,
          phaseState: {
            ...get().phaseState,
            researchStarted: isRunning || isComplete,
            researchComplete: isComplete,
          },
        })
      }
    } catch (error) {
      // Silently fail - this is just a status check
      console.warn('Failed to check research status:', error)
    }
  },

  // Load existing synthesis from disk (for restoring state on page reload)
  loadSynthesis: async () => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return

    try {
      const synthesis = await gsdApi.loadSynthesis(ctx.projectPath, ctx.session.id)
      if (synthesis) {
        set({ researchSynthesis: synthesis })
        get().updatePhaseState()
      }
    } catch (error) {
      // Silently fail - synthesis may not exist yet
      console.warn('Failed to load synthesis:', error)
    }
  },

  // Start parallel research
  startResearch: async (context, agentType) => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return

    const { selectedResearchAgent } = get()
    set({
      isResearchRunning: true,
      error: null,
      researchStatus: {
        architecture: { running: true, complete: false },
        codebase: { running: true, complete: false },
        bestPractices: { running: true, complete: false },
        risks: { running: true, complete: false },
      },
    })

    try {
      const status = await gsdApi.startResearch(
        ctx.projectPath,
        ctx.session.id,
        context,
        agentType || selectedResearchAgent || undefined
      )
      set({ researchStatus: status })
      // Update phase state
      get().updatePhaseState()
    } catch (error) {
      set({
        error: errorToString(error),
        researchStatus: INITIAL_RESEARCH_STATUS,
      })
    } finally {
      set({ isResearchRunning: false })
    }
  },

  // Synthesize research results
  synthesizeResearch: async (): Promise<ResearchSynthesis | null> => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return null

    set({ isSynthesizing: true, error: null })
    try {
      const synthesis = await gsdApi.synthesizeResearch(ctx.projectPath, ctx.session.id)
      set({ researchSynthesis: synthesis })
      get().updatePhaseState()
      return synthesis
    } catch (error) {
      set({ error: errorToString(error) })
      return null
    } finally {
      set({ isSynthesizing: false })
    }
  },
})
