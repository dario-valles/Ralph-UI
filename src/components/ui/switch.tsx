import * as React from 'react'
import { cn } from '@/lib/utils'

interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  onCheckedChange?: (checked: boolean) => void
}

const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked)
    }

    return (
      <label
        className={cn(
          'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-muted',
          disabled && 'opacity-50 cursor-not-allowed',
          !disabled && 'cursor-pointer',
          className
        )}
      >
        <input
          type="checkbox"
          ref={ref}
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
          className="sr-only"
          {...props}
        />
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-background shadow-sm transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5'
          )}
        />
      </label>
    )
  }
)
Switch.displayName = 'Switch'

export { Switch }
