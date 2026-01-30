// Individual project summary card for Mission Control

import { Link } from 'react-router-dom'
import { useState } from 'react'
import {
  FolderOpen,
  Play,
  Pause,
  Clock,
  ArrowRight,
  FileText,
  MessageSquarePlus,
  MoreVertical,
  Copy,
  List,
  BookOpen,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { useProjectStore } from '@/stores/projectStore'
import { toast } from '@/stores/toastStore'
import { ContextEditorDialog } from '@/components/context'
import type { ProjectStatus } from '@/hooks/useMissionControlData'

interface ProjectStatusCardProps {
  projectStatus: ProjectStatus
  onNavigate?: () => void
}

const healthConfig = {
  running: {
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/20',
    icon: Play,
    label: 'Running',
  },
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
  const { project, health, lastActivity, activeExecutionId, prdCount } = projectStatus
  const [contextEditorOpen, setContextEditorOpen] = useState(false)

  const setActiveProject = useProjectStore((s) => s.setActiveProject)

  // Show "Running" badge when there's an active execution
  const isRunning = !!activeExecutionId
  const configKey = isRunning ? 'running' : health
  const config = healthConfig[configKey]
  const HealthIcon = config.icon

  const handleCopyPath = () => {
    navigator.clipboard.writeText(project.path)
    toast.success('Path copied', 'Project path copied to clipboard')
  }

  const handleProjectAction = () => {
    setActiveProject(project.id)
    onNavigate?.()
  }

  return (
    <Card
      className={cn(
        'transition-all hover:shadow-md',
        isRunning && 'border-green-500/50 bg-green-500/5'
      )}
    >
      <CardContent className="p-3 sm:p-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className={cn('p-1.5 rounded', config.bgColor)}>
              <FolderOpen className={cn('h-4 w-4', config.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-medium truncate">{project.name}</h3>
              <p className="text-xs text-muted-foreground truncate" title={project.path}>
                {project.path}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            <Badge variant="outline" className={cn(config.bgColor, config.color)}>
              <HealthIcon className="h-3 w-3 mr-1" />
              {config.label}
            </Badge>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Project Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleCopyPath}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Path
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link
                    to="/ralph-loop"
                    state={{ projectPath: project.path }}
                    onClick={handleProjectAction}
                  >
                    <Play className="mr-2 h-4 w-4" />
                    Start Ralph Loop
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/prds" onClick={handleProjectAction}>
                    <List className="mr-2 h-4 w-4" />
                    View PRDs
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    to="/prds/chat"
                    state={{ projectPath: project.path, startNew: true }}
                    onClick={handleProjectAction}
                  >
                    <MessageSquarePlus className="mr-2 h-4 w-4" />
                    New PRD Chat
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setContextEditorOpen(true)}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Project Context
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatLastActivity(lastActivity)}
          </div>
          {prdCount !== null && prdCount > 0 && (
            <Link
              to="/prds"
              onClick={handleProjectAction}
              className="flex items-center gap-1 hover:text-primary transition-colors hover:underline"
              title="View all PRDs"
            >
              <FileText className="h-3 w-3" />
              {prdCount} PRD{prdCount !== 1 ? 's' : ''}
            </Link>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Link to="/ralph-loop" state={{ projectPath: project.path }} className="flex-1">
            <Button
              variant={isRunning ? 'default' : 'ghost'}
              size="sm"
              className="w-full justify-between"
              onClick={handleProjectAction}
            >
              {isRunning ? 'Go to Ralph Loop' : 'Start Ralph Loop'}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>

          <Link to="/prds" onClick={handleProjectAction}>
            <Button variant="outline" size="sm" className="px-3" title="View PRDs">
              <List className="h-4 w-4" />
            </Button>
          </Link>

          <Link to="/prds/chat" state={{ projectPath: project.path, startNew: true }}>
            <Button
              variant="outline"
              size="sm"
              className="px-3"
              onClick={handleProjectAction}
              title="New PRD Chat"
            >
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>

      {/* Context Editor Dialog */}
      <ContextEditorDialog
        projectPath={project.path}
        open={contextEditorOpen}
        onOpenChange={setContextEditorOpen}
      />
    </Card>
  )
}
