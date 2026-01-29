import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { NativeSelect as Select } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { GripVertical, ArrowUp, ArrowDown, X } from 'lucide-react'
import type { RalphConfig, RalphFallbackSettings, AgentType } from '@/types'

interface FallbackSettingsProps {
  config: RalphConfig | null
  updateFallbackConfig: (updates: Partial<RalphFallbackSettings>) => void
}

export function FallbackSettings({
  config,
  updateFallbackConfig,
}: FallbackSettingsProps): React.JSX.Element {
  return (
    <div className="space-y-4">
      {/* Error Strategy Card */}
      <Card>
        <CardHeader>
          <CardTitle>Error Handling Strategy</CardTitle>
          <CardDescription>
            Configure how the system handles errors during Ralph Loop iterations
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {config ? (
            <>
              <div className="space-y-4">
                <Label>Error Strategy</Label>
                <div className="grid gap-3">
                  <div
                    className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      config.fallback.errorStrategy?.type === 'retry' ||
                      !config.fallback.errorStrategy
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                    onClick={() =>
                      updateFallbackConfig({
                        errorStrategy: {
                          type: 'retry',
                          max_attempts:
                            config.fallback.errorStrategy?.type === 'retry'
                              ? config.fallback.errorStrategy.max_attempts
                              : 3,
                          backoff_ms:
                            config.fallback.errorStrategy?.type === 'retry'
                              ? config.fallback.errorStrategy.backoff_ms
                              : 1000,
                        },
                      })
                    }
                  >
                    <input
                      type="radio"
                      checked={
                        config.fallback.errorStrategy?.type === 'retry' ||
                        !config.fallback.errorStrategy
                      }
                      readOnly
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium">Retry (Recommended)</div>
                      <p className="text-sm text-muted-foreground">
                        Retry failed iterations with exponential backoff before trying fallback
                        agents
                      </p>
                      {(config.fallback.errorStrategy?.type === 'retry' ||
                        !config.fallback.errorStrategy) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                          <div className="space-y-2">
                            <Label className="text-xs">
                              Max Attempts:{' '}
                              {config.fallback.errorStrategy?.type === 'retry'
                                ? config.fallback.errorStrategy.max_attempts
                                : 3}
                            </Label>
                            <Slider
                              min={1}
                              max={10}
                              step={1}
                              value={[
                                config.fallback.errorStrategy?.type === 'retry'
                                  ? config.fallback.errorStrategy.max_attempts
                                  : 3,
                              ]}
                              onValueChange={([v]) =>
                                updateFallbackConfig({
                                  errorStrategy: {
                                    type: 'retry',
                                    max_attempts: v,
                                    backoff_ms:
                                      config.fallback.errorStrategy?.type === 'retry'
                                        ? config.fallback.errorStrategy.backoff_ms
                                        : 1000,
                                  },
                                })
                              }
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs">
                              Backoff:{' '}
                              {config.fallback.errorStrategy?.type === 'retry'
                                ? config.fallback.errorStrategy.backoff_ms
                                : 1000}
                              ms
                            </Label>
                            <Slider
                              min={100}
                              max={5000}
                              step={100}
                              value={[
                                config.fallback.errorStrategy?.type === 'retry'
                                  ? config.fallback.errorStrategy.backoff_ms
                                  : 1000,
                              ]}
                              onValueChange={([v]) =>
                                updateFallbackConfig({
                                  errorStrategy: {
                                    type: 'retry',
                                    max_attempts:
                                      config.fallback.errorStrategy?.type === 'retry'
                                        ? config.fallback.errorStrategy.max_attempts
                                        : 3,
                                    backoff_ms: v,
                                  },
                                })
                              }
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div
                    className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      config.fallback.errorStrategy?.type === 'skip'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                    onClick={() => updateFallbackConfig({ errorStrategy: { type: 'skip' } })}
                  >
                    <input
                      type="radio"
                      checked={config.fallback.errorStrategy?.type === 'skip'}
                      readOnly
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">Skip</div>
                      <p className="text-sm text-muted-foreground">
                        Skip failed iterations and continue with the next one
                      </p>
                    </div>
                  </div>

                  <div
                    className={`flex items-start space-x-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      config.fallback.errorStrategy?.type === 'abort'
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-muted-foreground/50'
                    }`}
                    onClick={() => updateFallbackConfig({ errorStrategy: { type: 'abort' } })}
                  >
                    <input
                      type="radio"
                      checked={config.fallback.errorStrategy?.type === 'abort'}
                      readOnly
                      className="mt-1"
                    />
                    <div>
                      <div className="font-medium">Abort</div>
                      <p className="text-sm text-muted-foreground">
                        Stop the entire Ralph Loop when an error occurs
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              Backend configuration not available. Running in development mode.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Fallback Agent Chain Card */}
      <Card>
        <CardHeader>
          <CardTitle>Fallback Agent Chain</CardTitle>
          <CardDescription>
            Configure the order of agents to try when the primary agent fails. The first agent is
            your primary, subsequent agents are fallbacks.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {config ? (
            <>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="fallbackEnabled"
                  checked={config.fallback.enabled}
                  onCheckedChange={(checked) =>
                    updateFallbackConfig({ enabled: checked as boolean })
                  }
                />
                <Label htmlFor="fallbackEnabled">Enable fallback agents</Label>
              </div>

              {/* Fallback Chain List */}
              <div className="space-y-3">
                <Label>Agent Priority Chain</Label>
                <div className="space-y-2">
                  {(
                    config.fallback.fallbackChain || [config.execution.agentType as AgentType]
                  ).map((agent, index) => (
                    <div
                      key={`${agent}-${index}`}
                      className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30"
                    >
                      <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                      <span className="flex-1 font-medium capitalize">
                        {index === 0 ? `${agent} (Primary)` : agent}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11 min-w-11 sm:h-7 sm:w-7 sm:min-h-0 sm:min-w-0 p-0"
                          disabled={index === 0 || !config.fallback.enabled}
                          onClick={() => {
                            const chain = [
                              ...(config.fallback.fallbackChain || [
                                config.execution.agentType as AgentType,
                              ]),
                            ]
                            ;[chain[index - 1], chain[index]] = [chain[index], chain[index - 1]]
                            updateFallbackConfig({ fallbackChain: chain })
                          }}
                        >
                          <ArrowUp className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11 min-w-11 sm:h-7 sm:w-7 sm:min-h-0 sm:min-w-0 p-0"
                          disabled={
                            index === (config.fallback.fallbackChain || []).length - 1 ||
                            !config.fallback.enabled
                          }
                          onClick={() => {
                            const chain = [
                              ...(config.fallback.fallbackChain || [
                                config.execution.agentType as AgentType,
                              ]),
                            ]
                            ;[chain[index], chain[index + 1]] = [chain[index + 1], chain[index]]
                            updateFallbackConfig({ fallbackChain: chain })
                          }}
                        >
                          <ArrowDown className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="min-h-11 min-w-11 sm:h-7 sm:w-7 sm:min-h-0 sm:min-w-0 p-0 text-destructive hover:text-destructive"
                          disabled={
                            (config.fallback.fallbackChain || []).length <= 1 ||
                            !config.fallback.enabled
                          }
                          onClick={() => {
                            const chain = (config.fallback.fallbackChain || []).filter(
                              (_, i) => i !== index
                            )
                            updateFallbackConfig({ fallbackChain: chain })
                          }}
                        >
                          <X className="h-4 w-4 sm:h-3.5 sm:w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add Agent Button */}
                <div className="flex items-center gap-2">
                  <Select
                    id="addFallbackAgent"
                    className="flex-1"
                    disabled={!config.fallback.enabled}
                    onChange={(e) => {
                      const agent = e.target.value as AgentType
                      if (agent) {
                        const chain = [
                          ...(config.fallback.fallbackChain || [
                            config.execution.agentType as AgentType,
                          ]),
                        ]
                        if (!chain.includes(agent)) {
                          chain.push(agent)
                          updateFallbackConfig({ fallbackChain: chain })
                        }
                      }
                      e.target.value = '' // Reset selection
                    }}
                  >
                    <option value="">Add agent to chain...</option>
                    {(['claude', 'opencode', 'cursor', 'codex'] as AgentType[])
                      .filter(
                        (a) =>
                          !(
                            config.fallback.fallbackChain || [config.execution.agentType as AgentType]
                          ).includes(a)
                      )
                      .map((agent) => (
                        <option key={agent} value={agent}>
                          {agent.charAt(0).toUpperCase() + agent.slice(1)}
                        </option>
                      ))}
                  </Select>
                </div>
              </div>

              {/* Recovery Settings */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-medium">Primary Agent Recovery</h4>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="testPrimaryRecovery"
                    checked={config.fallback.testPrimaryRecovery ?? true}
                    onCheckedChange={(checked) =>
                      updateFallbackConfig({ testPrimaryRecovery: checked as boolean })
                    }
                    disabled={!config.fallback.enabled}
                  />
                  <Label htmlFor="testPrimaryRecovery">
                    Periodically test if primary agent has recovered
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recoveryTestInterval">
                    Recovery Test Interval: Every {config.fallback.recoveryTestInterval ?? 5}{' '}
                    iterations
                  </Label>
                  <Slider
                    id="recoveryTestInterval"
                    min={1}
                    max={20}
                    step={1}
                    value={[config.fallback.recoveryTestInterval ?? 5]}
                    onValueChange={([v]) => updateFallbackConfig({ recoveryTestInterval: v })}
                    disabled={!config.fallback.enabled || !config.fallback.testPrimaryRecovery}
                  />
                  <p className="text-xs text-muted-foreground">
                    How often to check if the primary agent is available again after switching to a
                    fallback.
                  </p>
                </div>
              </div>

              {/* Backoff Settings */}
              <div className="space-y-4 pt-4 border-t">
                <h4 className="text-sm font-medium">Backoff Settings</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="baseBackoffMs">
                      Base Backoff: {config.fallback.baseBackoffMs}ms
                    </Label>
                    <Slider
                      id="baseBackoffMs"
                      min={100}
                      max={5000}
                      step={100}
                      value={[config.fallback.baseBackoffMs]}
                      onValueChange={([v]) => updateFallbackConfig({ baseBackoffMs: v })}
                      disabled={!config.fallback.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      Initial backoff delay before retrying.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="maxBackoffMs">
                      Max Backoff: {config.fallback.maxBackoffMs}ms
                    </Label>
                    <Slider
                      id="maxBackoffMs"
                      min={1000}
                      max={60000}
                      step={1000}
                      value={[config.fallback.maxBackoffMs]}
                      onValueChange={([v]) => updateFallbackConfig({ maxBackoffMs: v })}
                      disabled={!config.fallback.enabled}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum backoff delay for exponential backoff.
                    </p>
                  </div>
                </div>
              </div>

            </>
          ) : (
            <p className="text-muted-foreground">
              Backend configuration not available. Running in development mode.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
