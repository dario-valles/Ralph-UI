/**
 * Ultra Research Agent Card with Models
 *
 * Wrapper component that loads models for a specific agent using the useAvailableModels hook.
 * This allows each agent card to independently manage its model loading state.
 */
import { UltraResearchAgentCard } from './UltraResearchAgentCard'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import type { ResearchAgent } from '@/types'
import type { AgentOption } from '@/hooks/useAgentModelSelector'

interface UltraResearchAgentCardWithModelsProps {
  agent: ResearchAgent
  index: number
  onUpdate: (updates: Partial<ResearchAgent>) => void
  onRemove: () => void
  disabled?: boolean
  showStatus?: boolean
  agentOptions: AgentOption[]
  agentsLoading: boolean
}

/**
 * Agent card wrapper that handles model loading for the agent's current configuration.
 * Uses the useAvailableModels hook to load models dynamically.
 */
export function UltraResearchAgentCardWithModels({
  agent,
  index,
  onUpdate,
  onRemove,
  disabled = false,
  showStatus = false,
  agentOptions,
  agentsLoading,
}: UltraResearchAgentCardWithModelsProps) {
  // Load models for this agent's current configuration
  const providerId = agent.agentType === 'claude' ? agent.providerId : undefined
  const { models, loading: modelsLoading, defaultModelId } = useAvailableModels(
    agent.agentType,
    providerId
  )

  return (
    <UltraResearchAgentCard
      agent={agent}
      index={index}
      onUpdate={onUpdate}
      onRemove={onRemove}
      disabled={disabled}
      showStatus={showStatus}
      agentOptions={agentOptions}
      models={models}
      modelsLoading={modelsLoading || agentsLoading}
      agentsLoading={agentsLoading}
      defaultModelId={defaultModelId}
    />
  )
}
