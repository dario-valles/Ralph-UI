// Hook for PRD chat event listeners
// Consolidates prd:file_updated, prd:chat_chunk, and prd:md_file_detected event handling

import { useEffect, useState, useCallback, useRef } from 'react'
import { subscribeEvent } from '@/lib/events-client'
import type { MdFileDetectedPayload } from '@/types'

interface PRDFileUpdatedPayload {
  sessionId: string
  content: string
  path: string
}

interface PRDChatChunkPayload {
  sessionId: string
  content: string
}

interface UsePRDChatEventsOptions {
  /** Current session ID to filter events */
  sessionId: string | undefined
  /** Callback when plan file is updated */
  onPlanUpdated: (content: string, path: string) => void
  /** Callback when an .md file is detected (optional) */
  onMdFileDetected?: (payload: MdFileDetectedPayload) => void
  /** Callback when a PRD is auto-assigned (created in .ralph-ui/prds/) */
  onPrdAutoAssigned?: (payload: MdFileDetectedPayload, prdId: string) => void
}

interface UsePRDChatEventsReturn {
  /** Accumulated streaming content from chat chunks */
  streamingContent: string
  /** Clear the streaming content buffer */
  clearStreamingContent: () => void
  /** List of detected .md files for the current session */
  detectedMdFiles: MdFileDetectedPayload[]
  /** Clear the detected .md files list */
  clearDetectedMdFiles: () => void
  /** Mark a file as assigned (removes from unassigned list) */
  markFileAsAssigned: (filePath: string) => void
}

/**
 * Reusable hook for subscribing to server-sent events with session filtering.
 * Handles async setup, cleanup, and session ID validation.
 *
 * @param eventName - The event name to subscribe to
 * @param sessionId - Session ID to filter events (subscription skipped if undefined)
 * @param handler - Callback to handle matching events
 * @param deps - Additional dependencies for the effect
 */
function useEventSubscription<T extends { sessionId: string }>(
  eventName: string,
  sessionId: string | undefined,
  handler: (payload: T) => void,
  deps: React.DependencyList = []
): void {
  // Use ref to avoid handler in deps (prevents re-subscriptions on handler changes)
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    if (!sessionId) return

    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      try {
        unlisten = await subscribeEvent<T>(eventName, (payload) => {
          if (payload.sessionId === sessionId) {
            handlerRef.current(payload)
          }
        })
      } catch (err) {
        console.warn(`Failed to set up ${eventName} event listener:`, err)
      }
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventName, sessionId, ...deps])
}

/**
 * Hook to listen for PRD chat events from the server backend
 *
 * Listens for:
 * - prd:file_updated - Plan file changes from agent
 * - prd:chat_chunk - Streaming response chunks
 * - prd:md_file_detected - Agent created .md file outside standard PRD location
 *
 * @param options - Configuration options
 * @returns Object with streaming content state, detected files, and utility functions
 */
export function usePRDChatEvents({
  sessionId,
  onPlanUpdated,
  onMdFileDetected,
  onPrdAutoAssigned,
}: UsePRDChatEventsOptions): UsePRDChatEventsReturn {
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [detectedMdFiles, setDetectedMdFiles] = useState<MdFileDetectedPayload[]>([])
  const [assignedFilePaths, setAssignedFilePaths] = useState<Set<string>>(new Set())

  const clearStreamingContent = useCallback(() => {
    setStreamingContent('')
  }, [])

  const clearDetectedMdFiles = useCallback(() => {
    setDetectedMdFiles([])
    setAssignedFilePaths(new Set())
  }, [])

  const markFileAsAssigned = useCallback((filePath: string) => {
    setAssignedFilePaths((prev) => {
      const next = new Set(prev)
      next.add(filePath)
      return next
    })
  }, [])

  // Listen for PRD file update events
  useEventSubscription<PRDFileUpdatedPayload>('prd:file_updated', sessionId, (payload) => {
    console.debug(
      '[usePRDChatEvents] Received prd:file_updated event:',
      `sessionId=${payload.sessionId}`,
      `path=${payload.path}`,
      `contentLength=${payload.content.length}`
    )
    onPlanUpdated(payload.content, payload.path)
  })

  // Listen for PRD chat streaming chunk events
  useEventSubscription<PRDChatChunkPayload>('prd:chat_chunk', sessionId, (payload) =>
    setStreamingContent((prev) => prev + payload.content + '\n')
  )

  // Listen for .md file detection events
  useEventSubscription<MdFileDetectedPayload>('prd:md_file_detected', sessionId, (payload) => {
    console.debug(
      '[usePRDChatEvents] Received prd:md_file_detected event:',
      `sessionId=${payload.sessionId}`,
      `filePath=${payload.filePath}`,
      `relativePath=${payload.relativePath}`,
      `autoAssigned=${payload.autoAssigned}`
    )

    // If auto-assigned (created in .ralph-ui/prds/), extract prd_id and notify
    if (payload.autoAssigned) {
      // Extract filename without .md extension to build prd_id
      // e.g., ".ralph-ui/prds/visual-quality-improvements.md" -> "file:visual-quality-improvements"
      const match = payload.relativePath.match(/\.ralph-ui\/prds\/([^/]+)\.md$/)
      if (match && onPrdAutoAssigned) {
        const prdId = `file:${match[1]}`
        console.log('[usePRDChatEvents] PRD auto-assigned:', prdId)
        onPrdAutoAssigned(payload, prdId)
      }
      return // Don't add to detectedMdFiles - it's already in the correct location
    }

    // Avoid duplicates
    setDetectedMdFiles((prev) => {
      const exists = prev.some((f) => f.filePath === payload.filePath)
      if (exists) return prev
      return [...prev, payload]
    })

    // Call optional callback
    if (onMdFileDetected) {
      onMdFileDetected(payload)
    }
  })

  // Filter out assigned files for return
  const unassignedFiles = detectedMdFiles.filter((f) => !assignedFilePaths.has(f.filePath))

  return {
    streamingContent,
    clearStreamingContent,
    detectedMdFiles: unassignedFiles,
    clearDetectedMdFiles,
    markFileAsAssigned,
  }
}
