import { useEffect } from 'react'
import { listen, UnlistenFn } from '@tauri-apps/api/event'
import { useNavigate } from 'react-router-dom'
import { toast } from '@/stores/toastStore'
import type { RalphLoopErrorPayload, RalphLoopCompletedPayload } from '@/types'
import { triggerNotificationSound } from '@/hooks/useNotificationSound'

/**
 * Hook that listens for Ralph Loop error events and shows in-app notifications
 * with action buttons for certain error types like max_iterations.
 *
 * This should be mounted at the app level to catch all Ralph loop errors.
 */
export function useRalphLoopNotifications(): void {
  const navigate = useNavigate()

  useEffect(() => {
    const unlisteners: UnlistenFn[] = []

    const setupListeners = async () => {
      try {
        // Listen for Ralph loop completion events (US-004: play sound)
        const unlistenCompleted = await listen<RalphLoopCompletedPayload>(
          'ralph:loop_completed',
          () => {
            // Play completion sound
            triggerNotificationSound('completion')
          }
        )
        unlisteners.push(unlistenCompleted)

        // Listen for Ralph loop error events
        const unlistenError = await listen<RalphLoopErrorPayload>(
          'ralph:loop_error',
          (event) => {
            const payload = event.payload

            // Play appropriate sound based on error type (US-004)
            if (payload.errorType === 'max_iterations') {
              triggerNotificationSound('max_iterations')
            } else {
              triggerNotificationSound('error')
            }

            // Handle max_iterations specifically with action buttons
            if (payload.errorType === 'max_iterations') {
              const storiesInfo =
                payload.storiesRemaining !== undefined && payload.totalStories !== undefined
                  ? `${payload.storiesRemaining} of ${payload.totalStories} stories remaining`
                  : `Iteration ${payload.iteration} reached`

              toast.withActions(
                `Max Iterations: ${payload.prdName}`,
                storiesInfo,
                'warning',
                [
                  {
                    label: 'View Session',
                    onClick: () => {
                      // Navigate to the Ralph loop dashboard
                      // The PRD name can be used to construct the route
                      navigate(`/ralph-loop?prd=${encodeURIComponent(payload.prdName)}`)
                    },
                  },
                  {
                    label: 'Dismiss',
                    onClick: () => {
                      // No-op, the toast will be dismissed by the ActionButton
                    },
                    variant: 'outline',
                  },
                ],
                0 // No auto-dismiss for action toasts
              )
            }
            // Other error types are already handled by desktop notifications
            // Only max_iterations needs the in-app action buttons
          }
        )
        unlisteners.push(unlistenError)
      } catch (error) {
        console.error('[useRalphLoopNotifications] Failed to setup listeners:', error)
      }
    }

    setupListeners()

    return () => {
      unlisteners.forEach((unlisten) => unlisten())
    }
  }, [navigate])
}
