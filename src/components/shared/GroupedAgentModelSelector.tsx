/**
 * GroupedAgentModelSelector Component
 *
 * A compact, visually grouped agent/model selector with icons.
 * Used in chat headers where space is limited and a clean design is needed.
 *
 * Features:
 * - Bot icon + agent dropdown | Sparkles icon + model dropdown
 * - Grouped container with divider
 * - Consistent styling across PRD Chat and Context Chat
 */

import { Bot, Sparkles } from 'lucide-react'
import { NativeSelect as Select } from '@/components/ui/select'
import { ModelSelector } from '@/components/shared/ModelSelector'
import type { AgentOption } from '@/hooks/useAgentModelSelector'
import type { ModelInfo } from '@/lib/model-api'
import { cn } from '@/lib/utils'

export interface GroupedAgentModelSelectorProps {
  /** Agent options from useAgentModelSelector hook */
  agentOptions: AgentOption[]
  /** Current composite value (e.g., "claude" or "claude:zai") */
  currentAgentOptionValue: string
  /** Handler for agent option changes */
  onAgentOptionChange: (value: string) => void
  /** Currently selected model ID */
  modelId: string
  /** Default model ID (used when modelId is empty) */
  defaultModelId: string
  /** Handler for model changes */
  onModelChange: (modelId: string) => void
  /** Available models for the current agent */
  models: ModelInfo[]
  /** Whether models are loading */
  modelsLoading?: boolean
  /** Whether agents are loading */
  agentsLoading?: boolean
  /** Whether the selectors are disabled */
  disabled?: boolean
  /** ID prefix for accessibility */
  idPrefix?: string
  /** Additional CSS classes for the container */
  className?: string
  /** Width class for agent select */
  agentWidth?: string
  /** Width class for model select */
  modelWidth?: string
}

/**
 * Grouped agent/model selector with icons and divider.
 * Matches the design pattern used in PRD Chat header.
 */
export function GroupedAgentModelSelector({
  agentOptions,
  currentAgentOptionValue,
  onAgentOptionChange,
  modelId,
  defaultModelId,
  onModelChange,
  models,
  modelsLoading = false,
  agentsLoading = false,
  disabled = false,
  idPrefix = 'grouped',
  className,
  agentWidth = 'w-24',
  modelWidth = 'w-32 lg:w-40',
}: GroupedAgentModelSelectorProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex items-center bg-muted/40 rounded-lg border border-border/40',
        className
      )}
    >
      {/* Agent selector with icon */}
      <div className="flex items-center gap-1.5 pl-2.5 pr-1">
        <Bot className="h-3.5 w-3.5 text-foreground/70 flex-shrink-0" />
        <Select
          id={`${idPrefix}-agent-selector`}
          aria-label="Agent"
          value={currentAgentOptionValue}
          onChange={(e) => onAgentOptionChange(e.target.value)}
          disabled={disabled || agentsLoading}
          className={cn(
            agentWidth,
            'text-sm h-8 bg-transparent border-0 font-medium text-foreground',
            'cursor-pointer hover:text-foreground/80 focus:ring-0 focus:ring-offset-0 pr-6'
          )}
        >
          {agentOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {/* Vertical divider */}
      <div className="w-px h-6 bg-border/60" />

      {/* Model selector with icon */}
      <div className="flex items-center gap-1.5 pl-2 pr-1">
        <Sparkles className="h-3.5 w-3.5 text-foreground/70 flex-shrink-0" />
        <ModelSelector
          id={`${idPrefix}-model-selector`}
          value={modelId || defaultModelId || ''}
          onChange={onModelChange}
          models={models}
          loading={modelsLoading}
          disabled={disabled}
          className={cn(
            modelWidth,
            'text-sm h-8 bg-transparent border-0 font-medium text-foreground',
            'cursor-pointer hover:text-foreground/80 focus:ring-0 focus:ring-offset-0 pr-6'
          )}
        />
      </div>
    </div>
  )
}
