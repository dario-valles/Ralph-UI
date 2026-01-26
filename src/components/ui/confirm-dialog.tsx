/**
 * Confirmation dialog for destructive actions
 *
 * Replaces browser `confirm()` dialogs with a consistent UI.
 */

import { AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog'
import { Button } from './button'
import { ButtonLoader } from './loading'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'destructive' | 'default'
  loading?: boolean
  onConfirm: () => void | Promise<void>
  onCancel?: () => void
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm()
    onOpenChange(false)
  }

  const handleCancel = () => {
    onCancel?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex items-start gap-4">
            {variant === 'destructive' && (
              <div className="flex-shrink-0 p-2 rounded-full bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive" />
              </div>
            )}
            <div className="flex-1">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-2">{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading && <ButtonLoader className="mr-2" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
