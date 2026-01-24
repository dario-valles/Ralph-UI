// Gesture settings store using Zustand with localStorage persistence

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface GestureSettings {
  // Command history navigation gestures
  enableHistoryNavigation: boolean
  historySwipeThreshold: number // Minimum swipe distance in pixels

  // Other gesture features (for future use)
  enableCursorMovement: boolean
  cursorSwipeThreshold: number

  enablePageScroll: boolean
  pageSwipeThreshold: number

  enableExtendedArrows: boolean
  extendedSwipeThreshold: number

  enablePinchZoom: boolean
  pinchThreshold: number
}

interface GestureStore {
  // State
  settings: GestureSettings

  // Actions
  toggleHistoryNavigation: () => void
  setHistorySwipeThreshold: (threshold: number) => void
  toggleCursorMovement: () => void
  setCursorSwipeThreshold: (threshold: number) => void
  togglePageScroll: () => void
  setPageSwipeThreshold: (threshold: number) => void
  toggleExtendedArrows: () => void
  setExtendedSwipeThreshold: (threshold: number) => void
  togglePinchZoom: () => void
  setPinchThreshold: (threshold: number) => void
  resetToDefaults: () => void
}

const DEFAULT_SETTINGS: GestureSettings = {
  enableHistoryNavigation: true,
  historySwipeThreshold: 30, // 30px minimum swipe distance
  enableCursorMovement: true, // Enabled for US-5.2
  cursorSwipeThreshold: 30,
  enablePageScroll: true, // Enabled for US-5.3
  pageSwipeThreshold: 50,
  enableExtendedArrows: true, // Enabled for US-5.4
  extendedSwipeThreshold: 50,
  enablePinchZoom: false, // Disabled for US-5.5
  pinchThreshold: 0.1,
}

export const useGestureStore = create<GestureStore>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,

      toggleHistoryNavigation: () =>
        set((state) => ({
          settings: {
            ...state.settings,
            enableHistoryNavigation: !state.settings.enableHistoryNavigation,
          },
        })),

      setHistorySwipeThreshold: (threshold: number) =>
        set((state) => ({
          settings: {
            ...state.settings,
            historySwipeThreshold: threshold,
          },
        })),

      toggleCursorMovement: () =>
        set((state) => ({
          settings: {
            ...state.settings,
            enableCursorMovement: !state.settings.enableCursorMovement,
          },
        })),

      setCursorSwipeThreshold: (threshold: number) =>
        set((state) => ({
          settings: {
            ...state.settings,
            cursorSwipeThreshold: threshold,
          },
        })),

      togglePageScroll: () =>
        set((state) => ({
          settings: {
            ...state.settings,
            enablePageScroll: !state.settings.enablePageScroll,
          },
        })),

      setPageSwipeThreshold: (threshold: number) =>
        set((state) => ({
          settings: {
            ...state.settings,
            pageSwipeThreshold: threshold,
          },
        })),

      toggleExtendedArrows: () =>
        set((state) => ({
          settings: {
            ...state.settings,
            enableExtendedArrows: !state.settings.enableExtendedArrows,
          },
        })),

      setExtendedSwipeThreshold: (threshold: number) =>
        set((state) => ({
          settings: {
            ...state.settings,
            extendedSwipeThreshold: threshold,
          },
        })),

      togglePinchZoom: () =>
        set((state) => ({
          settings: {
            ...state.settings,
            enablePinchZoom: !state.settings.enablePinchZoom,
          },
        })),

      setPinchThreshold: (threshold: number) =>
        set((state) => ({
          settings: {
            ...state.settings,
            pinchThreshold: threshold,
          },
        })),

      resetToDefaults: () => set({ settings: DEFAULT_SETTINGS }),
    }),
    {
      name: 'ralph-gesture-settings',
      partialize: (state) => ({
        settings: state.settings,
      }),
    }
  )
)
