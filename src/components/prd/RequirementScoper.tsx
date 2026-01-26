/**
 * Requirement Scoper Component for GSD Workflow
 *
 * Allows users to categorize and scope requirements into V1, V2,
 * or out-of-scope categories. Supports both list view and Kanban
 * column view with drag-and-drop.
 */

import { useState, useCallback, useMemo, DragEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { NativeSelect as Select } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  RequirementsDoc,
  Requirement,
  ScopeSelection,
  ScopeLevel,
  RequirementCategory,
} from '@/types/planning'
import type { GeneratedRequirement, GenerateRequirementsResult } from '@/types/gsd'
import { ListChecks, ArrowRight, Filter, Plus, X, LayoutGrid, List } from 'lucide-react'
import { AIRequirementGenerator } from './AIRequirementGenerator'

interface RequirementScoperProps {
  /** Requirements document */
  requirements: RequirementsDoc
  /** Callback when scope selections are applied */
  onApplyScope: (selections: ScopeSelection) => Promise<void>
  /** Callback when a new requirement is added */
  onAddRequirement?: (
    category: RequirementCategory,
    title: string,
    description: string
  ) => Promise<Requirement | null>
  /** Callback when ready to proceed */
  onProceed: () => void
  /** Whether the component is in loading state */
  isLoading?: boolean
  /** Callback to generate requirements from prompt */
  onGenerateRequirements?: (
    prompt: string,
    agentType?: string,
    model?: string,
    count?: number
  ) => Promise<GenerateRequirementsResult>
  /** Callback when generated requirements are accepted */
  onAcceptGeneratedRequirements?: (requirements: GeneratedRequirement[]) => Promise<void>
  /** Whether AI generation is in progress */
  isGenerating?: boolean
}

/** Get category display name */
function getCategoryDisplayName(category: string): string {
  const names: Record<string, string> = {
    core: 'Core Features',
    ui: 'User Interface',
    api: 'API & Backend',
    data: 'Data & Storage',
    auth: 'Authentication',
    perf: 'Performance',
    sec: 'Security',
    int: 'Integration',
    misc: 'Miscellaneous',
  }
  return names[category.toLowerCase()] || category
}

interface RequirementRowProps {
  requirement: Requirement
  onScopeChange: (id: string, scope: ScopeLevel) => void
  isSelected: boolean
  onSelectChange: (id: string, selected: boolean) => void
}

function RequirementRow({
  requirement,
  onScopeChange,
  isSelected,
  onSelectChange,
}: RequirementRowProps) {
  return (
    <div className="flex items-center gap-4 p-3 border-b last:border-b-0 hover:bg-muted/50">
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked) => onSelectChange(requirement.id, checked === true)}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs shrink-0">
            {requirement.id}
          </Badge>
          <span className="text-sm truncate">{requirement.title}</span>
        </div>
        {requirement.description && (
          <p className="text-xs text-muted-foreground mt-1 truncate">{requirement.description}</p>
        )}
      </div>
      <Select
        value={requirement.scope || 'unscoped'}
        onChange={(e) => onScopeChange(requirement.id, e.target.value as ScopeLevel)}
        className="w-[120px]"
      >
        <option value="v1">V1</option>
        <option value="v2">V2</option>
        <option value="out_of_scope">Out of Scope</option>
        <option value="unscoped">Unscoped</option>
      </Select>
    </div>
  )
}

/** Draggable requirement card for Kanban view */
interface DraggableRequirementCardProps {
  requirement: Requirement
}

function DraggableRequirementCard({ requirement }: DraggableRequirementCardProps) {
  const handleDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('reqId', requirement.id)
    e.dataTransfer.effectAllowed = 'move'
    e.currentTarget.classList.add('opacity-50', 'scale-95')
  }

  const handleDragEnd = (e: DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove('opacity-50', 'scale-95')
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className="p-3 bg-card border rounded-lg cursor-grab active:cursor-grabbing hover:border-primary/50 transition-all"
    >
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline" className="font-mono text-xs">
          {requirement.id}
        </Badge>
        {requirement.category && (
          <Badge variant="secondary" className="text-xs">
            {getCategoryDisplayName(requirement.category)}
          </Badge>
        )}
      </div>
      <p className="text-sm font-medium line-clamp-2">{requirement.title}</p>
      {requirement.description && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{requirement.description}</p>
      )}
    </div>
  )
}

