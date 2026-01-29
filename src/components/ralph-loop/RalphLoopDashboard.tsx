import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { useRalphLoopDashboard } from './hooks/useRalphLoopDashboard'
import { RalphLoopHeader } from './RalphLoopHeader'
import { DashboardTabs } from './DashboardTabs'
import { ExecutionDialogs } from './ExecutionDialogs'
import { ExecutionPreviewDialog } from './ExecutionPreviewDialog'

export interface RalphLoopDashboardProps {
  projectPath: string
  prdName: string // Required for file-based PRDs in .ralph-ui/prds/
}

export function RalphLoopDashboard({
  projectPath,
  prdName,
}: RalphLoopDashboardProps): React.JSX.Element {
  const dashboard = useRalphLoopDashboard({ projectPath, prdName })

  const {
    prd,
    prdStatus,
    progress,
    progressSummary,
    commits,
    executionMetrics,
    activeExecutionId,
    currentAgentId,
    loading,
    error,
    worktreePath,
    iterationHistory,

    // UI state
    activeTab,
    setActiveTab,
    configOpen,
    setConfigOpen,
    regeneratingStories,
    regenerateConfirmOpen,
    setRegenerateConfirmOpen,
    executionPreviewOpen,
    setExecutionPreviewOpen,

    // Worktree dialog state
    diffDialogOpen,
    setDiffDialogOpen,
    diffInfo,
    diffLoading,
    conflictDialogOpen,
    setConflictDialogOpen,
    conflicts,
    setConflicts,
    mergeLoading,

    // Tree view
    isTreeVisible,
    panelHeight,
    toggleTreeView,
    containerRef,
    handleResizeStart,

    // Config
    setConfigOverrides,
    effectiveMaxIterations,
    effectiveMaxCost,
    effectiveAgent,
    effectiveModel,
    effectiveRunTests,
    effectiveRunLint,
    availableAgents,
    availableModels,
    modelsLoading,
    refreshModels,

    // Derived values
    effectiveWorktreePath,
    isRunning,
    stateDisplay,

    // Actions
    handleStartLoop,
    executeLoop,
    handleStopLoop,
    handleSaveConfig,
    handleToggleStory,
    handleRegenerateStories,
    handleViewDiff,
    handleMergeToMain,
    handleMergeComplete,
    handleOpenTerminal,
    handleOpenInEditor,
    refreshAll,
  } = dashboard

  // No PRD found state
  if (!prd) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold">No Ralph PRD Found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Initialize a Ralph PRD at .ralph/prd.json to get started
              </p>
            </div>
            <Button onClick={() => refreshAll()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 gap-2">
      {/* Header with PRD info and controls */}
      <RalphLoopHeader
        prd={prd}
        prdStatus={prdStatus}
        stateDisplay={stateDisplay}
        isRunning={isRunning}
        loading={loading}
        worktreePath={worktreePath}
        effectiveWorktreePath={effectiveWorktreePath}
        executionMetrics={executionMetrics}
        configOpen={configOpen}
        setConfigOpen={setConfigOpen}
        setConfigOverrides={setConfigOverrides}
        effectiveMaxIterations={effectiveMaxIterations}
        effectiveMaxCost={effectiveMaxCost}
        effectiveAgent={effectiveAgent}
        effectiveModel={effectiveModel}
        effectiveRunTests={effectiveRunTests}
        effectiveRunLint={effectiveRunLint}
        availableAgents={availableAgents}
        availableModels={availableModels}
        modelsLoading={modelsLoading}
        refreshModels={refreshModels}
        diffLoading={diffLoading}
        mergeLoading={mergeLoading}
        onStartLoop={handleStartLoop}
        onStopLoop={handleStopLoop}
        onSaveConfig={handleSaveConfig}
        onRefresh={refreshAll}
        onViewDiff={handleViewDiff}
        onMergeToMain={handleMergeToMain}
        onOpenTerminal={handleOpenTerminal}
        onOpenInEditor={handleOpenInEditor}
      />

      {/* Tabs for Stories, Progress, Terminal, etc. */}
      <DashboardTabs
        prd={prd}
        prdStatus={prdStatus}
        progress={progress}
        progressSummary={progressSummary}
        commits={commits}
        iterationHistory={iterationHistory ?? []}
        currentAgentId={currentAgentId}
        activeExecutionId={activeExecutionId}
        isRunning={isRunning}
        regeneratingStories={regeneratingStories}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isTreeVisible={isTreeVisible}
        panelHeight={panelHeight}
        containerRef={containerRef}
        onToggleTreeView={toggleTreeView}
        onResizeStart={handleResizeStart}
        onToggleStory={handleToggleStory}
        onRegenerateClick={() => setRegenerateConfirmOpen(true)}
        projectPath={projectPath}
        prdName={prdName}
      />

      {/* Error display */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <ExecutionDialogs
        regenerateConfirmOpen={regenerateConfirmOpen}
        setRegenerateConfirmOpen={setRegenerateConfirmOpen}
        onRegenerateStories={handleRegenerateStories}
        diffDialogOpen={diffDialogOpen}
        setDiffDialogOpen={setDiffDialogOpen}
        diffInfo={diffInfo}
        conflictDialogOpen={conflictDialogOpen}
        setConflictDialogOpen={setConflictDialogOpen}
        conflicts={conflicts}
        setConflicts={setConflicts}
        projectPath={projectPath}
        onMergeComplete={handleMergeComplete}
      />

      {/* Execution Preview Dialog */}
      <ExecutionPreviewDialog
        open={executionPreviewOpen}
        onOpenChange={setExecutionPreviewOpen}
        stories={prd.stories}
        onConfirm={executeLoop}
        loading={loading}
      />
    </div>
  )
}
