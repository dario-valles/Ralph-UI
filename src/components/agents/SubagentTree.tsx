// Subagent Tree Visualization component
// Shows hierarchical tree of subagents spawned by an agent with real-time updates

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { traceApi } from '@/lib/config-api'
import type { SubagentEvent, SubagentTree, SubagentTreeSummary, SubagentEventType } from '@/types'
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  GitBranch,
  Layers,
} from 'lucide-react'

// ============================================================================
// Types
// ============================================================================

interface SubagentNode {
  id: string
  parentId: string
  description: string
  status: SubagentEventType
  depth: number
  timestamp: string
  children: SubagentNode[]
}

interface SubagentTreeProps {
  agentId: string
  pollInterval?: number // in milliseconds, 0 to disable
  onSubagentSelect?: (subagentId: string) => void
  compact?: boolean
}

// ============================================================================
// Helper functions
// ============================================================================

function getStatusIcon(status: SubagentEventType) {
  switch (status) {
    case 'spawned':
    case 'progress':
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return <Activity className="h-4 w-4 text-gray-400" />
  }
}

function getStatusBadgeVariant(status: SubagentEventType): 'default' | 'info' | 'success' | 'destructive' {
  switch (status) {
    case 'spawned':
    case 'progress':
      return 'info'
    case 'completed':
      return 'success'
    case 'failed':
      return 'destructive'
    default:
      return 'default'
  }
}

function getStatusLabel(status: SubagentEventType): string {
  switch (status) {
    case 'spawned':
      return 'Running'
    case 'progress':
      return 'In Progress'
    case 'completed':
      return 'Completed'
    case 'failed':
      return 'Failed'
    default:
      return status
  }
}

function buildTreeFromEvents(events: SubagentEvent[], hierarchy: Record<string, string[]>): SubagentNode[] {
  // Build a map of subagent ID to their latest status and info
  const subagentMap = new Map<string, SubagentNode>()

  // Process events to build subagent state
  for (const event of events) {
    const existing = subagentMap.get(event.subagentId)
    if (!existing) {
      subagentMap.set(event.subagentId, {
        id: event.subagentId,
        parentId: event.parentAgentId,
        description: event.description,
        status: event.eventType,
        depth: event.depth,
        timestamp: event.timestamp,
        children: [],
      })
    } else {
      // Update with latest event
      existing.status = event.eventType
      existing.timestamp = event.timestamp
      if (event.description) {
        existing.description = event.description
      }
    }
  }

  // Build tree structure using hierarchy
  const roots: SubagentNode[] = []
  const nodeArray = Array.from(subagentMap.values())

  for (const node of nodeArray) {
    const childIds = hierarchy[node.id] || []
    node.children = childIds
      .map((id) => subagentMap.get(id))
      .filter((n): n is SubagentNode => n !== undefined)
  }

  // Find root nodes (depth 0 or no parent in the map)
  for (const node of nodeArray) {
    if (node.depth === 0 || !subagentMap.has(node.parentId)) {
      roots.push(node)
    }
  }

  return roots
}

// ============================================================================
// Tree Node Component
// ============================================================================

interface TreeNodeProps {
  node: SubagentNode
  isExpanded: boolean
  onToggle: (id: string) => void
  onSelect?: (id: string) => void
  compact?: boolean
}

