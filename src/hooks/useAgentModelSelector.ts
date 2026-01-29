/**
 * Hook for combined agent and model selection
 *
 * Manages the state for selecting an AI agent type and its available models.
 * Auto-selects the default model when the agent type changes.
 *
 * For Claude agent type, supports alternative providers (Z.AI, MiniMax) when configured.
 */

import { useState, useCallback, useEffect } from 'react'
import type { AgentType, ApiProviderInfo } from '@/types'
import { formatAgentName } from '@/types/agent'
import type { ModelInfo } from '@/lib/model-api'
import { useAvailableModels } from './useAvailableModels'
import { useAvailableAgents } from './useAvailableAgents'
import { providerApi } from '@/lib/api/provider-api'

interface UseAgentModelSelectorOptions {
  /** Initial agent type (defaults to 'claude') */
  initialAgent?: AgentType
  /** Initial model ID (uses default if not specified) */
  initialModel?: string
  /** Initial provider ID for Claude (defaults to global active) */
  initialProvider?: string
}

/** Agent option with optional provider info */
export interface AgentOption {
  /** Value to use in select (e.g., "claude", "claude:zai", "cursor") */
  value: string
  /** Display label (e.g., "Claude", "Claude (Z.AI)", "Cursor") */
  label: string
  /** Base agent type */
  agentType: AgentType
  /** Provider ID if this is an alternative provider option */
  providerId?: string
}

interface UseAgentModelSelectorReturn {
  /** Currently selected agent type */
  agentType: AgentType
  /** Set the agent type */
  setAgentType: (agent: AgentType) => void
  /** Currently selected provider ID (only for Claude) */
  providerId?: string
  /** Set the provider ID */
  setProviderId: (providerId?: string) => void
  /** Currently selected model ID */
  modelId: string
  /** Set the model ID */
  setModelId: (modelId: string) => void
  /** Available models for the current agent/provider */
  models: ModelInfo[]
  /** Whether models are loading */
  modelsLoading: boolean
  /** Default model ID for the current agent */
  defaultModelId: string
  /** Available agent types (for backward compatibility) */
  availableAgents: AgentType[]
  /** Available agent options (including provider variants for Claude) */
  agentOptions: AgentOption[]
  /** Whether agent options are loading */
  agentsLoading: boolean
  /** Handle combined agent+provider selection from a composite value */
  handleAgentOptionChange: (value: string) => void
  /** Get the current composite value for the select */
  currentAgentOptionValue: string
}

/**
 * Hook to manage combined agent and model selection state
 *
 * Supports alternative Claude providers (Z.AI, MiniMax) when configured.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {
 *     agentType, providerId,
 *     modelId, setModelId,
 *     models, modelsLoading,
 *     agentOptions, agentsLoading,
 *     handleAgentOptionChange, currentAgentOptionValue
 *   } = useAgentModelSelector({ initialAgent: 'claude' })
 *
 *   return (
 *     <AgentModelSelector
 *       agentOptions={agentOptions}
 *       currentValue={currentAgentOptionValue}
 *       onAgentOptionChange={handleAgentOptionChange}
 *       modelId={modelId}
 *       onModelChange={setModelId}
 *       models={models}
 *       modelsLoading={modelsLoading}
 *     />
 *   )
 * }
 * ```
 */
export function useAgentModelSelector(
  options: UseAgentModelSelectorOptions = {}
): UseAgentModelSelectorReturn {
  const { initialAgent = 'claude', initialModel, initialProvider } = options

  // Agent state
  const [agentType, setAgentTypeInternal] = useState<AgentType>(initialAgent)
  const [providerId, setProviderIdInternal] = useState<string | undefined>(initialProvider)
  const { agents: availableAgents, loading: agentsLoading } = useAvailableAgents()

  // Provider state for building Claude options
  const [providers, setProviders] = useState<ApiProviderInfo[]>([])
  const [providersLoading, setProvidersLoading] = useState(false)

  // Model state - empty string means use default
  const [userSelectedModel, setUserSelectedModel] = useState<string>(initialModel || '')

  // Get models for the current agent (with provider for Claude)
  const { models, loading: modelsLoading, defaultModelId } = useAvailableModels(
    agentType,
    agentType === 'claude' ? providerId : undefined
  )

  // Effective model ID is user selection or default
  const modelId = userSelectedModel || defaultModelId || ''

  // Fetch providers on mount
  useEffect(() => {
    let cancelled = false

    const fetchProviders = async () => {
      setProvidersLoading(true)
      try {
        const result = await providerApi.getAll()
        if (!cancelled) {
          setProviders(result)
        }
      } catch (err) {
        console.error('Failed to fetch providers:', err)
      } finally {
        if (!cancelled) {
          setProvidersLoading(false)
        }
      }
    }

    fetchProviders()
    return () => {
      cancelled = true
    }
  }, [])

  // Build agent options including provider variants for Claude
  const agentOptions: AgentOption[] = availableAgents.flatMap((agent): AgentOption[] => {
    if (agent === 'claude') {
      // For Claude, add one option per configured provider
      const claudeOptions: AgentOption[] = []

      // Always include base Claude (Anthropic)
      claudeOptions.push({
        value: 'claude',
        label: 'Claude',
        agentType: 'claude',
        providerId: undefined,
      })

      // Add configured alternative providers
      for (const provider of providers) {
        if (provider.id !== 'anthropic' && provider.hasToken) {
          claudeOptions.push({
            value: `claude:${provider.id}`,
            label: `Claude (${provider.name})`,
            agentType: 'claude',
            providerId: provider.id,
          })
        }
      }

      return claudeOptions
    }

    // Other agents have a single option
    return [
      {
        value: agent,
        label: formatAgentName(agent),
        agentType: agent,
      },
    ]
  })

  // Current composite value for the select
  const currentAgentOptionValue = providerId && agentType === 'claude'
    ? `claude:${providerId}`
    : agentType

  // Handle combined agent+provider selection
  const handleAgentOptionChange = useCallback((value: string) => {
    const [agentPart, providerPart] = value.split(':')
    setAgentTypeInternal(agentPart as AgentType)
    setProviderIdInternal(providerPart || undefined)
    setUserSelectedModel('') // Reset to use default for new agent/provider
  }, [])

  // When agent changes, reset model and provider
  const setAgentType = useCallback((agent: AgentType) => {
    setAgentTypeInternal(agent)
    if (agent !== 'claude') {
      setProviderIdInternal(undefined)
    }
    setUserSelectedModel('')
  }, [])

  // Set provider explicitly
  const setProviderId = useCallback((provider?: string) => {
    setProviderIdInternal(provider)
    setUserSelectedModel('')
  }, [])

  // Set model explicitly
  const setModelId = useCallback((model: string) => {
    setUserSelectedModel(model)
  }, [])

  return {
    agentType,
    setAgentType,
    providerId,
    setProviderId,
    modelId,
    setModelId,
    models,
    modelsLoading,
    defaultModelId,
    availableAgents,
    agentOptions,
    agentsLoading: agentsLoading || providersLoading,
    handleAgentOptionChange,
    currentAgentOptionValue,
  }
}
