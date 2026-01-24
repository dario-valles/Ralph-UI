// Terminal panel component - main container for terminals

import { useCallback, useRef } from 'react'
import {
  Minus,
  Maximize2,
  Minimize2,
  X,
  SplitSquareHorizontal,
  SplitSquareVertical,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTerminalStore, type PaneNode } from '@/stores/terminalStore'
import { TerminalInstance } from './TerminalInstance'
import { AgentTerminalInstance } from './AgentTerminalInstance'
import { TerminalTabs } from './TerminalTabs'
import { ResizeHandle } from './ResizeHandle'
import { SplitResizeHandle } from './SplitResizeHandle'
import { TerminalKeyBar } from './TerminalKeyBar'
import { Tooltip } from '@/components/ui/tooltip'
import { useIsMobile } from '@/hooks/useMediaQuery'

// Terminal info for rendering
interface TerminalInfo {
  id: string
  cwd: string
  terminalType: 'shell' | 'agent'
  agentId?: string
}

// Recursive pane renderer
interface PaneRendererProps {
  node: PaneNode
  terminals: TerminalInfo[]
  activeTerminalId: string | null
  onSelectTerminal: (id: string) => void
  onUpdateSizes: (paneId: string, sizes: number[]) => void
}

function PaneRenderer({
  node,
  terminals,
  activeTerminalId,
  onSelectTerminal,
  onUpdateSizes,
}: PaneRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  if (node.type === 'terminal') {
    const terminal = terminals.find((t) => t.id === node.terminalId)
    if (!terminal) return null

    return (
      <div
        className={cn(
          'h-full w-full overflow-hidden',
          node.terminalId === activeTerminalId && 'ring-1 ring-primary/50 ring-inset'
        )}
        onClick={() => onSelectTerminal(node.terminalId)}
      >
        {terminal.terminalType === 'agent' && terminal.agentId ? (
          <AgentTerminalInstance
            terminalId={node.terminalId}
            agentId={terminal.agentId}
            isActive={true}
          />
        ) : (
          <TerminalInstance terminalId={node.terminalId} cwd={terminal.cwd} isActive={true} />
        )}
      </div>
    )
  }

  // Split pane
  const isVertical = node.direction === 'vertical'

  const handleResize = (index: number, delta: number) => {
    if (!containerRef.current) return

    const containerSize = isVertical
      ? containerRef.current.clientHeight
      : containerRef.current.clientWidth

    const deltaPercent = (delta / containerSize) * 100
    const newSizes = [...node.sizes]

    newSizes[index] = Math.max(10, newSizes[index] + deltaPercent)
    newSizes[index + 1] = Math.max(10, newSizes[index + 1] - deltaPercent)

    // Normalize
    const total = newSizes.reduce((a, b) => a + b, 0)
    const normalizedSizes = newSizes.map((s) => (s / total) * 100)

    onUpdateSizes(node.id, normalizedSizes)
  }

  return (
    <div
      ref={containerRef}
      className={cn('flex h-full w-full', isVertical ? 'flex-col' : 'flex-row')}
    >
      {node.children.map((child, index) => (
        <div key={child.id} className="contents">
          <div
            style={{
              [isVertical ? 'height' : 'width']: `${node.sizes[index]}%`,
              [isVertical ? 'width' : 'height']: '100%',
            }}
            className="overflow-hidden"
          >
            <PaneRenderer
              node={child}
              terminals={terminals}
              activeTerminalId={activeTerminalId}
              onSelectTerminal={onSelectTerminal}
              onUpdateSizes={onUpdateSizes}
            />
          </div>
          {index < node.children.length - 1 && (
            <SplitResizeHandle
              direction={node.direction}
              onResize={(delta) => handleResize(index, delta)}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export function TerminalPanel() {
  const {
    terminals,
    activeTerminalId,
    panelMode,
    panelHeight,
    rootPane,
    setPanelHeight,
    minimizePanel,
    maximizePanel,
    closePanel,
    splitTerminal,
    setActiveTerminal,
    updatePaneSizes,
  } = useTerminalStore()

  const isMobile = useIsMobile()

  const handleResize = useCallback(
    (deltaY: number) => {
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

  if (panelMode === 'closed') {
    return null
  }

  const isMinimized = panelMode === 'minimized'
  const isFullScreen = panelMode === 'full'

  // On mobile, always use fullscreen mode when open (not minimized)
  const effectiveFullScreen = isMobile ? !isMinimized : isFullScreen

  return (
    <div
      className={cn(
        'flex flex-col bg-card border-t overflow-hidden',
        effectiveFullScreen && 'fixed inset-0 z-50',
        !effectiveFullScreen && 'safe-bottom',
        isMinimized && 'h-auto'
      )}
      style={{
        height: isMinimized ? 'auto' : effectiveFullScreen ? '100%' : `${panelHeight}%`,
        overscrollBehavior: 'contain',
        touchAction: 'none',
      }}
    >
      {/* Resize handle - hidden on mobile */}
      {!isMinimized && !effectiveFullScreen && !isMobile && (
        <ResizeHandle onResize={handleResize} />
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 bg-muted/50 border-b min-h-[40px] md:min-h-[32px] shrink-0 select-none">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-xs font-medium text-muted-foreground shrink-0">Terminal</span>
          {!isMinimized && <TerminalTabs className="flex-1 min-w-0" />}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* Split controls - hidden on mobile */}
          {!isMinimized && !isMobile && (
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

          {/* Minimize - hidden on mobile (use close instead) */}
          {!isMobile && (
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
          )}

          {/* Maximize - hidden on mobile */}
          {!isMobile && (
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
          )}

          <Tooltip content="Close" side="bottom">
            <button
              onClick={closePanel}
              className="flex items-center justify-center w-9 h-9 md:w-6 md:h-6 rounded text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              aria-label="Close terminal"
            >
              <X className="h-5 w-5 md:h-3.5 md:w-3.5" />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Mobile key bar - outside scrollable area, stays fixed */}
      {!isMinimized && isMobile && <TerminalKeyBar className="shrink-0 select-none" />}

      {/* Terminal content */}
      {!isMinimized && (
        <div className="flex-1 min-h-0 overflow-hidden" style={{ touchAction: 'pan-y' }}>
          {!rootPane ? (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              No terminals open
            </div>
          ) : (
            <PaneRenderer
              node={rootPane}
              terminals={terminals.map((t) => ({
                id: t.id,
                cwd: t.cwd,
                terminalType: t.terminalType,
                agentId: t.agentId,
              }))}
              activeTerminalId={activeTerminalId}
              onSelectTerminal={setActiveTerminal}
              onUpdateSizes={updatePaneSizes}
            />
          )}
        </div>
      )}
    </div>
  )
}
