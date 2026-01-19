import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, Play, Eye, RefreshCw } from 'lucide-react'
import { usePRDStore } from '@/stores/prdStore'
import { useSessionStore } from '@/stores/sessionStore'
import {
  initParallelScheduler,
  parallelAddTasks,
  parallelScheduleNext,
  parallelGetSchedulerStats,
  isGitRepository,
  initGitRepository,
  type SchedulerConfig,
} from '@/lib/parallel-api'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { configApi } from '@/lib/config-api'
import type { ExecutionConfig, SchedulingStrategy, AgentType, RalphConfig } from '@/types'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { getModelName } from '@/lib/model-api'

interface PRDExecutionDialogProps {
  prdId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PRDExecutionDialog({ prdId, open, onOpenChange }: PRDExecutionDialogProps) {
  const navigate = useNavigate()
  const { executePRD } = usePRDStore()
  const { fetchSession } = useSessionStore()
  const [executing, setExecuting] = useState(false)
  const [configLoading, setConfigLoading] = useState(true)

  // Git initialization dialog state
  const [showGitInitDialog, setShowGitInitDialog] = useState(false)
  const [gitInitLoading, setGitInitLoading] = useState(false)
  const [pendingSession, setPendingSession] = useState<{ id: string; projectPath: string } | null>(null)

  // Execution configuration state - will be populated from saved config
  const [config, setConfig] = useState<ExecutionConfig>({
    sessionName: undefined,
    agentType: 'claude' as AgentType,
    strategy: 'dependency_first',
    maxParallel: 3,
    maxIterations: 10,
    maxRetries: 3,
    autoCreatePRs: true,
    draftPRs: true,
    runTests: true,
    runLint: true,
    dryRun: false,
    model: undefined,
  })

  // Load saved config when dialog opens
  useEffect(() => {
    if (open) {
      setConfigLoading(true)
      configApi.get()
        .then((savedConfig: RalphConfig) => {
          setConfig((prev) => ({
            ...prev,
            agentType: (savedConfig.execution.agentType as AgentType) || prev.agentType,
            strategy: (savedConfig.execution.strategy as SchedulingStrategy) || prev.strategy,
            maxParallel: savedConfig.execution.maxParallel || prev.maxParallel,
            maxIterations: savedConfig.execution.maxIterations || prev.maxIterations,
            maxRetries: savedConfig.execution.maxRetries || prev.maxRetries,
            model: savedConfig.execution.model, // Don't fallback to prev - let useAvailableModels handle default
            autoCreatePRs: savedConfig.git.autoCreatePrs ?? prev.autoCreatePRs,
            draftPRs: savedConfig.git.draftPrs ?? prev.draftPRs,
            runTests: savedConfig.validation.runTests ?? prev.runTests,
            runLint: savedConfig.validation.runLint ?? prev.runLint,
          }))
        })
        .catch((err) => {
          console.error('Failed to load config:', err)
        })
        .finally(() => {
          setConfigLoading(false)
        })
    }
  }, [open])

  // Load available models dynamically
  const { models, loading: modelsLoading, refresh: refreshModels, defaultModelId } = useAvailableModels(config.agentType)

  // Update model to default when models load - only if no model is set AND config is done loading
  // This ensures saved config model is respected (avoid race condition)
  useEffect(() => {
    if (!configLoading && defaultModelId && !config.model) {
      setConfig((prev) => ({ ...prev, model: defaultModelId }))
    }
  }, [configLoading, defaultModelId, config.model])

  // Update model when agent type changes
  const handleAgentTypeChange = (newAgentType: AgentType) => {
    setConfig({
      ...config,
      agentType: newAgentType,
      // Model will be updated by useEffect when models load for the new agent type
      model: undefined,
    })
  }


  // Helper function to start the scheduler and agents
  const startSchedulerAndAgents = async (sessionId: string, projectPath: string, tasks: typeof useSessionStore.getState extends () => infer S ? S extends { currentSession: infer CS } ? CS extends { tasks: infer T } ? T : never : never : never) => {
    const isParallel = config.strategy !== 'sequential'
    const schedulerConfig: SchedulerConfig = {
      maxParallel: isParallel ? config.maxParallel : 1,
      maxIterations: config.maxIterations,
      maxRetries: config.maxRetries,
      agentType: config.agentType,
      strategy: config.strategy,
      resourceLimits: {
        maxAgents: config.maxParallel,
        maxCpuPerAgent: 50,
        maxMemoryMbPerAgent: 2048,
        maxTotalCpu: 80,
        maxTotalMemoryMb: 8192,
        maxRuntimeSecs: 3600,
      },
      model: config.model,
    }

    console.log('[PRD Execution] Starting agent spawn process...', {
      sessionId,
      projectPath,
      taskCount: tasks?.length ?? 0,
      schedulerConfig,
    })

    // Log task details for debugging
    if (tasks && tasks.length > 0) {
      console.log('[PRD Execution] First 3 tasks:', tasks.slice(0, 3).map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        dependencies: t.dependencies,
      })))
    } else {
      console.warn('[PRD Execution] WARNING: No tasks provided to scheduler!')
    }

    console.log('[PRD Execution] Initializing scheduler...')
    try {
      await initParallelScheduler(schedulerConfig, projectPath)
      console.log('[PRD Execution] Scheduler initialized successfully')
    } catch (initErr) {
      console.error('[PRD Execution] FAILED to initialize scheduler:', initErr)
      throw initErr
    }

    // Add tasks to the scheduler
    console.log('[PRD Execution] Adding', tasks?.length ?? 0, 'tasks to scheduler...')
    try {
      await parallelAddTasks(tasks)
      console.log('[PRD Execution] Tasks added successfully')

      // Get scheduler stats to verify task state
      const stats = await parallelGetSchedulerStats()
      console.log('[PRD Execution] Scheduler stats after adding tasks:', stats)
      if (stats.ready === 0 && stats.pending > 0) {
        console.warn('[PRD Execution] WARNING: All tasks are pending, none are ready! Check task dependencies.')
      }
    } catch (addErr) {
      console.error('[PRD Execution] FAILED to add tasks:', addErr)
      throw addErr
    }

    // Schedule agents (up to maxParallel)
    const maxToSpawn = isParallel ? config.maxParallel : 1
    console.log('[PRD Execution] Attempting to schedule up to', maxToSpawn, 'agents...')

    let spawnedCount = 0
    for (let i = 0; i < maxToSpawn; i++) {
      console.log(`[PRD Execution] Scheduling agent ${i + 1}/${maxToSpawn}...`)
      try {
        const agent = await parallelScheduleNext(sessionId, projectPath)
        if (agent) {
          spawnedCount++
          console.log(`[PRD Execution] Agent ${i + 1} scheduled successfully:`, {
            agentId: agent.id,
            taskId: agent.taskId,
            processId: agent.processId,
            branch: agent.branch,
          })
        } else {
          console.log(`[PRD Execution] parallelScheduleNext returned null - no more tasks ready`)
          break
        }
      } catch (scheduleErr) {
        console.error(`[PRD Execution] FAILED to schedule agent ${i + 1}:`, scheduleErr)
        // Continue trying to schedule other agents
      }
    }

    console.log(`[PRD Execution] Agent spawning complete. Spawned: ${spawnedCount}/${maxToSpawn}`)

    // Get final scheduler stats
    try {
      const finalStats = await parallelGetSchedulerStats()
      console.log('[PRD Execution] Final scheduler stats:', finalStats)
    } catch (statsErr) {
      console.warn('[PRD Execution] Could not get final scheduler stats:', statsErr)
    }

    if (spawnedCount === 0) {
      console.warn('[PRD Execution] WARNING: No agents were spawned! Check backend logs for scheduler state.')
    }
  }

  // Handle git initialization and continue execution
  const handleGitInit = async () => {
    if (!pendingSession) return

    setGitInitLoading(true)
    try {
      await initGitRepository(pendingSession.projectPath)
      console.log('[PRD Execution] Git repository initialized')

      // Get session from store to access tasks
      const session = useSessionStore.getState().currentSession
      if (session?.tasks && session.tasks.length > 0) {
        await startSchedulerAndAgents(pendingSession.id, pendingSession.projectPath, session.tasks)
      }

      setShowGitInitDialog(false)
      setPendingSession(null)
      onOpenChange(false)
      navigate('/agents')
    } catch (err) {
      console.error('[PRD Execution] Failed to initialize git:', err)
    } finally {
      setGitInitLoading(false)
    }
  }

  // Handle skipping git init - still spawn agents without git worktrees
  const handleSkipGitInit = async () => {
    if (!pendingSession) {
      setShowGitInitDialog(false)
      onOpenChange(false)
      navigate('/agents')
      return
    }

    setGitInitLoading(true)
    try {
      // Get session from store to access tasks
      const session = useSessionStore.getState().currentSession
      if (session?.tasks && session.tasks.length > 0) {
        // Spawn agents anyway - scheduler will use project path directly without git worktrees
        console.log('[PRD Execution] Skipping git init, spawning agents without worktrees...')
        await startSchedulerAndAgents(pendingSession.id, pendingSession.projectPath, session.tasks)
      }
    } catch (err) {
      console.error('[PRD Execution] Failed to start agents without git:', err)
    } finally {
      setGitInitLoading(false)
      setShowGitInitDialog(false)
      setPendingSession(null)
      onOpenChange(false)
      navigate('/agents')
    }
  }

  const handleExecute = async () => {
    setExecuting(true)
    try {
      console.log('[PRD Execution] Step 1: Executing PRD...', { prdId, config })
      // 1. Execute PRD - creates session and tasks
      const sessionId = await executePRD(prdId, config)
      console.log('[PRD Execution] Step 1 complete: Session created', { sessionId })

      // 2. Fetch the created session with tasks (this sets currentSession in the store)
      console.log('[PRD Execution] Step 2: Fetching session...')
      await fetchSession(sessionId)

      // Get the session from the store
      const session = useSessionStore.getState().currentSession
      console.log('[PRD Execution] Step 2 complete: Session fetched', {
        sessionId: session?.id,
        taskCount: session?.tasks?.length,
        projectPath: session?.projectPath,
      })

      if (!session) {
        throw new Error('Failed to fetch created session')
      }

      // 3. If not dry-run, initialize scheduler and start agents
      console.log('[PRD Execution] Step 3: Checking if should start agents...', {
        dryRun: config.dryRun,
        hasTasks: session.tasks && session.tasks.length > 0,
      })

      if (!config.dryRun && session.tasks && session.tasks.length > 0) {
        // Check if path is a git repository FIRST (outside the scheduler try-catch)
        // If this fails or returns false, we need to show the git init dialog
        let isGitRepo = false
        try {
          isGitRepo = await isGitRepository(session.projectPath)
          console.log('[PRD Execution] Git repository check:', { isGitRepo, projectPath: session.projectPath })
        } catch (gitCheckErr) {
          console.error('[PRD Execution] Failed to check git repository, treating as non-git:', gitCheckErr)
          // Treat errors as "not a git repo"
          isGitRepo = false
        }

        if (!isGitRepo) {
          // Pause execution and show dialog
          console.log('[PRD Execution] Project is not a git repository, prompting user...')
          setPendingSession({ id: sessionId, projectPath: session.projectPath })
          setShowGitInitDialog(true)
          setExecuting(false)
          return // Don't close dialog or navigate yet
        }

        try {
          await startSchedulerAndAgents(sessionId, session.projectPath, session.tasks)
        } catch (schedulerErr) {
          // Log scheduler errors but don't fail the whole execution
          // The session and tasks were created successfully
          console.error('[PRD Execution] Failed to start scheduler/agents:', schedulerErr)
        }
      } else {
        console.log('[PRD Execution] Skipping agent spawn (dry-run or no tasks)')
      }

      onOpenChange(false)

      // Navigate to agent monitor
      console.log('[PRD Execution] Navigating to agents page...')
      navigate('/agents')
    } catch (err) {
      console.error('[PRD Execution] Failed to execute PRD:', err)
    } finally {
      setExecuting(false)
    }
  }

  return (
    <>
    {/* Main dialog - hidden when git init dialog is showing */}
    <Dialog open={open && !showGitInitDialog} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Execute PRD</DialogTitle>
          <DialogDescription>
            Configure how the PRD will be executed. Tasks will be created and agents will be launched
            automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4 overflow-y-auto flex-1">
          {/* Agent Type and Model */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agent-type">Agent Type</Label>
              <Select
                id="agent-type"
                value={config.agentType}
                onChange={(e) => handleAgentTypeChange(e.target.value as AgentType)}
              >
                <option value="claude">Claude Code</option>
                <option value="opencode">OpenCode</option>
                <option value="cursor">Cursor</option>
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
                value={config.model || ''}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                disabled={modelsLoading}
              >
                {modelsLoading ? (
                  <option>Loading models...</option>
                ) : (
                  models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))
                )}
              </Select>
            </div>
          </div>

          {/* Execution Strategy */}
          <div className="space-y-2">
            <Label htmlFor="strategy">Execution Strategy</Label>
            <Select
              id="strategy"
              value={config.strategy}
              onChange={(e) => setConfig({ ...config, strategy: e.target.value as SchedulingStrategy })}
            >
              <option value="sequential">Sequential (One at a time)</option>
              <option value="dependency_first">Dependency First (Parallel)</option>
              <option value="priority">Priority Order (Parallel)</option>
              <option value="fifo">FIFO (Parallel)</option>
              <option value="cost_first">Highest Cost First (Parallel)</option>
            </Select>
          </div>

          {/* Max Parallel (only for parallel strategies) */}
          {config.strategy !== 'sequential' && (
            <div className="space-y-2">
              <Label>Max Parallel Agents: {config.maxParallel}</Label>
              <Slider
                value={[config.maxParallel]}
                onValueChange={(value) => setConfig({ ...config, maxParallel: value[0] })}
                min={1}
                max={10}
                step={1}
                className="w-full"
              />
            </div>
          )}

          {/* Limits */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="max-iterations">Max Iterations per Task</Label>
              <Select
                id="max-iterations"
                value={config.maxIterations.toString()}
                onChange={(e) =>
                  setConfig({ ...config, maxIterations: parseInt(e.target.value) })
                }
              >
                <option value="5">5</option>
                <option value="10">10</option>
                <option value="15">15</option>
                <option value="20">20</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="max-retries">Max Retries per Task</Label>
              <Select
                id="max-retries"
                value={config.maxRetries.toString()}
                onChange={(e) => setConfig({ ...config, maxRetries: parseInt(e.target.value) })}
              >
                <option value="1">1</option>
                <option value="3">3</option>
                <option value="5">5</option>
              </Select>
            </div>
          </div>

          {/* Git Configuration */}
          <div className="space-y-3">
            <Label>Git Configuration</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={config.autoCreatePRs}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, autoCreatePRs: checked as boolean })
                  }
                />
                <span className="text-sm">Auto-create PRs when tasks complete</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={config.draftPRs}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, draftPRs: checked as boolean })
                  }
                  disabled={!config.autoCreatePRs}
                />
                <span className="text-sm">Create draft PRs</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={config.runTests}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, runTests: checked as boolean })
                  }
                />
                <span className="text-sm">Run tests before committing</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={config.runLint}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, runLint: checked as boolean })
                  }
                />
                <span className="text-sm">Run linter before committing</span>
              </label>
            </div>
          </div>

          {/* Dry-run Mode */}
          <div className="rounded-md border border-dashed border-yellow-500/50 bg-yellow-500/5 p-4">
            <label className="flex items-center gap-3">
              <Checkbox
                checked={config.dryRun}
                onCheckedChange={(checked) =>
                  setConfig({ ...config, dryRun: checked as boolean })
                }
              />
              <div>
                <span className="text-sm font-medium flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Dry-run Mode
                </span>
                <p className="text-xs text-muted-foreground mt-1">
                  Preview what would happen without actually spawning agents or creating branches.
                  Useful for validating your PRD and configuration before execution.
                </p>
              </div>
            </label>
          </div>

          {/* Preview */}
          <div className="rounded-md bg-muted p-4">
            <p className="text-sm font-medium">Summary:</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>• Agent: {config.agentType}</li>
              <li>• Model: {getModelName(models, config.model || '')}</li>
              <li>• Strategy: {config.strategy === 'sequential' ? 'Sequential' :
                config.strategy === 'dependency_first' ? 'Dependency First' :
                config.strategy === 'priority' ? 'Priority Order' :
                config.strategy === 'fifo' ? 'FIFO' : 'Highest Cost First'}</li>
              {config.strategy !== 'sequential' && (
                <li>• Max parallel agents: {config.maxParallel}</li>
              )}
              <li>• Max iterations: {config.maxIterations} per task</li>
              {config.dryRun ? (
                <>
                  <li className="text-yellow-600">• DRY-RUN: No agents will be spawned</li>
                  <li className="text-yellow-600">• DRY-RUN: No branches will be created</li>
                </>
              ) : (
                <>
                  <li>• Tasks will be created automatically from PRD</li>
                  <li>• Agents will launch immediately after creation</li>
                </>
              )}
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={executing || configLoading}>
            Cancel
          </Button>
          <Button onClick={handleExecute} disabled={executing || configLoading}>
            {configLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading...
              </>
            ) : executing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {config.dryRun ? 'Previewing...' : 'Starting...'}
              </>
            ) : config.dryRun ? (
              <>
                <Eye className="mr-2 h-4 w-4" />
                Preview Execution
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Execution
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Git Initialization Dialog - shown when main dialog is hidden */}
    <ConfirmDialog
      open={showGitInitDialog}
      onOpenChange={(open) => {
        if (!open) handleSkipGitInit()
      }}
      title="Git Repository Required"
      description="This project directory is not a git repository. Agent execution requires git for branch and worktree management. Would you like to initialize a git repository? If you skip, the session and tasks will be created but agents will not be spawned."
      confirmLabel="Initialize Git"
      cancelLabel="Skip"
      variant="default"
      loading={gitInitLoading}
      onConfirm={handleGitInit}
      onCancel={handleSkipGitInit}
    />
  </>
  )
}
