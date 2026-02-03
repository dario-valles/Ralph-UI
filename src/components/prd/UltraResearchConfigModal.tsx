/**
 * Ultra Research Configuration Modal
 *
 * Allows users to configure multi-agent deep research settings:
 * - Execution mode (parallel vs sequential)
 * - Research agents (2-5 agents with type/provider/model/focus)
 * - Discussion rounds (0-3)
 * - Synthesizer agent/model
 *
 * Uses the shared AgentModelSelector pattern for consistent provider/model selection.
 */
import { useState, useEffect, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Card } from '@/components/ui/card'
import { Tooltip } from '@/components/ui/tooltip'
import { Zap, Layers, Plus, Info, Microscope } from 'lucide-react'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { useAvailableAgents } from '@/hooks/useAvailableAgents'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { providerApi } from '@/lib/api/provider-api'
import { GroupedAgentModelSelector } from '@/components/shared/GroupedAgentModelSelector'
import { UltraResearchAgentCardWithModels } from './UltraResearchAgentCardWithModels'
import {
  type UltraResearchConfig,
  type ResearchAgent,
  type ResearchExecutionMode,
  type ApiProviderInfo,
  type AgentType,
  createDefaultResearchAgent,
  MAX_RESEARCH_AGENTS,
  MAX_DISCUSSION_ROUNDS,
} from '@/types'
import { formatAgentName } from '@/types/agent'
import type { AgentOption } from '@/hooks/useAgentModelSelector'

/**
 * Modal wrapper - handles open/close state
 */
export function UltraResearchConfigModal() {
  const { isConfigModalOpen, closeConfigModal } = usePRDChatStore()

  return (
    <Dialog open={isConfigModalOpen} onOpenChange={(open) => !open && closeConfigModal()}>
      {isConfigModalOpen && <UltraResearchConfigContent />}
    </Dialog>
  )
}

/**
 * Inner content - only renders when modal is open, resets state on remount
 */
