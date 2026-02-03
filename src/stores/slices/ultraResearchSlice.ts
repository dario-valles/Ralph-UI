/**
 * Ultra Research Slice for PRD Chat Store
 *
 * Manages state and actions for multi-agent deep research mode.
 */
import { invoke } from '@/lib/invoke'
import { subscribeEvent, type UnlistenFn } from '@/lib/events-client'
import {
  type UltraResearchConfig,
  type ResearchSession,
  type ResearchProgress,
  type ResearchAgentProgressPayload,
  type ResearchSessionUpdatePayload,
  type ResearchErrorPayload,
  type StartUltraResearchRequest,
  type StartUltraResearchResponse,
  createDefaultUltraResearchConfig,
} from '@/types'

// ============================================================================
// State Interface
// ============================================================================

export interface UltraResearchState {
  /** Current ultra research configuration */
  ultraResearchConfig: UltraResearchConfig | null
  /** Active research session (if any) */
  activeResearchSession: ResearchSession | null
  /** Current progress of active session */
  researchProgress: ResearchProgress | null
  /** Whether the config modal is open */
  isConfigModalOpen: boolean
  /** Streaming content per agent (agentId -> accumulated content) */
  agentStreamingContent: Record<string, string>
  /** Error message from research session */
  researchError: string | null
}

export interface UltraResearchActions {
  // Configuration
  setUltraResearchConfig: (config: UltraResearchConfig | null) => void
  toggleUltraResearch: () => void
  openConfigModal: () => void
  closeConfigModal: () => void

  // Session Management
  startUltraResearch: (query: string, projectPath: string, chatSessionId: string) => Promise<void>
  cancelUltraResearch: () => Promise<void>
  loadResearchSession: (projectPath: string, sessionId: string) => Promise<void>

  // Event Handling
  subscribeToResearchEvents: (sessionId: string) => Promise<UnlistenFn>
  clearResearchState: () => void
}

export type UltraResearchSlice = UltraResearchState & UltraResearchActions

// ============================================================================
// Initial State
// ============================================================================

export const ultraResearchInitialState: UltraResearchState = {
  ultraResearchConfig: null,
  activeResearchSession: null,
  researchProgress: null,
  isConfigModalOpen: false,
  agentStreamingContent: {},
  researchError: null,
}

// ============================================================================
// Slice Creator
// ============================================================================

type SetState = (
  partial:
    | Partial<UltraResearchSlice>
    | ((state: UltraResearchSlice) => Partial<UltraResearchSlice>)
) => void

type GetState = () => UltraResearchSlice

