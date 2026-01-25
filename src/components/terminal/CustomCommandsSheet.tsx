// Custom commands side sheet for saving and using frequently used commands

import { useState, useMemo } from 'react'
import { Plus, Trash2, ChevronDown, ChevronRight, X, Edit2, AlertCircle, Check, Terminal, Search } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useCustomCommandsStore, CustomCommand } from '@/stores/customCommandsStore'
import { writeToTerminal } from '@/lib/terminal-api'
import { useTerminalStore } from '@/stores/terminalStore'
import { cn } from '@/lib/utils'
import { isCommandOverriding } from '@/lib/command-priority'

interface CustomCommandsSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CustomCommandsSheet({ open, onOpenChange }: CustomCommandsSheetProps) {
  const { activeTerminalId } = useTerminalStore()
  const {
    commands,
    addCommand,
    deleteCommand,
    editCommand,
    getAllCategories,
    reorderCommands,
    projectPath,
  } = useCustomCommandsStore()
  const [label, setLabel] = useState('')
  const [command, setCommand] = useState('')
  const [action, setAction] = useState<'insert' | 'execute'>('execute')
  const [category, setCategory] = useState('Uncategorized')
  const [scope, setScope] = useState<'local' | 'project' | 'global'>('local')
  const [showForm, setShowForm] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['Uncategorized'])
  )
  const [selectedFilter, setSelectedFilter] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [viewingOverrideFor, setViewingOverrideFor] = useState<string | null>(null)
  const [executedCommandId, setExecutedCommandId] = useState<string | null>(null)

  const allCategories = useMemo(() => getAllCategories(), [getAllCategories])

  const getOverriddenCommand = (cmdId: string): CustomCommand | undefined => {
    const cmd = commands.find((c) => c.id === cmdId)
    if (!cmd) return undefined
    return isCommandOverriding(cmd, commands)
  }

  const filteredCommands = useMemo(() => {
    if (!searchQuery.trim()) {
      return commands
    }
    const query = searchQuery.toLowerCase()
    return commands.filter(
      (cmd) => cmd.label.toLowerCase().includes(query) || cmd.command.toLowerCase().includes(query)
    )
  }, [commands, searchQuery])

  const displayedGroups = useMemo(() => {
    const groups: Record<string, typeof commands> = {}
    filteredCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = []
      }
      groups[cmd.category].push(cmd)
    })
    const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))

    if (!selectedFilter) {
      return sorted
    }
    return sorted.filter(([cat]) => cat === selectedFilter)
  }, [filteredCommands, selectedFilter])

  const handleAddCommand = async () => {
    if (label.trim() && command.trim()) {
      setIsSaving(true)
      try {
        if (editingId) {
          await editCommand(editingId, label, command, action, category, scope)
          setEditingId(null)
        } else {
          await addCommand(label, command, action, category, scope)
        }
        setLabel('')
        setCommand('')
        setAction('execute')
        setCategory('Uncategorized')
        setScope('local')
        setShowForm(false)
      } catch (error) {
        console.error('Failed to save command:', error)
      } finally {
        setIsSaving(false)
      }
    }
  }

  const handleEditCommand = (cmd: CustomCommand) => {
    setLabel(cmd.label)
    setCommand(cmd.command)
    setAction(cmd.action)
    setCategory(cmd.category)
    setScope(cmd.scope)
    setEditingId(cmd.id)
    setShowForm(true)
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setLabel('')
    setCommand('')
    setAction('execute')
    setCategory('Uncategorized')
    setScope('local')
    setEditingId(null)
  }

  const handleDeleteCommand = async (id: string) => {
    setIsSaving(true)
    try {
      await deleteCommand(id)
      setDeleteConfirmId(null)
    } catch (error) {
      console.error('Failed to delete command:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  const handleDropCommand = async (targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null)
      return
    }

    const newCommands = [...commands]
    const draggedCmd = newCommands[draggedIndex]
    newCommands.splice(draggedIndex, 1)
    newCommands.splice(targetIndex, 0, draggedCmd)
    setIsSaving(true)
    try {
      await reorderCommands(newCommands)
    } catch (error) {
      console.error('Failed to reorder commands:', error)
    } finally {
      setIsSaving(false)
      setDraggedIndex(null)
    }
  }

  const toggleCategoryExpanded = (cat: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(cat)) {
      newExpanded.delete(cat)
    } else {
      newExpanded.add(cat)
    }
    setExpandedCategories(newExpanded)
  }

  const handleUseCommand = (cmdId: string, cmd: string, action: 'insert' | 'execute') => {
    if (activeTerminalId) {
      writeToTerminal(activeTerminalId, cmd)
      // If action is 'execute', also send a newline to run the command
      if (action === 'execute') {
        writeToTerminal(activeTerminalId, '\r')
      }
      // Show confirmation feedback
      setExecutedCommandId(cmdId)
      setTimeout(() => setExecutedCommandId(null), 600)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-96 flex flex-col">
        <SheetHeader>
          <SheetTitle>Custom Commands</SheetTitle>
        </SheetHeader>

        {/* Priority Info */}
        <div className="bg-blue-50/50 border border-blue-200/50 rounded p-3 text-xs text-blue-900 space-y-1">
          <div className="font-medium">Command Priority:</div>
          <div className="ml-2 space-y-0.5">
            <div>1. 🔄 Project commands (highest)</div>
            <div>2. 🌐 Global commands</div>
            <div>3. 📱 Local commands (lowest)</div>
          </div>
          <div className="text-blue-800 mt-2">
            If commands have the same label, the highest priority version is used. Project commands
            override Global commands.
          </div>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col">
          {/* Add Command Button */}
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center justify-center gap-2 px-3 py-2 mb-4 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Command
          </button>

          {/* Search Input - Only show if >10 commands */}
          {commands.length > 10 && (
            <div className="relative mb-4">
              <input
                type="text"
                placeholder="Search commands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded bg-background pr-8"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          {/* Add/Edit Command Form */}
          {showForm && (
            <div className="border rounded p-3 mb-4 bg-muted/50 space-y-2">
              <div className="text-sm font-medium text-foreground mb-2">
                {editingId ? 'Edit Command' : 'Add New Command'}
              </div>
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
                  <label className="text-xs font-medium text-muted-foreground">Category:</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border rounded bg-background"
                  >
                    {['Uncategorized', ...allCategories.filter((c) => c !== 'Uncategorized')].map(
                      (cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      )
                    )}
                    <option value="">+ New Category</option>
                  </select>
                </div>
                {category === '' && (
                  <input
                    type="text"
                    placeholder="Enter new category name"
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-2 py-1 text-sm border rounded bg-background"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        handleAddCommand()
                      }
                    }}
                  />
                )}
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
                  <label className="text-xs font-medium text-muted-foreground">Scope:</label>
                  <select
                    value={scope}
                    onChange={(e) => setScope(e.target.value as 'local' | 'project' | 'global')}
                    className="flex-1 px-2 py-1 text-sm border rounded bg-background"
                    disabled={scope === 'project' && !projectPath}
                  >
                    <option value="local">Local (this device only)</option>
                    <option value="project" disabled={!projectPath}>
                      Project (shared via git)
                    </option>
                    <option value="global">Global (all projects)</option>
                  </select>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddCommand}
                    disabled={isSaving}
                    className="flex-1 px-3 py-1 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={handleCancelForm}
                    disabled={isSaving}
                    className="flex-1 px-3 py-1 text-sm bg-muted text-muted-foreground rounded hover:bg-muted/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Category Filter */}
          {allCategories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setSelectedFilter(null)}
                className={cn(
                  'px-2 py-1 text-xs rounded transition-colors',
                  !selectedFilter
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                All ({filteredCommands.length})
              </button>
              {allCategories.map((cat) => {
                const count = filteredCommands.filter((c) => c.category === cat).length
                return (
                  <button
                    key={cat}
                    onClick={() => setSelectedFilter(selectedFilter === cat ? null : cat)}
                    className={cn(
                      'px-2 py-1 text-xs rounded transition-colors',
                      selectedFilter === cat
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {cat} ({count})
                  </button>
                )
              })}
            </div>
          )}

          {/* Commands List - Grouped by Category */}
          <div className="space-y-3 flex-1">
            {commands.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Terminal className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No commands saved yet. Add one to get started!</p>
              </div>
            ) : displayedGroups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Search className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No commands in this category.</p>
              </div>
            ) : (
              displayedGroups.map(([cat, categoryCommands]) => (
                <div key={cat}>
                  {/* Category Header */}
                  <button
                    onClick={() => toggleCategoryExpanded(cat)}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm font-medium rounded bg-muted/50 hover:bg-muted/70 transition-colors"
                  >
                    {expandedCategories.has(cat) ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                    <span className="flex-1 text-left">{cat}</span>
                    <span className="text-xs text-muted-foreground">{categoryCommands.length}</span>
                  </button>

                  {/* Category Commands */}
                  {expandedCategories.has(cat) && (
                    <div className="ml-2 mt-2 space-y-2">
                      {categoryCommands.map((cmd) => {
                        const cmdIndex = commands.findIndex((c) => c.id === cmd.id)
                        return (
                          <div
                            key={cmd.id}
                            draggable
                            onDragStart={() => handleDragStart(cmdIndex)}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDropCommand(cmdIndex)}
                            className={`border rounded p-3 transition-all cursor-move ${
                              draggedIndex === cmdIndex
                                ? 'bg-muted/70 opacity-50'
                                : executedCommandId === cmd.id
                                  ? 'bg-green-500/20 border-green-500/50'
                                  : 'bg-muted/30 hover:bg-muted/50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <button
                                onClick={() => handleUseCommand(cmd.id, cmd.command, cmd.action)}
                                className="flex-1 text-left"
                              >
                                <div className="font-medium text-sm text-foreground hover:text-primary">
                                  {cmd.label}
                                </div>
                                <div className="text-xs text-muted-foreground font-mono break-words">
                                  {cmd.command}
                                </div>
                              </button>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => handleEditCommand(cmd)}
                                  className="flex items-center justify-center w-6 h-6 text-primary hover:bg-primary/10 rounded transition-colors"
                                  aria-label="Edit command"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteConfirmId(cmd.id)}
                                  className="flex items-center justify-center w-6 h-6 text-destructive hover:bg-destructive/10 rounded transition-colors"
                                  aria-label="Delete command"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${
                                  cmd.action === 'execute'
                                    ? 'bg-primary/20 text-primary'
                                    : 'bg-secondary/20 text-secondary-foreground'
                                }`}
                              >
                                {cmd.action === 'execute' ? '↵ Execute' : '← Insert'}
                              </span>
                              {executedCommandId === cmd.id && (
                                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-green-500/20 text-green-600 animate-pulse">
                                  <Check className="w-3 h-3 mr-1" />
                                  Executed
                                </span>
                              )}
                              <span
                                className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${
                                  cmd.scope === 'project'
                                    ? 'bg-blue/20 text-blue'
                                    : cmd.scope === 'global'
                                      ? 'bg-purple/20 text-purple'
                                      : 'bg-muted/20 text-muted-foreground'
                                }`}
                              >
                                {cmd.scope === 'project'
                                  ? '🔄 Project'
                                  : cmd.scope === 'global'
                                    ? '🌐 Global'
                                    : '📱 Local'}
                              </span>
                              {cmd.scope === 'project' && getOverriddenCommand(cmd.id) && (
                                <button
                                  onClick={() =>
                                    setViewingOverrideFor(
                                      viewingOverrideFor === cmd.id ? null : cmd.id
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-amber-100/20 text-amber-700 hover:bg-amber-100/30 transition-colors"
                                  title="This project command overrides a global command"
                                >
                                  <AlertCircle className="w-3 h-3" />
                                  Overrides
                                </button>
                              )}
                            </div>
                            {/* Override Information */}
                            {viewingOverrideFor === cmd.id && getOverriddenCommand(cmd.id) && (
                              <div className="mt-2 p-3 bg-amber-50/50 border border-amber-200/50 rounded text-sm">
                                <div className="font-medium text-amber-900 mb-2">
                                  Overriding Global Command:
                                </div>
                                <div className="ml-2 pl-2 border-l-2 border-amber-200 space-y-1">
                                  {(() => {
                                    const overridden = getOverriddenCommand(cmd.id)
                                    return (
                                      <>
                                        <div className="text-xs text-amber-800/80">
                                          <span className="font-mono">{overridden?.label}</span>
                                        </div>
                                        <div className="text-xs text-amber-700/70 font-mono break-all">
                                          {overridden?.command}
                                        </div>
                                      </>
                                    )
                                  })()}
                                </div>
                              </div>
                            )}

                            {/* Delete Confirmation */}
                            {deleteConfirmId === cmd.id && (
                              <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-foreground">
                                <div className="mb-2">Delete this command?</div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleDeleteCommand(cmd.id)}
                                    className="flex-1 px-2 py-1 text-xs bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="flex-1 px-2 py-1 text-xs bg-muted text-muted-foreground rounded hover:bg-muted/80 transition-colors"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
