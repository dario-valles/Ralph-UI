// Derived selectors for Mission Control dashboard
// Instead of creating a new store, we derive all mission control data from existing stores

import { useMemo, useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useProjectStore } from '@/stores/projectStore'
import { useSessionStore } from '@/stores/sessionStore'
import { useAgentStore } from '@/stores/agentStore'
import { useTaskStore } from '@/stores/taskStore'
import type { Project, Session, AgentStatus } from '@/types'
import type { Agent } from '@/lib/agent-api'
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { missionControlApi } from '@/lib/tauri-api'

// Check if we're running inside Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// ============================================================================
// Types
// ============================================================================

export interface GlobalStats {
  activeAgentsCount: number
  tasksInProgress: number
  tasksCompletedToday: number
  totalTasksToday: number
  totalCostToday: number
  activeProjectsCount: number
  totalProjects: number
}

export interface ProjectStatus {
  project: Project
  activeSessions: Session[]
  runningAgentsCount: number
  totalTasks: number
  completedTasks: number
  inProgressTasks: number
  health: 'healthy' | 'warning' | 'error' | 'idle'
  lastActivity: Date | null
  totalCost: number
}

export interface ActiveAgentWithContext extends Agent {
  projectPath: string
  projectName: string
  sessionName: string
  taskTitle: string
  duration: number // milliseconds since agent became active
}

export interface ActivityEvent {
  id: string
  timestamp: Date
  eventType: 'task_completed' | 'task_started' | 'task_failed' | 'agent_spawned' | 'session_started' | 'session_completed'
  projectPath: string
  projectName: string
  sessionName: string
  description: string
  metadata?: Record<string, unknown>
}

// ============================================================================
// Helper Functions
// ============================================================================

function isToday(date: Date | string | undefined): boolean {
  if (!date) return false
  const d = typeof date === 'string' ? new Date(date) : date
  const today = new Date()
  return d.toDateString() === today.toDateString()
}

function computeHealth(
  activeSessions: Session[],
  inProgressTasks: number,
  failedTasksRecent: number
): 'healthy' | 'warning' | 'error' | 'idle' {
  if (failedTasksRecent > 0) return 'error'
  if (activeSessions.length === 0 && inProgressTasks === 0) return 'idle'
  if (inProgressTasks > 0) return 'healthy'
  return 'warning'
}

