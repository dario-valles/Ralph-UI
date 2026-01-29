/**
 * DependencyGraph - Visual DAG representation of Ralph story dependencies
 *
 * Features:
 * - DAG visualization of story dependencies
 * - Color-coded by status (ready, blocked, in-progress, done)
 * - Click to view story details
 * - Cycle detection with visual warning
 */
import { useCallback, useMemo, useState } from 'react'
import {
  ReactFlow,
  Node,
  Edge,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Position,
  Panel,
  Handle,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { cn } from '@/lib/utils'
import { AlertTriangle, CheckCircle, Lock, PlayCircle, Clock } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { RalphStory } from '@/types'

// ============================================================================
// Types
// ============================================================================

interface DependencyGraphProps {
  stories: RalphStory[]
  /** IDs of stories currently being executed */
  runningStoryIds?: string[]
  className?: string
}

type StoryStatus = 'done' | 'running' | 'blocked' | 'ready' | 'pending'

interface StoryNodeData extends Record<string, unknown> {
  story: RalphStory
  status: StoryStatus
  blockedBy: string[]
  blocks: string[]
}

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS: Record<StoryStatus, { bg: string; border: string; text: string }> = {
  pending: {
    bg: 'bg-slate-100 dark:bg-slate-800',
    border: 'border-slate-300 dark:border-slate-600',
    text: 'text-slate-600 dark:text-slate-400',
  },
  blocked: {
    bg: 'bg-red-50 dark:bg-red-950/30',
    border: 'border-red-300 dark:border-red-800',
    text: 'text-red-600 dark:text-red-400',
  },
  ready: {
    bg: 'bg-green-50 dark:bg-green-950/30',
    border: 'border-green-300 dark:border-green-800',
    text: 'text-green-600 dark:text-green-400',
  },
  running: {
    bg: 'bg-blue-50 dark:bg-blue-950/30',
    border: 'border-blue-300 dark:border-blue-800',
    text: 'text-blue-600 dark:text-blue-400',
  },
  done: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    border: 'border-emerald-300 dark:border-emerald-800',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
}

const STATUS_LABELS: Record<StoryStatus, string> = {
  pending: 'Pending',
  blocked: 'Blocked',
  ready: 'Ready',
  running: 'Running',
  done: 'Done',
}

// ============================================================================
// Custom Node Component
// ============================================================================

function StoryNode({ data, selected }: NodeProps) {
  const { story, status, blockedBy } = data as StoryNodeData
  const colors = STATUS_COLORS[status]

  const StatusIcon = useMemo(() => {
    switch (status) {
      case 'done':
        return CheckCircle
      case 'running':
        return PlayCircle
      case 'blocked':
        return Lock
      case 'ready':
        return Clock
      default:
        return Clock
    }
  }, [status])

  return (
    <div
      className={cn(
        'px-3 py-2 rounded-lg border-2 min-w-[160px] max-w-[200px] transition-all',
        colors.bg,
        colors.border,
        selected && 'ring-2 ring-primary ring-offset-2',
        'hover:shadow-md cursor-pointer'
      )}
    >
      {/* Input handle (for incoming dependencies) */}
      <Handle
        type="target"
        position={Position.Top}
        className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white dark:!border-slate-900"
      />

      {/* Header with ID and status */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-xs font-mono font-semibold text-muted-foreground">
          {story.id}
        </span>
        <div className={cn('flex items-center gap-1', colors.text)}>
          <StatusIcon className="h-3.5 w-3.5" />
        </div>
      </div>

      {/* Title */}
      <div className="text-sm font-medium leading-tight line-clamp-2 mb-1">
        {story.title}
      </div>

      {/* Tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-muted-foreground">P{story.priority}</span>
        {story.effort && (
          <span className="text-[10px] text-muted-foreground">{story.effort}</span>
        )}
      </div>

      {/* Blocked indicator */}
      {status === 'blocked' && blockedBy.length > 0 && (
        <div className="mt-1.5 text-[10px] text-red-500 flex items-center gap-1">
          <Lock className="h-3 w-3" />
          Blocked by {blockedBy.length}
        </div>
      )}

      {/* Output handle (for outgoing dependencies) */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!bg-slate-400 !w-3 !h-3 !border-2 !border-white dark:!border-slate-900"
      />
    </div>
  )
}

const nodeTypes = {
  story: StoryNode,
}

// ============================================================================
// Cycle Detection
// ============================================================================

function detectCycles(stories: RalphStory[]): string[] | null {
  const storyMap = new Map(stories.map(s => [s.id, s]))
  const visited = new Set<string>()
  const recStack = new Set<string>()
  const cyclePath: string[] = []

  function dfs(id: string, path: string[]): boolean {
    visited.add(id)
    recStack.add(id)
    path.push(id)

    const story = storyMap.get(id)
    if (story?.dependencies) {
      for (const depId of story.dependencies) {
        if (!visited.has(depId)) {
          if (dfs(depId, path)) {
            return true
          }
        } else if (recStack.has(depId)) {
          // Found cycle - extract the cycle path
          const cycleStart = path.indexOf(depId)
          cyclePath.push(...path.slice(cycleStart), depId)
          return true
        }
      }
    }

    path.pop()
    recStack.delete(id)
    return false
  }

  for (const story of stories) {
    if (!visited.has(story.id)) {
      if (dfs(story.id, [])) {
        return cyclePath
      }
    }
  }

  return null
}

// ============================================================================
// Layout Algorithm (Simple Layered Layout)
// ============================================================================

function computeLayout(
  stories: RalphStory[],
  runningStoryIds: string[]
): { nodes: Node<StoryNodeData>[]; edges: Edge[] } {
  const nodes: Node<StoryNodeData>[] = []
  const edges: Edge[] = []

  const storyMap = new Map(stories.map(s => [s.id, s]))
  const runningSet = new Set(runningStoryIds)

  // Build dependency graph for layout
  const inDegree: Record<string, number> = {}
  const adjList: Record<string, string[]> = {}

  // Initialize
  for (const story of stories) {
    inDegree[story.id] = 0
    adjList[story.id] = []
  }

  // Build adjacency list and in-degree (reverse direction for layout)
  for (const story of stories) {
    if (story.dependencies) {
      for (const depId of story.dependencies) {
        if (storyMap.has(depId)) {
          adjList[depId].push(story.id)
          inDegree[story.id] = (inDegree[story.id] || 0) + 1
        }
      }
    }
  }

  // Assign layers using BFS (Kahn's algorithm)
  const layers: string[][] = []
  const visited = new Set<string>()
  let currentLayer = stories.filter(s => inDegree[s.id] === 0).map(s => s.id)

  while (currentLayer.length > 0) {
    layers.push(currentLayer)
    const nextLayer: string[] = []

    for (const id of currentLayer) {
      visited.add(id)
      for (const neighbor of adjList[id] || []) {
        inDegree[neighbor]--
        if (inDegree[neighbor] === 0 && !visited.has(neighbor)) {
          nextLayer.push(neighbor)
        }
      }
    }

    currentLayer = nextLayer
  }

  // Add remaining nodes (in case of cycles)
  const remainingNodes = stories.filter(s => !visited.has(s.id)).map(s => s.id)
  if (remainingNodes.length > 0) {
    layers.push(remainingNodes)
  }

  // Compute blocks (stories that depend on each story)
  const blocksMap: Record<string, string[]> = {}
  for (const story of stories) {
    blocksMap[story.id] = []
  }
  for (const story of stories) {
    if (story.dependencies) {
      for (const depId of story.dependencies) {
        if (blocksMap[depId]) {
          blocksMap[depId].push(story.id)
        }
      }
    }
  }

  // Position nodes
  const nodeWidth = 180
  const nodeHeight = 100
  const horizontalSpacing = 40
  const verticalSpacing = 60

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx]
    const layerWidth = layer.length * (nodeWidth + horizontalSpacing) - horizontalSpacing
    const startX = -layerWidth / 2

    for (let nodeIdx = 0; nodeIdx < layer.length; nodeIdx++) {
      const storyId = layer[nodeIdx]
      const story = storyMap.get(storyId)!
      const dependencies = story.dependencies || []
      const blocks = blocksMap[storyId] || []

      // Check if blocked (any dependency not done)
      const blockedBy = dependencies.filter(depId => {
        const dep = storyMap.get(depId)
        return dep && !dep.passes
      })

      // Determine status
      let status: StoryStatus = 'pending'
      if (story.passes) {
        status = 'done'
      } else if (runningSet.has(storyId)) {
        status = 'running'
      } else if (blockedBy.length > 0) {
        status = 'blocked'
      } else if (dependencies.length === 0 || dependencies.every(depId => storyMap.get(depId)?.passes)) {
        status = 'ready'
      }

      nodes.push({
        id: storyId,
        type: 'story',
        position: {
          x: startX + nodeIdx * (nodeWidth + horizontalSpacing),
          y: layerIdx * (nodeHeight + verticalSpacing),
        },
        data: {
          story,
          status,
          blockedBy,
          blocks,
        },
      })
    }
  }

  // Create edges
  for (const story of stories) {
    if (story.dependencies) {
      for (const depId of story.dependencies) {
        if (storyMap.has(depId)) {
          const targetStory = storyMap.get(story.id)
          const isBlocked = targetStory && !targetStory.passes && !storyMap.get(depId)?.passes
          edges.push({
            id: `${depId}-${story.id}`,
            source: depId,
            target: story.id,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: isBlocked ? '#ef4444' : '#94a3b8',
            },
            style: {
              stroke: isBlocked ? '#ef4444' : '#94a3b8',
              strokeWidth: 2,
            },
            animated: isBlocked,
          })
        }
      }
    }
  }

  return { nodes, edges }
}

