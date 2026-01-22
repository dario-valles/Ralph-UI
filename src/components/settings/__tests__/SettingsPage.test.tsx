/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { SettingsPage } from '../SettingsPage'
import type { RalphConfig, TemplateInfo } from '@/types'

// Create mock functions
const mockGet = vi.fn()
const mockUpdateExecution = vi.fn()
const mockUpdateGit = vi.fn()
const mockUpdateValidation = vi.fn()
const mockUpdateFallback = vi.fn()
const mockSave = vi.fn()
const mockReload = vi.fn()

// Template API mock functions
const mockListTemplates = vi.fn()
const mockGetTemplateContent = vi.fn()
const mockSaveTemplate = vi.fn()
const mockDeleteTemplate = vi.fn()
const mockListBuiltin = vi.fn()

// Mock the config API
vi.mock('@/lib/config-api', () => ({
  configApi: {
    get: () => mockGet(),
    updateExecution: (config: unknown) => mockUpdateExecution(config),
    updateGit: (config: unknown) => mockUpdateGit(config),
    updateValidation: (config: unknown) => mockUpdateValidation(config),
    updateFallback: (config: unknown) => mockUpdateFallback(config),
    save: () => mockSave(),
    reload: () => mockReload(),
  },
}))

// Mock the template API
vi.mock('@/lib/tauri-api', () => ({
  templateApi: {
    list: () => mockListTemplates(),
    getContent: (name: string, projectPath?: string) => mockGetTemplateContent(name, projectPath),
    save: (name: string, content: string, scope: string, projectPath?: string) =>
      mockSaveTemplate(name, content, scope, projectPath),
    delete: (name: string, scope: string, projectPath?: string) =>
      mockDeleteTemplate(name, scope, projectPath),
    listBuiltin: () => mockListBuiltin(),
  },
}))

// Mock project store
vi.mock('@/stores/projectStore', () => ({
  useProjectStore: vi.fn(() => ({
    getActiveProject: () => ({ id: 'test-project', name: 'Test Project', path: '/test/path' }),
  })),
}))

// Mock isTauri to true so templates can load
vi.mock('@/lib/tauri-check', () => ({
  isTauri: true,
}))