function getProjectName(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

// ============================================================================
// Custom Hooks
// ============================================================================

/**
 * Hook to get global statistics across all projects
 * Uses single store calls with useShallow to avoid infinite loops
 */
export function useGlobalStats(): GlobalStats & { loading: boolean; error: string | null } {
  // Use useShallow to prevent infinite re-renders from object selectors
  const projectState = useProjectStore(useShallow(s => ({
    projects: s.projects,
    loading: s.loading,
    error: s.error
  })))
  const sessionState = useSessionStore(useShallow(s => ({
    sessions: s.sessions,
    loading: s.loading,
    error: s.error
  })))
  const agentState = useAgentStore(useShallow(s => ({
    agents: s.agents,
    loading: s.loading,
    error: s.error
  })))
  const tasks = useTaskStore(s => s.tasks)

  const loading = projectState.loading || sessionState.loading || agentState.loading
  const error = projectState.error || sessionState.error || agentState.error

  const stats = useMemo(() => {
    const { agents } = agentState
    const { sessions } = sessionState
    const { projects } = projectState

    const activeAgentsCount = agents.filter(a => a.status !== 'idle').length
    const tasksInProgress = tasks.filter(t => t.status === 'in_progress').length
    const tasksCompletedToday = tasks.filter(t =>
      t.status === 'completed' && isToday(t.completedAt)
    ).length
    const totalTasksToday = tasks.filter(t =>
      isToday(t.startedAt) || isToday(t.completedAt)
    ).length
    const totalCostToday = agents.reduce((sum, a) => sum + a.cost, 0)
    const activeProjectPaths = new Set(
      sessions.filter(s => s.status === 'active').map(s => s.projectPath)
    )

    return {
      activeAgentsCount,
      tasksInProgress,
      tasksCompletedToday,
      totalTasksToday,
      totalCostToday,
      activeProjectsCount: activeProjectPaths.size,
      totalProjects: projects.length,
    }
  }, [agentState, sessionState, projectState, tasks])

  return { ...stats, loading, error }
}

/**
 * Hook to get status for all projects
 * Uses single store calls with useShallow to avoid infinite loops
 */
export function useProjectStatuses(): {
  projectStatuses: ProjectStatus[]
  loading: boolean
  error: string | null
} {
  // Use useShallow to prevent infinite re-renders from object selectors
  const projectState = useProjectStore(useShallow(s => ({
    projects: s.projects,
    loading: s.loading,
    error: s.error
  })))
  const sessionState = useSessionStore(useShallow(s => ({
    sessions: s.sessions,
    loading: s.loading,
    error: s.error
  })))
  const agents = useAgentStore(s => s.agents)

  const loading = projectState.loading || sessionState.loading
  const error = projectState.error || sessionState.error

  const projectStatuses = useMemo(() => {
    const { projects } = projectState
    const { sessions } = sessionState

    return projects.map(project => {
      const projectSessions = sessions.filter(s => s.projectPath === project.path)
      const activeSessions = projectSessions.filter(s => s.status === 'active')

      // Get all tasks for this project's sessions
      const sessionIds = new Set(projectSessions.map(s => s.id))

      // Get agents for this project's sessions
      const projectAgents = agents.filter(a => sessionIds.has(a.session_id))
      const runningAgentsCount = projectAgents.filter(a => a.status !== 'idle').length

      // Calculate task stats from sessions
      const allSessionTasks = projectSessions.flatMap(s => s.tasks || [])
      const totalTasks = allSessionTasks.length
      const completedTasks = allSessionTasks.filter(t => t.status === 'completed').length
      const inProgressTasks = allSessionTasks.filter(t => t.status === 'in_progress').length
      const failedTasksRecent = allSessionTasks.filter(t =>
        t.status === 'failed' && isToday(t.completedAt)
      ).length

      // Calculate total cost for this project
      const totalCost = projectAgents.reduce((sum, a) => sum + a.cost, 0)

      // Compute last activity
      const sessionDates = projectSessions.map(s =>
        s.lastResumedAt || s.createdAt
      ).filter(Boolean)
      const lastActivity = sessionDates.length > 0
        ? new Date(Math.max(...sessionDates.map(d => new Date(d as Date | string).getTime())))
        : null

      return {
        project,
        activeSessions,
        runningAgentsCount,
        totalTasks,
        completedTasks,
        inProgressTasks,
        health: computeHealth(activeSessions, inProgressTasks, failedTasksRecent),
        lastActivity,
        totalCost,
      }
    })
  }, [projectState, sessionState, agents])

  return { projectStatuses, loading, error }
}

/**
 * Hook to fetch all active agents across all projects
 * Uses single store calls to avoid hook ordering issues
 */
export function useAllActiveAgents(): {
  activeAgents: ActiveAgentWithContext[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
} {
  const [activeAgents, setActiveAgents] = useState<ActiveAgentWithContext[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Use single store calls
  const sessions = useSessionStore(s => s.sessions)
  const projects = useProjectStore(s => s.projects)
  const tasks = useTaskStore(s => s.tasks)

  const fetchActiveAgents = useCallback(async () => {
    if (!isTauri) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      // Fetch all active agents across all sessions
      const agents = await invoke<Agent[]>('get_all_active_agents')

      // Enrich with context
      const enrichedAgents: ActiveAgentWithContext[] = agents.map(agent => {
        const session = sessions.find(s => s.id === agent.session_id)
        const project = projects.find(p => p.path === session?.projectPath)
        const task = tasks.find(t => t.id === agent.task_id)

        return {
          ...agent,
          projectPath: session?.projectPath || '',
          projectName: project?.name || getProjectName(session?.projectPath || ''),
          sessionName: session?.name || 'Unknown Session',
          taskTitle: task?.title || 'Unknown Task',
          duration: Date.now() - new Date(agent.logs[0]?.timestamp || Date.now()).getTime(),
        }
      })

      setActiveAgents(enrichedAgents)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch active agents')
      // Fall back to using store data
      const storeAgents = useAgentStore.getState().agents
      const activeFromStore = storeAgents.filter(a => a.status !== 'idle')
      const enrichedAgents: ActiveAgentWithContext[] = activeFromStore.map(agent => {
        const session = sessions.find(s => s.id === agent.session_id)
        const project = projects.find(p => p.path === session?.projectPath)
        const task = tasks.find(t => t.id === agent.task_id)

        return {
          id: agent.id,
          session_id: agent.session_id,
          task_id: agent.task_id,
          status: agent.status as AgentStatus,
          process_id: agent.process_id || null,
          worktree_path: agent.worktree_path,
          branch: agent.branch,
          iteration_count: agent.iteration_count,
          tokens: agent.tokens,
          cost: agent.cost,
          logs: agent.logs.map(l => ({
            timestamp: l.timestamp,
            level: l.level,
            message: l.message,
          })),
          subagents: [],
          projectPath: session?.projectPath || '',
          projectName: project?.name || getProjectName(session?.projectPath || ''),
          sessionName: session?.name || 'Unknown Session',
          taskTitle: task?.title || 'Unknown Task',
          duration: 0,
        }
      })
      setActiveAgents(enrichedAgents)
    } finally {
      setLoading(false)
    }
  }, [sessions, projects, tasks])

  useEffect(() => {
    fetchActiveAgents()
  }, [fetchActiveAgents])

  return { activeAgents, loading, error, refresh: fetchActiveAgents }
}

/**
 * Hook for visibility-aware polling
 */
export function useVisibilityPolling(
  callback: () => void | Promise<void>,
  intervalMs: number,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return

    let interval: ReturnType<typeof setInterval> | null = null

    const startPolling = () => {
      if (interval) clearInterval(interval)
      interval = setInterval(callback, intervalMs)
    }

    const stopPolling = () => {
      if (interval) {
        clearInterval(interval)
        interval = null
      }
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        callback() // Immediate refresh when becoming visible
        startPolling()
      } else {
        stopPolling()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Start polling if visible
    if (document.visibilityState === 'visible') {
      startPolling()
    }

    return () => {
      stopPolling()
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [callback, intervalMs, enabled])
}

/**
 * Hook for adaptive polling based on activity level
 * Takes activeAgentsCount as a parameter to avoid calling useGlobalStats again
 */
export function useAdaptivePolling(
  refreshCallback: () => Promise<void>,
  activeAgentsCount: number
) {
  // More frequent polling when agents are active
  const interval = useMemo(() => {
    if (activeAgentsCount > 5) return 3000  // 3 seconds for high activity
    if (activeAgentsCount > 0) return 5000  // 5 seconds for moderate activity
    return 15000                            // 15 seconds when idle
  }, [activeAgentsCount])

  useVisibilityPolling(refreshCallback, interval, true)
}

// Tauri event names (must match backend)
const TAURI_EVENTS = {
  AGENT_STATUS_CHANGED: 'agent:status_changed',
  TASK_STATUS_CHANGED: 'task:status_changed',
  SESSION_STATUS_CHANGED: 'session:status_changed',
  MISSION_CONTROL_REFRESH: 'mission_control:refresh',
} as const

/**
 * Hook to listen for Tauri events and trigger refreshes
 * This provides real-time updates when agent/task/session states change
 */
export function useTauriEventListeners(onRefresh: () => void) {
  useEffect(() => {
    if (!isTauri) return

    const unlisteners: Promise<UnlistenFn>[] = []

    // Listen for agent status changes
    unlisteners.push(
      listen(TAURI_EVENTS.AGENT_STATUS_CHANGED, () => {
        onRefresh()
      })
    )

    // Listen for task status changes
    unlisteners.push(
      listen(TAURI_EVENTS.TASK_STATUS_CHANGED, () => {
        onRefresh()
      })
    )

    // Listen for session status changes
    unlisteners.push(
      listen(TAURI_EVENTS.SESSION_STATUS_CHANGED, () => {
        onRefresh()
      })
    )

    // Listen for explicit refresh requests
    unlisteners.push(
      listen(TAURI_EVENTS.MISSION_CONTROL_REFRESH, () => {
        onRefresh()
      })
    )

    // Cleanup listeners on unmount
    return () => {
      unlisteners.forEach(async (unlistenPromise) => {
        const unlisten = await unlistenPromise
        unlisten()
      })
    }
  }, [onRefresh])
}

/**
 * Hook to create a refresh function for mission control data
 * Takes refreshAgents as a parameter to avoid calling useAllActiveAgents again
 */
export function useMissionControlRefresh(refreshAgents: () => Promise<void>) {
  const loadProjects = useProjectStore(s => s.loadProjects)
  const fetchSessions = useSessionStore(s => s.fetchSessions)

  const refreshAll = useCallback(async () => {
    await Promise.all([
      loadProjects(),
      fetchSessions(),
      refreshAgents(),
    ])
  }, [loadProjects, fetchSessions, refreshAgents])

  return refreshAll
}

/**
 * Hook to fetch activity feed from backend
 */
export function useActivityFeed(limit: number = 50): {
  events: ActivityEvent[]
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
} {
  const [events, setEvents] = useState<ActivityEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    if (!isTauri) {
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const apiEvents = await missionControlApi.getActivityFeed(limit)
      // Convert API events to our ActivityEvent type
      const convertedEvents: ActivityEvent[] = apiEvents.map(e => ({
        id: e.id,
        timestamp: new Date(e.timestamp),
        eventType: e.eventType as ActivityEvent['eventType'],
        projectPath: e.projectPath,
        projectName: e.projectName,
        sessionName: e.sessionName,
        description: e.description,
      }))
      setEvents(convertedEvents)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch activity feed')
    } finally {
      setLoading(false)
    }
  }, [limit])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  return { events, loading, error, refresh: fetchEvents }
}

/**
 * Combined hook for all mission control data
 */
export function useMissionControlData() {
  const globalStats = useGlobalStats()
  const { projectStatuses, loading: projectsLoading, error: projectsError } = useProjectStatuses()
  const { activeAgents, loading: agentsLoading, error: agentsError, refresh: refreshAgents } = useAllActiveAgents()

  const loading = globalStats.loading || projectsLoading || agentsLoading
  const error = globalStats.error || projectsError || agentsError

  // Pass refreshAgents to avoid duplicate useAllActiveAgents call
  const refreshAll = useMissionControlRefresh(refreshAgents)

  // Set up adaptive polling with activeAgentsCount from globalStats
  useAdaptivePolling(refreshAll, globalStats.activeAgentsCount)

  return {
    globalStats,
    projectStatuses,
    activeAgents,
    loading,
    error,
    refreshAll,
    refreshAgents,
  }
}