// ============================================================================
// Main Component
// ============================================================================

export function DependencyGraph({
  stories,
  runningStoryIds = [],
  className,
}: DependencyGraphProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  // Detect cycles
  const cycle = useMemo(() => detectCycles(stories), [stories])

  // Compute layout
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => computeLayout(stories, runningStoryIds),
    [stories, runningStoryIds]
  )

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  // Handle node click
  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNode(node.id)
  }, [])

  // Get selected story details
  const selectedStory = selectedNode ? stories.find(s => s.id === selectedNode) : null

  // Compute stats
  const stats = useMemo(() => {
    const done = stories.filter(s => s.passes).length
    const blocked = stories.filter(s => {
      if (s.passes) return false
      return s.dependencies?.some(depId => {
        const dep = stories.find(d => d.id === depId)
        return dep && !dep.passes
      })
    }).length
    const ready = stories.filter(s => {
      if (s.passes) return false
      if (!s.dependencies?.length) return true
      return s.dependencies.every(depId => {
        const dep = stories.find(d => d.id === depId)
        return dep?.passes
      })
    }).length

    return {
      total: stories.length,
      done,
      blocked,
      ready,
      running: runningStoryIds.length,
      dependencyCount: stories.reduce((acc, s) => acc + (s.dependencies?.length || 0), 0),
    }
  }, [stories, runningStoryIds])

  if (stories.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-full text-muted-foreground', className)}>
        No stories to display
      </div>
    )
  }

  return (
    <div className={cn('relative w-full h-full min-h-[400px]', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        className="bg-background"
      >
        <Background />
        <Controls />
        <MiniMap
          nodeColor={(node) => {
            const nodeData = node.data as StoryNodeData | undefined
            if (!nodeData) return '#94a3b8'
            switch (nodeData.status) {
              case 'done':
                return '#10b981'
              case 'running':
                return '#3b82f6'
              case 'blocked':
                return '#ef4444'
              case 'ready':
                return '#22c55e'
              default:
                return '#94a3b8'
            }
          }}
          maskColor="rgba(0, 0, 0, 0.1)"
        />

        {/* Cycle Warning */}
        {cycle && (
          <Panel position="top-center">
            <div className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Dependency cycle: {cycle.join(' → ')}</span>
            </div>
          </Panel>
        )}

        {/* Stats Panel */}
        <Panel position="top-left">
          <Card className="w-44 shadow-md">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm">Graph Stats</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Stories</span>
                <span className="font-medium">{stats.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dependencies</span>
                <span className="font-medium">{stats.dependencyCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-600 dark:text-emerald-400">Done</span>
                <span className="font-medium">{stats.done}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-600 dark:text-green-400">Ready</span>
                <span className="font-medium">{stats.ready}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-600 dark:text-red-400">Blocked</span>
                <span className="font-medium">{stats.blocked}</span>
              </div>
              {stats.running > 0 && (
                <div className="flex justify-between">
                  <span className="text-blue-600 dark:text-blue-400">Running</span>
                  <span className="font-medium">{stats.running}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </Panel>

        {/* Legend */}
        <Panel position="bottom-left">
          <Card className="shadow-md">
            <CardContent className="p-3 text-xs space-y-1.5">
              <div className="font-medium mb-2">Status</div>
              {Object.entries(STATUS_COLORS).map(([status, colors]) => (
                <div key={status} className="flex items-center gap-2">
                  <div className={cn('w-3 h-3 rounded border-2', colors.bg, colors.border)} />
                  <span>{STATUS_LABELS[status as StoryStatus]}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </Panel>
      </ReactFlow>

      {/* Selected Story Details */}
      {selectedStory && (
        <div className="absolute bottom-4 right-4 w-72 z-10">
          <Card className="shadow-lg">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="font-mono">
                  {selectedStory.id}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => setSelectedNode(null)}
                >
                  &times;
                </Button>
              </div>
              <CardTitle className="text-base mt-2">{selectedStory.title}</CardTitle>
              {selectedStory.description && (
                <CardDescription className="text-xs mt-1">
                  {selectedStory.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline">P{selectedStory.priority}</Badge>
                {selectedStory.effort && (
                  <Badge variant="secondary">{selectedStory.effort}</Badge>
                )}
                {selectedStory.passes && (
                  <Badge variant="success">Done</Badge>
                )}
              </div>

              {selectedStory.dependencies && selectedStory.dependencies.length > 0 && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Depends on: </span>
                  <span className="font-mono">{selectedStory.dependencies.join(', ')}</span>
                </div>
              )}

              {selectedStory.acceptance && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Acceptance:</span>
                  <p className="mt-1 line-clamp-3">{selectedStory.acceptance}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
