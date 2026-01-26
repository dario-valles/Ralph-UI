/**
 * AgentModelSelector Component
 *
 * Reusable component for selecting an AI agent type and model.
 * Used across GSD workflow (research, requirements generation).
 *
 * Supports two variants:
 * - 'default': Stacked with labels, wrapped in a config box with Bot icon
 * - 'compact': Inline selectors without wrapper (for headers/toolbars)
 */

import { Bot } from 'lucide-react'
import { NativeSelect } from '@/components/ui/select'
import { ModelSelector } from '@/components/shared/ModelSelector'
import { formatAgentName, type AgentType } from '@/types/agent'
import type { ModelInfo } from '@/lib/model-api'
import { cn } from '@/lib/utils'

export interface AgentModelSelectorProps {
  /** Currently selected agent type */
  agentType: AgentType
  /** Callback when agent type changes */
  onAgentChange: (agentType: AgentType) => void
  /** Currently selected model ID */
  modelId: string
  /** Callback when model changes */
  onModelChange: (modelId: string) => void
  /** Available models for the current agent */
  models: ModelInfo[]
  /** Whether models are currently loading */
  modelsLoading?: boolean
  /** Default model ID (for display purposes) */
  defaultModelId?: string
  /** Whether the selectors are disabled */
  disabled?: boolean
  /** Layout variant */
  variant?: 'default' | 'compact'
  /** Additional CSS classes */
  className?: string
  /** Available agent types (optional, defaults to common agents) */
  availableAgents?: AgentType[]
  /** Whether agents are loading */
  agentsLoading?: boolean
}

/**
 * AgentModelSelector component for combined agent and model selection
 */
export function AgentModelSelector({
  agentType,
  onAgentChange,
  modelId,
  onModelChange,
  models,
  modelsLoading = false,
  disabled = false,
  variant = 'default',
  className,
  availableAgents = ['claude'],
  agentsLoading = false,
}: AgentModelSelectorProps): React.JSX.Element {
  const selectorsContent = (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3',
        variant === 'compact' && 'flex-row items-center gap-3'
      )}
    >
      {/* Agent selector */}
      <div className="flex items-center gap-2">
        {variant === 'default' && (
          <label htmlFor="agent-selector" className="text-sm text-muted-foreground whitespace-nowrap">
            Agent:
          </label>
        )}
        <NativeSelect
          id="agent-selector"
          aria-label="Agent"
          value={agentType}
          onChange={(e) => onAgentChange(e.target.value as AgentType)}
          disabled={disabled || agentsLoading}
          className={cn('w-full sm:w-auto sm:min-w-[100px]', variant === 'compact' && 'w-auto min-w-[100px]')}
        >
          {agentsLoading ? (
            <option>Loading...</option>
          ) : availableAgents.length > 0 ? (
            availableAgents.map((agent) => (
              <option key={agent} value={agent}>
                {formatAgentName(agent)}
              </option>
            ))
          ) : (
            <option value="claude">Claude</option>
          )}
        </NativeSelect>
      </div>

      {/* Model selector */}
      <div className="flex items-center gap-2">
        {variant === 'default' && (
          <label htmlFor="model-selector" className="text-sm text-muted-foreground whitespace-nowrap">
            Model:
          </label>
        )}
        <ModelSelector
          id="model-selector"
          ariaLabel="Model"
          value={modelId}
          onChange={onModelChange}
          models={models}
          loading={modelsLoading}
          disabled={disabled}
          className={cn('w-full sm:w-auto sm:min-w-[140px]', variant === 'compact' && 'w-auto min-w-[140px]')}
        />
      </div>
    </div>
  )

  // Compact variant returns just the selectors
  if (variant === 'compact') {
    return <div className={className}>{selectorsContent}</div>
  }

  // Default variant wraps in a styled container
  return (
    <div
      className={cn(
        'flex flex-col gap-3 p-3 rounded-lg bg-muted/30 border border-border/50',
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium">
        <Bot className="h-4 w-4 text-muted-foreground" />
        <span>Configuration</span>
      </div>
      {selectorsContent}
    </div>
  )
}
