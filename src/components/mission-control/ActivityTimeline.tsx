// Chronological activity feed for Mission Control

import { useState, useMemo } from 'react'
import { Activity, ChevronDown, ChevronUp, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { ActivityTimelineItem } from './ActivityTimelineItem'
import type { ActivityEvent } from '@/hooks/useMissionControlData'

interface ActivityTimelineProps {
  events: ActivityEvent[]
  loading?: boolean
  collapsed?: boolean
  onToggleCollapse?: () => void
}

type EventTypeFilter = ActivityEvent['eventType']

const eventTypeLabels: Record<EventTypeFilter, string> = {
  task_completed: 'Task Completed',
  task_started: 'Task Started',
  task_failed: 'Task Failed',
  agent_spawned: 'Agent Spawned',
  session_started: 'Session Started',
  session_completed: 'Session Completed',
}

function ActivitySkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-start gap-3 py-2 px-3 animate-pulse">
          <div className="h-7 w-7 bg-muted rounded-full" />
          <div className="flex-1">
            <div className="h-4 bg-muted rounded w-3/4 mb-1" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
          <div className="h-3 bg-muted rounded w-12" />
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center border border-dashed rounded-lg">
      <Activity className="h-8 w-8 text-muted-foreground mb-2" />
      <h3 className="font-medium mb-1">No recent activity</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        Start a session to see activity here
      </p>
    </div>
  )
}

export function ActivityTimeline({
  events,
  loading,
  collapsed,
  onToggleCollapse,
}: ActivityTimelineProps) {
  const [selectedTypes, setSelectedTypes] = useState<Set<EventTypeFilter>>(
    new Set(Object.keys(eventTypeLabels) as EventTypeFilter[])
  )
  const [selectedProject, setSelectedProject] = useState<string | null>(null)

  // Get unique projects from events
  const projects = useMemo(() => {
    const projectSet = new Set(events.map(e => e.projectPath))
    return Array.from(projectSet).map(path => ({
      path,
      name: events.find(e => e.projectPath === path)?.projectName || path,
    }))
  }, [events])

  // Filter events
  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      if (!selectedTypes.has(event.eventType)) return false
      if (selectedProject && event.projectPath !== selectedProject) return false
      return true
    })
  }, [events, selectedTypes, selectedProject])

  const toggleEventType = (type: EventTypeFilter) => {
    const newSet = new Set(selectedTypes)
    if (newSet.has(type)) {
      newSet.delete(type)
    } else {
      newSet.add(type)
    }
    setSelectedTypes(newSet)
  }

  const allTypesSelected = selectedTypes.size === Object.keys(eventTypeLabels).length
  const someTypesSelected = selectedTypes.size > 0 && !allTypesSelected

  const toggleAllTypes = () => {
    if (allTypesSelected) {
      setSelectedTypes(new Set())
    } else {
      setSelectedTypes(new Set(Object.keys(eventTypeLabels) as EventTypeFilter[]))
    }
  }

  return (
    <div className="space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 text-left hover:text-primary transition-colors"
        >
          <h2 className="text-lg font-semibold">Activity</h2>
          <span className="text-sm text-muted-foreground">
            ({filteredEvents.length})
          </span>
          {onToggleCollapse && (
            collapsed ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            )
          )}
        </button>

        {!collapsed && events.length > 0 && (
          <div className="flex items-center gap-2">
            {/* Project Filter */}
            {projects.length > 1 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    {selectedProject
                      ? projects.find(p => p.path === selectedProject)?.name || 'All'
                      : 'All Projects'}
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuCheckboxItem
                    checked={selectedProject === null}
                    onCheckedChange={() => setSelectedProject(null)}
                  >
                    All Projects
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuSeparator />
                  {projects.map(project => (
                    <DropdownMenuCheckboxItem
                      key={project.path}
                      checked={selectedProject === project.path}
                      onCheckedChange={() => setSelectedProject(project.path)}
                    >
                      {project.name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Event Type Filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <Filter className="h-4 w-4 mr-1" />
                  Filter
                  {someTypesSelected && (
                    <span className="ml-1 text-xs bg-primary/20 text-primary px-1 rounded">
                      {selectedTypes.size}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Event Types</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={allTypesSelected}
                  onCheckedChange={toggleAllTypes}
                >
                  All Events
                </DropdownMenuCheckboxItem>
                <DropdownMenuSeparator />
                {(Object.entries(eventTypeLabels) as [EventTypeFilter, string][]).map(
                  ([type, label]) => (
                    <DropdownMenuCheckboxItem
                      key={type}
                      checked={selectedTypes.has(type)}
                      onCheckedChange={() => toggleEventType(type)}
                    >
                      {label}
                    </DropdownMenuCheckboxItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Content */}
      {!collapsed && (
        <div className="border rounded-lg max-h-80 overflow-y-auto">
          {loading ? (
            <ActivitySkeleton />
          ) : filteredEvents.length === 0 ? (
            <div className="p-4">
              <EmptyState />
            </div>
          ) : (
            <div className="divide-y">
              {filteredEvents.map((event) => (
                <ActivityTimelineItem key={event.id} event={event} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
