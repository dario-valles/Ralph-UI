import { useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect as Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { AgentModelSelector } from '@/components/shared/AgentModelSelector'
import { useAgentModelSelector } from '@/hooks/useAgentModelSelector'
import { parseAgentWithProvider } from '@/types/agent'
import type { RalphConfig, RalphExecutionConfig, AgentType } from '@/types'

interface ExecutionSettingsProps {
  config: RalphConfig | null
  updateExecutionConfig: (updates: Partial<RalphExecutionConfig>) => void
}

export function ExecutionSettings({
  config,
  updateExecutionConfig,
}: ExecutionSettingsProps): React.JSX.Element {
  const {
    agentOptions,
    models,
    modelsLoading,
    handleAgentOptionChange,
    setModelId,
    setAgentType,
    setProviderId,
    modelId,
    currentAgentOptionValue,
  } = useAgentModelSelector({
    initialAgent: (config?.execution?.agentType || 'claude') as AgentType,
    initialModel: config?.execution?.model,
    initialProvider: config?.execution?.apiProvider,
  })

  useEffect(() => {
    if (!config?.execution) return

    const { agentType, apiProvider, model } = config.execution
    setAgentType(agentType as AgentType)
    setProviderId(apiProvider)
    if (model) {
      setModelId(model)
    }
  }, [
    config?.execution?.agentType,
    config?.execution?.apiProvider,
    config?.execution?.model,
    config?.execution,
    setAgentType,
    setProviderId,
    setModelId,
  ])

  const handleAgentChange = (value: string): void => {
    handleAgentOptionChange(value)
    const { agentType, providerId } = parseAgentWithProvider(value)
    updateExecutionConfig({
      agentType,
      apiProvider: providerId,
      model: undefined,
    })
  }

  const handleModelChange = (id: string): void => {
    setModelId(id)
    updateExecutionConfig({ model: id })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution Configuration</CardTitle>
        <CardDescription>Configure default settings for AI agent execution</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {config ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <AgentModelSelector
                agentType={(config.execution.agentType || 'claude') as AgentType}
                modelId={modelId}
                onModelChange={handleModelChange}
                models={models}
                modelsLoading={modelsLoading}
                variant="default"
                agentOptions={agentOptions}
                currentAgentOptionValue={currentAgentOptionValue}
                onAgentOptionChange={handleAgentChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="strategy">Execution Strategy</Label>
              <Select
                id="strategy"
                value={config.execution.strategy}
                onChange={(e) => updateExecutionConfig({ strategy: e.target.value })}
              >
                <option value="sequential">Sequential (One at a time)</option>
                <option value="dependency_first">Dependency First (Parallel)</option>
                <option value="priority">Priority Order (Parallel)</option>
                <option value="fifo">FIFO (Parallel)</option>
                <option value="cost_first">Highest Cost First (Parallel)</option>
              </Select>
            </div>

            <div
              className={`space-y-2 ${
                config.execution.strategy === 'sequential' ? 'opacity-50' : ''
              }`}
            >
              <Label htmlFor="maxParallel">
                Max Parallel Agents: {config.execution.maxParallel}
              </Label>
              <Slider
                id="maxParallel"
                min={1}
                max={10}
                step={1}
                value={[config.execution.maxParallel]}
                onValueChange={([v]) => updateExecutionConfig({ maxParallel: v })}
                disabled={config.execution.strategy === 'sequential'}
              />
              {config.execution.strategy === 'sequential' && (
                <p className="text-xs text-muted-foreground">
                  Sequential strategy always runs one agent at a time.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxIterations">
                Max Iterations: {config.execution.maxIterations}
              </Label>
              <Slider
                id="maxIterations"
                min={1}
                max={50}
                step={1}
                value={[config.execution.maxIterations]}
                onValueChange={([v]) => updateExecutionConfig({ maxIterations: v })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxRetries">Max Retries: {config.execution.maxRetries}</Label>
              <Slider
                id="maxRetries"
                min={0}
                max={5}
                step={1}
                value={[config.execution.maxRetries]}
                onValueChange={([v]) => updateExecutionConfig({ maxRetries: v })}
              />
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Backend configuration not available. Running in development mode.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
