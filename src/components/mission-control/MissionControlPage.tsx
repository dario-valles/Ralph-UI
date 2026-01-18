// Mission Control Dashboard - Main page container
// Provides a unified view of all projects, sessions, agents, and activity

import { useEffect, useState, useCallback } from 'react'
import { GlobalStatsBar } from './GlobalStatsBar'
import { ProjectsOverview } from './ProjectsOverview'
import { ActiveAgentsGrid } from './ActiveAgentsGrid'
import { ActivityTimeline } from './ActivityTimeline'
import { QuickActionsBar } from './QuickActionsBar'
import {
  useGlobalStats,
  useProjectStatuses,
  useAllActiveAgents,
  useActivityFeed,
  useTauriEventListeners,
} from '@/hooks/useMissionControlData'
import { useProjectStore } from '@/stores/projectStore'
import { useSessionStore } from '@/stores/sessionStore'

// LocalStorage keys for section collapse state
const STORAGE_KEYS = {
  projects: 'mission-control-projects-collapsed',
  agents: 'mission-control-agents-collapsed',
  activity: 'mission-control-activity-collapsed',
}

function usePersistedCollapse(key: string, defaultValue: boolean = false) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(key)
      return stored ? JSON.parse(stored) : defaultValue
    } catch {
      return defaultValue
    }
  })

  const toggle = useCallback(() => {
    setCollapsed((prev: boolean) => {
      const next = !prev
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Ignore localStorage errors
      }
      return next
    })
  }, [key])

  return [collapsed, toggle] as const
}

export function MissionControlPage() {
  // Get data from custom hooks
  const globalStats = useGlobalStats()
  const { projectStatuses, loading: projectsLoading } = useProjectStatuses()
  const {
    activeAgents,
    loading: agentsLoading,
    error: agentsError,
    refresh: refreshAgents,
  } = useAllActiveAgents()

  // Activity feed
  const {
    events: activityEvents,
    loading: activityLoading,
    refresh: refreshActivity,
  } = useActivityFeed(50)

  // Store actions for refreshing
  const loadProjects = useProjectStore(s => s.loadProjects)
  const fetchSessions = useSessionStore(s => s.fetchSessions)

  // Collapse states
  const [projectsCollapsed, toggleProjectsCollapsed] = usePersistedCollapse(STORAGE_KEYS.projects)
  const [agentsCollapsed, toggleAgentsCollapsed] = usePersistedCollapse(STORAGE_KEYS.agents)
  const [activityCollapsed, toggleActivityCollapsed] = usePersistedCollapse(STORAGE_KEYS.activity)

  // Initial data load
  useEffect(() => {
    loadProjects()
    fetchSessions()
  }, [loadProjects, fetchSessions])

  // Refresh all data
  const handleRefreshAll = useCallback(async () => {
    await Promise.all([
      loadProjects(),
      fetchSessions(),
      refreshAgents(),
      refreshActivity(),
    ])
  }, [loadProjects, fetchSessions, refreshAgents, refreshActivity])

  // Listen for Tauri events for real-time updates
  useTauriEventListeners(handleRefreshAll)

  // Handle keyboard shortcuts for collapsing sections
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger if no input is focused
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      switch (e.key) {
        case '1':
          toggleProjectsCollapsed()
          break
        case '2':
          toggleAgentsCollapsed()
          break
        case '3':
          toggleActivityCollapsed()
          break
        case 'r':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            handleRefreshAll()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleProjectsCollapsed, toggleAgentsCollapsed, toggleActivityCollapsed, handleRefreshAll])

  const isLoading = globalStats.loading || projectsLoading || agentsLoading || activityLoading

  return (
    <div className="flex flex-col h-full">
      {/* Global Stats Bar */}
      <GlobalStatsBar stats={globalStats} loading={globalStats.loading} />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Mission Control</h1>
              <p className="text-sm text-muted-foreground">
                Overview of all projects and agent activity
              </p>
            </div>
            <QuickActionsBar
              onRefreshAll={handleRefreshAll}
              isRefreshing={isLoading}
            />
          </div>

          {/* Two-column layout for projects and agents */}
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Projects Overview */}
            <div className="lg:col-span-1">
              <ProjectsOverview
                projectStatuses={projectStatuses}
                loading={projectsLoading}
                collapsed={projectsCollapsed}
                onToggleCollapse={toggleProjectsCollapsed}
              />
            </div>

            {/* Active Agents */}
            <div className="lg:col-span-1">
              <ActiveAgentsGrid
                agents={activeAgents}
                loading={agentsLoading}
                error={agentsError}
                collapsed={agentsCollapsed}
                onToggleCollapse={toggleAgentsCollapsed}
                onRefresh={refreshAgents}
                onRetry={refreshAgents}
              />
            </div>
          </div>

          {/* Activity Timeline (full width) */}
          <ActivityTimeline
            events={activityEvents}
            loading={activityLoading}
            collapsed={activityCollapsed}
            onToggleCollapse={toggleActivityCollapsed}
          />

          {/* Keyboard shortcuts hint */}
          <div className="text-xs text-muted-foreground text-center pt-4 border-t">
            <span className="inline-flex items-center gap-4">
              <span>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">1</kbd>
                <span className="ml-1">Projects</span>
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">2</kbd>
                <span className="ml-1">Agents</span>
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">3</kbd>
                <span className="ml-1">Activity</span>
              </span>
              <span>
                <kbd className="px-1.5 py-0.5 bg-muted rounded text-[10px]">Cmd+R</kbd>
                <span className="ml-1">Refresh</span>
              </span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
