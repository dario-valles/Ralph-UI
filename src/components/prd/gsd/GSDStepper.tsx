/**
 * GSD Stepper Component
 *
 * Displays the workflow phases as a visual stepper, showing
 * progress through the GSD workflow.
 */

import { cn } from '@/lib/utils'
import { GSD_PHASES, type GsdPhase, type GsdPhaseInfo } from '@/types/gsd'
import { CheckCircle2, Circle, ChevronRight } from 'lucide-react'

interface GSDStepperProps {
  /** Current active phase */
  currentPhase: GsdPhase
  /** Callback when a phase is clicked */
  onPhaseClick?: (phase: GsdPhase) => void
  /** Completed phases */
  completedPhases?: GsdPhase[]
  /** Whether the stepper is disabled */
  disabled?: boolean
  /** Orientation of the stepper */
  orientation?: 'horizontal' | 'vertical'
}

function getPhaseIcon(phase: GsdPhaseInfo, currentPhase: GsdPhase, completedPhases: GsdPhase[]) {
  const currentInfo = GSD_PHASES.find((p) => p.phase === currentPhase)
  const isCurrent = phase.phase === currentPhase
  const isCompleted = completedPhases.includes(phase.phase)
  const isPast = currentInfo && phase.index < currentInfo.index

  if (isCompleted || isPast) {
    return <CheckCircle2 className="h-5 w-5 text-green-500" />
  }
  if (isCurrent) {
    return <Circle className="h-5 w-5 text-primary fill-primary" />
  }
  return <Circle className="h-5 w-5 text-muted-foreground" />
}

export function GSDStepper({
  currentPhase,
  onPhaseClick,
  completedPhases = [],
  disabled = false,
  orientation = 'horizontal',
}: GSDStepperProps) {
  const currentInfo = GSD_PHASES.find((p) => p.phase === currentPhase)

  const isVertical = orientation === 'vertical'

  return (
    <div className={cn('flex gap-1', isVertical ? 'flex-col' : 'flex-row items-center flex-wrap')}>
      {GSD_PHASES.map((phase, index) => {
        const isCurrent = phase.phase === currentPhase
        const isCompleted = completedPhases.includes(phase.phase)
        const isPast = currentInfo && phase.index < currentInfo.index
        const isClickable = !disabled && (isCompleted || isPast || isCurrent)

        return (
          <div key={phase.phase} className={cn('flex items-center gap-2', isVertical && 'py-2')}>
            {/* Step */}
            <button
              type="button"
              onClick={() => isClickable && onPhaseClick?.(phase.phase)}
              disabled={!isClickable}
              className={cn(
                'flex items-center gap-2 px-3 py-2 rounded-md transition-colors',
                'text-sm font-medium',
                isCurrent && 'bg-primary/10 text-primary',
                !isCurrent && isCompleted && 'text-green-600',
                !isCurrent && isPast && 'text-muted-foreground',
                !isCurrent && !isCompleted && !isPast && 'text-muted-foreground/50',
                isClickable && 'hover:bg-muted cursor-pointer',
                !isClickable && 'cursor-not-allowed'
              )}
            >
              {getPhaseIcon(phase, currentPhase, completedPhases)}
              <span className={cn('hidden sm:inline', isVertical && 'inline')}>
                {phase.displayName}
              </span>
            </button>

            {/* Connector */}
            {index < GSD_PHASES.length - 1 && !isVertical && (
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
            )}
            {index < GSD_PHASES.length - 1 && isVertical && (
              <div className="ml-5 h-4 w-0.5 bg-border" />
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Compact version of the stepper for smaller spaces
 */
export function GSDStepperCompact({
  currentPhase,
  onPhaseClick,
  completedPhases = [],
  disabled = false,
}: Omit<GSDStepperProps, 'orientation'>) {
  const currentInfo = GSD_PHASES.find((p) => p.phase === currentPhase)

  return (
    <div className="flex items-center gap-1">
      {GSD_PHASES.map((phase, index) => {
        const isCurrent = phase.phase === currentPhase
        const isCompleted = completedPhases.includes(phase.phase)
        const isPast = currentInfo && phase.index < currentInfo.index
        const isClickable = !disabled && (isCompleted || isPast || isCurrent)

        return (
          <div key={phase.phase} className="flex items-center">
            <button
              type="button"
              onClick={() => isClickable && onPhaseClick?.(phase.phase)}
              disabled={!isClickable}
              className={cn(
                'w-2 h-2 rounded-full transition-all',
                isCurrent && 'w-4 bg-primary',
                !isCurrent && (isCompleted || isPast) && 'bg-green-500',
                !isCurrent && !isCompleted && !isPast && 'bg-muted-foreground/30',
                isClickable && 'cursor-pointer hover:scale-110',
                !isClickable && 'cursor-not-allowed'
              )}
              title={phase.displayName}
            />
            {index < GSD_PHASES.length - 1 && <div className="w-2 h-0.5 bg-muted mx-0.5" />}
          </div>
        )
      })}
    </div>
  )
}
