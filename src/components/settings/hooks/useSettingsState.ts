import { useState, useEffect, useCallback } from 'react'
import { configApi } from '@/lib/api/config-api'
import { templateApi } from '@/lib/backend-api'
import { useProjectStore } from '@/stores/projectStore'
import type {
  RalphConfig,
  RalphExecutionConfig,
  RalphGitConfig,
  RalphValidationConfig,
  RalphFallbackSettings,
  RalphTemplateConfig,
  TemplateInfo,
  TemplatePreviewResult,
  Project,
} from '@/types'
import { type SoundMode } from '@/lib/audio'

// Notification type toggles for granular control (US-005)
export interface NotificationToggles {
  completion: boolean // When all stories pass
  error: boolean // When errors occur
  maxIterations: boolean // When max iterations hit
  storyComplete: boolean // When individual story completes (optional)
}

// UI-only settings that remain in localStorage
export interface UISettings {
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

export const defaultNotificationToggles: NotificationToggles = {
  completion: true,
  error: true,
  maxIterations: true,
  storyComplete: false, // Optional, off by default
}

export const defaultUISettings: UISettings = {
  theme: 'system',
  terminalFontSize: 14,
  showTokenCounts: true,
  confirmDestructiveActions: true,
  soundMode: 'system',
  soundVolume: 50,
  notificationsEnabled: true,
  notificationToggles: defaultNotificationToggles,
}

export const UI_SETTINGS_KEY = 'ralph-ui-settings'

export interface UseSettingsStateReturn {
  // Backend config state
  config: RalphConfig | null
  setConfig: React.Dispatch<React.SetStateAction<RalphConfig | null>>
  loading: boolean
  setLoading: React.Dispatch<React.SetStateAction<boolean>>
  saving: boolean
  error: string | null
  setError: React.Dispatch<React.SetStateAction<string | null>>

  // UI settings (localStorage only)
  uiSettings: UISettings
  setUISettings: React.Dispatch<React.SetStateAction<UISettings>>

  // Track changes
  hasChanges: boolean
  setHasChanges: React.Dispatch<React.SetStateAction<boolean>>
  savedMessage: string | null
  setSavedMessage: React.Dispatch<React.SetStateAction<string | null>>

  // Template state
  templates: TemplateInfo[]
  setTemplates: React.Dispatch<React.SetStateAction<TemplateInfo[]>>
  templatesLoading: boolean
  selectedTemplate: TemplateInfo | null
  setSelectedTemplate: React.Dispatch<React.SetStateAction<TemplateInfo | null>>
  templateContent: string
  setTemplateContent: React.Dispatch<React.SetStateAction<string>>
  templateContentLoading: boolean
  isEditingTemplate: boolean
  setIsEditingTemplate: React.Dispatch<React.SetStateAction<boolean>>
  isCreatingTemplate: boolean
  setIsCreatingTemplate: React.Dispatch<React.SetStateAction<boolean>>
  newTemplateName: string
  setNewTemplateName: React.Dispatch<React.SetStateAction<string>>
  newTemplateScope: 'project' | 'global'
  setNewTemplateScope: React.Dispatch<React.SetStateAction<'project' | 'global'>>
  templateSaving: boolean
  templateError: string | null
  setTemplateError: React.Dispatch<React.SetStateAction<string | null>>

  // Template preview state (US-013)
  isPreviewOpen: boolean
  setIsPreviewOpen: React.Dispatch<React.SetStateAction<boolean>>
  previewLoading: boolean
  previewResult: TemplatePreviewResult | null
  setPreviewResult: React.Dispatch<React.SetStateAction<TemplatePreviewResult | null>>

  // Active project
  activeProject: Project | undefined

  // Update functions
  updateExecutionConfig: (updates: Partial<RalphExecutionConfig>) => void
  updateGitConfig: (updates: Partial<RalphGitConfig>) => void
  updateValidationConfig: (updates: Partial<RalphValidationConfig>) => void
  updateFallbackConfig: (updates: Partial<RalphFallbackSettings>) => void
  updateTemplatesConfig: (updates: Partial<RalphTemplateConfig>) => void
  updateUISettingsLocal: (updates: Partial<UISettings>) => void

