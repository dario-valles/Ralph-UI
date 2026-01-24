/**
 * Push Notification State Management
 *
 * Manages push notification subscription state, permissions, and settings.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import {
  isPushSupported,
  getNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  getCurrentSubscription,
  updatePushSettings,
  sendTestNotification,
  type PushNotificationSettings,
} from '@/lib/push-subscription'

/** Default notification settings */
const DEFAULT_SETTINGS: PushNotificationSettings = {
  chatResponse: true,
  taskCompleted: true,
  agentStatus: true,
  ralphIteration: false,
  connectionStatus: true,
}

interface PushNotificationState {
  /** Whether push is supported in this browser */
  isSupported: boolean
  /** Current browser notification permission */
  permission: NotificationPermission
  /** Whether we have an active subscription */
  isSubscribed: boolean
  /** Current subscription ID (if subscribed) */
  subscriptionId: string | null
  /** Notification settings per event type */
  settings: PushNotificationSettings
  /** Loading state for async operations */
  isLoading: boolean
  /** Error message from last operation */
  error: string | null
}

interface PushNotificationActions {
  /** Initialize the store - check support and current state */
  initialize: () => Promise<void>
  /** Subscribe to push notifications */
  subscribe: () => Promise<boolean>
  /** Unsubscribe from push notifications */
  unsubscribe: () => Promise<boolean>
  /** Update a single setting */
  updateSetting: (key: keyof PushNotificationSettings, value: boolean) => Promise<void>
  /** Update all settings at once */
  updateSettings: (settings: Partial<PushNotificationSettings>) => Promise<void>
  /** Send a test notification */
  sendTest: () => Promise<boolean>
  /** Clear any error */
  clearError: () => void
  /** Set permission (called when permission changes) */
  setPermission: (permission: NotificationPermission) => void
}

type PushNotificationStore = PushNotificationState & PushNotificationActions

export const usePushNotificationStore = create<PushNotificationStore>()(
  persist(
    (set, get) => ({
      // Initial state
      isSupported: false,
      permission: 'default',
      isSubscribed: false,
      subscriptionId: null,
      settings: DEFAULT_SETTINGS,
      isLoading: false,
      error: null,

      // Actions
      initialize: async () => {
        const isSupported = isPushSupported()
        const permission = getNotificationPermission()

        set({ isSupported, permission })

        if (!isSupported) {
          return
        }

        // Check if we have an existing subscription
        try {
          const subscription = await getCurrentSubscription()
          if (subscription) {
            set({ isSubscribed: true })
          }
        } catch (error) {
          console.error('[PushStore] Error checking subscription:', error)
        }
      },

      subscribe: async () => {
        const { isSupported, isSubscribed } = get()

        if (!isSupported) {
          set({ error: 'Push notifications are not supported in this browser' })
          return false
        }

        if (isSubscribed) {
          return true // Already subscribed
        }

        set({ isLoading: true, error: null })

        try {
          const response = await subscribeToPush(get().settings)
          set({
            isSubscribed: true,
            subscriptionId: response.id,
            settings: response.settings,
            permission: 'granted',
            isLoading: false,
          })
          return true
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to subscribe'
          set({ error: message, isLoading: false })
          // Update permission state if it was denied
          if (message.includes('permission denied')) {
            set({ permission: 'denied' })
          }
          return false
        }
      },

      unsubscribe: async () => {
        const { subscriptionId, isSubscribed } = get()

        if (!isSubscribed) {
          return true // Already unsubscribed
        }

        set({ isLoading: true, error: null })

        try {
          await unsubscribeFromPush(subscriptionId || undefined)
          set({
            isSubscribed: false,
            subscriptionId: null,
            isLoading: false,
          })
          return true
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to unsubscribe'
          set({ error: message, isLoading: false })
          return false
        }
      },

      updateSetting: async (key, value) => {
        const { subscriptionId, isSubscribed, settings } = get()

        // Update local state immediately for responsive UI
        const newSettings = { ...settings, [key]: value }
        set({ settings: newSettings })

        // If subscribed, sync to server
        if (isSubscribed && subscriptionId) {
          try {
            await updatePushSettings(subscriptionId, newSettings)
          } catch {
            // Revert on error
            set({ settings, error: 'Failed to update settings' })
          }
        }
      },

      updateSettings: async (newSettings) => {
        const { subscriptionId, isSubscribed, settings } = get()

        // Merge with current settings
        const merged = { ...settings, ...newSettings }
        set({ settings: merged })

        // If subscribed, sync to server
        if (isSubscribed && subscriptionId) {
          try {
            await updatePushSettings(subscriptionId, merged)
          } catch {
            // Revert on error
            set({ settings, error: 'Failed to update settings' })
          }
        }
      },

      sendTest: async () => {
        const { subscriptionId, isSubscribed } = get()

        if (!isSubscribed || !subscriptionId) {
          set({ error: 'No active subscription' })
          return false
        }

        set({ isLoading: true, error: null })

        try {
          await sendTestNotification(subscriptionId)
          set({ isLoading: false })
          return true
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to send test'
          set({ error: message, isLoading: false })
          return false
        }
      },

      clearError: () => set({ error: null }),

      setPermission: (permission) => set({ permission }),
    }),
    {
      name: 'ralph-push-notifications',
      storage: createJSONStorage(() => localStorage),
      // Only persist these fields
      partialize: (state) => ({
        subscriptionId: state.subscriptionId,
        settings: state.settings,
        isSubscribed: state.isSubscribed,
      }),
    }
  )
)

/**
 * Hook to initialize push notification store on app load
 */
export function useInitializePushNotifications() {
  const initialize = usePushNotificationStore((state) => state.initialize)

  // Initialize on first render
  if (typeof window !== 'undefined') {
    // Use microtask to avoid React strict mode double-init issues
    queueMicrotask(() => {
      initialize()
    })
  }
}
