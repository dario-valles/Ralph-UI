/**
 * Generated Requirement Preview Component
 *
 * Displays AI-generated requirements for review before adding to the document.
 * Users can select, edit, and accept individual requirements.
 */

import { useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Loader2,
  RefreshCw,
  Check,
  X,
  Pencil,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
} from 'lucide-react'
import type { GeneratedRequirement } from '@/types/gsd'
import { REQUIREMENT_CATEGORIES, SCOPE_LEVELS, type RequirementCategory } from '@/types/planning'

interface GeneratedRequirementPreviewProps {
  requirements: GeneratedRequirement[]
  onAccept: (requirements: GeneratedRequirement[]) => Promise<void>
  onRegenerate: () => Promise<void>
  onCancel: () => void
  isRegenerating?: boolean
  isAdding?: boolean
}

interface RequirementCardProps {
  requirement: GeneratedRequirement
  isSelected: boolean
  onSelectChange: (selected: boolean) => void
  onUpdate: (updated: GeneratedRequirement) => void
  onRemove: () => void
}

function getCategoryInfo(category: string) {
  return REQUIREMENT_CATEGORIES[category as RequirementCategory] || REQUIREMENT_CATEGORIES.other
}

function getScopeInfo(scope: string) {
  return SCOPE_LEVELS[scope as keyof typeof SCOPE_LEVELS] || { displayName: 'Unscoped', color: 'yellow' }
}

function RequirementEditForm({
  requirement,
  onSave,
  onCancel,
}: {
  requirement: GeneratedRequirement
  onSave: (updated: GeneratedRequirement) => void
  onCancel: () => void
}): React.ReactElement {
  const [edited, setEdited] = useState(requirement)

  function handleCriteriaChange(value: string): void {
    setEdited({
      ...edited,
      acceptanceCriteria: value.split('\n').filter((c) => c.trim()),
    })
  }

  return (
    <Card className="border-primary/30">
      <CardContent className="p-4 space-y-3">
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Title</label>
          <Input
            value={edited.title}
            onChange={(e) => setEdited({ ...edited, title: e.target.value })}
            className="text-sm"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Description</label>
          <Textarea
            value={edited.description}
            onChange={(e) => setEdited({ ...edited, description: e.target.value })}
            rows={2}
            className="text-sm resize-none"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">Acceptance Criteria</label>
          <Textarea
            value={edited.acceptanceCriteria.join('\n')}
            onChange={(e) => handleCriteriaChange(e.target.value)}
            rows={3}
            className="text-sm resize-none font-mono"
            placeholder="One criterion per line"
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => onSave(edited)}>
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function RequirementCard({
  requirement,
  isSelected,
  onSelectChange,
  onUpdate,
  onRemove,
}: RequirementCardProps): React.ReactElement {
  const [isEditing, setIsEditing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)

  const categoryInfo = getCategoryInfo(requirement.category)
  const scopeInfo = getScopeInfo(requirement.suggestedScope)
  const hasAcceptanceCriteria = requirement.acceptanceCriteria.length > 0

  function handleSave(updated: GeneratedRequirement): void {
    onUpdate(updated)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <RequirementEditForm
        requirement={requirement}
        onSave={handleSave}
        onCancel={() => setIsEditing(false)}
      />
    )
  }

  return (
    <Card
      className={`transition-colors ${isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'}`}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onSelectChange(checked === true)}
            className="mt-1"
          />

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className="font-mono text-xs shrink-0">
                {requirement.id}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {categoryInfo.displayName}
              </Badge>
              <Badge
                variant="outline"
                className={`text-xs text-${scopeInfo.color}-600 border-${scopeInfo.color}-300`}
              >
                {scopeInfo.displayName}
              </Badge>
            </div>

            <h4 className="font-medium text-sm mb-1">{requirement.title}</h4>
            <p className="text-xs text-muted-foreground line-clamp-2">{requirement.description}</p>

            {isExpanded && hasAcceptanceCriteria && (
              <div className="mt-2 pt-2 border-t">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Acceptance Criteria:
                </p>
                <ul className="text-xs space-y-1">
                  {requirement.acceptanceCriteria.map((criterion, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0 mt-0.5" />
                      <span>{criterion}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {hasAcceptanceCriteria && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setIsEditing(true)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive hover:text-destructive"
              onClick={onRemove}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptyState({
  onCancel,
  onRegenerate,
  isRegenerating,
}: {
  onCancel: () => void
  onRegenerate: () => Promise<void>
  isRegenerating: boolean
}): React.ReactElement {
  return (
    <div className="text-center py-6">
      <p className="text-sm text-muted-foreground mb-4">All requirements have been removed</p>
      <div className="flex justify-center gap-2">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="outline" onClick={onRegenerate} disabled={isRegenerating}>
          {isRegenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Regenerating...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Regenerate
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

export function GeneratedRequirementPreview({
  requirements: initialRequirements,
  onAccept,
  onRegenerate,
  onCancel,
  isRegenerating = false,
  isAdding = false,
}: GeneratedRequirementPreviewProps): React.ReactElement {
  const [requirements, setRequirements] = useState<GeneratedRequirement[]>(initialRequirements)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialRequirements.map((r) => r.id))
  )

  const selectedCount = selectedIds.size
  const selectedRequirements = useMemo(
    () => requirements.filter((r) => selectedIds.has(r.id)),
    [requirements, selectedIds]
  )

  const toggleSelection = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (selected) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }, [])

  const handleUpdate = useCallback((updated: GeneratedRequirement) => {
    setRequirements((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
  }, [])

  const handleRemove = useCallback((id: string) => {
    setRequirements((prev) => prev.filter((r) => r.id !== id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(requirements.map((r) => r.id)))
  }, [requirements])

  const selectNone = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  if (requirements.length === 0) {
    return <EmptyState onCancel={onCancel} onRegenerate={onRegenerate} isRegenerating={isRegenerating} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">
            Generated Requirements ({requirements.length})
          </CardTitle>
          <Badge variant="outline">{selectedCount} selected</Badge>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="gap-1.5"
        >
          {isRegenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Regenerate
        </Button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <Button variant="link" size="sm" className="h-auto p-0" onClick={selectAll}>
          Select All
        </Button>
        <span className="text-muted-foreground">/</span>
        <Button variant="link" size="sm" className="h-auto p-0" onClick={selectNone}>
          Select None
        </Button>
      </div>

      <ScrollArea className="h-[350px] pr-4">
        <div className="space-y-2">
          {requirements.map((req) => (
            <RequirementCard
              key={req.id}
              requirement={req}
              isSelected={selectedIds.has(req.id)}
              onSelectChange={(selected) => toggleSelection(req.id, selected)}
              onUpdate={handleUpdate}
              onRemove={() => handleRemove(req.id)}
            />
          ))}
        </div>
      </ScrollArea>

      <div className="flex items-center justify-between pt-2 border-t">
        <Button variant="ghost" onClick={onCancel} disabled={isAdding}>
          Cancel
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => onAccept(requirements)}
            disabled={isAdding || requirements.length === 0}
          >
            Add All ({requirements.length})
          </Button>
          <Button
            onClick={() => onAccept(selectedRequirements)}
            disabled={isAdding || selectedCount === 0}
            className="gap-2"
          >
            {isAdding ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Adding...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Add Selected ({selectedCount})
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
