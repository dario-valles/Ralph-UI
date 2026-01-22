/**
 * useSubagentEvents Hook
 *
 * Real-time event listener for subagent activity in Claude Code agents.
 * Tracks subagent spawning, progress, completion, and failures.
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { isTauri } from '@/lib/tauri-check'

// Event constants (must match backend)
const EVENT_SUBAGENT_SPAWNED = 'subagent:spawned'
const EVENT_SUBAGENT_PROGRESS = 'subagent:progress'
const EVENT_SUBAGENT_COMPLETED = 'subagent:completed'
const EVENT_SUBAGENT_FAILED = 'subagent:failed'

// Subagent status
export type SubagentStatus = 'running' | 'completed' | 'failed'

// Subagent node in the tree
export interface SubagentNode {
  id: string
  parentAgentId: string
  description: string
  status: SubagentStatus
  startedAt: string
  completedAt?: string
  durationSecs?: number
  error?: string
  depth: number
  subagentType?: string
  summary?: string
  children: SubagentNode[]
}

// Event payloads from backend
interface SubagentSpawnedPayload {
  subagentId: string
  parentAgentId: string
  description: string
  timestamp: string
  depth: number
  subagentType?: string
}

interface SubagentProgressPayload {
  subagentId: string
  parentAgentId: string
  message: string
  timestamp: string
}

interface SubagentCompletedPayload {
  subagentId: string
  parentAgentId: string
  durationSecs: number
  timestamp: string
  summary?: string
}

interface SubagentFailedPayload {
  subagentId: string
  parentAgentId: string
  durationSecs: number
  timestamp: string
  error: string
}

export interface UseSubagentEventsOptions {
  /** Agent ID to filter events for (only shows subagents of this agent) */
  agentId: string
  /** Callback when new activity occurs */
  onNewActivity?: () => void
  /** Whether to auto-scroll to newest activity */
  autoScroll?: boolean
  /** Maximum number of subagents to track (prevents memory issues) */
  maxSubagents?: number
}

export interface UseSubagentEventsResult {
  /** Root-level subagents (those directly spawned by the agent) */
  subagents: SubagentNode[]
  /** Flat map of all subagents by ID */
  subagentMap: Map<string, SubagentNode>
  /** Number of currently active (running) subagents */
  activeCount: number
  /** Total number of subagents */
  totalCount: number
  /** Number of new activities since last check */
  activityCount: number
  /** Reset the activity counter */
  resetActivityCount: () => void
  /** Clear all subagent data */
  clear: () => void
  /** Whether events are being listened to */
  isListening: boolean
}

export function useSubagentEvents({
  agentId,
  onNewActivity,
  maxSubagents = 1000,
}: UseSubagentEventsOptions): UseSubagentEventsResult {
  const [subagentMap, setSubagentMap] = useState<Map<string, SubagentNode>>(new Map())
  const [activityCount, setActivityCount] = useState(0)
  const [isListening, setIsListening] = useState(false)
  const unlistenersRef = useRef<UnlistenFn[]>([])

  // Helper to add or update a subagent
  const updateSubagent = useCallback(
    (id: string, updates: Partial<SubagentNode>) => {
      setSubagentMap((prev) => {
        const newMap = new Map(prev)
        const existing = newMap.get(id)

        if (existing) {
          newMap.set(id, { ...existing, ...updates })
        } else if (updates.id) {
          // New subagent - check max limit
          if (newMap.size >= maxSubagents) {
            // Remove oldest completed subagent
            let oldestId: string | null = null
            let oldestTime: string | null = null

            for (const [key, node] of newMap) {
              if (node.status !== 'running') {
                if (!oldestTime || node.startedAt < oldestTime) {
                  oldestTime = node.startedAt
                  oldestId = key
                }
              }
            }

            if (oldestId) {
              newMap.delete(oldestId)
            }
          }

          newMap.set(id, updates as SubagentNode)
        }

        return newMap
      })

      setActivityCount((c) => c + 1)
      onNewActivity?.()
    },
    [maxSubagents, onNewActivity]
  )

  // Set up event listeners
  useEffect(() => {
    if (!isTauri || !agentId) {
      return
    }

    const setupListeners = async () => {
      const unlisteners: UnlistenFn[] = []

      // Listen for spawned events
      unlisteners.push(
        await listen<SubagentSpawnedPayload>(EVENT_SUBAGENT_SPAWNED, (event) => {
          const payload = event.payload
          // Only track subagents for our agent
          if (payload.parentAgentId !== agentId) return

          updateSubagent(payload.subagentId, {
            id: payload.subagentId,
            parentAgentId: payload.parentAgentId,
            description: payload.description,
            status: 'running',
            startedAt: payload.timestamp,
            depth: payload.depth,
            subagentType: payload.subagentType,
            children: [],
          })
        })
      )

      // Listen for progress events
      unlisteners.push(
        await listen<SubagentProgressPayload>(EVENT_SUBAGENT_PROGRESS, (event) => {
          const payload = event.payload
          if (payload.parentAgentId !== agentId) return

          // Progress events update the description
          updateSubagent(payload.subagentId, {
            description: payload.message,
          })
        })
      )

      // Listen for completed events
      unlisteners.push(
        await listen<SubagentCompletedPayload>(EVENT_SUBAGENT_COMPLETED, (event) => {
          const payload = event.payload
          if (payload.parentAgentId !== agentId) return

          updateSubagent(payload.subagentId, {
            status: 'completed',
            completedAt: payload.timestamp,
            durationSecs: payload.durationSecs,
            summary: payload.summary,
          })
        })
      )

      // Listen for failed events
      unlisteners.push(
        await listen<SubagentFailedPayload>(EVENT_SUBAGENT_FAILED, (event) => {
          const payload = event.payload
          if (payload.parentAgentId !== agentId) return

          updateSubagent(payload.subagentId, {
            status: 'failed',
            completedAt: payload.timestamp,
            durationSecs: payload.durationSecs,
            error: payload.error,
          })
        })
      )

      unlistenersRef.current = unlisteners
      setIsListening(true)
    }

    setupListeners()

    return () => {
      unlistenersRef.current.forEach((unlisten) => unlisten())
      unlistenersRef.current = []
      setIsListening(false)
    }
  }, [agentId, updateSubagent])

  // Build tree structure from flat map
  const subagents = useMemo(() => {
    const rootNodes: SubagentNode[] = []

    for (const node of subagentMap.values()) {
      // Only include direct children of the agent
      if (node.depth === 1) {
        rootNodes.push(node)
      }
    }

    // Sort by start time (newest first)
    return rootNodes.sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    )
  }, [subagentMap])

  // Calculate counts
  const activeCount = useMemo(() => {
    let count = 0
    for (const node of subagentMap.values()) {
      if (node.status === 'running') count++
    }
    return count
  }, [subagentMap])

  const totalCount = subagentMap.size

  const resetActivityCount = useCallback(() => {
    setActivityCount(0)
  }, [])

  const clear = useCallback(() => {
    setSubagentMap(new Map())
    setActivityCount(0)
  }, [])

  return {
    subagents,
    subagentMap,
    activeCount,
    totalCount,
    activityCount,
    resetActivityCount,
    clear,
    isListening,
  }
}
