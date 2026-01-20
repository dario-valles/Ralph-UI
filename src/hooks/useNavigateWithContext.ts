/**
 * Hook for navigating with session/project context.
 * Sets session and project context before navigating to ensure pages have required data.
 */

import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'
import { useProjectStore } from '@/stores/projectStore'
import type { Session } from '@/types'

export function useNavigateWithContext() {
  const navigate = useNavigate()
  const { sessions, setCurrentSession } = useSessionStore()
  const { projects, setActiveProject } = useProjectStore()

  /**
   * Navigate to a session-related page with context set.
   * Sets currentSession and activeProject before navigating.
   *
   * @param session - The session to set as current context
   * @param path - Optional path to navigate to (defaults to `/sessions/${session.id}`)
   * @param options - Optional navigation options
   */
  const navigateToSession = (
    session: Session,
    path?: string,
    options?: { state?: Record<string, unknown> }
  ) => {
    setCurrentSession(session)
    const project = projects.find((p) => p.path === session.projectPath)
    if (project) {
      setActiveProject(project.id)
    }
    navigate(path || `/sessions/${session.id}`, options)
  }

  /**
   * Navigate to an agent-related page with context set.
   *
   * @param sessionId - The session ID to look up and set as context
   * @param path - Path to navigate to
   * @param options - Optional navigation options
   */
  const navigateWithSessionId = (
    sessionId: string,
    path: string,
    options?: { state?: Record<string, unknown> }
  ) => {
    const session = sessions.find((s) => s.id === sessionId)
    if (session) {
      setCurrentSession(session)
      const project = projects.find((p) => p.path === session.projectPath)
      if (project) {
        setActiveProject(project.id)
      }
    }
    navigate(path, options)
  }

  return {
    navigate,
    navigateToSession,
    navigateWithSessionId,
  }
}