function UltraResearchConfigContent() {
  const { ultraResearchConfig, closeConfigModal, setUltraResearchConfig } = usePRDChatStore()

  // Load available agents (static list)
  const { agents: availableAgents, loading: agentsLoading } = useAvailableAgents()

  // Load providers for Claude alternatives
  const [providers, setProviders] = useState<ApiProviderInfo[]>([])
  const [providersLoading, setProvidersLoading] = useState(true)

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

  // Build agent options with provider variants for Claude
  const agentOptions: AgentOption[] = useMemo(() => {
    return availableAgents.flatMap((agent): AgentOption[] => {
      if (agent === 'claude') {
        const claudeOptions: AgentOption[] = [
          {
            value: 'claude',
            label: 'Claude',
            agentType: 'claude',
            providerId: undefined,
          },
        ]

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

      return [
        {
          value: agent,
          label: formatAgentName(agent),
          agentType: agent,
        },
      ]
    })
  }, [availableAgents, providers])

  // Initialize state from config or defaults (only runs on mount)
  const getInitialValues = () => {
    if (ultraResearchConfig) {
      return {
        mode: ultraResearchConfig.mode,
        agents:
          ultraResearchConfig.agents.length > 0
            ? ultraResearchConfig.agents
            : [createDefaultResearchAgent('agent-1', 'claude')],
        discussionRounds: ultraResearchConfig.discussionRounds,
        synthesizeAgent: 'claude' as AgentType,
        synthesizeProviderId: undefined as string | undefined,
        synthesizeModel: ultraResearchConfig.synthesizeModel,
      }
    }
    return {
      mode: 'parallel' as ResearchExecutionMode,
      agents: [
        createDefaultResearchAgent('agent-1', 'claude'),
        createDefaultResearchAgent('agent-2', 'opencode'),
      ],
      discussionRounds: 1,
      synthesizeAgent: 'claude' as AgentType,
      synthesizeProviderId: undefined as string | undefined,
      synthesizeModel: '',
    }
  }

  const initial = getInitialValues()

  // Local state for editing
  const [mode, setMode] = useState<ResearchExecutionMode>(initial.mode)
  const [agents, setAgents] = useState<ResearchAgent[]>(initial.agents)
  const [discussionRounds, setDiscussionRounds] = useState(initial.discussionRounds)
  const [synthesizeAgent, setSynthesizeAgent] = useState<AgentType>(initial.synthesizeAgent)
  const [synthesizeProviderId, setSynthesizeProviderId] = useState<string | undefined>(
    initial.synthesizeProviderId
  )
  const [synthesizeModel, setSynthesizeModel] = useState(initial.synthesizeModel)

  // Load models for synthesizer
  const synthesizerModels = useAvailableModels(
    synthesizeAgent,
    synthesizeAgent === 'claude' ? synthesizeProviderId : undefined
  )

  // Synthesizer agent option value
  const synthesizerAgentOptionValue =
    synthesizeProviderId && synthesizeAgent === 'claude'
      ? `claude:${synthesizeProviderId}`
      : synthesizeAgent

  const handleSynthesizerAgentChange = (value: string) => {
    const [agentPart, providerPart] = value.split(':')
    setSynthesizeAgent(agentPart as AgentType)
    setSynthesizeProviderId(providerPart || undefined)
    setSynthesizeModel('') // Reset to default for new agent
  }

  const handleAddAgent = () => {
    if (agents.length >= MAX_RESEARCH_AGENTS) return

    const newAgent = createDefaultResearchAgent(`agent-${agents.length + 1}`, 'claude')
    setAgents([...agents, newAgent])
  }

  const handleUpdateAgent = (index: number, updates: Partial<ResearchAgent>) => {
    setAgents((prev) =>
      prev.map((agent, i) => (i === index ? { ...agent, ...updates } : agent))
    )
  }

  const handleRemoveAgent = (index: number) => {
    if (agents.length <= 2) return // Minimum 2 agents
    setAgents((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSave = () => {
    // Store synthesizer as agent:provider:model string or just model
    const synthesizerValue = synthesizeModel || synthesizerModels.defaultModelId

    const config: UltraResearchConfig = {
      id: ultraResearchConfig?.id || '',
      enabled: true,
      mode,
      agents,
      discussionRounds,
      synthesizeModel: synthesizerValue,
    }

    setUltraResearchConfig(config)
    closeConfigModal()
  }

  const handleCancel = () => {
    // If there was no prior config, disable ultra research
    if (!ultraResearchConfig?.id) {
      setUltraResearchConfig(null)
    }
    closeConfigModal()
  }

  const isLoading = agentsLoading || providersLoading

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Microscope className="h-5 w-5 text-purple-600" />
          Ultra Research Configuration
        </DialogTitle>
        <DialogDescription>
          Configure multi-agent deep research for comprehensive PRD creation.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6 py-4">
        {/* Execution Mode */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Execution Mode</Label>
          <div className="grid grid-cols-2 gap-3">
            <Card
              className={`p-3 cursor-pointer transition-colors ${
                mode === 'parallel'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30'
                  : 'hover:bg-muted/50'
              }`}
              onClick={() => setMode('parallel')}
            >
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-purple-600" />
                <span className="font-medium text-sm">Parallel</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Faster, more diverse. All agents research simultaneously.
              </p>
            </Card>

            <Card
              className={`p-3 cursor-pointer transition-colors ${
                mode === 'sequential'
                  ? 'border-purple-500 bg-purple-50 dark:bg-purple-950/30'
                  : 'hover:bg-muted/50'
              }`}
              onClick={() => setMode('sequential')}
            >
              <div className="flex items-center gap-2 mb-1">
                <Layers className="h-4 w-4 text-purple-600" />
                <span className="font-medium text-sm">Sequential</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Iterative, deeper. Agents build on each other's findings.
              </p>
            </Card>
          </div>
        </div>

        {/* Research Agents */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              Research Agents ({agents.length}/{MAX_RESEARCH_AGENTS})
            </Label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddAgent}
              disabled={agents.length >= MAX_RESEARCH_AGENTS}
              className="h-7 text-xs"
            >
              <Plus className="h-3 w-3 mr-1" />
              Add Agent
            </Button>
          </div>

          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {agents.map((agent, index) => (
              <UltraResearchAgentCardWithModels
                key={agent.id}
                agent={agent}
                index={index}
                onUpdate={(updates) => handleUpdateAgent(index, updates)}
                onRemove={() => handleRemoveAgent(index)}
                disabled={agents.length <= 2 && index < 2}
                agentOptions={agentOptions}
                agentsLoading={isLoading}
              />
            ))}
          </div>
        </div>

        {/* Discussion Rounds */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium">Discussion Rounds: {discussionRounds}</Label>
            <Tooltip content="Agents critique each other's findings before synthesis">
              <Info className="h-3.5 w-3.5 text-muted-foreground" />
            </Tooltip>
          </div>
          <Slider
            value={[discussionRounds]}
            onValueChange={([value]) => setDiscussionRounds(value)}
            min={0}
            max={MAX_DISCUSSION_ROUNDS}
            step={1}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            {discussionRounds === 0
              ? 'No discussion - findings go directly to synthesis'
              : `${discussionRounds} round${discussionRounds > 1 ? 's' : ''} of agent discussion`}
          </p>
        </div>

        {/* Synthesizer Agent/Model */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Synthesizer</Label>
          <GroupedAgentModelSelector
            agentOptions={agentOptions}
            currentAgentOptionValue={synthesizerAgentOptionValue}
            onAgentOptionChange={handleSynthesizerAgentChange}
            modelId={synthesizeModel}
            defaultModelId={synthesizerModels.defaultModelId}
            onModelChange={setSynthesizeModel}
            models={synthesizerModels.models}
            modelsLoading={synthesizerModels.loading}
            agentsLoading={isLoading}
            disabled={false}
            idPrefix="synthesizer"
            agentWidth="w-28"
            modelWidth="w-40"
          />
          <p className="text-xs text-muted-foreground">
            Agent and model used to synthesize all findings into the final PRD
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={handleCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700">
          Save Configuration
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}
