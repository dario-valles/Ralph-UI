// Terminal key bar component for mobile - displays essential keyboard shortcuts
// Provides quick access to common terminal keys like Enter, Tab, Arrow keys, etc.

import { useCallback, useMemo } from 'react'
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Delete } from 'lucide-react'
import { cn } from '@/lib/utils'
import { writeToTerminal } from '@/lib/terminal-api'
import { useTerminalStore } from '@/stores/terminalStore'

interface KeyDefinition {
  label: string
  value: string
  icon?: React.ReactNode
  ariaLabel?: string
}

// Default key layout for mobile terminals
const DEFAULT_KEYS: KeyDefinition[] = [
  { label: 'Tab', value: '\t', ariaLabel: 'Tab key' },
  { label: '↑', value: '\x1b[A', icon: <ArrowUp className="w-3 h-3" />, ariaLabel: 'Up arrow' },
  { label: '↓', value: '\x1b[B', icon: <ArrowDown className="w-3 h-3" />, ariaLabel: 'Down arrow' },
  { label: '←', value: '\x1b[D', icon: <ArrowLeft className="w-3 h-3" />, ariaLabel: 'Left arrow' },
  {
    label: '→',
    value: '\x1b[C',
    icon: <ArrowRight className="w-3 h-3" />,
    ariaLabel: 'Right arrow',
  },
  { label: 'Home', value: '\x1b[H', ariaLabel: 'Home key' },
  { label: 'End', value: '\x1b[F', ariaLabel: 'End key' },
  { label: 'Enter', value: '\r', ariaLabel: 'Enter key' },
  {
    label: 'Backspace',
    value: '\x7f',
    icon: <Delete className="w-3 h-3" />,
    ariaLabel: 'Backspace key',
  },
  { label: '^C', value: '\x03', ariaLabel: 'Interrupt (Ctrl+C)' },
]

interface TerminalKeyBarProps {
  className?: string
}

export function TerminalKeyBar({ className }: TerminalKeyBarProps) {
  const { activeTerminalId } = useTerminalStore()

  const keys = useMemo(() => DEFAULT_KEYS, [])

  const handleKeyPress = useCallback(
    (keyDef: KeyDefinition) => {
      if (!activeTerminalId) return

      try {
        // Provide haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(10) // 10ms light haptic
        }

        // Send the key value to the terminal
        writeToTerminal(activeTerminalId, keyDef.value)
      } catch (error) {
        console.error('Failed to send key to terminal:', error)
      }
    },
    [activeTerminalId]
  )

  if (!activeTerminalId) {
    return null
  }

  return (
    <div
      className={cn('bg-muted/80 border-t px-2 py-2 flex flex-wrap gap-1 safe-bottom', className)}
    >
      {keys.map((keyDef) => (
        <button
          key={keyDef.label}
          onClick={() => handleKeyPress(keyDef)}
          aria-label={keyDef.ariaLabel || keyDef.label}
          className={cn(
            'flex items-center justify-center px-2 py-1.5 text-xs font-medium',
            'bg-background rounded border border-border',
            'hover:bg-accent hover:text-accent-foreground',
            'active:bg-accent active:scale-95',
            'transition-all duration-75',
            'touch-manipulation',
            'min-h-[32px] min-w-[40px]',
            keyDef.label === '^C' && 'bg-destructive/10 text-destructive hover:bg-destructive/20'
          )}
        >
          {keyDef.icon ? (
            <span className="flex items-center justify-center">{keyDef.icon}</span>
          ) : (
            keyDef.label
          )}
        </button>
      ))}
    </div>
  )
}
