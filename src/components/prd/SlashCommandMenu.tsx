import { useState } from 'react'
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command'
import { cn } from '@/lib/utils'
import { SLASH_COMMANDS, type SlashCommand } from '@/lib/prd-chat-commands'

interface SlashCommandMenuProps {
  isOpen: boolean
  onSelect: (command: SlashCommand) => void
  query: string
}

export function SlashCommandMenu({ isOpen, onSelect, query }: SlashCommandMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [prevQuery, setPrevQuery] = useState(query)

  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.label.toLowerCase().includes(query.toLowerCase())
  )

  // Adjust state during render when props change (React recommended pattern)
  if (query !== prevQuery) {
    setSelectedIndex(0)
    setPrevQuery(query)
  }

  if (!isOpen || filteredCommands.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover border border-border rounded-md shadow-md z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
      <Command className="w-full">
        <CommandList>
          <CommandGroup heading="Commands">
            {filteredCommands.map((command, index) => (
              <CommandItem
                key={command.id}
                onSelect={() => onSelect(command)}
                className={cn('cursor-pointer', index === selectedIndex && 'bg-accent text-accent-foreground')}
              >
                {command.icon}
                <div className="flex flex-col">
                  <span>{command.label}</span>
                  <span className="text-xs text-muted-foreground">{command.description}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  )
}
