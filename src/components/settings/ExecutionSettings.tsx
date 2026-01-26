import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { NativeSelect as Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { groupModelsByProvider, formatProviderName } from '@/lib/model-api'
import type { RalphConfig, RalphExecutionConfig, AgentType } from '@/types'

interface ExecutionSettingsProps {
  config: RalphConfig | null
  updateExecutionConfig: (updates: Partial<RalphExecutionConfig>) => void
}

export function ExecutionSettings({ config, updateExecutionConfig }: ExecutionSettingsProps) {
  // Load available models for the current agent type
  const currentAgentType = (config?.execution?.agentType || 'claude') as AgentType
  const { models, loading: modelsLoading, defaultModelId } = useAvailableModels(currentAgentType)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Execution Configuration</CardTitle>
        <CardDescription>Configure default settings for AI agent execution</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {config ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="agentType">Default Agent Type</Label>
              <Select
                id="agentType"
                value={config.execution.agentType}
                onChange={(e) => {
                  const newAgentType = e.target.value as AgentType
                  // Update agent type - model will be updated when models load for new agent type
                  updateExecutionConfig({
                    agentType: newAgentType,
                    model: undefined, // Will be set to default after models load
                  })
                }}
              >
                <option value="claude">Claude</option>
                <option value="opencode">OpenCode</option>
                <option value="cursor">Cursor</option>
                <option value="codex">Codex</option>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="defaultModel">Default Model</Label>
              <Select
                id="defaultModel"
                value={config.execution.model || defaultModelId || ''}
                onChange={(e) => updateExecutionConfig({ model: e.target.value })}
                disabled={modelsLoading}
              >
                {modelsLoading ? (
                  <option>Loading models...</option>
                ) : (
                  Object.entries(groupModelsByProvider(models)).map(([provider, providerModels]) => (
                    <optgroup key={provider} label={formatProviderName(provider)}>
                      {providerModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                  ))
                )}
              </Select>
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
              className={`space-y-2 ${config.execution.strategy === 'sequential' ? 'opacity-50' : ''}`}
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
