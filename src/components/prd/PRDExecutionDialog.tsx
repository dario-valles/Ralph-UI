import { useState, useEffect, useMemo } from 'react'
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
import { Loader2, Play, Eye, RefreshCw, FolderOpen } from 'lucide-react'
import { usePRDStore } from '@/stores/prdStore'
import { useSessionStore } from '@/stores/sessionStore'
import { getSchedulingStrategyLabel } from '@/lib/parallel-api'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { SchedulingStrategy, AgentType, Session } from '@/types'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { usePRDExecutionConfig } from '@/hooks/usePRDExecutionConfig'
import { useSchedulerExecution } from '@/hooks/useSchedulerExecution'
import { getModelName } from '@/lib/model-api'

interface PRDExecutionDialogProps {
  prdId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PRDExecutionDialog({
  prdId,
  open,
  onOpenChange,
}: PRDExecutionDialogProps): React.JSX.Element {
  const navigate = useNavigate()
  const { executePRD, currentPRD, prds } = usePRDStore()
  const { fetchSession, sessions, fetchSessions } = useSessionStore()
  const [executing, setExecuting] = useState(false)

  // Get the PRD being executed
  const prd = currentPRD?.id === prdId ? currentPRD : prds.find((p) => p.id === prdId)

  // Find existing active session for this project
  const existingActiveSession: Session | undefined = useMemo(() => {
    if (!prd?.projectPath) return undefined
    return sessions.find((s) => s.projectPath === prd.projectPath && s.status === 'active')
  }, [sessions, prd?.projectPath])

  // Fetch sessions when dialog opens
  useEffect(() => {
    if (open) {
      fetchSessions()
    }
  }, [open, fetchSessions])

  // Load available models dynamically - need agentType first
  const [initialAgentType] = useState<AgentType>('claude')
  const {
    models,
    loading: modelsLoading,
    refresh: refreshModels,
    defaultModelId,
  } = useAvailableModels(initialAgentType)

  // Use the config hook
  const { config, setConfig, configLoading, handleAgentTypeChange } = usePRDExecutionConfig(
    open,
    defaultModelId
  )

  // Update models when agent type changes
  const {
    models: currentModels,
    loading: currentModelsLoading,
    refresh: currentRefreshModels,
  } = useAvailableModels(config.agentType)

  // Use scheduler execution hook
  const { showGitInitDialog, gitInitLoading, handleGitInit, handleSkipGitInit, checkGitAndExecute } =
    useSchedulerExecution(config, () => onOpenChange(false))

  async function handleExecute(): Promise<void> {
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
        const shouldContinue = await checkGitAndExecute(
          sessionId,
          session.projectPath,
          session.tasks
        )
        if (!shouldContinue) {
          // Git dialog was shown, don't close or navigate yet
          setExecuting(false)
          return
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

  // Use current models if available, otherwise fall back to initial
  const displayModels = currentModels.length > 0 ? currentModels : models
  const displayModelsLoading = currentModelsLoading || modelsLoading
  const displayRefreshModels = currentModels.length > 0 ? currentRefreshModels : refreshModels

  return (
    <>
      {/* Main dialog - hidden when git init dialog is showing */}
      <Dialog open={open && !showGitInitDialog} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Execute PRD</DialogTitle>
            <DialogDescription>
              Configure how the PRD will be executed. Tasks will be created and agents will be
              launched automatically.
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
                    onClick={displayRefreshModels}
                    disabled={displayModelsLoading}
                    className="h-6 w-6 p-0"
                  >
                    <RefreshCw className={`h-3 w-3 ${displayModelsLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
                <Select
                  id="model"
                  value={config.model || ''}
                  onChange={(e) => setConfig({ ...config, model: e.target.value })}
                  disabled={displayModelsLoading}
                >
                  {displayModelsLoading ? (
                    <option>Loading models...</option>
                  ) : (
                    displayModels.map((m) => (
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
                onChange={(e) =>
                  setConfig({ ...config, strategy: e.target.value as SchedulingStrategy })
                }
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

            {/* Reuse Session Option - only show if an active session exists */}
            {existingActiveSession && (
              <div className="rounded-md border border-dashed border-blue-500/50 bg-blue-500/5 p-4">
                <label className="flex items-center gap-3">
                  <Checkbox
                    checked={config.reuseSession}
                    onCheckedChange={(checked) =>
                      setConfig({ ...config, reuseSession: checked as boolean })
                    }
                  />
                  <div className="flex-1">
                    <span className="text-sm font-medium flex items-center gap-2">
                      <FolderOpen className="h-4 w-4" />
                      Use Existing Session
                    </span>
                    <p className="text-xs text-muted-foreground mt-1">
                      Add tasks to the existing active session &quot;{existingActiveSession.name}
                      &quot; instead of creating a new one. This is useful for iterating on the same
                      PRD without fragmenting your work across multiple sessions.
                    </p>
                  </div>
                </label>
              </div>
            )}

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
                <li>• Model: {getModelName(displayModels, config.model || '')}</li>
                <li>• Strategy: {getSchedulingStrategyLabel(config.strategy)}</li>
                {config.strategy !== 'sequential' && (
                  <li>• Max parallel agents: {config.maxParallel}</li>
                )}
                <li>• Max iterations: {config.maxIterations} per task</li>
                {config.dryRun ? (
                  <>
                    <li className="text-yellow-600">• DRY-RUN: No agents will be spawned</li>
                    <li className="text-yellow-600">• DRY-RUN: No branches will be created</li>
                  </>
                ) : config.reuseSession && existingActiveSession ? (
                  <>
                    <li className="text-blue-600">
                      • Reusing session: {existingActiveSession.name}
                    </li>
                    <li>• Tasks will be added to the existing session</li>
                    <li>• Agents will launch immediately after task creation</li>
                  </>
                ) : (
                  <>
                    <li>• A new session will be created</li>
                    <li>• Tasks will be created automatically from PRD</li>
                    <li>• Agents will launch immediately after creation</li>
                  </>
                )}
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={executing || configLoading}
            >
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
        onOpenChange={(dialogOpen) => {
          if (!dialogOpen) handleSkipGitInit()
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
