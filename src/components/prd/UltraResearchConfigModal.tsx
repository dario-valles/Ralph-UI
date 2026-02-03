/**
 * Ultra Research Configuration Modal
 *
 * Allows users to configure multi-agent deep research settings:
 * - Execution mode (parallel vs sequential)
 * - Research agents (2-5 agents with type/provider/focus)
 * - Discussion rounds (0-3)
 * - Synthesizer model
 */
import { useState } from 'react'
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
import { NativeSelect as Select } from '@/components/ui/select'
import { Card } from '@/components/ui/card'
import { Tooltip } from '@/components/ui/tooltip'
import { Zap, Layers, Plus, Info, Microscope } from 'lucide-react'
import { usePRDChatStore } from '@/stores/prdChatStore'
import { UltraResearchAgentCard } from './UltraResearchAgentCard'
import {
  type UltraResearchConfig,
  type ResearchAgent,
  type ResearchExecutionMode,
  createDefaultResearchAgent,
  MAX_RESEARCH_AGENTS,
  MAX_DISCUSSION_ROUNDS,
} from '@/types'

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
      synthesizeModel: 'claude',
    }
  }

  const initial = getInitialValues()

  // Local state for editing
  const [mode, setMode] = useState<ResearchExecutionMode>(initial.mode)
  const [agents, setAgents] = useState<ResearchAgent[]>(initial.agents)
  const [discussionRounds, setDiscussionRounds] = useState(initial.discussionRounds)
  const [synthesizeModel, setSynthesizeModel] = useState(initial.synthesizeModel)

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
    const config: UltraResearchConfig = {
      id: ultraResearchConfig?.id || '',
      enabled: true,
      mode,
      agents,
      discussionRounds,
      synthesizeModel,
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
              <UltraResearchAgentCard
                key={agent.id}
                agent={agent}
                index={index}
                onUpdate={(updates) => handleUpdateAgent(index, updates)}
                onRemove={() => handleRemoveAgent(index)}
                disabled={agents.length <= 2 && index < 2}
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

        {/* Synthesizer Model */}
        <div className="space-y-2">
          <Label htmlFor="synthesize-model" className="text-sm font-medium">
            Synthesizer Model
          </Label>
          <Select
            id="synthesize-model"
            value={synthesizeModel}
            onChange={(e) => setSynthesizeModel(e.target.value)}
            className="w-full h-9"
          >
            <option value="claude">Claude</option>
            <option value="opencode">OpenCode</option>
            <option value="cursor">Cursor</option>
          </Select>
          <p className="text-xs text-muted-foreground">
            Model used to synthesize all findings into the final PRD
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
