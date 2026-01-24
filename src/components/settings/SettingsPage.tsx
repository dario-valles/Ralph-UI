import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { NativeSelect as Select } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
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
  Volume2,
  VolumeX,
  Play,
  Bell,
  BellOff,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ListChecks,
  FileCode,
  Plus,
  Pencil,
  Trash2,
  Copy,
  FolderOpen,
  Globe,
  Package,
  Eye,
  EyeOff,
  Info,
} from 'lucide-react'
import { configApi } from '@/lib/config-api'
import { templateApi } from '@/lib/backend-api'
import { useProjectStore } from '@/stores/projectStore'
import { KeyBarCustomizer } from './KeyBarCustomizer'
import { GestureSettings } from './GestureSettings'
import { PushNotificationSettings } from './PushNotificationSettings'
import type {
  RalphConfig,
  RalphExecutionConfig,
  RalphGitConfig,
  RalphValidationConfig,
  RalphFallbackSettings,
  AgentType,
  TemplateInfo,
} from '@/types'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { groupModelsByProvider, formatProviderName } from '@/lib/model-api'
import { type SoundMode, playPreviewSound, resumeAudioContext } from '@/lib/audio'

// Notification type toggles for granular control (US-005)
interface NotificationToggles {
  completion: boolean // When all stories pass
  error: boolean // When errors occur
  maxIterations: boolean // When max iterations hit
  storyComplete: boolean // When individual story completes (optional)
}

// UI-only settings that remain in localStorage
interface UISettings {
  theme: 'light' | 'dark' | 'system'
  terminalFontSize: number
  showTokenCounts: boolean
  confirmDestructiveActions: boolean
  // Notification sound settings (US-004)
  soundMode: SoundMode
  soundVolume: number // 0-100
  // Notification settings (US-005)
  notificationsEnabled: boolean // Master toggle
  notificationToggles: NotificationToggles
}

const defaultNotificationToggles: NotificationToggles = {
  completion: true,
  error: true,
  maxIterations: true,
  storyComplete: false, // Optional, off by default
}

