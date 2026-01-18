/**
 * Shared loading indicator components
 */

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LoadingProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
}

/**
 * Full page centered loading spinner
 */
export function PageLoader({ className, size = 'lg' }: LoadingProps) {
  return (
    <div className={cn('flex items-center justify-center min-h-[400px]', className)}>
      <Loader2 className={cn('animate-spin text-muted-foreground', sizeClasses[size])} />
    </div>
  )
}

/**
 * Inline loading spinner with optional text
 */
interface InlineLoaderProps extends LoadingProps {
  text?: string
}

export function InlineLoader({ className, size = 'sm', text }: InlineLoaderProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Loader2 className={cn('animate-spin', sizeClasses[size])} />
      {text && <span className="text-sm text-muted-foreground">{text}</span>}
    </span>
  )
}

/**
 * Overlay loading spinner for blocking operations
 */
interface OverlayLoaderProps extends LoadingProps {
  text?: string
}

export function OverlayLoader({ className, size = 'lg', text }: OverlayLoaderProps) {
  return (
    <div
      className={cn(
        'absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-50',
        className
      )}
    >
      <Loader2 className={cn('animate-spin text-primary', sizeClasses[size])} />
      {text && <p className="mt-2 text-sm text-muted-foreground">{text}</p>}
    </div>
  )
}

/**
 * Button loading state helper
 */
export function ButtonLoader({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />
}
