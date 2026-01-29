/**
 * DependencyGraphView - Visual DAG representation of requirement dependencies
 *
 * Features:
 * - DAG visualization of requirement dependencies
 * - Color-coded by status (ready, blocked, in-progress, done)
 * - Click to expand requirement details
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
import { AlertTriangle, CheckCircle, Clock, Lock, PlayCircle } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  PrdWorkflowRequirement,
  RequirementStatus,
  PrdWorkflowScopeLevel,
  DependencyValidationResult,
} from '@/types'
import { getCategoryInfo, getScopeInfo, getStatusInfo } from '@/types/prd-workflow'

// ============================================================================
// Types
// ============================================================================

interface DependencyGraphViewProps {
  requirements: Record<string, PrdWorkflowRequirement>
  dependencyGraph: {
    dependsOn: Record<string, string[]>
    blocks: Record<string, string[]>
  }
  validationResult?: DependencyValidationResult | null
  onRequirementClick?: (requirementId: string) => void
  onAddDependency?: (fromId: string, toId: string) => void
  onRemoveDependency?: (fromId: string, toId: string) => void
  className?: string
}

interface RequirementNodeData extends Record<string, unknown> {
  requirement: PrdWorkflowRequirement
  blockedBy: string[]
  blocks: string[]
  isReady: boolean
  isBlocked: boolean
}

// ============================================================================
// Constants
// ============================================================================

const STATUS_COLORS: Record<RequirementStatus, { bg: string; border: string; text: string }> = {
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
  in_progress: {
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

const SCOPE_COLORS: Record<PrdWorkflowScopeLevel, string> = {
  v1: 'bg-green-500',
  v2: 'bg-blue-500',
  out_of_scope: 'bg-slate-400',
  unscoped: 'bg-amber-500',
}

// ============================================================================
// Custom Node Component
// ============================================================================

function RequirementNode({ data, selected }: NodeProps) {
  const { requirement, isReady, isBlocked, blockedBy } = data as RequirementNodeData
  const colors = STATUS_COLORS[requirement.status]
  const categoryInfo = getCategoryInfo(requirement.category)
  const scopeInfo = getScopeInfo(requirement.scope)

  const StatusIcon = useMemo(() => {
    switch (requirement.status) {
      case 'done':
        return CheckCircle
      case 'in_progress':
        return PlayCircle
      case 'blocked':
        return Lock
      case 'ready':
        return Clock
      default:
        return Clock
    }
  }, [requirement.status])

  return (
    <div
      className={cn(
        'px-3 py-2 rounded-lg border-2 min-w-44 max-w-52 transition-all',
        colors.bg,
        colors.border,
        selected && 'ring-2 ring-emerald-500 ring-offset-2',
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
          {requirement.id}
        </span>
        <div className={cn('flex items-center gap-1', colors.text)}>
          <StatusIcon className="h-3.5 w-3.5" />
        </div>
      </div>

      {/* Title */}
      <div className="text-sm font-medium leading-tight line-clamp-2 mb-2">
        {requirement.title}
      </div>

      {/* Tags */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={cn(
            'inline-block px-1.5 py-0.5 rounded text-[10px] font-medium text-white',
            SCOPE_COLORS[requirement.scope]
          )}
        >
          {scopeInfo.displayName.split(' ')[0]}
        </span>
        <span className="text-[10px] text-muted-foreground">{categoryInfo.prefix}</span>
      </div>

      {/* Ready/Blocked indicator */}
      {isBlocked && (
        <div className="mt-2 text-[10px] text-red-500 flex items-center gap-1">
          <Lock className="h-3 w-3" />
          Blocked by {blockedBy.length} requirement(s)
        </div>
      )}
      {isReady && !isBlocked && requirement.status === 'pending' && (
        <div className="mt-2 text-[10px] text-green-500 flex items-center gap-1">
          <CheckCircle className="h-3 w-3" />
          Ready to start
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
  requirement: RequirementNode,
}

// ============================================================================
// Layout Algorithm (Simple Layered Layout)
// ============================================================================

function computeLayout(
  requirements: Record<string, PrdWorkflowRequirement>,
  dependencyGraph: { dependsOn: Record<string, string[]>; blocks: Record<string, string[]> }
): { nodes: Node<RequirementNodeData>[]; edges: Edge[] } {
  const nodes: Node<RequirementNodeData>[] = []
  const edges: Edge[] = []

  // Build layer assignment using topological sort
  const inDegree: Record<string, number> = {}
  const adjList: Record<string, string[]> = {}
  const reqIds = Object.keys(requirements)

  // Initialize
  for (const id of reqIds) {
    inDegree[id] = 0
    adjList[id] = []
  }

  // Build adjacency list and in-degree
  for (const [id, deps] of Object.entries(dependencyGraph.dependsOn)) {
    if (!requirements[id]) continue
    for (const dep of deps) {
      if (requirements[dep]) {
        adjList[dep].push(id)
        inDegree[id] = (inDegree[id] || 0) + 1
      }
    }
  }

  // Assign layers using BFS (Kahn's algorithm)
  const layers: string[][] = []
  const visited = new Set<string>()
  let currentLayer = reqIds.filter((id) => inDegree[id] === 0)

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

  // Add any remaining nodes (in case of cycles or disconnected nodes)
  const remainingNodes = reqIds.filter((id) => !visited.has(id))
  if (remainingNodes.length > 0) {
    layers.push(remainingNodes)
  }

  // Position nodes
  const nodeWidth = 200
  const nodeHeight = 120
  const horizontalSpacing = 60
  const verticalSpacing = 80

  for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
    const layer = layers[layerIdx]
    const layerWidth = layer.length * (nodeWidth + horizontalSpacing) - horizontalSpacing
    const startX = -layerWidth / 2

    for (let nodeIdx = 0; nodeIdx < layer.length; nodeIdx++) {
      const reqId = layer[nodeIdx]
      const requirement = requirements[reqId]
      const blockedBy = dependencyGraph.dependsOn[reqId] || []
      const blocks = dependencyGraph.blocks[reqId] || []

      // Check if blocked (any dependency not done)
      const isBlocked = blockedBy.some((depId) => {
        const dep = requirements[depId]
        return dep && dep.status !== 'done'
      })

      // Check if ready (no blockers or all blockers done)
      const isReady = !isBlocked && requirement.status === 'pending'

      nodes.push({
        id: reqId,
        type: 'requirement',
        position: {
          x: startX + nodeIdx * (nodeWidth + horizontalSpacing),
          y: layerIdx * (nodeHeight + verticalSpacing),
        },
        data: {
          requirement,
          blockedBy,
          blocks,
          isReady,
          isBlocked,
        },
      })
    }
  }

  // Create edges
  for (const [toId, deps] of Object.entries(dependencyGraph.dependsOn)) {
    if (!requirements[toId]) continue
    for (const fromId of deps) {
      if (!requirements[fromId]) continue
      edges.push({
        id: `${fromId}-${toId}`,
        source: fromId,
        target: toId,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: '#94a3b8',
        },
        style: {
          stroke: '#94a3b8',
          strokeWidth: 2,
        },
        animated: requirements[toId].status === 'blocked',
      })
    }
  }

  return { nodes, edges }
}

