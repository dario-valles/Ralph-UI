import { AlertCircle, AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface ErrorDisplayProps {
  /** Error message to display */
  message: string
  /** Optional title for the error */
  title?: string
  /** Variant: 'error' (destructive) or 'warning' */
  variant?: 'error' | 'warning'
  /** Display style: 'card' wraps in a Card, 'inline' for inline display */
  display?: 'card' | 'inline'
  /** Additional CSS classes */
  className?: string
}

/**
 * Shared component for displaying error and warning messages consistently across the app.
 */
export function ErrorDisplay({
  message,
  title,
  variant = 'error',
  display = 'inline',
  className,
}: ErrorDisplayProps): React.JSX.Element {
  const Icon = variant === 'warning' ? AlertTriangle : AlertCircle

  const content = (
    <div
      className={cn(
        'flex items-start gap-2 text-sm',
        variant === 'error' && 'text-destructive',
        variant === 'warning' && 'text-yellow-700 dark:text-yellow-400',
        className
      )}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1">
        {title && <p className="font-medium">{title}</p>}
        <p className={title ? 'text-xs mt-1' : ''}>{message}</p>
      </div>
    </div>
  )

  if (display === 'card') {
    return (
      <Card className={cn(variant === 'error' && 'border-destructive', className)}>
        <CardContent className="p-4">{content}</CardContent>
      </Card>
    )
  }

  return (
    <div
      className={cn(
        'p-3 rounded-md',
        variant === 'error' && 'bg-destructive/10',
        variant === 'warning' && 'bg-yellow-500/10',
        className
      )}
    >
      {content}
    </div>
  )
}
