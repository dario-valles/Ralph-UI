// Compact agent display card for Mission Control

import { Bot, Clock, Zap, FileSearch, Code, TestTube, GitCommit, Pause } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { ActiveAgentWithContext } from '@/hooks/useMissionControlData'
import type { AgentStatus } from '@/types'

interface AgentMiniCardProps {
  agent: ActiveAgentWithContext
  onClick?: () => void
}

const statusConfig: Record<AgentStatus, {
  icon: React.ComponentType<{ className?: string }>
  color: string
  bgColor: string
  label: string
  animate?: boolean
}> = {
  idle: {
    icon: Pause,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    label: 'Idle',
  },
  thinking: {
    icon: Zap,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    label: 'Thinking',
    animate: true,
  },
  reading: {
    icon: FileSearch,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    label: 'Reading',
    animate: true,
  },
  implementing: {
    icon: Code,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    label: 'Implementing',
    animate: true,
  },
  testing: {
    icon: TestTube,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    label: 'Testing',
    animate: true,
  },
  committing: {
    icon: GitCommit,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    label: 'Committing',
    animate: true,
  },
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

export function AgentMiniCard({ agent, onClick }: AgentMiniCardProps) {
  const config = statusConfig[agent.status] || statusConfig.idle
  const StatusIcon = config.icon

  return (
    <Card
      className={cn(
        "transition-all cursor-pointer hover:shadow-md",
        config.animate && "ring-1 ring-primary/20"
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className={cn("p-1.5 rounded-full", config.bgColor)}>
              <Bot className={cn("h-4 w-4", config.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {agent.projectName}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {agent.sessionName}
              </p>
            </div>
          </div>

          <Badge
            variant="outline"
            className={cn(
              "flex-shrink-0 gap-1",
              config.bgColor,
              config.color
            )}
          >
            <StatusIcon className={cn(
              "h-3 w-3",
              config.animate && "animate-pulse"
            )} />
            {config.label}
          </Badge>
        </div>

        {/* Task Info */}
        <div className="mb-2">
          <p className="text-xs text-muted-foreground mb-0.5">Working on:</p>
          <p className="text-sm truncate">{agent.taskTitle}</p>
        </div>

        {/* Footer Stats */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDuration(agent.duration)}
          </div>

          <div className="flex items-center gap-3">
            <span className="tabular-nums">
              {agent.tokens.toLocaleString()} tokens
            </span>
            <span className="tabular-nums">
              ${agent.cost.toFixed(4)}
            </span>
          </div>
        </div>

        {/* Activity Indicator */}
        {config.animate && (
          <div className="mt-2 flex items-center gap-2">
            <div className="flex-1 h-0.5 bg-muted rounded-full overflow-hidden">
              <div
                className={cn("h-full rounded-full animate-pulse", config.bgColor)}
                style={{ width: '60%' }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