// ============================================================================
// Main Component
// ============================================================================

export function DependencyGraphView({
  requirements,
  dependencyGraph,
  validationResult,
  onRequirementClick,
  className,
}: DependencyGraphViewProps) {
  const [selectedNode, setSelectedNode] = useState<string | null>(null)

  // Compute layout
  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => computeLayout(requirements, dependencyGraph),
    [requirements, dependencyGraph]
  )

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  // Handle node click
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedNode(node.id)
      onRequirementClick?.(node.id)
    },
    [onRequirementClick]
  )

  // Get selected requirement details
  const selectedRequirement = selectedNode ? requirements[selectedNode] : null

  // Check for validation issues
  const hasCycle = validationResult && !validationResult.valid

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
            const nodeData = node.data as RequirementNodeData | undefined
            if (!nodeData?.requirement) return '#94a3b8'
            switch (nodeData.requirement.status) {
              case 'done':
                return '#10b981'
              case 'in_progress':
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
        {hasCycle && (
          <Panel position="top-center">
            <div className="flex items-center gap-2 px-4 py-2 bg-red-100 dark:bg-red-950/50 border border-red-300 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Dependency cycle detected: {validationResult.error}</span>
            </div>
          </Panel>
        )}

        {/* Stats Panel */}
        <Panel position="top-left">
          <Card className="w-48 shadow-md">
            <CardHeader className="p-3 pb-1">
              <CardTitle className="text-sm">Graph Stats</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-1 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Requirements</span>
                <span className="font-medium">{Object.keys(requirements).length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dependencies</span>
                <span className="font-medium">
                  {Object.values(dependencyGraph.dependsOn).reduce((a, b) => a + b.length, 0)}
                </span>
              </div>
              {validationResult?.stats && (
                <>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Depth</span>
                    <span className="font-medium">{validationResult.stats.maxDepth}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Root Nodes</span>
                    <span className="font-medium">{validationResult.stats.rootNodes.length}</span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </Panel>

        {/* Legend */}
        <Panel position="bottom-left">
          <Card className="shadow-md">
            <CardContent className="p-3 text-xs space-y-1.5">
              <div className="font-medium mb-2">Status Legend</div>
              {Object.entries(STATUS_COLORS).map(([status, colors]) => {
                const info = getStatusInfo(status as RequirementStatus)
                return (
                  <div key={status} className="flex items-center gap-2">
                    <div className={cn('w-3 h-3 rounded border-2', colors.bg, colors.border)} />
                    <span>{info.displayName}</span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </Panel>
      </ReactFlow>

      {/* Selected Requirement Details */}
      {selectedRequirement && (
        <div className="absolute bottom-4 right-4 w-80 z-10">
          <Card className="shadow-lg">
            <CardHeader className="p-4 pb-2">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="font-mono">
                  {selectedRequirement.id}
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
              <CardTitle className="text-base mt-2">{selectedRequirement.title}</CardTitle>
              <CardDescription className="text-xs mt-1">
                {selectedRequirement.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  className={cn(
                    'text-white',
                    SCOPE_COLORS[selectedRequirement.scope]
                  )}
                >
                  {getScopeInfo(selectedRequirement.scope).displayName}
                </Badge>
                <Badge variant="secondary">
                  {getCategoryInfo(selectedRequirement.category).displayName}
                </Badge>
                <Badge
                  variant="outline"
                  className={STATUS_COLORS[selectedRequirement.status].text}
                >
                  {getStatusInfo(selectedRequirement.status).displayName}
                </Badge>
              </div>

              {selectedRequirement.dependsOn.length > 0 && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Depends on: </span>
                  <span className="font-mono">{selectedRequirement.dependsOn.join(', ')}</span>
                </div>
              )}

              {selectedRequirement.acceptanceCriteria.length > 0 && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Acceptance Criteria:</span>
                  <ul className="list-disc list-inside mt-1">
                    {selectedRequirement.acceptanceCriteria.slice(0, 3).map((criterion, i) => (
                      <li key={i} className="line-clamp-1">
                        {criterion}
                      </li>
                    ))}
                    {selectedRequirement.acceptanceCriteria.length > 3 && (
                      <li className="text-muted-foreground">
                        +{selectedRequirement.acceptanceCriteria.length - 3} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
