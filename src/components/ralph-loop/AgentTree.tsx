/**
 * AgentTree Component
 *
 * Hierarchical visualization of agent/subagent tree structure.
 * Shows real-time updates as subagents spawn and complete.
 */

import { useState, useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  Bot,
  GitFork,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSubagentEvents, type SubagentNode, type SubagentStatus } from '@/hooks/useSubagentEvents'

export interface AgentTreeProps {
  /** The root agent ID to show subagents for */
  agentId: string
  /** Optional class name */
  className?: string
  /** Maximum height (default: 300px) */
  maxHeight?: string
  /** Whether to auto-expand nodes by default (default: true for depth < 2) */
  defaultExpanded?: boolean
}

export function AgentTree({
  agentId,
  className,
  maxHeight = '300px',
  defaultExpanded = true,
}: AgentTreeProps): React.JSX.Element {
  const { subagents, subagentMap, activeCount, totalCount, isListening } = useSubagentEvents({
    agentId,
  })

  // Build hierarchical structure from flat map
  // The useSubagentEvents hook returns depth-1 nodes as root, but we need to build full tree
  const treeNodes = useMemo(() => {
    // Group subagents by their parent to build tree
    const childrenMap = new Map<string, SubagentNode[]>()

    for (const node of subagentMap.values()) {
      // Skip root-level nodes (depth 1) - they're already in subagents
      if (node.depth === 1) continue

      // Find parent by looking at the subagent ID pattern
      // IDs are like: agent-123-sub-1-sub-1 where last -sub-N is the child
      const parts = node.id.split('-sub-')
      if (parts.length > 1) {
        parts.pop() // Remove the last -sub-N
        const parentId = parts.join('-sub-')

        if (!childrenMap.has(parentId)) {
          childrenMap.set(parentId, [])
        }
        childrenMap.get(parentId)!.push(node)
      }
    }

    // Recursively attach children to nodes
    const attachChildren = (node: SubagentNode): SubagentNode => {
      const children = childrenMap.get(node.id) || []
      return {
        ...node,
        children: children
          .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
          .map(attachChildren),
      }
    }

    return subagents.map(attachChildren)
  }, [subagents, subagentMap])

  if (!isListening && totalCount === 0) {
    return (
      <div className={cn('flex items-center justify-center py-8 text-muted-foreground', className)}>
        <div className="text-center">
          <GitFork className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No subagent activity</p>
          <p className="text-xs">Subagents will appear here as they spawn</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('space-y-2', className)}>
      {/* Header with counts */}
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <GitFork className="h-4 w-4" />
          <span>Subagent Tree</span>
        </div>
        <div className="flex items-center gap-2">
          {activeCount > 0 && (
            <Badge variant="info" className="text-xs">
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              {activeCount} running
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs">
            {totalCount} total
          </Badge>
        </div>
      </div>

      {/* Tree view */}
      <ScrollArea className="rounded-md border" style={{ maxHeight }}>
        <div className="p-2 space-y-1">
          {treeNodes.map((node) => (
            <AgentTreeNode
              key={node.id}
              node={node}
              depth={0}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

interface AgentTreeNodeProps {
  node: SubagentNode
  depth: number
  defaultExpanded: boolean
}

function AgentTreeNode({ node, depth, defaultExpanded }: AgentTreeNodeProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(defaultExpanded && depth < 2)
  const hasChildren = node.children.length > 0

  // Format duration
  const formatDuration = (secs?: number): string => {
    if (secs === undefined) return ''
    if (secs < 60) return `${secs}s`
    const mins = Math.floor(secs / 60)
    const remainingSecs = secs % 60
    return `${mins}m ${remainingSecs}s`
  }

  return (
    <div className="select-none">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left',
              'hover:bg-muted/50 transition-colors',
              node.status === 'running' && 'bg-blue-50/50 dark:bg-blue-950/20'
            )}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            {/* Expand/collapse indicator */}
            {hasChildren ? (
              isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )
            ) : (
              <span className="w-4 flex-shrink-0" />
            )}

            {/* Status indicator */}
            <StatusIndicator status={node.status} />

            {/* Agent icon */}
            <Bot className="h-4 w-4 text-muted-foreground flex-shrink-0" />

            {/* Description */}
            <span className="flex-1 truncate text-sm">{node.description}</span>

            {/* Duration */}
            {node.durationSecs !== undefined && (
              <span className="text-xs text-muted-foreground flex-shrink-0">
                {formatDuration(node.durationSecs)}
              </span>
            )}

            {/* Status badge for running items */}
            {node.status === 'running' && (
              <Badge variant="info" className="text-xs flex-shrink-0">
                Running
              </Badge>
            )}

            {/* Error indicator */}
            {node.status === 'failed' && node.error && (
              <Badge variant="destructive" className="text-xs flex-shrink-0">
                Failed
              </Badge>
            )}
          </button>
        </CollapsibleTrigger>

        {hasChildren && (
          <CollapsibleContent>
            <div className="mt-1 space-y-1">
              {node.children.map((child) => (
                <AgentTreeNode
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  defaultExpanded={defaultExpanded}
                />
              ))}
            </div>
          </CollapsibleContent>
        )}
      </Collapsible>
    </div>
  )
}

// Status indicator component - renders the appropriate icon based on status
function StatusIndicator({ status }: { status: SubagentStatus }): React.JSX.Element {
  switch (status) {
    case 'running':
      return <Loader2 className="h-4 w-4 flex-shrink-0 text-blue-500 animate-spin" />
    case 'completed':
      return <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-green-500" />
    case 'failed':
      return <XCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
    default:
      return <Loader2 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
  }
}

export default AgentTree
