/**
 * AgentModelSelector Component
 *
 * Reusable component for selecting an AI agent type and model.
 * Used across GSD workflow (research, requirements generation).
 *
 * Supports two variants:
 * - 'default': Stacked with labels, wrapped in a config box with Bot icon
 * - 'compact': Inline selectors without wrapper (for headers/toolbars)
 *
 * For Claude agent, supports alternative providers (Z.AI, MiniMax) when configured.
 */

import { Bot } from 'lucide-react'
import { NativeSelect } from '@/components/ui/select'
import { ModelSelector } from '@/components/shared/ModelSelector'
import { formatAgentName, type AgentType } from '@/types/agent'
import type { ModelInfo } from '@/lib/model-api'
import { cn } from '@/lib/utils'
import type { AgentOption } from '@/hooks/useAgentModelSelector'

export interface AgentModelSelectorProps {
  /** Currently selected agent type */
  agentType: AgentType
  /** Callback when agent type changes (legacy API) */
  onAgentChange?: (agentType: AgentType) => void
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
  /** Available agent types (legacy API, use agentOptions for provider support) */
  availableAgents?: AgentType[]
  /** Whether agents are loading */
  agentsLoading?: boolean
  /** Agent options with provider support (preferred over availableAgents) */
  agentOptions?: AgentOption[]
  /** Current composite value for agent+provider select */
  currentAgentOptionValue?: string
  /** Callback when agent option changes (handles agent+provider together) */
  onAgentOptionChange?: (value: string) => void
  /** ID prefix for form elements (for unique IDs when multiple instances exist) */
  idPrefix?: string
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
  agentOptions,
  currentAgentOptionValue,
  onAgentOptionChange,
  idPrefix,
}: AgentModelSelectorProps): React.JSX.Element {
  // Generate unique IDs for form elements
  const agentSelectId = idPrefix ? `${idPrefix}-agent-selector` : 'agent-selector'
  const modelSelectId = idPrefix ? `${idPrefix}-model-selector` : 'model-selector'
  // Determine which API to use for agent selection
  const useNewApi = agentOptions && onAgentOptionChange && currentAgentOptionValue !== undefined
  const currentValue = useNewApi ? currentAgentOptionValue : agentType

  const handleAgentSelectChange = (value: string) => {
    if (useNewApi && onAgentOptionChange) {
      onAgentOptionChange(value)
    } else if (onAgentChange) {
      onAgentChange(value as AgentType)
    }
  }

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
          <label htmlFor={agentSelectId} className="text-sm text-muted-foreground whitespace-nowrap">
            Agent:
          </label>
        )}
        <NativeSelect
          id={agentSelectId}
          aria-label="Agent"
          value={currentValue}
          onChange={(e) => handleAgentSelectChange(e.target.value)}
          disabled={disabled || agentsLoading}
          className={cn('w-full sm:w-auto sm:min-w-[100px]', variant === 'compact' && 'w-auto min-w-[100px]')}
        >
          {agentsLoading ? (
            <option>Loading...</option>
          ) : useNewApi && agentOptions ? (
            // New API with provider support
            agentOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))
          ) : availableAgents.length > 0 ? (
            // Legacy API
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
          <label htmlFor={modelSelectId} className="text-sm text-muted-foreground whitespace-nowrap">
            Model:
          </label>
        )}
        <ModelSelector
          id={modelSelectId}
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
