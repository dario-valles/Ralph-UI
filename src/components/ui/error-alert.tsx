/**
 * Shared error alert component for consistent error display
 */

import { AlertCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ErrorAlertProps {
  message: string
  className?: string
  onDismiss?: () => void
  title?: string
}

export function ErrorAlert({ message, className, onDismiss, title = 'Error' }: ErrorAlertProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-md border border-destructive bg-destructive/10 p-4',
        className
      )}
      role="alert"
    >
      <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-destructive">{title}</p>
        <p className="text-sm text-destructive/90 mt-1">{message}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-destructive/70 hover:text-destructive flex-shrink-0"
          aria-label="Dismiss error"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
