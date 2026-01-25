/**
 * WebSocket event client for real-time events
 *
 * Provides a subscription-based event system for real-time updates from the server.
 * Connects to the server's WebSocket endpoint at /ws/events.
 *
 * Mobile Resilience (US-1, US-6):
 * - Extended reconnection duration (5+ minutes)
 * - Exponential backoff with jitter
 * - Connection state tracking via Zustand store
 * - Reconnection notifications (US-6)
 * - Background-aware keepalive (US-6)
 */

import { getServerConfig } from './invoke'
import {
  useConnectionStore,
  calculateReconnectDelay,
  shouldContinueReconnecting,
  RECONNECTION_CONFIG,
} from '@/stores/connectionStore'

/**
 * Event payload from the server
 */
interface ServerEvent {
  event: string
  payload: unknown
}

/**
 * Event handler function type
 */
type EventHandler<T> = (payload: T) => void

/**
 * Unlisten function type
 */
export type UnlistenFn = () => void

// Keepalive intervals (US-6)
const KEEPALIVE_FOREGROUND_MS = 30000 // 30 seconds when visible
const KEEPALIVE_BACKGROUND_MS = 60000 // 60 seconds when backgrounded
const PONG_TIMEOUT_MS = 90000 // 90 seconds without pong = stale


/**
 * WebSocket-based event client with mobile-resilient reconnection
 */
class EventsClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<EventHandler<unknown>>>()
  private isConnecting = false
  private connectionPromise: Promise<void> | null = null
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  private keepaliveInterval: ReturnType<typeof setInterval> | null = null
  private lastPongTime: number = 0
  private visibilityHandler: (() => void) | null = null

  /**
   * Connect to the WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return // Already connected
    }

    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise
    }

    const config = getServerConfig()
    if (!config) {
      throw new Error('Server configuration not set. Cannot connect to WebSocket.')
    }

    const store = useConnectionStore.getState()

    // Check if device is online
    if (!navigator.onLine) {
      store.setOnline(false)
      throw new Error('Device is offline')
    }

    this.isConnecting = true
    store.setStatus('connecting')

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        // Convert http(s) to ws(s)
        const wsUrl = config.url.replace(/^http/, 'ws') + `/ws/events?token=${config.token}`
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('[EventsClient] WebSocket connected')
          this.isConnecting = false

          useConnectionStore.getState().markConnected()
          this.startKeepalive()
          this.startVisibilityListener()
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const data: ServerEvent = JSON.parse(event.data)

            // Handle pong messages for keepalive
            if (data.event === 'pong') {
              this.lastPongTime = Date.now()
              return
            }

            this.dispatchEvent(data.event, data.payload)
          } catch (e) {
            console.warn('[EventsClient] Failed to parse WebSocket message:', e)
          }
        }

        this.ws.onerror = (error) => {
          console.error('[EventsClient] WebSocket error:', error)
        }

        this.ws.onclose = (event) => {
          console.log('[EventsClient] WebSocket closed:', event.code, event.reason)
          this.ws = null
          this.stopKeepalive()

          const store = useConnectionStore.getState()
          const wasConnecting = this.isConnecting
          this.isConnecting = false

          // Don't reconnect if it was a clean close (code 1000) or auth failure (4001)
          if (event.code === 1000) {
            store.markDisconnected()
            return
          }

          if (event.code === 4001) {
            store.markDisconnected('Authentication failed', 'auth')
            // Reject the connection promise if we were still connecting
            if (wasConnecting) {
              reject(new Error('Authentication failed: Invalid token'))
            }
            return
          }

          // Start reconnection if not already in progress
          if (store.reconnectStartTime === null) {
            store.startReconnecting()
          }

          this.scheduleReconnect()
        }
      } catch (e) {
        this.isConnecting = false
        useConnectionStore
          .getState()
          .markDisconnected(e instanceof Error ? e.message : 'Connection failed', 'unknown')
        reject(e)
      }
    })

    return this.connectionPromise
  }

  /**
   * Schedule a reconnection attempt with exponential backoff and jitter
   */
  private scheduleReconnect(): void {
    const store = useConnectionStore.getState()

    // Check if we should continue reconnecting
    if (!shouldContinueReconnecting(store.reconnectStartTime)) {
      console.log('[EventsClient] Max reconnection duration exceeded, giving up')
      store.markDisconnected('Connection timeout after 5 minutes', 'timeout')
      return
    }

    // Check if device is offline
    if (!navigator.onLine) {
      console.log('[EventsClient] Device offline, waiting for online event')
      store.setOnline(false)
      return
    }

    // Calculate delay with jitter
    const delay = calculateReconnectDelay(store.reconnectAttempts)
    store.incrementReconnectAttempts()

    const remainingSeconds = Math.round(
      (RECONNECTION_CONFIG.maxReconnectDurationMs -
        (Date.now() - (store.reconnectStartTime || Date.now()))) /
        1000
    )

    console.log(
      `[EventsClient] Reconnecting in ${delay}ms (attempt ${store.reconnectAttempts}, ${remainingSeconds}s remaining)`
    )

    // Clear any existing timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null
      this.connect().catch((error) => {
        console.error('[EventsClient] Reconnection failed:', error)
        // Will trigger onclose which will schedule another attempt
      })
    }, delay)
  }

  /**
   * Start keepalive ping/pong to detect stale connections
   * Uses shorter interval when app is visible, longer when backgrounded (US-6)
   */
  private startKeepalive(): void {
    this.stopKeepalive()
    this.lastPongTime = Date.now()

    // Determine interval based on visibility
    const interval = this.isPageVisible() ? KEEPALIVE_FOREGROUND_MS : KEEPALIVE_BACKGROUND_MS

    this.keepaliveInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        // Check if we received a pong recently
        if (Date.now() - this.lastPongTime > PONG_TIMEOUT_MS) {
          console.warn('[EventsClient] No pong received, connection may be stale')
          this.ws.close(4000, 'Keepalive timeout')
          return
        }

        // Send ping
        this.ws.send(JSON.stringify({ event: 'ping', payload: { timestamp: Date.now() } }))
      }
    }, interval)
  }

  /**
   * Stop keepalive interval
   */
  private stopKeepalive(): void {
    if (this.keepaliveInterval) {
      clearInterval(this.keepaliveInterval)
      this.keepaliveInterval = null
    }
  }

  /**
   * Start visibility change listener for background-aware keepalive (US-6)
   */
  private startVisibilityListener(): void {
    this.stopVisibilityListener()

    this.visibilityHandler = () => {
      // Restart keepalive with appropriate interval when visibility changes
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.startKeepalive()
      }
    }

    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  /**
   * Stop visibility change listener
   */
  private stopVisibilityListener(): void {
    if (this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
      this.visibilityHandler = null
    }
  }

  /**
   * Check if page is currently visible
   */
  private isPageVisible(): boolean {
    return typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    // Clear reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    this.stopKeepalive()
    this.stopVisibilityListener()

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }

    this.handlers.clear()
    useConnectionStore.getState().markDisconnected()
  }

  /**
   * Force immediate reconnection (used when app returns to foreground)
   */
  forceReconnect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return // Already connected
    }

    // Clear any pending reconnect
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    // Reset reconnection state and try immediately
    useConnectionStore.getState().startReconnecting()
    this.connect().catch(console.error)
  }

  /**
   * Subscribe to an event
   */
  subscribe<T>(event: string, handler: EventHandler<T>): UnlistenFn {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler as EventHandler<unknown>)

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler as EventHandler<unknown>)
      if (this.handlers.get(event)?.size === 0) {
        this.handlers.delete(event)
      }
    }
  }

  /**
   * Dispatch an event to all registered handlers
   */
  private dispatchEvent(event: string, payload: unknown): void {
    const eventHandlers = this.handlers.get(event)
    if (eventHandlers) {
      eventHandlers.forEach((handler) => {
        try {
          handler(payload)
        } catch (e) {
          console.error(`[EventsClient] Error in handler for '${event}':`, e)
        }
      })
    }

    // Also dispatch to wildcard handlers
    const wildcardHandlers = this.handlers.get('*')
    if (wildcardHandlers) {
      wildcardHandlers.forEach((handler) => {
        try {
          handler({ event, payload })
        } catch (e) {
          console.error('[EventsClient] Error in wildcard handler:', e)
        }
      })
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

// Singleton instance
const eventsClient = new EventsClient()

/**
 * Subscribe to an event from the server.
 *
 * Usage:
 * ```ts
 * const unlisten = await subscribeEvent('ralph:progress', (payload) => {
 *   console.log('Progress:', payload)
 * })
 *
 * // Later, to unsubscribe:
 * unlisten()
 * ```
 */
export async function subscribeEvent<T>(
  event: string,
  handler: (payload: T) => void
): Promise<UnlistenFn> {
  // Ensure we're connected
  await eventsClient.connect()

  // Subscribe and return unlisten function
  return eventsClient.subscribe<T>(event, handler)
}

/**
 * Connect to the WebSocket server.
 * Call this when the app initializes.
 */
export async function connectEvents(): Promise<void> {
  await eventsClient.connect()
}

/**
 * Disconnect from the WebSocket server.
 * Call this when the app unmounts or user logs out.
 */
export function disconnectEvents(): void {
  eventsClient.disconnect()
}

/**
 * Check if connected to event stream
 */
export function isEventsConnected(): boolean {
  return eventsClient.isConnected()
}

/**
 * Force immediate reconnection.
 * Useful when returning from background on mobile.
 */
export function forceEventsReconnect(): void {
  eventsClient.forceReconnect()
}
