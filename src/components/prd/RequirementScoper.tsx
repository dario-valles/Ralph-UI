/**
 * Requirement Scoper Component for GSD Workflow
 *
 * Allows users to categorize and scope requirements into V1, V2,
 * or out-of-scope categories.
 */

import { useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select } from '@/components/ui/select'
import type { RequirementsDoc, Requirement, ScopeSelection, ScopeLevel } from '@/types/planning'
import { ListChecks, ArrowRight, Filter } from 'lucide-react'

interface RequirementScoperProps {
  /** Requirements document */
  requirements: RequirementsDoc
  /** Callback when scope selections are applied */
  onApplyScope: (selections: ScopeSelection) => Promise<void>
  /** Callback when ready to proceed */
  onProceed: () => void
  /** Whether the component is in loading state */
  isLoading?: boolean
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
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {requirement.description}
          </p>
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

export function RequirementScoper({
  requirements,
  onApplyScope,
  onProceed,
  isLoading = false,
}: RequirementScoperProps) {
  // Local state for scope changes before saving
  const [localRequirements, setLocalRequirements] = useState<Record<string, Requirement>>(
    () => ({ ...requirements.requirements })
  )
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [filterScope, setFilterScope] = useState<string>('all')
  const [hasChanges, setHasChanges] = useState(false)

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

  const handleBulkScope = useCallback((scope: ScopeLevel) => {
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
  }, [selectedIds])

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
            Categorize requirements into V1 (must have), V2 (nice to have),
            or out-of-scope for your initial release.
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

      {/* Filters and bulk actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
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
                  <Button size="sm" variant="outline" onClick={() => handleBulkScope('out_of_scope')}>
                    Out
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Requirements list */}
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
