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
        <div
          className={cn(
            'flex h-96 items-center justify-center',
            className
          )}
        >
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            {text && (
              <p className="text-sm text-muted-foreground">{text}</p>
            )}
          </div>
        </div>
      )

    case 'inline':
      return (
        <div className={cn('flex items-center gap-2', className)}>
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          {text && (
            <span className="text-sm text-muted-foreground">{text}</span>
          )}
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
            {text && (
              <p className="text-sm text-muted-foreground">{text}</p>
            )}
          </div>
        </div>
      )

    case 'skeleton':
      return (
        <div className={cn('space-y-3', className)}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 animate-pulse">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 bg-muted rounded" />
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-2/3 mb-1" />
                  <div className="h-3 bg-muted rounded w-full" />
                </div>
              </div>
              <div className="h-2 bg-muted rounded mb-2" />
              <div className="h-2 bg-muted rounded w-3/4" />
            </div>
          ))}
        </div>
      )

    case 'card':
      return (
        <div className={cn('grid gap-4 md:grid-cols-2 lg:grid-cols-3', className)}>
          {Array.from({ length: skeletonCount }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4 animate-pulse">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-8 w-8 bg-muted rounded" />
                <div className="flex-1">
                  <div className="h-4 bg-muted rounded w-2/3 mb-1" />
                  <div className="h-3 bg-muted rounded w-full" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="h-12 bg-muted rounded" />
                ))}
              </div>
              <div className="h-1.5 bg-muted rounded mb-3" />
              <div className="h-8 bg-muted rounded" />
            </div>
          ))}
        </div>
      )

    default:
      return null
  }
}
