// Offline action queue store for mobile resilience (US-5)
// Queues actions when offline and syncs them when back online

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Commands that are safe to queue when offline (write operations)
// Read-only commands should fail immediately when offline
const QUEUEABLE_COMMANDS = new Set([
  'update_task',
  'create_task',
  'delete_task',
  'update_session',
  'update_prd',
  'save_prd_chat_message',
  'update_agent_task',
])

export interface QueuedAction {
  id: string
  cmd: string
  args: Record<string, unknown>
  timestamp: number
  retryCount: number
}

export type SyncStatus = 'idle' | 'syncing' | 'error'

interface OfflineQueueStore {
  // State
  queue: QueuedAction[]
  syncStatus: SyncStatus
  lastSyncError: string | null
  failedActions: QueuedAction[]

  // Actions
  queueAction: (cmd: string, args: Record<string, unknown>) => string
  removeAction: (id: string) => void
  clearQueue: () => void
  clearFailedActions: () => void
  setSyncStatus: (status: SyncStatus, error?: string) => void
  markActionFailed: (action: QueuedAction, error: string) => void
  retryFailedAction: (id: string) => void
  getQueuedCount: () => number
}

/**
 * Check if a command is safe to queue when offline
 */
export function isQueueableCommand(cmd: string): boolean {
  return QUEUEABLE_COMMANDS.has(cmd)
}

/**
 * Generate a unique ID for queued actions
 */
function generateActionId(): string {
  return `action-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

export const useOfflineQueueStore = create<OfflineQueueStore>()(
  persist(
    (set, get) => ({
      // Initial state
      queue: [],
      syncStatus: 'idle',
      lastSyncError: null,
      failedActions: [],

      queueAction: (cmd: string, args: Record<string, unknown>) => {
        const id = generateActionId()
        const action: QueuedAction = {
          id,
          cmd,
          args,
          timestamp: Date.now(),
          retryCount: 0,
        }

        set((state) => ({
          queue: [...state.queue, action],
        }))

        console.log(`Queued offline action: ${cmd} (${id})`)
        return id
      },

      removeAction: (id: string) => {
        set((state) => ({
          queue: state.queue.filter((a) => a.id !== id),
        }))
      },

      clearQueue: () => {
        set({ queue: [] })
      },

      clearFailedActions: () => {
        set({ failedActions: [] })
      },

      setSyncStatus: (status: SyncStatus, error?: string) => {
        set({
          syncStatus: status,
          lastSyncError: error || null,
        })
      },

      markActionFailed: (action: QueuedAction, error: string) => {
        const failedAction = {
          ...action,
          retryCount: action.retryCount + 1,
        }
        set((state) => ({
          queue: state.queue.filter((a) => a.id !== action.id),
          failedActions: [...state.failedActions, failedAction],
          lastSyncError: error,
        }))
      },

      retryFailedAction: (id: string) => {
        const { failedActions } = get()
        const action = failedActions.find((a) => a.id === id)
        if (action) {
          set((state) => ({
            failedActions: state.failedActions.filter((a) => a.id !== id),
            queue: [...state.queue, { ...action, timestamp: Date.now() }],
          }))
        }
      },

      getQueuedCount: () => {
        return get().queue.length
      },
    }),
    {
      name: 'ralph-offline-queue',
      partialize: (state) => ({
        queue: state.queue,
        failedActions: state.failedActions,
      }),
    }
  )
)

// Maximum age for queued actions (1 hour)
const MAX_ACTION_AGE_MS = 60 * 60 * 1000

/**
 * Clean up old queued actions
 */
export function cleanupOldActions(): void {
  const store = useOfflineQueueStore.getState()
  const now = Date.now()

  const freshQueue = store.queue.filter((action) => now - action.timestamp < MAX_ACTION_AGE_MS)

  if (freshQueue.length !== store.queue.length) {
    console.log(`Cleaned up ${store.queue.length - freshQueue.length} old queued actions`)
    useOfflineQueueStore.setState({ queue: freshQueue })
  }
}
