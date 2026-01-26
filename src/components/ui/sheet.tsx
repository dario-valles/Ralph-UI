import * as React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

type SheetSide = 'left' | 'right' | 'top' | 'bottom'

interface SheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

interface SheetContentProps extends React.HTMLAttributes<HTMLDivElement> {
  side?: SheetSide
  children: React.ReactNode
  onClose?: () => void
}

interface SheetHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

interface SheetTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode
}

const SheetContext = React.createContext<{
  onClose?: () => void
}>({})

const Sheet = ({ open, onOpenChange, children }: SheetProps) => {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [open])

  // Handle escape key
  React.useEffect(() => {
    if (!open) return

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange?.(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onOpenChange])

  if (!open) return null

  return (
    <SheetContext.Provider value={{ onClose: () => onOpenChange?.(false) }}>
      <div className="fixed inset-0 z-50">
        {/* Overlay */}
        <div
          className="fixed inset-0 bg-black/50 animate-in fade-in-0"
          onClick={() => onOpenChange?.(false)}
          aria-hidden="true"
        />
        {children}
      </div>
    </SheetContext.Provider>
  )
}

const slideVariants: Record<SheetSide, string> = {
  left: 'inset-y-0 left-0 h-full w-3/4 max-w-sm animate-in slide-in-from-left',
  right: 'inset-y-0 right-0 h-full w-3/4 max-w-sm animate-in slide-in-from-right',
  top: 'inset-x-0 top-0 w-full animate-in slide-in-from-top',
  bottom: 'inset-x-0 bottom-0 w-full animate-in slide-in-from-bottom',
}

const SheetContent = React.forwardRef<HTMLDivElement, SheetContentProps>(
  ({ side = 'left', className, children, onClose, ...props }, ref) => {
    const context = React.useContext(SheetContext)
    const handleClose = onClose ?? context.onClose

    return (
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cn('fixed z-50 bg-background shadow-lg border', slideVariants[side], className)}
        {...props}
      >
        {children}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 flex items-center justify-center"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    )
  }
)
SheetContent.displayName = 'SheetContent'

const SheetHeader = ({ className, ...props }: SheetHeaderProps) => (
  <div className={cn('flex flex-col space-y-2 px-4 pt-4 pb-2', className)} {...props} />
)
SheetHeader.displayName = 'SheetHeader'

const SheetTitle = React.forwardRef<HTMLHeadingElement, SheetTitleProps>(
  ({ className, ...props }, ref) => (
    <h2 ref={ref} className={cn('text-lg font-semibold text-foreground', className)} {...props} />
  )
)
SheetTitle.displayName = 'SheetTitle'

export { Sheet, SheetContent, SheetHeader, SheetTitle }
