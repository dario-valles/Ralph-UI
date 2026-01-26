import * as React from 'react'
import { cn } from '@/lib/utils'

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

interface DialogContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

interface DialogHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

interface DialogFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

interface DialogTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode
}

interface DialogDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode
}

// Context for sharing IDs between Dialog components
interface DialogContextValue {
  titleId: string
  descriptionId: string
  setContentElement: (el: HTMLDivElement | null) => void
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

const useDialogContext = () => {
  const context = React.useContext(DialogContext)
  if (!context) {
    throw new Error('Dialog components must be used within a Dialog')
  }
  return context
}

// Generate unique IDs for ARIA attributes
const useId = () => React.useId()

const Dialog = ({ open, onOpenChange, children }: DialogProps) => {
  const titleId = useId()
  const descriptionId = useId()
  const [contentElement, setContentElement] = React.useState<HTMLDivElement | null>(null)
  const triggerRef = React.useRef<Element | null>(null)

  // Store the trigger element when dialog opens
  React.useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
      // Return focus to trigger element on close
      if (triggerRef.current instanceof HTMLElement) {
        triggerRef.current.focus()
      }
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [open])

  // Focus trap - keep focus within dialog
  React.useEffect(() => {
    if (!open || !contentElement) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onOpenChange?.(false)
        return
      }

      if (e.key !== 'Tab') return

      const focusableElements = contentElement.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      if (!firstElement) return

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus()
          e.preventDefault()
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus()
          e.preventDefault()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onOpenChange, contentElement])

  // Auto-focus first focusable element when dialog opens
  React.useEffect(() => {
    if (!open || !contentElement) return

    // Small delay to ensure content is rendered
    const timeoutId = setTimeout(() => {
      const focusableElement = contentElement.querySelector<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      focusableElement?.focus()
    }, 0)

    return () => clearTimeout(timeoutId)
  }, [open, contentElement])

  if (!open) return null

  return (
    <DialogContext.Provider value={{ titleId, descriptionId, setContentElement }}>
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="fixed inset-0 bg-black/50"
          onClick={() => onOpenChange?.(false)}
          aria-hidden="true"
        />
        <div className="relative z-50">{children}</div>
      </div>
    </DialogContext.Provider>
  )
}

const DialogContent = React.forwardRef<HTMLDivElement, DialogContentProps>(
  ({ className, children, ...props }, forwardedRef) => {
    const { titleId, descriptionId, setContentElement } = useDialogContext()

    // Merge refs using callback ref
    const handleRef = React.useCallback(
      (node: HTMLDivElement | null) => {
        // Update context state
        setContentElement(node)
        // Forward ref
        if (typeof forwardedRef === 'function') {
          forwardedRef(node)
        } else if (forwardedRef) {
          forwardedRef.current = node
        }
      },
      [setContentElement, forwardedRef]
    )

    return (
      <div
        ref={handleRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg',
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)
DialogContent.displayName = 'DialogContent'

const DialogHeader = ({ className, ...props }: DialogHeaderProps) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
)
DialogHeader.displayName = 'DialogHeader'

const DialogFooter = ({ className, ...props }: DialogFooterProps) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
)
DialogFooter.displayName = 'DialogFooter'

const DialogTitle = React.forwardRef<HTMLHeadingElement, DialogTitleProps>(
  ({ className, ...props }, ref) => {
    const { titleId } = useDialogContext()
    return (
      <h2
        ref={ref}
        id={titleId}
        className={cn('text-lg font-semibold leading-none tracking-tight', className)}
        {...props}
      />
    )
  }
)
DialogTitle.displayName = 'DialogTitle'

const DialogDescription = React.forwardRef<HTMLParagraphElement, DialogDescriptionProps>(
  ({ className, ...props }, ref) => {
    const { descriptionId } = useDialogContext()
    return (
      <p
        ref={ref}
        id={descriptionId}
        className={cn('text-sm text-muted-foreground', className)}
        {...props}
      />
    )
  }
)
DialogDescription.displayName = 'DialogDescription'

export { Dialog, DialogContent, DialogHeader, DialogFooter, DialogTitle, DialogDescription }
