// Custom commands side sheet for saving and using frequently used commands

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useCustomCommandsStore } from '@/stores/customCommandsStore'
import { writeToTerminal } from '@/lib/terminal-api'
import { useTerminalStore } from '@/stores/terminalStore'

interface CustomCommandsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CustomCommandsSheet({ open, onOpenChange }: CustomCommandsSheetProps) {
  const { activeTerminalId } = useTerminalStore()
  const { commands, addCommand, deleteCommand } = useCustomCommandsStore()
  const [label, setLabel] = useState('')
  const [command, setCommand] = useState('')
  const [action, setAction] = useState<'insert' | 'execute'>('execute')
  const [showForm, setShowForm] = useState(false)

  const handleAddCommand = () => {
    if (label.trim() && command.trim()) {
      addCommand(label, command, action)
      setLabel('')
      setCommand('')
      setAction('execute')
      setShowForm(false)
    }
  }

  const handleUseCommand = (cmd: string, action: 'insert' | 'execute') => {
    if (activeTerminalId) {
      writeToTerminal(activeTerminalId, cmd)
      // If action is 'execute', also send a newline to run the command
      if (action === 'execute') {
        writeToTerminal(activeTerminalId, '\r')
      }
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-96 flex flex-col">
        <SheetHeader>
          <SheetTitle>Custom Commands</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Add Command Button */}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center justify-center gap-2 px-3 py-2 mb-4 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Command
          </button>

          {/* Add Command Form */}
          {showForm && (
            <div className="border rounded p-3 mb-4 bg-muted/50 space-y-2">
              <input
                type="text"
                placeholder="Label (e.g., 'Clear screen')"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full px-2 py-1 text-sm border rounded bg-background"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleAddCommand()
                  }
                }}
              />
              <textarea
                placeholder="Command (e.g., 'clear')"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="w-full px-2 py-1 text-sm border rounded bg-background resize-none"
                rows={3}
              />
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <label className="text-xs font-medium text-muted-foreground">Action:</label>
                  <select
                    value={action}
                    onChange={(e) => setAction(e.target.value as 'insert' | 'execute')}
                    className="flex-1 px-2 py-1 text-sm border rounded bg-background"
                  >
                    <option value="insert">Insert (no newline)</option>
                    <option value="execute">Execute (with newline)</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddCommand}
                    className="flex-1 px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setShowForm(false)
                      setLabel('')
                      setCommand('')
                      setAction('execute')
                    }}
                    className="flex-1 px-3 py-1 text-sm bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Commands List */}
          <div className="space-y-2 flex-1">
            {commands.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No commands saved yet. Add one to get started!
              </div>
            ) : (
              commands.map((cmd) => (
                <div
                  key={cmd.id}
                  className="border rounded p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <button
                      onClick={() => handleUseCommand(cmd.command, cmd.action)}
                      className="flex-1 text-left"
                    >
                      <div className="font-medium text-sm text-foreground hover:text-primary">
                        {cmd.label}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono break-words">
                        {cmd.command}
                      </div>
                    </button>
                    <button
                      onClick={() => deleteCommand(cmd.id)}
                      className="flex items-center justify-center w-6 h-6 text-destructive hover:bg-destructive/10 rounded transition-colors shrink-0"
                      aria-label="Delete command"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex items-center">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${
                        cmd.action === 'execute'
                          ? 'bg-primary/20 text-primary'
                          : 'bg-secondary/20 text-secondary-foreground'
                      }`}
                    >
                      {cmd.action === 'execute' ? '↵ Execute' : '← Insert'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
