import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRalphLoopStore } from '@/stores/ralphLoopStore'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect as Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Play,
  Pause,
  StopCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Circle,
  Clock,
  Loader2,
  BookOpen,
  Terminal,
  GitCommit,
  AlertCircle,
  Settings,
  ChevronDown,
  FolderOpen,
  GitBranch,
  GitFork,
  PanelTopClose,
  PanelTop,
  GripHorizontal,
} from 'lucide-react'
import type { RalphStory, RalphLoopState, AgentType } from '@/types'
import type { CommitInfo } from '@/lib/git-api'
import { UnifiedTerminalView } from '@/components/terminal/UnifiedTerminalView'
import { IterationHistoryView } from '@/components/ralph-loop/IterationHistoryView'
import { AgentTree } from '@/components/ralph-loop/AgentTree'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { useTreeViewSettings } from '@/hooks/useTreeViewSettings'
import { getDefaultModel } from '@/lib/fallback-models'
import { groupModelsByProvider, formatProviderName } from '@/lib/model-api'

interface RalphLoopDashboardProps {
  projectPath: string
  prdName: string // Required for file-based PRDs in .ralph-ui/prds/
}

export function RalphLoopDashboard({
  projectPath,
  prdName,
}: RalphLoopDashboardProps): React.JSX.Element {
  const {
    prd,
    prdStatus,
    progress,
    progressSummary,
    config,
    commits,
    executionState,
    executionMetrics,
    activeExecutionId,
    currentAgentId,
    loading,
    error,
    worktreePath,
    iterationHistory,
    setProjectPath,
    loadPrd,
    loadPrdStatus,
    loadPrdStatusSilent,
    loadProgress,
    loadProgressSummary,
    loadConfig,
    loadCommits,
    updateConfig,
    startLoop,
    stopLoop,
    loadSnapshot,
    markStoryPassing,
    markStoryFailing,
    refreshAll,
    checkForActiveExecution,
  } = useRalphLoopStore()

  const [activeTab, setActiveTab] = useState('stories')
  const [configOpen, setConfigOpen] = useState(false)

  // Tree view settings (persists across dashboard reopens)
  const {
    isTreeVisible,
    panelHeight,
    toggleTreeView,
    setPanelHeight,
  } = useTreeViewSettings()

  // Resizable panel state
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  // Handle resize drag
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
  }, [])

  // Set up global mouse listeners for resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()
      const relativeY = e.clientY - containerRect.top
      const percentage = (relativeY / containerRect.height) * 100

      setPanelHeight(percentage)
    }

    const handleMouseUp = () => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [setPanelHeight])

  // Local state for config overrides - consolidated into single object
  interface ConfigOverrides {
    maxIterations?: string
    maxCost?: string
    agent?: string
    model?: string
    runTests?: boolean
    runLint?: boolean
  }
  const [configOverrides, setConfigOverrides] = useState<ConfigOverrides>({})

  // Derive effective config: merge saved config with local overrides
  const effectiveConfig = useMemo(
    () => ({
      maxIterations:
        configOverrides.maxIterations ??
        (config?.ralph.maxIterations != null ? String(config.ralph.maxIterations) : '50'),
      maxCost:
        configOverrides.maxCost ??
        (config?.ralph.maxCost != null ? String(config.ralph.maxCost) : ''),
      agent: configOverrides.agent ?? (config?.ralph.agent || 'claude'),
      runTests: configOverrides.runTests ?? true,
      runLint: configOverrides.runLint ?? true,
    }),
    [config, configOverrides]
  )

  // Shorthand for effective values (maintains backwards compatibility with existing JSX)
  const effectiveMaxIterations = effectiveConfig.maxIterations
  const effectiveMaxCost = effectiveConfig.maxCost
  const effectiveAgent = effectiveConfig.agent
  const effectiveRunTests = effectiveConfig.runTests
  const effectiveRunLint = effectiveConfig.runLint

  // Use dynamic models hook instead of static fallback
  const {
    models: availableModels,
    loading: modelsLoading,
    refresh: refreshModels,
  } = useAvailableModels(effectiveAgent as AgentType)

  // Determine effective model - check if saved model is compatible with current agent
  // If agent changed and saved model isn't in the available models, ignore it
  const savedModel = config?.ralph.model || ''
  const isSavedModelCompatible = !savedModel || availableModels.some((m) => m.id === savedModel)
  const effectiveModel = configOverrides.model ?? (isSavedModelCompatible ? savedModel : '')

  // Determine effective path for data loading (use worktree if active, otherwise project path)
  // This ensures we read PRD/progress from the correct location during execution
  const effectiveDataPath = worktreePath || projectPath

  // Load data when project path or prdName changes
  useEffect(() => {
    if (projectPath) {
      setProjectPath(projectPath, prdName)
      loadPrd(projectPath, prdName)
      loadPrdStatus(projectPath, prdName)
      loadProgress(projectPath, prdName)
      loadProgressSummary(projectPath, prdName)
      loadCommits(projectPath)
      loadConfig(projectPath)
    }
  }, [
    projectPath,
    prdName,
    setProjectPath,
    loadPrd,
    loadPrdStatus,
    loadProgress,
    loadProgressSummary,
    loadCommits,
    loadConfig,
  ])

  // Reload data from worktree path when it becomes available
  // This ensures we show current data during active execution
  useEffect(() => {
    if (worktreePath && prdName) {
      // Load PRD and progress data from the worktree where the agent is writing
      loadPrd(worktreePath, prdName)
      loadPrdStatus(worktreePath, prdName)
      loadProgress(worktreePath, prdName)
      loadProgressSummary(worktreePath, prdName)
      // Load commits from worktree (which has the execution branch)
      loadCommits(worktreePath)
    }
  }, [
    worktreePath,
    prdName,
    loadPrd,
    loadPrdStatus,
    loadProgress,
    loadProgressSummary,
    loadCommits,
  ])

  // Check for active execution after PRD loads (to restore button state after navigation)
  useEffect(() => {
    if (prd && !activeExecutionId) {
      checkForActiveExecution()
    }
  }, [prd, activeExecutionId, checkForActiveExecution])

  // Poll for updates during active execution
  useEffect(() => {
    if (!activeExecutionId) {
      return
    }

    // Use worktree path if available (where agent writes), otherwise project path
    const pollPath = effectiveDataPath

    // Poll immediately (not silent), then silently every 2 seconds
    // Use consolidated snapshot API for state/metrics/history (1 IPC call instead of 4)
    loadSnapshot()
    loadPrdStatus(pollPath, prdName)
    loadCommits(pollPath)

    // Silent polling to avoid re-render storms
    const poll = () => {
      // Check if execution has ended - stop polling if completed or failed
      const currentState = executionState?.type
      if (
        currentState === 'completed' ||
        currentState === 'failed' ||
        currentState === 'cancelled'
      ) {
        return
      }

      // Consolidated API: state + metrics + agentId + worktreePath + iterationHistory in 1 call
      loadSnapshot(true) // silent
      loadPrdStatusSilent(pollPath, prdName)
    }

    const interval = setInterval(poll, 2000)

    return () => {
      clearInterval(interval)
    }
  }, [
    activeExecutionId,
    loadSnapshot,
    loadPrdStatus,
    loadPrdStatusSilent,
    loadCommits,
    effectiveDataPath,
    prdName,
    executionState?.type,
  ])

  const handleStartLoop = async () => {
    if (!prd) {
      return
    }

    // Use effective config values for execution
    const maxIterations = effectiveMaxIterations ? parseInt(effectiveMaxIterations, 10) : undefined
    const maxCost = effectiveMaxCost ? parseFloat(effectiveMaxCost) : undefined

    // Calculate the model exactly as it appears in the UI to ensure WYSIWYG
    // This prevents discrepancies between frontend defaults and backend/CLI defaults
    const displayedModel =
      effectiveModel || getDefaultModel((effectiveAgent || 'claude') as AgentType)

    const request = {
      projectPath,
      agentType: effectiveAgent || 'claude',
      branch: prd.branch,
      runTests: effectiveRunTests,
      runLint: effectiveRunLint,
      maxIterations,
      maxCost,
      model: displayedModel, // Send explicit model instead of undefined
      prdName,
    }

    try {
      await startLoop(request)
    } catch {
      // Error handled by store
    }
  }

  const handleSaveConfig = async () => {
    const updates: {
      maxIterations?: number
      maxCost?: number
      agent?: string
      model?: string
    } = {}

    if (effectiveMaxIterations) {
      updates.maxIterations = parseInt(effectiveMaxIterations, 10)
    }
    if (effectiveMaxCost) {
      updates.maxCost = parseFloat(effectiveMaxCost)
    }
    if (effectiveAgent) {
      updates.agent = effectiveAgent
    }
    if (effectiveModel) {
      updates.model = effectiveModel
    }

    await updateConfig(updates)
    // Reset local overrides to sync with saved config
    setConfigOverrides({})
  }

  const handleStopLoop = async () => {
    await stopLoop()
  }

  const handleToggleStory = async (story: RalphStory) => {
    if (story.passes) {
      await markStoryFailing(story.id)
    } else {
      await markStoryPassing(story.id)
    }
  }

  const getStateDisplay = (state: RalphLoopState | null) => {
    if (!state) return { label: 'Not Started', color: 'secondary', icon: Circle }

    switch (state.type) {
      case 'idle':
        return { label: 'Idle', color: 'secondary', icon: Circle }
      case 'running':
        return { label: `Running (Iteration ${state.iteration})`, color: 'default', icon: Loader2 }
      case 'retrying':
        return {
          label: `Retrying (Iteration ${state.iteration}, attempt ${state.attempt})`,
          color: 'outline',
          icon: RefreshCw,
        }
      case 'paused':
        return { label: `Paused (Iteration ${state.iteration})`, color: 'outline', icon: Pause }
      case 'completed':
        return {
          label: `Completed (${state.totalIterations} iterations)`,
          color: 'default',
          icon: CheckCircle2,
        }
      case 'failed':
        return { label: `Failed: ${state.reason}`, color: 'destructive', icon: XCircle }
      case 'cancelled':
        return {
          label: `Cancelled (Iteration ${state.iteration})`,
          color: 'outline',
          icon: StopCircle,
        }
      default:
        return { label: 'Unknown', color: 'secondary', icon: AlertCircle }
    }
  }

  const stateDisplay = getStateDisplay(executionState)
  const isRunning = executionState?.type === 'running'

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
    <div className="space-y-4">
      {/* Header with PRD info and controls */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">{prd.title}</CardTitle>
              <CardDescription className="mt-1">
                Branch: {prd.branch} | {prd.stories.length} stories
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={stateDisplay.color as 'default' | 'secondary' | 'destructive' | 'outline'}
              >
                <stateDisplay.icon className={`mr-1 h-3 w-3 ${isRunning ? 'animate-spin' : ''}`} />
                {stateDisplay.label}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Progress bar */}
          {prdStatus && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>
                  {prdStatus.passed} of {prdStatus.total} stories passing
                </span>
                <span>{Math.round(prdStatus.progressPercent || 0)}%</span>
              </div>
              <Progress value={prdStatus.progressPercent || 0} className="h-2" />
            </div>
          )}

          {/* Configuration */}
          <Collapsible open={configOpen} onOpenChange={setConfigOpen} className="mt-4">
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="w-full justify-between">
                <span className="flex items-center gap-2">
                  <Settings className="h-4 w-4" />
                  Loop Configuration
                  {config && (
                    <span className="text-muted-foreground text-xs">
                      (max {effectiveMaxIterations} iterations
                      {effectiveMaxCost ? `, $${effectiveMaxCost} limit` : ''})
                    </span>
                  )}
                </span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${configOpen ? 'rotate-180' : ''}`}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="max-iterations">Max Iterations</Label>
                  <Input
                    id="max-iterations"
                    type="number"
                    min={1}
                    max={1000}
                    placeholder="50"
                    value={effectiveMaxIterations}
                    onChange={(e) =>
                      setConfigOverrides((prev) => ({ ...prev, maxIterations: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum loop iterations before stopping
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-cost">Max Cost ($)</Label>
                  <Input
                    id="max-cost"
                    type="number"
                    min={0}
                    step={0.5}
                    placeholder="No limit"
                    value={effectiveMaxCost}
                    onChange={(e) =>
                      setConfigOverrides((prev) => ({ ...prev, maxCost: e.target.value }))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Stop when API costs exceed this limit
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agent">Agent</Label>
                  <Select
                    id="agent"
                    value={effectiveAgent}
                    onChange={(e) => {
                      // Reset model when agent changes (set model to undefined to clear override)
                      setConfigOverrides((prev) => ({
                        ...prev,
                        agent: e.target.value,
                        model: undefined,
                      }))
                    }}
                  >
                    <option value="claude">Claude Code</option>
                    <option value="opencode">OpenCode</option>
                    <option value="cursor">Cursor Agent</option>
                    <option value="codex">Codex CLI</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="model">Model</Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={refreshModels}
                      disabled={modelsLoading}
                      className="h-6 w-6 p-0"
                    >
                      <RefreshCw className={`h-3 w-3 ${modelsLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </div>
                  <Select
                    id="model"
                    value={effectiveModel || getDefaultModel(effectiveAgent as AgentType)}
                    onChange={(e) =>
                      setConfigOverrides((prev) => ({ ...prev, model: e.target.value }))
                    }
                    disabled={modelsLoading}
                  >
                    {modelsLoading ? (
                      <option>Loading models...</option>
                    ) : (
                      Object.entries(groupModelsByProvider(availableModels)).map(
                        ([provider, providerModels]) => (
                          <optgroup key={provider} label={formatProviderName(provider)}>
                            {providerModels.map((model) => (
                              <option key={model.id} value={model.id}>
                                {model.name}
                              </option>
                            ))}
                          </optgroup>
                        )
                      )
                    )}
                  </Select>
                  <p className="text-xs text-muted-foreground">Model to use for the agent</p>
                </div>
              </div>

              {/* Worktree Isolation - Read-only indicator */}
              <div className="mt-4 rounded-md border border-dashed border-muted-foreground/30 bg-muted/30 p-3">
                <label className="flex items-center gap-3">
                  <Checkbox checked={!!worktreePath} disabled />
                  <div className="flex-1">
                    <span className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <GitBranch className="h-4 w-4" />
                      Worktree Isolation
                      <span className="text-xs font-normal">(set during PRD execution)</span>
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                      {worktreePath
                        ? 'Work happens in an isolated git worktree.'
                        : 'Not using worktree isolation - working in main directory.'}
                    </p>
                  </div>
                </label>
              </div>

              {/* Quality Gates */}
              <div className="mt-4 space-y-3">
                <Label>Quality Gates</Label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={effectiveRunTests}
                      onCheckedChange={(checked) =>
                        setConfigOverrides((prev) => ({ ...prev, runTests: checked as boolean }))
                      }
                    />
                    <span className="text-sm">Run tests before marking tasks complete</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={effectiveRunLint}
                      onCheckedChange={(checked) =>
                        setConfigOverrides((prev) => ({ ...prev, runLint: checked as boolean }))
                      }
                    />
                    <span className="text-sm">Run linter before marking tasks complete</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <Button variant="secondary" size="sm" onClick={handleSaveConfig}>
                  Save Configuration
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Controls */}
          <div className="flex items-center gap-2 mt-4">
            {isRunning ? (
              <Button variant="destructive" onClick={handleStopLoop} disabled={loading}>
                <StopCircle className="mr-2 h-4 w-4" />
                Stop Loop
              </Button>
            ) : (
              <Button onClick={handleStartLoop} disabled={loading || prdStatus?.allPass}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Play className="mr-2 h-4 w-4" />
                )}
                {prdStatus?.allPass ? 'All Stories Pass' : 'Start Ralph Loop'}
              </Button>
            )}
            <Button variant="outline" onClick={() => refreshAll()} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>

          {/* Worktree Info - shown when using worktree isolation */}
          {worktreePath && (
            <div className="mt-4 p-3 rounded-md border border-dashed border-green-500/50 bg-green-500/5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <GitBranch className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-sm font-medium">Worktree Isolation Active</span>
                    <p
                      className="text-xs text-muted-foreground font-mono truncate"
                      title={worktreePath}
                    >
                      {worktreePath}
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Open worktree folder in file explorer
                    import('@tauri-apps/plugin-shell')
                      .then(({ open }) => {
                        open(worktreePath)
                      })
                      .catch(console.error)
                  }}
                >
                  <FolderOpen className="mr-2 h-4 w-4" />
                  Open Folder
                </Button>
              </div>
            </div>
          )}

          {/* Metrics */}
          {executionMetrics && (
            <div className="grid grid-cols-4 gap-4 mt-4 pt-4 border-t">
              <div className="text-center">
                <div className="text-2xl font-bold">{executionMetrics.totalIterations ?? 0}</div>
                <div className="text-xs text-muted-foreground">Iterations</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">{executionMetrics.storiesCompleted ?? 0}</div>
                <div className="text-xs text-muted-foreground">Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  {(executionMetrics.totalTokens ?? 0).toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground">Tokens</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold">
                  ${(executionMetrics.totalCost ?? 0).toFixed(2)}
                </div>
                <div className="text-xs text-muted-foreground">Cost</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs for Stories, Progress, Terminal */}
      <Card>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full justify-start border-b rounded-none h-auto p-0">
            <TabsTrigger
              value="stories"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Stories ({prdStatus?.passed ?? 0}/{prdStatus?.total ?? 0})
            </TabsTrigger>
            <TabsTrigger
              value="progress"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              Progress ({progressSummary?.learningsCount ?? 0} learnings)
            </TabsTrigger>
            <TabsTrigger
              value="terminal"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            >
              <Terminal className="mr-2 h-4 w-4" />
              Terminal
            </TabsTrigger>
            <TabsTrigger
              value="commits"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            >
              <GitCommit className="mr-2 h-4 w-4" />
              Commits
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary"
            >
              <Clock className="mr-2 h-4 w-4" />
              History ({iterationHistory.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stories" className="p-0 mt-0">
            <ScrollArea className="h-[400px]">
              <div className="p-4 space-y-2">
                {prd.stories.map((story) => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    isNext={prdStatus?.nextStoryId === story.id}
                    onToggle={() => handleToggleStory(story)}
                  />
                ))}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="progress" className="p-0 mt-0">
            <ScrollArea className="h-[400px]">
              <div className="p-4">
                <ProgressViewer content={progress} />
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="terminal" className="p-0 mt-0">
            {currentAgentId && activeExecutionId ? (
              <div className="flex flex-col h-[500px]" ref={containerRef}>
                {/* Tree View Toggle Header */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b bg-muted/30">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <GitFork className="h-4 w-4" />
                    <span>Subagent Tree</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    onClick={toggleTreeView}
                    title={isTreeVisible ? 'Hide tree view' : 'Show tree view'}
                    data-testid="toggle-tree-view"
                  >
                    {isTreeVisible ? (
                      <PanelTopClose className="h-4 w-4" />
                    ) : (
                      <PanelTop className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Agent Tree - Hierarchical Subagent Visualization (Collapsible) */}
                {isTreeVisible && (
                  <>
                    <div
                      style={{ height: `${panelHeight}%` }}
                      className="min-h-[100px] overflow-hidden"
                      data-testid="tree-panel"
                    >
                      <AgentTree
                        agentId={currentAgentId}
                        maxHeight="100%"
                        className="p-2 h-full"
                      />
                    </div>

                    {/* Resize Handle */}
                    <div
                      className="h-2 border-y bg-muted/50 hover:bg-muted cursor-row-resize flex items-center justify-center group"
                      onMouseDown={handleResizeStart}
                      data-testid="resize-handle"
                    >
                      <GripHorizontal className="h-3 w-3 text-muted-foreground group-hover:text-foreground" />
                    </div>
                  </>
                )}

                {/* Terminal Output */}
                <div className="flex-1 min-h-0">
                  <UnifiedTerminalView
                    key={`unified-${activeExecutionId}`}
                    agentId={currentAgentId}
                    className="h-full"
                  />
                </div>
              </div>
            ) : (
              <div className="h-[400px] bg-zinc-950 flex items-center justify-center">
                <div className="text-center">
                  <Terminal className="h-12 w-12 text-zinc-600 mx-auto mb-2" />
                  <p className="text-zinc-500">No active agent</p>
                  <p className="text-sm text-zinc-600">
                    Start the Ralph Loop to see terminal output
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="commits" className="p-0 mt-0">
            <ScrollArea className="h-[400px]">
              <div className="p-4 space-y-2">
                {commits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-center">
                    <GitCommit className="h-12 w-12 text-muted-foreground mb-2 opacity-50" />
                    <p className="text-muted-foreground">No commits found</p>
                    <p className="text-sm text-muted-foreground">
                      Commits will appear here as the agent works
                    </p>
                  </div>
                ) : (
                  commits.map((commit) => <CommitCard key={commit.id} commit={commit} />)
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history" className="p-0 mt-0">
            <ScrollArea className="h-[400px]">
              <div className="p-4">
                <IterationHistoryView iterations={iterationHistory} />
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </Card>

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
    </div>
  )
}

// Story card component
interface StoryCardProps {
  story: RalphStory
  isNext: boolean
  onToggle: () => void
}

function StoryCard({ story, isNext, onToggle }: StoryCardProps): React.JSX.Element {
  return (
    <div
      className={`p-3 rounded-lg border ${
        story.passes
          ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-900'
          : isNext
            ? 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-900'
            : 'bg-card border-border'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <button onClick={onToggle} className="mt-0.5 flex-shrink-0">
            {story.passes ? (
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <Circle className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-muted-foreground">{story.id}</span>
              {isNext && !story.passes && (
                <Badge variant="secondary" className="text-xs">
                  Next
                </Badge>
              )}
            </div>
            <h4
              className={`font-medium ${story.passes ? 'line-through text-muted-foreground' : ''}`}
            >
              {story.title}
            </h4>
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{story.acceptance}</p>
            {story.tags && story.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {story.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {story.effort && (
            <Badge variant="outline" className="text-xs">
              {story.effort}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            P{story.priority}
          </Badge>
        </div>
      </div>
    </div>
  )
}

// Progress viewer component
interface ProgressViewerProps {
  content: string
}

function ProgressViewer({ content }: ProgressViewerProps): React.JSX.Element {
  if (!content) {
    return (
      <div className="text-center text-muted-foreground py-8">
        <BookOpen className="h-12 w-12 mx-auto mb-2 opacity-50" />
        <p>No progress recorded yet</p>
        <p className="text-sm">Learnings will appear here as the agent works</p>
      </div>
    )
  }

  // Parse progress entries
  const lines = content.split('\n')

  return (
    <div className="space-y-2 font-mono text-sm">
      {lines.map((line, index) => {
        // Skip empty lines and comments
        if (!line.trim() || line.startsWith('#')) {
          return null
        }

        // Parse entry type from line
        const isLearning = line.includes('[LEARNING]')
        const isError = line.includes('[ERROR]')
        const isStart = line.includes('[START]')
        const isEnd = line.includes('[END]')
        const isCompleted = line.includes('[COMPLETED]')

        let bgColor = 'bg-muted/30'
        let icon = <Clock className="h-3 w-3 text-muted-foreground" />

        if (isLearning) {
          bgColor = 'bg-blue-50 dark:bg-blue-950/30'
          icon = <BookOpen className="h-3 w-3 text-blue-500" />
        } else if (isError) {
          bgColor = 'bg-red-50 dark:bg-red-950/30'
          icon = <XCircle className="h-3 w-3 text-red-500" />
        } else if (isCompleted) {
          bgColor = 'bg-green-50 dark:bg-green-950/30'
          icon = <CheckCircle2 className="h-3 w-3 text-green-500" />
        } else if (isStart || isEnd) {
          bgColor = 'bg-muted/50'
        }

        return (
          <div key={index} className={`p-2 rounded ${bgColor} flex items-start gap-2`}>
            <span className="flex-shrink-0 mt-0.5">{icon}</span>
            <span className="break-all">{line}</span>
          </div>
        )
      })}
    </div>
  )
}

// Commit card component
interface CommitCardProps {
  commit: CommitInfo
}

function CommitCard({ commit }: CommitCardProps): React.JSX.Element {
  // Format timestamp to readable date
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Get first line of commit message
  const firstLine = commit.message.split('\n')[0]
  const hasMoreLines = commit.message.split('\n').length > 1

  return (
    <div className="p-3 rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <GitCommit className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className="font-mono text-xs">
                {commit.short_id}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatTimestamp(commit.timestamp)}
              </span>
            </div>
            <p className="font-medium text-sm">
              {firstLine.length > 80 ? firstLine.substring(0, 77) + '...' : firstLine}
            </p>
            {hasMoreLines && (
              <p className="text-xs text-muted-foreground mt-0.5">
                (+ {commit.message.split('\n').length - 1} more lines)
              </p>
            )}
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>{commit.author}</span>
              {commit.parent_ids.length > 1 && (
                <Badge variant="secondary" className="text-xs">
                  Merge
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
