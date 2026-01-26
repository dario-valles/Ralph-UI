/**
 * LearningsPanel - Displays and manages learnings for a PRD
 *
 * US-3.3: Manual Learning Entry
 *
 * This panel shows:
 * - All accumulated learnings grouped by type
 * - Manual learning entry form
 * - Edit and delete capabilities for learnings
 * - Optional filtering by story
 */

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { NativeSelect as Select } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  RefreshCw,
  BookOpen,
  Plus,
  ChevronDown,
  Pencil,
  Trash2,
  Lightbulb,
  AlertTriangle,
  Code,
  FlaskConical,
  Wrench,
  Building2,
  FileText,
  Loader2,
  User,
  Bot,
} from 'lucide-react'
import { ralphLoopApi } from '@/lib/backend-api'
import type {
  LearningsFile,
  LearningEntry,
  LearningType,
  AddLearningInput,
  UpdateLearningInput,
  RalphStory,
} from '@/types'
import { toast } from '@/stores/toastStore'

/** Render icon for learning type */
function LearningTypeIcon({
  type,
  className = 'h-3 w-3',
}: {
  type: LearningType
  className?: string
}) {
  switch (type) {
    case 'architecture':
      return <Building2 className={className} />
    case 'gotcha':
      return <AlertTriangle className={className} />
    case 'pattern':
      return <Lightbulb className={className} />
    case 'testing':
      return <FlaskConical className={className} />
    case 'tooling':
      return <Wrench className={className} />
    case 'general':
    default:
      return <FileText className={className} />
  }
}

/** Get badge variant for learning type */
function getLearningTypeBadgeVariant(
  type: LearningType
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (type) {
    case 'gotcha':
      return 'destructive'
    case 'pattern':
      return 'default'
    case 'architecture':
      return 'secondary'
    default:
      return 'outline'
  }
}

/** Human-readable learning type labels */
const LEARNING_TYPE_LABELS: Record<LearningType, string> = {
  architecture: 'Architecture',
  gotcha: 'Gotcha',
  pattern: 'Pattern',
  testing: 'Testing',
  tooling: 'Tooling',
  general: 'General',
}

/** Learning types ordered by importance/usefulness */
const LEARNING_TYPES: LearningType[] = [
  'gotcha',
  'pattern',
  'architecture',
  'testing',
  'tooling',
  'general',
]

interface LearningsPanelProps {
  projectPath: string
  prdName: string
  /** Optional list of stories for association dropdown */
  stories?: RalphStory[]
  /** Class name for custom styling */
  className?: string
}

