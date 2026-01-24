// Terminal key bar component for mobile - displays essential keyboard shortcuts
// Provides quick access to common terminal keys like Enter, Tab, Arrow keys, etc.
// Supports modifier keys (CTRL/ALT) with sticky/lock modes

import { useCallback, useMemo, useState, useRef, useEffect } from 'react'
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Delete, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { writeToTerminal } from '@/lib/terminal-api'
import { useTerminalStore } from '@/stores/terminalStore'
import { useKeyBarLayoutStore } from '@/stores/keyBarLayoutStore'
import { useIsMobile } from '@/hooks/useMediaQuery'
import { CustomCommandsSheet } from './CustomCommandsSheet'

interface KeyDefinition {
  label: string
  value: string
  icon?: React.ReactNode
  ariaLabel?: string
  isModifier?: boolean
}

// Map icon names to React components
const ICON_MAP: Record<string, React.ReactNode> = {
  ArrowUp: <ArrowUp className="w-3 h-3" />,
  ArrowDown: <ArrowDown className="w-3 h-3" />,
  ArrowLeft: <ArrowLeft className="w-3 h-3" />,
  ArrowRight: <ArrowRight className="w-3 h-3" />,
  Delete: <Delete className="w-3 h-3" />,
}

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
  const { getLayout } = useKeyBarLayoutStore()
  const isMobile = useIsMobile()
  const [modifierState, setModifierState] = useState<ModifierState>({
    ctrl: 'inactive',
    alt: 'inactive',
  })
  const [isVisible, setIsVisible] = useState(true)
  const [isCommandsSheetOpen, setIsCommandsSheetOpen] = useState(false)
  const lastClickRef = useRef<{ label: string; time: number } | null>(null)
  const stickyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Get custom layout from store and convert icon names to components
  const keys = useMemo(() => {
    const layout = getLayout()
    return layout.map((key) => ({
      ...key,
      icon: key.icon ? ICON_MAP[key.icon] : undefined,
    }))
  }, [getLayout])

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

          // Special handling for ^C: always send interrupt signal, ignore active modifiers
          if (keyDef.label === '^C') {
            keyValue = '\x03' // Always send Ctrl+C interrupt signal
          } else {
            // Apply modifier combinations for non-interrupt keys
            if (modifierState.ctrl !== 'inactive') {
              // For Ctrl+key combinations, send character with control bit set
              // e.g., Ctrl+Z = 0x1A, etc.
              if (keyDef.value && keyDef.value.length === 1) {
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

  // Detect physical keyboard activity and hide/show key bar
  useEffect(() => {
    if (!isMobile || !activeTerminalId) return

    const handlePhysicalKeyDown = (event: KeyboardEvent) => {
      // Detect physical keyboard activity:
      // Physical keyboards have a valid event.code property
      // Virtual keyboards typically don't trigger with a code or have empty code
      // Also exclude events from input/textarea elements that might trigger virtual keyboard
      const target = event.target as HTMLElement
      const isFromInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'
      const isPhysicalKeyboard = !!event.code && event.code !== ''

      if (isPhysicalKeyboard && !isFromInput) {
        setIsVisible(false)

        // Clear existing hide timeout
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current)
        }

        // Set a new timeout to check if keyboard is still active
        // If no more keyboard events within 2 seconds, assume physical keyboard is disconnected
        hideTimeoutRef.current = setTimeout(() => {
          setIsVisible(true)
        }, 2000)
      }
    }

    const handleVisibilityChange = () => {
      // Show key bar when user might need it again (focus lost/regained)
      if (document.hidden) {
        setIsVisible(true)
      }
    }

    // Listen for keyboard events (physical keyboard activity)
    window.addEventListener('keydown', handlePhysicalKeyDown)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('keydown', handlePhysicalKeyDown)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [isMobile, activeTerminalId])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (stickyTimeoutRef.current) {
        clearTimeout(stickyTimeoutRef.current)
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current)
      }
    }
  }, [])

  if (!activeTerminalId) {
    return null
  }

  return (
    <>
      <div
        className={cn(
          'bg-muted/80 border-t px-2 py-2 flex flex-wrap gap-1 safe-bottom',
          'transition-all duration-300 ease-in-out',
          !isVisible && 'opacity-0 pointer-events-none max-h-0 overflow-hidden',
          isVisible && 'opacity-100 pointer-events-auto',
          className
        )}
      >
        {keys.map((keyDef) => {
          const modifierKey =
            keyDef.label === 'CTRL' ? 'ctrl' : keyDef.label === 'ALT' ? 'alt' : null
          const isModifierActive = !!(modifierKey && modifierState[modifierKey] !== 'inactive')
          const isModifierLocked = modifierKey && modifierState[modifierKey] === 'locked'

          return (
            <button
              key={keyDef.label}
              onClick={() => handleKeyPress(keyDef)}
              aria-label={keyDef.ariaLabel || keyDef.label}
              aria-pressed={keyDef.isModifier ? isModifierActive : undefined}
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

        {/* Custom commands button */}
        <button
          onClick={() => setIsCommandsSheetOpen(true)}
          aria-label="Open custom commands"
          className={cn(
            'flex items-center justify-center px-2 py-1.5 text-xs font-medium',
            'bg-background rounded border transition-all duration-75',
            'hover:bg-accent hover:text-accent-foreground',
            'active:bg-accent active:scale-95',
            'touch-manipulation',
            'min-h-[32px] min-w-[40px]',
            'border-border'
          )}
        >
          <BookOpen className="w-3 h-3" />
        </button>
      </div>

      {/* Custom commands side sheet */}
      <CustomCommandsSheet
        open={isCommandsSheetOpen}
        onOpenChange={setIsCommandsSheetOpen}
      />
    </>
  )
}
