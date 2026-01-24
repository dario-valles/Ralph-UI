// Terminal keyboard shortcuts hook

import { useEffect } from 'react'
import { useTerminalStore } from '@/stores/terminalStore'
import { useProjectStore } from '@/stores/projectStore'

/**
 * Hook to register terminal keyboard shortcuts
 *
 * Shortcuts:
 * - Cmd/Ctrl + ` : Toggle terminal (create if none exist)
 * - Cmd/Ctrl + Shift + ` : Create new terminal
 * - Cmd/Ctrl + 1-9 : Switch to terminal by index
 */
export function useTerminalShortcuts() {
  const { terminals, activeTerminalId, togglePanel, createTerminal, setActiveTerminal, panelMode } =
    useTerminalStore()
  const { getActiveProject } = useProjectStore()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const modifier = isMac ? e.metaKey : e.ctrlKey

      // Cmd/Ctrl + ` : Toggle terminal
      if (modifier && e.key === '`' && !e.shiftKey) {
        e.preventDefault()
        if (terminals.length === 0) {
          const activeProject = getActiveProject()
          createTerminal(activeProject?.path)
        } else {
          togglePanel()
        }
        return
      }

      // Cmd/Ctrl + Shift + ` : New terminal
      if (modifier && e.key === '`' && e.shiftKey) {
        e.preventDefault()
        const activeProject = getActiveProject()
        createTerminal(activeProject?.path)
        return
      }

      // Cmd/Ctrl + 1-9 : Switch to terminal by index
      // Only handle when terminal panel is open
      if (modifier && panelMode !== 'closed' && panelMode !== 'minimized') {
        const num = parseInt(e.key, 10)
        if (num >= 1 && num <= 9) {
          e.preventDefault()
          const targetIndex = num - 1
          if (targetIndex < terminals.length) {
            setActiveTerminal(terminals[targetIndex].id)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    terminals,
    activeTerminalId,
    togglePanel,
    createTerminal,
    setActiveTerminal,
    panelMode,
    getActiveProject,
  ])
}
