import { useRef, useEffect, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { Star } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  SLASH_COMMANDS,
  type SlashCommand,
  configsToSlashCommands,
} from '@/lib/prd-chat-commands'
import { useChatCommandStore } from '@/stores/chatCommandStore'
import { useProjectStore } from '@/stores/projectStore'

interface SlashCommandMenuProps {
  isOpen: boolean
  onSelect: (command: SlashCommand) => void
  query: string
  selectedIndex: number
}

export function SlashCommandMenu({ isOpen, onSelect, query, selectedIndex }: SlashCommandMenuProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const selectedItemRef = useRef<HTMLButtonElement>(null)

  // Get commands from store
  const storeCommands = useChatCommandStore((state) => state.commands)
  const loading = useChatCommandStore((state) => state.loading)
  const loadCommands = useChatCommandStore((state) => state.loadCommands)
  const activeProjectId = useProjectStore((state) => state.activeProjectId)
  const projects = useProjectStore((state) => state.projects)
  const activeProjectInfo = activeProjectId && Array.isArray(projects)
    ? projects.find((p) => p.id === activeProjectId)
    : undefined

  // Load commands on mount if not loaded
  useEffect(() => {
    if (storeCommands.length === 0 && !loading) {
      loadCommands(activeProjectInfo?.path)
    }
  }, [storeCommands.length, loading, loadCommands, activeProjectInfo?.path])

  // Convert store commands to SlashCommands, merging with action commands from SLASH_COMMANDS
  const allCommands = useMemo(() => {
    // Get action-type commands from SLASH_COMMANDS (these aren't in the store)
    const actionCommands = SLASH_COMMANDS.filter((cmd) => cmd.type === 'action')

    if (storeCommands.length > 0) {
      // Filter to only enabled commands and convert
      const enabledConfigs = storeCommands.filter((c) => c.enabled)
      const templateCommands = configsToSlashCommands(enabledConfigs)
      // Merge template commands from store with action commands
      return [...templateCommands, ...actionCommands]
    }
    // Fallback to hardcoded commands if store not loaded
    return SLASH_COMMANDS
  }, [storeCommands])

  // Get favorite command IDs for highlighting
  const favoriteIds = useMemo(() => {
    return new Set(storeCommands.filter((c) => c.favorite && c.enabled).map((c) => c.id))
  }, [storeCommands])

  // Get custom command IDs for badge
  const customIds = useMemo(() => {
    return new Set(storeCommands.filter((c) => c.scope !== 'builtin').map((c) => c.id))
  }, [storeCommands])

  // Filter commands based on query
  const filteredCommands = useMemo(() => {
    return allCommands.filter((cmd) =>
      cmd.label.toLowerCase().includes(query.toLowerCase())
    )
  }, [allCommands, query])

  // Separate favorites from regular commands
  const favoriteCommands = useMemo(() => {
    return filteredCommands.filter((cmd) => favoriteIds.has(cmd.id))
  }, [filteredCommands, favoriteIds])

  const regularCommands = useMemo(() => {
    return filteredCommands.filter((cmd) => !favoriteIds.has(cmd.id))
  }, [filteredCommands, favoriteIds])

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

  // Calculate selected index across both lists
  let currentIndex = 0

  const renderCommandItem = (command: SlashCommand, isFavorite: boolean) => {
    const isSelected = currentIndex === selectedIndex
    const isCustom = customIds.has(command.id)
    currentIndex++

    return (
      <button
        key={command.id}
        ref={isSelected ? selectedItemRef : null}
        type="button"
        onClick={() => onSelect(command)}
        className={cn(
          'w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-colors',
          isSelected
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
            : 'text-foreground hover:bg-muted border border-transparent'
        )}
      >
        <div className={cn(
          'mt-0.5 p-1 rounded-md',
          isSelected ? 'bg-emerald-500/20' : 'bg-muted'
        )}>
          {command.icon}
        </div>
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium leading-none">{command.label}</span>
            {isCustom && (
              <Badge variant="outline" className="text-[10px] py-0 px-1">
                custom
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground line-clamp-1 mt-1">
            {command.description}
          </span>
        </div>
        {isFavorite && (
          <Star className="h-3 w-3 text-amber-500 fill-amber-500 mt-1 shrink-0" />
        )}
      </button>
    )
  }

  return (
    <div className="absolute bottom-full left-0 mb-2 w-72 bg-popover border border-border rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 pb-1">
      <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border/50 bg-muted/30">
        Commands
      </div>
      <div
        ref={scrollContainerRef}
        className="max-h-[300px] overflow-y-auto p-1 scroll-smooth"
      >
        {/* Favorites Section */}
        {favoriteCommands.length > 0 && (
          <>
            <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
              <Star className="h-2.5 w-2.5" />
              Favorites
            </div>
            {favoriteCommands.map((command) => renderCommandItem(command, true))}
            {regularCommands.length > 0 && (
              <div className="border-t border-border/50 my-1" />
            )}
          </>
        )}

        {/* All Commands Section */}
        {regularCommands.length > 0 && (
          <>
            {favoriteCommands.length > 0 && (
              <div className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                All Commands
              </div>
            )}
            {regularCommands.map((command) => renderCommandItem(command, false))}
          </>
        )}
      </div>
    </div>
  )
}

