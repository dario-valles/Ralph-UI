/**
 * HTTP invoke wrapper for backend API calls
 *
 * Provides a consistent interface for calling backend commands via HTTP.
 * All commands are routed through the /api/invoke endpoint on the Axum server.
 * Supports offline queueing for mobile resilience (US-5).
 */

import {
  useOfflineQueueStore,
  isQueueableCommand,
  cleanupOldActions,
} from '@/stores/offlineQueueStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { toast } from '@/stores/toastStore'

/**
 * Server configuration for browser mode
 * Stored in localStorage so users can configure their connection
 */
const SERVER_CONFIG_KEY = 'ralph_server_config'

interface ServerConfig {
  url: string
  token: string
}

/**
 * Get the server configuration from localStorage
 */
export function getServerConfig(): ServerConfig | null {
  if (typeof localStorage === 'undefined') return null
  const stored = localStorage.getItem(SERVER_CONFIG_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored) as ServerConfig
  } catch {
    return null
  }
}

/**
 * Set the server configuration in localStorage
 */
export function setServerConfig(config: ServerConfig): void {
  localStorage.setItem(SERVER_CONFIG_KEY, JSON.stringify(config))
}

/**
 * Clear the server configuration from localStorage
 */
export function clearServerConfig(): void {
  localStorage.removeItem(SERVER_CONFIG_KEY)
}

/**
 * Check if we're connected to a server
 */
export function isBrowserMode(): boolean {
  return getServerConfig() !== null
}

/**
 * Options for invoke calls
 */
interface InvokeOptions {
  /** If true, skip offline queueing and fail immediately */
  skipQueue?: boolean
}

/**
 * Show toast notification for queued offline action
 */
function showQueuedToast(queueLength: number, isNetworkError = false): void {
  const title = isNetworkError ? 'Connection lost' : 'Saved offline'
  const description =
    queueLength === 1
      ? isNetworkError
        ? 'Action saved offline, will sync when reconnected'
        : 'Will sync when connected'
      : `${queueLength} actions pending sync`

  toast.default(title, description)
}

/**
 * Invoke a backend command via HTTP
 * All commands are routed through POST /api/invoke
 * Queueable commands will be queued when offline (US-5)
 */
export async function invoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
  options?: InvokeOptions
): Promise<T> {
  const config = getServerConfig()
  if (!config) {
    throw new Error(
      `Not connected to Ralph UI server. Please configure the server URL and auth token.`
    )
  }

  // Check if we're offline
  const connectionStatus = useConnectionStore.getState().status
  const isOffline = connectionStatus === 'offline' || connectionStatus === 'disconnected'

  // If offline and command is queueable, queue it
  if (isOffline && !options?.skipQueue && isQueueableCommand(cmd)) {
    const store = useOfflineQueueStore.getState()
    store.queueAction(cmd, args || {})
    showQueuedToast(store.queue.length + 1)
    return undefined as T
  }

  // If offline and not queueable, throw an error
  if (isOffline) {
    throw new Error('Currently offline. Please wait for reconnection.')
  }

  try {
    const response = await fetch(`${config.url}/api/invoke`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({ cmd, args: args || {} }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      if (response.status === 401) {
        useConnectionStore.getState().markDisconnected('Invalid or expired auth token', 'auth')
        throw new Error('Unauthorized: Invalid or expired auth token')
      }
      throw new Error(`Server error (${response.status}): ${errorText}`)
    }

    // Handle empty responses (void commands)
    const text = await response.text()
    if (!text || text === 'null') {
      return undefined as T
    }

    try {
      const parsed = JSON.parse(text)

      // Server wraps responses in {success: true, data: ...} format
      // Extract the data field for successful responses
      if (parsed && typeof parsed === 'object' && 'success' in parsed) {
        if (!parsed.success) {
          throw new Error(parsed.error || 'Command failed')
        }
        // Return the data field (or undefined for void commands)
        return parsed.data as T
      }

      // Fallback: return parsed response directly
      return parsed as T
    } catch (e) {
      // Re-throw if it's our error
      if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
        throw e
      }
      // If it's not valid JSON, return as-is (for string responses)
      return text as T
    }
  } catch (e) {
    // Network error - if queueable, try to queue
    const isNetworkError =
      e instanceof Error && (e.message.includes('fetch') || e.message.includes('network'))
    if (!options?.skipQueue && isQueueableCommand(cmd) && isNetworkError) {
      const store = useOfflineQueueStore.getState()
      store.queueAction(cmd, args || {})
      showQueuedToast(store.queue.length + 1, true)
      useConnectionStore.getState().setStatus('disconnected')
      return undefined as T
    }
    throw e
  }
}

/**
 * Sync queued actions when back online
 * Called automatically when connection is restored
 */
export async function syncQueuedActions(): Promise<{
  synced: number
  failed: number
}> {
  const store = useOfflineQueueStore.getState()
  const queue = [...store.queue]

  if (queue.length === 0) {
    return { synced: 0, failed: 0 }
  }

  // Clean up old actions first
  cleanupOldActions()

  store.setSyncStatus('syncing')
  console.log(`Syncing ${queue.length} queued actions...`)

  let synced = 0
  let failed = 0

  for (const action of queue) {
    try {
      // Execute the action with skipQueue to avoid re-queueing
      await invoke(action.cmd, action.args, { skipQueue: true })
      store.removeAction(action.id)
      synced++
      console.log(`Synced action: ${action.cmd} (${action.id})`)
    } catch (error) {
      console.error(`Failed to sync action ${action.cmd}:`, error)
      store.markActionFailed(action, error instanceof Error ? error.message : 'Unknown error')
      failed++
    }
  }

  store.setSyncStatus(failed > 0 ? 'error' : 'idle')
  console.log(`Sync complete: ${synced} synced, ${failed} failed`)

  return { synced, failed }
}

/**
 * Retry a single failed action
 */
export async function retryFailedAction(actionId: string): Promise<boolean> {
  const store = useOfflineQueueStore.getState()
  const action = store.failedActions.find((a) => a.id === actionId)

  if (!action) {
    console.warn(`Action ${actionId} not found in failed actions`)
    return false
  }

  try {
    await invoke(action.cmd, action.args, { skipQueue: true })
    // Remove from failed actions on success
    store.clearFailedActions()
    return true
  } catch (error) {
    console.error(`Retry failed for action ${action.cmd}:`, error)
    return false
  }
}
