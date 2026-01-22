/**
 * SubagentTreePanel Component
 *
 * A collapsible panel wrapper for SubagentTree that integrates with
 * real-time subagent events via the useSubagentEvents hook.
 *
 * Features:
 * - Collapsible panel header
 * - Auto-scroll toggle
 * - Active/total count badges
 * - Activity indicator
 */

import { useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useSubagentEvents } from '@/hooks/useSubagentEvents'
import { ChevronDown, ChevronRight, Activity, GitBranch, RotateCcw, Scroll } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tooltip } from '@/components/ui/tooltip'

interface SubagentTreePanelProps {
  agentId: string
  className?: string
  defaultExpanded?: boolean
  maxHeight?: string
}

export function SubagentTreePanel({
  agentId,
  className,
  defaultExpanded = true,
  maxHeight = '300px',
}: SubagentTreePanelProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [autoScroll, setAutoScroll] = useState(true)

  const {
    subagents,
    activeCount,
    totalCount,
    activityCount,
    resetActivityCount,
    clear,
    isListening,
  } = useSubagentEvents({
    agentId,
    autoScroll,
    onNewActivity: () => {
      // Activity callback - can be used for notifications
    },
  })

  const handleToggleAutoScroll = useCallback(() => {
    setAutoScroll((prev) => !prev)
  }, [])

  const handleClear = useCallback(() => {
    clear()
  }, [clear])

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={(open) => {
        setIsExpanded(open)
        if (open) resetActivityCount()
      }}
      className={cn('border rounded-lg', className)}
    >
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors">
          <div className="flex items-center gap-2">
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <GitBranch className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Subagent Activity</span>

            {/* Badges */}
            <div className="flex items-center gap-1.5 ml-2">
              {activeCount > 0 && (
                <Badge variant="info" className="h-5 px-1.5 gap-1">
                  <Activity className="h-3 w-3 animate-pulse" />
                  {activeCount}
                </Badge>
              )}
              {totalCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5">
                  {totalCount}
                </Badge>
              )}
              {!isExpanded && activityCount > 0 && (
                <Badge
                  variant="outline"
                  className="h-5 px-1.5 text-orange-500 border-orange-500/30"
                >
                  +{activityCount} new
                </Badge>
              )}
            </div>
          </div>

          {/* Listening indicator */}
          {isListening && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <span className="hidden sm:inline">Live</span>
            </div>
          )}
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        {/* Controls */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-b border-border/50 bg-muted/30">
          <div className="flex items-center gap-2">
            <Tooltip
              content={autoScroll ? 'Auto-scroll enabled' : 'Auto-scroll disabled'}
              side="bottom"
            >
              <Button
                variant="ghost"
                size="sm"
                className={cn('h-7 px-2', autoScroll && 'text-blue-500')}
                onClick={handleToggleAutoScroll}
              >
                <Scroll className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>

            <Tooltip content="Clear history" side="bottom">
              <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleClear}>
                <RotateCcw className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          </div>

          <span className="text-xs text-muted-foreground">
            {activeCount} active / {totalCount} total
          </span>
        </div>

        {/* Subagent list */}
        <div className="overflow-y-auto" style={{ maxHeight }}>
          {subagents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <GitBranch className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No subagent activity yet</p>
              <p className="text-xs">Subagents will appear here when the agent spawns tasks</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {subagents.map((node) => (
                <SubagentItem key={node.id} node={node} />
              ))}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

// Individual subagent item
interface SubagentItemProps {
  node: {
    id: string
    description: string
    status: 'running' | 'completed' | 'failed'
    startedAt: string
    durationSecs?: number
    subagentType?: string
    error?: string
    summary?: string
  }
}

function SubagentItem({ node }: SubagentItemProps) {
  // Status indicators
  const statusConfig: Record<string, { icon: string; className: string }> = {
    running: { icon: '\u25D0', className: 'text-blue-500 animate-pulse' },
    completed: { icon: '\u2713', className: 'text-green-500' },
    failed: { icon: '\u2717', className: 'text-red-500' },
  }

  const config = statusConfig[node.status] || statusConfig.running

  return (
    <div className={cn('px-3 py-2 text-sm', node.status === 'running' && 'bg-blue-500/5')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn('font-mono text-lg', config.className)}>{config.icon}</span>
          <span className="truncate" title={node.description}>
            {node.description}
          </span>
          {node.subagentType && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs shrink-0">
              {node.subagentType}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
          {node.durationSecs !== undefined && (
            <span className="font-mono">
              {node.durationSecs < 60
                ? `${node.durationSecs.toFixed(1)}s`
                : `${Math.floor(node.durationSecs / 60)}m ${Math.floor(node.durationSecs % 60)}s`}
            </span>
          )}
          <span className="font-mono">
            {new Date(node.startedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </span>
        </div>
      </div>

      {node.error && (
        <div className="mt-1 text-xs text-red-400 truncate" title={node.error}>
          {node.error}
        </div>
      )}

      {node.summary && (
        <div className="mt-1 text-xs text-muted-foreground truncate" title={node.summary}>
          {node.summary}
        </div>
      )}
    </div>
  )
}

export default SubagentTreePanel
