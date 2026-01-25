// Hook to track visual viewport for mobile keyboard detection
// Uses the Visual Viewport API to detect when the keyboard appears/hides

import { useSyncExternalStore } from 'react'

interface VisualViewportState {
  height: number
  width: number
  isKeyboardVisible: boolean
}

const getSnapshot = (): VisualViewportState => {
  if (typeof window === 'undefined' || !window.visualViewport) {
    return {
      height: typeof window !== 'undefined' ? window.innerHeight : 0,
      width: typeof window !== 'undefined' ? window.innerWidth : 0,
      isKeyboardVisible: false,
    }
  }

  const vv = window.visualViewport
  // Keyboard is likely visible if viewport is < 75% of window height
  const isKeyboardVisible = vv.height < window.innerHeight * 0.75

  return {
    height: vv.height,
    width: vv.width,
    isKeyboardVisible,
  }
}

const subscribe = (callback: () => void) => {
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

const getServerSnapshot = (): VisualViewportState => ({
  height: 0,
  width: 0,
  isKeyboardVisible: false,
})

export function useVisualViewport(): VisualViewportState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
