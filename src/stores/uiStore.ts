// UI state management store using Zustand with localStorage persistence

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type TerminalMode = 'docked' | 'fullscreen' | 'minimized'

interface UIStore {
  // Sidebar state
  sidebarCollapsed: boolean
  toggleSidebar: () => void

  // Mobile drawer state
  sidebarDrawerOpen: boolean
  setSidebarDrawerOpen: (open: boolean) => void
  toggleSidebarDrawer: () => void

  // Terminal mode for mobile
  terminalMode: TerminalMode
  setTerminalMode: (mode: TerminalMode) => void
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      // Sidebar state
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // Mobile drawer state (not persisted)
      sidebarDrawerOpen: false,
      setSidebarDrawerOpen: (open: boolean) => set({ sidebarDrawerOpen: open }),
      toggleSidebarDrawer: () => set((state) => ({ sidebarDrawerOpen: !state.sidebarDrawerOpen })),

      // Terminal mode
      terminalMode: 'docked' as TerminalMode,
      setTerminalMode: (mode: TerminalMode) => set({ terminalMode: mode }),
    }),
    {
      name: 'ralph-ui-storage',
      partialize: (state) => ({
        // Only persist these values
        sidebarCollapsed: state.sidebarCollapsed,
        terminalMode: state.terminalMode,
      }),
    }
  )
)
