/**
 * Connection status indicator for mobile resilience (US-1.4)
 *
 * Shows subtle indicator when:
 * - Reconnecting: animated dots with attempt count
 * - Disconnected: red indicator with error info
 * - Offline: gray indicator showing device is offline
 *
 * Hidden when connected (normal state).
 */

import { useConnectionStore, getRemainingReconnectTime } from '@/stores/connectionStore'
import { cn } from '@/lib/utils'
import { WifiOff, Loader2 } from 'lucide-react'
import { Tooltip } from '@/components/ui/tooltip'
import { useEffect, useState } from 'react'

interface ConnectionIndicatorProps {
  /** Additional CSS classes */
  className?: string
  /** Whether to show in compact mode (icon only) */
  compact?: boolean
}

export function ConnectionIndicator({ className, compact = false }: ConnectionIndicatorProps) {
  const { status, reconnectAttempts, reconnectStartTime, lastError } = useConnectionStore()

  // Track remaining time with a counter that forces re-render
  const [updateCounter, setUpdateCounter] = useState(0)

  // Update counter every second when reconnecting to trigger re-render
  useEffect(() => {
    if (status !== 'reconnecting' || !reconnectStartTime) {
      return
    }

    const interval = setInterval(() => {
      setUpdateCounter((c) => c + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [status, reconnectStartTime])

  // Calculate remaining time on each render (when reconnecting)
  const remainingTime =
    status === 'reconnecting' && reconnectStartTime
      ? getRemainingReconnectTime(reconnectStartTime)
      : null

  // Silence unused variable warning - counter is used to trigger re-renders
  void updateCounter

  // Don't show anything when connected
  if (status === 'connected') {
    return null
  }

  // Determine display based on status
  const getStatusDisplay = () => {
    switch (status) {
      case 'connecting':
        return {
          icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
          text: 'Connecting...',
          tooltip: 'Establishing connection to server',
          colorClass: 'text-yellow-600 dark:text-yellow-400',
          bgClass: 'bg-yellow-100 dark:bg-yellow-900/30',
        }

      case 'reconnecting':
        return {
          icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
          text: compact
            ? `${reconnectAttempts}`
            : remainingTime !== null
              ? `Reconnecting... (${Math.floor(remainingTime / 60)}:${String(remainingTime % 60).padStart(2, '0')})`
              : `Reconnecting (${reconnectAttempts})...`,
          tooltip: `Attempt ${reconnectAttempts}${remainingTime !== null ? ` - ${remainingTime}s remaining` : ''}`,
          colorClass: 'text-yellow-600 dark:text-yellow-400',
          bgClass: 'bg-yellow-100 dark:bg-yellow-900/30',
        }

      case 'offline':
        return {
          icon: <WifiOff className="h-3.5 w-3.5" />,
          text: compact ? '' : 'Offline',
          tooltip: 'Your device is offline. Will reconnect when online.',
          colorClass: 'text-gray-500 dark:text-gray-400',
          bgClass: 'bg-gray-100 dark:bg-gray-800/50',
        }

      case 'disconnected':
        return {
          icon: <WifiOff className="h-3.5 w-3.5" />,
          text: compact ? '' : 'Disconnected',
          tooltip: lastError || 'Connection lost. Click to retry.',
          colorClass: 'text-red-600 dark:text-red-400',
          bgClass: 'bg-red-100 dark:bg-red-900/30',
        }

      default:
        return null
    }
  }

  const display = getStatusDisplay()
  if (!display) return null

  return (
    <Tooltip content={display.tooltip} side="bottom">
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors',
          display.colorClass,
          display.bgClass,
          className
        )}
        role="status"
        aria-live="polite"
      >
        {display.icon}
        {display.text && <span className="hidden sm:inline">{display.text}</span>}
      </div>
    </Tooltip>
  )
}

/**
 * Compact connection indicator for tight spaces (e.g., title bar)
 * Shows only when not connected, with minimal footprint.
 */
export function ConnectionIndicatorCompact({ className }: { className?: string }) {
  const { status, isOnline } = useConnectionStore()

  // Don't show anything when connected
  if (status === 'connected') {
    return null
  }

  const getIndicator = () => {
    if (!isOnline || status === 'offline') {
      return {
        icon: <WifiOff className="h-3 w-3" />,
        color: 'text-gray-500',
        tooltip: 'Offline',
      }
    }

    if (status === 'reconnecting' || status === 'connecting') {
      return {
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
        color: 'text-yellow-600 dark:text-yellow-400',
        tooltip: 'Reconnecting...',
      }
    }

    if (status === 'disconnected') {
      return {
        icon: <WifiOff className="h-3 w-3" />,
        color: 'text-red-500',
        tooltip: 'Disconnected',
      }
    }

    return null
  }

  const indicator = getIndicator()
  if (!indicator) return null

  return (
    <Tooltip content={indicator.tooltip} side="bottom">
      <div
        className={cn('flex items-center justify-center', indicator.color, className)}
        role="status"
        aria-label={indicator.tooltip}
      >
        {indicator.icon}
      </div>
    </Tooltip>
  )
}
