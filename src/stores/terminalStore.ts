// Terminal state management store using Zustand with localStorage persistence

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  TerminalInstance,
  TerminalPanelMode,
  SplitDirection,
  AgentTerminalStatus,
} from '@/types/terminal'
import { hasStoredSession, killTerminal } from '@/lib/terminal-api'

// A pane can either be a terminal or a split container
interface TerminalPane {
  id: string
  type: 'terminal'
  terminalId: string
}

interface SplitPane {
  id: string
  type: 'split'
  direction: SplitDirection
  children: PaneNode[]
  sizes: number[] // Percentage for each child
}

type PaneNode = TerminalPane | SplitPane

interface TerminalStore {
  // State
  terminals: TerminalInstance[]
  activeTerminalId: string | null
  panelMode: TerminalPanelMode
  panelHeight: number // Percentage (10-90)
  rootPane: PaneNode | null // Root of the pane tree

  // Actions
  createTerminal: (cwd?: string) => string
  closeTerminal: (id: string) => void
  setActiveTerminal: (id: string | null) => void
  updateTerminalTitle: (id: string, title: string) => void
  setPanelMode: (mode: TerminalPanelMode) => void
  setPanelHeight: (height: number) => void
  splitTerminal: (id: string, direction: SplitDirection) => string | null
  updatePaneSizes: (paneId: string, sizes: number[]) => void
  togglePanel: () => void
  minimizePanel: () => void
  maximizePanel: () => void
  closePanel: () => void
  getRootPane: () => PaneNode | null

  // Agent terminal actions
  createAgentTerminal: (agentId: string, title: string, cwd?: string) => string
  updateAgentTerminalStatus: (agentId: string, status: AgentTerminalStatus) => void
  getTerminalForAgent: (agentId: string) => string | null

  // Session persistence
  cleanupStaleTerminals: () => void
}

const generateTerminalId = () => `term-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
const generatePaneId = () => `pane-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

const getDefaultTitle = (index: number) => `Terminal ${index + 1}`

// Helper to find a pane by terminal ID in the tree
function findPaneByTerminalId(node: PaneNode | null, terminalId: string): TerminalPane | null {
  if (!node) return null
  if (node.type === 'terminal') {
    return node.terminalId === terminalId ? node : null
  }
  for (const child of node.children) {
    const found = findPaneByTerminalId(child, terminalId)
    if (found) return found
  }
  return null
}

// Helper to find parent split pane of a terminal
function findParentSplit(
  node: PaneNode | null,
  terminalId: string,
  parent: SplitPane | null = null
): { parent: SplitPane | null; index: number } | null {
  if (!node) return null
  if (node.type === 'terminal') {
    if (node.terminalId === terminalId && parent) {
      const index = parent.children.findIndex(
        (c) => c.type === 'terminal' && c.terminalId === terminalId
      )
      return { parent, index }
    }
    return null
  }
  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    if (child.type === 'terminal' && child.terminalId === terminalId) {
      return { parent: node, index: i }
    }
    const found = findParentSplit(child, terminalId, node)
    if (found) return found
  }
  return null
}

// Helper to replace a node in the tree
function replaceNode(root: PaneNode, targetId: string, newNode: PaneNode): PaneNode {
  if (root.id === targetId) return newNode
  if (root.type === 'terminal') return root
  return {
    ...root,
    children: root.children.map((child) => replaceNode(child, targetId, newNode)),
  }
}

// Helper to remove a terminal from the tree
function removeTerminal(node: PaneNode, terminalId: string): PaneNode | null {
  if (node.type === 'terminal') {
    return node.terminalId === terminalId ? null : node
  }

  const newChildren: PaneNode[] = []
  const newSizes: number[] = []

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    const result = removeTerminal(child, terminalId)
    if (result) {
      newChildren.push(result)
      newSizes.push(node.sizes[i])
    }
  }

  if (newChildren.length === 0) return null
  if (newChildren.length === 1) return newChildren[0]

  // Normalize sizes
  const total = newSizes.reduce((a, b) => a + b, 0)
  const normalizedSizes = newSizes.map((s) => (s / total) * 100)

  return { ...node, children: newChildren, sizes: normalizedSizes }
}

// Helper to find another terminal in the tree
function findAnyTerminal(node: PaneNode | null): string | null {
  if (!node) return null
  if (node.type === 'terminal') return node.terminalId
  for (const child of node.children) {
    const found = findAnyTerminal(child)
    if (found) return found
  }
  return null
}

