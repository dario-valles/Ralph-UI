// Individual project summary card for Mission Control

import { Link } from 'react-router-dom'
import {
  FolderOpen,
  Play,
  Pause,
  Clock,
  ArrowRight,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/projectStore'
import type { ProjectStatus } from '@/hooks/useMissionControlData'

interface ProjectStatusCardProps {
  projectStatus: ProjectStatus
  onNavigate?: () => void
}

const runningConfig = {
  color: 'text-green-500',
  bgColor: 'bg-green-500/10',
  borderColor: 'border-green-500/20',
  icon: Play,
  label: 'Running',
}

const healthConfig = {
  healthy: {
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    icon: Play,
    label: 'Active',
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

export function ProjectStatusCard({ projectStatus, onNavigate }: ProjectStatusCardProps) {
  const {
    project,
    health,
    lastActivity,
    activeExecutionId,
  } = projectStatus

  const setActiveProject = useProjectStore((s) => s.setActiveProject)

  // Show "Running" badge when there's an active execution
  const isRunning = !!activeExecutionId
  const config = isRunning ? runningConfig : healthConfig[health]
  const HealthIcon = config.icon

  return (
    <Card
      className={cn(
        'transition-all hover:shadow-md',
        isRunning && 'border-green-500/50 bg-green-500/5'
      )}
    >
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={cn('p-1.5 rounded', config.bgColor)}>
              <FolderOpen className={cn('h-4 w-4', config.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium truncate">{project.name}</h3>
              <p className="text-xs text-muted-foreground truncate">{project.path}</p>
            </div>
          </div>

          <Badge variant="outline" className={cn('flex-shrink-0', config.bgColor, config.color)}>
            <HealthIcon className="h-3 w-3 mr-1" />
            {config.label}
          </Badge>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatLastActivity(lastActivity)}
          </div>
        </div>

        {/* Action */}
        <Link to="/ralph-loop" state={{ projectPath: project.path }} className="block">
          <Button
            variant={isRunning ? 'default' : 'ghost'}
            size="sm"
            className="w-full justify-between"
            onClick={() => {
              // Set this project as active before navigating
              setActiveProject(project.id)
              onNavigate?.()
            }}
          >
            {isRunning ? 'Go to Ralph Loop' : 'Start Ralph Loop'}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </CardContent>
    </Card>
  )
}
