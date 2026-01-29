import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { SLASH_COMMANDS, type SlashCommand } from '@/lib/prd-chat-commands'

interface SlashCommandMenuProps {
  isOpen: boolean
  onSelect: (command: SlashCommand) => void
  query: string
  selectedIndex: number
}

export function SlashCommandMenu({ isOpen, onSelect, query, selectedIndex }: SlashCommandMenuProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLButtonElement>(null)

  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  )

  // Scroll selected item into view
  useEffect(() => {
    if (isOpen && selectedItemRef.current && scrollContainerRef.current) {
      const container = scrollContainerRef.current
      const item = selectedItemRef.current
      
      const containerTop = container.scrollTop
      const containerBottom = containerTop + container.clientHeight
      const itemTop = item.offsetTop
      const itemBottom = itemTop + item.offsetHeight

      if (itemTop < containerTop) {
        container.scrollTop = itemTop
      } else if (itemBottom > containerBottom) {
        container.scrollTop = itemBottom - container.clientHeight
      }
    }
  }, [selectedIndex, isOpen])

  if (!isOpen || filteredCommands.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 pb-1">
      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border/50 bg-muted/30">
        Commands
      </div>
      <div 
        ref={scrollContainerRef}
        className="max-h-[300px] overflow-y-auto p-1 scroll-smooth"
      >
        {filteredCommands.map((command, index) => (
          <button
            key={command.id}
            ref={index === selectedIndex ? selectedItemRef : null}
            type="button"
            onClick={() => onSelect(command)}
            className={cn(
              'w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-colors',
              index === selectedIndex
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                : 'text-foreground hover:bg-muted border border-transparent'
            )}
          >
            <div className={cn(
              'mt-0.5 p-1 rounded-md',
              index === selectedIndex ? 'bg-emerald-500/20' : 'bg-muted'
            )}>
              {command.icon}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium leading-none mb-1">{command.label}</span>
              <span className="text-[11px] text-muted-foreground line-clamp-1">
                {command.description}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
