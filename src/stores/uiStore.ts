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

  // Project switcher state (for triggering from other components)
  projectSwitcherOpen: boolean
  setProjectSwitcherOpen: (open: boolean) => void
  openProjectSwitcher: () => void
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

      // Project switcher state
      projectSwitcherOpen: false,
      setProjectSwitcherOpen: (open: boolean) => set({ projectSwitcherOpen: open }),
      openProjectSwitcher: () => set({ projectSwitcherOpen: true }),
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
