/**
 * Hook for combined agent and model selection
 *
 * Manages the state for selecting an AI agent type and its available models.
 * Auto-selects the default model when the agent type changes.
 */

import { useState, useCallback } from 'react'
import type { AgentType } from '@/types'
import type { ModelInfo } from '@/lib/model-api'
import { useAvailableModels } from './useAvailableModels'
import { useAvailableAgents } from './useAvailableAgents'

interface UseAgentModelSelectorOptions {
  /** Initial agent type (defaults to 'claude') */
  initialAgent?: AgentType
  /** Initial model ID (uses default if not specified) */
  initialModel?: string
}

interface UseAgentModelSelectorReturn {
  /** Currently selected agent type */
  agentType: AgentType
  /** Set the agent type */
  setAgentType: (agent: AgentType) => void
  /** Currently selected model ID */
  modelId: string
  /** Set the model ID */
  setModelId: (modelId: string) => void
  /** Available models for the current agent */
  models: ModelInfo[]
  /** Whether models are loading */
  modelsLoading: boolean
  /** Default model ID for the current agent */
  defaultModelId: string
  /** Available agent types */
  availableAgents: AgentType[]
  /** Whether agents are loading */
  agentsLoading: boolean
}

/**
 * Hook to manage combined agent and model selection state
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const {
 *     agentType, setAgentType,
 *     modelId, setModelId,
 *     models, modelsLoading,
 *     availableAgents, agentsLoading
 *   } = useAgentModelSelector({ initialAgent: 'claude' })
 *
 *   return (
 *     <AgentModelSelector
 *       agentType={agentType}
 *       onAgentChange={setAgentType}
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
  const { initialAgent = 'claude', initialModel } = options

  // Agent state - use shared hook
  const [agentType, setAgentTypeInternal] = useState<AgentType>(initialAgent)
  const { agents: availableAgents, loading: agentsLoading } = useAvailableAgents()

  // Model state - empty string means use default
  const [userSelectedModel, setUserSelectedModel] = useState<string>(initialModel || '')

  // Get models for the current agent
  const { models, loading: modelsLoading, defaultModelId } = useAvailableModels(agentType)

  // Effective model ID is user selection or default
  const modelId = userSelectedModel || defaultModelId || ''

  // When agent changes, reset model to use the new agent's default
  const setAgentType = useCallback((agent: AgentType) => {
    setAgentTypeInternal(agent)
    setUserSelectedModel('') // Reset to use default for new agent
  }, [])

  // Set model explicitly
  const setModelId = useCallback((model: string) => {
    setUserSelectedModel(model)
  }, [])

  return {
    agentType,
    setAgentType,
    modelId,
    setModelId,
    models,
    modelsLoading,
    defaultModelId,
    availableAgents,
    agentsLoading,
  }
}
