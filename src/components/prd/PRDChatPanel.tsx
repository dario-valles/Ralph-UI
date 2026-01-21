import { useState, useRef, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
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
} from 'lucide-react'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { useProjectStore } from '@/stores/projectStore'
import { PRDTypeSelector } from './PRDTypeSelector'
import { ChatMessageItem } from './ChatMessageItem'
import { ChatInput } from './ChatInput'
import { StreamingIndicator } from './StreamingIndicator'
import { SessionsSidebar } from './SessionsSidebar'
import { PRDPlanSidebar } from './PRDPlanSidebar'
import { prdChatApi } from '@/lib/tauri-api'
import { toast } from '@/stores/toastStore'
import type { PRDTypeValue, ChatSession, AgentType } from '@/types'
import { cn } from '@/lib/utils'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { usePRDChatEvents } from '@/hooks/usePRDChatEvents'

// ============================================================================
// Main Component
// ============================================================================

export function PRDChatPanel() {
  const [searchParams] = useSearchParams()
  const prdIdFromUrl = searchParams.get('prdId')

  const { getActiveProject, registerProject } = useProjectStore()
  const activeProject = getActiveProject()

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevSessionIdRef = useRef<string | null>(null)
  const [showTypeSelector, setShowTypeSelector] = useState(false)
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
  // Plan sidebar visibility
  const [showPlanSidebar, setShowPlanSidebar] = useState(true)
  // Sessions sidebar collapsed state for smaller screens
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false)

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
    if (activeProject?.path) {
      loadSessions(activeProject.path)
    }

    // If we had a processing session stored and we're returning to this view,
    // reload its history to show the new messages
    const storedProcessingId = prevProcessingSessionIdRef.current
    if (storedProcessingId && !processingSessionId) {
      // Processing completed while we were away - reload history
      loadHistory(storedProcessingId)
    }
  }, [loadSessions, loadHistory, processingSessionId, activeProject?.path])

  // Keep track of processing session ID changes
  useEffect(() => {
    prevProcessingSessionIdRef.current = processingSessionId
  }, [processingSessionId])

  // Handle prdId URL param for "Continue in Chat" functionality
  useEffect(() => {
    if (prdIdFromUrl && !currentSession) {
      startSession({
        agentType: 'claude',
        prdId: prdIdFromUrl,
        guidedMode: true,
        projectPath: activeProject?.path,
      })
    }
  }, [prdIdFromUrl, currentSession, startSession, activeProject?.path])

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
    // Always pass projectPath to ensure files can be saved
    startSession({
      agentType: 'claude',
      prdType: 'general',
      guidedMode: true,
      projectPath: activeProject?.path,
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
      />

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
                    <DropdownMenuItem onClick={handleRefreshQuality} disabled={loading}>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Check Quality
                      {qualityAssessment && (
                        <Badge variant="secondary" className="ml-auto text-xs">
                          {qualityAssessment.overall}%
                        </Badge>
                      )}
                    </DropdownMenuItem>
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
