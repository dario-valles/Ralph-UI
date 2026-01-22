import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Play,
  Search,
  Code,
  TestTube2,
  GitCommit,
  CheckCircle2,
  XCircle,
  StopCircle,
  Loader2,
} from 'lucide-react'
import {
  RalphProgressEvent,
  RalphPhase,
  getPhaseLabel,
  getPhaseColor,
} from '@/hooks/useProgressStream'

interface ProgressIndicatorProps {
  /** Current progress event from useProgressStream */
  progress: RalphProgressEvent | null
  /** Whether execution is active */
  isRunning?: boolean
  /** Compact mode (inline display) */
  compact?: boolean
}

/**
 * Real-time progress indicator for Ralph Loop executions.
 *
 * Shows:
 * - Current phase with icon
 * - Progress bar
 * - Story completion status
 * - Current file being processed
 */
export function ProgressIndicator({
  progress,
  isRunning = false,
  compact = false,
}: ProgressIndicatorProps): React.JSX.Element {
  if (!progress && !isRunning) {
    return (
      <div className="text-sm text-muted-foreground">
        No execution in progress
      </div>
    )
  }

  const phase = progress?.phase ?? 'starting'
  const phaseLabel = getPhaseLabel(phase)
  const phaseColor = getPhaseColor(phase)
  const overallProgress = progress
    ? progress.totalStories > 0
      ? (progress.passingStories / progress.totalStories) * 100
      : 0
    : 0

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <PhaseIcon phase={phase} className="h-4 w-4" />
        <span className={`text-sm font-medium ${phaseColor}`}>{phaseLabel}</span>
        {progress && (
          <Badge variant="outline" className="text-xs">
            {progress.passingStories}/{progress.totalStories}
          </Badge>
        )}
        {progress?.currentFile && (
          <span className="text-xs text-muted-foreground truncate max-w-[150px]">
            {progress.currentFile}
          </span>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Phase Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <PhaseIcon phase={phase} className={`h-5 w-5 ${phaseColor}`} />
          <span className={`font-medium ${phaseColor}`}>{phaseLabel}</span>
          {progress?.iteration && progress.iteration > 0 && (
            <Badge variant="secondary" className="text-xs">
              Iteration {progress.iteration}
            </Badge>
          )}
        </div>
        <div className="text-sm text-muted-foreground">
          {progress?.passingStories ?? 0}/{progress?.totalStories ?? 0} stories
        </div>
      </div>

      {/* Progress Bar */}
      <div className="space-y-1">
        <Progress value={overallProgress} className="h-2" />
        {progress?.message && (
          <p className="text-xs text-muted-foreground truncate">
            {progress.message}
          </p>
        )}
      </div>

      {/* Current File */}
      {progress?.currentFile && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Code className="h-3 w-3" />
          <span className="truncate">{progress.currentFile}</span>
        </div>
      )}

      {/* Phase Progress */}
      {progress && progress.progress > 0 && progress.progress < 1 && (
        <div className="flex items-center gap-2">
          <Progress
            value={progress.progress * 100}
            className="h-1 flex-1 opacity-50"
          />
          <span className="text-xs text-muted-foreground w-12 text-right">
            {Math.round(progress.progress * 100)}%
          </span>
        </div>
      )}
    </div>
  )
}

interface PhaseIconProps {
  phase: RalphPhase
  className?: string
}

/**
 * Icon for each execution phase
 */
function PhaseIcon({ phase, className }: PhaseIconProps): React.JSX.Element {
  switch (phase) {
    case 'starting':
      return <Play className={className} />
    case 'analyzing':
      return <Search className={className} />
    case 'implementing':
      return <Code className={className} />
    case 'testing':
      return <TestTube2 className={className} />
    case 'committing':
      return <GitCommit className={className} />
    case 'evaluating':
      return <Loader2 className={`${className} animate-spin`} />
    case 'complete':
      return <CheckCircle2 className={className} />
    case 'stopped':
      return <StopCircle className={className} />
    case 'failed':
      return <XCircle className={className} />
    default:
      return <Loader2 className={`${className} animate-spin`} />
  }
}
