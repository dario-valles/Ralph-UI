import { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface EmptyStateAction {
  label: string
  onClick: () => void
  icon?: ReactNode
}

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  action?: EmptyStateAction
  /** Use card wrapper (default: true) */
  card?: boolean
  /** Custom className for container */
  className?: string
  /** Use dashed border style */
  dashed?: boolean
}

/**
 * Shared empty state component for displaying when no data is available.
 * Supports optional card wrapping and action button.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  card = true,
  className,
  dashed = false,
}: EmptyStateProps) {
  const content = (
    <div className={cn(
      'flex flex-col items-center justify-center py-8 px-4 text-center',
      dashed && 'border border-dashed rounded-lg',
      className
    )}>
      <div className="text-muted-foreground mb-2">{icon}</div>
      <h3 className="font-medium mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{description}</p>
      {action && (
        <Button onClick={action.onClick} className="mt-4 gap-2">
          {action.icon}
          {action.label}
        </Button>
      )}
    </div>
  )

  if (!card) {
    return content
  }

  return (
    <Card>
      <CardContent className="p-0">
        {content}
      </CardContent>
    </Card>
  )
}

interface NoSessionStateProps {
  title?: string
  pageTitle: string
  pageDescription: string
  icon?: ReactNode
}

/**
 * Specialized empty state for pages that require a session to be selected.
 */
export function NoSessionState({
  title = 'No Session Selected',
  pageTitle,
  pageDescription,
  icon,
}: NoSessionStateProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{pageTitle}</h1>
        <p className="text-muted-foreground">{pageDescription}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          <CardDescription>
            Please select a session from the sidebar to view content
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
