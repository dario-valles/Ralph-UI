// Connection state management for mobile resilience (US-1)
// Tracks WebSocket connection status for UI feedback

import { create } from 'zustand'

/** Connection status states */
export type ConnectionStatus =
  | 'connected'
  | 'connecting'
  | 'reconnecting'
  | 'disconnected'
  | 'offline'

/** Connection error types */
export type ConnectionErrorType = 'network' | 'auth' | 'server' | 'timeout' | 'unknown'

interface ConnectionState {
  /** Current connection status */
  status: ConnectionStatus
  /** Number of reconnection attempts */
  reconnectAttempts: number
  /** Maximum reconnection attempts before giving up */
  maxReconnectAttempts: number
  /** Time when reconnection started (for UI countdown) */
  reconnectStartTime: number | null
  /** Last successful connection time */
  lastConnectedTime: number | null
  /** Last error message if any */
  lastError: string | null
  /** Last error type */
  lastErrorType: ConnectionErrorType | null
  /** Whether the browser/device is online */
  isOnline: boolean
}

interface ConnectionActions {
  /** Update connection status */
  setStatus: (status: ConnectionStatus) => void
  /** Update reconnection attempts */
  setReconnectAttempts: (attempts: number) => void
  /** Increment reconnection attempts */
  incrementReconnectAttempts: () => void
  /** Start reconnection timer */
  startReconnecting: () => void
  /** Mark as connected */
  markConnected: () => void
  /** Mark as disconnected with error */
  markDisconnected: (error?: string, errorType?: ConnectionErrorType) => void
  /** Update online status */
  setOnline: (online: boolean) => void
  /** Reset reconnection state */
  resetReconnection: () => void
}

type ConnectionStore = ConnectionState & ConnectionActions

// Configuration for reconnection
export const RECONNECTION_CONFIG = {
  /** Maximum duration to keep reconnecting (5 minutes) */
  maxReconnectDurationMs: 5 * 60 * 1000,
  /** Base delay for exponential backoff */
  baseDelayMs: 1000,
  /** Maximum delay between reconnection attempts */
  maxDelayMs: 30000,
  /** Jitter factor (0-1) to add randomness */
  jitterFactor: 0.3,
} as const

export const useConnectionStore = create<ConnectionStore>((set) => ({
  // Initial state
  status: 'disconnected',
  reconnectAttempts: 0,
  maxReconnectAttempts: 100, // High number, we use duration-based limiting
  reconnectStartTime: null,
  lastConnectedTime: null,
  lastError: null,
  lastErrorType: null,
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,

  // Actions
  setStatus: (status) => set({ status }),

  setReconnectAttempts: (attempts) => set({ reconnectAttempts: attempts }),

  incrementReconnectAttempts: () =>
    set((state) => ({ reconnectAttempts: state.reconnectAttempts + 1 })),

  startReconnecting: () =>
    set({
      status: 'reconnecting',
      reconnectStartTime: Date.now(),
      reconnectAttempts: 0,
    }),

  markConnected: () =>
    set({
      status: 'connected',
      reconnectAttempts: 0,
      reconnectStartTime: null,
      lastConnectedTime: Date.now(),
      lastError: null,
      lastErrorType: null,
    }),

  markDisconnected: (error, errorType) =>
    set({
      status: 'disconnected',
      lastError: error || null,
      lastErrorType: errorType || null,
    }),

  setOnline: (online) =>
    set((state) => ({
      isOnline: online,
      // If we go offline, update status
      status: online ? state.status : 'offline',
    })),

  resetReconnection: () =>
    set({
      reconnectAttempts: 0,
      reconnectStartTime: null,
      lastError: null,
      lastErrorType: null,
    }),
}))

/**
 * Calculate reconnection delay with exponential backoff and jitter
 * @param attempt - Current attempt number (0-indexed)
 * @returns Delay in milliseconds
 */
export function calculateReconnectDelay(attempt: number): number {
  const { baseDelayMs, maxDelayMs, jitterFactor } = RECONNECTION_CONFIG

  // Exponential backoff: base * 2^attempt
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt)

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, maxDelayMs)

  // Add jitter: delay * (1 - jitter/2 + random * jitter)
  const jitter = (Math.random() - 0.5) * jitterFactor * 2
  const finalDelay = cappedDelay * (1 + jitter)

  return Math.round(finalDelay)
}

/**
 * Check if we should continue reconnecting based on duration
 * @param startTime - When reconnection started
 * @returns true if we should continue trying
 */
export function shouldContinueReconnecting(startTime: number | null): boolean {
  if (!startTime) return true

  const elapsed = Date.now() - startTime
  return elapsed < RECONNECTION_CONFIG.maxReconnectDurationMs
}

/**
 * Get remaining reconnection time in seconds
 * @param startTime - When reconnection started
 * @returns Remaining seconds, or null if no limit
 */
export function getRemainingReconnectTime(startTime: number | null): number | null {
  if (!startTime) return null

  const elapsed = Date.now() - startTime
  const remaining = RECONNECTION_CONFIG.maxReconnectDurationMs - elapsed

  return Math.max(0, Math.round(remaining / 1000))
}
