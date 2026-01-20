// Terminal panel component - main container for terminals

import { useCallback } from 'react'
import { Minus, Maximize2, Minimize2, X, SplitSquareHorizontal, SplitSquareVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTerminalStore } from '@/stores/terminalStore'
import { TerminalInstance } from './TerminalInstance'
import { TerminalTabs } from './TerminalTabs'
import { ResizeHandle } from './ResizeHandle'
import { SplitResizeHandle } from './SplitResizeHandle'
import { Tooltip } from '@/components/ui/tooltip'

export function TerminalPanel() {
  const {
    terminals,
    activeTerminalId,
    panelMode,
    panelHeight,
    splitGroups,
    activeSplitGroupId,
    setPanelHeight,
    minimizePanel,
    maximizePanel,
    closePanel,
    splitTerminal,
    setActiveTerminal,
    updateSplitSizes,
  } = useTerminalStore()

  const handleResize = useCallback(
    (deltaY: number) => {
      // Convert pixel delta to percentage based on window height
      const windowHeight = window.innerHeight
      const deltaPercent = (deltaY / windowHeight) * 100
      setPanelHeight(panelHeight + deltaPercent)
    },
    [panelHeight, setPanelHeight]
  )

  const handleSplitHorizontal = () => {
    if (activeTerminalId) {
      splitTerminal(activeTerminalId, 'horizontal')
    }
  }

  const handleSplitVertical = () => {
    if (activeTerminalId) {
      splitTerminal(activeTerminalId, 'vertical')
    }
  }

  // Get the active split group
  const activeGroup = splitGroups.find((g) => g.id === activeSplitGroupId)

  // Handle resize between split panes
  const handleSplitResize = useCallback(
    (index: number, delta: number, containerSize: number) => {
      if (!activeGroup) return

      const deltaPercent = (delta / containerSize) * 100
      const newSizes = [...activeGroup.sizes]

      // Adjust sizes of adjacent panes
      newSizes[index] = Math.max(10, newSizes[index] + deltaPercent)
      newSizes[index + 1] = Math.max(10, newSizes[index + 1] - deltaPercent)

      // Normalize to ensure total is 100%
      const total = newSizes.reduce((a, b) => a + b, 0)
      const normalizedSizes = newSizes.map((s) => (s / total) * 100)

      updateSplitSizes(activeGroup.id, normalizedSizes)
    },
    [activeGroup, updateSplitSizes]
  )

  // Don't render if closed
  if (panelMode === 'closed') {
    return null
  }

  const isMinimized = panelMode === 'minimized'
  const isFullScreen = panelMode === 'full'

  // Get terminals for the active group
  const terminalsInGroup = activeGroup
    ? activeGroup.terminalIds
        .map((id) => terminals.find((t) => t.id === id))
        .filter((t): t is NonNullable<typeof t> => t !== undefined)
    : []

  return (
    <div
      className={cn(
        'flex flex-col bg-card border-t',
        isFullScreen && 'absolute inset-0 z-50',
        isMinimized && 'h-auto'
      )}
      style={{
        height: isMinimized ? 'auto' : isFullScreen ? '100%' : `${panelHeight}%`,
      }}
    >
      {/* Resize handle - only show when in panel mode */}
      {!isMinimized && !isFullScreen && <ResizeHandle onResize={handleResize} />}

      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-muted/50 border-b min-h-[32px]">
        {/* Left: Tabs */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-medium text-muted-foreground shrink-0">Terminal</span>
          {!isMinimized && <TerminalTabs className="flex-1 min-w-0" />}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-0.5 shrink-0">
          {!isMinimized && (
            <>
              <Tooltip content="Split Right" side="bottom">
                <button
                  onClick={handleSplitHorizontal}
                  className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  disabled={!activeTerminalId}
                >
                  <SplitSquareHorizontal className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <Tooltip content="Split Down" side="bottom">
                <button
                  onClick={handleSplitVertical}
                  className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                  disabled={!activeTerminalId}
                >
                  <SplitSquareVertical className="h-3.5 w-3.5" />
                </button>
              </Tooltip>
              <div className="w-px h-4 bg-border mx-1" />
            </>
          )}

          <Tooltip content={isMinimized ? 'Restore' : 'Minimize'} side="bottom">
            <button
              onClick={minimizePanel}
              className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {isMinimized ? (
                <Maximize2 className="h-3.5 w-3.5" />
              ) : (
                <Minus className="h-3.5 w-3.5" />
              )}
            </button>
          </Tooltip>

          <Tooltip content={isFullScreen ? 'Restore' : 'Maximize'} side="bottom">
            <button
              onClick={maximizePanel}
              className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              {isFullScreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          </Tooltip>

          <Tooltip content="Close" side="bottom">
            <button
              onClick={closePanel}
              className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Terminal content */}
      {!isMinimized && (
        <div className="flex-1 overflow-hidden">
          {terminals.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No terminals open
            </div>
          ) : activeGroup && terminalsInGroup.length > 1 ? (
            // Render split view
            <div
              className={cn(
                'flex h-full',
                activeGroup.direction === 'vertical' ? 'flex-col' : 'flex-row'
              )}
            >
              {terminalsInGroup.map((terminal, index) => (
                <div key={terminal.id} className="contents">
                  <div
                    className={cn(
                      'overflow-hidden',
                      terminal.id === activeTerminalId && 'ring-1 ring-primary/50'
                    )}
                    style={{
                      [activeGroup.direction === 'vertical' ? 'height' : 'width']:
                        `${activeGroup.sizes[index]}%`,
                    }}
                    onClick={() => setActiveTerminal(terminal.id)}
                  >
                    <TerminalInstance
                      terminalId={terminal.id}
                      cwd={terminal.cwd}
                      isActive={true} // All terminals in split view are "active" (visible)
                    />
                  </div>
                  {index < terminalsInGroup.length - 1 && (
                    <SplitResizeHandle
                      direction={activeGroup.direction}
                      onResize={(delta) => {
                        const container = document.querySelector('.flex-1.overflow-hidden')
                        if (container) {
                          const size =
                            activeGroup.direction === 'vertical'
                              ? container.clientHeight
                              : container.clientWidth
                          handleSplitResize(index, delta, size)
                        }
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            // Render single terminal (tab-based view)
            terminals.map((terminal) => (
              <TerminalInstance
                key={terminal.id}
                terminalId={terminal.id}
                cwd={terminal.cwd}
                isActive={terminal.id === activeTerminalId}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}
