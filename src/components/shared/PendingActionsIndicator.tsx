/**
 * Pending Actions Indicator (US-5)
 *
 * Shows the number of actions queued while offline.
 * Displayed in the title bar when there are pending actions.
 */

import { Cloud, CloudOff, Loader2, AlertCircle } from 'lucide-react'
import { useOfflineQueueStore } from '@/stores/offlineQueueStore'
import { useConnectionStore } from '@/stores/connectionStore'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/**
 * Compact indicator for the title bar
 */
export function PendingActionsIndicatorCompact() {
  const queueLength = useOfflineQueueStore((state) => state.queue.length)
  const failedCount = useOfflineQueueStore((state) => state.failedActions.length)
  const syncStatus = useOfflineQueueStore((state) => state.syncStatus)
  const connectionStatus = useConnectionStore((state) => state.status)

  const totalPending = queueLength + failedCount
  const isOffline = connectionStatus === 'offline' || connectionStatus === 'disconnected'

  // Don't show if nothing pending and online
  if (totalPending === 0 && !isOffline) {
    return null
  }

  const getIcon = () => {
    if (syncStatus === 'syncing') {
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />
    }
    if (failedCount > 0) {
      return <AlertCircle className="h-4 w-4 text-destructive" />
    }
    if (isOffline) {
      return <CloudOff className="h-4 w-4 text-muted-foreground" />
    }
    return <Cloud className="h-4 w-4 text-primary" />
  }

  const getTooltipText = () => {
    if (syncStatus === 'syncing') {
      return 'Syncing queued actions...'
    }
    if (failedCount > 0) {
      return `${failedCount} action${failedCount !== 1 ? 's' : ''} failed to sync`
    }
    if (queueLength > 0) {
      return `${queueLength} action${queueLength !== 1 ? 's' : ''} queued`
    }
    if (isOffline) {
      return 'Offline - actions will be queued'
    }
    return 'All synced'
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
              failedCount > 0
                ? 'bg-destructive/10 text-destructive'
                : isOffline
                  ? 'bg-muted text-muted-foreground'
                  : 'bg-primary/10 text-primary'
            )}
          >
            {getIcon()}
            {totalPending > 0 && (
              <span className="font-medium">{totalPending}</span>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>{getTooltipText()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Full indicator with details (for status panel or settings)
 */
export function PendingActionsIndicator() {
  const queue = useOfflineQueueStore((state) => state.queue)
  const failedActions = useOfflineQueueStore((state) => state.failedActions)
  const syncStatus = useOfflineQueueStore((state) => state.syncStatus)
  const lastSyncError = useOfflineQueueStore((state) => state.lastSyncError)
  const clearFailedActions = useOfflineQueueStore((state) => state.clearFailedActions)
  const connectionStatus = useConnectionStore((state) => state.status)

  const isOffline = connectionStatus === 'offline' || connectionStatus === 'disconnected'
  const totalPending = queue.length + failedActions.length

  if (totalPending === 0 && !isOffline && syncStatus === 'idle') {
    return null
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          {syncStatus === 'syncing' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : failedActions.length > 0 ? (
            <AlertCircle className="h-4 w-4 text-destructive" />
          ) : isOffline ? (
            <CloudOff className="h-4 w-4" />
          ) : (
            <Cloud className="h-4 w-4" />
          )}
          Pending Actions
        </h3>
        {failedActions.length > 0 && (
          <button
            onClick={clearFailedActions}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Clear failed
          </button>
        )}
      </div>

      {isOffline && queue.length === 0 && (
        <p className="text-sm text-muted-foreground">
          You're offline. Actions will be queued and synced when back online.
        </p>
      )}

      {queue.length > 0 && (
        <div className="text-sm">
          <span className="text-muted-foreground">Queued: </span>
          <span className="font-medium">{queue.length}</span>
          {syncStatus === 'syncing' && (
            <span className="text-muted-foreground ml-2">Syncing...</span>
          )}
        </div>
      )}

      {failedActions.length > 0 && (
        <div className="text-sm text-destructive">
          <span>Failed: </span>
          <span className="font-medium">{failedActions.length}</span>
          {lastSyncError && (
            <p className="text-xs mt-1 text-muted-foreground">{lastSyncError}</p>
          )}
        </div>
      )}
    </div>
  )
}
