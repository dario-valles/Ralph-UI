/**
 * Connection status indicator for mobile resilience (US-1.4)
 *
 * Shows subtle indicator when:
 * - Reconnecting: animated dots with attempt count
 * - Disconnected: red indicator with error info
 * - Offline: gray indicator showing device is offline
 *
 * Also shows pending offline action count when queue has items.
 * Hidden when connected with no pending actions (normal state).
 */

import { useConnectionStore, getRemainingReconnectTime } from '@/stores/connectionStore'
import { useOfflineQueueStore } from '@/stores/offlineQueueStore'
import { cn } from '@/lib/utils'
import { WifiOff, Loader2, CloudOff } from 'lucide-react'
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
  const queueLength = useOfflineQueueStore((state) => state.queue.length)
  const failedCount = useOfflineQueueStore((state) => state.failedActions.length)

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

  // Show pending queue indicator even when connected
  const hasPendingActions = queueLength > 0 || failedCount > 0
  if (status === 'connected' && hasPendingActions) {
    const tooltipText =
      failedCount > 0
        ? `${failedCount} failed, ${queueLength} pending`
        : `${queueLength} ${queueLength === 1 ? 'action' : 'actions'} pending sync`

    return (
      <Tooltip content={tooltipText} side="bottom">
        <div
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors',
            failedCount > 0
              ? 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30'
              : 'text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30',
            className
          )}
          role="status"
          aria-live="polite"
        >
          <CloudOff className="h-3.5 w-3.5" />
          {!compact && (
            <span className="hidden sm:inline">
              {failedCount > 0 ? `${failedCount} failed` : `${queueLength} pending`}
            </span>
          )}
        </div>
      </Tooltip>
    )
  }

  // Don't show anything when connected with no pending actions
  if (status === 'connected') {
    return null
  }

  // Determine display based on status
  function getStatusDisplay(): {
    icon: React.ReactNode
    text: string
    tooltip: string
    colorClass: string
    bgClass: string
  } | null {
    const spinnerIcon = <Loader2 className="h-3.5 w-3.5 animate-spin" />
    const wifiOffIcon = <WifiOff className="h-3.5 w-3.5" />
    const yellowStyles = {
      colorClass: 'text-yellow-600 dark:text-yellow-400',
      bgClass: 'bg-yellow-100 dark:bg-yellow-900/30',
    }

    switch (status) {
      case 'connecting':
        return {
          icon: spinnerIcon,
          text: 'Connecting...',
          tooltip: 'Establishing connection to server',
          ...yellowStyles,
        }

      case 'reconnecting': {
        const formatTime = (seconds: number) => {
          const mins = Math.floor(seconds / 60)
          const secs = String(seconds % 60).padStart(2, '0')
          return `${mins}:${secs}`
        }
        let text: string
        if (compact) {
          text = `${reconnectAttempts}`
        } else if (remainingTime !== null) {
          text = `Reconnecting... (${formatTime(remainingTime)})`
        } else {
          text = `Reconnecting (${reconnectAttempts})...`
        }
        const tooltipTime = remainingTime !== null ? ` - ${remainingTime}s remaining` : ''
        return {
          icon: spinnerIcon,
          text,
          tooltip: `Attempt ${reconnectAttempts}${tooltipTime}`,
          ...yellowStyles,
        }
      }

      case 'offline':
        return {
          icon: wifiOffIcon,
          text: compact ? '' : 'Offline',
          tooltip: 'Your device is offline. Will reconnect when online.',
          colorClass: 'text-gray-500 dark:text-gray-400',
          bgClass: 'bg-gray-100 dark:bg-gray-800/50',
        }

      case 'disconnected':
        return {
          icon: wifiOffIcon,
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
 * Shows only when not connected or has pending actions, with minimal footprint.
 */
export function ConnectionIndicatorCompact({ className }: { className?: string }) {
  const { status, isOnline } = useConnectionStore()
  const queueLength = useOfflineQueueStore((state) => state.queue.length)
  const failedCount = useOfflineQueueStore((state) => state.failedActions.length)

  const hasPendingActions = queueLength > 0 || failedCount > 0

  // Show pending actions indicator when connected with queue
  if (status === 'connected' && hasPendingActions) {
    const tooltip =
      failedCount > 0
        ? `${failedCount} failed, ${queueLength} pending`
        : `${queueLength} pending`
    return (
      <Tooltip content={tooltip} side="bottom">
        <div
          className={cn(
            'flex items-center justify-center',
            failedCount > 0 ? 'text-red-500' : 'text-amber-500',
            className
          )}
          role="status"
          aria-label={tooltip}
        >
          <CloudOff className="h-3 w-3" />
        </div>
      </Tooltip>
    )
  }

  // Don't show anything when connected with no pending actions
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
