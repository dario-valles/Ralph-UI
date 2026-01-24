/**
 * Push Notification Service Worker for Ralph UI
 *
 * Handles push events from the server and displays notifications
 * even when the browser is closed.
 */

// Service worker version for cache invalidation
const SW_VERSION = '1.0.0';

/**
 * Handle push events from the server
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received');

  if (!event.data) {
    console.log('[SW] Push event has no data');
    return;
  }

  let payload;
  try {
    payload = event.data.json();
  } catch (e) {
    console.error('[SW] Failed to parse push data:', e);
    payload = {
      title: 'Ralph UI',
      body: event.data.text(),
    };
  }

  const title = payload.title || 'Ralph UI';
  const options = {
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
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Get notification actions based on event type
 */
function getNotificationActions(eventType) {
  switch (eventType) {
    case 'chat_response':
      return [
        { action: 'view', title: 'View Chat' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
    case 'task_completed':
      return [
        { action: 'view', title: 'View Task' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
    case 'agent_status':
      return [
        { action: 'view', title: 'View Agent' },
        { action: 'dismiss', title: 'Dismiss' },
      ];
    default:
      return [{ action: 'view', title: 'Open App' }];
  }
}

/**
 * Handle notification click events
 */
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event.action);

  // Close the notification
  event.notification.close();

  const data = event.notification.data || {};

  // Handle action buttons
  if (event.action === 'dismiss') {
    return;
  }

  // Determine URL to open based on event type and data
  let url = '/';
  if (data.url) {
    url = data.url;
  } else if (data.eventType) {
    switch (data.eventType) {
      case 'chat_response':
        url = data.sessionId ? `/prd/chat/${data.sessionId}` : '/prd';
        break;
      case 'task_completed':
        url = '/tasks';
        break;
      case 'agent_status':
        url = data.agentId ? `/agents/${data.agentId}` : '/agents';
        break;
      case 'ralph_iteration':
        url = '/ralph-loop';
        break;
      default:
        url = '/';
    }
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Try to find an existing window and focus it
      for (const client of clientList) {
        // Check if this is a Ralph UI window
        if (client.url.includes(self.registration.scope)) {
          // Navigate to the target URL and focus
          return client.navigate(url).then((client) => client?.focus());
        }
      }

      // No existing window found, open a new one
      return clients.openWindow(url);
    })
  );
});

/**
 * Handle notification close events (for analytics)
 */
self.addEventListener('notificationclose', (event) => {
  console.log('[SW] Notification closed:', event.notification.tag);
});

/**
 * Handle service worker installation
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing push service worker v' + SW_VERSION);
  // Skip waiting to activate immediately
  self.skipWaiting();
});

/**
 * Handle service worker activation
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating push service worker v' + SW_VERSION);
  // Take control of all clients immediately
  event.waitUntil(clients.claim());
});

/**
 * Handle push subscription change
 * This fires when the push subscription expires or is revoked
 */
self.addEventListener('pushsubscriptionchange', (event) => {
  console.log('[SW] Push subscription changed');

  event.waitUntil(
    (async () => {
      try {
        // Re-subscribe with the same options
        const subscription = await self.registration.pushManager.subscribe(
          event.oldSubscription?.options || {
            userVisibleOnly: true,
            // Note: applicationServerKey would need to be passed from the main app
          }
        );

        console.log('[SW] Re-subscribed to push notifications');

        // Notify all clients about the new subscription
        const allClients = await clients.matchAll({ type: 'window' });
        for (const client of allClients) {
          client.postMessage({
            type: 'PUSH_SUBSCRIPTION_CHANGED',
            subscription: subscription.toJSON(),
          });
        }
      } catch (error) {
        console.error('[SW] Failed to re-subscribe:', error);
      }
    })()
  );
});

console.log('[SW] Push service worker loaded v' + SW_VERSION);
