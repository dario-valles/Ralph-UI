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
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2, RefreshCw, Repeat, GitBranch } from 'lucide-react'
import { usePRDStore } from '@/stores/prdStore'
import { ralphLoopApi } from '@/lib/tauri-api'
import type { AgentType } from '@/types'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { usePRDExecutionConfig } from '@/hooks/usePRDExecutionConfig'
import { getModelName } from '@/lib/model-api'
import { Input } from '@/components/ui/input'

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
  const { currentPRD, prds } = usePRDStore()
  const [executing, setExecuting] = useState(false)
  const [useWorktree, setUseWorktree] = useState(true) // Default to true for isolation
  const [maxCost, setMaxCost] = useState<string>('') // Optional cost limit

  // Get the PRD being executed
  const prd = currentPRD?.id === prdId ? currentPRD : prds.find((p) => p.id === prdId)

  // Load available models dynamically - need agentType first
  const [initialAgentType] = useState<AgentType>('claude')
  const {
    models,
    loading: modelsLoading,
    refresh: refreshModels,
    defaultModelId,
  } = useAvailableModels(initialAgentType)

  // Use the config hook
  const { config, setConfig, handleAgentTypeChange } = usePRDExecutionConfig(
    open,
    defaultModelId
  )

  // Update models when agent type changes
  const {
    models: currentModels,
    loading: currentModelsLoading,
    refresh: currentRefreshModels,
  } = useAvailableModels(config.agentType)

  async function handleExecute(): Promise<void> {
    if (!prd?.projectPath) {
      console.error('[Ralph Loop] No project path available')
      return
    }

    setExecuting(true)
    try {
      console.log('[Ralph Loop] Converting PRD to Ralph format...', { prdId, config })

      // Get branch name from config or use default
      const branch = `ralph-${prd.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)}`

      // Convert PRD to Ralph format and write to .ralph directory
      // Pass the dialog settings to initialize .ralph/config.yaml
      await ralphLoopApi.convertPrdToRalph({
        prdId,
        branch,
        agentType: config.agentType,
        model: config.model,
        maxIterations: config.maxIterations,
        maxCost: maxCost ? parseFloat(maxCost) : undefined,
        runTests: config.runTests,
        runLint: config.runLint,
        useWorktree,
      })
      console.log('[Ralph Loop] PRD converted successfully with config:', {
        agentType: config.agentType,
        model: config.model,
        maxIterations: config.maxIterations,
        useWorktree,
      })

      onOpenChange(false)

      // Navigate to Ralph Loop page with the project path
      console.log('[Ralph Loop] Navigating to Ralph Loop page...')
      navigate(`/ralph-loop?project=${encodeURIComponent(prd.projectPath)}`)
    } catch (err) {
      console.error('[PRD Execution] Failed:', err)
    } finally {
      setExecuting(false)
    }
  }

  // Use current models if available, otherwise fall back to initial
  const displayModels = currentModels.length > 0 ? currentModels : models
  const displayModelsLoading = currentModelsLoading || modelsLoading
  const displayRefreshModels = currentModels.length > 0 ? currentRefreshModels : refreshModels

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Execute PRD</DialogTitle>
          <DialogDescription>
            Configure how the PRD will be executed using the Ralph Loop technique.
            Progress persists in files with a fresh agent each iteration.
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

          {/* Max Iterations and Max Cost */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="max-iterations">Max Iterations</Label>
              <Select
                id="max-iterations"
                value={config.maxIterations.toString()}
                onChange={(e) =>
                  setConfig({ ...config, maxIterations: parseInt(e.target.value) })
                }
              >
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Total iterations before the loop stops (safety limit)
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
                value={maxCost}
                onChange={(e) => setMaxCost(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Stop when API costs exceed this limit
              </p>
            </div>
          </div>

          {/* Worktree Isolation Option */}
          <div className="rounded-md border border-dashed border-green-500/50 bg-green-500/5 p-4">
            <label className="flex items-center gap-3">
              <Checkbox
                checked={useWorktree}
                onCheckedChange={(checked) => setUseWorktree(checked as boolean)}
              />
              <div className="flex-1">
                <span className="text-sm font-medium flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Use Worktree Isolation
                  <span className="text-xs text-muted-foreground font-normal">(Recommended)</span>
                </span>
                <p className="text-xs text-muted-foreground mt-1">
                  Work happens in an isolated git worktree, keeping the main branch clean.
                  The worktree is preserved after completion for review.
                </p>
              </div>
            </label>
          </div>

          {/* Quality Gates */}
          <div className="space-y-3">
            <Label>Quality Gates</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={config.runTests}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, runTests: checked as boolean })
                  }
                />
                <span className="text-sm">Run tests before marking tasks complete</span>
              </label>
              <label className="flex items-center gap-2">
                <Checkbox
                  checked={config.runLint}
                  onCheckedChange={(checked) =>
                    setConfig({ ...config, runLint: checked as boolean })
                  }
                />
                <span className="text-sm">Run linter before marking tasks complete</span>
              </label>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-md bg-muted p-4">
            <p className="text-sm font-medium">Summary:</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>• Agent: {config.agentType}</li>
              <li>• Model: {getModelName(displayModels, config.model || '')}</li>
              <li>• Max iterations: {config.maxIterations}</li>
              <li>• Max cost: {maxCost ? `$${maxCost}` : 'no limit'}</li>
              <li>• Worktree isolation: {useWorktree ? 'enabled' : 'disabled'}</li>
              <li>• Quality gates: {[config.runTests && 'tests', config.runLint && 'lint'].filter(Boolean).join(', ') || 'none'}</li>
              <li className="text-green-600">• PRD will be converted to .ralph/prd.json</li>
              <li className="text-green-600">• Each iteration spawns a fresh agent</li>
            </ul>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={executing}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExecute}
            disabled={executing || !prd?.projectPath}
            title={!prd?.projectPath ? 'PRD must have a project path' : undefined}
          >
            {executing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Converting...
              </>
            ) : (
              <>
                <Repeat className="mr-2 h-4 w-4" />
                Start Ralph Loop
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