/** Single learning card component */
function LearningCard({
  learning,
  stories,
  onEdit,
  onDelete,
}: {
  learning: LearningEntry
  stories?: RalphStory[]
  onEdit: () => void
  onDelete: () => void
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const isManual = learning.source === 'human'

  // Find story title if linked
  const linkedStory = stories?.find((s) => s.id === learning.storyId)

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={getLearningTypeBadgeVariant(learning.learningType)} className="text-xs">
              <LearningTypeIcon type={learning.learningType} className="h-3 w-3 mr-1" />
              {LEARNING_TYPE_LABELS[learning.learningType]}
            </Badge>
            <span className="text-xs text-muted-foreground">Iter {learning.iteration}</span>
            {isManual ? (
              <Badge variant="outline" className="text-xs">
                <User className="h-3 w-3 mr-1" />
                Manual
              </Badge>
            ) : (
              <Badge variant="outline" className="text-xs">
                <Bot className="h-3 w-3 mr-1" />
                Agent
              </Badge>
            )}
          </div>
          <p className="mt-2 text-sm">{learning.content}</p>
          {linkedStory && (
            <div className="mt-1 text-xs text-muted-foreground">
              Story: <code className="bg-muted px-1 rounded">{linkedStory.id}</code> -{' '}
              {linkedStory.title}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="sm" className="min-h-11 min-w-11 sm:h-7 sm:w-7 sm:min-h-0 sm:min-w-0 p-0" onClick={onEdit}>
            <Pencil className="h-4 w-4 sm:h-3 sm:w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="min-h-11 min-w-11 sm:h-7 sm:w-7 sm:min-h-0 sm:min-w-0 p-0 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4 sm:h-3 sm:w-3" />
          </Button>
        </div>
      </div>

      {learning.codeExample && (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded} className="mt-2">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
              <Code className="h-3 w-3 mr-1" />
              Code Example
              <ChevronDown
                className={`h-3 w-3 ml-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
              <code>{learning.codeExample}</code>
            </pre>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

/** Add/Edit Learning Dialog */
function LearningDialog({
  open,
  onOpenChange,
  learning,
  stories,
  onSave,
  saving,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  learning?: LearningEntry
  stories?: RalphStory[]
  onSave: (input: AddLearningInput | UpdateLearningInput) => Promise<void>
  saving: boolean
}) {
  // Initialize state directly from learning prop - component is remounted via key when learning changes
  const [learningType, setLearningType] = useState<string>(learning?.learningType || 'general')
  const [content, setContent] = useState(learning?.content || '')
  const [codeExample, setCodeExample] = useState(learning?.codeExample || '')
  const [storyId, setStoryId] = useState(learning?.storyId || '')

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error('Content required', 'Please enter the learning content')
      return
    }

    if (learning) {
      // Update existing
      await onSave({
        id: learning.id,
        learningType,
        content: content.trim(),
        codeExample: codeExample.trim() || undefined,
        storyId: storyId || undefined,
      })
    } else {
      // Add new
      await onSave({
        learningType,
        content: content.trim(),
        codeExample: codeExample.trim() || undefined,
        storyId: storyId || undefined,
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{learning ? 'Edit Learning' : 'Add Learning'}</DialogTitle>
          <DialogDescription>
            {learning
              ? 'Update this learning entry'
              : 'Add a new learning to share with future agents'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="learning-type">Type</Label>
            <Select
              id="learning-type"
              value={learningType}
              onChange={(e) => setLearningType(e.target.value)}
            >
              {LEARNING_TYPES.map((type) => (
                <option key={type} value={type}>
                  {LEARNING_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="learning-content">Content *</Label>
            <Textarea
              id="learning-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What did you learn? What should future agents know?"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="learning-code">Code Example (optional)</Label>
            <Textarea
              id="learning-code"
              value={codeExample}
              onChange={(e) => setCodeExample(e.target.value)}
              placeholder="// Paste code example here"
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          {stories && stories.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="learning-story">Associated Story (optional)</Label>
              <Select
                id="learning-story"
                value={storyId}
                onChange={(e) => setStoryId(e.target.value)}
              >
                <option value="">No story</option>
                {stories.map((story) => (
                  <option key={story.id} value={story.id}>
                    {story.id} - {story.title}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !content.trim()}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : learning ? (
              'Update'
            ) : (
              'Add Learning'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function LearningsPanel({
  projectPath,
  prdName,
  stories,
  className = '',
}: LearningsPanelProps): React.JSX.Element {
  const [learningsFile, setLearningsFile] = useState<LearningsFile | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingLearning, setEditingLearning] = useState<LearningEntry | undefined>()
  const [saving, setSaving] = useState(false)

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Search and export
  const [searchQuery, setSearchQuery] = useState('')
  const [exporting, setExporting] = useState(false)

  const loadLearnings = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const file = await ralphLoopApi.getLearnings(projectPath, prdName)
      setLearningsFile(file)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [projectPath, prdName])

  // Initial load
  useEffect(() => {
    loadLearnings()
  }, [loadLearnings])

  const handleAddClick = () => {
    setEditingLearning(undefined)
    setDialogOpen(true)
  }

  const handleEditClick = (learning: LearningEntry) => {
    setEditingLearning(learning)
    setDialogOpen(true)
  }

  const handleSave = async (input: AddLearningInput | UpdateLearningInput) => {
    setSaving(true)
    try {
      if ('id' in input) {
        // Update
        await ralphLoopApi.updateLearning(projectPath, prdName, input)
        toast.success('Learning updated', 'The learning has been updated successfully')
      } else {
        // Add
        await ralphLoopApi.addLearning(projectPath, prdName, input)
        toast.success('Learning added', 'The learning has been added successfully')
      }
      setDialogOpen(false)
      await loadLearnings()
    } catch (err) {
      toast.error('Failed to save learning', err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (learningId: string) => {
    setDeleting(true)
    try {
      const deleted = await ralphLoopApi.deleteLearning(projectPath, prdName, learningId)
      if (deleted) {
        toast.success('Learning deleted', 'The learning has been removed')
        await loadLearnings()
      } else {
        toast.error('Delete failed', 'Learning not found')
      }
    } catch (err) {
      toast.error('Failed to delete learning', err instanceof Error ? err.message : String(err))
    } finally {
      setDeleting(false)
      setDeleteConfirmId(null)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const markdown = await ralphLoopApi.exportLearnings(projectPath, prdName)
      // Create blob and download
      const blob = new Blob([markdown], { type: 'text/markdown' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${prdName}-learnings.md`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Learnings exported', 'Learnings exported to markdown file')
    } catch (err) {
      toast.error('Export failed', err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  // Filter learnings by search query
  const filteredEntries =
    learningsFile?.entries.filter((learning) => {
      if (!searchQuery) return true
      const query = searchQuery.toLowerCase()
      return (
        learning.content.toLowerCase().includes(query) ||
        learning.learningType.toLowerCase().includes(query) ||
        learning.codeExample?.toLowerCase().includes(query) ||
        learning.storyId?.toLowerCase().includes(query)
      )
    }) ?? []

  // Group learnings by type
  const learningsByType = filteredEntries.reduce(
    (acc, learning) => {
      const type = learning.learningType
      if (!acc[type]) {
        acc[type] = []
      }
      acc[type].push(learning)
      return acc
    },
    {} as Record<LearningType, LearningEntry[]>
  )

  // Count by source
  const manualCount = learningsFile?.entries.filter((e) => e.source === 'human').length ?? 0
  const agentCount = learningsFile?.entries.filter((e) => e.source === 'agent').length ?? 0

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Learnings
              </CardTitle>
              <CardDescription className="text-xs">
                {learningsFile?.entries.length ?? 0} total ({manualCount} manual, {agentCount}{' '}
                agent)
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting || !learningsFile?.entries.length}
                className="h-8"
                title="Export learnings to markdown"
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-1" />
                )}
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={handleAddClick} className="h-8">
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={loadLearnings}
                disabled={loading}
                className="h-8 w-8 p-0"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {/* Search input */}
          {learningsFile && learningsFile.entries.length > 0 && (
            <div>
              <input
                type="text"
                placeholder="Search learnings..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 text-sm border rounded-md bg-background"
              />
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error && <div className="text-sm text-destructive mb-3">{error}</div>}

        <ScrollArea className="h-[400px] pr-4">
          {/* Learning type groups */}
          {LEARNING_TYPES.map((type) => {
            const learnings = learningsByType?.[type]
            if (!learnings || learnings.length === 0) return null

            return (
              <Collapsible key={type} defaultOpen={type === 'gotcha' || type === 'pattern'}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start h-8 mb-2 font-medium"
                  >
                    <LearningTypeIcon type={type} className="h-4 w-4 mr-2" />
                    {LEARNING_TYPE_LABELS[type]} ({learnings.length})
                    <ChevronDown className="h-4 w-4 ml-auto" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 mb-4">
                  {learnings.map((learning) => (
                    <LearningCard
                      key={learning.id}
                      learning={learning}
                      stories={stories}
                      onEdit={() => handleEditClick(learning)}
                      onDelete={() => setDeleteConfirmId(learning.id)}
                    />
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )
          })}

          {/* Empty state */}
          {(!learningsFile || learningsFile.entries.length === 0) && !loading && (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <BookOpen className="h-8 w-8 text-muted-foreground mb-2 opacity-50" />
              <p className="text-sm text-muted-foreground">No learnings yet</p>
              <p className="text-xs text-muted-foreground mb-4">
                Add learnings to help future agents avoid mistakes
              </p>
              <Button size="sm" onClick={handleAddClick}>
                <Plus className="h-4 w-4 mr-1" />
                Add First Learning
              </Button>
            </div>
          )}
        </ScrollArea>

        {/* Metadata */}
        {learningsFile && learningsFile.entries.length > 0 && (
          <div className="mt-4 pt-3 border-t text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Total iterations: {learningsFile.totalIterations}</span>
            </div>
          </div>
        )}
      </CardContent>

      {/* Add/Edit Dialog - key remounts when learning changes to reset form state */}
      <LearningDialog
        key={editingLearning?.id ?? 'new'}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        learning={editingLearning}
        stories={stories}
        onSave={handleSave}
        saving={saving}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Learning</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this learning? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
