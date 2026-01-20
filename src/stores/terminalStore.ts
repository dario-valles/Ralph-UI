// Terminal state management store using Zustand with localStorage persistence

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  TerminalInstance,
  TerminalPanelMode,
  SplitDirection,
} from '@/types/terminal'

// Split pane contains terminal IDs that are displayed together
interface SplitGroup {
  id: string
  direction: SplitDirection
  terminalIds: string[]
  sizes: number[] // Percentage for each terminal
}

interface TerminalStore {
  // State
  terminals: TerminalInstance[]
  activeTerminalId: string | null
  panelMode: TerminalPanelMode
  panelHeight: number // Percentage (10-90)
  splitGroups: SplitGroup[] // Groups of terminals shown together
  activeSplitGroupId: string | null

  // Actions
  createTerminal: (cwd?: string) => string // Returns terminal ID
  closeTerminal: (id: string) => void
  setActiveTerminal: (id: string | null) => void
  updateTerminalTitle: (id: string, title: string) => void
  setPanelMode: (mode: TerminalPanelMode) => void
  setPanelHeight: (height: number) => void
  splitTerminal: (id: string, direction: SplitDirection) => string | null
  updateSplitSizes: (groupId: string, sizes: number[]) => void
  togglePanel: () => void
  minimizePanel: () => void
  maximizePanel: () => void
  closePanel: () => void
  getActiveSplitGroup: () => SplitGroup | null
  getTerminalsInActiveGroup: () => TerminalInstance[]
}

const generateTerminalId = () => `term-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
const generateGroupId = () => `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

const getDefaultTitle = (index: number) => `Terminal ${index + 1}`

