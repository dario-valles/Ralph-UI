import * as React from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: string
  children: React.ReactNode
  side?: 'left' | 'right' | 'top' | 'bottom'
  className?: string
}

export function Tooltip({ content, children, side = 'right', className }: TooltipProps) {
  const sideClasses = {
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  }

  return (
    <div className={cn('group relative', className)}>
      {children}
      <div
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100',
          sideClasses[side]
        )}
      >
        {content}
      </div>
    </div>
  )
}
