// Terminal key bar component for mobile - displays essential keyboard shortcuts
// Provides quick access to common terminal keys like Enter, Tab, Arrow keys, etc.
// Supports modifier keys (CTRL/ALT) with sticky/lock modes

import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Delete } from 'lucide-react'
import { cn } from '@/lib/utils'
import { writeToTerminal } from '@/lib/terminal-api'
import { useTerminalStore } from '@/stores/terminalStore'

interface KeyDefinition {
  label: string
  value: string
  icon?: React.ReactNode
  ariaLabel?: string
  isModifier?: boolean
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
  { label: 'CTRL', value: '\x00', ariaLabel: 'Control modifier', isModifier: true },
  { label: 'ALT', value: '\x1b', ariaLabel: 'Alt modifier', isModifier: true },
  { label: '^C', value: '\x03', ariaLabel: 'Interrupt (Ctrl+C)' },
]

type ModifierMode = 'inactive' | 'sticky' | 'locked'

interface ModifierState {
  ctrl: ModifierMode
  alt: ModifierMode
}

interface TerminalKeyBarProps {
  className?: string
}

export function TerminalKeyBar({ className }: TerminalKeyBarProps) {
  const { activeTerminalId } = useTerminalStore()
  const [modifierState, setModifierState] = useState<ModifierState>({
    ctrl: 'inactive',
    alt: 'inactive',
  })
  const lastClickRef = useRef<{ label: string; time: number } | null>(null)
  const stickyTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const keys = useMemo(() => DEFAULT_KEYS, [])

  // Clear sticky modifier after a non-modifier key is pressed
  const clearStickyModifier = useCallback(() => {
    setModifierState((prev) => ({
      ctrl: prev.ctrl === 'sticky' ? 'inactive' : prev.ctrl,
      alt: prev.alt === 'sticky' ? 'inactive' : prev.alt,
    }))
  }, [])

  const handleKeyPress = useCallback(
    (keyDef: KeyDefinition) => {
      if (!activeTerminalId) return

      try {
        // Provide haptic feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(10) // 10ms light haptic
        }

        if (keyDef.isModifier) {
          // Handle modifier key press
          const modifierKey = keyDef.label === 'CTRL' ? 'ctrl' : 'alt'
          const lastClick = lastClickRef.current
          const now = Date.now()

          // Check for double tap (within 300ms)
          if (lastClick && lastClick.label === keyDef.label && now - lastClick.time < 300) {
            // Double tap: toggle lock mode
            setModifierState((prev) => ({
              ...prev,
              [modifierKey]: prev[modifierKey] === 'locked' ? 'inactive' : 'locked',
            }))
            lastClickRef.current = null
            // Clear the sticky timeout if it exists
            if (stickyTimeoutRef.current) {
              clearTimeout(stickyTimeoutRef.current)
              stickyTimeoutRef.current = null
            }
          } else {
            // Single tap: activate sticky mode (if not already locked)
            setModifierState((prev) => ({
              ...prev,
              [modifierKey]: prev[modifierKey] === 'locked' ? 'inactive' : 'sticky',
            }))
            lastClickRef.current = { label: keyDef.label, time: now }

            // Set timeout to auto-clear sticky mode after 5 seconds of inactivity
            if (stickyTimeoutRef.current) {
              clearTimeout(stickyTimeoutRef.current)
            }
            stickyTimeoutRef.current = setTimeout(() => {
              setModifierState((prev) => ({
                ctrl: prev.ctrl === 'sticky' ? 'inactive' : prev.ctrl,
                alt: prev.alt === 'sticky' ? 'inactive' : prev.alt,
              }))
              stickyTimeoutRef.current = null
            }, 5000)
          }
        } else {
          // Handle regular key press
          let keyValue = keyDef.value
          let prefix = ''

          // Apply modifier combinations
          if (modifierState.ctrl !== 'inactive') {
            // For Ctrl+key combinations, send character with control bit set
            // e.g., Ctrl+C = 0x03, Ctrl+Z = 0x1A, etc.
            if (keyDef.label === '^C') {
              keyValue = '\x03' // Ctrl+C
            } else if (keyDef.value && keyDef.value.length === 1) {
              // Single character - apply Ctrl
              const charCode = keyDef.value.charCodeAt(0)
              // Ctrl modifier clears bits 5-6, making lowercase letters map to 1-26
              if (charCode >= 97 && charCode <= 122) {
                // lowercase letter: a-z -> Ctrl+a-z (1-26)
                keyValue = String.fromCharCode(charCode - 96)
              }
            }
          }

          if (modifierState.alt !== 'inactive') {
            prefix = '\x1b' // ESC prefix for Alt
          }

          // Send prefix and key
          if (prefix) {
            writeToTerminal(activeTerminalId, prefix)
          }
          writeToTerminal(activeTerminalId, keyValue)

          // Clear sticky modifiers after key press
          clearStickyModifier()

          // Clear the double-tap detection for modifiers
          lastClickRef.current = null
          if (stickyTimeoutRef.current) {
            clearTimeout(stickyTimeoutRef.current)
            stickyTimeoutRef.current = null
          }
        }
      } catch (error) {
        console.error('Failed to send key to terminal:', error)
      }
    },
    [activeTerminalId, modifierState, clearStickyModifier]
  )

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (stickyTimeoutRef.current) {
        clearTimeout(stickyTimeoutRef.current)
      }
    }
  }, [])

  if (!activeTerminalId) {
    return null
  }

  return (
    <div
      className={cn('bg-muted/80 border-t px-2 py-2 flex flex-wrap gap-1 safe-bottom', className)}
    >
      {keys.map((keyDef) => {
        const modifierKey =
          keyDef.label === 'CTRL' ? 'ctrl' : keyDef.label === 'ALT' ? 'alt' : null
        const isModifierActive = modifierKey && modifierState[modifierKey] !== 'inactive'
        const isModifierLocked = modifierKey && modifierState[modifierKey] === 'locked'

        return (
          <button
            key={keyDef.label}
            onClick={() => handleKeyPress(keyDef)}
            aria-label={keyDef.ariaLabel || keyDef.label}
            aria-pressed={isModifierActive}
            className={cn(
              'flex items-center justify-center px-2 py-1.5 text-xs font-medium',
              'bg-background rounded border transition-all duration-75',
              'hover:bg-accent hover:text-accent-foreground',
              'active:bg-accent active:scale-95',
              'touch-manipulation',
              'min-h-[32px] min-w-[40px]',
              // Modifier key styling
              keyDef.isModifier && [
                'border-border',
                isModifierActive && [
                  'bg-accent text-accent-foreground',
                  isModifierLocked && 'border-accent border-2 animate-pulse',
                ],
              ],
              // Interrupt button styling
              keyDef.label === '^C' && 'bg-destructive/10 text-destructive hover:bg-destructive/20',
              // Regular key styling
              !keyDef.isModifier &&
                keyDef.label !== '^C' && [
                  'border-border',
                  (modifierState.ctrl !== 'inactive' || modifierState.alt !== 'inactive') &&
                    'border-accent/50',
                ]
            )}
          >
            {keyDef.icon ? (
              <span className="flex items-center justify-center">{keyDef.icon}</span>
            ) : (
              keyDef.label
            )}
          </button>
        )
      })}
    </div>
  )
}
