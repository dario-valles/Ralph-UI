// Task Preview Dialog - Shows extracted tasks before export with edit capability
import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit2,
  Check,
  X,
  GripVertical,
  AlertCircle,
  Loader2,
  ArrowUp,
  ArrowDown,
  Link,
} from 'lucide-react'
import type { ExtractedPRDStructure, StructuredPRDItem } from '@/types'

interface TaskPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  extractedStructure: ExtractedPRDStructure | null
  onConfirm: (structure: ExtractedPRDStructure) => Promise<void>
  loading?: boolean
}

interface EditableTaskState {
  id: string
  title: string
  description: string
  isEditing: boolean
}

export function TaskPreviewDialog({
  open,
  onOpenChange,
  extractedStructure,
  onConfirm,
  loading = false,
}: TaskPreviewDialogProps) {
  const [structure, setStructure] = useState<ExtractedPRDStructure | null>(null)
  const [editingTask, setEditingTask] = useState<EditableTaskState | null>(null)
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(new Set())
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set())
  const [confirming, setConfirming] = useState(false)

  // Initialize local state when dialog opens
  useEffect(() => {
    if (open && extractedStructure) {
      setStructure(JSON.parse(JSON.stringify(extractedStructure)))
      // Expand all epics by default
      setExpandedEpics(new Set(extractedStructure.epics.map((e) => e.id)))
    }
  }, [open, extractedStructure])

  const toggleEpic = (epicId: string) => {
    setExpandedEpics((prev) => {
      const next = new Set(prev)
      if (next.has(epicId)) {
        next.delete(epicId)
      } else {
        next.add(epicId)
      }
      return next
    })
  }

  const toggleStory = (storyId: string) => {
    setExpandedStories((prev) => {
      const next = new Set(prev)
      if (next.has(storyId)) {
        next.delete(storyId)
      } else {
        next.add(storyId)
      }
      return next
    })
  }

  const startEditing = (item: StructuredPRDItem) => {
    setEditingTask({
      id: item.id,
      title: item.title,
      description: item.description,
      isEditing: true,
    })
  }

  const cancelEditing = () => {
    setEditingTask(null)
  }

  const saveEditing = useCallback(() => {
    if (!editingTask || !structure) return

    // Update the appropriate array based on item type
    setStructure((prev) => {
      if (!prev) return prev
      const next = { ...prev }

      // Find and update the item in the appropriate array
      const updateItem = (items: StructuredPRDItem[]) =>
        items.map((item) =>
          item.id === editingTask.id
            ? { ...item, title: editingTask.title, description: editingTask.description }
            : item
        )

      next.epics = updateItem(next.epics)
      next.userStories = updateItem(next.userStories)
      next.tasks = updateItem(next.tasks)
      next.acceptanceCriteria = updateItem(next.acceptanceCriteria)

      return next
    })

    setEditingTask(null)
  }, [editingTask, structure])

  const removeTask = (taskId: string) => {
    if (!structure) return

    setStructure((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== taskId),
      }
    })
  }

  const removeStory = (storyId: string) => {
    if (!structure) return

    setStructure((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        userStories: prev.userStories.filter((s) => s.id !== storyId),
        // Also remove tasks that depend on this story
        tasks: prev.tasks.filter((t) => t.parentId !== storyId),
      }
    })
  }

  const moveTask = (taskId: string, direction: 'up' | 'down') => {
    if (!structure) return

    setStructure((prev) => {
      if (!prev) return prev
      const tasks = [...prev.tasks]
      const index = tasks.findIndex((t) => t.id === taskId)
      if (index === -1) return prev

      const newIndex = direction === 'up' ? index - 1 : index + 1
      if (newIndex < 0 || newIndex >= tasks.length) return prev

      // Swap tasks
      ;[tasks[index], tasks[newIndex]] = [tasks[newIndex], tasks[index]]
      // Update priorities based on new order
      const updatedTasks = tasks.map((t, i) => ({
        ...t,
        priority: i + 1,
      }))

      return { ...prev, tasks: updatedTasks }
    })
  }

  // Available for future priority dropdown feature
  const _changePriority = (taskId: string, newPriority: number) => {
    if (!structure) return

    setStructure((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === taskId ? { ...t, priority: newPriority } : t
        ),
      }
    })
  }
  void _changePriority // Silence unused warning

  const handleConfirm = async () => {
    if (!structure) return
    setConfirming(true)
    try {
      await onConfirm(structure)
    } finally {
      setConfirming(false)
    }
  }

  // Group tasks by parent story
  const getTasksByStory = (storyId: string) =>
    structure?.tasks.filter((t) => t.parentId === storyId) || []

  // Get stories by epic
  const getStoriesByEpic = (epicId: string) =>
    structure?.userStories.filter((s) => s.parentId === epicId) || []

  // Get orphan tasks (no parent)
  const orphanTasks = structure?.tasks.filter((t) => !t.parentId) || []

  // Calculate totals
  const totalTasks = structure?.tasks.length || 0
  const totalStories = structure?.userStories.length || 0
  const totalEpics = structure?.epics.length || 0

  const renderEditableItem = (item: StructuredPRDItem, type: 'task' | 'story') => {
    const isEditing = editingTask?.id === item.id

    if (isEditing && editingTask) {
      return (
        <div className="space-y-2 p-2 bg-muted/50 rounded-md">
          <Input
            value={editingTask.title}
            onChange={(e) => setEditingTask({ ...editingTask, title: e.target.value })}
            placeholder="Title"
            autoFocus
          />
          <Textarea
            value={editingTask.description}
            onChange={(e) => setEditingTask({ ...editingTask, description: e.target.value })}
            placeholder="Description"
            rows={3}
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={cancelEditing}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={saveEditing}>
              <Check className="h-4 w-4 mr-1" />
              Save
            </Button>
          </div>
        </div>
      )
    }

    return (
      <div className="flex items-start gap-2 group">
        <GripVertical className="h-4 w-4 text-muted-foreground/50 mt-1 cursor-grab" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{item.id}</span>
            <span className="font-medium truncate">{item.title}</span>
            {item.priority && (
              <Badge
                variant={item.priority <= 2 ? 'destructive' : item.priority === 3 ? 'secondary' : 'outline'}
                className="text-xs"
              >
                P{item.priority}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{item.description}</p>
          {item.dependencies && item.dependencies.length > 0 && (
            <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
              <Link className="h-3 w-3" />
              Depends on: {item.dependencies.join(', ')}
            </div>
          )}
        </div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {type === 'task' && (
            <>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => moveTask(item.id, 'up')}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                onClick={() => moveTask(item.id, 'down')}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={() => startEditing(item)}
          >
            <Edit2 className="h-3 w-3" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={() => (type === 'task' ? removeTask(item.id) : removeStory(item.id))}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    )
  }

  const renderTask = (task: StructuredPRDItem) => (
    <Card key={task.id} className="p-3">
      {renderEditableItem(task, 'task')}
    </Card>
  )

  const renderStory = (story: StructuredPRDItem) => {
    const storyTasks = getTasksByStory(story.id)
    const isExpanded = expandedStories.has(story.id)

    return (
      <Collapsible key={story.id} open={isExpanded} onOpenChange={() => toggleStory(story.id)}>
        <Card className="overflow-hidden">
          <CollapsibleTrigger className="w-full">
            <div className="p-3 flex items-center gap-2 hover:bg-muted/50 transition-colors">
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{story.id}</span>
                  <span className="font-medium">{story.title}</span>
                  <Badge variant="outline" className="text-xs">
                    {storyTasks.length} task{storyTasks.length !== 1 ? 's' : ''}
                  </Badge>
                </div>
              </div>
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    startEditing(story)
                  }}
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeStory(story.id)
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-3 pb-3 space-y-2 border-t pt-2">
              <p className="text-sm text-muted-foreground">{story.description}</p>
              {story.acceptanceCriteria && story.acceptanceCriteria.length > 0 && (
                <div className="text-xs">
                  <span className="font-medium">Acceptance Criteria:</span>
                  <ul className="mt-1 list-disc list-inside text-muted-foreground">
                    {story.acceptanceCriteria.map((ac, i) => (
                      <li key={i}>{ac}</li>
                    ))}
                  </ul>
                </div>
              )}
              {storyTasks.length > 0 && (
                <div className="space-y-2 mt-3">
                  {storyTasks.map(renderTask)}
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    )
  }

  const renderEpic = (epic: StructuredPRDItem) => {
    const epicStories = getStoriesByEpic(epic.id)
    const isExpanded = expandedEpics.has(epic.id)

    return (
      <Collapsible key={epic.id} open={isExpanded} onOpenChange={() => toggleEpic(epic.id)}>
        <Card className="overflow-hidden">
          <CollapsibleTrigger className="w-full">
            <div className="p-4 flex items-center gap-2 hover:bg-muted/50 transition-colors">
              {isExpanded ? (
                <ChevronDown className="h-5 w-5 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              )}
              <div className="flex-1 text-left">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{epic.id}</span>
                  <span className="text-lg font-semibold">{epic.title}</span>
                  <Badge className="text-xs">
                    {epicStories.length} stor{epicStories.length !== 1 ? 'ies' : 'y'}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{epic.description}</p>
              </div>
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-3 border-t pt-3">
              {epicStories.map(renderStory)}
            </div>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Preview Tasks Before Export</DialogTitle>
          <DialogDescription>
            Review and edit the tasks extracted from your PRD before creating them.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !structure || totalTasks === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium mb-2">No Tasks Found</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              The PRD doesn't contain any actionable tasks yet. Continue the conversation to add more
              details about what needs to be built.
            </p>
          </div>
        ) : (
          <>
            {/* Summary Bar */}
            <div className="flex items-center gap-4 py-2 border-b mb-2">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{totalEpics} Epic{totalEpics !== 1 ? 's' : ''}</Badge>
                <Badge variant="secondary">{totalStories} Stor{totalStories !== 1 ? 'ies' : 'y'}</Badge>
                <Badge variant="secondary">{totalTasks} Task{totalTasks !== 1 ? 's' : ''}</Badge>
              </div>
              <p className="text-sm text-muted-foreground ml-auto">
                Click on items to expand. Hover to edit or remove.
              </p>
            </div>

            {/* Scrollable Content */}
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-4 pb-4">
                {/* Epics (with nested stories and tasks) */}
                {structure.epics.map(renderEpic)}

                {/* Orphan stories (not linked to an epic) */}
                {structure.userStories
                  .filter((s) => !s.parentId)
                  .map(renderStory)}

                {/* Orphan tasks (not linked to a story) */}
                {orphanTasks.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-muted-foreground mb-2">
                      Standalone Tasks
                    </h3>
                    <div className="space-y-2">{orphanTasks.map(renderTask)}</div>
                  </div>
                )}
              </div>
            </ScrollArea>
          </>
        )}

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={confirming || loading || totalTasks === 0}
          >
            {confirming ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating Tasks...
              </>
            ) : (
              `Create ${totalTasks} Task${totalTasks !== 1 ? 's' : ''}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