export const useTerminalStore = create<TerminalStore>()(
  persist(
    (set, get) => ({
      // Initial state
      terminals: [],
      activeTerminalId: null,
      panelMode: 'closed',
      panelHeight: 35,
      rootPane: null,

      createTerminal: (cwd?: string) => {
        const id = generateTerminalId()
        const { terminals, panelMode, rootPane } = get()

        const workingDir = cwd || ''

        const newTerminal: TerminalInstance = {
          id,
          title: getDefaultTitle(terminals.length),
          cwd: workingDir,
          isActive: true,
          createdAt: new Date().toISOString(),
          terminalType: 'shell',
        }

        // Create a terminal pane
        const newPane: TerminalPane = {
          id: generatePaneId(),
          type: 'terminal',
          terminalId: id,
        }

        // If no root, this becomes the root. Otherwise, it's a new "tab" (replace root)
        // For simplicity, new terminals without split create a fresh view
        let newRoot: PaneNode
        if (!rootPane) {
          newRoot = newPane
        } else {
          // Add as a new tab - for now, replace root (tabs are separate groups)
          // We'll keep the existing terminals but switch view
          newRoot = newPane
        }

        set({
          terminals: [...terminals, newTerminal],
          activeTerminalId: id,
          rootPane: newRoot,
          panelMode: panelMode === 'closed' ? 'panel' : panelMode,
        })

        return id
      },

      closeTerminal: (id: string) => {
        const { terminals, activeTerminalId, rootPane } = get()
        const newTerminals = terminals.filter((t) => t.id !== id)

        // Remove from pane tree
        const newRoot = rootPane ? removeTerminal(rootPane, id) : null

        // Find new active terminal
        let newActiveId = activeTerminalId
        if (activeTerminalId === id) {
          newActiveId = newRoot
            ? findAnyTerminal(newRoot)
            : newTerminals.length > 0
              ? newTerminals[0].id
              : null
        }

        // If the removed terminal was in a different tree, find its tree
        if (newActiveId && !findPaneByTerminalId(newRoot, newActiveId)) {
          // Active terminal is not in current tree, need to switch
          // For now, just pick first available
          newActiveId = newRoot ? findAnyTerminal(newRoot) : null
        }

        const newPanelMode = newTerminals.length === 0 ? 'closed' : get().panelMode

        set({
          terminals: newTerminals,
          activeTerminalId: newActiveId,
          rootPane: newRoot,
          panelMode: newPanelMode,
        })
      },

      setActiveTerminal: (id: string | null) => {
        const { terminals, rootPane } = get()

        // If the terminal exists but is not in current pane tree,
        // we need to find/build its tree
        if (id) {
          const terminal = terminals.find((t) => t.id === id)
          if (terminal && !findPaneByTerminalId(rootPane, id)) {
            // Terminal exists but not in current view - create a pane for it
            const newPane: TerminalPane = {
              id: generatePaneId(),
              type: 'terminal',
              terminalId: id,
            }
            set({ activeTerminalId: id, rootPane: newPane })
            return
          }
        }

        set({ activeTerminalId: id })
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
        const clampedHeight = Math.min(90, Math.max(10, height))
        set({ panelHeight: clampedHeight })
      },

      splitTerminal: (id: string, direction: SplitDirection) => {
        const { terminals, rootPane } = get()
        const existingTerminal = terminals.find((t) => t.id === id)
        if (!existingTerminal || !rootPane) return null

        // Create new terminal
        const newId = generateTerminalId()
        const newTerminal: TerminalInstance = {
          id: newId,
          title: getDefaultTitle(terminals.length),
          cwd: existingTerminal.cwd,
          isActive: false,
          createdAt: new Date().toISOString(),
          terminalType: 'shell',
        }

        const newTerminalPane: TerminalPane = {
          id: generatePaneId(),
          type: 'terminal',
          terminalId: newId,
        }

        // Find the terminal pane in the tree
        const terminalPane = findPaneByTerminalId(rootPane, id)
        if (!terminalPane) return null

        // Find parent of the terminal pane
        const parentInfo = findParentSplit(rootPane, id, null)

        let newRoot: PaneNode

        if (!parentInfo) {
          // Terminal is the root - wrap in a split
          const newSplit: SplitPane = {
            id: generatePaneId(),
            type: 'split',
            direction,
            children: [terminalPane, newTerminalPane],
            sizes: [50, 50],
          }
          newRoot = newSplit
        } else {
          const { parent, index } = parentInfo

          // Parent should never be null here, but TypeScript doesn't know that
          if (!parent) {
            // Fallback to root wrapping case
            const newSplit: SplitPane = {
              id: generatePaneId(),
              type: 'split',
              direction,
              children: [terminalPane, newTerminalPane],
              sizes: [50, 50],
            }
            newRoot = newSplit
          } else if (parent.direction === direction) {
            // Same direction - add to parent
            const newChildren = [...parent.children]
            newChildren.splice(index + 1, 0, newTerminalPane)

            // Redistribute sizes
            const oldSize = parent.sizes[index]
            const newSize = oldSize / 2
            const newSizes = [...parent.sizes]
            newSizes[index] = newSize
            newSizes.splice(index + 1, 0, newSize)

            const updatedParent: SplitPane = {
              ...parent,
              children: newChildren,
              sizes: newSizes,
            }
            newRoot = replaceNode(rootPane, parent.id, updatedParent)
          } else {
            // Different direction - create nested split
            const newSplit: SplitPane = {
              id: generatePaneId(),
              type: 'split',
              direction,
              children: [terminalPane, newTerminalPane],
              sizes: [50, 50],
            }

            // Replace the terminal pane with the new split in parent
            const newChildren = parent.children.map((child, i) => (i === index ? newSplit : child))
            const updatedParent: SplitPane = {
              ...parent,
              children: newChildren,
            }
            newRoot = replaceNode(rootPane, parent.id, updatedParent)
          }
        }

        set({
          terminals: [...terminals, newTerminal],
          activeTerminalId: newId,
          rootPane: newRoot,
        })

        return newId
      },

      updatePaneSizes: (paneId: string, sizes: number[]) => {
        const { rootPane } = get()
        if (!rootPane) return

        const updateSizes = (node: PaneNode): PaneNode => {
          if (node.type === 'terminal') return node
          if (node.id === paneId) {
            return { ...node, sizes }
          }
          return {
            ...node,
            children: node.children.map(updateSizes),
          }
        }

        set({ rootPane: updateSizes(rootPane) })
      },

      togglePanel: () => {
        const { panelMode } = get()
        if (panelMode === 'closed') {
          // Clean up stale terminals before opening panel
          get().cleanupStaleTerminals()
          const terminals = get().terminals
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

      getRootPane: () => get().rootPane,

      // Agent terminal functions
      createAgentTerminal: (agentId: string, title: string, cwd?: string) => {
        const { terminals, panelMode } = get()

        // Check if a terminal already exists for this agent
        const existingTerminal = terminals.find(
          (t) => t.terminalType === 'agent' && t.agentId === agentId
        )
        if (existingTerminal) {
          // Just activate the existing terminal
          set({ activeTerminalId: existingTerminal.id })
          // Create pane for it if needed
          const newPane: TerminalPane = {
            id: generatePaneId(),
            type: 'terminal',
            terminalId: existingTerminal.id,
          }
          set({
            rootPane: newPane,
            panelMode: panelMode === 'closed' ? 'panel' : panelMode,
          })
          return existingTerminal.id
        }

        // Create new agent terminal
        const id = generateTerminalId()
        const newTerminal: TerminalInstance = {
          id,
          title,
          cwd: cwd || '',
          isActive: true,
          createdAt: new Date().toISOString(),
          terminalType: 'agent',
          agentId,
          agentStatus: 'running',
        }

        const newPane: TerminalPane = {
          id: generatePaneId(),
          type: 'terminal',
          terminalId: id,
        }

        set({
          terminals: [...terminals, newTerminal],
          activeTerminalId: id,
          rootPane: newPane,
          panelMode: panelMode === 'closed' ? 'panel' : panelMode,
        })

        return id
      },

      updateAgentTerminalStatus: (agentId: string, status: AgentTerminalStatus) => {
        const { terminals } = get()
        set({
          terminals: terminals.map((t) =>
            t.terminalType === 'agent' && t.agentId === agentId ? { ...t, agentStatus: status } : t
          ),
        })
      },

      getTerminalForAgent: (agentId: string) => {
        const { terminals } = get()
        const terminal = terminals.find((t) => t.terminalType === 'agent' && t.agentId === agentId)
        return terminal?.id || null
      },

      cleanupStaleTerminals: () => {
        const { terminals, activeTerminalId, rootPane } = get()
        const now = Date.now()
        const SESSION_TIMEOUT_MS = 10 * 60 * 1000 // Match backend PTY timeout (10 min)

        const activeTerminals = terminals.filter((t) => {
          // Keep if session still stored (backend may still have PTY alive)
          if (hasStoredSession(t.id)) return true
          // Keep if created within timeout window
          const createdAt = new Date(t.createdAt).getTime()
          return now - createdAt < SESSION_TIMEOUT_MS
        })

        // Find terminals that were removed
        const removedIds = new Set(
          terminals.filter((t) => !activeTerminals.some((at) => at.id === t.id)).map((t) => t.id)
        )

        // Clean up session storage for removed terminals
        removedIds.forEach((id) => {
          killTerminal(id) // This clears session storage
        })

        if (activeTerminals.length !== terminals.length) {
          // Update active terminal if it was removed
          let newActiveId = activeTerminalId
          if (activeTerminalId && removedIds.has(activeTerminalId)) {
            newActiveId = activeTerminals.length > 0 ? activeTerminals[0].id : null
          }

          // Remove stale terminals from pane tree
          let newRoot = rootPane
          removedIds.forEach((id) => {
            if (newRoot) {
              newRoot = removeTerminal(newRoot, id)
            }
          })

          set({
            terminals: activeTerminals,
            activeTerminalId: newActiveId,
            rootPane: newRoot,
          })
        }
      },
    }),
    {
      name: 'ralph-terminal-storage',
      partialize: (state) => ({
        panelHeight: state.panelHeight,
        terminals: state.terminals,
        activeTerminalId: state.activeTerminalId,
        rootPane: state.rootPane,
      }),
    }
  )
)

// Export types for use in components
export type { PaneNode, TerminalPane, SplitPane }
