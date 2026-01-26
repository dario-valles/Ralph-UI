import * as React from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FullPageModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  /**
   * Additional className for the content container
   */
  contentClassName?: string
  /**
   * Show the close button in header
   * Default: true
   */
  showCloseButton?: boolean
}

/**
 * FullPageModal - A full-page modal for mobile devices
 *
 * Used for complex dialogs that need more space on mobile,
 * such as forms with many inputs or scrollable content.
 *
 * Features:
 * - Full viewport coverage with safe area insets
 * - Fixed header with title and close button
 * - Scrollable content area
 * - Fixed footer for actions
 * - Proper keyboard handling (content stays visible when keyboard appears)
 *
 * @example
 * ```tsx
 * <FullPageModal
 *   open={isOpen}
 *   onClose={() => setIsOpen(false)}
 *   title="Edit Settings"
 *   footer={
 *     <Button onClick={handleSave}>Save Changes</Button>
 *   }
 * >
 *   <form>...</form>
 * </FullPageModal>
 * ```
 */
export function FullPageModal({
  open,
  onClose,
  title,
  children,
  footer,
  contentClassName,
  showCloseButton = true,
}: FullPageModalProps) {
  // Handle escape key
  React.useEffect(() => {
    if (!open) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  // Prevent body scroll when open
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

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="full-page-modal-title"
    >
      {/* Header with safe area for notch/status bar */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pt-[calc(0.75rem+env(safe-area-inset-top))] sticky top-0 z-10">
        <h1
          id="full-page-modal-title"
          className="text-lg font-semibold leading-none tracking-tight truncate pr-2"
        >
          {title}
        </h1>
        {showCloseButton && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="min-h-11 min-w-11 -mr-2 hover:bg-muted active:scale-95 transition-all"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </Button>
        )}
      </header>

      {/* Scrollable content area */}
      <div
        className={cn(
          'flex-1 overflow-y-auto',
          contentClassName
        )}
      >
        {children}
      </div>

      {/* Fixed footer with safe area for home indicator */}
      {footer && (
        <footer className="p-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">{footer}</div>
        </footer>
      )}
    </div>
  )
}
