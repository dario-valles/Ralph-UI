import { useRef, useEffect, useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { useProjectStore } from '@/stores/projectStore'
import { PRDTypeSelector } from './PRDTypeSelector'
import { GSDWorkflow } from './GSDWorkflow'
import { ChatMessageItem } from './ChatMessageItem'
import { ChatInput } from './ChatInput'
import { StreamingIndicator } from './StreamingIndicator'
import { SessionsSidebar } from './SessionsSidebar'
import { PRDPlanSidebar } from './PRDPlanSidebar'
import { PRDFileExecutionDialog } from './PRDFileExecutionDialog'
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

  const { getActiveProject, registerProject } = useProjectStore()
  const activeProject = getActiveProject()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const prevSessionIdRef = useRef<string | null>(null)
  const prevAgentTypeRef = useRef<string>('')

  // Track scroll direction for mobile header auto-hide
  const scrollDirection = useScrollDirection(messagesContainerRef, 15)

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
      if (storedProcessingId && !processingSessionId) {
        // Processing completed while we were away - reload history
        loadHistory(storedProcessingId)
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
      loadHistory(currentSession.id)
      prevSessionIdRef.current = currentSession.id
    }
  }, [currentSession, loadHistory])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'instant' })
  }, [messages])

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
    gsdMode?: boolean
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
        {/* Mobile Header - Clean two-row layout with auto-hide on scroll */}
        <div
          className={cn(
            'lg:hidden flex-shrink-0 bg-card border-b transition-all duration-200 ease-in-out overflow-hidden',
            scrollDirection === 'down' ? 'max-h-0 opacity-0 border-b-0' : 'max-h-32 opacity-100'
          )}
        >
          {/* Row 1: Session selector with new button */}
          <div className="px-3 py-2 flex items-center gap-2">
            <Select
              id="mobile-session-selector"
              aria-label="Select session"
              value={currentSession?.id || ''}
              onChange={(e) => {
                const session = sessions.find((s) => s.id === e.target.value)
                if (session) handleSelectSession(session)
              }}
              className="flex-1 min-w-0 text-sm h-9 font-medium"
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleCreateSession}
              className="h-9 w-9 p-0 flex-shrink-0"
              aria-label="New session"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Row 2: Agent/Model controls and actions */}
          <div className="px-3 pb-2 flex items-center gap-1.5">
            {/* Agent & Model group */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 flex-1 min-w-0">
              <Select
                id="mobile-agent-selector"
                aria-label="Agent"
                value={currentSession?.agentType || 'claude'}
                onChange={handleAgentChange}
                disabled={streaming}
                className="w-[72px] text-xs h-7 bg-background border-0 rounded-md"
              >
                <option value="claude">Claude</option>
                <option value="opencode">OpenCode</option>
                <option value="cursor">Cursor</option>
              </Select>
              <div className="w-px h-4 bg-border" />
              <ModelSelector
                id="mobile-model-selector"
                value={selectedModel || defaultModelId || ''}
                onChange={setUserSelectedModel}
                models={models}
                loading={modelsLoading}
                disabled={streaming}
                className="flex-1 min-w-0 text-xs h-7 bg-background border-0 rounded-md"
              />
            </div>

            {/* Action buttons group */}
            <div className="flex items-center gap-0.5 bg-muted/50 rounded-lg p-1">
              {currentSession?.projectPath && (
                <Button
                  variant={isPlanVisible ? 'default' : 'ghost'}
                  size="sm"
                  onClick={handlePlanToggle}
                  disabled={streaming}
                  aria-label="Toggle plan"
                  className="h-7 w-7 p-0 relative rounded-md"
                >
                  <ScrollText className="h-3.5 w-3.5" />
                  {watchedPlanContent && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                    </span>
                  )}
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 rounded-md"
                    disabled={streaming}
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {hasMessages ? (
                    <>
                      <DropdownMenuItem onClick={handleRefreshQuality} disabled={loading}>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Check Quality
                        {qualityAssessment && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {qualityAssessment.overall}%
                          </Badge>
                        )}
                      </DropdownMenuItem>
                      {watchedPlanPath && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={handleExecutePrd} disabled={loading}>
                            <Play className="h-4 w-4 mr-2" />
                            Execute PRD
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  ) : (
                    <DropdownMenuItem disabled>
                      <span className="text-muted-foreground text-xs">Send a message first</span>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {/* Desktop Header */}
        <CardHeader className="pb-2 border-b px-3 flex-shrink-0 bg-card hidden lg:block">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-shrink">
              <h2 className="sr-only">PRD Chat</h2>
              <CardTitle className="text-base truncate">
                {currentSession?.title || 'PRD Chat'}
              </CardTitle>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Agent/Model Selector - Compact */}
              <div className="flex items-center gap-1">
                <Select
                  id="agent-selector"
                  aria-label="Agent"
                  value={currentSession?.agentType || 'claude'}
                  onChange={handleAgentChange}
                  disabled={streaming}
                  className="w-24 text-xs h-8"
                >
                  <option value="claude">Claude</option>
                  <option value="opencode">OpenCode</option>
                  <option value="cursor">Cursor</option>
                </Select>

                <ModelSelector
                  id="model-selector"
                  value={selectedModel || defaultModelId || ''}
                  onChange={setUserSelectedModel}
                  models={models}
                  loading={modelsLoading}
                  disabled={streaming}
                  className="w-28 xl:w-36 text-xs h-8"
                />
              </div>

              {/* View Toggle Buttons - Compact */}
              {/* Plan Sidebar Toggle */}
              {currentSession?.projectPath && (
                <div className="flex items-center border rounded-md">
                  <Tooltip content={isPlanVisible ? 'Hide plan' : 'Show plan'} side="bottom">
                    <Button
                      variant={isPlanVisible ? 'default' : 'ghost'}
                      size="sm"
                      onClick={handlePlanToggle}
                      disabled={streaming}
                      aria-label="Toggle plan sidebar"
                      className="h-9 w-9 md:h-8 md:w-8 p-0 rounded-md relative"
                    >
                      <ScrollText className="h-4 w-4" />
                      {watchedPlanContent && (
                        <span className="absolute -top-1 -right-1 flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                        </span>
                      )}
                    </Button>
                  </Tooltip>
                </div>
              )}

              {/* Actions Dropdown for smaller screens */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1 px-2"
                    disabled={streaming}
                  >
                    <span className="hidden xl:inline text-xs">Actions</span>
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {hasMessages && (
                    <>
                      <DropdownMenuItem onClick={handleRefreshQuality} disabled={loading}>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Check Quality
                        {qualityAssessment && (
                          <Badge variant="secondary" className="ml-auto text-xs">
                            {qualityAssessment.overall}%
                          </Badge>
                        )}
                      </DropdownMenuItem>
                      {watchedPlanPath && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={handleExecutePrd} disabled={loading}>
                            <Play className="h-4 w-4 mr-2" />
                            Execute PRD
                          </DropdownMenuItem>
                        </>
                      )}
                    </>
                  )}
                  {!hasMessages && (
                    <DropdownMenuItem disabled>
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
                className="flex-1 overflow-y-auto p-2 sm:p-4 space-y-2 sm:space-y-4 min-h-0"
              >
                {!currentSession ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-2">
                    <MessageSquare className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-2 sm:mb-3" />
                    <h3 className="font-medium mb-1 text-sm sm:text-base">Create a new session</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground mb-3 sm:mb-4">
                      Start a conversation to create your PRD
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto px-4 sm:px-0">
                      <Button
                        onClick={handleCreateSession}
                        aria-label="New session"
                        className="w-full sm:w-auto"
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
                  <div className="flex flex-col items-center justify-center h-full text-center px-2">
                    <Bot className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground mb-2 sm:mb-3" />
                    <h3 className="font-medium mb-1 text-sm sm:text-base">Start a conversation</h3>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {currentSession.prdType
                        ? `Creating a ${currentSession.prdType.replace('_', ' ')} PRD`
                        : 'Ask the AI to help you create your PRD'}
                    </p>
                    {currentSession.guidedMode && (
                      <p className="text-[10px] sm:text-xs text-muted-foreground mt-1">
                        Guided mode is on - AI will ask structured questions
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-3 sm:mt-4 max-w-xs sm:max-w-md justify-center">
                      <Badge
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80 text-xs px-2 py-1"
                        onClick={() => handleSendMessage('Help me create a PRD')}
                      >
                        Help me create a PRD
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80 text-xs px-2 py-1"
                        onClick={() => handleSendMessage('What should my PRD include?')}
                      >
                        What should my PRD include?
                      </Badge>
                      <Badge
                        variant="secondary"
                        className="cursor-pointer hover:bg-secondary/80 text-xs px-2 py-1"
                        onClick={() => handleSendMessage('PRD best practices')}
                      >
                        PRD best practices
                      </Badge>
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
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Input Area */}
              <div className="border-t p-2 sm:p-4 flex-shrink-0 bg-card">
                <ChatInput
                  onSend={handleSendMessage}
                  disabled={isDisabled}
                  placeholder={
                    !currentSession
                      ? 'Create a session to start chatting...'
                      : 'Type your message...'
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
