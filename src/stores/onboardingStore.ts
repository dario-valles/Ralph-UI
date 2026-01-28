// Onboarding store to track first-time user experience and dismissed hints

import type { AgentType } from '@/types'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OnboardingStore {
  // State
  dismissedHints: Set<string>
  hasSeenMainOnboarding: boolean
  hasSeenGSDOnboarding: boolean

  // Agent setup state
  hasCompletedAgentSetup: boolean
  enabledAgents: AgentType[]
  preferredAgent: AgentType | null

  // Actions
  dismissHint: (hintId: string) => void
  hasHintBeenDismissed: (hintId: string) => boolean
  markMainOnboardingAsSeen: () => void
  markGSDOnboardingAsSeen: () => void
  resetOnboarding: () => void

  // Agent setup actions
  markAgentSetupComplete: () => void
  setEnabledAgents: (agents: AgentType[]) => void
  setPreferredAgent: (agent: AgentType | null) => void
  shouldShowAgentSetup: () => boolean
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      dismissedHints: new Set(),
      hasSeenMainOnboarding: false,
      hasSeenGSDOnboarding: false,

      // Agent setup defaults
      hasCompletedAgentSetup: false,
      enabledAgents: [],
      preferredAgent: null,

      dismissHint: (hintId: string) =>
        set((state) => ({
          dismissedHints: new Set([...state.dismissedHints, hintId]),
        })),

      hasHintBeenDismissed: (hintId: string) => {
        return get().dismissedHints.has(hintId)
      },

      markMainOnboardingAsSeen: () =>
        set(() => ({
          hasSeenMainOnboarding: true,
        })),

      markGSDOnboardingAsSeen: () =>
        set(() => ({
          hasSeenGSDOnboarding: true,
        })),

      resetOnboarding: () =>
        set(() => ({
          dismissedHints: new Set(),
          hasSeenMainOnboarding: false,
          hasSeenGSDOnboarding: false,
          hasCompletedAgentSetup: false,
          enabledAgents: [],
          preferredAgent: null,
        })),

      // Agent setup actions
      markAgentSetupComplete: () =>
        set(() => ({
          hasCompletedAgentSetup: true,
        })),

      setEnabledAgents: (agents: AgentType[]) =>
        set(() => ({
          enabledAgents: agents,
        })),

      setPreferredAgent: (agent: AgentType | null) =>
        set(() => ({
          preferredAgent: agent,
        })),

      shouldShowAgentSetup: () => {
        const state = get()
        // Show agent setup if not completed yet
        return !state.hasCompletedAgentSetup
      },
    }),
    {
      name: 'ralph-onboarding',
      partialize: (state) => ({
        dismissedHints: Array.from(state.dismissedHints),
        hasSeenMainOnboarding: state.hasSeenMainOnboarding,
        hasSeenGSDOnboarding: state.hasSeenGSDOnboarding,
        hasCompletedAgentSetup: state.hasCompletedAgentSetup,
        enabledAgents: state.enabledAgents,
        preferredAgent: state.preferredAgent,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as
          | {
              dismissedHints?: string[]
              hasSeenMainOnboarding?: boolean
              hasSeenGSDOnboarding?: boolean
              hasCompletedAgentSetup?: boolean
              enabledAgents?: AgentType[]
              preferredAgent?: AgentType | null
            }
          | undefined
        return {
          ...currentState,
          dismissedHints: new Set(persisted?.dismissedHints || []),
          hasSeenMainOnboarding: persisted?.hasSeenMainOnboarding || false,
          hasSeenGSDOnboarding: persisted?.hasSeenGSDOnboarding || false,
          hasCompletedAgentSetup: persisted?.hasCompletedAgentSetup || false,
          enabledAgents: persisted?.enabledAgents || [],
          preferredAgent: persisted?.preferredAgent || null,
        }
      },
    }
  )
)
