import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ButtonLoader } from '@/components/ui/loading'
import { StopCircle, XCircle } from 'lucide-react'

interface InterruptConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean
  /** Callback to control dialog open state */
  onOpenChange?: (open: boolean) => void
  /** Whether an interrupt operation is in progress */
  isInterrupting?: boolean
  /** Title of the dialog */
  title?: string
  /** Description text */
  description?: string
  /** Called when the user confirms the interrupt */
  onConfirm: () => void
  /** Called when the user cancels */
  onCancel: () => void
}

/**
 * Confirmation dialog for interrupting a running execution.
 *
 * Shows a warning and allows the user to:
 * - Cancel (continue running)
 * - Stop gracefully (saves progress)
 *
 * Includes hint about double-press for force quit.
 */
export function InterruptConfirmDialog({
  open,
  onOpenChange,
  isInterrupting = false,
  title = 'Stop Execution?',
  description = 'The current execution is still running. Do you want to stop it?',
  onConfirm,
  onCancel,
}: InterruptConfirmDialogProps): React.JSX.Element {
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen && !isInterrupting) {
      onCancel()
    }
    onOpenChange?.(newOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 p-2 rounded-full bg-yellow-500/10">
              <StopCircle className="h-5 w-5 text-yellow-600" />
            </div>
            <div className="flex-1">
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-2 space-y-3">
                <p>{description}</p>
                <p className="text-xs text-muted-foreground">
                  Progress will be saved. The agent will stop after completing its current
                  operation.
                </p>
                <div className="rounded bg-muted/50 p-2 text-xs">
                  <span className="font-medium">Tip:</span> Press{' '}
                  <kbd className="rounded border bg-background px-1.5 py-0.5 text-xs font-mono">
                    Ctrl+C
                  </kbd>{' '}
                  twice quickly to force quit immediately (not recommended).
                </div>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onCancel} disabled={isInterrupting}>
            Continue Running
          </Button>
          <Button
            variant="default"
            className="bg-yellow-600 hover:bg-yellow-700"
            onClick={onConfirm}
            disabled={isInterrupting}
          >
            {isInterrupting && <ButtonLoader className="mr-2" />}
            <XCircle className="mr-2 h-4 w-4" />
            Stop Gracefully
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
