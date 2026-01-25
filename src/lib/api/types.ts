// Shared types for API modules
// Re-exported from backend-api.ts for backwards compatibility

export interface AgentAvailabilityResult {
  available: boolean
  agent: string
  path: string | null
  error: string | null
}

export interface WatchFileResponse {
  success: boolean
  path: string
  initialContent: string | null
  error: string | null
}

// Mission Control types
export interface ActivityEvent {
  id: string
  timestamp: string
  eventType:
    | 'task_completed'
    | 'task_started'
    | 'task_failed'
    | 'agent_spawned'
    | 'session_started'
    | 'session_completed'
  projectPath: string
  projectName: string
  sessionName: string
  description: string
}

export interface GlobalStats {
  activeAgentsCount: number
  tasksInProgress: number
  tasksCompletedToday: number
  totalCostToday: number
  activeProjectsCount: number
  totalProjects: number
}
