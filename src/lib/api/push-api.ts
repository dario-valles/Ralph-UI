// Push Notification API wrappers for backend commands

import { invoke } from '../invoke'

export interface PushSettings {
  enabled: boolean
  vapidPublicKey?: string
}

export interface PushSubscription {
  id: string
  endpoint: string
  createdAt: string
  userAgent?: string
}

export const pushApi = {
  /**
   * Get the VAPID public key for push notifications
   */
  getVapidPublicKey: async (): Promise<string> => {
    return await invoke('get_vapid_public_key')
  },

  /**
   * Get push notification settings
   */
  getSettings: async (): Promise<PushSettings> => {
    return await invoke('get_push_settings')
  },

  /**
   * Get the count of active push subscriptions
   */
  getSubscriptionCount: async (): Promise<number> => {
    return await invoke('get_push_subscription_count')
  },

  /**
   * List all active push subscriptions
   */
  listSubscriptions: async (): Promise<PushSubscription[]> => {
    return await invoke('list_push_subscriptions')
  },

  /**
   * Subscribe to push notifications
   */
  subscribe: async (subscription: PushSubscriptionJSON): Promise<void> => {
    return await invoke('subscribe_push', { subscription })
  },

  /**
   * Unsubscribe from push notifications
   */
  unsubscribe: async (endpoint: string): Promise<void> => {
    return await invoke('unsubscribe_push', { endpoint })
  },
}
