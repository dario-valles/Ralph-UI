/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PRDExecutionDialog } from '../PRDExecutionDialog'
import type { RalphConfig } from '@/types'

// Create mock functions
const mockExecutePRD = vi.fn()
const mockFetchSession = vi.fn()
const mockFetchSessions = vi.fn()
const mockConfigGet = vi.fn()

// Mock the stores
vi.mock('@/stores/prdStore', () => ({
  usePRDStore: () => ({
    executePRD: mockExecutePRD,
    currentPRD: { id: 'test-prd-id', projectPath: '/test/project' },
    prds: [{ id: 'test-prd-id', projectPath: '/test/project' }],
  }),
}))

vi.mock('@/stores/sessionStore', () => {
  const store = () => ({
    fetchSession: mockFetchSession,
    fetchSessions: mockFetchSessions,
    sessions: [],
  })
  store.getState = () => ({ currentSession: null })
  return { useSessionStore: store }
})

// Mock the config API
vi.mock('@/lib/config-api', () => ({
  configApi: {
    get: () => mockConfigGet(),
  },
}))

// Mock parallel-api
vi.mock('@/lib/parallel-api', () => ({
  initParallelScheduler: vi.fn(),
  parallelAddTasks: vi.fn(),
  parallelScheduleNext: vi.fn(),
  isGitRepository: vi.fn().mockResolvedValue(true),
  initGitRepository: vi.fn(),
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

// Mock model-api
vi.mock('@/lib/model-api', () => ({
  getModelName: vi.fn((models, id) => {
    const model = models.find((m: { id: string }) => m.id === id)
    return model ? model.name : id
  }),
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
  },
  templates: {},
  fallback: {
    enabled: true,
    baseBackoffMs: 1000,
    maxBackoffMs: 30000,
  },
}

const renderDialog = (open = true) => {
  return render(
    <MemoryRouter>
      <PRDExecutionDialog prdId="test-prd-id" open={open} onOpenChange={vi.fn()} />
    </MemoryRouter>
  )
}

describe('PRDExecutionDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockConfigGet.mockResolvedValue(mockConfig)
    mockFetchSessions.mockResolvedValue(undefined)
  })

  it('renders dialog when open', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByText('Execute PRD')).toBeInTheDocument()
    })
  })

  it('loads config when dialog opens', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(mockConfigGet).toHaveBeenCalled()
    })
  })

  it('displays correct agent type from config', async () => {
    renderDialog(true)

    await waitFor(() => {
      const agentSelect = screen.getByLabelText('Agent Type')
      expect(agentSelect).toHaveValue('opencode')
    })
  })

  it('displays correct strategy from config', async () => {
    renderDialog(true)

    await waitFor(() => {
      const strategySelect = screen.getByLabelText('Execution Strategy')
      expect(strategySelect).toHaveValue('dependency_first')
    })
  })

  it('renders all strategy options', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByText('Sequential (One at a time)')).toBeInTheDocument()
      expect(screen.getByText('Dependency First (Parallel)')).toBeInTheDocument()
      expect(screen.getByText('Priority Order (Parallel)')).toBeInTheDocument()
      expect(screen.getByText('FIFO (Parallel)')).toBeInTheDocument()
      expect(screen.getByText('Highest Cost First (Parallel)')).toBeInTheDocument()
    })
  })

  it('shows max parallel slider for non-sequential strategies', async () => {
    renderDialog(true)

    await waitFor(() => {
      // Config has dependency_first strategy, so slider should be visible
      expect(screen.getByText(/Max Parallel Agents/)).toBeInTheDocument()
    })
  })

  it('hides max parallel slider for sequential strategy', async () => {
    const sequentialConfig = {
      ...mockConfig,
      execution: { ...mockConfig.execution, strategy: 'sequential' },
    }
    mockConfigGet.mockResolvedValue(sequentialConfig)

    renderDialog(true)

    await waitFor(() => {
      // After config loads, strategy should be sequential
      expect(screen.queryByText(/Max Parallel Agents/)).not.toBeInTheDocument()
    })
  })

  it('displays correct max parallel value from config', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByText(/Max Parallel Agents: 4/)).toBeInTheDocument()
    })
  })

  it('displays correct max iterations from config', async () => {
    renderDialog(true)

    await waitFor(() => {
      const iterationsSelect = screen.getByLabelText('Max Iterations per Task')
      expect(iterationsSelect).toHaveValue('10')
    })
  })

  it('displays correct max retries from config', async () => {
    renderDialog(true)

    await waitFor(() => {
      const retriesSelect = screen.getByLabelText('Max Retries per Task')
      expect(retriesSelect).toHaveValue('3')
    })
  })

  it('displays correct git settings from config', async () => {
    renderDialog(true)

    await waitFor(() => {
      // autoCreatePrs = true
      const autoCreateCheckbox = screen.getByLabelText('Auto-create PRs when tasks complete')
      expect(autoCreateCheckbox).toBeChecked()

      // draftPrs = false
      const draftCheckbox = screen.getByLabelText('Create draft PRs')
      expect(draftCheckbox).not.toBeChecked()
    })
  })

  it('displays correct validation settings from config', async () => {
    renderDialog(true)

    await waitFor(() => {
      const testsCheckbox = screen.getByLabelText('Run tests before committing')
      expect(testsCheckbox).toBeChecked()

      const lintCheckbox = screen.getByLabelText('Run linter before committing')
      expect(lintCheckbox).toBeChecked()
    })
  })

  it('allows changing strategy', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByLabelText('Execution Strategy')).toBeInTheDocument()
    })

    const strategySelect = screen.getByLabelText('Execution Strategy')
    fireEvent.change(strategySelect, { target: { value: 'sequential' } })

    expect(strategySelect).toHaveValue('sequential')
  })

  it('updates summary when strategy changes', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByText(/Strategy: Dependency First/)).toBeInTheDocument()
    })

    const strategySelect = screen.getByLabelText('Execution Strategy')
    fireEvent.change(strategySelect, { target: { value: 'sequential' } })

    await waitFor(() => {
      expect(screen.getByText(/Strategy: Sequential/)).toBeInTheDocument()
    })
  })

  it('shows loading state while config is loading', async () => {
    // Make config loading slow
    mockConfigGet.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockConfig), 100))
    )

    renderDialog(true)

    // Should show loading initially
    expect(screen.getByText('Loading...')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
    })
  })

  it('displays dry-run mode option', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByText('Dry-run Mode')).toBeInTheDocument()
    })
  })

  it('calls executePRD when start execution is clicked', async () => {
    mockExecutePRD.mockResolvedValue('session-123')
    mockFetchSession.mockResolvedValue(undefined)

    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByText('Start Execution')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Start Execution'))

    await waitFor(() => {
      expect(mockExecutePRD).toHaveBeenCalledWith(
        'test-prd-id',
        expect.objectContaining({
          strategy: 'dependency_first',
          agentType: 'opencode',
          maxParallel: 4,
        })
      )
    })
  })
})
