import { useState, useCallback } from 'react'

/**
 * UI state for PRDChatPanel component
 */
interface PRDChatPanelUIState {
  // Dialog states
  showTypeSelector: boolean
  showDeleteConfirm: boolean
  sessionToDelete: string | null

  // Error states
  agentError: string | null

  // Model selection
  userSelectedModel: string

  // Streaming state
  streamingStartedAt: string | null
  lastMessageContent: string | null

  // Layout states
  showPlanSidebar: boolean
  sessionsCollapsed: boolean
  mobilePlanSheetOpen: boolean

  // Loading state
  initialLoadComplete: boolean
}

const initialState: PRDChatPanelUIState = {
  showTypeSelector: false,
  showDeleteConfirm: false,
  sessionToDelete: null,
  agentError: null,
  userSelectedModel: '',
  streamingStartedAt: null,
  lastMessageContent: null,
  showPlanSidebar: true,
  sessionsCollapsed: false,
  mobilePlanSheetOpen: false,
  initialLoadComplete: false,
}

/**
 * Custom hook to manage PRDChatPanel UI state.
 * Consolidates multiple useState calls into a single manageable hook.
 */
export function usePRDChatPanelState() {
  const [state, setState] = useState<PRDChatPanelUIState>(initialState)

  // Dialog actions
  const openTypeSelector = useCallback(() => {
    setState((s) => ({ ...s, showTypeSelector: true }))
  }, [])

  const closeTypeSelector = useCallback(() => {
    setState((s) => ({ ...s, showTypeSelector: false }))
  }, [])

  const openDeleteConfirm = useCallback((sessionId: string) => {
    setState((s) => ({ ...s, showDeleteConfirm: true, sessionToDelete: sessionId }))
  }, [])

  const closeDeleteConfirm = useCallback(() => {
    setState((s) => ({ ...s, showDeleteConfirm: false, sessionToDelete: null }))
  }, [])

  // Error actions
  const setAgentError = useCallback((error: string | null) => {
    setState((s) => ({ ...s, agentError: error }))
  }, [])

  // Model selection
  const setUserSelectedModel = useCallback((model: string) => {
    setState((s) => ({ ...s, userSelectedModel: model }))
  }, [])

  // Streaming actions
  const startStreaming = useCallback((messageContent: string) => {
    setState((s) => ({
      ...s,
      streamingStartedAt: new Date().toISOString(),
      lastMessageContent: messageContent,
    }))
  }, [])

  const stopStreaming = useCallback(() => {
    setState((s) => ({ ...s, streamingStartedAt: null }))
  }, [])

  // Layout actions
  const togglePlanSidebar = useCallback(() => {
    setState((s) => ({ ...s, showPlanSidebar: !s.showPlanSidebar }))
  }, [])

  const setShowPlanSidebar = useCallback((show: boolean) => {
    setState((s) => ({ ...s, showPlanSidebar: show }))
  }, [])

  const setSessionsCollapsed = useCallback((collapsed: boolean) => {
    setState((s) => ({ ...s, sessionsCollapsed: collapsed }))
  }, [])

  const setMobilePlanSheetOpen = useCallback((open: boolean) => {
    setState((s) => ({ ...s, mobilePlanSheetOpen: open }))
  }, [])

  // Loading state
  const setInitialLoadComplete = useCallback((complete: boolean) => {
    setState((s) => ({ ...s, initialLoadComplete: complete }))
  }, [])

  return {
    // State values
    ...state,

    // Dialog actions
    openTypeSelector,
    closeTypeSelector,
    openDeleteConfirm,
    closeDeleteConfirm,

    // Error actions
    setAgentError,

    // Model selection
    setUserSelectedModel,

    // Streaming actions
    startStreaming,
    stopStreaming,

    // Layout actions
    togglePlanSidebar,
    setShowPlanSidebar,
    setSessionsCollapsed,
    setMobilePlanSheetOpen,

    // Loading state
    setInitialLoadComplete,
  }
}
