// Onboarding store to track first-time user experience and dismissed hints

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface OnboardingStore {
  // State
  dismissedHints: Set<string>
  hasSeenMainOnboarding: boolean

  // Actions
  dismissHint: (hintId: string) => void
  hasHintBeenDismissed: (hintId: string) => boolean
  markMainOnboardingAsSeen: () => void
  resetOnboarding: () => void
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      dismissedHints: new Set(),
      hasSeenMainOnboarding: false,

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

      resetOnboarding: () =>
        set(() => ({
          dismissedHints: new Set(),
          hasSeenMainOnboarding: false,
        })),
    }),
    {
      name: 'ralph-onboarding',
      partialize: (state) => ({
        dismissedHints: Array.from(state.dismissedHints),
        hasSeenMainOnboarding: state.hasSeenMainOnboarding,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as { dismissedHints?: string[]; hasSeenMainOnboarding?: boolean } | undefined
        return {
          ...currentState,
          dismissedHints: new Set(persisted?.dismissedHints || []),
          hasSeenMainOnboarding: persisted?.hasSeenMainOnboarding || false,
        }
      },
    }
  )
)
