import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  GitBranch,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { prdWorkflowApi } from '@/lib/api/prd-workflow-api'
import type { DependencyValidationResult, Requirement } from '@/types/prd-workflow'

interface ParallelModeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  onOptimize: () => void
  projectPath: string | null
  workflowId: string | null
  requirements: Record<string, Requirement>
}

type ReadinessState =
  | { status: 'loading' }
  | { status: 'no_requirements' }
  | { status: 'no_independent'; message: string }
  | { status: 'single_chain'; message: string }
  | { status: 'circular'; cyclePath: string[] }
  | { status: 'ready'; readyCount: number; blockedCount: number; maxDepth: number; waves: string[][] }

/**
 * Group requirements into execution waves based on dependency depth.
 * Wave 1 = root nodes (no dependencies), Wave 2 = depends only on Wave 1, etc.
 */
function computeWaves(
  requirements: Record<string, Requirement>,
  rootNodes: string[]
): string[][] {
  if (rootNodes.length === 0) return []

  const waves: string[][] = []
  const assigned = new Set<string>()

  // Wave 1: root nodes
  waves.push(rootNodes)
  rootNodes.forEach((id) => assigned.add(id))

  // Subsequent waves: nodes whose all dependencies are in previous waves
  let changed = true
  while (changed) {
    changed = false
    const nextWave: string[] = []

    for (const [id, req] of Object.entries(requirements)) {
      if (assigned.has(id)) continue

      // Check if all dependencies are assigned to previous waves
      const allDepsAssigned = req.dependsOn.every((depId) => assigned.has(depId))
      if (allDepsAssigned) {
        nextWave.push(id)
        changed = true
      }
    }

    if (nextWave.length > 0) {
      waves.push(nextWave)
      nextWave.forEach((id) => assigned.add(id))
    }
  }

  return waves
}

