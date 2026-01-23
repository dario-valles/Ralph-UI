// Hook for PRD chat event listeners
// Consolidates prd:file_updated and prd:chat_chunk event handling

import { useEffect, useState, useCallback } from 'react'
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
 * Hook to listen for PRD chat events from the Tauri backend
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

  // Listen for PRD file update events from the backend
  useEffect(() => {
    if (!sessionId) return

    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      try {
        unlisten = await subscribeEvent<PRDFileUpdatedPayload>('prd:file_updated', (payload) => {
          // Only update if the event is for the current session
          if (payload.sessionId === sessionId) {
            onPlanUpdated(payload.content, payload.path)
          }
        })
      } catch (err) {
        console.warn('Failed to set up PRD file event listener:', err)
      }
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [sessionId, onPlanUpdated])

  // Listen for PRD chat streaming chunk events
  useEffect(() => {
    if (!sessionId) return

    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      try {
        unlisten = await subscribeEvent<PRDChatChunkPayload>('prd:chat_chunk', (payload) => {
          // Only update if the event is for the current session
          if (payload.sessionId === sessionId) {
            setStreamingContent((prev) => prev + payload.content + '\n')
          }
        })
      } catch (err) {
        console.warn('Failed to set up PRD chat chunk event listener:', err)
      }
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [sessionId])

  return {
    streamingContent,
    clearStreamingContent,
  }
}
