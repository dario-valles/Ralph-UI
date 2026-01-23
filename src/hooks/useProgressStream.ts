import { useState, useEffect, useCallback } from 'react'
import { subscribeEvent } from '@/lib/events-client'

/**
 * Phase of the Ralph Loop execution
 */
export type RalphPhase =
  | 'starting'
  | 'analyzing'
  | 'implementing'
  | 'testing'
  | 'committing'
  | 'evaluating'
  | 'complete'
  | 'stopped'
  | 'failed'

/**
 * Progress event payload
 */
export interface RalphProgressEvent {
  executionId: string
  prdName: string
  phase: RalphPhase
  iteration: number
  totalStories: number
  passingStories: number
  progress: number
  currentFile?: string
  message: string
  timestamp: string
}

/**
 * Iteration started event payload
 */
export interface RalphIterationStartedEvent {
  executionId: string
  prdName: string
  iteration: number
  currentStory?: string
  timestamp: string
}

/**
 * Iteration completed event payload
 */
export interface RalphIterationCompletedEvent {
  executionId: string
  prdName: string
  iteration: number
  success: boolean
  passingStories: number
  durationSecs: number
  timestamp: string
  summary?: string
}

/**
 * Loop completed event payload (when all stories pass)
 */
export interface RalphLoopCompletedEvent {
  executionId: string
  prdName: string
  totalIterations: number
  completedStories: number
  totalStories: number
  durationSecs: number
  totalCost: number
  timestamp: string
}

/**
 * Type of error that occurred in the Ralph Loop
 */
export type RalphLoopErrorType =
  | 'agent_crash'
  | 'parse_error'
  | 'git_conflict'
  | 'rate_limit'
  | 'max_iterations'
  | 'max_cost'
  | 'timeout'
  | 'unknown'

/**
 * Loop error event payload
 */
export interface RalphLoopErrorEvent {
  executionId: string
  prdName: string
  errorType: RalphLoopErrorType
  message: string
  iteration: number
  timestamp: string
  /** Number of stories remaining (for max_iterations error) */
  storiesRemaining?: number
  /** Total number of stories (for max_iterations error) */
  totalStories?: number
}

/**
 * Combined progress state
 */
export interface RalphProgressState {
  /** Current progress event */
  progress: RalphProgressEvent | null
  /** Last iteration started event */
  iterationStarted: RalphIterationStartedEvent | null
  /** Last iteration completed event */
  iterationCompleted: RalphIterationCompletedEvent | null
  /** Last loop completed event (when all stories pass) */
  loopCompleted: RalphLoopCompletedEvent | null
  /** Last loop error event */
  loopError: RalphLoopErrorEvent | null
  /** Whether we're connected to events */
  isConnected: boolean
}

/**
 * Hook to subscribe to Ralph Loop progress events from Tauri.
 *
 * @param executionId - Optional filter by execution ID
 * @param prdName - Optional filter by PRD name
 * @returns Progress state and reset function
 */