/** Scope column configuration */
interface ScopeColumnConfig {
  scope: ScopeLevel
  title: string
  color: string
  bgColor: string
}

const SCOPE_COLUMNS: ScopeColumnConfig[] = [
  { scope: 'unscoped', title: 'Unscoped', color: 'text-yellow-600', bgColor: 'bg-yellow-500/10' },
  { scope: 'v1', title: 'V1 - Must Have', color: 'text-green-600', bgColor: 'bg-green-500/10' },
  { scope: 'v2', title: 'V2 - Nice to Have', color: 'text-blue-600', bgColor: 'bg-blue-500/10' },
  {
    scope: 'out_of_scope',
    title: 'Out of Scope',
    color: 'text-gray-500',
    bgColor: 'bg-gray-500/10',
  },
]

/** Scope column for Kanban view */
interface ScopeColumnProps {
  config: ScopeColumnConfig
  requirements: Requirement[]
  onDrop: (reqId: string, scope: ScopeLevel) => void
}

function ScopeColumn({ config, requirements, onDrop }: ScopeColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    // Only set false if we're leaving the column entirely
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX
    const y = e.clientY
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDragOver(false)
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    const reqId = e.dataTransfer.getData('reqId')
    if (reqId) {
      onDrop(reqId, config.scope)
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex flex-col rounded-lg border-2 transition-colors ${
        isDragOver ? 'border-primary bg-primary/5' : 'border-transparent'
      }`}
    >
      <div className={`px-3 py-2 rounded-t-lg ${config.bgColor}`}>
        <div className="flex items-center justify-between">
          <h3 className={`text-sm font-semibold ${config.color}`}>{config.title}</h3>
          <Badge variant="outline" className="text-xs">
            {requirements.length}
          </Badge>
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-[300px] max-h-[500px]">
        <div className="p-2 space-y-2">
          {requirements.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground border-2 border-dashed rounded-lg">
              Drop requirements here
            </div>
          ) : (
            requirements.map((req) => <DraggableRequirementCard key={req.id} requirement={req} />)
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

export function RequirementScoper({
  requirements,
  onApplyScope,
  onAddRequirement,
  onProceed,
  isLoading = false,
  onGenerateRequirements,
  onAcceptGeneratedRequirements,
  isGenerating = false,
}: RequirementScoperProps) {
  // Local state for scope changes before saving
  const [localRequirements, setLocalRequirements] = useState<Record<string, Requirement>>(() => ({
    ...requirements.requirements,
  }))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterScope, setFilterScope] = useState<string>('all')
  const [hasChanges, setHasChanges] = useState(false)
  const [viewMode, setViewMode] = useState<'list' | 'columns'>('columns')

  // Custom requirement form state
  const [showAddForm, setShowAddForm] = useState(false)
  const [newReqCategory, setNewReqCategory] = useState<RequirementCategory>('core')
  const [newReqTitle, setNewReqTitle] = useState('')
  const [newReqDescription, setNewReqDescription] = useState('')
  const [isAddingReq, setIsAddingReq] = useState(false)

  // Group requirements by category
  const groupedRequirements = useMemo(() => {
    const groups: Record<string, Requirement[]> = {}
    Object.values(localRequirements).forEach((req) => {
      const category = req.category || 'other'
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(req)
    })
    // Sort each group by ID
    Object.values(groups).forEach((group) => {
      group.sort((a, b) => a.id.localeCompare(b.id))
    })
    return groups
  }, [localRequirements])

  // Get unique categories
  const categories = useMemo(() => {
    return Object.keys(groupedRequirements).sort()
  }, [groupedRequirements])

  // Filter requirements
  const filteredRequirements = useMemo(() => {
    let reqs = Object.values(localRequirements)

    if (filterCategory !== 'all') {
      reqs = reqs.filter((r) => r.category === filterCategory)
    }

    if (filterScope !== 'all') {
      reqs = reqs.filter((r) => (r.scope || 'unscoped') === filterScope)
    }

    return reqs.sort((a, b) => a.id.localeCompare(b.id))
  }, [localRequirements, filterCategory, filterScope])

  // Stats
  const stats = useMemo(() => {
    const reqs = Object.values(localRequirements)
    return {
      total: reqs.length,
      v1: reqs.filter((r) => r.scope === 'v1').length,
      v2: reqs.filter((r) => r.scope === 'v2').length,
      outOfScope: reqs.filter((r) => r.scope === 'out_of_scope').length,
      unscoped: reqs.filter((r) => !r.scope || r.scope === 'unscoped').length,
    }
  }, [localRequirements])

  // Group requirements by scope for Kanban view
  const requirementsByScope = useMemo(() => {
    const reqs = Object.values(localRequirements)
    return {
      unscoped: reqs
        .filter((r) => !r.scope || r.scope === 'unscoped')
        .sort((a, b) => a.id.localeCompare(b.id)),
      v1: reqs.filter((r) => r.scope === 'v1').sort((a, b) => a.id.localeCompare(b.id)),
      v2: reqs.filter((r) => r.scope === 'v2').sort((a, b) => a.id.localeCompare(b.id)),
      out_of_scope: reqs
        .filter((r) => r.scope === 'out_of_scope')
        .sort((a, b) => a.id.localeCompare(b.id)),
    }
  }, [localRequirements])

  const handleScopeChange = useCallback((id: string, scope: ScopeLevel) => {
    setLocalRequirements((prev) => ({
      ...prev,
      [id]: { ...prev[id], scope },
    }))
    setHasChanges(true)
  }, [])

  const handleSelectChange = useCallback((id: string, selected: boolean) => {
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

  const handleBulkScope = useCallback(
    (scope: ScopeLevel) => {
      setLocalRequirements((prev) => {
        const next = { ...prev }
        selectedIds.forEach((id) => {
          if (next[id]) {
            next[id] = { ...next[id], scope }
          }
        })
        return next
      })
      setSelectedIds(new Set())
      setHasChanges(true)
    },
    [selectedIds]
  )

  const handleSelectAll = useCallback(() => {
    const ids = new Set(filteredRequirements.map((r) => r.id))
    setSelectedIds(ids)
  }, [filteredRequirements])

  const handleSelectNone = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const handleApply = useCallback(async () => {
    const selection: ScopeSelection = {
      v1: [],
      v2: [],
      outOfScope: [],
    }

    Object.values(localRequirements).forEach((req) => {
      if (req.scope === 'v1') {
        selection.v1.push(req.id)
      } else if (req.scope === 'v2') {
        selection.v2.push(req.id)
      } else if (req.scope === 'out_of_scope') {
        selection.outOfScope.push(req.id)
      }
    })

    await onApplyScope(selection)
    setHasChanges(false)
  }, [localRequirements, onApplyScope])

  const handleAddCustomRequirement = useCallback(async () => {
    if (!onAddRequirement || !newReqTitle.trim()) return

    setIsAddingReq(true)
    try {
      const newReq = await onAddRequirement(newReqCategory, newReqTitle, newReqDescription)
      if (!newReq) {
        // Failed to add requirement
        return
      }
      // Add to local state
      setLocalRequirements((prev) => ({
        ...prev,
        [newReq.id]: newReq,
      }))
      // Reset form
      setNewReqTitle('')
      setNewReqDescription('')
      setShowAddForm(false)
      setHasChanges(true)
    } catch (error) {
      console.error('Failed to add requirement:', error)
    } finally {
      setIsAddingReq(false)
    }
  }, [onAddRequirement, newReqCategory, newReqTitle, newReqDescription])

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            <CardTitle>Scope Requirements</CardTitle>
          </div>
          <CardDescription>
            Categorize requirements into V1 (must have), V2 (nice to have), or out-of-scope for your
            initial release.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">{stats.total}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">V1</p>
          <p className="text-2xl font-bold text-green-600">{stats.v1}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">V2</p>
          <p className="text-2xl font-bold text-blue-600">{stats.v2}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Out of Scope</p>
          <p className="text-2xl font-bold text-gray-400">{stats.outOfScope}</p>
        </Card>
        <Card className="p-3">
          <p className="text-xs text-muted-foreground">Unscoped</p>
          <p className="text-2xl font-bold text-yellow-600">{stats.unscoped}</p>
        </Card>
      </div>

      {/* AI Requirement Generator */}
      {onGenerateRequirements && onAcceptGeneratedRequirements && (
        <AIRequirementGenerator
          onGenerate={onGenerateRequirements}
          onAcceptRequirements={onAcceptGeneratedRequirements}
          isGenerating={isGenerating}
        />
      )}

      {/* View mode tabs and filters */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'columns')}>
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              {/* View mode toggle */}
              <TabsList className="h-9">
                <TabsTrigger value="columns" className="gap-1.5">
                  <LayoutGrid className="h-4 w-4" />
                  Kanban
                </TabsTrigger>
                <TabsTrigger value="list" className="gap-1.5">
                  <List className="h-4 w-4" />
                  List
                </TabsTrigger>
              </TabsList>

              {/* Filters - only show in list view */}
              {viewMode === 'list' && (
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="w-[150px]"
                  >
                    <option value="all">All Categories</option>
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {getCategoryDisplayName(cat)}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={filterScope}
                    onChange={(e) => setFilterScope(e.target.value)}
                    className="w-[120px]"
                  >
                    <option value="all">All Scopes</option>
                    <option value="v1">V1</option>
                    <option value="v2">V2</option>
                    <option value="out_of_scope">Out of Scope</option>
                    <option value="unscoped">Unscoped</option>
                  </Select>
                </div>
              )}

              {/* Bulk actions - only show in list view */}
              {viewMode === 'list' && (
                <div className="flex items-center gap-2 ml-auto">
                  <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleSelectNone}>
                    Select None
                  </Button>
                  {selectedIds.size > 0 && (
                    <>
                      <span className="text-sm text-muted-foreground">
                        {selectedIds.size} selected:
                      </span>
                      <Button size="sm" variant="default" onClick={() => handleBulkScope('v1')}>
                        V1
                      </Button>
                      <Button size="sm" variant="secondary" onClick={() => handleBulkScope('v2')}>
                        V2
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleBulkScope('out_of_scope')}
                      >
                        Out
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Kanban view hint */}
              {viewMode === 'columns' && (
                <p className="text-sm text-muted-foreground ml-auto">
                  Drag requirements between columns to change scope
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Kanban Column View */}
        <TabsContent value="columns" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {SCOPE_COLUMNS.map((col) => (
              <ScopeColumn
                key={col.scope}
                config={col}
                requirements={requirementsByScope[col.scope] || []}
                onDrop={handleScopeChange}
              />
            ))}
          </div>
        </TabsContent>

        {/* List View */}
        <TabsContent value="list" className="mt-4">
          <Card>
            <ScrollArea className="h-[400px]">
              {filteredRequirements.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  No requirements match the current filters.
                </div>
              ) : (
                filteredRequirements.map((req) => (
                  <RequirementRow
                    key={req.id}
                    requirement={req}
                    onScopeChange={handleScopeChange}
                    isSelected={selectedIds.has(req.id)}
                    onSelectChange={handleSelectChange}
                  />
                ))
              )}
            </ScrollArea>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Custom Requirement */}
      {onAddRequirement && (
        <Card>
          <CardContent className="pt-6">
            {!showAddForm ? (
              <Button
                variant="outline"
                onClick={() => setShowAddForm(true)}
                className="w-full gap-2"
              >
                <Plus className="h-4 w-4" />
                Add Custom Requirement
              </Button>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">New Requirement</h4>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium mb-1 block">Category</label>
                    <Select
                      value={newReqCategory}
                      onChange={(e) => setNewReqCategory(e.target.value as RequirementCategory)}
                      className="w-full"
                    >
                      <option value="core">Core Features</option>
                      <option value="ui">User Interface</option>
                      <option value="data">Data & Storage</option>
                      <option value="integration">Integration</option>
                      <option value="security">Security</option>
                      <option value="performance">Performance</option>
                      <option value="other">Other</option>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Title</label>
                    <Input
                      placeholder="e.g., User can export data as CSV"
                      value={newReqTitle}
                      onChange={(e) => setNewReqTitle(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Description</label>
                  <Textarea
                    placeholder="Detailed description of the requirement..."
                    value={newReqDescription}
                    onChange={(e) => setNewReqDescription(e.target.value)}
                    rows={2}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowAddForm(false)}
                    disabled={isAddingReq}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleAddCustomRequirement}
                    disabled={isAddingReq || !newReqTitle.trim()}
                  >
                    {isAddingReq ? 'Adding...' : 'Add Requirement'}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {hasChanges && (
                <Button onClick={handleApply} disabled={isLoading}>
                  Apply Changes
                </Button>
              )}
              {stats.unscoped > 0 && (
                <p className="text-sm text-yellow-600">
                  {stats.unscoped} requirements are still unscoped
                </p>
              )}
            </div>
            <Button
              onClick={onProceed}
              disabled={isLoading || stats.unscoped > 0}
              className="gap-2"
            >
              Generate Roadmap
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
