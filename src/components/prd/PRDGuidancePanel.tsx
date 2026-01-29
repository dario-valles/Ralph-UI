import { Bug, RefreshCw, Link, Sparkles, Rocket, FileText, ChevronRight } from 'lucide-react'
import type { PRDTypeValue } from '@/types'
import { getPRDTypeGuidance } from '@/config/prdTypeGuidance'
import { cn } from '@/lib/utils'

interface PRDGuidancePanelProps {
  prdType: PRDTypeValue
  /** Called when user clicks a sample prompt */
  onInsertPrompt: (prompt: string) => void
  /** Called when user clicks a command */
  onInsertCommand: (command: string) => void
}

/**
 * Icon mapping for PRD types
 */
const TYPE_ICONS: Record<PRDTypeValue, typeof Bug> = {
  bug_fix: Bug,
  refactoring: RefreshCw,
  api_integration: Link,
  new_feature: Sparkles,
  full_new_app: Rocket,
  general: FileText,
}

/**
 * Color classes for PRD types
 */
const TYPE_COLORS: Record<PRDTypeValue, { icon: string; bg: string; border: string }> = {
  bug_fix: {
    icon: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
  },
  refactoring: {
    icon: 'text-green-500',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
  },
  api_integration: {
    icon: 'text-purple-500',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
  },
  new_feature: {
    icon: 'text-blue-500',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  full_new_app: {
    icon: 'text-amber-500',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
  },
  general: {
    icon: 'text-gray-500',
    bg: 'bg-gray-500/10',
    border: 'border-gray-500/20',
  },
}

/**
 * Renders type-specific onboarding guidance for PRD Chat.
 * Shows workflow steps, sample prompts, and quick commands.
 */
export function PRDGuidancePanel({
  prdType,
  onInsertPrompt,
  onInsertCommand,
}: PRDGuidancePanelProps) {
  const guidance = getPRDTypeGuidance(prdType)
  const Icon = TYPE_ICONS[prdType]
  const colors = TYPE_COLORS[prdType]

  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-6 overflow-y-auto">
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/3 right-1/4 w-48 h-48 bg-teal-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg space-y-6">
        {/* Header with icon and title */}
        <div className="text-center">
          <div
            className={cn(
              'inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl mb-4',
              colors.bg,
              'border',
              colors.border
            )}
          >
            <Icon className={cn('h-7 w-7 sm:h-8 sm:w-8', colors.icon)} />
          </div>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-1">{guidance.title}</h3>
          <p className="text-sm text-muted-foreground">{guidance.subtitle}</p>
        </div>

        {/* Workflow steps */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
            Workflow
          </h4>
          <div className="space-y-1.5">
            {guidance.workflow.map((step) => (
              <div
                key={step.step}
                className={cn(
                  'flex items-start gap-3 p-2.5 sm:p-3 rounded-lg',
                  'bg-card/50 border border-border/50',
                  'hover:bg-muted/30 transition-colors'
                )}
              >
                <span
                  className={cn(
                    'flex-shrink-0 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center',
                    'text-[10px] sm:text-xs font-semibold',
                    colors.bg,
                    colors.icon
                  )}
                >
                  {step.step}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{step.title}</span>
                    {step.command && (
                      <button
                        onClick={() => onInsertCommand(step.command!)}
                        className={cn(
                          'text-[10px] sm:text-xs font-mono px-1.5 py-0.5 rounded',
                          'bg-muted hover:bg-muted/80 transition-colors',
                          'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {step.command}
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sample prompts */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
            Try saying
          </h4>
          <div className="flex flex-wrap gap-2">
            {guidance.samplePrompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => onInsertPrompt(prompt)}
                className={cn(
                  'group flex items-center gap-1.5 px-3 py-1.5',
                  'text-xs sm:text-sm font-medium rounded-full',
                  'border border-border/50 bg-card/50',
                  'hover:bg-muted hover:border-emerald-500/30',
                  'transition-all duration-200 hover:shadow-sm',
                  'text-left'
                )}
              >
                <span className="line-clamp-1">{prompt}</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground group-hover:text-emerald-500 transition-colors flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>

        {/* Quick commands */}
        <div className="space-y-2">
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
            Quick commands
          </h4>
          <div className="flex flex-wrap gap-2">
            {guidance.quickCommands.map((cmd) => (
              <button
                key={cmd.command}
                onClick={() => onInsertCommand(cmd.command)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1.5',
                  'text-xs font-medium rounded-md',
                  'bg-muted/50 hover:bg-muted',
                  'border border-border/30 hover:border-border/50',
                  'transition-all duration-200'
                )}
                title={cmd.description}
              >
                <span className="font-mono text-emerald-600 dark:text-emerald-400">
                  {cmd.command}
                </span>
                <span className="text-muted-foreground">{cmd.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