export function useProgressStream(
  executionId?: string,
  prdName?: string
): RalphProgressState & { reset: () => void } {
  const [progress, setProgress] = useState<RalphProgressEvent | null>(null)
  const [iterationStarted, setIterationStarted] = useState<RalphIterationStartedEvent | null>(null)
  const [iterationCompleted, setIterationCompleted] = useState<RalphIterationCompletedEvent | null>(null)
  const [loopCompleted, setLoopCompleted] = useState<RalphLoopCompletedEvent | null>(null)
  const [loopError, setLoopError] = useState<RalphLoopErrorEvent | null>(null)
  const [isConnected, setIsConnected] = useState(false)

  const reset = useCallback(() => {
    setProgress(null)
    setIterationStarted(null)
    setIterationCompleted(null)
    setLoopCompleted(null)
    setLoopError(null)
  }, [])

  useEffect(() => {
    const unlisteners: (() => void)[] = []

    const setupListeners = async () => {
      try {
        // Listen to progress events
        const unlistenProgress = await subscribeEvent<RalphProgressEvent>('ralph:progress', (payload) => {
          // Filter by execution ID or PRD name if specified
          if (executionId && payload.executionId !== executionId) return
          if (prdName && payload.prdName !== prdName) return
          setProgress(payload)
        })
        unlisteners.push(unlistenProgress)

        // Listen to iteration started events
        const unlistenStarted = await subscribeEvent<RalphIterationStartedEvent>(
          'ralph:iteration_started',
          (payload) => {
            if (executionId && payload.executionId !== executionId) return
            if (prdName && payload.prdName !== prdName) return
            setIterationStarted(payload)
          }
        )
        unlisteners.push(unlistenStarted)

        // Listen to iteration completed events
        const unlistenCompleted = await subscribeEvent<RalphIterationCompletedEvent>(
          'ralph:iteration_completed',
          (payload) => {
            if (executionId && payload.executionId !== executionId) return
            if (prdName && payload.prdName !== prdName) return
            setIterationCompleted(payload)
          }
        )
        unlisteners.push(unlistenCompleted)

        // Listen to loop completed events (when all stories pass)
        const unlistenLoopCompleted = await subscribeEvent<RalphLoopCompletedEvent>(
          'ralph:loop_completed',
          (payload) => {
            if (executionId && payload.executionId !== executionId) return
            if (prdName && payload.prdName !== prdName) return
            setLoopCompleted(payload)
          }
        )
        unlisteners.push(unlistenLoopCompleted)

        // Listen to loop error events
        const unlistenLoopError = await subscribeEvent<RalphLoopErrorEvent>(
          'ralph:loop_error',
          (payload) => {
            if (executionId && payload.executionId !== executionId) return
            if (prdName && payload.prdName !== prdName) return
            setLoopError(payload)
          }
        )
        unlisteners.push(unlistenLoopError)

        setIsConnected(true)
      } catch (error) {
        console.error('[useProgressStream] Failed to setup listeners:', error)
        setIsConnected(false)
      }
    }

    setupListeners()

    return () => {
      // Cleanup listeners
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [executionId, prdName])

  return {
    progress,
    iterationStarted,
    iterationCompleted,
    loopCompleted,
    loopError,
    isConnected,
    reset,
  }
}

/**
 * Get a human-readable label for a Ralph phase
 */
export function getPhaseLabel(phase: RalphPhase): string {
  switch (phase) {
    case 'starting':
      return 'Starting'
    case 'analyzing':
      return 'Analyzing'
    case 'implementing':
      return 'Implementing'
    case 'testing':
      return 'Testing'
    case 'committing':
      return 'Committing'
    case 'evaluating':
      return 'Evaluating'
    case 'complete':
      return 'Complete'
    case 'stopped':
      return 'Stopped'
    case 'failed':
      return 'Failed'
    default:
      return 'Unknown'
  }
}

/**
 * Get a status color for a Ralph phase
 */
export function getPhaseColor(phase: RalphPhase): string {
  switch (phase) {
    case 'starting':
    case 'analyzing':
      return 'text-blue-600'
    case 'implementing':
      return 'text-purple-600'
    case 'testing':
      return 'text-yellow-600'
    case 'committing':
      return 'text-cyan-600'
    case 'evaluating':
      return 'text-orange-600'
    case 'complete':
      return 'text-green-600'
    case 'stopped':
      return 'text-gray-600'
    case 'failed':
      return 'text-red-600'
    default:
      return 'text-gray-500'
  }
}

/**
 * Get a human-readable label for a Ralph error type
 */
export function getErrorTypeLabel(errorType: RalphLoopErrorType): string {
  switch (errorType) {
    case 'agent_crash':
      return 'Agent Crash'
    case 'parse_error':
      return 'Parse Error'
    case 'git_conflict':
      return 'Git Conflict'
    case 'rate_limit':
      return 'Rate Limit'
    case 'max_iterations':
      return 'Max Iterations'
    case 'max_cost':
      return 'Max Cost'
    case 'timeout':
      return 'Timeout'
    case 'unknown':
    default:
      return 'Error'
  }
}
