import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
} from 'lucide-react'
import type { RalphPrd, RalphPrdStatus, RalphLoopMetrics } from '@/types'
import { formatAgentName, type AgentType } from '@/types/agent'
import { ModelSelector } from '@/components/shared/ModelSelector'
import { getDefaultModel } from '@/lib/fallback-models'
import type { ConfigOverrides } from './hooks/useRalphLoopDashboard'
import type { ModelInfo } from '@/lib/model-api'
import { WorktreeActions } from './WorktreeActions'

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

// Helper to get abbreviated state label for mobile
function getShortStateLabel(label: string): string {
  // "Running (Iteration 5)" -> "Running"
  // "Completed (underspec)" -> "Done"
  // "Failed (test)" -> "Failed"
  const base = label.split('(')[0].trim()
  if (base === 'Completed') return 'Done'
  return base
}

// Helper to format token counts
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(0)}K`
  return String(tokens)
}

// Compact stat pill for mobile
function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted/50 border border-border/50 whitespace-nowrap flex-shrink-0">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <span className="text-xs font-semibold">{value}</span>
    </div>
  )
}

const StateIcon = ({ type, isRunning }: { type: string; isRunning: boolean }) => {
  switch (type) {
    case 'running':
      return <Loader2 className={`mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3 ${isRunning ? 'animate-spin' : ''}`} />
    case 'retrying':
      return <RefreshCw className="mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
    case 'paused':
      return <Pause className="mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
    case 'completed':
      return <CheckCircle2 className="mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
    case 'failed':
      return <XCircle className="mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
    case 'cancelled':
      return <StopCircle className="mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
    default:
      return <Circle className="mr-1 h-2.5 w-2.5 sm:h-3 sm:w-3" />
  }
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
  return (
    <Card className="flex-shrink-0 max-h-[50vh] overflow-y-auto">
      <CardHeader className="py-2 sm:py-3 px-3 sm:px-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-start sm:items-center gap-2 flex-wrap">
              <CardTitle className="text-sm sm:text-base truncate max-w-[200px] sm:max-w-none">
                {prd.title}
              </CardTitle>
              <Badge
                variant={stateDisplay.color as 'default' | 'secondary' | 'destructive' | 'outline'}
                className="text-[10px] sm:text-xs flex-shrink-0"
                title={stateDisplay.label}
              >
                <StateIcon type={stateDisplay.type} isRunning={isRunning} />
                {/* Short label on mobile, full on sm+ */}
                <span className="sm:hidden">{getShortStateLabel(stateDisplay.label)}</span>
                <span className="hidden sm:inline">{stateDisplay.label}</span>
              </Badge>
            </div>
            <CardDescription className="text-[10px] sm:text-xs mt-0.5">
              Branch: {prd.branch} | {prd.stories.length} stories
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0 px-3 sm:px-4 pb-2">
        {/* Progress bar */}
        {prdStatus && (
          <div className="space-y-1">
            <div className="flex justify-between text-[10px] sm:text-xs text-muted-foreground">
              <span>
                {prdStatus.passed} of {prdStatus.total} stories passing
              </span>
              <span>{Math.round(prdStatus.progressPercent || 0)}%</span>
            </div>
            <Progress value={prdStatus.progressPercent || 0} className="h-1 sm:h-1.5" />
          </div>
        )}

        {/* Configuration */}
        <Collapsible open={configOpen} onOpenChange={setConfigOpen} className="mt-2 sm:mt-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-between h-8 sm:h-9 text-xs sm:text-sm"
            >
              <span className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <Settings className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
                <span className="truncate">Loop Configuration</span>
                <span className="text-muted-foreground text-[10px] sm:text-xs hidden sm:inline">
                  (max {effectiveMaxIterations} iterations
                  {effectiveMaxCost ? `, $${effectiveMaxCost} limit` : ''})
                </span>
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0 transition-transform ${configOpen ? 'rotate-180' : ''}`}
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
                  inputMode="numeric"
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
                  inputMode="decimal"
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
                  onChange={(value) => setConfigOverrides((prev) => ({ ...prev, model: value }))}
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
              <Button variant="secondary" size="sm" onClick={onSaveConfig}>
                Save Configuration
              </Button>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 mt-2 sm:mt-3">
          {isRunning ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={onStopLoop}
              disabled={loading}
              className="h-8 sm:h-9 text-xs sm:text-sm flex-1 sm:flex-none"
            >
              <StopCircle className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              Stop Loop
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onStartLoop}
              disabled={loading || prdStatus?.allPass}
              className="h-8 sm:h-9 text-xs sm:text-sm flex-1 sm:flex-none"
            >
              {loading ? (
                <Loader2 className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4 animate-spin" />
              ) : (
                <Play className="mr-1.5 sm:mr-2 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              )}
              <span className="truncate">
                {prdStatus?.allPass ? 'All Pass' : (
                  <>
                    <span className="sm:hidden">Start Loop</span>
                    <span className="hidden sm:inline">Start Ralph Loop</span>
                  </>
                )}
              </span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="h-8 sm:h-9 text-xs sm:text-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="ml-1.5 sm:ml-2 hidden sm:inline">Refresh</span>
          </Button>
        </div>

        {/* Worktree Info */}
        {effectiveWorktreePath && (
          <WorktreeActions
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

        {/* Metrics */}
        {executionMetrics && (
          <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t">
            {/* Mobile: Horizontal scrollable compact pills */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide sm:hidden pb-1">
              <StatPill label="Iter" value={executionMetrics.totalIterations ?? 0} />
              <StatPill label="Done" value={executionMetrics.storiesCompleted ?? 0} />
              <StatPill label="Tokens" value={formatTokens(executionMetrics.totalTokens ?? 0)} />
              <StatPill label="Cost" value={`$${(executionMetrics.totalCost ?? 0).toFixed(2)}`} />
            </div>
            {/* Desktop: Original grid */}
            <div className="hidden sm:grid grid-cols-4 gap-2">
              <div className="text-center">
                <div className="text-lg font-semibold">
                  {executionMetrics.totalIterations ?? 0}
                </div>
                <div className="text-[10px] text-muted-foreground">Iterations</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">
                  {executionMetrics.storiesCompleted ?? 0}
                </div>
                <div className="text-[10px] text-muted-foreground">Done</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">
                  {formatTokens(executionMetrics.totalTokens ?? 0)}
                </div>
                <div className="text-[10px] text-muted-foreground">Tokens</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-semibold">
                  ${(executionMetrics.totalCost ?? 0).toFixed(2)}
                </div>
                <div className="text-[10px] text-muted-foreground">Cost</div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
