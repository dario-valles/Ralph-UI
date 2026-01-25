// Hook to track visual viewport for mobile keyboard detection
// Uses the Visual Viewport API to detect when the keyboard appears/hides

import { useSyncExternalStore } from 'react'

interface VisualViewportState {
  height: number
  width: number
  isKeyboardVisible: boolean
}

// Cache the last snapshot to avoid returning new objects when values haven't changed
let cachedSnapshot: VisualViewportState = {
  height: 0,
  width: 0,
  isKeyboardVisible: false,
}

// Stable snapshot function - returns cached object if values unchanged
function getSnapshot(): VisualViewportState {
  if (typeof window === 'undefined' || !window.visualViewport) {
    const height = typeof window !== 'undefined' ? window.innerHeight : 0
    const width = typeof window !== 'undefined' ? window.innerWidth : 0

    if (cachedSnapshot.height === height &&
        cachedSnapshot.width === width &&
        cachedSnapshot.isKeyboardVisible === false) {
      return cachedSnapshot
    }

    cachedSnapshot = { height, width, isKeyboardVisible: false }
    return cachedSnapshot
  }

  const vv = window.visualViewport
  const height = vv.height
  const width = vv.width
  // Keyboard is likely visible if viewport is < 75% of window height
  const isKeyboardVisible = height < window.innerHeight * 0.75

  // Return cached object if nothing changed
  if (cachedSnapshot.height === height &&
      cachedSnapshot.width === width &&
      cachedSnapshot.isKeyboardVisible === isKeyboardVisible) {
    return cachedSnapshot
  }

  // Update cache and return new object
  cachedSnapshot = { height, width, isKeyboardVisible }
  return cachedSnapshot
}

// Stable subscribe function - defined outside component to prevent recreation
function subscribe(callback: () => void) {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return () => {}
  }

  window.visualViewport.addEventListener('resize', callback)
  window.visualViewport.addEventListener('scroll', callback)

  return () => {
    window.visualViewport?.removeEventListener('resize', callback)
    window.visualViewport?.removeEventListener('scroll', callback)
  }
}

// Stable server snapshot - always returns the same object
const serverSnapshot: VisualViewportState = {
  height: 0,
  width: 0,
  isKeyboardVisible: false,
}

function getServerSnapshot(): VisualViewportState {
  return serverSnapshot
}

export function useVisualViewport(): VisualViewportState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
