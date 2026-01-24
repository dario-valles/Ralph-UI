import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Configuration for the interrupt handler
 */
export interface InterruptHandlerConfig {
  /** Time window (ms) for double-press detection (default: 1000) */
  doublePressDuration?: number
  /** Whether the handler is active (default: true) */
  enabled?: boolean
  /** Callback when force quit is triggered (double-press) */
  onForceQuit?: () => void | Promise<void>
  /** Callback when graceful stop is requested (single press) */
  onGracefulStop?: () => void | Promise<void>
}

/**
 * State returned by the interrupt handler hook
 */
export interface InterruptHandlerState {
  /** Whether the confirmation dialog should be shown */
  pendingInterrupt: boolean
  /** Timestamp of the last interrupt */
  lastInterruptTime: number
  /** Whether an interrupt operation is in progress */
  isInterrupting: boolean
}

/**
 * Actions returned by the interrupt handler hook
 */
export interface InterruptHandlerActions {
  /** Confirm the interrupt and trigger graceful stop */
  confirmInterrupt: () => Promise<void>
  /** Cancel the pending interrupt */
  cancelInterrupt: () => void
  /** Manually trigger an interrupt (e.g., from a button) */
  triggerInterrupt: () => void
  /** Reset the interrupt state */
  reset: () => void
}

/**
 * Hook for handling interrupt requests with double-press confirmation.
 *
 * Single Ctrl+C (or triggerInterrupt): Shows confirmation dialog
 * Double Ctrl+C (within duration): Force quit immediately
 *
 * @param config Configuration options
 * @returns State and actions for interrupt handling
 */
export function useInterruptHandler(
  config: InterruptHandlerConfig = {}
): InterruptHandlerState & InterruptHandlerActions {
  const { doublePressDuration = 1000, enabled = true, onForceQuit, onGracefulStop } = config

  const [pendingInterrupt, setPendingInterrupt] = useState(false)
  const [lastInterruptTime, setLastInterruptTime] = useState(0)
  const [isInterrupting, setIsInterrupting] = useState(false)

  // Use ref to avoid stale closures in event handlers
  const stateRef = useRef({ pendingInterrupt, lastInterruptTime })
  stateRef.current = { pendingInterrupt, lastInterruptTime }

  const handleInterrupt = useCallback(() => {
    const now = Date.now()
    const { lastInterruptTime: lastTime } = stateRef.current

    // Check for double-press
    if (now - lastTime < doublePressDuration) {
      // Double-press detected - force quit
      setIsInterrupting(true)
      setPendingInterrupt(false)
      onForceQuit?.()
      setIsInterrupting(false)
    } else {
      // First press - show confirmation
      setPendingInterrupt(true)
      setLastInterruptTime(now)
    }
  }, [doublePressDuration, onForceQuit])

  const confirmInterrupt = useCallback(async () => {
    setIsInterrupting(true)
    try {
      await onGracefulStop?.()
    } finally {
      setIsInterrupting(false)
      setPendingInterrupt(false)
    }
  }, [onGracefulStop])

  const cancelInterrupt = useCallback(() => {
    setPendingInterrupt(false)
  }, [])

  const triggerInterrupt = useCallback(() => {
    handleInterrupt()
  }, [handleInterrupt])

  const reset = useCallback(() => {
    setPendingInterrupt(false)
    setLastInterruptTime(0)
    setIsInterrupting(false)
  }, [])

  // Listen for Ctrl+C keyboard events
  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent) => {
      // Check for Ctrl+C (or Cmd+C on Mac as alternative)
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        // Only intercept if there's a selection (for copying) don't intercept
        const selection = window.getSelection()
        if (selection && selection.toString().length > 0) {
          return // Allow normal copy behavior
        }

        // Prevent default and handle interrupt
        e.preventDefault()
        e.stopPropagation()
        handleInterrupt()
      }

      // Also listen for Escape to cancel pending interrupt
      if (e.key === 'Escape' && stateRef.current.pendingInterrupt) {
        cancelInterrupt()
      }
    }

    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [enabled, handleInterrupt, cancelInterrupt])

  return {
    // State
    pendingInterrupt,
    lastInterruptTime,
    isInterrupting,
    // Actions
    confirmInterrupt,
    cancelInterrupt,
    triggerInterrupt,
    reset,
  }
}
