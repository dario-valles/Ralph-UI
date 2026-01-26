import { useState, useEffect } from 'react'
import { Bot, AlertTriangle, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { GridSpinner } from '@/components/shared/LoadingState'
import { ToolActivityList } from './ToolActivityCard'
import { useToolCallStore } from '@/stores/toolCallStore'
import { subscribeEvent } from '@/lib/events-client'
import type { ToolCallStartedPayload, ToolCallCompletedPayload } from '@/types'

interface StreamingIndicatorProps {
  className?: string
  /** Timestamp when streaming started (ISO string or Date) */
  startedAt?: string | Date
  /** Callback to retry the last message */
  onRetry?: () => void
  /** Callback to cancel the current operation */
  onCancel?: () => void
  /** Streaming content to display (shows real-time output instead of bouncing dots) */
  content?: string
  /** Session ID for tool call tracking */
  sessionId?: string
}

// Thresholds in seconds (5x multiplier for longer agent operations)
const WARNING_THRESHOLD = 150 // Show "taking longer" message after 2.5 min
const CONCERN_THRESHOLD = 300 // Show "may have stopped" after 5 min
const TIMEOUT_THRESHOLD = 600 // Show full error state after 10 min

type StreamingState = 'normal' | 'warning' | 'concern' | 'timeout'

export function StreamingIndicator({
  className,
  startedAt,
  onRetry,
  onCancel,
  content,
  sessionId,
}: StreamingIndicatorProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [state, setState] = useState<StreamingState>('normal')

  // Subscribe to toolCalls state reactively, then filter by sessionId
  const toolCallsMap = useToolCallStore((state) => state.toolCalls)
  const addToolCall = useToolCallStore((state) => state.addToolCall)
  const completeToolCall = useToolCallStore((state) => state.completeToolCall)
  const clearToolCalls = useToolCallStore((state) => state.clearToolCalls)
  const toolCalls = sessionId ? (toolCallsMap.get(sessionId) || []) : []

  // Subscribe to tool events when sessionId is provided
  useEffect(() => {
    if (!sessionId) return

    let unsubStart: (() => void) | undefined
    let unsubComplete: (() => void) | undefined

    const setup = async () => {
      unsubStart = await subscribeEvent<ToolCallStartedPayload>('tool:started', (payload) => {
        if (payload.agentId === sessionId) {
          addToolCall(payload)
        }
      })

      unsubComplete = await subscribeEvent<ToolCallCompletedPayload>('tool:completed', (payload) => {
        if (payload.agentId === sessionId) {
          completeToolCall(payload)
        }
      })
    }

    setup()

    return () => {
      unsubStart?.()
      unsubComplete?.()
      // Clear tool calls when streaming ends
      if (sessionId) {
        clearToolCalls(sessionId)
      }
    }
  }, [sessionId, addToolCall, completeToolCall, clearToolCalls])

  // Timer effect: calculate elapsed time and state, update every second
  useEffect(() => {
    // Helper to calculate state from elapsed time
    const calculateState = (elapsed: number): StreamingState => {
      if (elapsed >= TIMEOUT_THRESHOLD) return 'timeout'
      if (elapsed >= CONCERN_THRESHOLD) return 'concern'
      if (elapsed >= WARNING_THRESHOLD) return 'warning'
      return 'normal'
    }

    // If no startedAt, reset to initial values via requestAnimationFrame to avoid sync setState in effect
    if (!startedAt) {
      const frameId = requestAnimationFrame(() => {
        setElapsedSeconds(0)
        setState('normal')
      })
      return () => cancelAnimationFrame(frameId)
    }

    const startTime = typeof startedAt === 'string' ? new Date(startedAt) : startedAt

    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000)
      setElapsedSeconds(elapsed)
      setState(calculateState(elapsed))
    }

    // Calculate initial state via requestAnimationFrame, then start interval
    const frameId = requestAnimationFrame(() => {
      updateElapsed()
    })

    // Update every second
    const interval = setInterval(updateElapsed, 1000)

    return () => {
      cancelAnimationFrame(frameId)
      clearInterval(interval)
    }
  }, [startedAt])

  const formatElapsed = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  // Timeout state - show error with retry
  if (state === 'timeout') {
    return (
      <div
        data-testid="streaming-indicator"
        data-state="timeout"
        className={cn(
          'flex flex-col gap-2 sm:gap-3 p-3 sm:p-4 bg-destructive/10 border border-destructive/20 rounded-lg mr-2 sm:mr-4 md:mr-8',
          className
        )}
      >
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="h-5 w-5" />
          <span className="font-medium">Response taking too long</span>
        </div>
        <p className="text-sm text-muted-foreground">
          The AI agent has been processing for {formatElapsed(elapsedSeconds)}. The process may have
          stopped or encountered an issue.
        </p>
        <div className="flex gap-2">
          {onRetry && (
            <Button size="sm" variant="default" onClick={onRetry} className="gap-1">
              <RefreshCw className="h-3 w-3" />
              Retry
            </Button>
          )}
          {onCancel && (
            <Button size="sm" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Concern state - show warning with elapsed time
  if (state === 'concern') {
    return (
      <div
        data-testid="streaming-indicator"
        data-state="concern"
        className={cn(
          'flex items-start gap-2 sm:gap-3 p-3 sm:p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mr-2 sm:mr-4 md:mr-8',
          className
        )}
      >
        <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-yellow-500/20">
          <AlertTriangle className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-yellow-600 dark:text-yellow-400" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
              Still processing...
            </span>
            <span className="text-xs text-muted-foreground">{formatElapsed(elapsedSeconds)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            This is taking longer than usual. The agent may be handling a complex request.
          </p>
          {onCancel && (
            <Button size="sm" variant="ghost" onClick={onCancel} className="mt-2 h-7 text-xs">
              Cancel request
            </Button>
          )}
        </div>
      </div>
    )
  }

  // Warning state - show with elapsed time badge
  if (state === 'warning') {
    return (
      <div
        data-testid="streaming-indicator"
        data-state="warning"
        className={cn(
          'flex items-center gap-2 p-3 sm:p-4 bg-muted rounded-lg mr-2 sm:mr-4 md:mr-8 animate-pulse',
          className
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
          <Bot className="h-4 w-4" />
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span
              className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
              style={{ animationDelay: '0ms' }}
            />
            <span
              className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="h-2 w-2 rounded-full bg-muted-foreground animate-bounce"
              style={{ animationDelay: '300ms' }}
            />
          </div>
          <span className="text-xs text-muted-foreground ml-2">
            {formatElapsed(elapsedSeconds)}
          </span>
        </div>
      </div>
    )
  }

  // Normal state - show streaming content if available, otherwise bouncing dots
  const hasContent = content && content.trim().length > 0
  const hasToolCalls = toolCalls.length > 0

  return (
    <div
      data-testid="streaming-indicator"
      data-state="normal"
      className={cn(
        'flex gap-2 p-3 sm:p-4 bg-muted rounded-lg mr-2 sm:mr-4 md:mr-8',
        !hasContent && !hasToolCalls && 'items-center animate-pulse',
        (hasContent || hasToolCalls) && 'items-start',
        className
      )}
    >
      <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full bg-secondary">
        <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      </div>
      {hasContent || hasToolCalls ? (
        <div className="flex-1 min-w-0">
          {/* Tool activity cards */}
          {hasToolCalls && (
            <ToolActivityList toolCalls={toolCalls} className="mb-2" />
          )}
          {/* Streaming content */}
          {hasContent && (
            <pre className="text-xs sm:text-sm whitespace-pre-wrap break-words font-sans text-foreground leading-relaxed max-h-64 sm:max-h-96 overflow-y-auto">
              {content}
            </pre>
          )}
          <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
            <GridSpinner className="text-sm" />
            <span>{hasToolCalls ? 'Working...' : 'Streaming...'}</span>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <GridSpinner className="text-lg text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Thinking...</span>
        </div>
      )}
    </div>
  )
}
