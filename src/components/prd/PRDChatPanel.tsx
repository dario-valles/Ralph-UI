import { useRef, useEffect, useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { PRDTypeSelector } from './PRDTypeSelector'
import { SessionsSidebar } from './SessionsSidebar'
import { PRDPlanSidebar } from './PRDPlanSidebar'
import { PRDFileExecutionDialog } from './PRDFileExecutionDialog'
import { ResearchProgressModal } from './ResearchProgressModal'
import { RequirementsScopeSheet } from './RequirementsScopeSheet'
import { GsdExportDialog } from './GsdExportDialog'
import { CloneSessionDialog } from './CloneSessionDialog'
import { ChatHeader } from './ChatHeader'
import { ChatArea } from './ChatArea'
import { ChatInputArea } from './ChatInputArea'
import { MobilePlanSheet } from './MobilePlanSheet'
import type { ResearchSynthesis, ResearchResult, GsdWorkflowState } from '@/types/gsd'
import type { PhaseAction, PhaseState } from './PhaseActionBar'
import { prdChatApi, prdApi, gsdApi } from '@/lib/backend-api'
import { toast } from '@/stores/toastStore'
import type { PRDTypeValue, AgentType, PRDFile, ChatAttachment, ChatSession } from '@/types'
import { cn } from '@/lib/utils'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { usePRDChatEvents } from '@/hooks/usePRDChatEvents'
import { useIsMobile, useScrollDirection } from '@/hooks/useMediaQuery'
import { usePRDChatPanelState } from '@/hooks/usePRDChatPanelState'

// ============================================================================
// Main Component
// ============================================================================

export function PRDChatPanel() {
  const [searchParams] = useSearchParams()
  const prdIdFromUrl = searchParams.get('prdId')

  const { registerProject } = useProjectStore()
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

  // Hybrid GSD modal states
  const [showResearchModal, setShowResearchModal] = useState(false)
  const [showScopeSheet, setShowScopeSheet] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [isGeneratingFromPrompt, setIsGeneratingFromPrompt] = useState(false)
  const [showCloneDialog, setShowCloneDialog] = useState(false)
  const [sessionToClone, setSessionToClone] = useState<ChatSession | null>(null)
  const [runningPhaseAction, setRunningPhaseAction] = useState<PhaseAction | null>(null)

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
    phaseState,
    requirementsDoc,
    isResearchRunning,
    isSynthesizing,
    isGeneratingRequirements,
    availableResearchAgents,
    loadAvailableAgents,
    checkResearchStatus,
    loadSynthesis,
    generateRequirements,
    applyScopeSelection,
    addRequirement,
    generateRoadmap,
    loadRequirements,
    loadRoadmap,
  } = usePRDChatStore()

  // Auto-scroll hook for messages
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

  // Memoize the plan update callback
  const handlePlanUpdated = useCallback(
    (content: string, path: string) => {
      updatePlanContent(content, path)
    },
    [updatePlanContent]
  )

  // PRD chat events hook
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

  const selectedModel = userSelectedModel || defaultModelId

  // Track the previous processing session
  const prevProcessingSessionIdRef = useRef<string | null>(null)

  // Load sessions on mount
  useEffect(() => {
    const init = async () => {
      setInitialLoadComplete(false)
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
  }, [loadSessions, loadHistory, processingSessionId, activeProject?.path, setInitialLoadComplete])

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
  }, [prdIdFromUrl, currentSession, startSession, setCurrentSession, activeProject?.path, initialLoadComplete, sessions])

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
      prevSessionIdRef.current = currentSession.id
    }
  }, [currentSession, loadHistory])

  // Connection status tracking for mobile resilience
  const connectionStatus = useConnectionStore((state) => state.status)
  const prevConnectionStatusRef = useRef(connectionStatus)

  useEffect(() => {
    const wasDisconnected = ['disconnected', 'reconnecting', 'offline'].includes(prevConnectionStatusRef.current)
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
  }, [connectionStatus, currentSession, loadHistory, loadSessions, setCurrentSession, activeProject?.path])

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
      const timer = setTimeout(() => assessQuality(), 1000)
      return () => clearTimeout(timer)
    }
  }, [watchedPlanContent, assessQuality])

  // Load available agents and existing data when session changes
  useEffect(() => {
    if (currentSession?.projectPath) {
      loadAvailableAgents()
      checkResearchStatus()
      loadSynthesis()
      loadRequirements()
      loadRoadmap()
    }
  }, [currentSession?.id, currentSession?.projectPath, loadAvailableAgents, checkResearchStatus, loadSynthesis, loadRequirements, loadRoadmap])

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleAgentChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newAgentType = e.target.value
    setAgentError(null)

    try {
      const result = await prdChatApi.checkAgentAvailability(newAgentType)
      if (!result.available) {
        setAgentError(result.error || `Agent '${newAgentType}' is not available`)
        return
      }
      if (currentSession) {
        await updateSessionAgent(newAgentType)
      } else {
        openTypeSelector()
      }
    } catch (err) {
      setAgentError(`Failed to check agent availability: ${err instanceof Error ? err.message : 'Unknown error'}`)
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
    stopStreaming()
    toast.warning('Request will complete in background. You can retry with a new message.')
  }

  const handleTypeSelected = (prdType: PRDTypeValue, guidedMode: boolean, projectPath?: string, title?: string) => {
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
      toast.error('Failed to load PRD', err instanceof Error ? err.message : 'An unexpected error occurred.')
    }
  }

  const handlePhaseAction = async (action: PhaseAction) => {
    if (!currentSession?.projectPath) return

    setRunningPhaseAction(action)
    try {
      switch (action) {
        case 'research':
          setShowResearchModal(true)
          break
        case 'requirements':
          await generateRequirements()
          toast.success('Requirements Generated', 'Requirements have been extracted and are ready for scoping.')
          break
        case 'scope':
          if (requirementsDoc) {
            setShowScopeSheet(true)
          } else {
            toast.error('No Requirements', 'Generate requirements first before scoping.')
          }
          break
        case 'roadmap':
          await generateRoadmap()
          toast.success('Roadmap Generated', 'Execution roadmap has been created from scoped requirements.')
          break
        case 'export':
          setShowExportDialog(true)
          break
      }
    } catch (err) {
      console.error(`Failed to execute phase action ${action}:`, err)
      toast.error('Action Failed', err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setRunningPhaseAction(null)
    }
  }

  const handleResearchComplete = (synthesis: ResearchSynthesis, results: ResearchResult[]) => {
    usePRDChatStore.setState({ researchSynthesis: synthesis })
    usePRDChatStore.getState().updatePhaseState()

    if (currentSession) {
      const synthesisMessage = {
        id: `synthesis-${crypto.randomUUID()}`,
        sessionId: currentSession.id,
        role: 'assistant' as const,
        content: `## Research Summary\n\n${synthesis.content}\n\n---\n*Research analyzed ${synthesis.filesIncluded} files across ${results.length} research areas. Click **Requirements** below to generate requirements from this research.*`,
        createdAt: new Date().toISOString(),
        metadata: { type: 'research-synthesis' },
      }
      usePRDChatStore.setState((state) => ({
        messages: [...state.messages, synthesisMessage],
      }))
    }

    setShowResearchModal(false)
    toast.success('Research Complete', `${results.length} research reports generated. Click Requirements to generate requirements.`)
  }

  const handleScopeComplete = () => {
    setShowScopeSheet(false)
    toast.success('Scoping Complete', 'Requirements have been categorized. Click Roadmap to generate execution plan.')
  }

  // AI-powered bulk requirement generation
  const handleGenerateRequirementsFromPrompt = async (
    prompt: string,
    agentType?: string,
    model?: string,
    count?: number
  ) => {
    if (!currentSession || !activeProject?.path) {
      throw new Error('No active session')
    }
    setIsGeneratingFromPrompt(true)
    try {
      const result = await gsdApi.generateRequirementsFromPrompt(
        activeProject.path,
        currentSession.id,
        prompt,
        count,
        agentType,
        model
      )
      return result
    } finally {
      setIsGeneratingFromPrompt(false)
    }
  }

  const handleAcceptGeneratedRequirements = async (requirements: import('@/types/gsd').GeneratedRequirement[]) => {
    if (!currentSession || !activeProject?.path) {
      throw new Error('No active session')
    }
    await gsdApi.addGeneratedRequirements(
      activeProject.path,
      currentSession.id,
      requirements
    )
    // Reload requirements to reflect changes
    await loadRequirements()
    toast.success('Requirements Added', `${requirements.length} requirements added successfully.`)
  }

  const handleExportComplete = (prdName: string, result: { storyCount: number }) => {
    setShowExportDialog(false)

    // Add success message to chat
    if (currentSession) {
      const exportMessage = {
        id: `export-${crypto.randomUUID()}`,
        sessionId: currentSession.id,
        role: 'assistant' as const,
        content: `## PRD Exported Successfully!\n\nYour PRD **${prdName}** has been created at \`.ralph-ui/prds/${prdName}.json\`.\n\n**Summary:**\n- ${result.storyCount} stories created from your requirements\n- Ready for execution with the Ralph Wiggum Loop\n\nYou can now execute this PRD from the PRD list or start a new planning session.`,
        createdAt: new Date().toISOString(),
        metadata: { type: 'export-success' },
      }
      usePRDChatStore.setState((state) => ({
        messages: [...state.messages, exportMessage],
      }))
    }
  }

  const handleCloneSession = (session: ChatSession) => {
    setSessionToClone(session)
    setShowCloneDialog(true)
  }

  const handleCloneComplete = async (newState: GsdWorkflowState) => {
    setShowCloneDialog(false)
    setSessionToClone(null)

    // Reload sessions to show the new one
    if (activeProject?.path) {
      await loadSessions(activeProject.path)

      // Select the newly created session
      const newSession = sessions.find(s => s.id === newState.sessionId)
      if (newSession) {
        setCurrentSession(newSession)
      }
    }
  }

  const handlePlanToggle = () => {
    if (isMobile) {
      setMobilePlanSheetOpen(!mobilePlanSheetOpen)
    } else {
      setShowPlanSidebar(!showPlanSidebar)
    }
  }

  // ============================================================================
  // Computed Values
  // ============================================================================

  const effectiveRunningAction: PhaseAction | null = isResearchRunning ? 'research' : runningPhaseAction

  const currentPhaseState: PhaseState = {
    ...phaseState,
    isRunning: isResearchRunning || isSynthesizing || isGeneratingRequirements || loading,
    runningAction: effectiveRunningAction,
  }

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
        onCloneSession={handleCloneSession}
        qualityAssessment={qualityAssessment}
        loading={loading}
        onRefreshQuality={assessQuality}
        className="hidden md:flex"
      />

      {/* Chat Panel */}
      <Card className={cn('flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden')}>
        <ChatHeader
          currentSession={currentSession}
          sessions={sessions}
          agentType={agentType}
          availableAgents={availableResearchAgents.length > 0 ? availableResearchAgents : ['claude']}
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
          onAgentChange={handleAgentChange}
          onModelChange={setUserSelectedModel}
          onSelectSession={setCurrentSession}
          onCreateSession={openTypeSelector}
          onPlanToggle={handlePlanToggle}
          onRefreshQuality={assessQuality}
          onExecutePrd={handleExecutePrd}
        />

        <CardContent className="flex-1 flex flex-col p-0 overflow-hidden relative min-h-0">
          {/* Loading Spinner */}
          {loading && (
            <div data-testid="loading-spinner" className="absolute inset-0 flex items-center justify-center bg-background/50 z-10">
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
            onCreateSession={openTypeSelector}
            onQuickStart={handleQuickStart}
            onSendMessage={handleSendMessage}
            onRetry={handleRetryMessage}
            onCancel={handleCancelStreaming}
            onScrollToBottom={scrollToBottom}
          />

          {/* Input Area */}
          <ChatInputArea
            currentSession={currentSession}
            hasMessages={hasMessages}
            loading={loading}
            streaming={streaming}
            qualityAssessment={qualityAssessment}
            phaseState={currentPhaseState}
            onSendMessage={handleSendMessage}
            onPhaseAction={handlePhaseAction}
            onRefreshQuality={assessQuality}
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
              This will permanently delete the session and all its messages. This action cannot be undone.
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

      {/* Hybrid GSD Modals */}
      {currentSession?.projectPath && (
        <>
          <ResearchProgressModal
            open={showResearchModal}
            onOpenChange={setShowResearchModal}
            projectPath={currentSession.projectPath}
            sessionId={currentSession.id}
            onComplete={handleResearchComplete}
            conversationContext={messages.map((m) => `${m.role}: ${m.content}`).join('\n')}
          />

          <RequirementsScopeSheet
            open={showScopeSheet}
            onOpenChange={setShowScopeSheet}
            requirements={requirementsDoc}
            onApplyScope={applyScopeSelection}
            onAddRequirement={addRequirement}
            onComplete={handleScopeComplete}
            isLoading={loading}
            onGenerateRequirements={handleGenerateRequirementsFromPrompt}
            onAcceptGeneratedRequirements={handleAcceptGeneratedRequirements}
            isGenerating={isGeneratingFromPrompt}
          />

          <GsdExportDialog
            open={showExportDialog}
            onOpenChange={setShowExportDialog}
            sessionId={currentSession.id}
            projectPath={currentSession.projectPath}
            onExportComplete={handleExportComplete}
          />
        </>
      )}

      {/* Clone Session Dialog - outside currentSession check since it clones any session */}
      <CloneSessionDialog
        open={showCloneDialog}
        onOpenChange={setShowCloneDialog}
        session={sessionToClone ? {
          sessionId: sessionToClone.id,
          phase: undefined,
          isComplete: false,
          updatedAt: sessionToClone.updatedAt,
        } : null}
        projectPath={activeProject?.path ?? ''}
        onCloneComplete={handleCloneComplete}
      />
    </div>
  )
}
