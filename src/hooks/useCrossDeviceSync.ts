/**
 * Cross-Device Sync Hook (US-2.1, US-2.2)
 *
 * Subscribes to real-time events for cross-device synchronization.
 * When changes are made on another device (e.g., desktop), this hook
 * ensures the current device (e.g., mobile) receives the updates.
 *
 * Events handled:
 * - task:status_changed - Triggers task list refresh
 * - session:status_changed - Triggers session data refresh
 * - agent:status_changed - Triggers agent list refresh
 * - agent:completed - Triggers task completion handling
 * - agent:failed - Triggers failure handling
 * - mission_control:refresh - Full refresh trigger
 */

import { useEffect, useRef } from 'react'
import { subscribeEvent } from '@/lib/events-client'
import { invoke } from '@/lib/invoke'
import type {
  TaskStatusChangedPayload,
  SessionStatusChangedPayload,
  AgentStatusChangedPayload,
  AgentCompletedPayload,
  AgentFailedPayload,
  ToolCallStartedPayload,
  ToolCallCompletedPayload,
} from '@/types'

// Debounce time for refresh operations (ms)
const REFRESH_DEBOUNCE_MS = 500

interface CrossDeviceSyncOptions {
  /** Current session ID to filter events */
  sessionId?: string
  /** Callback when task status changes */
  onTaskChange?: (payload: TaskStatusChangedPayload) => void
  /** Callback when session status changes */
  onSessionChange?: (payload: SessionStatusChangedPayload) => void
  /** Callback when agent status changes */
  onAgentChange?: (payload: AgentStatusChangedPayload) => void
  /** Callback when agent completes */
  onAgentCompleted?: (payload: AgentCompletedPayload) => void
  /** Callback when agent fails */
  onAgentFailed?: (payload: AgentFailedPayload) => void
  /** Callback for full refresh */
  onRefresh?: () => void
}

/**
 * Hook for cross-device synchronization via WebSocket events
 *
 * @param options - Configuration options for event handling
 */
