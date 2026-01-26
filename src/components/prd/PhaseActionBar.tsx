/**
 * Phase Action Bar Component
 *
 * Shows contextual action buttons for GSD workflow phases.
 * Buttons are shown/enabled based on conversation state and completed phases.
 *
 * Supports two modes:
 * - Default: Full bar with labels, shown below input
 * - Inline: Icon-only buttons with progressive visibility, shown inside input
 */

import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { Search, FileText, Target, Calendar, Download, Loader2, Check } from 'lucide-react'

export type PhaseAction = 'research' | 'requirements' | 'scope' | 'roadmap' | 'export'

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
}

/** Props for inline phase buttons (inside chat input) */
interface InlinePhaseButtonsProps {
  /** Current phase state */
  phaseState: PhaseState
  /** Callback when an action button is clicked */
  onAction: (action: PhaseAction) => void
  /** Whether buttons are disabled */
  disabled?: boolean
  /** Optional class name */
  className?: string
}

interface ActionButtonConfig {
  action: PhaseAction
  icon: typeof Search
  label: string
  compactLabel: string
  tooltip: string
  isEnabled: (state: PhaseState) => boolean
  isHighlighted: (state: PhaseState) => boolean
  /** When this phase is complete (for showing checkmark) */
  isComplete: (state: PhaseState) => boolean
  /** When this button should be visible in inline mode */
  isVisible: (state: PhaseState) => boolean
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
    isComplete: (state) => state.researchComplete,
    isVisible: () => true, // Always visible
  },
  {
    action: 'requirements',
    icon: FileText,
    label: 'Requirements',
    compactLabel: 'Reqs',
    tooltip: 'Generate requirements from conversation and research',
    isEnabled: (state) => state.researchComplete || state.researchStarted,
    isHighlighted: (state) => state.researchComplete && !state.requirementsGenerated,
    isComplete: (state) => state.requirementsGenerated,
    isVisible: (state) => state.researchComplete, // Visible after research complete
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
    isComplete: (state) => state.scopingComplete,
    isVisible: (state) => state.requirementsGenerated, // Visible after requirements generated
  },
  {
    action: 'roadmap',
    icon: Calendar,
    label: 'Roadmap',
    compactLabel: 'Roadmap',
    tooltip: 'Generate execution roadmap from scoped requirements',
    isEnabled: (state) => state.scopingComplete,
    isHighlighted: (state) => state.scopingComplete && !state.roadmapGenerated,
    isComplete: (state) => state.roadmapGenerated,
    isVisible: (state) => state.scopingComplete, // Visible after scoping complete
  },
  {
    action: 'export',
    icon: Download,
    label: 'Export',
    compactLabel: 'Export',
    tooltip: 'Export to Ralph PRD format for execution',
    isEnabled: (state) => state.roadmapGenerated,
    isHighlighted: (state) => state.roadmapGenerated,
    isComplete: () => false, // Export can be done multiple times
    isVisible: (state) => state.roadmapGenerated, // Visible after roadmap generated
  },
]

export function PhaseActionBar({
  phaseState,
  onAction,
  disabled = false,
  className,
  compact = false,
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

    </div>
  )
}

/**
 * Inline Phase Buttons Component
 *
 * Icon-only buttons with progressive visibility for use inside the chat input.
 * Shows completion checkmarks and spinner for running actions.
 */
export function InlinePhaseButtons({
  phaseState,
  onAction,
  disabled = false,
  className,
}: InlinePhaseButtonsProps) {
  // Filter to only visible buttons based on phase state
  const visibleButtons = ACTION_BUTTONS.filter((config) => config.isVisible(phaseState))

  return (
    <div className={cn('flex items-center', className)}>
      {visibleButtons.map((config) => {
        const Icon = config.icon
        const isEnabled = config.isEnabled(phaseState)
        const isComplete = config.isComplete(phaseState)
        const isRunning = phaseState.runningAction === config.action

        // Allow clicking running action to view progress, disable others while running
        const isDisabled = disabled || !isEnabled || (phaseState.isRunning && !isRunning)

        return (
          <Tooltip
            key={config.action}
            content={isRunning ? 'Click to view progress' : config.tooltip}
            side="top"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onAction(config.action)}
              disabled={isDisabled}
              className={cn(
                'h-9 w-9 rounded-xl flex-shrink-0 relative transition-all',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-muted/80',
                !isEnabled && !isRunning && 'opacity-40',
                isComplete && 'text-emerald-600 dark:text-emerald-400',
                isRunning && 'text-blue-500 dark:text-blue-400'
              )}
              aria-label={isRunning ? `${config.label} - Click to view progress` : config.label}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Icon className="h-4 w-4" />
              )}
              {/* Completion checkmark badge */}
              {isComplete && !isRunning && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                  <Check className="h-2 w-2" strokeWidth={3} />
                </span>
              )}
            </Button>
          </Tooltip>
        )
      })}
    </div>
  )
}
