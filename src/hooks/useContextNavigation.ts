import { useNavigate } from 'react-router-dom'
import { useProjectStore } from '@/stores/projectStore'

/**
 * Hook for URL-first navigation that encodes context in URL parameters.
 * This ensures navigation context is preserved in the URL for deep linking
 * and browser history support.
 */
export function useContextNavigation() {
  const navigate = useNavigate()
  const { setActiveProject, projects } = useProjectStore()

  /**
   * Navigate to tasks page with session context
   */
  const navigateToTasks = (sessionId: string) => {
    navigate(`/tasks?session=${sessionId}`)
  }

  /**
   * Navigate to agents page with session context
   */
  const navigateToAgents = (sessionId: string) => {
    navigate(`/agents?session=${sessionId}`)
  }

  /**
   * Navigate to session detail page and set context
   */
  const navigateToSession = (sessionId: string, projectPath?: string) => {
    // Set project context if provided
    if (projectPath) {
      const project = projects.find((p) => p.path === projectPath)
      if (project) {
        setActiveProject(project.id)
      }
    }
    navigate(`/sessions/${sessionId}`)
  }

  /**
   * Navigate to PRD chat with optional session
   */
  const navigateToPRDChat = (sessionId?: string) => {
    if (sessionId) {
      navigate(`/prds/chat?session=${sessionId}`)
    } else {
      navigate('/prds/chat')
    }
  }

  /**
   * Navigate to PRD list for a project
   */
  const navigateToPRDs = (projectPath?: string) => {
    if (projectPath) {
      navigate(`/prds?project=${encodeURIComponent(projectPath)}`)
    } else {
      navigate('/prds')
    }
  }

  /**
   * Navigate to Ralph Loop page
   */
  const navigateToRalphLoop = () => {
    navigate('/ralph-loop')
  }

  /**
   * Navigate to mission control (home)
   */
  const navigateToMissionControl = () => {
    navigate('/')
  }

  /**
   * Navigate to settings
   */
  const navigateToSettings = (tab?: string) => {
    if (tab) {
      navigate(`/settings?tab=${tab}`)
    } else {
      navigate('/settings')
    }
  }

  return {
    navigateToTasks,
    navigateToAgents,
    navigateToSession,
    navigateToPRDChat,
    navigateToPRDs,
    navigateToRalphLoop,
    navigateToMissionControl,
    navigateToSettings,
  }
}