export const useTerminalStore = create<TerminalStore>()(
  persist(
    (set, get) => ({
      // Initial state
      terminals: [],
      activeTerminalId: null,
      panelMode: 'closed',
      panelHeight: 35, // Default to 35% of screen
      splitGroups: [],
      activeSplitGroupId: null,

      createTerminal: (cwd?: string) => {
        const id = generateTerminalId()
        const groupId = generateGroupId()
        const { terminals, panelMode } = get()

        // Use provided cwd or empty string (terminal-api will handle default)
        const workingDir = cwd || ''

        const newTerminal: TerminalInstance = {
          id,
          title: getDefaultTitle(terminals.length),
          cwd: workingDir,
          isActive: true,
          createdAt: new Date().toISOString(),
        }

        // Create a new split group with just this terminal
        const newGroup: SplitGroup = {
          id: groupId,
          direction: 'horizontal',
          terminalIds: [id],
          sizes: [100],
        }

        set({
          terminals: [...terminals, newTerminal],
          activeTerminalId: id,
          splitGroups: [...get().splitGroups, newGroup],
          activeSplitGroupId: groupId,
          panelMode: panelMode === 'closed' ? 'panel' : panelMode,
        })

        return id
      },

      closeTerminal: (id: string) => {
        const { terminals, activeTerminalId, splitGroups, activeSplitGroupId } = get()
        const newTerminals = terminals.filter((t) => t.id !== id)

        // Update split groups - remove terminal from any group
        let newSplitGroups = splitGroups.map((group) => {
          if (group.terminalIds.includes(id)) {
            const idx = group.terminalIds.indexOf(id)
            const newTerminalIds = group.terminalIds.filter((tid) => tid !== id)
            const newSizes = group.sizes.filter((_, i) => i !== idx)
            // Redistribute sizes
            const total = newSizes.reduce((a, b) => a + b, 0)
            const normalizedSizes = newSizes.map((s) => (s / total) * 100)
            return {
              ...group,
              terminalIds: newTerminalIds,
              sizes: normalizedSizes.length > 0 ? normalizedSizes : [],
            }
          }
          return group
        })

        // Remove empty groups
        newSplitGroups = newSplitGroups.filter((g) => g.terminalIds.length > 0)

        // If closing active terminal, switch to another
        let newActiveId = activeTerminalId
        let newActiveSplitGroupId = activeSplitGroupId

        if (activeTerminalId === id) {
          // Find another terminal in the same group first
          const currentGroup = splitGroups.find((g) => g.terminalIds.includes(id))
          if (currentGroup) {
            const otherInGroup = currentGroup.terminalIds.find((tid) => tid !== id)
            if (otherInGroup) {
              newActiveId = otherInGroup
            } else {
              // Switch to last terminal in another group
              newActiveId = newTerminals.length > 0 ? newTerminals[newTerminals.length - 1].id : null
              newActiveSplitGroupId = newSplitGroups.length > 0 ? newSplitGroups[newSplitGroups.length - 1].id : null
            }
          } else {
            newActiveId = newTerminals.length > 0 ? newTerminals[newTerminals.length - 1].id : null
          }
        }

        // Update active split group if it was removed
        if (activeSplitGroupId && !newSplitGroups.find((g) => g.id === activeSplitGroupId)) {
          newActiveSplitGroupId = newSplitGroups.length > 0 ? newSplitGroups[newSplitGroups.length - 1].id : null
        }

        // If no terminals left, close panel
        const newPanelMode = newTerminals.length === 0 ? 'closed' : get().panelMode

        set({
          terminals: newTerminals,
          activeTerminalId: newActiveId,
          splitGroups: newSplitGroups,
          activeSplitGroupId: newActiveSplitGroupId,
          panelMode: newPanelMode,
        })
      },

      setActiveTerminal: (id: string | null) => {
        const { splitGroups } = get()
        // Find which group contains this terminal
        const group = splitGroups.find((g) => g.terminalIds.includes(id || ''))
        set({
          activeTerminalId: id,
          activeSplitGroupId: group?.id || get().activeSplitGroupId,
        })
      },

      updateTerminalTitle: (id: string, title: string) => {
        const { terminals } = get()
        set({
          terminals: terminals.map((t) => (t.id === id ? { ...t, title } : t)),
        })
      },

      setPanelMode: (mode: TerminalPanelMode) => {
        set({ panelMode: mode })
      },

      setPanelHeight: (height: number) => {
        // Clamp between 10% and 90%
        const clampedHeight = Math.min(90, Math.max(10, height))
        set({ panelHeight: clampedHeight })
      },

      splitTerminal: (id: string, direction: SplitDirection) => {
        const { terminals, splitGroups } = get()
        const existingTerminal = terminals.find((t) => t.id === id)
        if (!existingTerminal) return null

        // Create a new terminal for the split
        const newId = generateTerminalId()
        const newTerminal: TerminalInstance = {
          id: newId,
          title: getDefaultTitle(terminals.length),
          cwd: existingTerminal.cwd,
          isActive: false,
          createdAt: new Date().toISOString(),
        }

        // Find the group containing the original terminal
        const groupIndex = splitGroups.findIndex((g) => g.terminalIds.includes(id))

        let newSplitGroups: SplitGroup[]

        if (groupIndex >= 0) {
          // Add to existing group
          const group = splitGroups[groupIndex]
          const terminalIndex = group.terminalIds.indexOf(id)

          // Insert new terminal after the current one
          const newTerminalIds = [...group.terminalIds]
          newTerminalIds.splice(terminalIndex + 1, 0, newId)

          // Split the size of the current terminal
          const currentSize = group.sizes[terminalIndex]
          const newSize = currentSize / 2
          const newSizes = [...group.sizes]
          newSizes[terminalIndex] = newSize
          newSizes.splice(terminalIndex + 1, 0, newSize)

          newSplitGroups = splitGroups.map((g, i) =>
            i === groupIndex
              ? { ...g, direction, terminalIds: newTerminalIds, sizes: newSizes }
              : g
          )
        } else {
          // Create new group with both terminals
          const newGroup: SplitGroup = {
            id: generateGroupId(),
            direction,
            terminalIds: [id, newId],
            sizes: [50, 50],
          }
          newSplitGroups = [...splitGroups, newGroup]
        }

        set({
          terminals: [...terminals, newTerminal],
          activeTerminalId: newId,
          splitGroups: newSplitGroups,
        })

        return newId
      },

      updateSplitSizes: (groupId: string, sizes: number[]) => {
        const { splitGroups } = get()
        set({
          splitGroups: splitGroups.map((g) =>
            g.id === groupId ? { ...g, sizes } : g
          ),
        })
      },

      togglePanel: () => {
        const { panelMode, terminals } = get()
        if (panelMode === 'closed') {
          // If no terminals, create one
          if (terminals.length === 0) {
            get().createTerminal()
          } else {
            set({ panelMode: 'panel' })
          }
        } else if (panelMode === 'minimized') {
          set({ panelMode: 'panel' })
        } else {
          set({ panelMode: 'minimized' })
        }
      },

      minimizePanel: () => {
        const { panelMode } = get()
        if (panelMode === 'minimized') {
          set({ panelMode: 'panel' })
        } else {
          set({ panelMode: 'minimized' })
        }
      },

      maximizePanel: () => {
        const { panelMode } = get()
        set({ panelMode: panelMode === 'full' ? 'panel' : 'full' })
      },

      closePanel: () => {
        set({ panelMode: 'closed' })
      },

      getActiveSplitGroup: () => {
        const { splitGroups, activeSplitGroupId } = get()
        return splitGroups.find((g) => g.id === activeSplitGroupId) || null
      },

      getTerminalsInActiveGroup: () => {
        const { terminals, splitGroups, activeSplitGroupId } = get()
        const group = splitGroups.find((g) => g.id === activeSplitGroupId)
        if (!group) return []
        return group.terminalIds
          .map((id) => terminals.find((t) => t.id === id))
          .filter((t): t is TerminalInstance => t !== undefined)
      },
    }),
    {
      name: 'ralph-terminal-storage',
      partialize: (state) => ({
        // Only persist UI preferences, not active terminals
        panelHeight: state.panelHeight,
      }),
    }
  )
)
