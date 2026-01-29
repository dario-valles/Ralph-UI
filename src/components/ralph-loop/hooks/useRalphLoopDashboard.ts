import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useRalphLoopStore } from '@/stores/ralphLoopStore'
import { gitApi, type DiffInfo, type ConflictInfo } from '@/lib/api/git-api'
import { toast } from '@/stores/toastStore'
import { useTerminalStore } from '@/stores/terminalStore'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { useAvailableAgents } from '@/hooks/useAvailableAgents'
import { useTreeViewSettings } from '@/hooks/useTreeViewSettings'
import { getDefaultModel } from '@/lib/fallback-models'
import { ralphLoopApi } from '@/lib/backend-api'
import type { RalphStory, RalphLoopState, AgentType } from '@/types'

export interface ConfigOverrides {
  maxIterations?: string
  maxCost?: string
  agent?: string
  model?: string
  runTests?: boolean
  runLint?: boolean
}

export interface UseRalphLoopDashboardProps {
  projectPath: string
  prdName: string
}

export function useRalphLoopDashboard({ projectPath, prdName }: UseRalphLoopDashboardProps) {
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

  // UI State
  const [activeTab, setActiveTab] = useState('stories')
  const [configOpen, setConfigOpen] = useState(false)
  const [regeneratingStories, setRegeneratingStories] = useState(false)
  const [regenerateConfirmOpen, setRegenerateConfirmOpen] = useState(false)

  // Available agents - use shared hook
  const { agents: availableAgents } = useAvailableAgents()

  // Worktree action states
  const [diffDialogOpen, setDiffDialogOpen] = useState(false)
  const [diffInfo, setDiffInfo] = useState<DiffInfo | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [conflictDialogOpen, setConflictDialogOpen] = useState(false)
  const [conflicts, setConflicts] = useState<ConflictInfo[]>([])
  const [mergeLoading, setMergeLoading] = useState(false)
  const [detectedWorktreePath, setDetectedWorktreePath] = useState<string | null>(null)

  // Tree view settings (persists across dashboard reopens)
  const { isTreeVisible, panelHeight, toggleTreeView, setPanelHeight } = useTreeViewSettings()

  // Resizable panel state
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  // Local state for config overrides
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

  // Shorthand for effective values
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
  const savedModel = config?.ralph.model || ''
  const isSavedModelCompatible = !savedModel || availableModels.some((m) => m.id === savedModel)
  const effectiveModel = configOverrides.model ?? (isSavedModelCompatible ? savedModel : '')

  // Determine effective path for data loading
  const effectiveDataPath = worktreePath || projectPath

  // Effective worktree path: from active execution or detected
  const effectiveWorktreePath = worktreePath || detectedWorktreePath

  // Terminal store
  const { createTerminal: createShellTerminal, setPanelMode } = useTerminalStore()

  // State display
  const isRunning = executionState?.type === 'running'

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

  // Load data when project path or prdName changes
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
  useEffect(() => {
    if (worktreePath && prdName) {
      loadPrd(worktreePath, prdName)
      loadPrdStatus(worktreePath, prdName)
      loadProgress(worktreePath, prdName)
      loadProgressSummary(worktreePath, prdName)
      loadCommits(worktreePath)
    }
  }, [worktreePath, prdName, loadPrd, loadPrdStatus, loadProgress, loadProgressSummary, loadCommits])

  // Check for active execution after PRD loads
  useEffect(() => {
    if (prd && !activeExecutionId) {
      checkForActiveExecution()
    }
  }, [prd, activeExecutionId, checkForActiveExecution])

  // Detect existing worktrees for this PRD
  useEffect(() => {
    if (worktreePath) {
      return
    }

    const detectWorktree = async () => {
      try {
        if (prd?.metadata?.lastWorktreePath) {
          const worktrees = await gitApi.listWorktrees(projectPath)
          const storedPath = prd.metadata.lastWorktreePath
          const exists = worktrees.some((wt) => wt.path === storedPath)
          if (exists) {
            setDetectedWorktreePath(storedPath)
            return
          }
        }

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
        setDetectedWorktreePath(null)
      }
    }

    detectWorktree()
  }, [prd?.branch, prd?.metadata?.lastWorktreePath, projectPath, worktreePath])

  // Poll for updates during active execution
  useEffect(() => {
    if (!activeExecutionId) {
      return
    }

    const pollPath = effectiveDataPath

    loadSnapshot()
    loadPrdStatus(pollPath, prdName)
    loadCommits(pollPath)

    const poll = () => {
      const currentState = executionState?.type
      if (
        currentState === 'completed' ||
        currentState === 'failed' ||
        currentState === 'cancelled'
      ) {
        return
      }

      loadSnapshot(true)
      loadPrd(pollPath, prdName, true)
      loadPrdStatus(pollPath, prdName, true)
      loadProgressSummary(pollPath, prdName, true)
    }

    const interval = setInterval(poll, 2000)

    return () => {
      clearInterval(interval)
    }
  }, [
    activeExecutionId,
    loadSnapshot,
    loadPrd,
    loadPrdStatus,
    loadProgressSummary,
    loadCommits,
    effectiveDataPath,
    prdName,
    executionState?.type,
  ])

  // Action handlers
  const handleStartLoop = useCallback(async () => {
    if (!prd) {
      return
    }

    const maxIterations = effectiveMaxIterations ? parseInt(effectiveMaxIterations, 10) : undefined
    const maxCost = effectiveMaxCost ? parseFloat(effectiveMaxCost) : undefined
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
      model: displayedModel,
      prdName,
    }

    try {
      await startLoop(request)
    } catch {
      // Error handled by store
    }
  }, [
    prd,
    effectiveMaxIterations,
    effectiveMaxCost,
    effectiveModel,
    effectiveAgent,
    effectiveRunTests,
    effectiveRunLint,
    projectPath,
    prdName,
    startLoop,
  ])

  const handleSaveConfig = useCallback(async () => {
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
    setConfigOverrides({})
  }, [effectiveMaxIterations, effectiveMaxCost, effectiveAgent, effectiveModel, updateConfig])

  const handleStopLoop = useCallback(async () => {
    await stopLoop()
  }, [stopLoop])

  const handleToggleStory = useCallback(
    async (story: RalphStory) => {
      if (story.passes) {
        await markStoryFailing(story.id)
      } else {
        await markStoryPassing(story.id)
      }
    },
    [markStoryPassing, markStoryFailing]
  )

  const handleRegenerateStories = useCallback(async () => {
    if (!prd) return
    setRegeneratingStories(true)
    try {
      await ralphLoopApi.regenerateStoriesWithAI(
        projectPath,
        prdName,
        effectiveAgent,
        effectiveModel || undefined
      )
      await loadPrd(projectPath, prdName)
      await loadPrdStatus(projectPath, prdName)
      toast.success('Stories regenerated', 'AI extracted user stories from PRD markdown')
    } catch (err) {
      console.error('Failed to regenerate stories:', err)
      toast.error('Failed to regenerate stories', err instanceof Error ? err.message : String(err))
    } finally {
      setRegeneratingStories(false)
    }
  }, [prd, projectPath, prdName, effectiveAgent, effectiveModel, loadPrd, loadPrdStatus])

  const handleViewDiff = useCallback(async () => {
    if (!effectiveWorktreePath || !prd?.branch) return
    setDiffLoading(true)
    try {
      const currentBranch = await gitApi.getCurrentBranch(effectiveWorktreePath)
      const branches = await gitApi.listBranches(projectPath)
      const mainBranch = branches.find((b) => b.name === 'main' || b.name === 'master')
      if (!mainBranch) {
        throw new Error('Could not find main/master branch')
      }
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
  }, [effectiveWorktreePath, prd?.branch, projectPath])

  const handleMergeToMain = useCallback(async () => {
    if (!effectiveWorktreePath || !prd?.branch) return
    setMergeLoading(true)
    try {
      const currentBranch = await gitApi.getCurrentBranch(effectiveWorktreePath)

      const conflictFiles = await gitApi.checkMergeConflicts(
        projectPath,
        currentBranch.name,
        'main'
      )

      if (conflictFiles.length > 0) {
        const mergeResult = await gitApi.mergeBranch(projectPath, currentBranch.name, 'main')
        if (mergeResult.conflict_files.length > 0) {
          const conflictDetails = await gitApi.getConflictDetails(projectPath)
          setConflicts(conflictDetails)
          setConflictDialogOpen(true)
        }
      } else {
        const mergeResult = await gitApi.mergeBranch(projectPath, currentBranch.name, 'main')
        if (mergeResult.success) {
          toast.success(
            'Merge successful',
            mergeResult.fast_forward ? 'Fast-forward merge completed' : 'Merge completed'
          )
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
  }, [effectiveWorktreePath, prd?.branch, projectPath, loadCommits])

  const handleMergeComplete = useCallback(async () => {
    try {
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
  }, [projectPath, prd?.branch, loadCommits])

  const handleOpenTerminal = useCallback(() => {
    if (!effectiveWorktreePath) return
    createShellTerminal(effectiveWorktreePath)
    setPanelMode('panel')
    toast.success('Terminal opened', `Working directory: ${effectiveWorktreePath}`)
  }, [effectiveWorktreePath, createShellTerminal, setPanelMode])

  const handleOpenInEditor = useCallback(async () => {
    if (!effectiveWorktreePath) return
    try {
      await navigator.clipboard.writeText(effectiveWorktreePath)
      toast.success('Path copied', `Open this path in your editor: ${effectiveWorktreePath}`)
    } catch {
      toast.default('Worktree path', effectiveWorktreePath)
    }
  }, [effectiveWorktreePath])

  const getStateDisplay = useCallback(
    (state: RalphLoopState | null) => {
      if (!state) {
        if (prdStatus?.allPass) {
          return { label: 'Completed', color: 'default', type: 'completed' }
        }
        return { label: 'Not Started', color: 'secondary', type: 'idle' }
      }

      switch (state.type) {
        case 'idle':
          return { label: 'Idle', color: 'secondary', type: 'idle' }
        case 'running':
          return { label: `Running (Iteration ${state.iteration})`, color: 'default', type: 'running' }
        case 'retrying':
          return {
            label: `Retrying (Iteration ${state.iteration}, attempt ${state.attempt})`,
            color: 'outline',
            type: 'retrying',
          }
        case 'paused':
          return { label: `Paused (Iteration ${state.iteration})`, color: 'outline', type: 'paused' }
        case 'completed':
          return {
            label: `Completed (${state.totalIterations} iterations)`,
            color: 'default',
            type: 'completed',
          }
        case 'failed':
          return { label: `Failed: ${state.reason}`, color: 'destructive', type: 'failed' }
        case 'cancelled':
          return {
            label: `Cancelled (Iteration ${state.iteration})`,
            color: 'outline',
            type: 'cancelled',
          }
        default:
          return { label: 'Unknown', color: 'secondary', type: 'unknown' }
      }
    },
    [prdStatus?.allPass]
  )

  const stateDisplay = getStateDisplay(executionState)

  return {
    // Store state
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

    // UI state
    activeTab,
    setActiveTab,
    configOpen,
    setConfigOpen,
    regeneratingStories,
    regenerateConfirmOpen,
    setRegenerateConfirmOpen,

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
    configOverrides,
    setConfigOverrides,
    effectiveConfig,
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

    // Props passthrough
    projectPath,
    prdName,
  }
}
