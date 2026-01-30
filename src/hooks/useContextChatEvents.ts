// Hook for Context chat event listeners
// Handles context:chat_chunk streaming events

import { useEffect, useState, useCallback } from 'react'
import { subscribeEvent } from '@/lib/events-client'

interface ContextChatChunkPayload {
  sessionId: string
  content: string
}

interface UseContextChatEventsOptions {
  /** Current session ID to filter events */
  sessionId: string | undefined
}

interface UseContextChatEventsReturn {
  /** Accumulated streaming content from chat chunks */
  streamingContent: string
  /** Clear the streaming content buffer */
  clearStreamingContent: () => void
}

/**
 * Hook to listen for Context chat streaming events from the server backend
 *
 * Listens for:
 * - context:chat_chunk - Streaming response chunks
 *
 * @param options - Configuration options
 * @returns Object with streaming content state and clear function
 */
export function useContextChatEvents({
  sessionId,
}: UseContextChatEventsOptions): UseContextChatEventsReturn {
  const [streamingContent, setStreamingContent] = useState<string>('')

  const clearStreamingContent = useCallback(() => {
    setStreamingContent('')
  }, [])

  // Listen for context chat streaming chunk events
  useEffect(() => {
    if (!sessionId) return

    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      try {
        unlisten = await subscribeEvent<ContextChatChunkPayload>(
          'context:chat_chunk',
          (payload) => {
            if (payload.sessionId === sessionId) {
              setStreamingContent((prev) => prev + payload.content + '\n')
            }
          }
        )
      } catch (err) {
        console.warn('Failed to set up context:chat_chunk event listener:', err)
      }
    }

    setupListener()

    return () => unlisten?.()
  }, [sessionId])

  return {
    streamingContent,
    clearStreamingContent,
  }
}
