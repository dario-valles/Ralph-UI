import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect as Select } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Play,
  StopCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Circle,
  Loader2,
  Settings,
  ChevronDown,
  GitBranch,
  Pause,
  Zap,
  Hash,
  DollarSign,
} from 'lucide-react'
import type { RalphPrd, RalphPrdStatus, RalphLoopMetrics } from '@/types'
import { formatAgentName, type AgentType } from '@/types/agent'
import { ModelSelector } from '@/components/shared/ModelSelector'
import { getDefaultModel } from '@/lib/fallback-models'
import { formatTokens } from '@/lib/api'
import type { ConfigOverrides } from './hooks/useRalphLoopDashboard'
import type { ModelInfo } from '@/lib/model-api'
import { WorktreeActionsCompact } from './WorktreeActionsCompact'
import { cn } from '@/lib/utils'
import { Tooltip } from '@/components/ui/tooltip'

export interface RalphLoopHeaderProps {
  prd: RalphPrd
  prdStatus: RalphPrdStatus | null
  stateDisplay: {
    label: string
    color: string
    type: string
  }
  isRunning: boolean
  loading: boolean
  worktreePath: string | null
  effectiveWorktreePath: string | null
  executionMetrics: RalphLoopMetrics | null

  // Config state
  configOpen: boolean
  setConfigOpen: (open: boolean) => void
  setConfigOverrides: React.Dispatch<React.SetStateAction<ConfigOverrides>>
  effectiveMaxIterations: string
  effectiveMaxCost: string
  effectiveAgent: string
  effectiveModel: string
  effectiveRunTests: boolean
  effectiveRunLint: boolean
  availableAgents: AgentType[]
  availableModels: ModelInfo[]
  modelsLoading: boolean
  refreshModels: () => void

  // Worktree dialog state
  diffLoading: boolean
  mergeLoading: boolean

  // Actions
  onStartLoop: () => void
  onStopLoop: () => void
  onSaveConfig: () => void
  onRefresh: () => void
  onViewDiff: () => void
  onMergeToMain: () => void
  onOpenTerminal: () => void
  onOpenInEditor: () => void
}

// State type to icon mapping
const STATE_ICONS: Record<string, typeof Circle> = {
  running: Loader2,
  retrying: RefreshCw,
  paused: Pause,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: StopCircle,
}

function StateIcon({ type, isRunning }: { type: string; isRunning: boolean }): React.JSX.Element {
  const Icon = STATE_ICONS[type] ?? Circle
  return (
    <Icon
      className={cn('h-3 w-3', type === 'running' && isRunning && 'animate-spin')}
    />
  )
}

// Compact inline metric
function InlineMetric({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Zap
  value: string | number
  label: string
}) {
  return (
    <Tooltip content={label} side="bottom" delayDuration={200}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-default">
        <Icon className="h-3 w-3" />
        <span className="font-medium tabular-nums">{value}</span>
      </div>
    </Tooltip>
  )
}

