/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PRDExecutionDialog } from '../PRDExecutionDialog'
import type { RalphConfig } from '@/types'

// Create mock functions
const mockConvertPrdToRalph = vi.fn()
const mockConfigGet = vi.fn()

// Mock the stores
vi.mock('@/stores/prdStore', () => ({
  usePRDStore: () => ({
    currentPRD: { id: 'test-prd-id', projectPath: '/test/project', title: 'Test PRD' },
    prds: [{ id: 'test-prd-id', projectPath: '/test/project', title: 'Test PRD' }],
  }),
}))

// Mock the tauri-api
vi.mock('@/lib/tauri-api', () => ({
  ralphLoopApi: {
    convertPrdToRalph: (args: unknown) => mockConvertPrdToRalph(args),
  },
}))

// Mock the config API
vi.mock('@/lib/config-api', () => ({
  configApi: {
    get: () => mockConfigGet(),
  },
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
    mockConvertPrdToRalph.mockResolvedValue(undefined)
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

  it('displays max iterations selector', async () => {
    renderDialog(true)

    await waitFor(() => {
      const iterationsSelect = screen.getByLabelText('Max Iterations')
      expect(iterationsSelect).toBeInTheDocument()
    })
  })

  it('displays worktree isolation option', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByText('Use Worktree Isolation')).toBeInTheDocument()
    })
  })

  it('displays quality gates options', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByText('Run tests before marking tasks complete')).toBeInTheDocument()
      expect(screen.getByText('Run linter before marking tasks complete')).toBeInTheDocument()
    })
  })

  it('displays summary section', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByText('Summary:')).toBeInTheDocument()
      expect(screen.getByText(/PRD will be converted to .ralph\/prd.json/)).toBeInTheDocument()
    })
  })

  it('shows Start Ralph Loop button', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByText('Start Ralph Loop')).toBeInTheDocument()
    })
  })

  it('calls convertPrdToRalph when start is clicked', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByText('Start Ralph Loop')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText('Start Ralph Loop'))

    await waitFor(() => {
      expect(mockConvertPrdToRalph).toHaveBeenCalledWith(
        expect.objectContaining({
          prdId: 'test-prd-id',
          agentType: 'opencode',
          useWorktree: true,
        })
      )
    })
  })

  it('allows changing agent type', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByLabelText('Agent Type')).toBeInTheDocument()
    })

    const agentSelect = screen.getByLabelText('Agent Type')
    fireEvent.change(agentSelect, { target: { value: 'claude' } })

    expect(agentSelect).toHaveValue('claude')
  })

  it('allows toggling worktree isolation', async () => {
    renderDialog(true)

    await waitFor(() => {
      expect(screen.getByText('Use Worktree Isolation')).toBeInTheDocument()
    })

    // Find the checkbox by its label
    const checkbox = screen.getByRole('checkbox', { name: /worktree isolation/i })
    expect(checkbox).toBeChecked() // Default is true

    fireEvent.click(checkbox)

    expect(checkbox).not.toBeChecked()
  })
})