// Mock useAvailableModels hook
vi.mock('@/hooks/useAvailableModels', () => ({
  useAvailableModels: vi.fn(() => ({
    models: [
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic', isDefault: true },
      { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', isDefault: false },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
    defaultModelId: 'claude-sonnet-4-5',
  })),
}))

// Mock Tauri
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const mockConfig: RalphConfig = {
  execution: {
    maxParallel: 4,
    maxIterations: 10,
    maxRetries: 3,
    agentType: 'opencode',
    strategy: 'dependency_first',
    model: 'claude-sonnet-4-5',
  },
  git: {
    autoCreatePrs: true,
    draftPrs: false,
    branchPattern: 'task/{task_id}',
  },
  validation: {
    runTests: true,
    runLint: true,
    testCommand: 'npm test',
    lintCommand: 'npm run lint',
  },
  templates: {
    defaultTemplate: undefined,
    templatesDir: undefined,
  },
  fallback: {
    enabled: true,
    baseBackoffMs: 1000,
    maxBackoffMs: 30000,
    fallbackAgent: 'claude',
    fallbackModel: 'claude-sonnet-4-5',
  },
}

const mockTemplates: TemplateInfo[] = [
  { name: 'task_prompt', source: 'builtin', description: 'Built-in template' },
  { name: 'bug_fix', source: 'builtin', description: 'Built-in template' },
  { name: 'my_custom', source: 'project', description: 'Project template (.ralph-ui/templates/)' },
  { name: 'global_template', source: 'global', description: 'Global template (~/.ralph-ui/templates/)' },
]

const mockTemplateContent = `# Task Prompt

You are working on:
{{ task.title }}

{{ task.description }}

## Acceptance Criteria
{% for criterion in acceptance_criteria %}
- {{ criterion }}
{% endfor %}`

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGet.mockResolvedValue(mockConfig)
    mockUpdateExecution.mockResolvedValue(mockConfig.execution)
    mockUpdateGit.mockResolvedValue(mockConfig.git)
    mockUpdateValidation.mockResolvedValue(mockConfig.validation)
    mockUpdateFallback.mockResolvedValue(mockConfig.fallback)
    mockSave.mockResolvedValue(undefined)
    mockReload.mockResolvedValue(mockConfig)

    // Template API mocks
    mockListTemplates.mockResolvedValue(mockTemplates)
    mockGetTemplateContent.mockResolvedValue(mockTemplateContent)
    mockSaveTemplate.mockResolvedValue(undefined)
    mockDeleteTemplate.mockResolvedValue(undefined)
    mockListBuiltin.mockResolvedValue(['task_prompt', 'bug_fix'])
  })

  it('renders settings page with title', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Settings')).toBeInTheDocument()
    })
  })

  it('loads and displays config on mount', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalled()
    })
  })

  it('renders execution tab with correct options', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Execution')).toBeInTheDocument()
    })

    // Click on Execution tab (should be default)
    expect(screen.getByText('Execution Configuration')).toBeInTheDocument()
  })

  it('renders all strategy options in dropdown', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Execution Configuration')).toBeInTheDocument()
    })

    // Find the strategy select - check for option text
    const strategySelect = screen.getByLabelText('Execution Strategy')
    expect(strategySelect).toBeInTheDocument()

    // Verify all options are present
    expect(screen.getByText('Sequential (One at a time)')).toBeInTheDocument()
    expect(screen.getByText('Dependency First (Parallel)')).toBeInTheDocument()
    expect(screen.getByText('Priority Order (Parallel)')).toBeInTheDocument()
    expect(screen.getByText('FIFO (Parallel)')).toBeInTheDocument()
    expect(screen.getByText('Highest Cost First (Parallel)')).toBeInTheDocument()
  })

  it('renders all tab options including Templates', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Execution' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Git' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Validation' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Fallback' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Templates' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'UI Preferences' })).toBeInTheDocument()
    })
  })

  it('calls reload when reload button is clicked', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Reload from Files')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Reload from Files'))

    await waitFor(() => {
      expect(mockReload).toHaveBeenCalled()
    })
  })

  it('displays correct agent type options', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByLabelText('Default Agent Type')).toBeInTheDocument()
    })

    // Verify agent type options by checking the select contains them
    const agentSelect = screen.getByLabelText('Default Agent Type') as HTMLSelectElement
    const options = Array.from(agentSelect.options).map((o) => o.text)
    expect(options).toContain('Claude')
    expect(options).toContain('OpenCode')
    expect(options).toContain('Cursor')
  })

  it('shows correct strategy value from config', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      const strategySelect = screen.getByLabelText('Execution Strategy') as HTMLSelectElement
      expect(strategySelect.value).toBe('dependency_first')
    })
  })

  it('shows correct agent type value from config', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      const agentSelect = screen.getByLabelText('Default Agent Type') as HTMLSelectElement
      expect(agentSelect.value).toBe('opencode')
    })
  })

  it('enables save button when config changes', async () => {
    render(<SettingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Execution Configuration')).toBeInTheDocument()
    })

    // Save button should be disabled initially
    const saveButton = screen.getByText('Save Changes').closest('button')
    expect(saveButton).toBeDisabled()

    // Change a setting
    const strategySelect = screen.getByLabelText('Execution Strategy')
    fireEvent.change(strategySelect, { target: { value: 'sequential' } })

    // Save button should be enabled now
    await waitFor(() => {
      expect(saveButton).not.toBeDisabled()
    })
  })

  // Template Editor Tests (US-012)
  // Note: Radix UI tabs don't render content until clicked, making full content testing difficult.
  // These tests verify the tab structure and API mocking is in place.
  describe('Template Editor', () => {
    it('renders Templates tab in the tab list', async () => {
      render(<SettingsPage />)

      // Wait for loading to complete
      await waitFor(() => {
        expect(screen.getByText('Settings')).toBeInTheDocument()
        expect(screen.getByRole('tab', { name: 'Templates' })).toBeInTheDocument()
      })

      // Verify the tab is accessible and clickable
      const templatesTab = screen.getByRole('tab', { name: 'Templates' })
      expect(templatesTab).toBeInTheDocument()
      expect(templatesTab).not.toBeDisabled()
    })

    it('calls template list API on mount', async () => {
      render(<SettingsPage />)

      // Wait for loading to complete - template API is called during mount
      await waitFor(() => {
        expect(screen.getByText('Settings')).toBeInTheDocument()
      })

      // The template list API should be called on mount
      await waitFor(() => {
        expect(mockListTemplates).toHaveBeenCalled()
      })
    })

    it('has all required tabs including Templates', async () => {
      render(<SettingsPage />)

      await waitFor(() => {
        expect(screen.getByText('Settings')).toBeInTheDocument()
      })

      // Verify all tabs are present
      expect(screen.getByRole('tab', { name: 'Execution' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Git' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Validation' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Fallback' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Notifications' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Templates' })).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'UI Preferences' })).toBeInTheDocument()
    })
  })
})