function TreeNode({ node, isExpanded, onToggle, onSelect, compact }: TreeNodeProps) {
  const hasChildren = node.children.length > 0
  const isActive = node.status === 'spawned' || node.status === 'progress'

  return (
    <div className="select-none">
      <div
        className={`flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer transition-colors ${
          isActive ? 'bg-blue-50 hover:bg-blue-100' : 'hover:bg-muted'
        }`}
        onClick={() => onSelect?.(node.id)}
      >
        {/* Expand/Collapse button */}
        <button
          className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-muted"
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) onToggle(node.id)
          }}
        >
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <span className="w-4" />
          )}
        </button>

        {/* Status icon */}
        {getStatusIcon(node.status)}

        {/* Subagent info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm truncate">{node.id.slice(0, 8)}</span>
            {!compact && (
              <Badge variant={getStatusBadgeVariant(node.status)} className="text-xs">
                {getStatusLabel(node.status)}
              </Badge>
            )}
          </div>
          {!compact && node.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{node.description}</p>
          )}
        </div>

        {/* Timestamp */}
        {!compact && (
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {new Date(node.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Recursive Tree Renderer
// ============================================================================

interface TreeRendererProps {
  nodes: SubagentNode[]
  expandedIds: Set<string>
  onToggle: (id: string) => void
  onSelect?: (id: string) => void
  compact?: boolean
  depth?: number
}

function TreeRenderer({
  nodes,
  expandedIds,
  onToggle,
  onSelect,
  compact,
  depth = 0,
}: TreeRendererProps) {
  return (
    <div className={depth > 0 ? 'ml-4 border-l border-gray-200 pl-2' : ''}>
      {nodes.map((node) => (
        <div key={node.id}>
          <TreeNode
            node={node}
            isExpanded={expandedIds.has(node.id)}
            onToggle={onToggle}
            onSelect={onSelect}
            compact={compact}
          />
          {expandedIds.has(node.id) && node.children.length > 0 && (
            <TreeRenderer
              nodes={node.children}
              expandedIds={expandedIds}
              onToggle={onToggle}
              onSelect={onSelect}
              compact={compact}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// Main SubagentTree Component
// ============================================================================

export function SubagentTreeView({
  agentId,
  pollInterval = 2000,
  onSubagentSelect,
  compact = false,
}: SubagentTreeProps) {
  const [tree, setTree] = useState<SubagentTree | null>(null)
  const [summary, setSummary] = useState<SubagentTreeSummary | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(pollInterval > 0)

  const fetchTree = useCallback(async () => {
    if (!agentId) return

    setIsLoading(true)
    setError(null)
    try {
      const [treeData, summaryData] = await Promise.all([
        traceApi.getTree(agentId),
        traceApi.getSummary(agentId),
      ])
      setTree(treeData)
      setSummary(summaryData)

      // Auto-expand active subagents
      if (treeData?.active) {
        setExpandedIds((prev) => {
          const next = new Set(prev)
          treeData.active.forEach((id) => next.add(id))
          return next
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [agentId])

  // Initial fetch
  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  // Polling for real-time updates
  useEffect(() => {
    if (autoRefresh && pollInterval > 0) {
      const interval = setInterval(fetchTree, pollInterval)
      return () => clearInterval(interval)
    }
  }, [autoRefresh, pollInterval, fetchTree])

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleExpandAll = useCallback(() => {
    if (tree?.events) {
      const allIds = new Set(tree.events.map((e) => e.subagentId))
      setExpandedIds(allIds)
    }
  }, [tree])

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set())
  }, [])

  // Build tree structure from events
  const treeNodes = useMemo(() => {
    if (!tree?.events || !tree.hierarchy) return []
    return buildTreeFromEvents(tree.events, tree.hierarchy)
  }, [tree])

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-red-500">
            <XCircle className="h-8 w-8 mx-auto mb-2" />
            <p className="text-sm">{error}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchTree}>
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (isLoading && !tree) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading subagent tree...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <GitBranch className="h-5 w-5" />
              Subagent Tree
            </CardTitle>
            {summary && (
              <CardDescription>
                {summary.totalEvents} events | {summary.activeSubagents.length} active |
                Max depth: {summary.maxDepth}
              </CardDescription>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? 'text-blue-500' : ''}
            >
              <Activity className={`h-4 w-4 ${autoRefresh ? 'animate-pulse' : ''}`} />
            </Button>
            <Button variant="outline" size="sm" onClick={fetchTree} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Summary badges */}
        {summary && (
          <div className="flex gap-2 mt-2 flex-wrap">
            <Badge variant="outline" className="gap-1">
              <Layers className="h-3 w-3" />
              {summary.spawnCount} spawned
            </Badge>
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {summary.completeCount} completed
            </Badge>
            {summary.failCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                {summary.failCount} failed
              </Badge>
            )}
            {summary.activeSubagents.length > 0 && (
              <Badge variant="info" className="gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                {summary.activeSubagents.length} active
              </Badge>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {treeNodes.length === 0 ? (
          <div className="text-center py-8">
            <GitBranch className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-1">No Subagents</h3>
            <p className="text-sm text-muted-foreground">
              This agent has not spawned any subagents yet.
            </p>
          </div>
        ) : (
          <>
            {/* Tree controls */}
            <div className="flex justify-end gap-2 mb-3">
              <Button variant="ghost" size="sm" onClick={handleExpandAll}>
                Expand All
              </Button>
              <Button variant="ghost" size="sm" onClick={handleCollapseAll}>
                Collapse All
              </Button>
            </div>

            {/* Tree visualization */}
            <div className="border rounded-lg p-2 max-h-[400px] overflow-auto">
              <TreeRenderer
                nodes={treeNodes}
                expandedIds={expandedIds}
                onToggle={handleToggle}
                onSelect={onSubagentSelect}
                compact={compact}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ============================================================================
// Compact inline component for embedding in other views
// ============================================================================

interface SubagentTreeInlineProps {
  agentId: string
  pollInterval?: number
  onSubagentSelect?: (subagentId: string) => void
}

export function SubagentTreeInline({
  agentId,
  pollInterval = 2000,
  onSubagentSelect,
}: SubagentTreeInlineProps) {
  const [tree, setTree] = useState<SubagentTree | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)

  const fetchTree = useCallback(async () => {
    if (!agentId) return

    setIsLoading(true)
    try {
      const treeData = await traceApi.getTree(agentId)
      setTree(treeData)

      // Auto-expand active subagents
      if (treeData?.active) {
        setExpandedIds((prev) => {
          const next = new Set(prev)
          treeData.active.forEach((id) => next.add(id))
          return next
        })
      }
    } catch {
      // Silent fail for inline component
    } finally {
      setIsLoading(false)
    }
  }, [agentId])

  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  useEffect(() => {
    if (pollInterval > 0) {
      const interval = setInterval(fetchTree, pollInterval)
      return () => clearInterval(interval)
    }
  }, [pollInterval, fetchTree])

  const handleToggle = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const treeNodes = useMemo(() => {
    if (!tree?.events || !tree.hierarchy) return []
    return buildTreeFromEvents(tree.events, tree.hierarchy)
  }, [tree])

  if (isLoading && !tree) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading subagents...
      </div>
    )
  }

  if (treeNodes.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-2">No subagents spawned</div>
    )
  }

  return (
    <div className="border rounded-lg p-2 max-h-[200px] overflow-auto">
      <TreeRenderer
        nodes={treeNodes}
        expandedIds={expandedIds}
        onToggle={handleToggle}
        onSelect={onSubagentSelect}
        compact
      />
    </div>
  )
}

// ============================================================================
// Subagent Event List Component (alternative flat view)
// ============================================================================

interface SubagentEventListProps {
  agentId: string
  subagentId?: string // If provided, show events for specific subagent
  pollInterval?: number
}

export function SubagentEventList({
  agentId,
  subagentId,
  pollInterval = 2000,
}: SubagentEventListProps) {
  const [events, setEvents] = useState<SubagentEvent[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    if (!agentId) return

    setIsLoading(true)
    setError(null)
    try {
      if (subagentId) {
        const data = await traceApi.getSubagentEvents(agentId, subagentId)
        setEvents(data)
      } else {
        const tree = await traceApi.getTree(agentId)
        setEvents(tree?.events || [])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsLoading(false)
    }
  }, [agentId, subagentId])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  useEffect(() => {
    if (pollInterval > 0) {
      const interval = setInterval(fetchEvents, pollInterval)
      return () => clearInterval(interval)
    }
  }, [pollInterval, fetchEvents])

  if (error) {
    return (
      <div className="text-center text-red-500 py-4">
        <p className="text-sm">{error}</p>
      </div>
    )
  }

  if (isLoading && events.length === 0) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No events</p>
      ) : (
        events.map((event, index) => (
          <div
            key={`${event.subagentId}-${event.timestamp}-${index}`}
            className="flex items-start gap-3 p-2 border rounded-lg"
          >
            {getStatusIcon(event.eventType)}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{event.subagentId.slice(0, 8)}</span>
                <Badge variant={getStatusBadgeVariant(event.eventType)} className="text-xs">
                  {getStatusLabel(event.eventType)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  depth: {event.depth}
                </span>
              </div>
              {event.description && (
                <p className="text-sm text-muted-foreground mt-1">{event.description}</p>
              )}
            </div>
            <span className="text-xs text-muted-foreground flex-shrink-0">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
