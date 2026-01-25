/// <reference lib="webworker" />
/**
 * Combined Service Worker for Ralph UI
 *
 * Handles:
 * - PWA caching via Workbox (with user-controlled updates)
 * - Runtime caching for API, assets, and fonts
 * - Push notifications
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare let self: ServiceWorkerGlobalScope

// Extended notification options that include vibrate (browser supported but not in TS types)
interface ExtendedNotificationOptions extends NotificationOptions {
  vibrate?: number[]
  actions?: Array<{ action: string; title: string }>
}

// Service worker version for debugging
const SW_VERSION = '1.1.0'

// Clean up old caches from previous versions
cleanupOutdatedCaches()

// Precache critical app shell assets (injected by Vite build)
precacheAndRoute(self.__WB_MANIFEST)

// ============================================
// Runtime Caching Strategies
// ============================================

// API calls - network first, cache fallback for offline
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxAgeSeconds: 300 }), // 5 minutes
    ],
  })
)

// Hashed static assets - cache forever (immutable, content-addressed)
registerRoute(
  ({ url }) => url.pathname.startsWith('/assets/'),
  new CacheFirst({
    cacheName: 'assets-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 100 }),
    ],
  })
)

// External fonts - stale while revalidate for fast loads
registerRoute(
  ({ url }) =>
    url.origin.includes('fonts.googleapis.com') || url.origin.includes('fonts.gstatic.com'),
  new StaleWhileRevalidate({
    cacheName: 'font-cache',
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxAgeSeconds: 31536000 }), // 1 year
    ],
  })
)

// ============================================
// User-Controlled Update Flow
// ============================================

// Listen for explicit update trigger from UI (instead of immediate skipWaiting)
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Claim clients after activation (happens after user accepts update)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old caches first
      await cleanupOutdatedCaches()
      // Take control of all open clients
      await self.clients.claim()
    })()
  )
})

// ============================================
// Push Notification Handling
// ============================================

/**
 * Handle push events from the server
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received')

  if (!event.data) {
    console.log('[SW] Push event has no data')
    return
  }

  let payload: {
    title?: string
    body?: string
    icon?: string
    badge?: string
    tag?: string
    data?: {
      eventType?: string
      sessionId?: string
      agentId?: string
      url?: string
    }
  }

  try {
    payload = event.data.json()
  } catch {
    console.error('[SW] Failed to parse push data')
    payload = {
      title: 'Ralph UI',
      body: event.data.text(),
    }
  }

  const title = payload.title || 'Ralph UI'
  const options: ExtendedNotificationOptions = {
    body: payload.body || '',
    icon: payload.icon || '/pwa-192x192.png',
    badge: payload.badge || '/pwa-192x192.png',
    tag: payload.tag || 'ralph-ui-notification',
    data: payload.data || {},
    // Require interaction for important notifications
    requireInteraction: payload.data?.eventType !== 'test',
    // Vibration pattern for mobile
    vibrate: [200, 100, 200],
    // Actions for interactive notifications
    actions: getNotificationActions(payload.data?.eventType),
  }

  event.waitUntil(self.registration.showNotification(title, options as NotificationOptions))
})

/**
 * Get notification actions based on event type
 */
function getNotificationActions(
  eventType?: string
): Array<{ action: string; title: string }> | undefined {
  switch (eventType) {
    case 'chat_response':
      return [
        { action: 'view', title: 'View Chat' },
        { action: 'dismiss', title: 'Dismiss' },
      ]
    case 'task_completed':
      return [
        { action: 'view', title: 'View Task' },
        { action: 'dismiss', title: 'Dismiss' },
      ]
    case 'agent_status':
      return [
        { action: 'view', title: 'View Agent' },
        { action: 'dismiss', title: 'Dismiss' },
      ]
    default:
      return [{ action: 'view', title: 'Open App' }]
  }
}

/**
 * Handle notification click events
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action)

  // Close the notification
  event.notification.close()

  const data = (event.notification.data || {}) as {
    eventType?: string
    sessionId?: string
    agentId?: string
    url?: string
  }

  // Handle action buttons
  if (event.action === 'dismiss') {
    return
  }

  // Determine URL to open based on event type and data
  let url = '/'
  if (data.url) {
    url = data.url
  } else if (data.eventType) {
    switch (data.eventType) {
      case 'chat_response':
        url = data.sessionId ? `/prd/chat/${data.sessionId}` : '/prd'
        break
      case 'task_completed':
        url = '/tasks'
        break
      case 'agent_status':
        url = data.agentId ? `/agents/${data.agentId}` : '/agents'
        break
      case 'ralph_iteration':
        url = '/ralph-loop'
        break
      default:
        url = '/'
    }
  }

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Try to find an existing window and focus it
        for (const client of clientList) {
          // Check if this is a Ralph UI window
          if (client.url.includes(self.registration.scope)) {
            // Navigate to the target URL and focus
            return client.navigate(url).then((c) => c?.focus())
          }
        }

        // No existing window found, open a new one
        return self.clients.openWindow(url)
      })
  )
})

/**
 * Handle notification close events (for analytics)
 */
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag)
})

/**
 * Handle push subscription change
 * This fires when the push subscription expires or is revoked
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed')

  // Cast to ExtendableEvent to access waitUntil
  const extEvent = event as ExtendableEvent & { oldSubscription?: PushSubscription }

  extEvent.waitUntil(
    (async () => {
      try {
        // Re-subscribe with the same options
        const subscription = await self.registration.pushManager.subscribe(
          extEvent.oldSubscription?.options || {
            userVisibleOnly: true,
          }
        )

        console.log('[SW] Re-subscribed to push notifications')

        // Notify all clients about the new subscription
        const allClients = await self.clients.matchAll({ type: 'window' })
        for (const client of allClients) {
          client.postMessage({
            type: 'PUSH_SUBSCRIPTION_CHANGED',
            subscription: subscription.toJSON(),
          })
        }
      } catch (error) {
        console.error('[SW] Failed to re-subscribe:', error)
      }
    })()
  )
})

console.log('[SW] Service worker loaded v' + SW_VERSION)
