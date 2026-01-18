// Individual project summary card for Mission Control

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderOpen, Play, Pause, CheckCircle2, AlertCircle, Clock, Bot, ArrowRight, Square } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/sessionStore'
import type { ProjectStatus } from '@/hooks/useMissionControlData'
import type { Session, SessionStatus } from '@/types'

interface ProjectStatusCardProps {
  projectStatus: ProjectStatus
  onNavigate?: () => void
}

const healthConfig = {
  healthy: {
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    icon: Play,
    label: 'Active',
  },
  warning: {
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    borderColor: 'border-yellow-500/20',
    icon: AlertCircle,
    label: 'Warning',
  },
  error: {
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    borderColor: 'border-red-500/20',
    icon: AlertCircle,
    label: 'Error',
  },
  idle: {
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/50',
    borderColor: 'border-muted',
    icon: Pause,
    label: 'Idle',
  },
}

function formatLastActivity(date: Date | null): string {
  if (!date) return 'No activity'

  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

interface SessionActionsProps {
  session: Session
  onStatusChange: (sessionId: string, status: SessionStatus) => Promise<void>
  isLoading: boolean
}

function SessionActions({ session, onStatusChange, isLoading }: SessionActionsProps) {
  const isActive = session.status === 'active'
  const isPaused = session.status === 'paused'

  // Only show actions for active or paused sessions
  if (!isActive && !isPaused) return null

  return (
    <div className="flex items-center gap-1">
      {isActive && (
        <Tooltip content="Pause session" side="top">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={isLoading}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onStatusChange(session.id, 'paused')
            }}
          >
            <Pause className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      )}

      {isPaused && (
        <Tooltip content="Resume session" side="top">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={isLoading}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onStatusChange(session.id, 'active')
            }}
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
        </Tooltip>
      )}

      <Tooltip content="Stop session" side="top">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          disabled={isLoading}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onStatusChange(session.id, 'completed')
          }}
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
      </Tooltip>
    </div>
  )
}

export function ProjectStatusCard({ projectStatus, onNavigate }: ProjectStatusCardProps) {
  const { project, activeSessions, runningAgentsCount, totalTasks, completedTasks, health, lastActivity, totalCost } = projectStatus

  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const updateSessionStatus = useSessionStore((s) => s.updateSessionStatus)

  const handleStatusChange = async (sessionId: string, status: SessionStatus) => {
    setActionLoading(sessionId)
    try {
      await updateSessionStatus(sessionId, status)
    } finally {
      setActionLoading(null)
    }
  }

  const config = healthConfig[health]
  const HealthIcon = config.icon
  const progressPercent = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0

  return (
    <Card className={cn(
      "transition-all hover:shadow-md",
      health === 'healthy' && "border-green-500/20",
      health === 'error' && "border-red-500/20"
    )}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={cn("p-1.5 rounded", config.bgColor)}>
              <FolderOpen className={cn("h-4 w-4", config.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium truncate">{project.name}</h3>
              <p className="text-xs text-muted-foreground truncate">
                {project.path}
              </p>
            </div>
          </div>

          <Badge variant="outline" className={cn("flex-shrink-0", config.bgColor, config.color)}>
            <HealthIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
          <div className="rounded-md bg-muted/50 p-2">
            <div className="flex items-center justify-center gap-1 text-sm font-medium">
              <Bot className="h-3.5 w-3.5" />
              {runningAgentsCount}
            </div>
            <p className="text-xs text-muted-foreground">Agents</p>
          </div>

          <div className="rounded-md bg-muted/50 p-2">
            <div className="flex items-center justify-center gap-1 text-sm font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {completedTasks}/{totalTasks}
            </div>
            <p className="text-xs text-muted-foreground">Tasks</p>
          </div>

          <div className="rounded-md bg-muted/50 p-2">
            <div className="text-sm font-medium tabular-nums">
              ${totalCost.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">Cost</p>
          </div>
        </div>

        {/* Progress Bar */}
        {totalTasks > 0 && (
          <div className="mb-3">
            <Progress value={progressPercent} className="h-1.5" />
          </div>
        )}

        {/* Active Sessions with Actions */}
        {activeSessions.length > 0 && (
          <div className="mb-3 space-y-2">
            <div className="text-xs text-muted-foreground">Active Sessions</div>
            {activeSessions.slice(0, 3).map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between gap-2 rounded-md bg-muted/30 px-2 py-1.5"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Badge
                    variant="outline"
                    className={cn(
                      "h-5 px-1.5 text-[10px]",
                      session.status === 'active' && "bg-green-500/10 text-green-500",
                      session.status === 'paused' && "bg-yellow-500/10 text-yellow-500"
                    )}
                  >
                    {session.status === 'active' ? 'Active' : 'Paused'}
                  </Badge>
                  <span className="text-xs truncate">{session.name}</span>
                </div>
                <SessionActions
                  session={session}
                  onStatusChange={handleStatusChange}
                  isLoading={actionLoading === session.id}
                />
              </div>
            ))}
            {activeSessions.length > 3 && (
              <div className="text-xs text-muted-foreground text-center">
                +{activeSessions.length - 3} more session{activeSessions.length - 3 > 1 ? 's' : ''}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatLastActivity(lastActivity)}
          </div>

          {activeSessions.length === 0 && (
            <span className="text-muted-foreground">No active sessions</span>
          )}
        </div>

        {/* Action */}
        <Link to="/sessions" state={{ projectPath: project.path }} className="block mt-3">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-between"
            onClick={onNavigate}
          >
            View Sessions
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
