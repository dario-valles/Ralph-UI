import { useState, useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type LoadingVariant = 'page' | 'inline' | 'overlay' | 'skeleton' | 'card'

interface LoadingStateProps {
  variant?: LoadingVariant
  text?: string
  skeletonCount?: number
  className?: string
}

/**
 * Grid-based spinner inspired by SpinKit.
 * Uses em-based sizing so it scales with font-size context.
 */
export function GridSpinner({ className }: { className?: string }) {
  return (
    <span className={cn('spinner-grid', className)} role="status" aria-label="Loading">
      {Array.from({ length: 9 }).map((_, i) => (
        <span key={i} className="spinner-cube" />
      ))}
    </span>
  )
}

interface LoadingIndicatorProps {
  /** Text label to show next to spinner */
  label?: string
  /** Show elapsed time since startTime */
  showElapsed?: boolean
  /** Start time for elapsed calculation (timestamp in ms or ISO string) */
  startTime?: number | string
  /** Additional className */
  className?: string
  /** Use grid spinner instead of default spinner */
  useGridSpinner?: boolean
}

/**
 * Enhanced loading indicator with optional elapsed time display.
 * Useful for long-running operations where users want feedback.
 */
export function LoadingIndicator({
  label,
  showElapsed = false,
  startTime,
  className,
  useGridSpinner = false,
}: LoadingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!showElapsed || !startTime) return

    const start = typeof startTime === 'string' ? new Date(startTime).getTime() : startTime

    // Use interval for both initial and subsequent updates to avoid lint warning
    // First tick happens immediately (0ms delay), then every 1000ms
    const updateElapsed = () => {
      setElapsed(Math.floor((Date.now() - start) / 1000))
    }

    // Run immediately
    const immediateTimeout = setTimeout(updateElapsed, 0)
    const interval = setInterval(updateElapsed, 1000)

    return () => {
      clearTimeout(immediateTimeout)
      clearInterval(interval)
    }
  }, [showElapsed, startTime])

  const formatElapsed = (s: number) => {
    if (s < 60) return `${s}s`
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins}:${String(secs).padStart(2, '0')}`
  }

  return (
    <div className={cn('flex items-center gap-2 text-muted-foreground', className)}>
      {useGridSpinner ? (
        <GridSpinner className="text-base" />
      ) : (
        <Loader2 className="h-4 w-4 animate-spin" />
      )}
      {label && <span className="text-sm">{label}</span>}
      {showElapsed && elapsed > 0 && (
        <span className="text-xs opacity-60">{formatElapsed(elapsed)}</span>
      )}
    </div>
  )
}

/**
 * Unified loading state component for consistent loading UI across the app.
 *
 * Variants:
 * - page: Full page centered spinner (default)
 * - inline: Small inline spinner with optional text
 * - overlay: Overlay spinner on top of content
 * - skeleton: Multiple skeleton placeholders
 * - card: Card-style skeleton placeholder
 */
export function LoadingState({
  variant = 'page',
  text,
  skeletonCount = 3,
  className,
}: LoadingStateProps) {
  switch (variant) {
    case 'page':
      return (
        <div className={cn('flex h-96 items-center justify-center', className)}>
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            {text && <p className="text-sm text-muted-foreground">{text}</p>}
          </div>
        </div>
      )

    case 'inline':
      return (
        <div className={cn('flex items-center gap-2', className)}>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          {text && <span className="text-sm text-muted-foreground">{text}</span>}
        </div>
      )

    case 'overlay':
      return (
        <div
          className={cn(
            'absolute inset-0 flex items-center justify-center bg-background/50 z-10',
            className
          )}
        >
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            {text && <p className="text-sm text-muted-foreground">{text}</p>}
          </div>
        </div>
      )

    case 'skeleton':
      return (
        <div className={cn('space-y-3', className)}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded animate-shimmer" />
                <div className="flex-1">
                  <div className="h-4 rounded w-2/3 mb-1 animate-shimmer" />
                  <div className="h-3 rounded w-full animate-shimmer" />
                </div>
              </div>
              <div className="h-2 rounded mb-2 animate-shimmer" />
              <div className="h-2 rounded w-3/4 animate-shimmer" />
            </div>
          ))}
        </div>
      )

    case 'card':
      return (
        <div className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-3', className)}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 rounded animate-shimmer" />
                <div className="flex-1">
                  <div className="h-4 rounded w-2/3 mb-1 animate-shimmer" />
                  <div className="h-3 rounded w-full animate-shimmer" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-12 rounded animate-shimmer" />
                ))}
              </div>
              <div className="h-1.5 rounded mb-3 animate-shimmer" />
              <div className="h-8 rounded animate-shimmer" />
            </div>
          ))}
        </div>
      )

    default:
      return null
  }
}
