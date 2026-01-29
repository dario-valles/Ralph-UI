// Projects grid overview for Mission Control

import { useMemo } from 'react'
import { FolderPlus, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ProjectStatusCard } from './ProjectStatusCard'
import type { ProjectStatus } from '@/hooks/useMissionControlData'
import { cn } from '@/lib/utils'

interface ProjectsOverviewProps {
  projectStatuses: ProjectStatus[]
  loading?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
  onAddProject?: () => void
}

function ProjectsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-lg border p-4 animate-pulse">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-8 w-8 bg-muted rounded" />
            <div className="flex-1">
              <div className="h-4 bg-muted rounded w-2/3 mb-1" />
              <div className="h-3 bg-muted rounded w-full" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[1, 2, 3].map((j) => (
              <div key={j} className="h-12 bg-muted rounded" />
            ))}
          </div>
          <div className="h-1.5 bg-muted rounded mb-3" />
          <div className="h-8 bg-muted rounded" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ onAddProject }: { onAddProject?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center border border-dashed rounded-lg">
      <FolderPlus className="h-10 w-10 text-muted-foreground mb-3" />
      <h3 className="font-medium mb-1">No projects yet</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-sm">
        Add your first project to start tracking your autonomous AI agent activities
      </p>
      {onAddProject && (
        <Button onClick={onAddProject}>
          <FolderPlus className="h-4 w-4 mr-2" />
          Add Project
        </Button>
      )}
    </div>
  )
}

export function ProjectsOverview({
  projectStatuses,
  loading,
  collapsed,
  onToggleCollapse,
  onAddProject,
}: ProjectsOverviewProps) {
  // Sort projects: active first, then by last activity
  const sortedProjects = useMemo(() => {
    return [...projectStatuses].sort((a, b) => {
      // Active (healthy) projects first
      if (a.health === 'healthy' && b.health !== 'healthy') return -1
      if (b.health === 'healthy' && a.health !== 'healthy') return 1

      // Then by last activity
      const aTime = a.lastActivity?.getTime() || 0
      const bTime = b.lastActivity?.getTime() || 0
      return bTime - aTime
    })
  }, [projectStatuses])

  return (
    <div className="space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 text-left hover:text-primary transition-colors"
        >
          <h2 className="text-lg font-semibold">Projects</h2>
          <span className="text-sm text-muted-foreground">({projectStatuses.length})</span>
          {onToggleCollapse &&
            (collapsed ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ))}
        </button>

        {!collapsed && onAddProject && projectStatuses.length > 0 && (
          <Button variant="outline" size="sm" onClick={onAddProject}>
            <FolderPlus className="h-4 w-4 mr-2" />
            Add
          </Button>
        )}
      </div>

      {/* Content */}
      {!collapsed && (
        <>
          {loading ? (
            <ProjectsSkeleton />
          ) : projectStatuses.length === 0 ? (
            <EmptyState onAddProject={onAddProject} />
          ) : (
            <div
              className={cn(
                'grid gap-4',
                sortedProjects.length === 1 && 'sm:grid-cols-1 max-w-md',
                sortedProjects.length === 2 && 'sm:grid-cols-2',
                sortedProjects.length >= 3 && 'sm:grid-cols-2 lg:grid-cols-3'
              )}
            >
              {sortedProjects.map((projectStatus) => (
                <ProjectStatusCard key={projectStatus.project.id} projectStatus={projectStatus} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
