import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary:
          'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        emerald:
          'border-0 bg-gradient-to-br from-emerald-400 to-teal-500 text-white hover:from-emerald-500 hover:to-teal-600',
        success:
          'border-0 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
        warning:
          'border-0 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        info: 'border-transparent bg-blue-500 text-white hover:bg-blue-600',
      },
      size: {
        sm: 'text-[10px] px-1.5 py-0 h-5',
        default: 'text-xs px-2.5 py-0.5',
        lg: 'text-sm px-3 py-1',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
}

export { Badge }
