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
  GitBranch,
  GitMerge,
  FileDiff,
  Code2,
  GitFork,
  PanelTopClose,
  PanelTop,
  GripHorizontal,
  Users,
} from 'lucide-react'
import type { RalphStory, RalphLoopState, AgentType } from '@/types'
import { gitApi, type DiffInfo, type ConflictInfo } from '@/lib/git-api'
import { toast } from '@/stores/toastStore'
import { ConflictResolutionDialog } from '@/components/git/ConflictResolutionDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { UnifiedTerminalView } from '@/components/terminal/UnifiedTerminalView'
import { IterationHistoryView } from '@/components/ralph-loop/IterationHistoryView'
import { useTerminalStore } from '@/stores/terminalStore'
import { AgentTree } from '@/components/ralph-loop/AgentTree'
import { StoryCard } from '@/components/ralph-loop/StoryCard'
import { ProgressViewer } from '@/components/ralph-loop/ProgressViewer'
import { CommitCard } from '@/components/ralph-loop/CommitCard'
import { AssignmentsPanel } from '@/components/ralph-loop/AssignmentsPanel'
import { LearningsPanel } from '@/components/ralph-loop/LearningsPanel'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { useTreeViewSettings } from '@/hooks/useTreeViewSettings'
import { getDefaultModel } from '@/lib/fallback-models'
import { ModelSelector } from '@/components/shared/ModelSelector'
import { ralphLoopApi } from '@/lib/tauri-api'
import { Sparkles } from 'lucide-react'

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
  const [regeneratingStories, setRegeneratingStories] = useState(false)

  // Worktree action states
  const [diffDialogOpen, setDiffDialogOpen] = useState(false)
  const [diffInfo, setDiffInfo] = useState<DiffInfo | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])
  const [mergeLoading, setMergeLoading] = useState(false)
  const [detectedWorktreePath, setDetectedWorktreePath] = useState<string | null>(null)

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
  // Use effectiveDataPath for progress data so it reads from worktree if active
  useEffect(() => {
    if (projectPath) {
      setProjectPath(projectPath, prdName)
      loadPrd(effectiveDataPath, prdName)
      loadPrdStatus(effectiveDataPath, prdName)
      loadProgress(effectiveDataPath, prdName)
      loadProgressSummary(effectiveDataPath, prdName)
      loadCommits(projectPath)
      loadConfig(projectPath)
    }
  }, [
    projectPath,
    prdName,
    effectiveDataPath,
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

  // Detect existing worktrees for this PRD (using metadata or branch matching)
  useEffect(() => {
    if (worktreePath) {
      // Already have worktreePath from active execution
      return
    }

    const detectWorktree = async () => {
      try {
        // First, check if PRD metadata has the worktree path stored
        if (prd?.metadata?.lastWorktreePath) {
          // Verify the worktree still exists
          const worktrees = await gitApi.listWorktrees(projectPath)
          const storedPath = prd.metadata.lastWorktreePath
          const exists = worktrees.some((wt) => wt.path === storedPath)
          if (exists) {
            setDetectedWorktreePath(storedPath)
            return
          }
        }

        // Fallback: find worktree by branch matching
        if (prd?.branch) {
          const worktrees = await gitApi.listWorktrees(projectPath)
          const matchingWorktree = worktrees.find((wt) => {
            if (!wt.branch) return false
            const branch = wt.branch.replace('refs/heads/', '')
            return branch === prd.branch || branch.includes(prd.branch)
          })
          if (matchingWorktree) {
            setDetectedWorktreePath(matchingWorktree.path)
            return
          }
        }

        setDetectedWorktreePath(null)
      } catch {
        // Ignore errors - worktree detection is best-effort
        setDetectedWorktreePath(null)
      }
    }

    detectWorktree()
  }, [prd?.branch, prd?.metadata?.lastWorktreePath, projectPath, worktreePath])

  // Effective worktree path: from active execution or detected
  const effectiveWorktreePath = worktreePath || detectedWorktreePath

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

  const handleRegenerateStories = async () => {
    if (!prd) return
    setRegeneratingStories(true)
    try {
      await ralphLoopApi.regenerateStoriesWithAI(
        projectPath,
        prdName,
        effectiveAgent,
        effectiveModel || undefined
      )
      // Reload the PRD to show new stories
      await loadPrd(projectPath, prdName)
      await loadPrdStatus(projectPath, prdName)
      toast.success('Stories regenerated', 'AI extracted user stories from PRD markdown')
    } catch (err) {
      console.error('Failed to regenerate stories:', err)
      toast.error('Failed to regenerate stories', err instanceof Error ? err.message : String(err))
    } finally {
      setRegeneratingStories(false)
    }
  }

  // Handle viewing diff between worktree and main branch
  const handleViewDiff = async () => {
    if (!effectiveWorktreePath || !prd?.branch) return
    setDiffLoading(true)
    try {
      // Get the current branch in the worktree (has commit_id)
      const currentBranch = await gitApi.getCurrentBranch(effectiveWorktreePath)
      // Get main branch info from the main project (has commit_id)
      const branches = await gitApi.listBranches(projectPath)
      const mainBranch = branches.find((b) => b.name === 'main' || b.name === 'master')
      if (!mainBranch) {
        throw new Error('Could not find main/master branch')
      }
      // Get diff using commit IDs (not branch names)
      const diff = await gitApi.getDiff(
        effectiveWorktreePath,
        mainBranch.commit_id,
        currentBranch.commit_id
      )
      setDiffInfo(diff)
      setDiffDialogOpen(true)
    } catch (err) {
      console.error('Failed to get diff:', err)
      toast.error('Failed to get diff', err instanceof Error ? err.message : String(err))
    } finally {
      setDiffLoading(false)
    }
  }

  // Handle merging worktree branch to main
  const handleMergeToMain = async () => {
    if (!effectiveWorktreePath || !prd?.branch) return
    setMergeLoading(true)
    try {
      // Get the current branch in the worktree
      const currentBranch = await gitApi.getCurrentBranch(effectiveWorktreePath)

      // Check for conflicts first
      const conflictFiles = await gitApi.checkMergeConflicts(
        projectPath, // Use main project for merge
        currentBranch.name,
        'main'
      )

      if (conflictFiles.length > 0) {
        // There are conflicts - attempt merge to get conflict details
        const mergeResult = await gitApi.mergeBranch(projectPath, currentBranch.name, 'main')
        if (mergeResult.conflict_files.length > 0) {
          // Get detailed conflict info for AI resolution
          const conflictDetails = await gitApi.getConflictDetails(projectPath)
          setConflicts(conflictDetails)
          setConflictDialogOpen(true)
        }
      } else {
        // No conflicts - perform merge
        const mergeResult = await gitApi.mergeBranch(projectPath, currentBranch.name, 'main')
        if (mergeResult.success) {
          toast.success(
            'Merge successful',
            mergeResult.fast_forward ? 'Fast-forward merge completed' : 'Merge completed'
          )
          // Reload commits to show the merge
          loadCommits(projectPath)
        } else {
          toast.error('Merge failed', mergeResult.message)
        }
      }
    } catch (err) {
      console.error('Failed to merge:', err)
      toast.error('Merge failed', err instanceof Error ? err.message : String(err))
    } finally {
      setMergeLoading(false)
    }
  }

  // Handle completing merge after conflicts resolved
  const handleMergeComplete = async () => {
    try {
      // Complete the merge with a commit
      await gitApi.completeMerge(
        projectPath,
        `Merge branch '${prd?.branch}' into main`,
        'Ralph UI',
        'ralph-ui@local'
      )
      toast.success('Merge completed', 'All conflicts resolved and merged successfully')
      setConflictDialogOpen(false)
      loadCommits(projectPath)
    } catch (err) {
      console.error('Failed to complete merge:', err)
      toast.error('Merge failed', err instanceof Error ? err.message : String(err))
    }
  }

  // Handle opening integrated terminal in worktree directory
  const { createTerminal: createShellTerminal, setPanelMode } = useTerminalStore()

  const handleOpenTerminal = () => {
    if (!effectiveWorktreePath) return
    // Create a new terminal with the worktree path as cwd
    createShellTerminal(effectiveWorktreePath)
    // Ensure the terminal panel is visible
    setPanelMode('panel')
    toast.success('Terminal opened', `Working directory: ${effectiveWorktreePath}`)
  }

  // Handle opening code editor in worktree directory
  const handleOpenInEditor = async () => {
    if (!effectiveWorktreePath) return
    try {
      const { openPath, revealItemInDir } = await import('@tauri-apps/plugin-opener')
      // Try to open in VS Code or Cursor
      // VS Code first - on macOS, openWith can be the app name
      try {
        await openPath(effectiveWorktreePath, 'Visual Studio Code')
        return
      } catch {
        // VS Code not available
      }
      // Try Cursor
      try {
        await openPath(effectiveWorktreePath, 'Cursor')
        return
      } catch {
        // Cursor not available
      }
      // Fallback: open folder in file explorer
      await revealItemInDir(effectiveWorktreePath)
      toast.default('Folder opened', 'Install VS Code or Cursor to open directly in editor')
    } catch (err) {
      console.error('Failed to open editor:', err)
      toast.error('Failed to open editor', 'Could not open worktree in code editor')
    }
  }

  const getStateDisplay = (state: RalphLoopState | null) => {
    // Derive completion state from prdStatus when no active execution
    if (!state) {
      if (prdStatus?.allPass) {
        return { label: 'Completed', color: 'default', icon: CheckCircle2 }
      }
      return { label: 'Not Started', color: 'secondary', icon: Circle }
    }

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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <CardTitle className="text-lg sm:text-xl truncate">{prd.title}</CardTitle>
              <CardDescription className="mt-1 text-xs sm:text-sm">
                Branch: {prd.branch} | {prd.stories.length} stories
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Badge
                variant={stateDisplay.color as 'default' | 'secondary' | 'destructive' | 'outline'}
                className="text-xs"
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                  <ModelSelector
                    id="model"
                    value={effectiveModel || getDefaultModel(effectiveAgent as AgentType)}
                    onChange={(value) =>
                      setConfigOverrides((prev) => ({ ...prev, model: value }))
                    }
                    models={availableModels}
                    loading={modelsLoading}
                    loadingText="Loading models..."
                  />
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

          {/* Worktree Info - shown when worktree exists (active or detected) */}
          {effectiveWorktreePath && (
            <div className="mt-4 p-3 rounded-md border border-dashed border-green-500/50 bg-green-500/5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <GitBranch className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <span className="text-sm font-medium">
                      {worktreePath ? 'Worktree Isolation Active' : 'Worktree Available'}
                    </span>
                    <p
                      className="text-xs text-muted-foreground font-mono truncate"
                      title={effectiveWorktreePath}
                    >
                      {effectiveWorktreePath}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleViewDiff}
                    disabled={diffLoading}
                    title="View changes compared to main branch"
                  >
                    {diffLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <FileDiff className="mr-2 h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">View Diff</span>
                    <span className="sm:hidden">Diff</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleMergeToMain}
                    disabled={mergeLoading || !prdStatus?.allPass}
                    title={
                      prdStatus?.allPass
                        ? 'Merge worktree changes to main branch'
                        : 'Complete all stories before merging'
                    }
                  >
                    {mergeLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <GitMerge className="mr-2 h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Merge to Main</span>
                    <span className="sm:hidden">Merge</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenInEditor}
                    title="Open worktree in code editor"
                  >
                    <Code2 className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Open in Editor</span>
                    <span className="sm:hidden">Editor</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleOpenTerminal}
                    title="Open terminal in worktree directory"
                  >
                    <Terminal className="mr-2 h-4 w-4" />
                    <span className="hidden sm:inline">Terminal</span>
                    <span className="sm:hidden">Term</span>
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Metrics */}
          {executionMetrics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
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
          <div className="flex items-center justify-between border-b px-1">
            <TabsList className="justify-start rounded-none h-auto p-0 border-b-0 bg-transparent">
              <TabsTrigger
                value="stories"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Stories ({prdStatus?.passed ?? 0}/{prdStatus?.total ?? 0})
              </TabsTrigger>
              <TabsTrigger
                value="progress"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Progress ({progressSummary?.learningsCount ?? 0} learnings)
              </TabsTrigger>
              <TabsTrigger
                value="terminal"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <Terminal className="mr-2 h-4 w-4" />
                Terminal
              </TabsTrigger>
              <TabsTrigger
                value="commits"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <GitCommit className="mr-2 h-4 w-4" />
                Commits
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <Clock className="mr-2 h-4 w-4" />
                History ({iterationHistory.length})
              </TabsTrigger>
              <TabsTrigger
                value="agents"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <Users className="mr-2 h-4 w-4" />
                Agents
              </TabsTrigger>
              <TabsTrigger
                value="learnings"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent"
              >
                <BookOpen className="mr-2 h-4 w-4" />
                Learnings
              </TabsTrigger>
            </TabsList>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRegenerateStories}
              disabled={regeneratingStories || isRunning}
              title="Use AI to extract properly formatted user stories from PRD"
            >
              {regeneratingStories ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-4 w-4" />
              )}
              Regenerate
            </Button>
          </div>

          <TabsContent value="stories" className="p-0 mt-0">
            <div className="max-h-[400px] overflow-y-auto">
              <div className="p-3 space-y-2">
                {prd.stories.map((story) => (
                  <StoryCard
                    key={story.id}
                    story={story}
                    isNext={prdStatus?.nextStoryId === story.id}
                    onToggle={() => handleToggleStory(story)}
                  />
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="progress" className="p-0 mt-0">
            <div className="max-h-[400px] overflow-y-auto p-3">
              <ProgressViewer content={progress} />
            </div>
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
            <div className="max-h-[400px] overflow-y-auto">
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
            </div>
          </TabsContent>

          <TabsContent value="history" className="p-0 mt-0">
            <div className="max-h-[400px] overflow-y-auto p-4">
              <IterationHistoryView iterations={iterationHistory} />
            </div>
          </TabsContent>

          <TabsContent value="agents" className="p-0 mt-0">
            <div className="p-4">
              <AssignmentsPanel
                projectPath={projectPath}
                prdName={prdName}
                autoRefresh={!!activeExecutionId}
                refreshInterval={3000}
              />
            </div>
          </TabsContent>

          <TabsContent value="learnings" className="p-0 mt-0">
            <div className="p-4">
              <LearningsPanel
                projectPath={projectPath}
                prdName={prdName}
                stories={prd.stories}
              />
            </div>
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

      {/* Diff Dialog */}
      <Dialog open={diffDialogOpen} onOpenChange={setDiffDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileDiff className="h-5 w-5" />
              Changes in Worktree
            </DialogTitle>
            <DialogDescription>
              Comparing worktree branch to main branch
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0">
            {diffInfo && (
              <div className="space-y-4 pr-4">
                {/* Summary Stats */}
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-medium">
                    {diffInfo.files_changed} file{diffInfo.files_changed !== 1 ? 's' : ''} changed
                  </span>
                  <span className="text-green-600">+{diffInfo.insertions} insertions</span>
                  <span className="text-red-600">-{diffInfo.deletions} deletions</span>
                </div>

                {/* File List */}
                <div className="space-y-2">
                  {diffInfo.files.map((file, index) => (
                    <div
                      key={index}
                      className="p-2 rounded border bg-muted/30 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                            file.status === 'added'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                              : file.status === 'deleted'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                                : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                          }`}
                        >
                          {file.status === 'added' ? 'A' : file.status === 'deleted' ? 'D' : 'M'}
                        </span>
                        <span className="font-mono text-sm truncate">
                          {file.new_path || file.old_path}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs flex-shrink-0">
                        {file.insertions > 0 && (
                          <span className="text-green-600">+{file.insertions}</span>
                        )}
                        {file.deletions > 0 && (
                          <span className="text-red-600">-{file.deletions}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {diffInfo.files.length === 0 && (
                  <div className="text-center text-muted-foreground py-8">
                    No changes detected
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        repoPath={projectPath}
        conflicts={conflicts}
        open={conflictDialogOpen}
        onOpenChange={setConflictDialogOpen}
        onSuccess={handleMergeComplete}
        onCancel={() => {
          setConflictDialogOpen(false)
          setConflicts([])
        }}
      />
    </div>
  )
}
