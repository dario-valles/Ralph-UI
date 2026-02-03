/**
 * Ultra Research Agent Card - Configuration card for a single research agent
 *
 * Uses the shared AgentModelSelector component for consistent agent/model selection
 * with dynamic provider support.
 */
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { X, Bot, Check, Loader2, AlertCircle } from 'lucide-react'
import { AgentModelSelector } from '@/components/shared/AgentModelSelector'
import type { ResearchAgent, ResearchAgentStatus, AgentType } from '@/types'
import type { AgentOption } from '@/hooks/useAgentModelSelector'
import type { ModelInfo } from '@/lib/model-api'

interface UltraResearchAgentCardProps {
  agent: ResearchAgent
  index: number
  onUpdate: (updates: Partial<ResearchAgent>) => void
  onRemove: () => void
  /** Whether the card inputs are disabled (e.g., during research) */
  disabled?: boolean
  /** Whether the agent can be removed (false when at minimum agent count) */
  canRemove?: boolean
  showStatus?: boolean
  /** Agent options with provider support (from useAgentModelSelector) */
  agentOptions: AgentOption[]
  /** Available models for this agent's current configuration */
  models: ModelInfo[]
  /** Whether models are loading */
  modelsLoading: boolean
  /** Whether agents are loading */
  agentsLoading: boolean
  /** Default model ID for the current agent */
  defaultModelId: string
}

const STATUS_ICONS: { [K in ResearchAgentStatus]: React.ReactNode } = {
  idle: <Bot className="h-3.5 w-3.5 text-muted-foreground" />,
  researching: <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin" />,
  discussing: <Loader2 className="h-3.5 w-3.5 text-purple-500 animate-spin" />,
  complete: <Check className="h-3.5 w-3.5 text-green-500" />,
  error: <AlertCircle className="h-3.5 w-3.5 text-red-500" />,
}

const STATUS_LABELS: { [K in ResearchAgentStatus]: string } = {
  idle: 'Ready',
  researching: 'Researching...',
  discussing: 'In Discussion',
  complete: 'Complete',
  error: 'Error',
}

export function UltraResearchAgentCard({
  agent,
  index,
  onUpdate,
  onRemove,
  disabled = false,
  canRemove = true,
  showStatus = false,
  agentOptions,
  models,
  modelsLoading,
  agentsLoading,
  defaultModelId,
}: UltraResearchAgentCardProps) {
  // Build the current composite value for the agent selector
  const currentAgentOptionValue =
    agent.providerId && agent.agentType === 'claude'
      ? `claude:${agent.providerId}`
      : agent.agentType

  // Handle combined agent+provider change
  const handleAgentOptionChange = (value: string) => {
    const [agentPart, providerPart] = value.split(':')
    onUpdate({
      agentType: agentPart as AgentType,
      providerId: providerPart || undefined,
      modelId: undefined, // Reset to use default for new agent/provider
    })
  }

  return (
    <Card className="p-3 relative">
      <div className="flex items-start gap-2">
        {/* Agent Number */}
        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
          {index + 1}
        </div>

        {/* Agent Config */}
        <div className="flex-1 min-w-0 space-y-2">
          {/* Agent Type & Model Row */}
          <AgentModelSelector
            variant="compact"
            idPrefix={`ultra-research-${agent.id}`}
            agentOptions={agentOptions}
            currentAgentOptionValue={currentAgentOptionValue}
            onAgentOptionChange={handleAgentOptionChange}
            agentType={agent.agentType}
            modelId={agent.modelId || ''}
            onModelChange={(modelId) => onUpdate({ modelId: modelId || undefined })}
            models={models}
            modelsLoading={modelsLoading}
            agentsLoading={agentsLoading}
            defaultModelId={defaultModelId}
            disabled={disabled}
            className="flex-wrap gap-2"
          />

          {/* Focus Area */}
          <div>
            <Input
              id={`ultra-research-${agent.id}-focus`}
              value={agent.angle || ''}
              onChange={(e) => onUpdate({ angle: e.target.value || undefined })}
              placeholder="Focus area (e.g., Security, UX)"
              disabled={disabled}
              className="h-8 text-xs"
            />
          </div>

          {/* Status Badge (when showing progress) */}
          {showStatus && (
            <div className="flex items-center gap-1.5">
              {STATUS_ICONS[agent.status]}
              <span className="text-xs text-muted-foreground">{STATUS_LABELS[agent.status]}</span>
            </div>
          )}
        </div>

        {/* Remove Button */}
        {canRemove && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            aria-label="Remove agent"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </Card>
  )
}
