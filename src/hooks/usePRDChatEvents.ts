import { useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'

interface PRDFileUpdateEvent {
  sessionId: string
  content: string
  path: string
}

interface PRDChatChunkEvent {
  sessionId: string
  content: string
}

/**
 * Hook to manage Tauri event listeners for PRD chat functionality.
 * Handles file update and streaming chunk events.
 */
export function usePRDChatEvents(
  currentSessionId: string | null,
  updatePlanContent: (content: string, path: string) => void
) {
  const [streamingContent, setStreamingContent] = useState<string>('')

  // Listen for PRD file update events from the backend
  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      try {
        unlisten = await listen<PRDFileUpdateEvent>(
          'prd:file_updated',
          (event) => {
            // Only update if the event is for the current session
            if (currentSessionId && event.payload.sessionId === currentSessionId) {
              updatePlanContent(event.payload.content, event.payload.path)
            }
          }
        )
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
  }, [currentSessionId, updatePlanContent])

  // Listen for PRD chat streaming chunk events
  useEffect(() => {
    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      try {
        unlisten = await listen<PRDChatChunkEvent>(
          'prd:chat_chunk',
          (event) => {
            // Only update if the event is for the current session
            if (currentSessionId && event.payload.sessionId === currentSessionId) {
              setStreamingContent((prev) => prev + event.payload.content + '\n')
            }
          }
        )
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
  }, [currentSessionId])

  // Function to clear streaming content
  const clearStreamingContent = () => setStreamingContent('')

  return {
    streamingContent,
    clearStreamingContent,
  }
}