export function createUltraResearchSlice(set: SetState, get: GetState): UltraResearchSlice {
  return {
    // Initial state
    ...ultraResearchInitialState,

    // ========================================================================
    // Configuration Actions
    // ========================================================================

    setUltraResearchConfig: (config: UltraResearchConfig | null) => {
      set({ ultraResearchConfig: config })
    },

    toggleUltraResearch: () => {
      const { ultraResearchConfig } = get()

      if (ultraResearchConfig?.enabled) {
        // Disable
        set({
          ultraResearchConfig: ultraResearchConfig
            ? { ...ultraResearchConfig, enabled: false }
            : null,
        })
      } else {
        // Enable - create default config if needed and open modal
        const config = ultraResearchConfig || createDefaultUltraResearchConfig()
        set({
          ultraResearchConfig: { ...config, enabled: true },
          isConfigModalOpen: true,
        })
      }
    },

    openConfigModal: () => {
      set({ isConfigModalOpen: true })
    },

    closeConfigModal: () => {
      set({ isConfigModalOpen: false })
    },

    // ========================================================================
    // Session Management Actions
    // ========================================================================

    startUltraResearch: async (
      query: string,
      projectPath: string,
      chatSessionId: string
    ) => {
      const { ultraResearchConfig, subscribeToResearchEvents } = get()

      if (!ultraResearchConfig) {
        throw new Error('Ultra research is not configured')
      }

      set({
        researchError: null,
        agentStreamingContent: {},
      })

      try {
        const request: StartUltraResearchRequest = {
          config: ultraResearchConfig,
          query,
          projectPath,
          chatSessionId,
        }

        const response = await invoke<StartUltraResearchResponse>(
          'start_ultra_research',
          { request }
        )

        set({
          activeResearchSession: response.session,
          researchProgress: {
            status: response.session.status,
            overallProgress: 5,
            currentPhase: 'Planning research angles',
            agentsCompleted: 0,
            totalAgents: response.session.config.agents.length,
            totalRounds: response.session.config.discussionRounds,
            agentStatuses: {},
          },
        })

        // Subscribe to events for this session
        await subscribeToResearchEvents(response.session.id)
      } catch (error) {
        set({
          researchError: error instanceof Error ? error.message : 'Failed to start research',
        })
        throw error
      }
    },

    cancelUltraResearch: async () => {
      const { activeResearchSession } = get()

      if (!activeResearchSession) {
        return
      }

      try {
        await invoke('cancel_ultra_research', {
          projectPath: activeResearchSession.projectPath,
          sessionId: activeResearchSession.id,
        })

        set({
          activeResearchSession: null,
          researchProgress: null,
          agentStreamingContent: {},
        })
      } catch (error) {
        set({
          researchError: error instanceof Error ? error.message : 'Failed to cancel research',
        })
      }
    },

    loadResearchSession: async (projectPath: string, sessionId: string) => {
      try {
        const session = await invoke<ResearchSession>('get_research_session', {
          projectPath,
          sessionId,
        })

        const progress = await invoke<ResearchProgress>('get_research_progress', {
          projectPath,
          sessionId,
        })

        set({
          activeResearchSession: session,
          researchProgress: progress,
        })
      } catch (error) {
        console.error('Failed to load research session:', error)
      }
    },

    // ========================================================================
    // Event Handling Actions
    // ========================================================================

    subscribeToResearchEvents: async (sessionId: string): Promise<UnlistenFn> => {
      const unlistenFns: UnlistenFn[] = []

      // Agent progress events (streaming)
      const unlisten1 = await subscribeEvent<ResearchAgentProgressPayload>(
        'ultra_research:agent_progress',
        (payload) => {
          if (payload.sessionId !== sessionId) return

          set((state) => ({
            agentStreamingContent: {
              ...state.agentStreamingContent,
              [payload.agentId]:
                (state.agentStreamingContent[payload.agentId] || '') + payload.content,
            },
          }))
        }
      )
      unlistenFns.push(unlisten1)

      // Session update events
      const unlisten2 = await subscribeEvent<ResearchSessionUpdatePayload>(
        'ultra_research:session_update',
        (payload) => {
          if (payload.sessionId !== sessionId) return

          set({
            researchProgress: payload.progress,
          })
        }
      )
      unlistenFns.push(unlisten2)

      // Error events
      const unlisten3 = await subscribeEvent<ResearchErrorPayload>(
        'ultra_research:error',
        (payload) => {
          if (payload.sessionId !== sessionId) return

          set({
            researchError: payload.error,
          })
        }
      )
      unlistenFns.push(unlisten3)

      // Completed event
      const unlisten4 = await subscribeEvent<{ sessionId: string }>(
        'ultra_research:completed',
        async (payload) => {
          if (payload.sessionId !== sessionId) return

          // Reload the session to get final state
          const { activeResearchSession } = get()
          if (activeResearchSession?.projectPath) {
            const session = await invoke<ResearchSession>('get_research_session', {
              projectPath: activeResearchSession.projectPath,
              sessionId,
            })

            set({
              activeResearchSession: session,
              researchProgress: {
                ...get().researchProgress!,
                status: 'complete',
                overallProgress: 100,
                currentPhase: 'Research complete',
              },
            })
          }
        }
      )
      unlistenFns.push(unlisten4)

      // Return combined unlisten function
      return () => {
        unlistenFns.forEach((fn) => fn())
      }
    },

    clearResearchState: () => {
      set({
        activeResearchSession: null,
        researchProgress: null,
        agentStreamingContent: {},
        researchError: null,
      })
    },
  }
}