export function ParallelModeDialog({
  open,
  onOpenChange,
  onConfirm,
  onOptimize,
  projectPath,
  workflowId,
  requirements,
}: ParallelModeDialogProps): React.JSX.Element {
  const [readinessState, setReadinessState] = useState<ReadinessState>({ status: 'loading' })
  const [showWaves, setShowWaves] = useState(false)

  // Analyze readiness when dialog opens
  useEffect(() => {
    if (!open) return

    async function analyzeReadiness() {
      setReadinessState({ status: 'loading' })

      // Check if there are any requirements
      const reqCount = Object.keys(requirements).length
      if (reqCount === 0) {
        setReadinessState({ status: 'no_requirements' })
        return
      }

      // If we have project/workflow, call the API for dependency validation
      if (projectPath && workflowId) {
        try {
          const result: DependencyValidationResult = await prdWorkflowApi.validateDependencies(
            projectPath,
            workflowId
          )

          if (!result.valid && result.error) {
            // Check for circular dependency
            if (result.error.toLowerCase().includes('circular')) {
              // Extract cycle path from error message if available
              const cyclePath = result.error.match(/cycle: (.+)/i)?.[1]?.split(' -> ') || []
              setReadinessState({ status: 'circular', cyclePath })
              return
            }
          }

          if (result.stats) {
            const { rootNodes, maxDepth, totalNodes } = result.stats
            const readyCount = rootNodes.length
            const blockedCount = totalNodes - readyCount

            // No independent tasks (no root nodes)
            if (readyCount === 0) {
              setReadinessState({
                status: 'no_independent',
                message: 'All tasks have dependencies - none can start independently',
              })
              return
            }

            // Single chain (one root, all others blocked in sequence)
            if (readyCount === 1 && maxDepth >= totalNodes - 1) {
              setReadinessState({
                status: 'single_chain',
                message: 'All tasks are in a single sequential chain',
              })
              return
            }

            // Ready for parallel execution
            const waves = computeWaves(requirements, rootNodes)
            setReadinessState({
              status: 'ready',
              readyCount,
              blockedCount,
              maxDepth,
              waves,
            })
          } else {
            // No stats but valid - compute locally
            const rootNodes = Object.entries(requirements)
              .filter(([, req]) => req.dependsOn.length === 0)
              .map(([id]) => id)

            const readyCount = rootNodes.length
            const blockedCount = reqCount - readyCount

            if (readyCount === 0) {
              setReadinessState({
                status: 'no_independent',
                message: 'All tasks have dependencies',
              })
              return
            }

            const waves = computeWaves(requirements, rootNodes)
            setReadinessState({
              status: 'ready',
              readyCount,
              blockedCount,
              maxDepth: waves.length,
              waves,
            })
          }
        } catch (err) {
          console.error('[ParallelModeDialog] Failed to validate dependencies:', err)
          // Fall back to local analysis
          analyzeLocally()
        }
      } else {
        // No workflow - analyze locally
        analyzeLocally()
      }
    }

    function analyzeLocally() {
      const reqCount = Object.keys(requirements).length
      const rootNodes = Object.entries(requirements)
        .filter(([, req]) => req.dependsOn.length === 0)
        .map(([id]) => id)

      const readyCount = rootNodes.length
      const blockedCount = reqCount - readyCount

      if (readyCount === 0) {
        setReadinessState({
          status: 'no_independent',
          message: 'All tasks have dependencies',
        })
        return
      }

      const waves = computeWaves(requirements, rootNodes)
      setReadinessState({
        status: 'ready',
        readyCount,
        blockedCount,
        maxDepth: waves.length,
        waves,
      })
    }

    analyzeReadiness()
  }, [open, projectPath, workflowId, requirements])

  // Determine if Enable Parallel should be enabled
  const canEnableParallel = readinessState.status === 'ready'

  // Wave colors for visualization
  const waveColors = ['bg-green-500', 'bg-blue-500', 'bg-purple-500', 'bg-orange-500', 'bg-pink-500']

  // Get requirement title by ID
  const getReqTitle = (id: string) => requirements[id]?.title || id

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Enable Parallel Execution
            <Badge
              variant="outline"
              className="ml-1 text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700"
            >
              Beta
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Parallel mode executes independent requirements simultaneously using multiple agents in
            separate git worktrees.
          </DialogDescription>
        </DialogHeader>

        {/* What is Parallel Execution */}
        <div className="space-y-3 py-2">
          <div className="rounded-md border border-border/50 bg-muted/30 p-3 space-y-2">
            <p className="text-sm font-medium">What happens in Parallel mode:</p>
            <ul className="text-sm text-muted-foreground space-y-1 ml-4 list-disc">
              <li>Tasks with no dependencies run simultaneously</li>
              <li>Each parallel task runs in its own git worktree</li>
              <li>Dependent tasks wait for their dependencies to complete</li>
              <li>Changes are merged back to the main branch on completion</li>
            </ul>
          </div>

          {/* Readiness Summary */}
          <div className="rounded-md border border-border/50 p-3 space-y-3">
            <p className="text-sm font-medium">Readiness Analysis</p>

            {readinessState.status === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing dependencies...
              </div>
            )}

            {readinessState.status === 'no_requirements' && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">Add requirements first</span>
              </div>
            )}

            {readinessState.status === 'no_independent' && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{readinessState.message}</span>
              </div>
            )}

            {readinessState.status === 'single_chain' && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm">{readinessState.message}</span>
              </div>
            )}

            {readinessState.status === 'circular' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-sm">Circular dependency detected</span>
                </div>
                {readinessState.cyclePath.length > 0 && (
                  <p className="text-xs text-muted-foreground ml-6">
                    Cycle: {readinessState.cyclePath.join(' → ')}
                  </p>
                )}
              </div>
            )}

            {readinessState.status === 'ready' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm font-medium">Ready for parallel execution</span>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md bg-green-500/10 border border-green-500/30 p-2 text-center">
                    <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                      {readinessState.readyCount}
                    </div>
                    <div className="text-xs text-muted-foreground">Can start immediately</div>
                  </div>
                  <div className="rounded-md bg-amber-500/10 border border-amber-500/30 p-2 text-center">
                    <div className="text-lg font-semibold text-amber-600 dark:text-amber-400">
                      {readinessState.blockedCount}
                    </div>
                    <div className="text-xs text-muted-foreground">Waiting on dependencies</div>
                  </div>
                  <div className="rounded-md bg-blue-500/10 border border-blue-500/30 p-2 text-center">
                    <div className="text-lg font-semibold text-blue-600 dark:text-blue-400">
                      {readinessState.maxDepth}
                    </div>
                    <div className="text-xs text-muted-foreground">Execution waves</div>
                  </div>
                </div>

                {/* Collapsible wave preview */}
                {readinessState.waves.length > 0 && (
                  <div className="border-t border-border/50 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowWaves(!showWaves)}
                      className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
                    >
                      {showWaves ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      View Execution Waves
                    </button>

                    {showWaves && (
                      <div className="mt-2 space-y-2">
                        {readinessState.waves.map((wave, waveIndex) => (
                          <div key={waveIndex} className="flex items-start gap-2">
                            <Badge
                              variant="outline"
                              className={cn(
                                'shrink-0 text-xs text-white border-0',
                                waveColors[waveIndex % waveColors.length]
                              )}
                            >
                              Wave {waveIndex + 1}
                            </Badge>
                            <div className="flex flex-wrap gap-1">
                              {wave.map((reqId) => (
                                <span
                                  key={reqId}
                                  className="text-xs px-1.5 py-0.5 rounded bg-muted border border-border/50 truncate max-w-[150px]"
                                  title={getReqTitle(reqId)}
                                >
                                  {getReqTitle(reqId)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Get AI Help button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onOpenChange(false)
              onOptimize()
            }}
            className="w-full gap-2"
          >
            <Sparkles className="h-4 w-4" />
            Optimize for Parallel
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Uses AI to analyze and suggest dependency optimizations
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={!canEnableParallel} className="gap-2">
            <GitBranch className="h-4 w-4" />
            Enable Parallel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
