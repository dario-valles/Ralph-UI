import { ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FolderOpen, Search, AlertTriangle } from 'lucide-react'

export type EmptyStateVariant = 'default' | 'no-project' | 'no-results' | 'error'

interface EmptyStateAction {
  label: string
  onClick: () => void
  icon?: ReactNode
  variant?: 'default' | 'outline' | 'destructive'
}

interface EmptyStateProps {
  icon?: ReactNode
  title: string
  description: string
  action?: EmptyStateAction
  /** Use card wrapper (default: true) */
  card?: boolean
  /** Custom className for container */
  className?: string
  /** Use dashed border style */
  dashed?: boolean
  /** Preset variant for common empty states */
  variant?: EmptyStateVariant
  /** Search query for no-results variant */
  searchQuery?: string
}

/**
 * Shared empty state component for displaying when no data is available.
 * Supports optional card wrapping, action button, and preset variants.
 *
 * Variants:
 * - default: Custom icon/title/description
 * - no-project: When no project is selected
 * - no-results: When search yields nothing (shows search query)
 * - error: When fetch/action fails
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  card = true,
  className,
  dashed = false,
  variant = 'default',
  searchQuery,
}: EmptyStateProps) {
  // Get preset values based on variant
  const getVariantDefaults = () => {
    switch (variant) {
      case 'no-project':
        return {
          icon: <FolderOpen className="h-10 w-10 md:h-12 md:w-12" />,
          title: title || 'No Project Selected',
          description: description || 'Select a project to view content.',
        }
      case 'no-results':
        return {
          icon: <Search className="h-10 w-10 md:h-12 md:w-12" />,
          title: title || 'No Results Found',
          description: searchQuery
            ? `No results match "${searchQuery}". Try a different search term.`
            : description || 'No results match your search. Try a different query.',
        }
      case 'error':
        return {
          icon: <AlertTriangle className="h-10 w-10 md:h-12 md:w-12" />,
          title: title || 'Something Went Wrong',
          description: description || 'An error occurred. Please try again.',
        }
      default:
        return { icon, title, description }
    }
  }

  const defaults = getVariantDefaults()

  const content = (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-8 md:py-12 px-4 text-center',
        dashed && 'border border-dashed rounded-lg',
        className
      )}
    >
      <div
        className={cn('mb-3', variant === 'error' ? 'text-destructive' : 'text-muted-foreground')}
      >
        {defaults.icon}
      </div>
      <h3 className="font-medium mb-1 text-base md:text-lg">{defaults.title}</h3>
      <p className="text-sm text-muted-foreground max-w-sm">{defaults.description}</p>
      {action && (
        <Button
          onClick={action.onClick}
          variant={action.variant || 'default'}
          className="mt-4 gap-2 touch-target md:min-h-0"
        >
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
      <CardContent className="p-0">{content}</CardContent>
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
