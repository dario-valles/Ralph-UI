// Hook for PRD chat event listeners
// Consolidates prd:file_updated and prd:chat_chunk event handling

import { useEffect, useState, useCallback, useRef } from 'react'
import { subscribeEvent } from '@/lib/events-client'

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
}

interface UsePRDChatEventsReturn {
  /** Accumulated streaming content from chat chunks */
  streamingContent: string
  /** Clear the streaming content buffer */
  clearStreamingContent: () => void
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
 *
 * @param options - Configuration options
 * @returns Object with streaming content state and clear function
 */
export function usePRDChatEvents({
  sessionId,
  onPlanUpdated,
}: UsePRDChatEventsOptions): UsePRDChatEventsReturn {
  const [streamingContent, setStreamingContent] = useState<string>('')

  const clearStreamingContent = useCallback(() => {
    setStreamingContent('')
  }, [])

  // Listen for PRD file update events
  useEventSubscription<PRDFileUpdatedPayload>(
    'prd:file_updated',
    sessionId,
    (payload) => onPlanUpdated(payload.content, payload.path)
  )

  // Listen for PRD chat streaming chunk events
  useEventSubscription<PRDChatChunkPayload>(
    'prd:chat_chunk',
    sessionId,
    (payload) => setStreamingContent((prev) => prev + payload.content + '\n')
  )

  return {
    streamingContent,
    clearStreamingContent,
  }
}
