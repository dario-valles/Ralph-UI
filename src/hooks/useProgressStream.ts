import { useState, useEffect, useCallback } from 'react'
import { listen, UnlistenFn } from '@tauri-apps/api/event'

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
 * Combined progress state
 */
export interface RalphProgressState {
  /** Current progress event */
  progress: RalphProgressEvent | null
  /** Last iteration started event */
  iterationStarted: RalphIterationStartedEvent | null
  /** Last iteration completed event */
  iterationCompleted: RalphIterationCompletedEvent | null
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
  const [isConnected, setIsConnected] = useState(false)

  const reset = useCallback(() => {
    setProgress(null)
    setIterationStarted(null)
    setIterationCompleted(null)
  }, [])

  useEffect(() => {
    const unlisteners: UnlistenFn[] = []

    const setupListeners = async () => {
      try {
        // Listen to progress events
        const unlistenProgress = await listen<RalphProgressEvent>('ralph:progress', (event) => {
          const payload = event.payload
          // Filter by execution ID or PRD name if specified
          if (executionId && payload.executionId !== executionId) return
          if (prdName && payload.prdName !== prdName) return
          setProgress(payload)
        })
        unlisteners.push(unlistenProgress)

        // Listen to iteration started events
        const unlistenStarted = await listen<RalphIterationStartedEvent>(
          'ralph:iteration_started',
          (event) => {
            const payload = event.payload
            if (executionId && payload.executionId !== executionId) return
            if (prdName && payload.prdName !== prdName) return
            setIterationStarted(payload)
          }
        )
        unlisteners.push(unlistenStarted)

        // Listen to iteration completed events
        const unlistenCompleted = await listen<RalphIterationCompletedEvent>(
          'ralph:iteration_completed',
          (event) => {
            const payload = event.payload
            if (executionId && payload.executionId !== executionId) return
            if (prdName && payload.prdName !== prdName) return
            setIterationCompleted(payload)
          }
        )
        unlisteners.push(unlistenCompleted)

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
