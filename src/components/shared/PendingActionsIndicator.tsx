/**
 * Pending Actions Indicator (US-5)
 *
 * Shows the number of actions queued while offline.
 * Displayed in the title bar when there are pending actions.
 * Includes retry functionality for failed actions.
 */

import type { ReactNode } from 'react'
import { useState } from 'react'
import { Cloud, CloudOff, Loader2, AlertCircle, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useOfflineQueueStore, type QueuedAction } from '@/stores/offlineQueueStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { retryFailedAction, syncQueuedActions } from '@/lib/invoke'
import { Tooltip } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Pluralize "action" based on count */
function pluralizeAction(count: number): string {
  return count === 1 ? 'action' : 'actions'
}

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

  function getIcon(): ReactNode {
    if (syncStatus === 'syncing') return <Loader2 className="h-4 w-4 animate-spin text-primary" />
    if (failedCount > 0) return <AlertCircle className="h-4 w-4 text-destructive" />
    if (isOffline) return <CloudOff className="h-4 w-4 text-muted-foreground" />
    return <Cloud className="h-4 w-4 text-primary" />
  }

  function getTooltipText(): string {
    if (syncStatus === 'syncing') return 'Syncing queued actions...'
    if (failedCount > 0) return `${failedCount} ${pluralizeAction(failedCount)} failed to sync`
    if (queueLength > 0) return `${queueLength} ${pluralizeAction(queueLength)} queued`
    if (isOffline) return 'Offline - actions will be queued'
    return 'All synced'
  }

  function getContainerClass(): string {
    if (failedCount > 0) return 'bg-destructive/10 text-destructive'
    if (isOffline) return 'bg-muted text-muted-foreground'
    return 'bg-primary/10 text-primary'
  }

  return (
    <Tooltip content={getTooltipText()} side="bottom">
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs cursor-default',
          getContainerClass()
        )}
      >
        {getIcon()}
        {totalPending > 0 && <span className="font-medium">{totalPending}</span>}
      </div>
    </Tooltip>
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
  const dismissFailedAction = useOfflineQueueStore((state) => state.dismissFailedAction)
  const retryFailedActionInStore = useOfflineQueueStore((state) => state.retryFailedAction)
  const connectionStatus = useConnectionStore((state) => state.status)
  const [expanded, setExpanded] = useState(false)
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const isOffline = connectionStatus === 'offline' || connectionStatus === 'disconnected'
  const isConnected = connectionStatus === 'connected'
  const totalPending = queue.length + failedActions.length

  if (totalPending === 0 && !isOffline && syncStatus === 'idle') {
    return null
  }

  const handleRetryAll = async () => {
    // Move all failed actions back to queue
    failedActions.forEach((action) => {
      retryFailedActionInStore(action.id)
    })
    // Trigger sync
    await syncQueuedActions()
  }

  const handleRetryOne = async (action: QueuedAction) => {
    setRetryingId(action.id)
    try {
      await retryFailedAction(action.id)
    } finally {
      setRetryingId(null)
    }
  }

  function handleDismissOne(actionId: string): void {
    dismissFailedAction(actionId)
  }

  const formatCommand = (cmd: string): string => {
    // Convert snake_case to readable format
    return cmd
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase())
  }

  const formatTime = (timestamp: number): string => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString()
  }

  function getHeaderIcon(): ReactNode {
    if (syncStatus === 'syncing') return <Loader2 className="h-4 w-4 animate-spin" />
    if (failedActions.length > 0) return <AlertCircle className="h-4 w-4 text-destructive" />
    if (isOffline) return <CloudOff className="h-4 w-4" />
    return <Cloud className="h-4 w-4" />
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-medium flex items-center gap-2">
          {getHeaderIcon()}
          Pending Actions
        </h3>
        <div className="flex items-center gap-2">
          {failedActions.length > 0 && isConnected && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetryAll}
              disabled={syncStatus === 'syncing'}
              className="h-7 text-xs"
            >
              <RefreshCw className={cn('h-3 w-3 mr-1', syncStatus === 'syncing' && 'animate-spin')} />
              Retry All
            </Button>
          )}
          {failedActions.length > 0 && (
            <button
              onClick={clearFailedActions}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>
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
        <div className="space-y-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-sm text-destructive hover:text-destructive/80"
          >
            <span>Failed: </span>
            <span className="font-medium">{failedActions.length}</span>
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>

          {expanded && (
            <div className="space-y-2 pl-2 border-l-2 border-destructive/20">
              {failedActions.map((action) => (
                <div
                  key={action.id}
                  className="flex items-center justify-between text-xs bg-destructive/5 rounded p-2"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{formatCommand(action.cmd)}</div>
                    <div className="text-muted-foreground">
                      {formatTime(action.timestamp)} · {action.retryCount} {action.retryCount === 1 ? 'retry' : 'retries'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    {isConnected && (
                      <Tooltip content="Retry this action">
                        <button
                          onClick={() => handleRetryOne(action)}
                          disabled={retryingId === action.id}
                          className="p-1 hover:bg-muted rounded"
                        >
                          <RefreshCw
                            className={cn(
                              'h-3.5 w-3.5',
                              retryingId === action.id && 'animate-spin'
                            )}
                          />
                        </button>
                      </Tooltip>
                    )}
                    <Tooltip content="Dismiss">
                      <button
                        onClick={() => handleDismissOne(action.id)}
                        className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )}

          {lastSyncError && !expanded && (
            <p className="text-xs text-muted-foreground">{lastSyncError}</p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Floating banner for failed actions that requires attention
 * Shows at the bottom of the screen when there are failed actions
 */
export function FailedActionsBanner() {
  const failedActions = useOfflineQueueStore((state) => state.failedActions)
  const clearFailedActions = useOfflineQueueStore((state) => state.clearFailedActions)
  const retryFailedActionInStore = useOfflineQueueStore((state) => state.retryFailedAction)
  const connectionStatus = useConnectionStore((state) => state.status)
  const [isRetrying, setIsRetrying] = useState(false)

  const isConnected = connectionStatus === 'connected'

  if (failedActions.length === 0) {
    return null
  }

  const handleRetryAll = async () => {
    setIsRetrying(true)
    try {
      // Move all failed actions back to queue
      failedActions.forEach((action) => {
        retryFailedActionInStore(action.id)
      })
      // Trigger sync
      await syncQueuedActions()
    } finally {
      setIsRetrying(false)
    }
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 animate-in slide-in-from-bottom-2">
      <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 shadow-lg backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">
              {failedActions.length} {pluralizeAction(failedActions.length)} failed to sync
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isConnected ? 'You can retry or dismiss these actions' : 'Will retry when reconnected'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3">
          {isConnected && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetryAll}
              disabled={isRetrying}
              className="h-7 text-xs flex-1"
            >
              <RefreshCw className={cn('h-3 w-3 mr-1', isRetrying && 'animate-spin')} />
              Retry All
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={clearFailedActions}
            className="h-7 text-xs flex-1"
          >
            Dismiss
          </Button>
        </div>
      </div>
    </div>
  )
}
