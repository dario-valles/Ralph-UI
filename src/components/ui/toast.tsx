import { useEffect, useState } from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import {
  useToastStore,
  type Toast as ToastType,
  type ToastVariant,
  type ToastAction,
} from '@/stores/toastStore'
import { cn } from '@/lib/utils'

const variantStyles: Record<ToastVariant, string> = {
  default: 'bg-background border-border',
  success: 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800',
  error: 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800',
  warning: 'bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800',
}

const variantIcons: Record<ToastVariant, React.ReactNode> = {
  default: <Info className="h-5 w-5 text-muted-foreground" />,
  success: <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />,
  error: <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />,
  warning: <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />,
}

const variantTextStyles: Record<ToastVariant, string> = {
  default: 'text-foreground',
  success: 'text-green-800 dark:text-green-200',
  error: 'text-red-800 dark:text-red-200',
  warning: 'text-yellow-800 dark:text-yellow-200',
}

/** Styles for action buttons based on toast variant */
const actionButtonStyles: Record<ToastVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  success: 'bg-green-600 text-white hover:bg-green-700 dark:bg-green-500 dark:hover:bg-green-600',
  error: 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600',
  warning:
    'bg-yellow-600 text-white hover:bg-yellow-700 dark:bg-yellow-500 dark:hover:bg-yellow-600',
}

/** Outline button styles based on toast variant */
const outlineButtonStyles: Record<ToastVariant, string> = {
  default: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  success:
    'border border-green-300 text-green-700 hover:bg-green-100 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-900',
  error:
    'border border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900',
  warning:
    'border border-yellow-300 text-yellow-700 hover:bg-yellow-100 dark:border-yellow-700 dark:text-yellow-300 dark:hover:bg-yellow-900',
}

function ActionButton({
  action,
  variant,
  onDismiss,
}: {
  action: ToastAction
  variant: ToastVariant
  onDismiss: () => void
}) {
  const handleClick = () => {
    action.onClick()
    onDismiss()
  }

  const buttonStyle =
    action.variant === 'outline' ? outlineButtonStyles[variant] : actionButtonStyles[variant]

  return (
    <button
      onClick={handleClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        buttonStyle
      )}
    >
      {action.label}
    </button>
  )
}

function ToastItem({ toast }: { toast: ToastType }) {
  const { removeToast } = useToastStore()
  const [isVisible, setIsVisible] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    // Trigger enter animation
    const enterTimer = setTimeout(() => setIsVisible(true), 10)
    return () => clearTimeout(enterTimer)
  }, [])

  const handleClose = () => {
    setIsLeaving(true)
    setTimeout(() => removeToast(toast.id), 150)
  }

  return (
    <div
      className={cn(
        'pointer-events-auto relative flex w-full max-w-sm items-start gap-3 rounded-lg border p-4 shadow-lg transition-all duration-150',
        variantStyles[toast.variant],
        isVisible && !isLeaving ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      )}
      role="alert"
    >
      <div className="flex-shrink-0">{variantIcons[toast.variant]}</div>
      <div className="flex-1 space-y-2">
        <div className="space-y-1">
          <p className={cn('text-sm font-medium', variantTextStyles[toast.variant])}>
            {toast.title}
          </p>
          {toast.description && (
            <p className={cn('text-sm opacity-80', variantTextStyles[toast.variant])}>
              {toast.description}
            </p>
          )}
        </div>
        {toast.actions && toast.actions.length > 0 && (
          <div className="flex gap-2">
            {toast.actions.map((action, index) => (
              <ActionButton
                key={index}
                action={action}
                variant={toast.variant}
                onDismiss={handleClose}
              />
            ))}
          </div>
        )}
      </div>
      <button
        onClick={handleClose}
        className={cn(
          'flex-shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100',
          variantTextStyles[toast.variant]
        )}
        aria-label="Close notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function ToastContainer() {
  const { toasts } = useToastStore()

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-0 right-0 z-50 flex max-h-screen w-full flex-col gap-2 p-4 sm:max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
