import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Slider } from '@/components/ui/slider'
import { Select } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Save,
  RotateCcw,
  RefreshCw,
  Loader2,
  AlertCircle,
  X,
  GripVertical,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { configApi } from '@/lib/config-api'
import { isTauri } from '@/lib/tauri-check'
import type {
  RalphConfig,
  RalphExecutionConfig,
  RalphGitConfig,
  RalphValidationConfig,
  RalphFallbackSettings,
  AgentType,
} from '@/types'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { groupModelsByProvider, formatProviderName } from '@/lib/model-api'

// UI-only settings that remain in localStorage
interface UISettings {
  theme: 'light' | 'dark' | 'system'
  terminalFontSize: number
  showTokenCounts: boolean
  confirmDestructiveActions: boolean
}

const defaultUISettings: UISettings = {
  theme: 'system',
  terminalFontSize: 14,
  showTokenCounts: true,
  confirmDestructiveActions: true,
}

const UI_SETTINGS_KEY = 'ralph-ui-settings'

export function SettingsPage() {
  // Backend config state
  const [config, setConfig] = useState<RalphConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // UI settings (localStorage only)
  const [uiSettings, setUISettings] = useState<UISettings>(defaultUISettings)

  // Track changes
  const [hasChanges, setHasChanges] = useState(false)
  const [savedMessage, setSavedMessage] = useState<string | null>(null)

  // Load available models for the current agent type
  const currentAgentType = (config?.execution?.agentType || 'claude') as AgentType
  const { models, loading: modelsLoading, defaultModelId } = useAvailableModels(currentAgentType)

  // Load available models for the fallback agent type
  const fallbackAgentType = (config?.fallback?.fallbackAgent || 'claude') as AgentType
  const {
    models: fallbackModels,
    loading: fallbackModelsLoading,
    defaultModelId: fallbackDefaultModelId,
  } = useAvailableModels(fallbackAgentType)

  // Load config from backend on mount
  const loadConfig = useCallback(async () => {
    if (!isTauri) {
      setLoading(false)
      setError('Settings require Tauri runtime. Running in development mode.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const loadedConfig = await configApi.get()
      setConfig(loadedConfig)
    } catch (err) {
      console.error('Failed to load config:', err)
      setError(err instanceof Error ? err.message : 'Failed to load configuration')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load UI settings from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(UI_SETTINGS_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        setUISettings({ ...defaultUISettings, ...parsed })
      } catch {
        console.error('Failed to parse stored UI settings')
      }
    }
  }, [])

  // Load backend config on mount
  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Update execution config locally
  const updateExecutionConfig = (updates: Partial<RalphExecutionConfig>) => {
    if (!config) return
    setConfig({
      ...config,
      execution: { ...config.execution, ...updates },
    })
    setHasChanges(true)
  }

  // Update git config locally
  const updateGitConfig = (updates: Partial<RalphGitConfig>) => {
    if (!config) return
    setConfig({
      ...config,
      git: { ...config.git, ...updates },
    })
    setHasChanges(true)
  }

  // Update validation config locally
  const updateValidationConfig = (updates: Partial<RalphValidationConfig>) => {
    if (!config) return
    setConfig({
      ...config,
      validation: { ...config.validation, ...updates },
    })
    setHasChanges(true)
  }

  // Update fallback config locally
  const updateFallbackConfig = (updates: Partial<RalphFallbackSettings>) => {
    if (!config) return
    setConfig({
      ...config,
      fallback: { ...config.fallback, ...updates },
    })
    setHasChanges(true)
  }

  // Update UI settings (localStorage only)
  const updateUISettingsLocal = (updates: Partial<UISettings>) => {
    setUISettings((prev) => ({ ...prev, ...updates }))
    setHasChanges(true)
  }

  // Save all changes
  const handleSave = async () => {
    if (!config) return

    setSaving(true)
    setError(null)

    try {
      // Save backend config
      if (isTauri) {
        // Update in-memory config first
        await Promise.all([
          configApi.updateExecution(config.execution),
          configApi.updateGit(config.git),
          configApi.updateValidation(config.validation),
          configApi.updateFallback(config.fallback),
        ])
        // Persist to disk
        await configApi.save()
      }

      // Save UI settings to localStorage
      localStorage.setItem(UI_SETTINGS_KEY, JSON.stringify(uiSettings))

      setHasChanges(false)
      setSavedMessage('Settings saved successfully')
      setTimeout(() => setSavedMessage(null), 3000)
    } catch (err) {
      console.error('Failed to save config:', err)
      setError(err instanceof Error ? err.message : 'Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  // Reset to defaults (reload from backend)
  const handleReset = async () => {
    setUISettings(defaultUISettings)
    await loadConfig()
    setHasChanges(true)
  }

  // Reload config from files
  const handleReload = async () => {
    if (!isTauri) return

    setLoading(true)
    setError(null)

    try {
      const reloadedConfig = await configApi.reload()
      setConfig(reloadedConfig)
      setHasChanges(false)
      setSavedMessage('Configuration reloaded from files')
      setTimeout(() => setSavedMessage(null), 3000)
    } catch (err) {
      console.error('Failed to reload config:', err)
      setError(err instanceof Error ? err.message : 'Failed to reload configuration')
    } finally {
      setLoading(false)
    }
  }

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading settings...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Configure your Ralph UI preferences</p>
        </div>
        <div className="flex gap-2">
          {isTauri && (
            <Button variant="outline" onClick={handleReload} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Reload from Files
            </Button>
          )}
          <Button variant="outline" onClick={handleReset} disabled={loading}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to Defaults
          </Button>
          <Button onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Success message */}
      {savedMessage && (
        <Card className="border-green-500 bg-green-50 dark:bg-green-950">
          <CardContent className="pt-4">
            <p className="text-green-700 dark:text-green-300">{savedMessage}</p>
          </CardContent>
        </Card>
      )}

      {/* Error message */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="execution" className="space-y-4">
        <TabsList>
          <TabsTrigger value="execution">Execution</TabsTrigger>
          <TabsTrigger value="git">Git</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="fallback">Fallback</TabsTrigger>
          <TabsTrigger value="ui">UI Preferences</TabsTrigger>
        </TabsList>

        {/* Execution Settings */}
        <TabsContent value="execution" className="space-y-4">
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
                        Object.entries(groupModelsByProvider(models)).map(
                          ([provider, providerModels]) => (
                            <optgroup key={provider} label={formatProviderName(provider)}>
                              {providerModels.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </optgroup>
                          )
                        )
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

                  <div className="space-y-2">
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
                    />
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
        </TabsContent>

        {/* Git Settings */}
        <TabsContent value="git" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Git Preferences</CardTitle>
              <CardDescription>Configure git-related settings for agents</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {config ? (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="branchPattern">Branch Pattern</Label>
                      <Input
                        id="branchPattern"
                        value={config.git.branchPattern}
                        onChange={(e) => updateGitConfig({ branchPattern: e.target.value })}
                        placeholder="ralph/{task_id}"
                      />
                      <p className="text-xs text-muted-foreground">
                        Pattern for branches created by agents. Use {'{task_id}'} as placeholder.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Pull Request Options</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="autoCreatePrs"
                          checked={config.git.autoCreatePrs}
                          onCheckedChange={(checked) =>
                            updateGitConfig({ autoCreatePrs: checked as boolean })
                          }
                        />
                        <Label htmlFor="autoCreatePrs">Automatically create pull requests</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="draftPrs"
                          checked={config.git.draftPrs}
                          onCheckedChange={(checked) =>
                            updateGitConfig({ draftPrs: checked as boolean })
                          }
                        />
                        <Label htmlFor="draftPrs">Create PRs as draft</Label>
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
        </TabsContent>

        {/* Validation Settings */}
        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Validation Configuration</CardTitle>
              <CardDescription>
                Configure test and lint settings for task validation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {config ? (
                <>
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Validation Options</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="runTests"
                          checked={config.validation.runTests}
                          onCheckedChange={(checked) =>
                            updateValidationConfig({ runTests: checked as boolean })
                          }
                        />
                        <Label htmlFor="runTests">Run tests before completion</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="runLint"
                          checked={config.validation.runLint}
                          onCheckedChange={(checked) =>
                            updateValidationConfig({ runLint: checked as boolean })
                          }
                        />
                        <Label htmlFor="runLint">Run linter before completion</Label>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="testCommand">Test Command (Optional)</Label>
                      <Input
                        id="testCommand"
                        value={config.validation.testCommand || ''}
                        onChange={(e) =>
                          updateValidationConfig({
                            testCommand: e.target.value || undefined,
                          })
                        }
                        placeholder="npm test"
                      />
                      <p className="text-xs text-muted-foreground">
                        Custom command to run tests. Leave empty for auto-detection.
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="lintCommand">Lint Command (Optional)</Label>
                      <Input
                        id="lintCommand"
                        value={config.validation.lintCommand || ''}
                        onChange={(e) =>
                          updateValidationConfig({
                            lintCommand: e.target.value || undefined,
                          })
                        }
                        placeholder="npm run lint"
                      />
                      <p className="text-xs text-muted-foreground">
                        Custom command to run linter. Leave empty for auto-detection.
                      </p>
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
        </TabsContent>

        {/* Fallback Settings */}
        <TabsContent value="fallback" className="space-y-4">
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
                            <div className="grid grid-cols-2 gap-4 mt-3">
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
                Configure the order of agents to try when the primary agent fails. The first agent
                is your primary, subsequent agents are fallbacks.
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
                              className="h-7 w-7 p-0"
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
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
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
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-destructive hover:text-destructive"
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
                              <X className="h-3.5 w-3.5" />
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
                                config.fallback.fallbackChain || [
                                  config.execution.agentType as AgentType,
                                ]
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
                        How often to check if the primary agent is available again after switching
                        to a fallback.
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

                  {/* Legacy Single Fallback (for backward compatibility) */}
                  <div className="space-y-4 pt-4 border-t">
                    <h4 className="text-sm font-medium text-muted-foreground">Legacy Settings</h4>
                    <p className="text-xs text-muted-foreground">
                      These settings are for backward compatibility. Use the Agent Chain above for
                      more control.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="fallbackAgent">Fallback Agent (Legacy)</Label>
                        <Select
                          id="fallbackAgent"
                          value={config.fallback.fallbackAgent || ''}
                          onChange={(e) =>
                            updateFallbackConfig({
                              fallbackAgent: e.target.value || undefined,
                              fallbackModel: undefined,
                            })
                          }
                          disabled={!config.fallback.enabled}
                        >
                          <option value="">None</option>
                          <option value="claude">Claude</option>
                          <option value="opencode">OpenCode</option>
                          <option value="cursor">Cursor</option>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="fallbackModel">Fallback Model (Legacy)</Label>
                        <Select
                          id="fallbackModel"
                          value={config.fallback.fallbackModel || fallbackDefaultModelId || ''}
                          onChange={(e) =>
                            updateFallbackConfig({
                              fallbackModel: e.target.value || undefined,
                            })
                          }
                          disabled={
                            !config.fallback.enabled ||
                            !config.fallback.fallbackAgent ||
                            fallbackModelsLoading
                          }
                        >
                          {fallbackModelsLoading ? (
                            <option>Loading models...</option>
                          ) : (
                            fallbackModels.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))
                          )}
                        </Select>
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
        </TabsContent>

        {/* UI Settings */}
        <TabsContent value="ui" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>UI Preferences</CardTitle>
              <CardDescription>Customize the application appearance</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="theme">Theme</Label>
                  <Select
                    id="theme"
                    value={uiSettings.theme}
                    onChange={(e) =>
                      updateUISettingsLocal({
                        theme: e.target.value as 'light' | 'dark' | 'system',
                      })
                    }
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="fontSize">
                    Terminal Font Size: {uiSettings.terminalFontSize}px
                  </Label>
                  <Slider
                    id="fontSize"
                    min={10}
                    max={24}
                    step={1}
                    value={[uiSettings.terminalFontSize]}
                    onValueChange={([v]) => updateUISettingsLocal({ terminalFontSize: v })}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-medium">Display Options</h4>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="showTokenCounts"
                      checked={uiSettings.showTokenCounts}
                      onCheckedChange={(checked) =>
                        updateUISettingsLocal({ showTokenCounts: checked as boolean })
                      }
                    />
                    <Label htmlFor="showTokenCounts">Show token counts in UI</Label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="confirmDestructive"
                      checked={uiSettings.confirmDestructiveActions}
                      onCheckedChange={(checked) =>
                        updateUISettingsLocal({ confirmDestructiveActions: checked as boolean })
                      }
                    />
                    <Label htmlFor="confirmDestructive">Confirm destructive actions</Label>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
