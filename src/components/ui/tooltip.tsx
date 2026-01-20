import * as React from 'react'
import { cn } from '@/lib/utils'

// Simple tooltip component (original API)
interface SimpleTooltipProps {
  content: string
  children: React.ReactNode
  side?: 'left' | 'right' | 'top' | 'bottom'
  className?: string
}

export function SimpleTooltip({ content, children, side = 'right', className }: SimpleTooltipProps) {
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

// Compound tooltip components (Radix-style API)
interface TooltipContextValue {
  open: boolean
  setOpen: (open: boolean) => void
}

const TooltipContext = React.createContext<TooltipContextValue | null>(null)

interface TooltipProps {
  children: React.ReactNode
  delayDuration?: number
}

export function Tooltip({ children, delayDuration = 200 }: TooltipProps) {
  const [open, setOpen] = React.useState(false)
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout>>()

  const handleOpen = React.useCallback(() => {
    timeoutRef.current = setTimeout(() => setOpen(true), delayDuration)
  }, [delayDuration])

  const handleClose = React.useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    setOpen(false)
  }, [])

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  return (
    <TooltipContext.Provider value={{ open, setOpen }}>
      <div
        className="relative inline-flex"
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
        onFocus={handleOpen}
        onBlur={handleClose}
      >
        {children}
      </div>
    </TooltipContext.Provider>
  )
}

interface TooltipTriggerProps {
  children: React.ReactNode
  asChild?: boolean
}

export function TooltipTrigger({ children }: TooltipTriggerProps) {
  // asChild prop is accepted for API compatibility but we just render children
  return <>{children}</>
}

interface TooltipContentProps {
  children: React.ReactNode
  side?: 'left' | 'right' | 'top' | 'bottom'
  className?: string
}

export function TooltipContent({ children, side = 'top', className }: TooltipContentProps) {
  const context = React.useContext(TooltipContext)

  if (!context?.open) {
    return null
  }

  const sideClasses = {
    left: 'right-full mr-2 top-1/2 -translate-y-1/2',
    right: 'left-full ml-2 top-1/2 -translate-y-1/2',
    top: 'bottom-full mb-2 left-1/2 -translate-x-1/2',
    bottom: 'top-full mt-2 left-1/2 -translate-x-1/2',
  }

  return (
    <div
      className={cn(
        'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95',
        sideClasses[side],
        className
      )}
    >
      {children}
    </div>
  )
}

// Provider is a no-op for API compatibility
export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