  // Actions
  loadConfig: () => Promise<void>
  loadTemplates: () => Promise<void>
  loadTemplateContent: (template: TemplateInfo) => Promise<void>
  handleSave: () => Promise<void>
  handleReset: () => Promise<void>
  handleReload: () => Promise<void>
  handleSaveTemplate: () => Promise<void>
  handleDeleteTemplate: () => Promise<void>
  handleCreateNew: () => void
  handleCancelEdit: () => void
  handlePreviewTemplate: () => Promise<void>
}

export function useSettingsState(): UseSettingsStateReturn {
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
  const [previewResult, setPreviewResult] = useState<TemplatePreviewResult | null>(null)

  // Get active project for project-scoped templates
  const { getActiveProject } = useProjectStore()
  const activeProject = getActiveProject()

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

  // Update execution config locally
  const updateExecutionConfig = useCallback(
    (updates: Partial<RalphExecutionConfig>) => {
      if (!config) return
      setConfig({
        ...config,
        execution: { ...config.execution, ...updates },
      })
      setHasChanges(true)
    },
    [config]
  )

  // Update git config locally
  const updateGitConfig = useCallback(
    (updates: Partial<RalphGitConfig>) => {
      if (!config) return
      setConfig({
        ...config,
        git: { ...config.git, ...updates },
      })
      setHasChanges(true)
    },
    [config]
  )

  // Update validation config locally
  const updateValidationConfig = useCallback(
    (updates: Partial<RalphValidationConfig>) => {
      if (!config) return
      setConfig({
        ...config,
        validation: { ...config.validation, ...updates },
      })
      setHasChanges(true)
    },
    [config]
  )

  // Update fallback config locally
  const updateFallbackConfig = useCallback(
    (updates: Partial<RalphFallbackSettings>) => {
      if (!config) return
      setConfig({
        ...config,
        fallback: { ...config.fallback, ...updates },
      })
      setHasChanges(true)
    },
    [config]
  )

  // Update templates config locally (US-014)
  const updateTemplatesConfig = useCallback(
    (updates: Partial<RalphTemplateConfig>) => {
      if (!config) return
      setConfig({
        ...config,
        templates: { ...config.templates, ...updates },
      })
      setHasChanges(true)
    },
    [config]
  )

  // Update UI settings (localStorage only)
  const updateUISettingsLocal = useCallback((updates: Partial<UISettings>) => {
    setUISettings((prev) => ({ ...prev, ...updates }))
    setHasChanges(true)
  }, [])

  // Save all changes
  const handleSave = useCallback(async () => {
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
  }, [config, uiSettings])

  // Reset to defaults (reload from backend)
  const handleReset = useCallback(async () => {
    setUISettings(defaultUISettings)
    await loadConfig()
    setHasChanges(true)
  }, [loadConfig])

  // Reload config from files
  const handleReload = useCallback(async () => {
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
  }, [])

  // Save template
  const handleSaveTemplate = useCallback(async () => {
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
  }, [
    isCreatingTemplate,
    newTemplateName,
    selectedTemplate,
    newTemplateScope,
    templateContent,
    activeProject?.path,
    loadTemplates,
  ])

  // Delete template
  const handleDeleteTemplate = useCallback(async () => {
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
  }, [selectedTemplate, activeProject?.path, loadTemplates])

  // Start creating a new template
  const handleCreateNew = useCallback(() => {
    setIsCreatingTemplate(true)
    setIsEditingTemplate(true)
    setSelectedTemplate(null)
    setNewTemplateName('')
    setNewTemplateScope('project')
    setTemplateContent(
      '# New Template\n\nYou are working on:\n\n{{ task.title }}\n\n{{ task.description }}\n'
    )
  }, [])

  // Cancel editing
  const handleCancelEdit = useCallback(() => {
    if (isCreatingTemplate) {
      setIsCreatingTemplate(false)
      setNewTemplateName('')
      setTemplateContent('')
    }
    setIsEditingTemplate(false)
    setIsPreviewOpen(false)
    setPreviewResult(null)
  }, [isCreatingTemplate])

  // Preview template (US-013)
  const handlePreviewTemplate = useCallback(async () => {
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
  }, [templateContent, activeProject?.path])

  return {
    // Backend config state
    config,
    setConfig,
    loading,
    setLoading,
    saving,
    error,
    setError,

    // UI settings
    uiSettings,
    setUISettings,

    // Track changes
    hasChanges,
    setHasChanges,
    savedMessage,
    setSavedMessage,

    // Template state
    templates,
    setTemplates,
    templatesLoading,
    selectedTemplate,
    setSelectedTemplate,
    templateContent,
    setTemplateContent,
    templateContentLoading,
    isEditingTemplate,
    setIsEditingTemplate,
    isCreatingTemplate,
    setIsCreatingTemplate,
    newTemplateName,
    setNewTemplateName,
    newTemplateScope,
    setNewTemplateScope,
    templateSaving,
    templateError,
    setTemplateError,

    // Template preview state
    isPreviewOpen,
    setIsPreviewOpen,
    previewLoading,
    previewResult,
    setPreviewResult,

    // Active project
    activeProject,

    // Update functions
    updateExecutionConfig,
    updateGitConfig,
    updateValidationConfig,
    updateFallbackConfig,
    updateTemplatesConfig,
    updateUISettingsLocal,

    // Actions
    loadConfig,
    loadTemplates,
    loadTemplateContent,
    handleSave,
    handleReset,
    handleReload,
    handleSaveTemplate,
    handleDeleteTemplate,
    handleCreateNew,
    handleCancelEdit,
    handlePreviewTemplate,
  }
}
