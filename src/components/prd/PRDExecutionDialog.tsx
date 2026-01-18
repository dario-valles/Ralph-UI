import { useState } from 'react'
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
import { Loader2, Play, Eye } from 'lucide-react'
import { usePRDStore } from '@/stores/prdStore'
import { useSessionStore } from '@/stores/sessionStore'
import {
  initParallelScheduler,
  parallelAddTasks,
  parallelScheduleNext,
  type SchedulerConfig,
} from '@/lib/parallel-api'
import type { ExecutionConfig, AgentType } from '@/types'

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

  // Execution configuration state
  const [config, setConfig] = useState<ExecutionConfig>({
    sessionName: undefined,
    agentType: 'claude' as AgentType,
    executionMode: 'parallel',
    maxParallel: 3,
    maxIterations: 10,
    maxRetries: 3,
    autoCreatePRs: true,
    draftPRs: true,
    runTests: true,
    runLint: true,
    dryRun: false,
  })

  const handleExecute = async () => {
    setExecuting(true)
    try {
      // 1. Execute PRD - creates session and tasks
      const sessionId = await executePRD(prdId, config)

      // 2. Fetch the created session with tasks (this sets currentSession in the store)
      await fetchSession(sessionId)

      // Get the session from the store
      const session = useSessionStore.getState().currentSession
      if (!session) {
        throw new Error('Failed to fetch created session')
      }

      // 3. If not dry-run, initialize scheduler and start agents
      if (!config.dryRun && session.tasks && session.tasks.length > 0) {
        try {
          // Initialize the parallel scheduler
          const schedulerConfig: SchedulerConfig = {
            maxParallel: config.executionMode === 'parallel' ? config.maxParallel : 1,
            maxIterations: config.maxIterations,
            maxRetries: config.maxRetries,
            agentType: config.agentType,
            strategy: 'dependency_first',
            resourceLimits: {
              maxAgents: config.maxParallel,
              maxCpuPerAgent: 50,
              maxMemoryMbPerAgent: 2048,
              maxTotalCpu: 80,
              maxTotalMemoryMb: 8192,
              maxRuntimeSecs: 3600,
            },
          }

          await initParallelScheduler(schedulerConfig, session.projectPath)

          // Add tasks to the scheduler
          await parallelAddTasks(session.tasks)

          // Schedule agents (up to maxParallel)
          const maxToSpawn = config.executionMode === 'parallel' ? config.maxParallel : 1
          for (let i = 0; i < maxToSpawn; i++) {
            const agent = await parallelScheduleNext(sessionId, session.projectPath)
            if (!agent) break // No more tasks to schedule
          }
        } catch (schedulerErr) {
          // Log scheduler errors but don't fail the whole execution
          // The session and tasks were created successfully
          console.warn('Failed to start scheduler/agents:', schedulerErr)
        }
      }

      onOpenChange(false)

      // Navigate to agent monitor
      navigate('/agents')
    } catch (err) {
      console.error('Failed to execute PRD:', err)
    } finally {
      setExecuting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Execute PRD</DialogTitle>
          <DialogDescription>
            Configure how the PRD will be executed. Tasks will be created and agents will be launched
            automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Agent Type */}
          <div className="space-y-2">
            <Label htmlFor="agent-type">Agent Type</Label>
            <Select
              id="agent-type"
              value={config.agentType}
              onChange={(e) => setConfig({ ...config, agentType: e.target.value as AgentType })}
            >
              <option value="claude">Claude Code</option>
              <option value="opencode">OpenCode</option>
              <option value="cursor">Cursor</option>
              <option value="codex">Codex CLI</option>
            </Select>
          </div>

          {/* Execution Mode */}
          <div className="space-y-2">
            <Label>Execution Mode</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="execution-mode"
                  value="sequential"
                  checked={config.executionMode === 'sequential'}
                  onChange={() => setConfig({ ...config, executionMode: 'sequential' })}
                />
                <span>Sequential (One task at a time)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="execution-mode"
                  value="parallel"
                  checked={config.executionMode === 'parallel'}
                  onChange={() => setConfig({ ...config, executionMode: 'parallel' })}
                />
                <span>Parallel (Multiple agents)</span>
              </label>
            </div>
          </div>

          {/* Max Parallel (only for parallel mode) */}
          {config.executionMode === 'parallel' && (
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
              <li>• Mode: {config.executionMode}</li>
              {config.executionMode === 'parallel' && (
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
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={executing}>
            Cancel
          </Button>
          <Button onClick={handleExecute} disabled={executing}>
            {executing ? (
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
  )
}
