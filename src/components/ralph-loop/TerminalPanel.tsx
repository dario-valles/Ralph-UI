import { Button } from '@/components/ui/button'
import { GitFork, PanelTopClose, PanelTop, GripHorizontal, Terminal } from 'lucide-react'
import { UnifiedTerminalView } from '@/components/terminal/UnifiedTerminalView'
import { AgentTree } from './AgentTree'

export interface TerminalPanelProps {
  currentAgentId: string | null
  activeExecutionId: string | null
  isTreeVisible: boolean
  panelHeight: number
  containerRef: React.RefObject<HTMLDivElement | null>
  onToggleTreeView: () => void
  onResizeStart: (e: React.MouseEvent) => void
}

export function TerminalPanel({
  currentAgentId,
  activeExecutionId,
  isTreeVisible,
  panelHeight,
  containerRef,
  onToggleTreeView,
  onResizeStart,
}: TerminalPanelProps): React.JSX.Element {
  if (!currentAgentId || !activeExecutionId) {
    return (
      <div className="h-full min-h-[200px] bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <Terminal className="h-12 w-12 text-zinc-600 mx-auto mb-2" />
          <p className="text-zinc-500">No active agent</p>
          <p className="text-sm text-zinc-600">Start the Ralph Loop to see terminal output</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full" ref={containerRef}>
      {/* Tree View Toggle Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <GitFork className="h-4 w-4" />
          <span>Subagent Tree</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={onToggleTreeView}
          title={isTreeVisible ? 'Hide tree view' : 'Show tree view'}
          data-testid="toggle-tree-view"
        >
          {isTreeVisible ? (
            <PanelTopClose className="h-4 w-4" />
          ) : (
            <PanelTop className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Agent Tree - Hierarchical Subagent Visualization (Collapsible) */}
      {isTreeVisible && (
        <>
          <div
            style={{ height: `${panelHeight}%` }}
            className="min-h-[100px] overflow-hidden"
            data-testid="tree-panel"
          >
            <AgentTree agentId={currentAgentId} maxHeight="100%" className="p-2 h-full" />
          </div>

          {/* Resize Handle */}
          <div
            className="h-2 border-y bg-muted/50 hover:bg-muted cursor-row-resize flex items-center justify-center group"
            onMouseDown={onResizeStart}
            data-testid="resize-handle"
          >
            <GripHorizontal className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
          </div>
        </>
      )}

      {/* Terminal Output */}
      <div className="flex-1 min-h-0">
        <UnifiedTerminalView
          key={`unified-${activeExecutionId}`}
          agentId={currentAgentId}
          className="h-full"
        />
      </div>
    </div>
  )
}
