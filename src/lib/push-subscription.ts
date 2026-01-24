/**
 * Push Notification Subscription Management
 *
 * Handles subscribing/unsubscribing to Web Push notifications.
 * Works with the service worker to enable notifications even when the browser is closed.
 */

import { invoke } from './invoke'

/** Push subscription keys from the browser */
export interface PushSubscriptionKeys {
  p256dh: string
  auth: string
}

/** Push notification settings per event type */
export interface PushNotificationSettings {
  chatResponse: boolean
  taskCompleted: boolean
  agentStatus: boolean
  ralphIteration: boolean
  connectionStatus: boolean
}

/** Response from subscribe_push command */
export interface PushSubscriptionResponse {
  id: string
  settings: PushNotificationSettings
}

/** VAPID public key response */
export interface VapidPublicKeyResponse {
  publicKey: string
}

/** Subscription info for display */
export interface PushSubscriptionInfo {
  id: string
  endpointDomain: string
  settings: PushNotificationSettings
  createdAt: string
  userAgent: string | null
}

/**
 * Check if push notifications are supported in this browser
 */
export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/**
 * Get the current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
  if (!('Notification' in window)) {
    return 'denied'
  }
  return Notification.permission
}

/**
 * Request notification permission from the user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    throw new Error('Notifications are not supported in this browser')
  }

  // If already granted or denied, return current state
  if (Notification.permission !== 'default') {
    return Notification.permission
  }

  // Request permission
  const permission = await Notification.requestPermission()
  return permission
}

/**
 * Get the service worker registration (registered by VitePWA)
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser')
  }

  // Wait for the service worker to be ready (registered by VitePWA)
  // Add a timeout to prevent hanging if SW isn't registered
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Service worker not available (timeout)')), 10000)
  })

  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    timeoutPromise,
  ])

  console.log('[Push] Service worker ready:', registration.scope)
  return registration
}

/**
 * Get the VAPID public key from the server
 */
export async function getVapidPublicKey(): Promise<string> {
  const response = await invoke<VapidPublicKeyResponse>('get_vapid_public_key')
  return response.publicKey
}

/**
 * Convert a base64 URL string to a Uint8Array (for applicationServerKey)
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  // Add padding if needed
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Convert ArrayBuffer to base64url string
 */
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  // Convert to base64, then make URL-safe
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/**
 * Subscribe to push notifications
 * Returns the subscription ID for future reference
 */
export async function subscribeToPush(
  initialSettings?: Partial<PushNotificationSettings>
): Promise<PushSubscriptionResponse> {
  // Check support
  if (!isPushSupported()) {
    throw new Error('Push notifications are not supported in this browser')
  }

  // Request permission
  const permission = await requestNotificationPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission denied')
  }

  // Register service worker
  let registration: ServiceWorkerRegistration
  try {
    registration = await registerServiceWorker()
  } catch (error) {
    console.error('[Push] Service worker registration failed:', error)
    throw new Error('Failed to register service worker')
  }

  // Get VAPID public key
  let vapidPublicKey: string
  try {
    vapidPublicKey = await getVapidPublicKey()
  } catch (error) {
    console.error('[Push] Failed to get VAPID key:', error)
    throw new Error('Failed to get server push key')
  }

  // Convert to Uint8Array for browser API
  let applicationServerKey: Uint8Array
  try {
    applicationServerKey = urlBase64ToUint8Array(vapidPublicKey)
  } catch (error) {
    console.error('[Push] Failed to convert VAPID key:', error)
    throw new Error('Invalid server push key format')
  }

  // Subscribe to push
  let subscription: PushSubscription
  try {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true, // Required: notifications must be visible to user
      applicationServerKey,
    })
  } catch (error) {
    console.error('[Push] Push subscription failed:', error)
    // Provide more specific error messages
    if (error instanceof DOMException) {
      if (error.name === 'NotAllowedError') {
        throw new Error('Push notifications not allowed')
      }
      if (error.name === 'AbortError') {
        throw new Error('Push subscription was aborted')
      }
    }
    throw new Error('Failed to subscribe to push service')
  }

  // Extract keys
  const p256dh = subscription.getKey('p256dh')
  const auth = subscription.getKey('auth')

  if (!p256dh || !auth) {
    throw new Error('Failed to get push subscription keys')
  }

  // Send subscription to server
  const response = await invoke<PushSubscriptionResponse>('subscribe_push', {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: arrayBufferToBase64Url(p256dh),
      auth: arrayBufferToBase64Url(auth),
    },
    userAgent: navigator.userAgent,
    settings: initialSettings,
  })

  console.log('[Push] Subscribed successfully:', response.id)
  return response
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(subscriptionId?: string): Promise<boolean> {
  // Get current subscription from service worker
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()

    if (subscription) {
      // Unsubscribe from browser
      await subscription.unsubscribe()

      // Notify server
      await invoke<boolean>('unsubscribe_push', {
        subscriptionId,
        endpoint: subscription.endpoint,
      })

      console.log('[Push] Unsubscribed successfully')
      return true
    }
  }

  // If no browser subscription, just notify server
  if (subscriptionId) {
    await invoke<boolean>('unsubscribe_push', { subscriptionId })
    return true
  }

  return false
}

/**
 * Get the current push subscription (if any)
 */
export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) {
    return null
  }

  try {
    const registration = await navigator.serviceWorker.ready
    return await registration.pushManager.getSubscription()
  } catch (error) {
    console.error('[Push] Error getting subscription:', error)
    return null
  }
}

/**
 * Update notification settings for a subscription
 */
export async function updatePushSettings(
  subscriptionId: string,
  settings: PushNotificationSettings
): Promise<PushNotificationSettings> {
  return await invoke<PushNotificationSettings>('update_push_settings', {
    subscriptionId,
    settings,
  })
}

/**
 * Get notification settings for a subscription
 */
export async function getPushSettings(
  subscriptionId: string
): Promise<PushNotificationSettings> {
  return await invoke<PushNotificationSettings>('get_push_settings', {
    subscriptionId,
  })
}

/**
 * Send a test notification
 */
export async function sendTestNotification(subscriptionId: string): Promise<void> {
  await invoke<void>('test_push', { subscriptionId })
}

/**
 * List all push subscriptions (for settings UI)
 */
export async function listPushSubscriptions(): Promise<PushSubscriptionInfo[]> {
  return await invoke<PushSubscriptionInfo[]>('list_push_subscriptions')
}

/**
 * Get the count of active subscriptions
 */
export async function getPushSubscriptionCount(): Promise<number> {
  return await invoke<number>('get_push_subscription_count')
}
