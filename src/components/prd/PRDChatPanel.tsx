import { useState, useRef, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
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
  FileText,
  Loader2,
  MessageSquare,
  Bot,
  BarChart3,
  AlertTriangle,
  ScrollText,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
} from 'lucide-react'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { useProjectStore } from '@/stores/projectStore'
import { useSessionStore } from '@/stores/sessionStore'
import { PRDTypeSelector } from './PRDTypeSelector'
import { QualityScoreCard } from './QualityScoreCard'
import { ChatMessageItem } from './ChatMessageItem'
import { ChatInput } from './ChatInput'
import { StreamingIndicator } from './StreamingIndicator'
import { SessionItem } from './SessionItem'
import { PRDPlanSidebar } from './PRDPlanSidebar'
import { prdChatApi } from '@/lib/tauri-api'
import { listen } from '@tauri-apps/api/event'
import { toast } from '@/stores/toastStore'
import type { PRDTypeValue, ChatSession, AgentType } from '@/types'
import { cn } from '@/lib/utils'
import { useAvailableModels } from '@/hooks/useAvailableModels'

// ============================================================================
// Main Component
// ============================================================================

export function PRDChatPanel() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const prdIdFromUrl = searchParams.get('prdId')

  const { getActiveProject, registerProject } = useProjectStore()
  const activeProject = getActiveProject()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevSessionIdRef = useRef<string | null>(null)
  const [showTypeSelector, setShowTypeSelector] = useState(false)
  const [showQualityPanel, setShowQualityPanel] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null)
  const [agentError, setAgentError] = useState<string | null>(null)
  // Track user's explicit model selection; empty string means "use default"
  const [userSelectedModel, setUserSelectedModel] = useState<string>('')
  // Track the last agent type to detect changes
  const prevAgentTypeRef = useRef<string>('')
  // Track when streaming started and last message for retry
  const [streamingStartedAt, setStreamingStartedAt] = useState<string | null>(null)
  const [lastMessageContent, setLastMessageContent] = useState<string | null>(null)
  // Track streaming content received via events
  const [streamingContent, setStreamingContent] = useState<string>('')
  // Plan sidebar visibility
  const [showPlanSidebar, setShowPlanSidebar] = useState(true)
  // Sessions sidebar collapsed state for smaller screens
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false)
  // Export progress tracking
  const [exportProgress, setExportProgress] = useState<{
    active: boolean
    step: number
    message: string
  } | null>(null)

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
    exportToPRD,
    assessQuality,
    startWatchingPlanFile,
    stopWatchingPlanFile,
    updatePlanContent,
  } = usePRDChatStore()

  // Load available models for the current agent type
  const agentType = (currentSession?.agentType || 'claude') as AgentType
  const { models, loading: modelsLoading, defaultModelId } = useAvailableModels(agentType)

  // Reset user selection when agent type changes
  if (prevAgentTypeRef.current !== agentType) {
    prevAgentTypeRef.current = agentType
    if (userSelectedModel) {
      setUserSelectedModel('')
    }
  }

  // Effective model: user selection if set, otherwise default
  const selectedModel = userSelectedModel || defaultModelId

  // Track the previous processing session to detect when processing completes
  const prevProcessingSessionIdRef = useRef<string | null>(null)

  // Load sessions on mount and auto-refresh if returning after processing
  useEffect(() => {
    loadSessions()

    // If we had a processing session stored and we're returning to this view,
    // reload its history to show the new messages
    const storedProcessingId = prevProcessingSessionIdRef.current
    if (storedProcessingId && !processingSessionId) {
      // Processing completed while we were away - reload history
      loadHistory(storedProcessingId)
    }
  }, [loadSessions, loadHistory, processingSessionId])

  // Keep track of processing session ID changes
  useEffect(() => {
    prevProcessingSessionIdRef.current = processingSessionId
  }, [processingSessionId])

  // Handle prdId URL param for "Continue in Chat" functionality
  useEffect(() => {
    if (prdIdFromUrl && !currentSession) {
      startSession({ agentType: 'claude', prdId: prdIdFromUrl, guidedMode: true })
    }
  }, [prdIdFromUrl, currentSession, startSession])

  // Load history when session changes
  useEffect(() => {
    if (currentSession && currentSession.id !== prevSessionIdRef.current) {
      loadHistory(currentSession.id)
      prevSessionIdRef.current = currentSession.id
    }
  }, [currentSession, loadHistory])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Listen for PRD file update events from the backend
  useEffect(() => {
    const currentSessionId = currentSession?.id
    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      try {
        unlisten = await listen<{ sessionId: string; content: string; path: string }>(
          'prd:file_updated',
          (event) => {
            // Only update if the event is for the current session
            if (currentSessionId && event.payload.sessionId === currentSessionId) {
              updatePlanContent(event.payload.content, event.payload.path)
            }
          }
        )
      } catch (err) {
        console.warn('Failed to set up PRD file event listener:', err)
      }
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [currentSession?.id, updatePlanContent])

  // Listen for PRD chat streaming chunk events
  useEffect(() => {
    const currentSessionId = currentSession?.id
    let unlisten: (() => void) | undefined

    const setupListener = async () => {
      try {
        unlisten = await listen<{ sessionId: string; content: string }>(
          'prd:chat_chunk',
          (event) => {
            // Only update if the event is for the current session
            if (currentSessionId && event.payload.sessionId === currentSessionId) {
              setStreamingContent((prev) => prev + event.payload.content + '\n')
            }
          }
        )
      } catch (err) {
        console.warn('Failed to set up PRD chat chunk event listener:', err)
      }
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [currentSession?.id])

  // Clear streaming content when streaming completes
  useEffect(() => {
    if (!streaming) {
      setStreamingContent('')
    }
  }, [streaming])

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
  }, [watchedPlanContent])

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
      // Agent is available - show type selector to create new session
      setShowTypeSelector(true)
    } catch (err) {
      setAgentError(`Failed to check agent availability: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleSendMessage = async (content: string) => {
    setLastMessageContent(content)
    setStreamingStartedAt(new Date().toISOString())
    try {
      await sendMessage(content)
    } finally {
      setStreamingStartedAt(null)
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
    setStreamingStartedAt(null)
    // Note: The actual request cannot be cancelled from frontend,
    // but we can show the user the interface is responsive
    toast.warning('Request will complete in background. You can retry with a new message.')
  }

  const handleCreateSession = () => {
    setShowTypeSelector(true)
  }

  const handleTypeSelected = (prdType: PRDTypeValue, guidedMode: boolean, projectPath?: string) => {
    // Register the project when starting a session
    if (projectPath) {
      registerProject(projectPath)
    }
    startSession({
      agentType: currentSession?.agentType || 'claude',
      prdType,
      guidedMode,
      projectPath,
    })
    setShowTypeSelector(false)
  }

  const handleQuickStart = () => {
    // Quick start without type selection (general type)
    startSession({
      agentType: 'claude',
      prdType: 'general',
      guidedMode: true,
    })
    setShowTypeSelector(false)
  }

  const handleDeleteSession = (sessionId: string) => {
    setSessionToDelete(sessionId)
    setShowDeleteConfirm(true)
  }

  const confirmDeleteSession = async () => {
    if (sessionToDelete) {
      await deleteSession(sessionToDelete)
      setSessionToDelete(null)
      setShowDeleteConfirm(false)
    }
  }

  const cancelDeleteSession = () => {
    setSessionToDelete(null)
    setShowDeleteConfirm(false)
  }

  const handleSelectSession = (session: ChatSession) => {
    // Only set the session - useEffect will handle loading history
    setCurrentSession(session)
  }

  const handleExportToPRD = async () => {
    if (currentSession) {
      // Step 1: Assess quality
      setExportProgress({ active: true, step: 1, message: 'Checking PRD quality...' })
      const assessment = await assessQuality()
      if (assessment && !assessment.readyForExport) {
        setExportProgress(null)
        setShowQualityPanel(true)
        return
      }

      try {
        // Step 2: Export PRD and extract tasks
        setExportProgress({ active: true, step: 2, message: 'Exporting PRD and extracting tasks...' })
        const result = await exportToPRD(currentSession.title || 'Untitled PRD')

        if (result) {
          if (result.sessionId && result.taskCount > 0) {
            // Step 3: Set up session
            setExportProgress({ active: true, step: 3, message: `Created ${result.taskCount} tasks. Setting up session...` })
            await useSessionStore.getState().fetchSession(result.sessionId)

            // Step 4: Navigate - pass sessionId in URL for reliable loading
            setExportProgress({ active: true, step: 4, message: 'Navigating to tasks...' })
            toast.success(
              `Created ${result.taskCount} tasks from PRD`,
              'Your tasks are ready to assign to agents.'
            )
            navigate(`/tasks?sessionId=${result.sessionId}`)
          } else {
            // No tasks extracted - navigate to PRD editor
            setExportProgress(null)
            toast.success('PRD exported successfully', 'Your PRD has been created.')
            navigate(`/prds/${result.prd.id}`)
          }
        }
      } catch (err) {
        setExportProgress(null)
        throw err
      }
    }
  }

  const handleForceExport = async () => {
    if (currentSession) {
      setShowQualityPanel(false)

      try {
        // Step 1: Export PRD and extract tasks
        setExportProgress({ active: true, step: 1, message: 'Exporting PRD and extracting tasks...' })
        const result = await exportToPRD(currentSession.title || 'Untitled PRD')

        if (result) {
          if (result.sessionId && result.taskCount > 0) {
            // Step 2: Set up session
            setExportProgress({ active: true, step: 2, message: `Created ${result.taskCount} tasks. Setting up session...` })
            await useSessionStore.getState().fetchSession(result.sessionId)

            // Step 3: Navigate - pass sessionId in URL for reliable loading
            setExportProgress({ active: true, step: 3, message: 'Navigating to tasks...' })
            toast.success(
              `Created ${result.taskCount} tasks from PRD`,
              'Your tasks are ready to assign to agents.'
            )
            navigate(`/tasks?sessionId=${result.sessionId}`)
          } else {
            // No tasks extracted - navigate to PRD editor
            setExportProgress(null)
            toast.success('PRD exported successfully', 'Your PRD has been created.')
            navigate(`/prds/${result.prd.id}`)
          }
        }
      } catch (err) {
        setExportProgress(null)
        throw err
      }
    }
  }

  const handleRefreshQuality = () => {
    assessQuality()
  }

  const hasMessages = messages.length > 0
  const isDisabled = loading || streaming || !currentSession

  // Show type selector when creating a new session
  if (showTypeSelector) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <PRDTypeSelector
          onSelect={handleTypeSelected}
          loading={loading}
          defaultProjectPath={currentSession?.projectPath || activeProject?.path}
        />
      </div>
    )
  }

  return (
    <div className="flex h-full gap-2 xl:gap-4">
      {/* Session Sidebar - Collapsible */}
      <Card className={cn(
        'shrink-0 flex flex-col transition-all duration-200',
        sessionsCollapsed ? 'w-12' : 'w-48 xl:w-56 2xl:w-64'
      )}>
        <CardHeader className={cn('pb-2', sessionsCollapsed && 'px-2')}>
          <div className="flex items-center justify-between gap-1">
            {!sessionsCollapsed && (
              <CardTitle className="text-sm font-medium truncate">Sessions</CardTitle>
            )}
            <div className="flex items-center gap-0.5">
              {!sessionsCollapsed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCreateSession}
                  aria-label="New session"
                  className="h-7 w-7 p-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSessionsCollapsed(!sessionsCollapsed)}
                aria-label={sessionsCollapsed ? "Expand sessions" : "Collapse sessions"}
                className="h-7 w-7 p-0"
              >
                {sessionsCollapsed ? (
                  <PanelLeftOpen className="h-4 w-4" />
                ) : (
                  <PanelLeftClose className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>

        {sessionsCollapsed ? (
          <CardContent className="p-2 flex-1 flex flex-col items-center gap-2">
            <Tooltip content="New Session" side="right">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCreateSession}
                aria-label="New session"
                className="h-8 w-8 p-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </Tooltip>
            {sessions.slice(0, 5).map((session) => (
              <Tooltip key={session.id} content={session.title || 'Untitled'} side="right">
                <Button
                  variant={currentSession?.id === session.id ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => handleSelectSession(session)}
                  className="h-8 w-8 p-0"
                >
                  <MessageSquare className="h-4 w-4" />
                </Button>
              </Tooltip>
            ))}
            {sessions.length > 5 && (
              <span className="text-xs text-muted-foreground">+{sessions.length - 5}</span>
            )}
          </CardContent>
        ) : (
          <>
            <CardContent className="p-2 flex-1 overflow-auto">
              {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <MessageSquare className="h-6 w-6 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">No sessions yet</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateSession}
                    className="mt-2 text-xs"
                    aria-label="New session"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    New
                  </Button>
                </div>
              ) : (
                <div className="space-y-1">
                  {sessions.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      isActive={currentSession?.id === session.id}
                      isProcessing={processingSessionId === session.id}
                      onSelect={() => handleSelectSession(session)}
                      onDelete={() => handleDeleteSession(session.id)}
                    />
                  ))}
                </div>
              )}
            </CardContent>

            {/* Quality Score in Sidebar */}
            {currentSession && hasMessages && (
              <div className="p-2 border-t">
                <QualityScoreCard
                  assessment={qualityAssessment}
                  loading={loading}
                  onRefresh={handleRefreshQuality}
                  className="border-0 shadow-none"
                />
              </div>
            )}
          </>
        )}
      </Card>

      {/* Chat Panel */}
      <Card className={cn('flex-1 flex flex-col min-w-0')}>
        <CardHeader className="pb-2 border-b px-3">
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

                <Select
                  id="model-selector"
                  aria-label="Model"
                  value={selectedModel || defaultModelId || ''}
                  onChange={(e) => setUserSelectedModel(e.target.value)}
                  disabled={streaming || modelsLoading}
                  className="w-28 xl:w-36 text-xs h-8"
                >
                  {modelsLoading ? (
                    <option>Loading...</option>
                  ) : (
                    models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))
                  )}
                </Select>
              </div>

              {/* View Toggle Buttons - Compact */}
              {/* Plan Sidebar Toggle */}
              {currentSession?.projectPath && (
                <div className="flex items-center border rounded-md">
                  <Tooltip content={showPlanSidebar ? 'Hide plan' : 'Show plan'} side="bottom">
                    <Button
                      variant={showPlanSidebar ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setShowPlanSidebar(!showPlanSidebar)}
                      disabled={streaming}
                      aria-label="Toggle plan sidebar"
                      className="h-8 w-8 p-0 rounded-md relative"
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
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleExportToPRD}>
                        <FileText className="h-4 w-4 mr-2" />
                        Export to PRD
                      </DropdownMenuItem>
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

        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden relative">
          {/* Loading Spinner */}
          {loading && !exportProgress && (
            <div
              data-testid="loading-spinner"
              className="absolute inset-0 flex items-center justify-center bg-background/50 z-10"
            >
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Export Progress Overlay */}
          {exportProgress?.active && (
            <div
              data-testid="export-progress"
              className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-20"
            >
              <div className="flex flex-col items-center gap-4 p-6 bg-card rounded-lg shadow-lg border max-w-sm mx-4">
                <div className="relative">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xs font-medium text-primary">{exportProgress.step}</span>
                  </div>
                </div>
                <div className="text-center">
                  <p className="font-medium text-foreground">Exporting PRD</p>
                  <p className="text-sm text-muted-foreground mt-1">{exportProgress.message}</p>
                </div>
                <div className="flex gap-1">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={cn(
                        'w-2 h-2 rounded-full transition-colors',
                        step <= exportProgress.step ? 'bg-primary' : 'bg-muted'
                      )}
                    />
                  ))}
                </div>
              </div>
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

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!currentSession ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">Create a new session</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Start a conversation to create your PRD
                </p>
                <div className="flex gap-2">
                  <Button onClick={handleCreateSession} aria-label="New session">
                    <Plus className="h-4 w-4 mr-2" />
                    New Session
                  </Button>
                  <Button variant="outline" onClick={handleQuickStart} aria-label="Quick start">
                    Quick Start
                  </Button>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="h-12 w-12 text-muted-foreground mb-3" />
                <h3 className="font-medium mb-1">Start a conversation</h3>
                <p className="text-sm text-muted-foreground">
                  {currentSession.prdType
                    ? `Creating a ${currentSession.prdType.replace('_', ' ')} PRD`
                    : 'Ask the AI to help you create your PRD'}
                </p>
                {currentSession.guidedMode && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Guided mode is on - AI will ask structured questions
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-4 max-w-md justify-center">
                  <Badge
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80"
                    onClick={() => handleSendMessage("Help me create a PRD")}
                  >
                    Help me create a PRD
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80"
                    onClick={() => handleSendMessage("What should my PRD include?")}
                  >
                    What should my PRD include?
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="cursor-pointer hover:bg-secondary/80"
                    onClick={() => handleSendMessage("PRD best practices")}
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
                {streaming && (
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
          <div className="border-t p-4">
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
        </CardContent>
      </Card>

      {/* Plan Document Sidebar */}
      {showPlanSidebar && currentSession?.projectPath && (
        <PRDPlanSidebar
          content={watchedPlanContent}
          path={watchedPlanPath}
          isWatching={isWatchingPlan}
          onRefresh={startWatchingPlanFile}
          className="w-60 xl:w-72 2xl:w-80 shrink-0"
        />
      )}

      {/* Quality Warning Dialog */}
      <Dialog open={showQualityPanel} onOpenChange={setShowQualityPanel}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>PRD Quality Assessment</DialogTitle>
            <DialogDescription>
              Your PRD may be incomplete. Review the quality assessment below.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <QualityScoreCard
              assessment={qualityAssessment}
              loading={loading}
              onRefresh={handleRefreshQuality}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowQualityPanel(false)}>
              Continue Editing
            </Button>
            <Button onClick={handleForceExport}>
              Export Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Session?</DialogTitle>
            <DialogDescription>
              This will permanently delete the session and all its messages.
              This action cannot be undone.
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
    </div>
  )
}
