import { useRef, useEffect, useCallback, useState } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAutoScroll } from '@/hooks/useAutoScroll'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, AlertTriangle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { useProjectStore } from '@/stores/projectStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { usePrdWorkflowStore } from '@/stores/prdWorkflowStore'
import { PRDTypeSelector } from './PRDTypeSelector'
import { SessionsSidebar } from './SessionsSidebar'
import { PRDPlanSidebar } from './PRDPlanSidebar'
import { PRDFileExecutionDialog } from './PRDFileExecutionDialog'
import { ChatHeader } from './ChatHeader'
import { ChatArea } from './ChatArea'
import { ChatInputArea, type ChatInputHandle } from './ChatInputArea'
import { MobilePlanSheet } from './MobilePlanSheet'
import { UltraResearchConfigModal } from './UltraResearchConfigModal'
import { prdChatApi, prdApi } from '@/lib/backend-api'
import type { SlashCommand, SlashCommandResult } from '@/lib/prd-chat-commands'
import type { MdFileDetectedPayload } from '@/types'
import { ContextSetupBanner } from '@/components/context'
import { toast } from '@/stores/toastStore'
import type { PRDTypeValue, AgentType, PRDFile, ChatAttachment, ExecutionMode } from '@/types'
import { cn } from '@/lib/utils'
import { useAgentModelSelector } from '@/hooks/useAgentModelSelector'
import { usePRDChatEvents } from '@/hooks/usePRDChatEvents'
import { useIsMobile, useScrollDirection } from '@/hooks/useMediaQuery'
import { usePRDChatPanelState } from '@/hooks/usePRDChatPanelState'

// ============================================================================
// Main Component
// ============================================================================