export function useCrossDeviceSync(options: CrossDeviceSyncOptions = {}) {
  const {
    sessionId,
    onTaskChange,
    onSessionChange,
    onAgentChange,
    onAgentCompleted,
    onAgentFailed,
    onRefresh,
  } = options

  // Track pending refreshes for debouncing
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced refresh function
  const debouncedRefresh = useRef((callback: () => void) => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }
    refreshTimeoutRef.current = setTimeout(() => {
      callback()
      refreshTimeoutRef.current = null
    }, REFRESH_DEBOUNCE_MS)
  })

  useEffect(() => {
    const unsubscribers: (() => void)[] = []
    let isMounted = true

    // Helper to create filtered subscription handlers
    function createHandler<T extends { sessionId?: string }>(
      eventName: string,
      callback?: (payload: T) => void
    ) {
      return (payload: T) => {
        if (!isMounted) return
        if (sessionId && payload.sessionId && payload.sessionId !== sessionId) return
        console.log(`[CrossDeviceSync] ${eventName}:`, payload)
        callback?.(payload)
      }
    }

    async function setupSubscriptions(): Promise<void> {
      const subscriptions = [
        subscribeEvent<TaskStatusChangedPayload>(
          'task:status_changed',
          createHandler('Task status changed', onTaskChange)
        ),
        subscribeEvent<SessionStatusChangedPayload>(
          'session:status_changed',
          createHandler('Session status changed', onSessionChange)
        ),
        subscribeEvent<AgentStatusChangedPayload>(
          'agent:status_changed',
          createHandler('Agent status changed', onAgentChange)
        ),
        subscribeEvent<AgentCompletedPayload>(
          'agent:completed',
          createHandler('Agent completed', onAgentCompleted)
        ),
        subscribeEvent<AgentFailedPayload>(
          'agent:failed',
          createHandler('Agent failed', onAgentFailed)
        ),
        subscribeEvent<{ sessionId?: string }>(
          'mission_control:refresh',
          (payload) => {
            if (!isMounted) return
            if (sessionId && payload.sessionId && payload.sessionId !== sessionId) return
            console.log('[CrossDeviceSync] Mission control refresh triggered')
            if (onRefresh) debouncedRefresh.current(onRefresh)
          }
        ),
      ]

      const results = await Promise.all(subscriptions)
      if (isMounted) {
        unsubscribers.push(...results)
      }
    }

    setupSubscriptions().catch((error) => {
      console.error('[CrossDeviceSync] Failed to setup subscriptions:', error)
    })

    return () => {
      isMounted = false
      unsubscribers.forEach((unsub) => unsub())
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [sessionId, onTaskChange, onSessionChange, onAgentChange, onAgentCompleted, onAgentFailed, onRefresh])
}

/**
 * Fetches the latest session data from the server
 * Useful for refreshing after receiving a sync event
 */
export async function fetchSessionData(sessionId: string) {
  try {
    const session = await invoke<unknown>('get_session', { sessionId })
    return session
  } catch (error) {
    console.error('[CrossDeviceSync] Failed to fetch session:', error)
    return null
  }
}

/**
 * Fetches the latest tasks for a session
 */
export async function fetchSessionTasks(sessionId: string) {
  try {
    const session = await invoke<{ tasks?: unknown[] }>('get_session', { sessionId })
    return session?.tasks || []
  } catch (error) {
    console.error('[CrossDeviceSync] Failed to fetch tasks:', error)
    return []
  }
}

/**
 * Fetches the latest agents for a session
 */
export async function fetchSessionAgents(sessionId: string) {
  try {
    const agents = await invoke<unknown[]>('get_agents', { sessionId })
    return agents || []
  } catch (error) {
    console.error('[CrossDeviceSync] Failed to fetch agents:', error)
    return []
  }
}

// Track if global listeners have been set up
let globalListenersInitialized = false

/**
 * Sets up global event listeners for cross-device synchronization.
 * Should be called once at app startup.
 *
 * This enables:
 * - Tool call tracking (agent tool usage display)
 * - Real-time sync events logging (for debugging)
 */
export function setupGlobalSyncListeners(): void {
  if (globalListenersInitialized) {
    console.log('[CrossDeviceSync] Global listeners already initialized')
    return
  }

  if (typeof window === 'undefined') {
    return
  }

  globalListenersInitialized = true
  console.log('[CrossDeviceSync] Setting up global event listeners')

  // Import events-client dynamically to avoid SSR issues
  import('@/lib/events-client').then(({ subscribeEvent }) => {
    // Set up tool call listeners (from toolCallStore pattern)
    import('@/stores/toolCallStore').then(({ useToolCallStore }) => {
      const store = useToolCallStore.getState()

      subscribeEvent<ToolCallStartedPayload>('tool:started', (payload) => {
        store.addToolCall(payload)
      })

      subscribeEvent<ToolCallCompletedPayload>('tool:completed', (payload) => {
        store.completeToolCall(payload)
      })

      console.log('[CrossDeviceSync] Tool call listeners registered')
    })

    // Log cross-device sync events for debugging
    subscribeEvent<TaskStatusChangedPayload>('task:status_changed', (payload) => {
      console.log('[CrossDeviceSync] Task status changed:', payload.taskId, payload.newStatus)
    })

    subscribeEvent<SessionStatusChangedPayload>('session:status_changed', (payload) => {
      console.log('[CrossDeviceSync] Session status changed:', payload.sessionId, payload.newStatus)
    })

    subscribeEvent<AgentStatusChangedPayload>('agent:status_changed', (payload) => {
      console.log('[CrossDeviceSync] Agent status changed:', payload.agentId, payload.newStatus)
    })

    subscribeEvent<AgentCompletedPayload>('agent:completed', (payload) => {
      console.log('[CrossDeviceSync] Agent completed:', payload.agentId)
    })

    subscribeEvent<AgentFailedPayload>('agent:failed', (payload) => {
      console.log('[CrossDeviceSync] Agent failed:', payload.agentId, payload.error)
    })

    console.log('[CrossDeviceSync] Global event listeners registered')
  })
}

