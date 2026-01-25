import { useRef, useEffect, useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAutoScroll } from '@/hooks/useAutoScroll'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { NativeSelect as Select } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip } from '@/components/ui/tooltip'
import {
  Plus,
  Loader2,
  MessageSquare,
  Bot,
  BarChart3,
  AlertTriangle,
  ScrollText,
  ChevronDown,
  Play,
  Code,
  FileText,
  ArrowDown,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { useProjectStore } from '@/stores/projectStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { PRDTypeSelector } from './PRDTypeSelector'
import { GSDWorkflow } from './GSDWorkflow'
import { ChatMessageItem } from './ChatMessageItem'
import { ChatInput } from './ChatInput'
import { StreamingIndicator } from './StreamingIndicator'
import { SessionsSidebar } from './SessionsSidebar'
import { PRDPlanSidebar } from './PRDPlanSidebar'
import { PRDFileExecutionDialog } from './PRDFileExecutionDialog'
import { FloatingQualityBadge } from './FloatingQualityBadge'
import { prdChatApi, prdApi } from '@/lib/backend-api'
import { toast } from '@/stores/toastStore'
import type { PRDTypeValue, ChatSession, AgentType, PRDFile, ChatAttachment } from '@/types'
import { cn } from '@/lib/utils'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { ModelSelector } from '@/components/shared/ModelSelector'
import { usePRDChatEvents } from '@/hooks/usePRDChatEvents'
import { useIsMobile, useScrollDirection } from '@/hooks/useMediaQuery'
import { usePRDChatPanelState } from '@/hooks/usePRDChatPanelState'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'

// ============================================================================
// Main Component
// ============================================================================

export function PRDChatPanel() {
  const [searchParams] = useSearchParams()
  const prdIdFromUrl = searchParams.get('prdId')

  const { registerProject } = useProjectStore()
  // Subscribe to projects and activeProjectId so component re-renders when they change
  // This fixes an issue where sessions wouldn't load on page reload
  const activeProject = useProjectStore((state) => {
    const { projects, activeProjectId } = state
    if (!activeProjectId) return undefined
    return projects.find((p) => p.id === activeProjectId)
  })

  const prevSessionIdRef = useRef<string | null>(null)
  const prevAgentTypeRef = useRef<string>('')

  // Consolidated UI state
  const {
    showTypeSelector,
    showDeleteConfirm,
    sessionToDelete,
    agentError,
    userSelectedModel,
    streamingStartedAt,
    lastMessageContent,
    showPlanSidebar,
    sessionsCollapsed,
    mobilePlanSheetOpen,
    initialLoadComplete,
    openTypeSelector,
    closeTypeSelector,
    openDeleteConfirm,
    closeDeleteConfirm,
    setAgentError,
    setUserSelectedModel,
    startStreaming,
    stopStreaming,
    setShowPlanSidebar,
    setSessionsCollapsed,
    setMobilePlanSheetOpen,
    setInitialLoadComplete,
  } = usePRDChatPanelState()

  const isMobile = useIsMobile()

  // State for PRD execution dialog
  const [executePrdFile, setExecutePrdFile] = useState<PRDFile | null>(null)
  // State for mobile plan view mode (raw vs rendered)
  const [showRawMobile, setShowRawMobile] = useState(false)

  const {
    sessions,
    currentSession,
    messages,
    loading,
    streaming,
    error,
    qualityAssessment,
    processingSessionId,
    watchedPlanContent,
    watchedPlanPath,
    isWatchingPlan,
    sendMessage,
    startSession,
    deleteSession,
    setCurrentSession,
    loadHistory,
    loadSessions,
    assessQuality,
    startWatchingPlanFile,
    stopWatchingPlanFile,
    updatePlanContent,
    updateSessionAgent,
  } = usePRDChatStore()

  // Auto-scroll hook for messages - must be after usePRDChatStore since it uses messages
  const {
    scrollRef: messagesContainerRef,
    isAtBottom,
    scrollToBottom,
  } = useAutoScroll({ offset: 50, smooth: true, content: messages })

  // Track scroll direction for mobile header auto-hide
  const scrollDirection = useScrollDirection(messagesContainerRef, 15)

  // Load available models for the current agent type
  const agentType = (currentSession?.agentType || 'claude') as AgentType
  const { models, loading: modelsLoading, defaultModelId } = useAvailableModels(agentType)

  // Memoize the plan update callback for the events hook
  const handlePlanUpdated = useCallback(
    (content: string, path: string) => {
      updatePlanContent(content, path)
    },
    [updatePlanContent]
  )

  // PRD chat events hook - handles file updates and streaming chunks
  const { streamingContent, clearStreamingContent } = usePRDChatEvents({
    sessionId: currentSession?.id,
    onPlanUpdated: handlePlanUpdated,
  })

  // Reset user selection when agent type changes
  useEffect(() => {
    if (prevAgentTypeRef.current !== agentType) {
      prevAgentTypeRef.current = agentType
      if (userSelectedModel) {
        setUserSelectedModel('')
      }
    }
  }, [agentType, userSelectedModel, setUserSelectedModel])

  // Effective model: user selection if set, otherwise default
  const selectedModel = userSelectedModel || defaultModelId

  // Track the previous processing session to detect when processing completes
  const prevProcessingSessionIdRef = useRef<string | null>(null)

  // Load sessions on mount and auto-refresh if returning after processing
  useEffect(() => {
    const init = async () => {
      setInitialLoadComplete(false)
      if (activeProject?.path) {
        await loadSessions(activeProject.path)
        setInitialLoadComplete(true)
      }

      // If we had a processing session stored and we're returning to this view,
      // reload its history to show the new messages
      const storedProcessingId = prevProcessingSessionIdRef.current
      if (storedProcessingId && !processingSessionId && activeProject?.path) {
        // Processing completed while we were away - reload history
        loadHistory(storedProcessingId, activeProject.path)
      }
    }

    init()
  }, [loadSessions, loadHistory, processingSessionId, activeProject?.path, setInitialLoadComplete])

  // Keep track of processing session ID changes
  useEffect(() => {
    prevProcessingSessionIdRef.current = processingSessionId
  }, [processingSessionId])

  // Handle prdId URL param for "Continue in Chat" functionality
  useEffect(() => {
    if (prdIdFromUrl && !currentSession && initialLoadComplete && activeProject?.path) {
      // Check if we already have a session for this PRD
      const existingSession = sessions.find((s) => s.prdId === prdIdFromUrl)

      if (existingSession) {
        setCurrentSession(existingSession)
      } else {
        startSession({
          agentType: 'claude',
          prdId: prdIdFromUrl,
          guidedMode: true,
          projectPath: activeProject.path,
        })
      }
    }
  }, [
    prdIdFromUrl,
    currentSession,
    startSession,
    setCurrentSession,
    activeProject?.path,
    initialLoadComplete,
    sessions,
  ])

  // Auto-select most recent session when currentSession is cleared but sessions exist
  useEffect(() => {
    if (initialLoadComplete && !currentSession && sessions.length > 0 && !showTypeSelector) {
      setCurrentSession(sessions[0])
    }
  }, [initialLoadComplete, currentSession, sessions, showTypeSelector, setCurrentSession])

  // Load history when session changes
  useEffect(() => {
    if (currentSession && currentSession.id !== prevSessionIdRef.current) {
      loadHistory(currentSession.id, currentSession.projectPath)
      prevSessionIdRef.current = currentSession.id
    }
  }, [currentSession, loadHistory])

  // Track connection status for mobile resilience - reload history when reconnected
  const connectionStatus = useConnectionStore((state) => state.status)
  const prevConnectionStatusRef = useRef(connectionStatus)

  // Reload history when connection is restored (mobile resilience)
  useEffect(() => {
    const wasDisconnected =
      prevConnectionStatusRef.current === 'disconnected' ||
      prevConnectionStatusRef.current === 'reconnecting' ||
      prevConnectionStatusRef.current === 'offline'
    const isNowConnected = connectionStatus === 'connected'
    prevConnectionStatusRef.current = connectionStatus

    // If we just reconnected and have an active session, reload its history
    // This ensures we get any messages that arrived while we were away
    if (wasDisconnected && isNowConnected && currentSession && activeProject?.path) {
      console.log('[PRDChatPanel] Connection restored, reloading session and history')
      const currentSessionId = currentSession.id

      // Reload the session to check if it's still processing (pendingOperationStartedAt)
      // and reload history to get any new messages
      const refreshSession = async () => {
        try {
          // Reload sessions to get fresh state including pendingOperationStartedAt
          await loadSessions(activeProject.path)

          // Get the updated session from the store and refresh currentSession
          const updatedSessions = usePRDChatStore.getState().sessions
          const updatedSession = updatedSessions.find((s) => s.id === currentSessionId)
          if (updatedSession) {
            // Update currentSession with fresh data (this triggers streaming state restoration)
            setCurrentSession(updatedSession)
          }

          // Then reload history for current session (pass projectPath explicitly for robustness)
          await loadHistory(currentSessionId, activeProject.path)
        } catch (err) {
          console.error('[PRDChatPanel] Failed to refresh after reconnection:', err)
        }
      }
      refreshSession()
    }
  }, [
    connectionStatus,
    currentSession,
    loadHistory,
    loadSessions,
    setCurrentSession,
    activeProject?.path,
  ])

  // Clear streaming content when streaming completes
  useEffect(() => {
    if (!streaming) {
      clearStreamingContent()
    }
  }, [streaming, clearStreamingContent])

  // Start/stop watching plan file when session changes
  useEffect(() => {
    const hasProjectPath = currentSession?.projectPath
    if (hasProjectPath) {
      startWatchingPlanFile()
    }

    return () => {
      stopWatchingPlanFile()
    }
  }, [currentSession?.id, currentSession?.projectPath, startWatchingPlanFile, stopWatchingPlanFile])

  // Auto-show sidebar when plan content first appears (not on every render)
  const hadPlanContentRef = useRef(false)
  useEffect(() => {
    // Only auto-open when content first appears, not when user manually closes
    if (watchedPlanContent && !hadPlanContentRef.current) {
      hadPlanContentRef.current = true
      setShowPlanSidebar(true)
    }
    // Reset when content is cleared (e.g., session change)
    if (!watchedPlanContent) {
      hadPlanContentRef.current = false
    }
  }, [watchedPlanContent, setShowPlanSidebar])

  // Auto-refresh quality score when plan file content changes
  const prevPlanContentRef = useRef<string | null>(null)
  useEffect(() => {
    // Only refresh if content actually changed and we have content
    if (watchedPlanContent && watchedPlanContent !== prevPlanContentRef.current) {
      prevPlanContentRef.current = watchedPlanContent
      // Debounce the quality assessment to avoid too many calls
      const timer = setTimeout(() => {
        assessQuality()
      }, 1000) // Wait 1 second after last update
      return () => clearTimeout(timer)
    }
  }, [watchedPlanContent, assessQuality])

  const handleAgentChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAgentType = e.target.value
    setAgentError(null)

    // Check if the agent is available before prompting for new session
    try {
      const result = await prdChatApi.checkAgentAvailability(newAgentType)
      if (!result.available) {
        setAgentError(result.error || `Agent '${newAgentType}' is not available`)
        return
      }
      // Agent is available
      if (currentSession) {
        await updateSessionAgent(newAgentType)
      } else {
        // No active session - show type selector to create new one
        openTypeSelector()
      }
    } catch (err) {
      setAgentError(
        `Failed to check agent availability: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    }
  }

  const handleSendMessage = async (content: string, attachments?: ChatAttachment[]) => {
    startStreaming(content)
    try {
      await sendMessage(content, attachments)
    } finally {
      stopStreaming()
    }
  }

  const handleRetryMessage = () => {
    if (lastMessageContent) {
      handleSendMessage(lastMessageContent)
    }
  }

  const handleCancelStreaming = () => {
    // For now, just clear the streaming state on frontend
    // The backend timeout will handle actual process termination
    stopStreaming()
    // Note: The actual request cannot be cancelled from frontend,
    // but we can show the user the interface is responsive
    toast.warning('Request will complete in background. You can retry with a new message.')
  }

  const handleCreateSession = () => {
    openTypeSelector()
  }

  const handleTypeSelected = (
    prdType: PRDTypeValue,
    guidedMode: boolean,
    projectPath?: string,
    gsdMode?: boolean,
    title?: string
  ) => {
    // Register the project when starting a session
    if (projectPath) {
      registerProject(projectPath)
    }
    startSession({
      agentType: currentSession?.agentType || 'claude',
      prdType,
      guidedMode,
      gsdMode: gsdMode || false,
      projectPath: projectPath || activeProject?.path || '',
      title,
    })
    closeTypeSelector()
  }

  const handleQuickStart = () => {
    // Quick start without type selection (general type)
    // Always pass projectPath to ensure files can be saved
    startSession({
      agentType: 'claude',
      prdType: 'general',
      guidedMode: true,
      projectPath: activeProject?.path || '',
    })
    closeTypeSelector()
  }

  const handleDeleteSession = (sessionId: string) => {
    openDeleteConfirm(sessionId)
  }

  const confirmDeleteSession = async () => {
    if (sessionToDelete) {
      await deleteSession(sessionToDelete)
      closeDeleteConfirm()
    }
  }

  const cancelDeleteSession = () => {
    closeDeleteConfirm()
  }

  const handleSelectSession = (session: ChatSession) => {
    // Only set the session - useEffect will handle loading history
    setCurrentSession(session)
  }

  const handleRefreshQuality = () => {
    assessQuality()
  }

  // Handle executing the PRD from the chat
  const handleExecutePrd = async () => {
    if (!watchedPlanPath || !currentSession?.projectPath) {
      toast.error('No PRD available', 'Create or export a PRD first before executing.')
      return
    }

    // Extract PRD name from the watched plan path
    // Path format: {projectPath}/.ralph-ui/prds/{prdName}.md
    const pathParts = watchedPlanPath.split('/')
    const fileName = pathParts[pathParts.length - 1] // e.g., "my-feature-prd.md"
    const prdName = fileName.replace('.md', '')

    try {
      const prdFile = await prdApi.getFile(currentSession.projectPath, prdName)
      setExecutePrdFile(prdFile)
    } catch (err) {
      console.error('Failed to load PRD file:', err)
      toast.error(
        'Failed to load PRD',
        err instanceof Error ? err.message : 'An unexpected error occurred.'
      )
    }
  }

  const hasMessages = messages.length > 0
  const isDisabled = loading || streaming || !currentSession

  // Show type selector when:
  // 1. User explicitly requested it (New Chat button)
  // 2. No sessions exist AND no current session (first-time user)
  if (showTypeSelector || (initialLoadComplete && sessions.length === 0 && !currentSession)) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <PRDTypeSelector
          onSelect={handleTypeSelected}
          loading={loading}
          defaultProjectPath={activeProject?.path}
        />
      </div>
    )
  }

  // Handle plan sidebar/sheet toggle for mobile
  const handlePlanToggle = () => {
    if (isMobile) {
      setMobilePlanSheetOpen(!mobilePlanSheetOpen)
    } else {
      setShowPlanSidebar(!showPlanSidebar)
    }
  }

  const isPlanVisible = isMobile ? mobilePlanSheetOpen : showPlanSidebar

  return (
    <div className="flex h-full flex-col lg:flex-row gap-2 xl:gap-4">
      {/* Session Sidebar - Hidden on mobile, collapsible on larger screens */}
      <SessionsSidebar
        sessions={sessions}
        currentSession={currentSession}
        processingSessionId={processingSessionId}
        hasMessages={hasMessages}
        collapsed={sessionsCollapsed}
        onCollapsedChange={setSessionsCollapsed}
        onCreateSession={handleCreateSession}
        onSelectSession={handleSelectSession}
        onDeleteSession={handleDeleteSession}
        qualityAssessment={qualityAssessment}
        loading={loading}
        onRefreshQuality={handleRefreshQuality}
        className="hidden lg:flex"
      />

      {/* Chat Panel */}
      <Card className={cn('flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden')}>
        {/* Mobile Header - Single compact row with auto-hide on scroll */}
        <div
          className={cn(
            'lg:hidden flex-shrink-0 bg-gradient-to-b from-card to-muted/20 border-b border-border/50 transition-all duration-200 ease-in-out overflow-hidden',
            scrollDirection === 'down' ? 'max-h-0 opacity-0 border-b-0' : 'max-h-16 opacity-100'
          )}
        >
          <div className="px-2.5 py-2 flex items-center gap-1.5">
            {/* Session selector - compact */}
            <Select
              id="mobile-session-selector"
              aria-label="Select session"
              value={currentSession?.id || ''}
              onChange={(e) => {
                const session = sessions.find((s) => s.id === e.target.value)
                if (session) handleSelectSession(session)
              }}
              className="flex-1 min-w-0 text-sm h-9 font-medium rounded-xl border-border/50"
            >
              <option value="" disabled>
                Select session...
              </option>
              {sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.title || 'Untitled Session'}
                </option>
              ))}
            </Select>

            {/* New session button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateSession}
              className="h-9 w-9 p-0 flex-shrink-0 rounded-xl border-border/50"
              aria-label="New session"
            >
              <Plus className="h-4 w-4" />
            </Button>

            {/* Plan toggle - always visible if project path exists */}
            {currentSession?.projectPath && (
              <Button
                variant={isPlanVisible ? 'default' : 'outline'}
                size="sm"
                onClick={handlePlanToggle}
                disabled={streaming}
                aria-label="Toggle plan"
                className={cn(
                  'h-9 w-9 p-0 relative rounded-xl flex-shrink-0 transition-all',
                  isPlanVisible
                    ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 border-0'
                    : 'border-border/50'
                )}
              >
                <ScrollText className="h-4 w-4" />
                {watchedPlanContent && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-white/50" />
                  </span>
                )}
              </Button>
            )}

            {/* Combined settings & actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-9 p-0 rounded-xl flex-shrink-0 border-border/50"
                  disabled={streaming}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 rounded-2xl border-border/40 shadow-2xl p-0 overflow-hidden">
                {/* Agent & Model selection - Premium card style */}
                <div className="bg-gradient-to-b from-muted/30 to-muted/50 p-3 border-b border-border/30">
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className="h-5 w-5 rounded-md bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
                      <Bot className="h-3 w-3 text-white" />
                    </div>
                    <span className="text-xs font-semibold text-foreground/80">AI Configuration</span>
                  </div>
                  <div className="space-y-2">
                    {/* Agent selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-muted-foreground w-12">Agent</span>
                      <Select
                        id="mobile-agent-selector"
                        aria-label="Agent"
                        value={currentSession?.agentType || 'claude'}
                        onChange={handleAgentChange}
                        disabled={streaming}
                        className="flex-1 text-xs h-8 bg-background/80 backdrop-blur-sm border-border/40 rounded-lg font-medium shadow-sm"
                      >
                        <option value="claude">Claude Code</option>
                        <option value="opencode">OpenCode</option>
                        <option value="cursor">Cursor</option>
                      </Select>
                    </div>
                    {/* Model selector */}
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-medium text-muted-foreground w-12">Model</span>
                      <ModelSelector
                        id="mobile-model-selector"
                        value={selectedModel || defaultModelId || ''}
                        onChange={setUserSelectedModel}
                        models={models}
                        loading={modelsLoading}
                        disabled={streaming}
                        className="flex-1 text-xs h-8 bg-background/80 backdrop-blur-sm border-border/40 rounded-lg font-medium shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Actions section */}
                <div className="p-2">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1.5">Actions</p>
                  {hasMessages ? (
                    <div className="space-y-1">
                      <DropdownMenuItem
                        onClick={handleRefreshQuality}
                        disabled={loading}
                        className="rounded-xl h-11 px-3 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 focus:bg-emerald-50 dark:focus:bg-emerald-950/30 transition-colors"
                      >
                        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mr-3 shadow-sm">
                          <BarChart3 className="h-3.5 w-3.5 text-white" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="text-sm font-medium">Check Quality</p>
                          <p className="text-[10px] text-muted-foreground">Analyze PRD completeness</p>
                        </div>
                        {qualityAssessment && (
                          <div className={cn(
                            "h-7 min-w-[2.5rem] px-2 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-sm",
                            qualityAssessment.overall >= 80 ? "bg-gradient-to-br from-green-400 to-emerald-500" :
                            qualityAssessment.overall >= 60 ? "bg-gradient-to-br from-yellow-400 to-amber-500" :
                            qualityAssessment.overall >= 40 ? "bg-gradient-to-br from-orange-400 to-orange-500" :
                            "bg-gradient-to-br from-red-400 to-red-500"
                          )}>
                            {qualityAssessment.overall}%
                          </div>
                        )}
                      </DropdownMenuItem>
                      {watchedPlanPath && (
                        <DropdownMenuItem
                          onClick={handleExecutePrd}
                          disabled={loading}
                          className="rounded-xl h-11 px-3 hover:bg-blue-50 dark:hover:bg-blue-950/30 focus:bg-blue-50 dark:focus:bg-blue-950/30 transition-colors"
                        >
                          <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center mr-3 shadow-sm">
                            <Play className="h-3.5 w-3.5 text-white" />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-medium">Execute PRD</p>
                            <p className="text-[10px] text-muted-foreground">Run implementation tasks</p>
                          </div>
                        </DropdownMenuItem>
                      )}
                    </div>
                  ) : (
                    <div className="px-3 py-4 text-center">
                      <div className="h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center mx-auto mb-2">
                        <MessageSquare className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                      <p className="text-xs text-muted-foreground">Send a message to unlock actions</p>
                    </div>
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Desktop Header */}
        <CardHeader className="pb-3 pt-3 border-b border-border/50 px-4 flex-shrink-0 bg-gradient-to-b from-card to-muted/20 hidden lg:block">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-shrink">
              <h2 className="sr-only">PRD Chat</h2>
              <CardTitle className="text-base font-semibold tracking-tight truncate">
                {currentSession?.title || 'PRD Chat'}
              </CardTitle>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Agent/Model Selector - Refined pill design */}
              <div className="flex items-center gap-0.5 bg-gradient-to-b from-muted/40 to-muted/60 rounded-xl p-1 border border-border/30 shadow-sm">
                <Select
                  id="agent-selector"
                  aria-label="Agent"
                  value={currentSession?.agentType || 'claude'}
                  onChange={handleAgentChange}
                  disabled={streaming}
                  className="w-20 text-xs h-7 bg-background/80 backdrop-blur-sm border-0 rounded-lg font-medium shadow-sm"
                >
                  <option value="claude">Claude</option>
                  <option value="opencode">OpenCode</option>
                  <option value="cursor">Cursor</option>
                </Select>
                <div className="w-px h-5 bg-gradient-to-b from-transparent via-border to-transparent" />
                <ModelSelector
                  id="model-selector"
                  value={selectedModel || defaultModelId || ''}
                  onChange={setUserSelectedModel}
                  models={models}
                  loading={modelsLoading}
                  disabled={streaming}
                  className="w-32 xl:w-40 text-xs h-7 bg-background/80 backdrop-blur-sm border-0 rounded-lg font-medium shadow-sm"
                />
              </div>

              {/* Plan Sidebar Toggle */}
              {currentSession?.projectPath && (
                <Tooltip content={isPlanVisible ? 'Hide plan' : 'Show plan'} side="bottom">
                  <Button
                    variant={isPlanVisible ? 'default' : 'ghost'}
                    size="sm"
                    onClick={handlePlanToggle}
                    disabled={streaming}
                    aria-label="Toggle plan sidebar"
                    className={cn(
                      'h-8 w-8 p-0 rounded-xl relative transition-all',
                      isPlanVisible
                        ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 border-0'
                        : 'border border-border/50 hover:bg-muted/50'
                    )}
                  >
                    <ScrollText className="h-4 w-4" />
                    {watchedPlanContent && (
                      <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 border border-white/50" />
                      </span>
                    )}
                  </Button>
                </Tooltip>
              )}

              {/* Actions Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 px-3 rounded-xl border-border/50 hover:bg-muted/50"
                    disabled={streaming}
                  >
                    <span className="hidden xl:inline text-xs font-medium">Actions</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48 rounded-xl border-border/50 shadow-xl">
                  {hasMessages && (
                    <>
                      <DropdownMenuItem onClick={handleRefreshQuality} disabled={loading} className="rounded-lg">
                        <BarChart3 className="h-4 w-4 mr-2 text-emerald-500" />
                        Check Quality
                        {qualityAssessment && (
                          <Badge variant="secondary" className="ml-auto text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                            {qualityAssessment.overall}%
                          </Badge>
                        )}
                      </DropdownMenuItem>
                      {watchedPlanPath && (
                        <>
                          <DropdownMenuSeparator className="bg-border/50" />
                          <DropdownMenuItem onClick={handleExecutePrd} disabled={loading} className="rounded-lg">
                            <Play className="h-4 w-4 mr-2 text-blue-500" />
                            Execute PRD
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  )}
                  {!hasMessages && (
                    <DropdownMenuItem disabled className="rounded-lg">
                      <span className="text-muted-foreground text-xs">Send a message first</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden relative min-h-0">
          {/* Loading Spinner */}
          {loading && (
            <div
              data-testid="loading-spinner"
              className="absolute inset-0 flex items-center justify-center bg-background/50 z-10"
            >
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mx-4 mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}

          {/* Agent Error Message */}
          {agentError && (
            <div className="mx-4 mt-4 p-3 rounded-md bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Agent Not Available</p>
                <p className="text-xs mt-1">{agentError}</p>
              </div>
            </div>
          )}

          {/* GSD Workflow Mode */}
          {currentSession?.gsdMode && currentSession.projectPath ? (
            <div className="flex-1 overflow-y-auto">
              <GSDWorkflow projectPath={currentSession.projectPath} sessionId={currentSession.id} />
            </div>
          ) : (
            <>
              {/* Messages Area */}
              <div
                ref={messagesContainerRef}
                className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-6 min-h-0"
              >
                {!currentSession ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    {/* Decorative background */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl" />
                      <div className="absolute bottom-1/4 right-1/4 w-48 h-48 bg-teal-500/5 rounded-full blur-3xl" />
                    </div>

                    <div className="relative">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-4 shadow-xl shadow-emerald-500/20">
                        <MessageSquare className="h-8 w-8 sm:h-10 sm:w-10 text-white" />
                      </div>
                    </div>

                    <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
                      Create your PRD
                    </h3>
                    <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                      Start a conversation and let AI guide you through creating a comprehensive Product Requirements Document
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto px-4 sm:px-0">
                      <Button
                        onClick={handleCreateSession}
                        aria-label="New session"
                        className="w-full sm:w-auto bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 transition-all"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        New Session
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleQuickStart}
                        aria-label="Quick start"
                        className="w-full sm:w-auto"
                      >
                        Quick Start
                      </Button>
                    </div>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-4">
                    {/* Decorative background */}
                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                      <div className="absolute top-1/3 right-1/4 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl" />
                    </div>

                    <div className="relative mb-4">
                      <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                        <Bot className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                      </div>
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
                        <span className="text-[10px] text-white">AI</span>
                      </div>
                    </div>

                    <h3 className="text-lg sm:text-xl font-bold tracking-tight mb-1">
                      Ready to help
                    </h3>
                    <p className="text-sm text-muted-foreground mb-1">
                      {currentSession.prdType
                        ? `Creating a ${currentSession.prdType.replace('_', ' ')} PRD`
                        : 'Ask me anything about your PRD'}
                    </p>
                    {currentSession.guidedMode && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mb-4">
                        Guided mode active
                      </p>
                    )}

                    {/* Quick action pills */}
                    <div className="flex flex-wrap gap-2 mt-2 max-w-sm justify-center">
                      {[
                        'Help me create a PRD',
                        'What should my PRD include?',
                        'PRD best practices',
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          onClick={() => handleSendMessage(prompt)}
                          className="px-3 py-1.5 text-xs font-medium rounded-full border border-border/50 bg-card hover:bg-muted hover:border-emerald-500/30 transition-all duration-200 hover:shadow-sm"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((message) => (
                      <ChatMessageItem key={message.id} message={message} />
                    ))}
                    {streaming && processingSessionId === currentSession?.id && (
                      <StreamingIndicator
                        startedAt={streamingStartedAt || undefined}
                        onRetry={handleRetryMessage}
                        onCancel={handleCancelStreaming}
                        content={streamingContent}
                      />
                    )}
                  </>
                )}
              </div>

              {/* Scroll to bottom button - positioned to left of quality badge */}
              {!isAtBottom && messages.length > 0 && (
                <Button
                  variant="secondary"
                  size="icon"
                  onClick={scrollToBottom}
                  className={cn(
                    'absolute bottom-[5rem] right-[4.5rem] sm:bottom-24 sm:right-20 z-10',
                    'h-9 w-9 rounded-full',
                    'bg-background/80 backdrop-blur-sm border border-border/50',
                    'shadow-lg hover:shadow-xl transition-all duration-200',
                    'hover:scale-105 hover:bg-background'
                  )}
                  aria-label="Scroll to bottom"
                >
                  <ArrowDown className="h-4 w-4" />
                </Button>
              )}

              {/* Floating Quality Badge */}
              {currentSession && hasMessages && !currentSession.gsdMode && (
                <FloatingQualityBadge
                  assessment={qualityAssessment}
                  loading={loading}
                  onRefresh={handleRefreshQuality}
                />
              )}

              {/* Input Area */}
              <div className="border-t border-border/50 p-3 sm:p-4 flex-shrink-0 bg-gradient-to-t from-muted/30 to-background">
                <ChatInput
                  onSend={handleSendMessage}
                  disabled={isDisabled}
                  placeholder={
                    !currentSession
                      ? 'Create a session to start chatting...'
                      : 'Describe your product requirements...'
                  }
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Plan Document Sidebar - Desktop */}
      {showPlanSidebar && currentSession?.projectPath && !isMobile && (
        <PRDPlanSidebar
          content={watchedPlanContent}
          path={watchedPlanPath}
          isWatching={isWatchingPlan}
          onRefresh={startWatchingPlanFile}
          className="hidden lg:flex w-60 xl:w-72 2xl:w-80 shrink-0"
        />
      )}

      {/* Plan Document Sheet - Mobile */}
      {currentSession?.projectPath && (
        <Sheet open={mobilePlanSheetOpen} onOpenChange={setMobilePlanSheetOpen}>
          <SheetContent side="bottom" className="h-[70vh] lg:hidden p-0 flex flex-col">
            <SheetHeader className="px-4 py-3 border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-base">PRD Plan</SheetTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRawMobile(!showRawMobile)}
                  className="h-8 gap-1.5 text-xs"
                >
                  {showRawMobile ? (
                    <>
                      <FileText className="h-3.5 w-3.5" />
                      Preview
                    </>
                  ) : (
                    <>
                      <Code className="h-3.5 w-3.5" />
                      Raw
                    </>
                  )}
                </Button>
              </div>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4 min-h-0">
              {watchedPlanContent ? (
                showRawMobile ? (
                  <pre className="text-sm whitespace-pre-wrap font-mono text-muted-foreground break-words">
                    {watchedPlanContent}
                  </pre>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        pre: ({ children }) => (
                          <pre className="bg-secondary/50 rounded-md p-2 overflow-x-auto text-xs">
                            {children}
                          </pre>
                        ),
                        code: ({ children, className }) => {
                          const isInline = !className
                          return isInline ? (
                            <code className="bg-secondary/50 px-1 py-0.5 rounded text-xs">
                              {children}
                            </code>
                          ) : (
                            <code className={className}>{children}</code>
                          )
                        },
                        ul: ({ children }) => (
                          <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
                        ),
                        ol: ({ children }) => (
                          <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
                        ),
                        h1: ({ children }) => (
                          <h1 className="text-lg font-bold mt-4 mb-2 pb-1 border-b">{children}</h1>
                        ),
                        h2: ({ children }) => (
                          <h2 className="text-base font-bold mt-3 mb-1.5">{children}</h2>
                        ),
                        h3: ({ children }) => (
                          <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>
                        ),
                        p: ({ children }) => <p className="my-1.5 text-sm">{children}</p>,
                        blockquote: ({ children }) => (
                          <blockquote className="border-l-2 border-primary/50 pl-3 my-2 italic text-muted-foreground">
                            {children}
                          </blockquote>
                        ),
                        hr: () => <hr className="my-4 border-border" />,
                        strong: ({ children }) => (
                          <strong className="font-semibold">{children}</strong>
                        ),
                      }}
                    >
                      {watchedPlanContent}
                    </ReactMarkdown>
                  </div>
                )
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No plan content yet. Start chatting to generate a PRD.
                </p>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={(open) => !open && closeDeleteConfirm()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Session?</DialogTitle>
            <DialogDescription>
              This will permanently delete the session and all its messages. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelDeleteSession}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteSession}>
              Delete Session
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PRD Execution Dialog */}
      <PRDFileExecutionDialog
        file={executePrdFile}
        open={!!executePrdFile}
        onOpenChange={(open) => !open && setExecutePrdFile(null)}
      />
    </div>
  )
}