export function PRDChatPanel() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const prdIdFromUrl = searchParams.get('prdId')

  const { registerProject } = useProjectStore()
  const activeProject = useProjectStore((state) => {
    const { projects, activeProjectId } = state
    if (!activeProjectId) return undefined
    return projects.find((p) => p.id === activeProjectId)
  })

  const prevSessionIdRef = useRef<string | null>(null)
  const prevAgentTypeRef = useRef<string>('')
  const prevProjectPathRef = useRef<string | undefined>(undefined)
  const chatInputRef = useRef<ChatInputHandle>(null)

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

  const {
    sessions,
    currentSession,
    messages,
    loading,
    streaming,
    error,
    qualityAssessment,
    unifiedQualityReport,
    processingSessionId,
    watchedPlanContent,
    watchedPlanPath,
    isWatchingPlan,
    contextConfig,
    hasProjectContext,
    contextPreview,
    sendMessage,
    startSession,
    deleteSession,
    setCurrentSession,
    loadHistory,
    loadSessions,
    assessUnifiedQuality,
    startWatchingPlanFile,
    stopWatchingPlanFile,
    updatePlanContent,
    updateSessionAgent,
    loadContextConfig,
    toggleContextInjection,
    openConfigModal,
  } = usePRDChatStore()

  // Workflow store for execution mode
  const {
    currentWorkflow,
    loadWorkflow,
    createWorkflow,
    updateExecutionMode,
  } = usePrdWorkflowStore()

  // Auto-scroll hook for messages
  const {
    scrollRef: messagesContainerRef,
    isAtBottom,
    scrollToBottom,
  } = useAutoScroll({ offset: 50, smooth: true, content: messages })

  // Track scroll direction for mobile header auto-hide
  const scrollDirection = useScrollDirection(messagesContainerRef, 15)

  // Load available models for the current agent type with provider support
  const sessionAgentType = (currentSession?.agentType || 'claude') as AgentType
  const sessionProviderId = currentSession?.providerId
  const {
    agentType,
    models,
    modelsLoading,
    defaultModelId,
    agentOptions,
    handleAgentOptionChange,
    currentAgentOptionValue,
  } = useAgentModelSelector({
    initialAgent: sessionAgentType,
    initialProvider: sessionProviderId,
  })

  // Memoize the plan update callback
  const handlePlanUpdated = useCallback(
    (content: string, path: string) => {
      updatePlanContent(content, path)
    },
    [updatePlanContent]
  )

  // Handle auto-assigned PRD (created in .ralph-ui/prds/ standard location)
  const handlePrdAutoAssigned = useCallback(
    async (_payload: MdFileDetectedPayload, prdId: string) => {
      if (!currentSession || !activeProject?.path) return

      console.log('[PRDChatPanel] PRD auto-assigned, updating session prd_id:', prdId)

      // Persist prd_id to backend
      try {
        await prdChatApi.updateSessionPrdId(activeProject.path, currentSession.id, prdId)
      } catch (err) {
        console.error('[PRDChatPanel] Failed to persist prd_id:', err)
      }

      // Update current session with new prdId
      setCurrentSession({ ...currentSession, prdId })

      // Refresh the plan watcher to pick up the new file
      await startWatchingPlanFile()

      // Assess quality
      await assessUnifiedQuality()

      toast.success('PRD Created', 'Your PRD document has been saved and is now being watched.')
    },
    [currentSession, activeProject?.path, setCurrentSession, startWatchingPlanFile, assessUnifiedQuality]
  )

  // PRD chat events hook
  const {
    streamingContent,
    clearStreamingContent,
    detectedMdFiles,
    clearDetectedMdFiles,
    markFileAsAssigned,
  } = usePRDChatEvents({
    sessionId: currentSession?.id,
    onPlanUpdated: handlePlanUpdated,
    onPrdAutoAssigned: handlePrdAutoAssigned,
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

  const selectedModel = userSelectedModel || defaultModelId

  // Track the previous processing session
  const prevProcessingSessionIdRef = useRef<string | null>(null)

  // Load sessions on mount and when project changes
  useEffect(() => {
    const init = async () => {
      setInitialLoadComplete(false)

      // Reset currentSession when project changes (not on initial load)
      if (
        prevProjectPathRef.current !== undefined &&
        prevProjectPathRef.current !== activeProject?.path
      ) {
        setCurrentSession(null)
      }
      prevProjectPathRef.current = activeProject?.path

      if (activeProject?.path) {
        await loadSessions(activeProject.path)
        setInitialLoadComplete(true)
      }

      const storedProcessingId = prevProcessingSessionIdRef.current
      if (storedProcessingId && !processingSessionId && activeProject?.path) {
        loadHistory(storedProcessingId, activeProject.path)
      }
    }
    init()
  }, [
    loadSessions,
    loadHistory,
    processingSessionId,
    activeProject?.path,
    setInitialLoadComplete,
    setCurrentSession,
  ])

  useEffect(() => {
    prevProcessingSessionIdRef.current = processingSessionId
  }, [processingSessionId])

  // Handle prdId URL param
  useEffect(() => {
    if (prdIdFromUrl && !currentSession && initialLoadComplete && activeProject?.path) {
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

  // Auto-select most recent session
  useEffect(() => {
    if (initialLoadComplete && !currentSession && sessions.length > 0 && !showTypeSelector) {
      setCurrentSession(sessions[0])
    }
  }, [initialLoadComplete, currentSession, sessions, showTypeSelector, setCurrentSession])

  // Load history when session changes
  useEffect(() => {
    if (currentSession && currentSession.id !== prevSessionIdRef.current) {
      loadHistory(currentSession.id, currentSession.projectPath)
      // Clear detected files when switching sessions
      clearDetectedMdFiles()
      prevSessionIdRef.current = currentSession.id
    }
  }, [currentSession, loadHistory, clearDetectedMdFiles])

  // Load or create workflow when session changes
  useEffect(() => {
    if (!currentSession?.projectPath) return

    const initWorkflow = async () => {
      const workflowId = `session-${currentSession.id}`
      try {
        // Try to load existing workflow
        await loadWorkflow(currentSession.projectPath!, workflowId)
        const state = usePrdWorkflowStore.getState()
        // If no workflow exists, create one
        if (!state.currentWorkflow) {
          await createWorkflow(
            currentSession.projectPath!,
            workflowId,
            'existing', // Default to existing project mode
            currentSession.id
          )
        }
      } catch (err) {
        console.error('[PRDChatPanel] Failed to init workflow:', err)
      }
    }

    initWorkflow()
  }, [currentSession?.id, currentSession?.projectPath, loadWorkflow, createWorkflow])

  // Connection status tracking for mobile resilience
  const connectionStatus = useConnectionStore((state) => state.status)
  const prevConnectionStatusRef = useRef(connectionStatus)

  useEffect(() => {
    const wasDisconnected = ['disconnected', 'reconnecting', 'offline'].includes(
      prevConnectionStatusRef.current
    )
    const isNowConnected = connectionStatus === 'connected'
    prevConnectionStatusRef.current = connectionStatus

    if (wasDisconnected && isNowConnected && currentSession && activeProject?.path) {
      const currentSessionId = currentSession.id
      const refreshSession = async () => {
        try {
          await loadSessions(activeProject.path)
          const updatedSessions = usePRDChatStore.getState().sessions
          const updatedSession = updatedSessions.find((s) => s.id === currentSessionId)
          if (updatedSession) {
            setCurrentSession(updatedSession)
          }
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

  // Start/stop watching plan file
  useEffect(() => {
    if (currentSession?.projectPath) {
      startWatchingPlanFile()
    }
    return () => {
      stopWatchingPlanFile()
    }
  }, [currentSession?.id, currentSession?.projectPath, startWatchingPlanFile, stopWatchingPlanFile])

  // Auto-show sidebar when plan content first appears
  const hadPlanContentRef = useRef(false)
  useEffect(() => {
    if (watchedPlanContent && !hadPlanContentRef.current) {
      hadPlanContentRef.current = true
      setShowPlanSidebar(true)
    }
    if (!watchedPlanContent) {
      hadPlanContentRef.current = false
    }
  }, [watchedPlanContent, setShowPlanSidebar])

  // Auto-refresh quality score when plan file content changes
  const prevPlanContentRef = useRef<string | null>(null)
  useEffect(() => {
    if (watchedPlanContent && watchedPlanContent !== prevPlanContentRef.current) {
      prevPlanContentRef.current = watchedPlanContent
      const timer = setTimeout(() => assessUnifiedQuality(), 1000)
      return () => clearTimeout(timer)
    }
  }, [watchedPlanContent, assessUnifiedQuality])

  // Load context config when session project path changes
  useEffect(() => {
    if (currentSession?.projectPath) {
      loadContextConfig(currentSession.projectPath)
    }
  }, [currentSession?.projectPath, loadContextConfig])


  // ============================================================================
  // Event Handlers
  // ============================================================================

  /** Handle agent option change (supports composite values like "claude:zai") */
  const handleAgentOptionChangeWithValidation = async (value: string) => {
    // Parse composite value (e.g., "claude:zai" -> agent="claude", provider="zai")
    const [newAgentType, newProviderId] = value.split(':')
    setAgentError(null)

    try {
      const result = await prdChatApi.checkAgentAvailability(newAgentType)
      if (!result.available) {
        setAgentError(result.error || `Agent '${newAgentType}' is not available`)
        return
      }

      // Update the hook state
      handleAgentOptionChange(value)

      if (currentSession) {
        await updateSessionAgent(newAgentType, newProviderId)
      } else {
        openTypeSelector()
      }
    } catch (err) {
      setAgentError(
        `Failed to check agent availability: ${err instanceof Error ? err.message : 'Unknown error'}`
      )
    }
  }

  const handleSendMessage = useCallback(
    async (content: string, attachments?: ChatAttachment[]) => {
      startStreaming(content)
      try {
        await sendMessage(content, attachments)
      } finally {
        stopStreaming()
      }
    },
    [startStreaming, sendMessage, stopStreaming]
  )

  const handleRetryMessage = () => {
    if (lastMessageContent) {
      handleSendMessage(lastMessageContent)
    }
  }

  const handleCancelStreaming = () => {
    stopStreaming()
    toast.warning('Request will complete in background. You can retry with a new message.')
  }

  const handleTypeSelected = (
    prdType: PRDTypeValue,
    guidedMode: boolean,
    projectPath?: string,
    title?: string
  ) => {
    if (projectPath) {
      registerProject(projectPath)
    }
    startSession({
      agentType: currentSession?.agentType || 'claude',
      prdType,
      guidedMode,
      projectPath: projectPath || activeProject?.path || '',
      title,
    })
    closeTypeSelector()
  }

  const handleQuickStart = () => {
    startSession({
      agentType: 'claude',
      prdType: 'general',
      guidedMode: true,
      projectPath: activeProject?.path || '',
    })
    closeTypeSelector()
  }

  const confirmDeleteSession = async () => {
    if (sessionToDelete) {
      await deleteSession(sessionToDelete)
      closeDeleteConfirm()
    }
  }

  const handleExecutePrd = async () => {
    if (!watchedPlanPath || !currentSession?.projectPath) {
      toast.error('No PRD available', 'Create or export a PRD first before executing.')
      return
    }

    const pathParts = watchedPlanPath.split('/')
    const fileName = pathParts[pathParts.length - 1]
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

  const handlePlanToggle = () => {
    if (isMobile) {
      setMobilePlanSheetOpen(!mobilePlanSheetOpen)
    } else {
      setShowPlanSidebar(!showPlanSidebar)
    }
  }

  /** Toggle context injection for PRD Chat */
  const handleToggleContext = useCallback(
    async (enabled: boolean) => {
      if (!currentSession?.projectPath) return
      try {
        await toggleContextInjection(currentSession.projectPath, enabled)
        toast.success(
          enabled ? 'Context Enabled' : 'Context Disabled',
          enabled
            ? 'Project context will be included in AI prompts'
            : 'Project context will not be included in AI prompts'
        )
      } catch (err) {
        console.error('[PRDChatPanel] Failed to toggle context:', err)
        toast.error('Failed to toggle context', err instanceof Error ? err.message : 'Unknown error')
      }
    },
    [currentSession?.projectPath, toggleContextInjection]
  )

  /** Navigate to context editor */
  const handleEditContext = useCallback(() => {
    if (activeProject?.path) {
      navigate('/context/chat', { state: { projectPath: activeProject.path } })
    }
  }, [activeProject?.path, navigate])

  const handleExecutionModeChange = async (mode: ExecutionMode) => {
    if (!currentSession?.projectPath || !currentWorkflow) return
    await updateExecutionMode(currentSession.projectPath, currentWorkflow.id, mode)
  }

  /** Insert text into the chat input (used by guidance panel) */
  const handleInsertInput = useCallback((text: string) => {
    chatInputRef.current?.insertText(text)
    chatInputRef.current?.focus()
  }, [])

  /** Handle click on missing section badge - sends a message to generate that section */
  const handleMissingSectionClick = useCallback(
    (section: string) => {
      const message = `Please generate ${section} for this PRD based on the requirements we've discussed. Include specific, actionable items.`
      handleSendMessage(message)
    },
    [handleSendMessage]
  )

  /** Handle action commands from slash menu (e.g., /ultra-research) */
  const handleActionCommand = useCallback(
    async (command: SlashCommand): Promise<SlashCommandResult> => {
      if (command.id === 'ultra-research') {
        openConfigModal()
        return { success: true }
      }
      // Unknown action command
      return { success: false, error: `Unknown action command: ${command.id}` }
    },
    [openConfigModal]
  )

  /** Handle assigning an external .md file as the PRD */
  const handleAssignFileAsPrd = useCallback(
    async (file: MdFileDetectedPayload) => {
      if (!currentSession?.projectPath) {
        throw new Error('No project path available')
      }

      try {
        const result = await prdChatApi.assignFileAsPrd(
          currentSession.projectPath,
          currentSession.id,
          file.filePath
        )

        // Mark the file as assigned so it shows the success state
        markFileAsAssigned(file.filePath)

        // Refresh the plan content to show the newly assigned PRD
        await startWatchingPlanFile()

        // Update current session with new prdId (sync frontend state)
        setCurrentSession({ ...currentSession, prdId: result.prdId })

        // Refresh quality assessment immediately
        await assessUnifiedQuality()

        toast.success(
          'PRD Assigned',
          `File copied to ${result.assignedPath.split('/').pop()}`
        )
      } catch (err) {
        console.error('Failed to assign file as PRD:', err)
        toast.error(
          'Failed to assign PRD',
          err instanceof Error ? err.message : 'An unexpected error occurred.'
        )
        // Re-throw so DetectedFileCard can show error state
        throw err
      }
    },
    [currentSession, markFileAsAssigned, startWatchingPlanFile, setCurrentSession, assessUnifiedQuality]
  )

  // ============================================================================
  // Computed Values
  // ============================================================================

  const hasMessages = messages.length > 0
  const isPlanVisible = isMobile ? mobilePlanSheetOpen : showPlanSidebar

  // ============================================================================
  // Render
  // ============================================================================

  // Show type selector for new users or when explicitly requested
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

  return (
    <div className="flex h-full flex-col lg:flex-row gap-2 xl:gap-4">
      {/* Session Sidebar - Hidden on mobile */}
      <SessionsSidebar
        sessions={sessions}
        currentSession={currentSession}
        processingSessionId={processingSessionId}
        hasMessages={hasMessages}
        collapsed={sessionsCollapsed}
        onCollapsedChange={setSessionsCollapsed}
        onCreateSession={openTypeSelector}
        onSelectSession={setCurrentSession}
        onDeleteSession={openDeleteConfirm}
        qualityAssessment={qualityAssessment}
        unifiedQualityReport={unifiedQualityReport}
        discoveryProgress={currentSession?.discoveryProgress}
        loading={loading}
        onRefreshQuality={assessUnifiedQuality}
        className="hidden md:flex"
      />

      {/* Chat Panel */}
      <Card className={cn('flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden')}>
        <ChatHeader
          currentSession={currentSession}
          sessions={sessions}
          agentType={agentType}
          agentOptions={agentOptions}
          currentAgentOptionValue={currentAgentOptionValue}
          selectedModel={selectedModel}
          defaultModelId={defaultModelId}
          models={models}
          modelsLoading={modelsLoading}
          streaming={streaming}
          loading={loading}
          hasMessages={hasMessages}
          qualityAssessment={qualityAssessment}
          watchedPlanContent={watchedPlanContent}
          watchedPlanPath={watchedPlanPath}
          isPlanVisible={isPlanVisible}
          scrollDirection={scrollDirection}
          contextConfig={contextConfig}
          hasProjectContext={hasProjectContext}
          contextPreview={contextPreview}
          onAgentOptionChange={handleAgentOptionChangeWithValidation}
          onModelChange={setUserSelectedModel}
          onSelectSession={setCurrentSession}
          onCreateSession={openTypeSelector}
          onPlanToggle={handlePlanToggle}
          onRefreshQuality={assessUnifiedQuality}
          onExecutePrd={handleExecutePrd}
          onToggleContext={handleToggleContext}
          onEditContext={handleEditContext}
        />

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

          {/* Error Messages */}
          {error && (
            <div className="mx-4 mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
          {agentError && (
            <div className="mx-4 mt-4 p-3 rounded-md bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Agent Not Available</p>
                <p className="text-xs mt-1">{agentError}</p>
              </div>
            </div>
          )}

          {/* Context Setup Banner */}
          {activeProject?.path && (
            <ContextSetupBanner
              projectPath={activeProject.path}
              onSetup={() => navigate('/context/chat', { state: { projectPath: activeProject.path } })}
              className="mx-3 mt-3 sm:mx-4 sm:mt-4"
            />
          )}

          {/* Messages Area */}
          <ChatArea
            containerRef={messagesContainerRef}
            currentSession={currentSession}
            messages={messages}
            streaming={streaming}
            streamingStartedAt={streamingStartedAt}
            streamingContent={streamingContent}
            processingSessionId={processingSessionId}
            isAtBottom={isAtBottom}
            detectedMdFiles={detectedMdFiles}
            onCreateSession={openTypeSelector}
            onQuickStart={handleQuickStart}
            onSendMessage={handleSendMessage}
            onInsertInput={handleInsertInput}
            onRetry={handleRetryMessage}
            onCancel={handleCancelStreaming}
            onScrollToBottom={scrollToBottom}
            onAssignFileAsPrd={handleAssignFileAsPrd}
          />

          {/* Input Area */}
          <ChatInputArea
            ref={chatInputRef}
            currentSession={currentSession}
            hasMessages={hasMessages}
            loading={loading}
            streaming={streaming}
            qualityAssessment={qualityAssessment}
            executionMode={currentWorkflow?.executionMode}
            onSendMessage={handleSendMessage}
            onRefreshQuality={assessUnifiedQuality}
            onExecutionModeChange={handleExecutionModeChange}
            onMissingSectionClick={handleMissingSectionClick}
            onActionCommand={handleActionCommand}
          />
        </CardContent>
      </Card>

      {/* Plan Document Sidebar - Desktop */}
      {showPlanSidebar && currentSession?.projectPath && !isMobile && (
        <PRDPlanSidebar
          content={watchedPlanContent}
          path={watchedPlanPath}
          isWatching={isWatchingPlan}
          onRefresh={startWatchingPlanFile}
          className="hidden md:flex w-48 lg:w-60 xl:w-72 2xl:w-80 shrink-0"
        />
      )}

      {/* Plan Document Sheet - Mobile */}
      {currentSession?.projectPath && (
        <MobilePlanSheet
          open={mobilePlanSheetOpen}
          onOpenChange={setMobilePlanSheetOpen}
          content={watchedPlanContent}
        />
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
            <Button variant="outline" onClick={closeDeleteConfirm}>
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

      {/* Ultra Research Config Modal */}
      <UltraResearchConfigModal />
    </div>
  )
}
