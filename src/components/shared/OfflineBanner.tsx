/**
 * Offline banner component for mobile resilience (US-2.4)
 *
 * Shows a prominent banner when the device is offline.
 * Hidden when online.
 */

import { useConnectionStore } from '@/stores/connectionStore'
import { WifiOff, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { forceEventsReconnect } from '@/lib/events-client'

interface OfflineBannerProps {
  /** Additional CSS classes */
  className?: string
}

export function OfflineBanner({ className }: OfflineBannerProps) {
  const { isOnline, status } = useConnectionStore()

  // Only show when offline
  if (isOnline && status !== 'offline') {
    return null
  }

  const handleRetry = () => {
    // Check if we're actually online now
    if (navigator.onLine) {
      forceEventsReconnect()
    }
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm',
        className
      )}
      role="alert"
      aria-live="assertive"
    >
      <WifiOff className="h-4 w-4 shrink-0" />
      <span>You are offline. Changes will sync when you reconnect.</span>
      <button
        onClick={handleRetry}
        className="ml-2 flex items-center gap-1 px-2 py-1 rounded bg-gray-700 hover:bg-gray-600 transition-colors text-xs font-medium"
        aria-label="Check connection"
      >
        <RefreshCw className="h-3 w-3" />
        Retry
      </button>
    </div>
  )
}

/**
 * Floating offline indicator that appears at the bottom of the screen
 */
export function OfflineIndicator({ className }: OfflineBannerProps) {
  const { isOnline, status } = useConnectionStore()

  // Only show when offline
  if (isOnline && status !== 'offline') {
    return null
  }

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-50',
        'flex items-center gap-2 px-4 py-2 rounded-full shadow-lg',
        'bg-gray-800 text-white text-sm',
        'animate-in slide-in-from-bottom-4 fade-in duration-300',
        className
      )}
      role="status"
      aria-live="polite"
    >
      <WifiOff className="h-4 w-4" />
      <span>Offline</span>
    </div>
  )
}
