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
  Star,
  Pencil,
  Trash2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tooltip } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [newName, setNewName] = useState(project.name)

  const setActiveProject = useProjectStore((s) => s.setActiveProject)
  const deleteProject = useProjectStore((s) => s.deleteProject)
  const toggleFavorite = useProjectStore((s) => s.toggleFavorite)
  const updateProjectName = useProjectStore((s) => s.updateProjectName)

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

  const handleDelete = async () => {
    try {
      await deleteProject(project.id)
      toast.success('Project removed', `"${project.name}" has been removed from your projects`)
    } catch {
      toast.error('Failed to remove project', 'Please try again')
    }
    setDeleteDialogOpen(false)
  }

  const handleRename = async () => {
    const trimmedName = newName.trim()
    if (!trimmedName || trimmedName === project.name) {
      setRenameDialogOpen(false)
      return
    }
    try {
      await updateProjectName(project.id, trimmedName)
      toast.success('Project renamed', `Project renamed to "${trimmedName}"`)
    } catch {
      toast.error('Failed to rename project', 'Please try again')
    }
    setRenameDialogOpen(false)
  }

  const handleToggleFavorite = async () => {
    try {
      await toggleFavorite(project.id)
      toast.success(
        project.isFavorite ? 'Removed from favorites' : 'Added to favorites',
        project.isFavorite
          ? `"${project.name}" removed from favorites`
          : `"${project.name}" added to favorites`
      )
    } catch {
      toast.error('Failed to update favorite', 'Please try again')
    }
  }

  const openRenameDialog = () => {
    setNewName(project.name)
    setRenameDialogOpen(true)
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
              <div className="flex items-center gap-1.5">
                <h3 className="font-medium truncate">{project.name}</h3>
                {/* Favorite star indicator */}
                {project.isFavorite && (
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                )}
              </div>
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
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Project Actions</DropdownMenuLabel>
                <DropdownMenuItem onClick={handleCopyPath}>
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Path
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openRenameDialog}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setContextEditorOpen(true)}>
                  <BookOpen className="mr-2 h-4 w-4" />
                  Project Context
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleToggleFavorite}>
                  <Star
                    className={cn(
                      'mr-2 h-4 w-4',
                      project.isFavorite && 'fill-amber-400 text-amber-400'
                    )}
                  />
                  {project.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setDeleteDialogOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove Project
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
          <Link
            to="/prds"
            onClick={handleProjectAction}
            className="flex items-center gap-1 hover:text-primary transition-colors hover:underline"
            title="View all PRDs"
          >
            <FileText className="h-3 w-3" />
            {prdCount ?? 0} PRD{prdCount !== 1 ? 's' : ''}
          </Link>
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

          <Tooltip content="View PRDs" side="bottom">
            <Link to="/prds" onClick={handleProjectAction}>
              <Button variant="outline" size="sm" className="px-3">
                <List className="h-4 w-4" />
              </Button>
            </Link>
          </Tooltip>

          <Tooltip content="Create PRD" side="bottom">
            <Link to="/prds/chat" state={{ projectPath: project.path, startNew: true }}>
              <Button variant="outline" size="sm" className="px-3" onClick={handleProjectAction}>
                <MessageSquarePlus className="h-4 w-4" />
              </Button>
            </Link>
          </Tooltip>
        </div>
      </CardContent>

      {/* Context Editor Dialog */}
      <ContextEditorDialog
        projectPath={project.path}
        open={contextEditorOpen}
        onOpenChange={setContextEditorOpen}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove project?</DialogTitle>
            <DialogDescription>
              This will remove <span className="font-medium">"{project.name}"</span> from your
              projects list. Your files and PRDs will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
            >
              Remove Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onOpenChange={setRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>Enter a new name for this project.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="project-name" className="text-sm font-medium">
              Project Name
            </Label>
            <Input
              id="project-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Enter project name"
              className="mt-2"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRename()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={!newName.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
