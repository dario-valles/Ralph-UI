// Two-finger scroll gesture for xterm.js terminals on mobile
// Single finger → xterm interaction (text selection, input)
// Two fingers → scroll the terminal buffer

import { useEffect, useRef, useCallback } from 'react'
import type { Terminal } from '@xterm/xterm'

interface UseTerminalTouchScrollOptions {
  /** Ref to the xterm Terminal instance */
  terminalRef: React.RefObject<Terminal | null>
  /** Whether touch scroll is enabled (typically only on mobile) */
  enabled?: boolean
  /** Lines to scroll per 10px of movement */
  scrollSensitivity?: number
}

interface TouchState {
  /** Whether a two-finger gesture is active */
  isTwoFingerGesture: boolean
  /** Starting Y positions when gesture began */
  startY: number[]
  /** Last Y positions for delta calculation */
  lastY: number[]
  /** Accumulated scroll delta (for sub-line precision) */
  scrollAccumulator: number
}

/**
 * Hook to enable two-finger scroll on xterm.js terminals
 *
 * xterm.js captures single-finger touch for text selection, so we use
 * two-finger gestures for scrolling (similar to iOS Safari behavior).
 */
export function useTerminalTouchScroll(
  containerRef: React.RefObject<HTMLDivElement | null>,
  options: UseTerminalTouchScrollOptions
) {
  const { terminalRef, enabled = true, scrollSensitivity = 3 } = options

  const touchStateRef = useRef<TouchState>({
    isTwoFingerGesture: false,
    startY: [],
    lastY: [],
    scrollAccumulator: 0,
  })

  // Calculate average Y position from touch points
  const getAverageY = useCallback((touches: TouchList): number => {
    let sum = 0
    for (let i = 0; i < touches.length; i++) {
      sum += touches[i].clientY
    }
    return sum / touches.length
  }, [])

  // Handle touch start
  const handleTouchStart = useCallback((e: TouchEvent) => {
    const state = touchStateRef.current

    if (e.touches.length >= 2) {
      // Two or more fingers - start tracking for scroll gesture
      state.isTwoFingerGesture = true
      state.startY = Array.from(e.touches).map(t => t.clientY)
      state.lastY = [...state.startY]
      state.scrollAccumulator = 0
    } else {
      // Single finger - let xterm handle it normally
      state.isTwoFingerGesture = false
    }
  }, [])

  // Handle touch move
  const handleTouchMove = useCallback((e: TouchEvent) => {
    const state = touchStateRef.current
    const terminal = terminalRef.current

    if (e.touches.length >= 2 && state.isTwoFingerGesture && terminal) {
      // Prevent default browser behavior during two-finger gesture
      e.preventDefault()

      const currentY = getAverageY(e.touches)
      const lastAvgY = state.lastY.reduce((a, b) => a + b, 0) / state.lastY.length
      const deltaY = lastAvgY - currentY // Inverted: drag down = scroll up (natural scrolling)

      // Accumulate scroll delta with sensitivity
      // scrollSensitivity lines per 10px movement
      state.scrollAccumulator += deltaY * (scrollSensitivity / 10)

      // Scroll when we've accumulated enough for a line
      const linesToScroll = Math.trunc(state.scrollAccumulator)
      if (linesToScroll !== 0) {
        terminal.scrollLines(linesToScroll)
        state.scrollAccumulator -= linesToScroll
      }

      // Update last positions
      state.lastY = Array.from(e.touches).map(t => t.clientY)
    }
  }, [terminalRef, scrollSensitivity, getAverageY])

  // Handle touch end
  const handleTouchEnd = useCallback((e: TouchEvent) => {
    const state = touchStateRef.current

    if (e.touches.length < 2) {
      // No longer a two-finger gesture
      state.isTwoFingerGesture = false
      state.scrollAccumulator = 0
    }
  }, [])

  // Attach event listeners
  useEffect(() => {
    const container = containerRef.current
    const terminal = terminalRef.current
    if (!container || !enabled || !terminal) return

    // Use non-passive listeners so we can call preventDefault during two-finger gestures
    const listenerOptions: AddEventListenerOptions = { passive: false }

    container.addEventListener('touchstart', handleTouchStart, listenerOptions)
    container.addEventListener('touchmove', handleTouchMove, listenerOptions)
    container.addEventListener('touchend', handleTouchEnd, listenerOptions)
    container.addEventListener('touchcancel', handleTouchEnd, listenerOptions)

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      container.removeEventListener('touchcancel', handleTouchEnd)
    }
  }, [containerRef, terminalRef, enabled, handleTouchStart, handleTouchMove, handleTouchEnd])
}

/**
 * Detect if the device is mobile/touch-based
 */
export function useIsMobile(): boolean {
  if (typeof window === 'undefined') return false

  // Check for touch capability and mobile user agent
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  )

  // Also check for coarse pointer (touch screen as primary input)
  const hasCoarsePointer = window.matchMedia?.('(pointer: coarse)').matches

  return hasTouch && (isMobileUA || hasCoarsePointer)
}
