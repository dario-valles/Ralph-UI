import * as React from 'react'
import { useIsDesktop } from '@/hooks/useMediaQuery'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
} from '@/components/ui/drawer'
import { FullPageModal } from '@/components/ui/full-page-modal'
import { cn } from '@/lib/utils'

interface ResponsiveModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: React.ReactNode
  footer?: React.ReactNode
  /**
   * Size of the dialog on desktop
   * - sm: max-w-sm (~384px)
   * - md: max-w-md (~448px)
   * - lg: max-w-lg (~512px)
   * - xl: max-w-xl (~576px)
   * - 2xl: max-w-2xl (~672px)
   * - 3xl: max-w-3xl (~768px)
   * - 4xl: max-w-4xl (~896px)
   */
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl'
  /**
   * Use full-page modal on mobile instead of bottom sheet.
   * Recommended for complex dialogs with many inputs or scrollable content.
   * Default: false (uses bottom sheet on mobile)
   */
  fullPageOnMobile?: boolean
  /**
   * Height of the bottom sheet on mobile (when fullPageOnMobile=false)
   * Only applies to drawer mode
   */
  drawerHeight?: string
  /**
   * Additional className for the content container
   */
  contentClassName?: string
}

const sizeClasses = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
}

/**
 * ResponsiveModal - A modal that adapts to viewport size
 *
 * On desktop (>=1024px): Centered dialog
 * On mobile (<1024px): Either bottom sheet (Drawer) or full-page modal
 *
 * @example
 * ```tsx
 * // Simple dialog that becomes bottom sheet on mobile
 * <ResponsiveModal
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Confirm Action"
 *   footer={<Button onClick={() => setOpen(false)}>Close</Button>}
 * >
 *   <p>Are you sure?</p>
 * </ResponsiveModal>
 *
 * // Complex dialog that becomes full-page on mobile
 * <ResponsiveModal
 *   open={open}
 *   onOpenChange={setOpen}
 *   title="Edit Settings"
 *   fullPageOnMobile={true}
 *   size="xl"
 * >
 *   <form>...</form>
 * </ResponsiveModal>
 * ```
 */
export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'lg',
  fullPageOnMobile = false,
  drawerHeight = 'max-h-[85vh]',
  contentClassName,
}: ResponsiveModalProps) {
  const isDesktop = useIsDesktop()

  // Desktop: Use centered Dialog
  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={cn(sizeClasses[size], contentClassName)}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="overflow-y-auto max-h-[calc(80vh-8rem)]">{children}</div>
          {footer && <DialogFooter>{footer}</DialogFooter>}
        </DialogContent>
      </Dialog>
    )
  }

  // Mobile with fullPageOnMobile: Use FullPageModal
  if (fullPageOnMobile) {
    return (
      <FullPageModal
        open={open}
        onClose={() => onOpenChange(false)}
        title={title}
        footer={footer}
      >
        {description && (
          <p className="text-sm text-muted-foreground mb-4">{description}</p>
        )}
        {children}
      </FullPageModal>
    )
  }

  // Mobile without fullPageOnMobile: Use Drawer (bottom sheet)
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className={cn(drawerHeight, contentClassName)}>
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="px-4 overflow-y-auto flex-1">{children}</div>
        {footer && <DrawerFooter className="pt-2">{footer}</DrawerFooter>}
      </DrawerContent>
    </Drawer>
  )
}
