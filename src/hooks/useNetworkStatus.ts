/**
 * Network and visibility status hook for mobile resilience (US-2, US-5)
 *
 * Monitors:
 * - Network online/offline status via Navigator.onLine and events
 * - Page visibility via visibilitychange event
 *
 * Triggers reconnection when:
 * - Device comes back online
 * - Page returns to foreground (visible)
 *
 * Syncs offline queue when connection is restored (US-5)
 */

import { useEffect, useCallback, useRef } from 'react'
import { useConnectionStore } from '@/stores/connectionStore'
import { useOfflineQueueStore } from '@/stores/offlineQueueStore'
import { forceEventsReconnect } from '@/lib/events-client'
import { syncQueuedActions } from '@/lib/invoke'

/**
 * Hook to monitor network and visibility status
 * Automatically handles reconnection on visibility/network changes
 */
export function useNetworkStatus() {
  const { setOnline, status } = useConnectionStore()
  const queueLength = useOfflineQueueStore((state) => state.queue.length)
  const prevStatusRef = useRef(status)

  // Handle online event
  const handleOnline = useCallback(() => {
    console.log('[NetworkStatus] Device is online')
    setOnline(true)

    // If we were disconnected/reconnecting, force immediate reconnection
    if (status !== 'connected') {
      forceEventsReconnect()
    }
  }, [setOnline, status])

  // Handle offline event
  const handleOffline = useCallback(() => {
    console.log('[NetworkStatus] Device is offline')
    setOnline(false)
  }, [setOnline])

  // Handle visibility change
  const handleVisibilityChange = useCallback(() => {
    const isVisible = document.visibilityState === 'visible'
    console.log(`[NetworkStatus] Visibility changed: ${isVisible ? 'visible' : 'hidden'}`)

    if (isVisible) {
      // Check network status when becoming visible
      const isOnline = navigator.onLine
      setOnline(isOnline)

      // If online and not connected, force reconnection
      if (isOnline && status !== 'connected') {
        console.log('[NetworkStatus] App foregrounded, forcing reconnection')
        forceEventsReconnect()
      }
    }
  }, [setOnline, status])

  useEffect(() => {
    // Initialize online status
    setOnline(navigator.onLine)

    // Add event listeners
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    console.log('[NetworkStatus] Listeners registered')

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      console.log('[NetworkStatus] Listeners removed')
    }
  }, [handleOnline, handleOffline, handleVisibilityChange, setOnline])

  // Sync offline queue when connection is restored (US-5)
  useEffect(() => {
    const wasDisconnected = prevStatusRef.current !== 'connected'
    const isNowConnected = status === 'connected'
    prevStatusRef.current = status

    if (wasDisconnected && isNowConnected && queueLength > 0) {
      console.log(`[NetworkStatus] Connection restored, syncing ${queueLength} queued actions`)
      syncQueuedActions().then(({ synced, failed }) => {
        if (synced > 0) {
          console.log(`[NetworkStatus] Synced ${synced} actions`)
        }
        if (failed > 0) {
          console.warn(`[NetworkStatus] Failed to sync ${failed} actions`)
        }
      })
    }
  }, [status, queueLength])
}

/**
 * Get current network status
 */
export function getNetworkStatus() {
  return {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isVisible: typeof document !== 'undefined' ? document.visibilityState === 'visible' : true,
  }
}