export function RalphLoopHeader({
  prd,
  prdStatus,
  stateDisplay,
  isRunning,
  loading,
  worktreePath,
  effectiveWorktreePath,
  executionMetrics,
  configOpen,
  setConfigOpen,
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
  diffLoading,
  mergeLoading,
  onStartLoop,
  onStopLoop,
  onSaveConfig,
  onRefresh,
  onViewDiff,
  onMergeToMain,
  onOpenTerminal,
  onOpenInEditor,
}: RalphLoopHeaderProps): React.JSX.Element {
  const isCompleted = prdStatus?.allPass ?? false
  const progressPercent = prdStatus?.progressPercent ?? 0

  return (
    <Card className="flex-shrink-0">
      <CardContent className="p-3">
        {/* Row 1: Title + Status Badge + Controls */}
        <div className="flex items-center gap-2 mb-2">
          {/* Title and badge */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <h3 className="text-sm font-semibold truncate">{prd.title}</h3>
            <Badge
              variant={stateDisplay.color as 'default' | 'secondary' | 'destructive' | 'outline'}
              className="text-[10px] flex-shrink-0 gap-1"
            >
              <StateIcon type={stateDisplay.type} isRunning={isRunning} />
              {stateDisplay.label}
            </Badge>
          </div>

          {/* Compact controls */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {isRunning ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={onStopLoop}
                disabled={loading}
                className="h-7 text-xs px-2"
              >
                <StopCircle className="h-3.5 w-3.5 mr-1" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={onStartLoop}
                disabled={loading || prdStatus?.allPass}
                className="h-7 text-xs px-2"
              >
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 mr-1" />
                )}
                {prdStatus?.allPass ? 'Done' : 'Start'}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="h-7 w-7 p-0"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Row 2: Branch info + Progress + Metrics (single dense row) */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {/* Branch info */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <GitBranch className="h-3 w-3" />
            <span className="truncate max-w-32">{prd.branch}</span>
          </div>

          <span className="text-border">•</span>

          {/* Progress with mini bar */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex-shrink-0 tabular-nums">
              {prdStatus?.passed ?? 0}/{prdStatus?.total ?? prd.stories.length}
            </span>
            <Progress value={progressPercent} className="h-1 flex-1 max-w-24" />
            <span className="flex-shrink-0 tabular-nums">{Math.round(progressPercent)}%</span>
          </div>

          {/* Inline metrics (only if we have data) */}
          {executionMetrics && (executionMetrics.totalIterations ?? 0) > 0 && (
            <>
              <span className="text-border hidden sm:inline">•</span>
              <div className="hidden sm:flex items-center gap-3">
                <InlineMetric
                  icon={Hash}
                  value={executionMetrics.totalIterations ?? 0}
                  label="Total iterations"
                />
                <InlineMetric
                  icon={Zap}
                  value={formatTokens(executionMetrics.totalTokens ?? 0)}
                  label="Tokens used"
                />
                <InlineMetric
                  icon={DollarSign}
                  value={(executionMetrics.totalCost ?? 0).toFixed(2)}
                  label="Total cost"
                />
              </div>
            </>
          )}
        </div>

        {/* Row 3: Worktree actions (if active) - super compact */}
        {effectiveWorktreePath && (
          <WorktreeActionsCompact
            worktreePath={worktreePath}
            effectiveWorktreePath={effectiveWorktreePath}
            allPass={prdStatus?.allPass ?? false}
            diffLoading={diffLoading}
            mergeLoading={mergeLoading}
            onViewDiff={onViewDiff}
            onMergeToMain={onMergeToMain}
            onOpenInEditor={onOpenInEditor}
            onOpenTerminal={onOpenTerminal}
          />
        )}

        {/* Completion banner (no worktree case) */}
        {isCompleted && !effectiveWorktreePath && (
          <div className="flex items-center gap-2 mt-2 py-1.5 px-2 rounded bg-green-500/10 border border-green-500/20">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
            <span className="text-xs text-green-700 dark:text-green-300">
              All stories complete – changes on main branch
            </span>
          </div>
        )}

        {/* Configuration - collapsible, more subtle trigger */}
        <Collapsible open={configOpen} onOpenChange={setConfigOpen} className="mt-2">
          <CollapsibleTrigger asChild>
            <button
              className={cn(
                'flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors',
                isCompleted && 'opacity-50 cursor-not-allowed'
              )}
              disabled={isCompleted}
            >
              <Settings className="h-3 w-3" />
              <span>Config</span>
              <span className="text-[10px]">
                (max {effectiveMaxIterations} iter
                {effectiveMaxCost ? `, $${effectiveMaxCost}` : ''})
              </span>
              <ChevronDown
                className={cn('h-3 w-3 transition-transform', configOpen && 'rotate-180')}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-md bg-muted/30 border border-border/50">
              <div className="space-y-1">
                <Label htmlFor="max-iterations" className="text-xs">
                  Max Iterations
                </Label>
                <Input
                  id="max-iterations"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={1000}
                  placeholder="50"
                  value={effectiveMaxIterations}
                  disabled={isCompleted}
                  className="h-8 text-sm"
                  onChange={(e) =>
                    setConfigOverrides((prev) => ({ ...prev, maxIterations: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="max-cost" className="text-xs">
                  Max Cost ($)
                </Label>
                <Input
                  id="max-cost"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={0.5}
                  placeholder="No limit"
                  value={effectiveMaxCost}
                  disabled={isCompleted}
                  className="h-8 text-sm"
                  onChange={(e) =>
                    setConfigOverrides((prev) => ({ ...prev, maxCost: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="agent" className="text-xs">
                  Agent
                </Label>
                <Select
                  id="agent"
                  value={effectiveAgent}
                  disabled={isCompleted}
                  className="h-8 text-sm"
                  onChange={(e) => {
                    setConfigOverrides((prev) => ({
                      ...prev,
                      agent: e.target.value,
                      model: undefined,
                    }))
                  }}
                >
                  {availableAgents.map((agent) => (
                    <option key={agent} value={agent}>
                      {formatAgentName(agent)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label htmlFor="model" className="text-xs">
                    Model
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refreshModels}
                    disabled={modelsLoading || isCompleted}
                    className="h-5 w-5 p-0"
                  >
                    <RefreshCw className={cn('h-2.5 w-2.5', modelsLoading && 'animate-spin')} />
                  </Button>
                </div>
                <ModelSelector
                  id="model"
                  value={effectiveModel || getDefaultModel(effectiveAgent as AgentType)}
                  onChange={(value) => setConfigOverrides((prev) => ({ ...prev, model: value }))}
                  models={availableModels}
                  loading={modelsLoading}
                  disabled={isCompleted}
                  loadingText="Loading..."
                  className="h-8 text-sm"
                />
              </div>

              {/* Quality gates in a row */}
              <div className="col-span-2 flex items-center gap-4 pt-2 border-t border-border/50">
                <span className="text-xs text-muted-foreground">Quality:</span>
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={effectiveRunTests}
                    disabled={isCompleted}
                    onCheckedChange={(checked) =>
                      setConfigOverrides((prev) => ({ ...prev, runTests: checked as boolean }))
                    }
                    className="h-3.5 w-3.5"
                  />
                  Tests
                </label>
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox
                    checked={effectiveRunLint}
                    disabled={isCompleted}
                    onCheckedChange={(checked) =>
                      setConfigOverrides((prev) => ({ ...prev, runLint: checked as boolean }))
                    }
                    className="h-3.5 w-3.5"
                  />
                  Lint
                </label>
                {worktreePath && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                    <GitBranch className="h-3 w-3" />
                    Worktree
                  </span>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onSaveConfig}
                  disabled={isCompleted}
                  className="h-6 text-xs ml-auto"
                >
                  Save
                </Button>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  )
}
