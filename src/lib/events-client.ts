/**
 * WebSocket event client for browser mode
 *
 * Provides a subscription-based event system that mirrors Tauri's event system.
 * In browser mode, connects to the server's WebSocket endpoint for real-time events.
 */

import { listen as tauriListen, UnlistenFn } from '@tauri-apps/api/event'
import { isTauri } from './tauri-check'
import { getServerConfig } from './invoke'

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
 * WebSocket-based event client for browser mode
 */
class EventsClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<EventHandler<unknown>>>()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isConnecting = false
  private connectionPromise: Promise<void> | null = null

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

    this.isConnecting = true
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        // Convert http(s) to ws(s)
        const wsUrl = config.url.replace(/^http/, 'ws') + `/ws/events?token=${config.token}`
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('[EventsClient] WebSocket connected')
          this.reconnectAttempts = 0
          this.isConnecting = false
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const data: ServerEvent = JSON.parse(event.data)
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
          this.isConnecting = false

          // Attempt reconnection if not a clean close
          if (event.code !== 1000 && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++
            const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
            console.log(`[EventsClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)
            setTimeout(() => this.connect().catch(console.error), delay)
          }
        }
      } catch (e) {
        this.isConnecting = false
        reject(e)
      }
    })

    return this.connectionPromise
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect')
      this.ws = null
    }
    this.handlers.clear()
    this.reconnectAttempts = this.maxReconnectAttempts // Prevent auto-reconnect
  }

  /**
   * Subscribe to an event
   */
  subscribe<T>(event: string, handler: EventHandler<T>): () => void {
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

// Singleton instance for browser mode
const eventsClient = new EventsClient()

/**
 * Universal event subscription that works in both Tauri and browser modes.
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
  if (isTauri) {
    // Use Tauri's native event system
    return tauriListen<T>(event, (e) => handler(e.payload))
  }

  // Browser mode - use WebSocket client
  // Ensure we're connected
  await eventsClient.connect()

  // Subscribe and return unlisten function
  return eventsClient.subscribe<T>(event, handler)
}

/**
 * Connect to the WebSocket server (browser mode only).
 * Call this when the app initializes in browser mode.
 */
export async function connectEvents(): Promise<void> {
  if (!isTauri) {
    await eventsClient.connect()
  }
}

/**
 * Disconnect from the WebSocket server (browser mode only).
 * Call this when the app unmounts or user logs out.
 */
export function disconnectEvents(): void {
  if (!isTauri) {
    eventsClient.disconnect()
  }
}

/**
 * Check if connected to event stream
 */
export function isEventsConnected(): boolean {
  if (isTauri) {
    return true // Tauri is always "connected"
  }
  return eventsClient.isConnected()
}
