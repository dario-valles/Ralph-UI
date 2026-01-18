/**
 * Shared empty state component for consistent empty state displays
 */

import { type ReactNode } from 'react'
import { type LucideIcon, Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-12 text-center', className)}>
      <div className="mb-4 rounded-full bg-muted p-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/**
 * Card variant of empty state for use within cards
 */
interface EmptyStateCardProps extends EmptyStateProps {
  bordered?: boolean
}

export function EmptyStateCard({ bordered = true, className, ...props }: EmptyStateCardProps) {
  return (
    <div
      className={cn(
        'rounded-lg',
        bordered && 'border border-dashed',
        className
      )}
    >
      <EmptyState {...props} />
    </div>
  )
}
