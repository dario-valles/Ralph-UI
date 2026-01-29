import { ChevronRight, Home } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface BreadcrumbItem {
  label: string
  href?: string
  icon?: React.ReactNode
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
  showHomeIcon?: boolean
}

/**
 * Breadcrumb navigation component for showing current context path.
 *
 * Example usage:
 * ```tsx
 * <Breadcrumb
 *   items={[
 *     { label: 'Mission Control', href: '/' },
 *     { label: 'ProjectName' },
 *     { label: 'Session: feature-auth' },
 *   ]}
 * />
 * ```
 */
export function Breadcrumb({ items, className, showHomeIcon = true }: BreadcrumbProps) {
  if (items.length === 0) return null

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex items-center text-sm text-muted-foreground', className)}
    >
      <ol className="flex items-center gap-1 flex-wrap">
        {showHomeIcon && items[0]?.href === '/' && (
          <li className="flex items-center">
            <Link
              to="/"
              className="flex items-center hover:text-foreground transition-colors p-1 -m-1 rounded focus-ring"
              aria-label="Home"
            >
              <Home className="h-4 w-4" />
            </Link>
          </li>
        )}

        {items.map((item, index) => {
          const isLast = index === items.length - 1
          const isFirst = index === 0

          // Skip home link if showHomeIcon and first item is home
          if (showHomeIcon && isFirst && item.href === '/') {
            return null
          }

          return (
            <li key={index} className="flex items-center">
              {(!isFirst || (showHomeIcon && items[0]?.href === '/')) && (
                <ChevronRight className="h-4 w-4 mx-1 flex-shrink-0" aria-hidden="true" />
              )}
              {item.href && !isLast ? (
                <Link
                  to={item.href}
                  className="flex items-center gap-1 hover:text-foreground transition-colors p-1 -m-1 rounded focus-ring truncate max-w-48"
                  title={item.label}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </Link>
              ) : (
                <span
                  className={cn(
                    'flex items-center gap-1 truncate max-w-48',
                    isLast && 'text-foreground font-medium'
                  )}
                  aria-current={isLast ? 'page' : undefined}
                  title={item.label}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
