// Derived selectors for Mission Control dashboard
// Simplified version that uses only Ralph Loop data and Projects

import { useMemo, useCallback, useEffect, useState } from 'react'
import { useShallow } from 'zustand/shallow'
import { useProjectStore } from '@/stores/projectStore'
import { useRalphLoopStore } from '@/stores/ralphLoopStore'
import type { Project } from '@/types'
import { ralphLoopApi } from '@/lib/backend-api'

// ============================================================================
// Types
// ============================================================================

export interface ExecutionInfo {
  executionId: string
  projectPath: string | null
  state: string | null
}

export interface GlobalStats {
  activeExecutionsCount: number
  totalProjects: number
  activeProjectsCount: number
  /** Map of project path to execution ID for active executions */
  activeProjectPaths: Map<string, string>
}

export interface ProjectStatus {
  project: Project
  health: 'healthy' | 'idle'
  lastActivity: Date | null
  /** Execution ID if this project has an active execution */
  activeExecutionId?: string
}

// ============================================================================
// Helper Functions
// ============================================================================

function getLastActivityDate(project: Project): Date | null {
  if (project.lastUsedAt) {
    return new Date(project.lastUsedAt)
  }
  return null
}

// ============================================================================
// Custom Hooks
// ============================================================================

/**
 * Hook to get global statistics across all projects
 */
export function useGlobalStats(): GlobalStats & { loading: boolean; error: string | null } {
  const [activeExecutions, setActiveExecutions] = useState<ExecutionInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const projectState = useProjectStore(useShallow(s => ({
    projects: s.projects,
    loading: s.loading,
    error: s.error
  })))

  // Fetch active executions from backend
  useEffect(() => {
    const fetchExecutions = async () => {
      try {
        const executions = await ralphLoopApi.listExecutionsWithDetails()
        setActiveExecutions(executions)
        setError(null)
      } catch (err) {
        console.error('Failed to fetch executions:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch executions')
      } finally {
        setLoading(false)
      }
    }
    fetchExecutions()
    // Poll periodically
    const interval = setInterval(fetchExecutions, 10000)
    return () => clearInterval(interval)
  }, [])

  const combinedLoading = projectState.loading || loading
  const combinedError = projectState.error || error

  const stats = useMemo(() => {
    const { projects } = projectState

    // Build map of project path -> execution ID
    const activeProjectPaths = new Map<string, string>()
    for (const exec of activeExecutions) {
      if (exec.projectPath) {
        activeProjectPaths.set(exec.projectPath, exec.executionId)
      }
    }

    return {
      activeExecutionsCount: activeExecutions.length,
      totalProjects: projects.length,
      activeProjectsCount: activeProjectPaths.size,
      activeProjectPaths,
    }
  }, [activeExecutions, projectState])

  return { ...stats, loading: combinedLoading, error: combinedError }
}

/**
 * Hook to get status for all projects
 */
export function useProjectStatuses(activeProjectPaths?: Map<string, string>): {
  projectStatuses: ProjectStatus[]
  loading: boolean
  error: string | null
} {
  const projectState = useProjectStore(useShallow(s => ({
    projects: s.projects,
    loading: s.loading,
    error: s.error
  })))

  // Fallback to store state if activeProjectPaths not provided
  const activeExecutionId = useRalphLoopStore(s => s.activeExecutionId)
  const currentProjectPath = useRalphLoopStore(s => s.currentProjectPath)

  const projectStatuses = useMemo(() => {
    const { projects } = projectState

    return projects.map(project => {
      // Check if this project has an active Ralph Loop execution
      // First check the passed activeProjectPaths map (from API), then fallback to store
      const executionIdFromMap = activeProjectPaths?.get(project.path)
      const storeExecutionId = currentProjectPath === project.path ? activeExecutionId : undefined
      const activeExecId = executionIdFromMap ?? storeExecutionId

      return {
        project,
        health: activeExecId ? 'healthy' as const : 'idle' as const,
        lastActivity: getLastActivityDate(project),
        activeExecutionId: activeExecId ?? undefined,
      }
    })
  }, [projectState, activeExecutionId, currentProjectPath, activeProjectPaths])

  return { projectStatuses, loading: projectState.loading, error: projectState.error }
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
 * Hook to create a refresh function for mission control data
 */
export function useMissionControlRefresh() {
  const loadProjects = useProjectStore(s => s.loadProjects)

  const refreshAll = useCallback(async () => {
    await loadProjects()
  }, [loadProjects])

  return refreshAll
}

/**
 * Combined hook for all mission control data
 */
export function useMissionControlData() {
  const globalStats = useGlobalStats()
  const { projectStatuses, loading: projectsLoading, error: projectsError } = useProjectStatuses(globalStats.activeProjectPaths)

  const loading = globalStats.loading || projectsLoading
  const error = globalStats.error || projectsError

  const refreshAll = useMissionControlRefresh()

  // Set up polling
  useVisibilityPolling(refreshAll, 15000, true)

  return {
    globalStats,
    projectStatuses,
    loading,
    error,
    refreshAll,
  }
}
