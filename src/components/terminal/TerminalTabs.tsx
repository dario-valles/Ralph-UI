// Terminal tabs component

import { X, Plus, Bot } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTerminalStore } from '@/stores/terminalStore'
import { useProjectStore } from '@/stores/projectStore'
import { Tooltip } from '@/components/ui/tooltip'

interface TerminalTabsProps {
  className?: string
}

export function TerminalTabs({ className }: TerminalTabsProps) {
  const { terminals, activeTerminalId, setActiveTerminal, closeTerminal, createTerminal } =
    useTerminalStore()
  const { getActiveProject } = useProjectStore()

  const handleNewTerminal = () => {
    const activeProject = getActiveProject()
    createTerminal(activeProject?.path)
  }

  const handleCloseTerminal = (e: React.MouseEvent, id: string, isAgent: boolean) => {
    e.stopPropagation()
    // Warn before closing active agent terminal
    if (isAgent) {
      // Agent terminals don't kill the process when closed, just the view
      // No warning needed as it's non-destructive
    }
    closeTerminal(id)
  }

  return (
    <div className={cn('flex items-center gap-0.5 overflow-x-auto', className)}>
      {terminals.map((terminal) => (
        <div
          key={terminal.id}
          role="tab"
          tabIndex={0}
          onClick={() => setActiveTerminal(terminal.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setActiveTerminal(terminal.id)
            }
          }}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1 text-xs rounded-t cursor-pointer',
            'transition-colors group min-w-0',
            terminal.id === activeTerminalId
              ? 'bg-[#1a1a1a] text-[#e0e0e0]'
              : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {/* Agent indicator */}
          {terminal.terminalType === 'agent' && (
            <Bot className="h-3 w-3 flex-shrink-0 text-blue-400" />
          )}
          <span className="truncate max-w-[120px]">{terminal.title}</span>
          {/* Exited status indicator for agent terminals */}
          {terminal.terminalType === 'agent' && terminal.agentStatus === 'exited' && (
            <span className="text-[10px] text-gray-500">(exited)</span>
          )}
          <button
            onClick={(e) => handleCloseTerminal(e, terminal.id, terminal.terminalType === 'agent')}
            className={cn(
              'flex-shrink-0 p-0.5 rounded hover:bg-muted-foreground/20',
              'opacity-0 group-hover:opacity-100 transition-opacity',
              terminal.id === activeTerminalId && 'opacity-100'
            )}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      <Tooltip content="New Terminal" side="bottom">
        <button
          onClick={handleNewTerminal}
          className="flex items-center justify-center p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </Tooltip>
    </div>
  )
}