const defaultUISettings: UISettings = {
  theme: 'system',
  terminalFontSize: 14,
  showTokenCounts: true,
  confirmDestructiveActions: true,
  soundMode: 'system',
  soundVolume: 50,
  notificationsEnabled: true,
  notificationToggles: defaultNotificationToggles,
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

  // Template editor state (US-012)
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateInfo | null>(null)
  const [templateContent, setTemplateContent] = useState('')
  const [templateContentLoading, setTemplateContentLoading] = useState(false)
  const [isEditingTemplate, setIsEditingTemplate] = useState(false)
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateScope, setNewTemplateScope] = useState<'project' | 'global'>('project')
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

  // Template preview state (US-013)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewResult, setPreviewResult] = useState<
    import('@/types').TemplatePreviewResult | null
  >(null)

  // Get active project for project-scoped templates
  const { getActiveProject } = useProjectStore()
  const activeProject = getActiveProject()

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

  // Load templates
  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true)
    setTemplateError(null)

    try {
      const loadedTemplates = await templateApi.list(activeProject?.path)
      setTemplates(loadedTemplates)
    } catch (err) {
      console.error('Failed to load templates:', err)
      setTemplateError(err instanceof Error ? err.message : 'Failed to load templates')
    } finally {
      setTemplatesLoading(false)
    }
  }, [activeProject?.path])

  // Load templates on mount and when project changes
  useEffect(() => {
    loadTemplates()
  }, [loadTemplates])

  // Load template content when a template is selected
  const loadTemplateContent = useCallback(
    async (template: TemplateInfo) => {
      setTemplateContentLoading(true)
      setTemplateError(null)

      try {
        const content = await templateApi.getContent(template.name, activeProject?.path)
        setTemplateContent(content)
        setSelectedTemplate(template)
        setIsEditingTemplate(false)
      } catch (err) {
        console.error('Failed to load template content:', err)
        setTemplateError(err instanceof Error ? err.message : 'Failed to load template content')
      } finally {
        setTemplateContentLoading(false)
      }
    },
    [activeProject?.path]
  )

  // Save template
  const handleSaveTemplate = async () => {
    if (isCreatingTemplate && !newTemplateName.trim()) {
      setTemplateError('Template name is required')
      return
    }

    setTemplateSaving(true)
    setTemplateError(null)

    try {
      const name = isCreatingTemplate ? newTemplateName.trim() : selectedTemplate!.name
      const scope = isCreatingTemplate
        ? newTemplateScope
        : (selectedTemplate!.source as 'project' | 'global')

      await templateApi.save(name, templateContent, scope, activeProject?.path)

      // Reload templates
      await loadTemplates()

      // Reset state
      if (isCreatingTemplate) {
        setIsCreatingTemplate(false)
        setNewTemplateName('')
        // Select the newly created template
        setSelectedTemplate({ name, source: scope, description: '' })
      }
      setIsEditingTemplate(false)

      setSavedMessage('Template saved successfully')
      setTimeout(() => setSavedMessage(null), 3000)
    } catch (err) {
      console.error('Failed to save template:', err)
      setTemplateError(err instanceof Error ? err.message : 'Failed to save template')
    } finally {
      setTemplateSaving(false)
    }
  }

  // Delete template
  const handleDeleteTemplate = async () => {
    if (!selectedTemplate || selectedTemplate.source === 'builtin') return

    setTemplateSaving(true)
    setTemplateError(null)

    try {
      await templateApi.delete(
        selectedTemplate.name,
        selectedTemplate.source as 'project' | 'global',
        activeProject?.path
      )

      // Reload templates
      await loadTemplates()

      // Reset selection
      setSelectedTemplate(null)
      setTemplateContent('')
      setIsEditingTemplate(false)

      setSavedMessage('Template deleted successfully')
      setTimeout(() => setSavedMessage(null), 3000)
    } catch (err) {
      console.error('Failed to delete template:', err)
      setTemplateError(err instanceof Error ? err.message : 'Failed to delete template')
    } finally {
      setTemplateSaving(false)
    }
  }

  // Start creating a new template
  const handleCreateNew = () => {
    setIsCreatingTemplate(true)
    setIsEditingTemplate(true)
    setSelectedTemplate(null)
    setNewTemplateName('')
    setNewTemplateScope('project')
    setTemplateContent(
      '# New Template\n\nYou are working on:\n\n{{ task.title }}\n\n{{ task.description }}\n'
    )
  }

  // Cancel editing
  const handleCancelEdit = () => {
    if (isCreatingTemplate) {
      setIsCreatingTemplate(false)
      setNewTemplateName('')
      setTemplateContent('')
    }
    setIsEditingTemplate(false)
    setIsPreviewOpen(false)
    setPreviewResult(null)
  }

  // Preview template (US-013)
  const handlePreviewTemplate = async () => {
    if (!templateContent.trim()) return

    setPreviewLoading(true)
    setTemplateError(null)

    try {
      const result = await templateApi.preview(templateContent, activeProject?.path)
      setPreviewResult(result)
      setIsPreviewOpen(true)
    } catch (err) {
      console.error('Failed to preview template:', err)
      setTemplateError(err instanceof Error ? err.message : 'Failed to preview template')
    } finally {
      setPreviewLoading(false)
    }
  }

  // Get source icon for template
  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'project':
        return <FolderOpen className="h-3 w-3" />
      case 'global':
        return <Globe className="h-3 w-3" />
      case 'builtin':
        return <Package className="h-3 w-3" />
      default:
        return <FileCode className="h-3 w-3" />
    }
  }

  // Apply syntax highlighting to Tera/Jinja2 template code
  const highlightedContent = useMemo(() => {
    if (!templateContent) return ''
    // Simple highlighting for display (actual editing uses plain textarea)
    return templateContent
      .replace(/(\{\{.*?\}\})/g, '<span class="text-blue-600 dark:text-blue-400">$1</span>')
      .replace(/(\{%.*?%\})/g, '<span class="text-purple-600 dark:text-purple-400">$1</span>')
      .replace(/(\{#.*?#\})/g, '<span class="text-gray-500 dark:text-gray-400 italic">$1</span>')
  }, [templateContent])

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

  // Update templates config locally (US-014)
  const updateTemplatesConfig = (updates: Partial<import('@/types').RalphTemplateConfig>) => {
    if (!config) return
    setConfig({
      ...config,
      templates: { ...config.templates, ...updates },
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
      // Update in-memory config first
      await Promise.all([
        configApi.updateExecution(config.execution),
        configApi.updateGit(config.git),
        configApi.updateValidation(config.validation),
        configApi.updateFallback(config.fallback),
      ])
      // Persist to disk
      await configApi.save()

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            Configure your Ralph UI preferences
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleReload} disabled={loading}>
            <RefreshCw className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Reload from Files</span>
            <span className="sm:hidden">Reload</span>
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset} disabled={loading}>
            <RotateCcw className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Reset to Defaults</span>
            <span className="sm:hidden">Reset</span>
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            <span className="hidden sm:inline">Save Changes</span>
            <span className="sm:hidden">Save</span>
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
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="execution" className="text-xs sm:text-sm">
            Execution
          </TabsTrigger>
          <TabsTrigger value="git" className="text-xs sm:text-sm">
            Git
          </TabsTrigger>
          <TabsTrigger value="validation" className="text-xs sm:text-sm">
            Validation
          </TabsTrigger>
          <TabsTrigger value="fallback" className="text-xs sm:text-sm">
            Fallback
          </TabsTrigger>
          <TabsTrigger value="notifications" className="text-xs sm:text-sm">
            Notifications
          </TabsTrigger>
          <TabsTrigger value="templates" className="text-xs sm:text-sm">
            Templates
          </TabsTrigger>
          <TabsTrigger value="ui" className="text-xs sm:text-sm">
            UI
          </TabsTrigger>
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

                      <div
                        className={`flex items-center space-x-2 ${!config.git.autoCreatePrs ? 'opacity-50' : ''}`}
                      >
                        <Checkbox
                          id="draftPrs"
                          checked={config.git.draftPrs}
                          onCheckedChange={(checked) =>
                            updateGitConfig({ draftPrs: checked as boolean })
                          }
                          disabled={!config.git.autoCreatePrs}
                        />
                        <Label htmlFor="draftPrs">Create PRs as draft</Label>
                      </div>
                    </div>
                  </div>

                  <div
                    className={`grid gap-4 md:grid-cols-2 ${!config.git.autoCreatePrs ? 'opacity-50' : ''}`}
                  >
                    <div className="space-y-2">
                      <Label htmlFor="branchPattern">Branch Pattern</Label>
                      <Input
                        id="branchPattern"
                        value={config.git.branchPattern}
                        onChange={(e) => updateGitConfig({ branchPattern: e.target.value })}
                        placeholder="ralph/{task_id}"
                        disabled={!config.git.autoCreatePrs}
                      />
                      <p className="text-xs text-muted-foreground">
                        Pattern for branches created by agents. Use {'{task_id}'} as placeholder.
                        {!config.git.autoCreatePrs && ' (Enable auto-create PRs to configure)'}
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
                    <div
                      className={`space-y-2 ${!config.validation.runTests ? 'opacity-50' : ''}`}
                    >
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
                        disabled={!config.validation.runTests}
                      />
                      <p className="text-xs text-muted-foreground">
                        Custom command to run tests. Leave empty for auto-detection.
                        {!config.validation.runTests && ' (Enable tests to configure)'}
                      </p>
                    </div>

                    <div
                      className={`space-y-2 ${!config.validation.runLint ? 'opacity-50' : ''}`}
                    >
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
                        disabled={!config.validation.runLint}
                      />
                      <p className="text-xs text-muted-foreground">
                        Custom command to run linter. Leave empty for auto-detection.
                        {!config.validation.runLint && ' (Enable linting to configure)'}
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

        {/* Notification Settings (US-004 & US-005) */}
        <TabsContent value="notifications" className="space-y-4">
          {/* Master Toggle Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {uiSettings.notificationsEnabled ? (
                      <Bell className="h-5 w-5" />
                    ) : (
                      <BellOff className="h-5 w-5 text-muted-foreground" />
                    )}
                    Desktop Notifications
                  </CardTitle>
                  <CardDescription>
                    Control desktop notifications for Ralph Loop events
                  </CardDescription>
                </div>
                <Switch
                  id="notificationsEnabled"
                  checked={uiSettings.notificationsEnabled}
                  onCheckedChange={(checked) =>
                    updateUISettingsLocal({ notificationsEnabled: checked })
                  }
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Notification Type Toggles */}
              <div className="space-y-3">
                <h4 className="text-sm font-medium">Notification Types</h4>
                <div className="grid gap-3">
                  {/* Completion notifications */}
                  <div
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      !uiSettings.notificationsEnabled ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <div>
                        <Label htmlFor="notify-completion" className="font-medium">
                          Loop Completion
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          When all stories in a Ralph loop pass
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="notify-completion"
                      checked={uiSettings.notificationToggles.completion}
                      onCheckedChange={(checked) =>
                        updateUISettingsLocal({
                          notificationToggles: {
                            ...uiSettings.notificationToggles,
                            completion: checked,
                          },
                        })
                      }
                      disabled={!uiSettings.notificationsEnabled}
                    />
                  </div>

                  {/* Error notifications */}
                  <div
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      !uiSettings.notificationsEnabled ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <XCircle className="h-4 w-4 text-destructive" />
                      <div>
                        <Label htmlFor="notify-error" className="font-medium">
                          Errors & Failures
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          Agent crashes, parse errors, git conflicts, rate limits
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="notify-error"
                      checked={uiSettings.notificationToggles.error}
                      onCheckedChange={(checked) =>
                        updateUISettingsLocal({
                          notificationToggles: {
                            ...uiSettings.notificationToggles,
                            error: checked,
                          },
                        })
                      }
                      disabled={!uiSettings.notificationsEnabled}
                    />
                  </div>

                  {/* Max iterations notifications */}
                  <div
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      !uiSettings.notificationsEnabled ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                      <div>
                        <Label htmlFor="notify-max-iterations" className="font-medium">
                          Max Iterations
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          When the iteration limit is reached
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="notify-max-iterations"
                      checked={uiSettings.notificationToggles.maxIterations}
                      onCheckedChange={(checked) =>
                        updateUISettingsLocal({
                          notificationToggles: {
                            ...uiSettings.notificationToggles,
                            maxIterations: checked,
                          },
                        })
                      }
                      disabled={!uiSettings.notificationsEnabled}
                    />
                  </div>

                  {/* Story completion notifications (optional) */}
                  <div
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      !uiSettings.notificationsEnabled ? 'opacity-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <ListChecks className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      <div>
                        <Label htmlFor="notify-story-complete" className="font-medium">
                          Story Completion
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          When individual stories pass (can be frequent)
                        </p>
                      </div>
                    </div>
                    <Switch
                      id="notify-story-complete"
                      checked={uiSettings.notificationToggles.storyComplete}
                      onCheckedChange={(checked) =>
                        updateUISettingsLocal({
                          notificationToggles: {
                            ...uiSettings.notificationToggles,
                            storyComplete: checked,
                          },
                        })
                      }
                      disabled={!uiSettings.notificationsEnabled}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sound Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle>Notification Sounds</CardTitle>
              <CardDescription>Configure sound effects for Ralph Loop events</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="soundMode">Sound Mode</Label>
                  <Select
                    id="soundMode"
                    value={uiSettings.soundMode}
                    onChange={(e) => {
                      const mode = e.target.value as SoundMode
                      updateUISettingsLocal({ soundMode: mode })
                      // Resume audio context on user interaction
                      resumeAudioContext()
                    }}
                  >
                    <option value="off">Off - No sounds</option>
                    <option value="system">System - Simple notification tones</option>
                    <option value="ralph">Ralph - Fun themed sound effects</option>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {uiSettings.soundMode === 'off' && 'Notification sounds are disabled.'}
                    {uiSettings.soundMode === 'system' &&
                      'Simple, professional notification tones.'}
                    {uiSettings.soundMode === 'ralph' &&
                      'Fun, playful sound sequences inspired by Ralph Wiggum.'}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="soundVolume" className="flex items-center gap-2">
                      {uiSettings.soundMode === 'off' ? (
                        <VolumeX className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                      Volume: {uiSettings.soundVolume}%
                    </Label>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={uiSettings.soundMode === 'off'}
                      onClick={() => {
                        resumeAudioContext()
                        playPreviewSound(uiSettings.soundMode, uiSettings.soundVolume)
                      }}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Preview Sound
                    </Button>
                  </div>
                  <Slider
                    id="soundVolume"
                    min={0}
                    max={100}
                    step={5}
                    value={[uiSettings.soundVolume]}
                    onValueChange={([v]) => updateUISettingsLocal({ soundVolume: v })}
                    disabled={uiSettings.soundMode === 'off'}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Test Notification Card */}
          <Card>
            <CardHeader>
              <CardTitle>Test Notifications</CardTitle>
              <CardDescription>
                Verify your notification settings are working correctly
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={async () => {
                  // Play sound if enabled
                  if (uiSettings.soundMode !== 'off') {
                    resumeAudioContext()
                    playPreviewSound(uiSettings.soundMode, uiSettings.soundVolume)
                  }
                  // Send browser notification if enabled
                  if (uiSettings.notificationsEnabled) {
                    try {
                      if ('Notification' in window) {
                        if (Notification.permission === 'granted') {
                          new Notification('Ralph UI Test', {
                            body: 'This is a test notification from Ralph UI',
                            icon: '/favicon.ico',
                          })
                        } else if (Notification.permission !== 'denied') {
                          const permission = await Notification.requestPermission()
                          if (permission === 'granted') {
                            new Notification('Ralph UI Test', {
                              body: 'This is a test notification from Ralph UI',
                              icon: '/favicon.ico',
                            })
                          }
                        }
                      }
                    } catch (err) {
                      console.error('Failed to send test notification:', err)
                    }
                  }
                }}
                disabled={!uiSettings.notificationsEnabled && uiSettings.soundMode === 'off'}
              >
                <Bell className="h-4 w-4 mr-2" />
                Send Test Notification
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                {!uiSettings.notificationsEnabled && uiSettings.soundMode === 'off'
                  ? 'Enable notifications or sounds to test.'
                  : 'This will send a test desktop notification and play the configured sound.'}
              </p>
            </CardContent>
          </Card>

          {/* Push Notifications (Web Push for background notifications) */}
          <PushNotificationSettings />
        </TabsContent>

        {/* Template Editor (US-012) */}
        <TabsContent value="templates" className="space-y-4">
          {/* Default Template Setting (US-014) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCode className="h-5 w-5" />
                Default Template
              </CardTitle>
              <CardDescription>
                Select the default template for Ralph Loop executions. This can be overridden when
                starting a new execution.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {config ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="default-template">Default Template</Label>
                    <Select
                      id="default-template"
                      value={config.templates.defaultTemplate || ''}
                      onChange={(e) =>
                        updateTemplatesConfig({
                          defaultTemplate: e.target.value || undefined,
                        })
                      }
                      disabled={templatesLoading}
                      data-testid="default-template-select"
                    >
                      <option value="">Use first available template</option>
                      {templates.map((t) => (
                        <option key={`${t.source}-${t.name}`} value={t.name}>
                          {t.name} ({t.source})
                        </option>
                      ))}
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      The template to use by default when starting new Ralph Loop executions.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Backend configuration not available. Running in development mode.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Template Editor Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileCode className="h-5 w-5" />
                    Template Editor
                  </CardTitle>
                  <CardDescription>
                    Create and edit prompt templates for AI agent tasks. Templates use Tera/Jinja2
                    syntax.
                  </CardDescription>
                </div>
                <Button onClick={handleCreateNew} disabled={templatesLoading || isEditingTemplate}>
                  <Plus className="h-4 w-4 mr-2" />
                  New Template
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {templateError && (
                <div className="mb-4 p-3 rounded-md border border-destructive bg-destructive/10">
                  <div className="flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span className="text-sm">{templateError}</span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Template List */}
                <div className="lg:col-span-1">
                  <div className="border rounded-lg">
                    <div className="p-3 border-b bg-muted/30">
                      <h4 className="text-sm font-medium">Available Templates</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        {activeProject ? `Project: ${activeProject.name}` : 'No project selected'}
                      </p>
                    </div>
                    <ScrollArea className="h-[400px]">
                      {templatesLoading ? (
                        <div className="flex items-center justify-center h-20">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : templates.length === 0 ? (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          No templates found. Create one to get started.
                        </div>
                      ) : (
                        <div className="p-2 space-y-1">
                          {templates.map((template) => (
                            <button
                              key={`${template.source}-${template.name}`}
                              onClick={() => loadTemplateContent(template)}
                              disabled={isEditingTemplate}
                              className={`w-full text-left p-2 rounded-md transition-colors ${
                                selectedTemplate?.name === template.name &&
                                selectedTemplate?.source === template.source
                                  ? 'bg-primary/10 border border-primary'
                                  : 'hover:bg-muted border border-transparent'
                              } ${isEditingTemplate ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <div className="flex items-center gap-2">
                                {getSourceIcon(template.source)}
                                <span className="font-medium text-sm truncate">
                                  {template.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1 mt-1">
                                <Badge
                                  variant={template.source === 'builtin' ? 'secondary' : 'outline'}
                                  className="text-xs"
                                >
                                  {template.source}
                                </Badge>
                                {template.source === 'builtin' && (
                                  <span className="text-xs text-muted-foreground">(read-only)</span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </div>

                {/* Template Editor/Viewer */}
                <div className="lg:col-span-2">
                  {isCreatingTemplate ? (
                    <div className="border rounded-lg">
                      <div className="p-3 border-b bg-muted/30">
                        <h4 className="text-sm font-medium">Create New Template</h4>
                      </div>
                      <div className="p-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="template-name">Template Name</Label>
                            <Input
                              id="template-name"
                              value={newTemplateName}
                              onChange={(e) => setNewTemplateName(e.target.value)}
                              placeholder="my_template"
                              pattern="[a-z0-9_-]+"
                            />
                            <p className="text-xs text-muted-foreground">
                              Use lowercase letters, numbers, underscores, and hyphens
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="template-scope">Save To</Label>
                            <Select
                              id="template-scope"
                              value={newTemplateScope}
                              onChange={(e) =>
                                setNewTemplateScope(e.target.value as 'project' | 'global')
                              }
                            >
                              <option value="project" disabled={!activeProject}>
                                Project ({activeProject?.name || 'no project'})
                              </option>
                              <option value="global">Global (~/.ralph-ui/templates/)</option>
                            </Select>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="template-content">Template Content</Label>
                          <Textarea
                            id="template-content"
                            value={templateContent}
                            onChange={(e) => setTemplateContent(e.target.value)}
                            className="font-mono text-sm h-[280px] resize-none"
                            placeholder="Enter Tera/Jinja2 template content..."
                          />
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="text-muted-foreground">Syntax:</span>
                            <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                              {'{{ variable }}'}
                            </code>
                            <code className="px-1 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">
                              {'{% if condition %}'}
                            </code>
                            <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                              {'{# comment #}'}
                            </code>
                          </div>
                        </div>

                        {/* Preview panel for new template (US-013) */}
                        {isPreviewOpen && previewResult && (
                          <div className="space-y-3 p-3 border rounded-md bg-muted/20">
                            {!previewResult.success && previewResult.error && (
                              <div className="p-2 rounded border border-destructive bg-destructive/10">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                                  <div>
                                    <p className="text-sm font-medium text-destructive">
                                      Syntax Error
                                    </p>
                                    <p className="text-xs text-destructive/80 font-mono mt-1">
                                      {previewResult.error}
                                    </p>
                                    {previewResult.errorLine && (
                                      <p className="text-xs text-destructive/70 mt-1">
                                        Line {previewResult.errorLine}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-1 text-xs">
                              <span className="text-muted-foreground">Used:</span>
                              {previewResult.variablesUsed.map((v) => (
                                <Badge
                                  key={v}
                                  variant="default"
                                  className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 hover:bg-green-100"
                                >
                                  {v}
                                </Badge>
                              ))}
                              <span className="text-muted-foreground ml-2">Unused:</span>
                              {previewResult.variablesUnused.slice(0, 3).map((v) => (
                                <Badge key={v} variant="outline" className="text-xs opacity-60">
                                  {v}
                                </Badge>
                              ))}
                              {previewResult.variablesUnused.length > 3 && (
                                <span className="text-xs text-muted-foreground">
                                  +{previewResult.variablesUnused.length - 3} more
                                </span>
                              )}
                            </div>
                            {previewResult.success && previewResult.output && (
                              <ScrollArea className="h-[120px] border rounded p-2 bg-background">
                                <pre className="font-mono text-xs whitespace-pre-wrap">
                                  {previewResult.output}
                                </pre>
                              </ScrollArea>
                            )}
                          </div>
                        )}

                        <div className="flex justify-end gap-2">
                          <Button variant="outline" onClick={handleCancelEdit}>
                            Cancel
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handlePreviewTemplate}
                            disabled={previewLoading || !templateContent.trim()}
                          >
                            {previewLoading ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Eye className="h-4 w-4 mr-2" />
                            )}
                            Preview
                          </Button>
                          <Button
                            onClick={handleSaveTemplate}
                            disabled={templateSaving || !newTemplateName.trim()}
                          >
                            {templateSaving ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Save className="h-4 w-4 mr-2" />
                            )}
                            Create Template
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : selectedTemplate ? (
                    <div className="border rounded-lg">
                      <div className="p-3 border-b bg-muted/30 flex items-center justify-between">
                        <div>
                          <h4 className="text-sm font-medium flex items-center gap-2">
                            {getSourceIcon(selectedTemplate.source)}
                            {selectedTemplate.name}
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            {selectedTemplate.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedTemplate.source !== 'builtin' && (
                            <>
                              {!isEditingTemplate ? (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsEditingTemplate(true)}
                                  >
                                    <Pencil className="h-3 w-3 mr-1" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleDeleteTemplate}
                                    className="text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-3 w-3 mr-1" />
                                    Delete
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button variant="outline" size="sm" onClick={handleCancelEdit}>
                                    Cancel
                                  </Button>
                                  <Button
                                    size="sm"
                                    onClick={handleSaveTemplate}
                                    disabled={templateSaving}
                                  >
                                    {templateSaving ? (
                                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                    ) : (
                                      <Save className="h-3 w-3 mr-1" />
                                    )}
                                    Save
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePreviewTemplate}
                            disabled={previewLoading || !templateContent.trim()}
                          >
                            {previewLoading ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : isPreviewOpen ? (
                              <EyeOff className="h-3 w-3 mr-1" />
                            ) : (
                              <Eye className="h-3 w-3 mr-1" />
                            )}
                            {isPreviewOpen ? 'Hide' : 'Preview'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              navigator.clipboard.writeText(templateContent)
                              setSavedMessage('Template copied to clipboard')
                              setTimeout(() => setSavedMessage(null), 2000)
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      <div className="p-4">
                        {templateContentLoading ? (
                          <div className="flex items-center justify-center h-[300px]">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : isPreviewOpen && previewResult ? (
                          /* Template Preview Panel (US-013) */
                          <div className="space-y-4">
                            {/* Error display with line number */}
                            {!previewResult.success && previewResult.error && (
                              <div className="p-3 rounded-md border border-destructive bg-destructive/10">
                                <div className="flex items-start gap-2">
                                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                                  <div>
                                    <p className="text-sm font-medium text-destructive">
                                      Syntax Error
                                    </p>
                                    <p className="text-sm text-destructive/80 font-mono mt-1">
                                      {previewResult.error}
                                    </p>
                                    {previewResult.errorLine && (
                                      <p className="text-xs text-destructive/70 mt-1">
                                        Error on line {previewResult.errorLine}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Variable highlighting */}
                            <div className="flex flex-wrap gap-2 items-center text-xs">
                              <span className="text-muted-foreground font-medium">Variables:</span>
                              {previewResult.variablesUsed.map((v) => (
                                <Badge
                                  key={v}
                                  variant="default"
                                  className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900"
                                >
                                  {v}
                                </Badge>
                              ))}
                              {previewResult.variablesUnused.map((v) => (
                                <Badge
                                  key={v}
                                  variant="outline"
                                  className="text-muted-foreground opacity-60"
                                >
                                  {v}
                                </Badge>
                              ))}
                            </div>

                            {/* Rendered output */}
                            {previewResult.success && previewResult.output && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <h5 className="text-sm font-medium">Rendered Output</h5>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      if (previewResult.output) {
                                        navigator.clipboard.writeText(previewResult.output)
                                        setSavedMessage('Rendered output copied')
                                        setTimeout(() => setSavedMessage(null), 2000)
                                      }
                                    }}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                </div>
                                <ScrollArea className="h-[200px] border rounded-md p-3 bg-muted/30">
                                  <pre className="font-mono text-sm whitespace-pre-wrap break-words">
                                    {previewResult.output}
                                  </pre>
                                </ScrollArea>
                              </div>
                            )}

                            {/* Sample context info */}
                            <details className="text-xs">
                              <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                                <Info className="h-3 w-3" />
                                Sample context used for preview
                              </summary>
                              <div className="mt-2 p-2 border rounded-md bg-muted/20 space-y-1">
                                <p>
                                  <strong>Task:</strong> {previewResult.sampleContext.taskTitle}
                                </p>
                                <p>
                                  <strong>PRD Progress:</strong>{' '}
                                  {previewResult.sampleContext.prdCompletedCount}/
                                  {previewResult.sampleContext.prdTotalCount} stories
                                </p>
                                <p>
                                  <strong>Date:</strong> {previewResult.sampleContext.currentDate}
                                </p>
                              </div>
                            </details>

                            {/* Close preview button */}
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setIsPreviewOpen(false)
                                setPreviewResult(null)
                              }}
                            >
                              <EyeOff className="h-3 w-3 mr-1" />
                              Close Preview
                            </Button>
                          </div>
                        ) : isEditingTemplate ? (
                          <div className="space-y-2">
                            <Textarea
                              value={templateContent}
                              onChange={(e) => setTemplateContent(e.target.value)}
                              className="font-mono text-sm h-[320px] resize-none"
                            />
                            <div className="flex flex-wrap gap-2 text-xs">
                              <span className="text-muted-foreground">Syntax:</span>
                              <code className="px-1 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
                                {'{{ variable }}'}
                              </code>
                              <code className="px-1 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">
                                {'{% if condition %}'}
                              </code>
                              <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                                {'{# comment #}'}
                              </code>
                            </div>
                          </div>
                        ) : (
                          <ScrollArea className="h-[340px]">
                            <pre
                              className="font-mono text-sm whitespace-pre-wrap break-words"
                              dangerouslySetInnerHTML={{ __html: highlightedContent }}
                            />
                          </ScrollArea>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="border rounded-lg h-full min-h-[400px] flex items-center justify-center">
                      <div className="text-center text-muted-foreground">
                        <FileCode className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">Select a template to view or edit</p>
                        <p className="text-xs mt-1">Or click "New Template" to create one</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Available Variables Reference */}
              <div className="mt-4 pt-4 border-t">
                <h4 className="text-sm font-medium mb-2">Available Template Variables</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 bg-muted/30 rounded">
                    <code className="text-blue-600 dark:text-blue-400">{'{{ task.title }}'}</code>
                    <p className="text-muted-foreground mt-0.5">Task title</p>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <code className="text-blue-600 dark:text-blue-400">
                      {'{{ task.description }}'}
                    </code>
                    <p className="text-muted-foreground mt-0.5">Task description</p>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <code className="text-blue-600 dark:text-blue-400">
                      {'{{ acceptance_criteria }}'}
                    </code>
                    <p className="text-muted-foreground mt-0.5">Acceptance criteria list</p>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <code className="text-blue-600 dark:text-blue-400">
                      {'{{ recent_progress }}'}
                    </code>
                    <p className="text-muted-foreground mt-0.5">Recent progress entries</p>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <code className="text-blue-600 dark:text-blue-400">
                      {'{{ codebase_patterns }}'}
                    </code>
                    <p className="text-muted-foreground mt-0.5">From CLAUDE.md</p>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <code className="text-blue-600 dark:text-blue-400">
                      {'{{ prd_completed_count }}'}
                    </code>
                    <p className="text-muted-foreground mt-0.5">Completed story count</p>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <code className="text-blue-600 dark:text-blue-400">{'{{ current_date }}'}</code>
                    <p className="text-muted-foreground mt-0.5">Today's date</p>
                  </div>
                  <div className="p-2 bg-muted/30 rounded">
                    <code className="text-blue-600 dark:text-blue-400">{'{{ timestamp }}'}</code>
                    <p className="text-muted-foreground mt-0.5">ISO timestamp</p>
                  </div>
                </div>
              </div>
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

          <KeyBarCustomizer />

          <GestureSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
