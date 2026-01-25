/**
 * Phase Action Bar Component
 *
 * Shows contextual action buttons for GSD workflow phases.
 * Buttons are shown/enabled based on conversation state and completed phases.
 */

import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Search, FileText, Target, Calendar, Loader2, Sparkles } from 'lucide-react'

export type PhaseAction = 'research' | 'requirements' | 'scope' | 'roadmap'

export interface PhaseState {
  /** Whether research has been started */
  researchStarted: boolean
  /** Whether research is complete */
  researchComplete: boolean
  /** Whether requirements have been generated */
  requirementsGenerated: boolean
  /** Whether scoping is complete */
  scopingComplete: boolean
  /** Whether roadmap has been generated */
  roadmapGenerated: boolean
  /** Number of unscoped requirements */
  unscopedCount?: number
  /** Whether a phase action is currently running */
  isRunning: boolean
  /** Which action is currently running */
  runningAction?: PhaseAction | null
}

interface PhaseActionBarProps {
  /** Current phase state */
  phaseState: PhaseState
  /** Callback when an action button is clicked */
  onAction: (action: PhaseAction) => void
  /** Whether the entire bar is disabled */
  disabled?: boolean
  /** Optional class name */
  className?: string
  /** Whether to show compact mode (icons only) */
  compact?: boolean
  /** Whether to show dismissible hint */
  showHint?: boolean
  /** Callback to dismiss hint */
  onDismissHint?: () => void
}

interface ActionButtonConfig {
  action: PhaseAction
  icon: typeof Search
  label: string
  compactLabel: string
  tooltip: string
  isEnabled: (state: PhaseState) => boolean
  isHighlighted: (state: PhaseState) => boolean
}

const ACTION_BUTTONS: ActionButtonConfig[] = [
  {
    action: 'research',
    icon: Search,
    label: 'Research',
    compactLabel: 'Research',
    tooltip: 'Run parallel research agents to analyze architecture, codebase, best practices, and risks',
    isEnabled: () => true,
    isHighlighted: (state) => !state.researchStarted,
  },
  {
    action: 'requirements',
    icon: FileText,
    label: 'Requirements',
    compactLabel: 'Reqs',
    tooltip: 'Generate requirements from conversation and research',
    isEnabled: (state) => state.researchComplete || state.researchStarted,
    isHighlighted: (state) => state.researchComplete && !state.requirementsGenerated,
  },
  {
    action: 'scope',
    icon: Target,
    label: 'Scope',
    compactLabel: 'Scope',
    tooltip: 'Categorize requirements into V1, V2, or out-of-scope',
    isEnabled: (state) => state.requirementsGenerated,
    isHighlighted: (state) => {
      const hasUnscopedItems = (state.unscopedCount ?? 0) > 0
      return state.requirementsGenerated && !state.scopingComplete && hasUnscopedItems
    },
  },
  {
    action: 'roadmap',
    icon: Calendar,
    label: 'Roadmap',
    compactLabel: 'Roadmap',
    tooltip: 'Generate execution roadmap from scoped requirements',
    isEnabled: (state) => state.scopingComplete,
    isHighlighted: (state) => state.scopingComplete && !state.roadmapGenerated,
  },
]

export function PhaseActionBar({
  phaseState,
  onAction,
  disabled = false,
  className,
  compact = false,
  showHint = false,
  onDismissHint,
}: PhaseActionBarProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {/* Action buttons row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {ACTION_BUTTONS.map((config) => {
          const Icon = config.icon
          const isEnabled = config.isEnabled(phaseState)
          const isHighlighted = config.isHighlighted(phaseState)
          const isRunning = phaseState.runningAction === config.action

          return (
            <Tooltip
              key={config.action}
              content={config.tooltip}
              side="top"
            >
              <Button
                variant={isHighlighted ? 'default' : 'outline'}
                size="sm"
                onClick={() => onAction(config.action)}
                disabled={disabled || !isEnabled || phaseState.isRunning}
                className={cn(
                  'h-8 gap-1.5 transition-all',
                  isHighlighted && 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 border-0 hover:from-emerald-600 hover:to-teal-700',
                  !isHighlighted && isEnabled && 'border-border/50 hover:bg-muted/50',
                  !isEnabled && 'opacity-50',
                  compact ? 'px-2' : 'px-3'
                )}
              >
                {isRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                <span className={cn('text-xs font-medium', compact && 'hidden sm:inline')}>
                  {compact ? config.compactLabel : config.label}
                </span>
              </Button>
            </Tooltip>
          )
        })}
      </div>

      {/* Dismissible hint */}
      {showHint && !phaseState.researchStarted && (
        <div className="flex items-center justify-between text-[11px] text-muted-foreground/60 px-1">
          <div className="flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            <span>Click Research to run 4 parallel agents for deeper analysis</span>
          </div>
          {onDismissHint && (
            <button
              onClick={onDismissHint}
              className="text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  )
}
