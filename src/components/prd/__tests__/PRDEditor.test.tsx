import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { PRDEditor } from '../PRDEditor'
import type { PRDDocument } from '@/types'

// Mock the store
const mockUsePRDStore = vi.fn()

vi.mock('@/stores/prdStore', () => ({
  usePRDStore: () => mockUsePRDStore(),
}))

// Mock toast
vi.mock('@/stores/toastStore', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock PRDExecutionDialog
vi.mock('../PRDExecutionDialog', () => ({
  PRDExecutionDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="execution-dialog">Execution Dialog</div> : null,
}))

// Mock QualityScoreCard
vi.mock('../QualityScoreCard', () => ({
  QualityScoreCard: ({ onRefresh }: { onRefresh?: () => void }) => (
    <div data-testid="quality-score-card">
      Quality Score Card
      {onRefresh && <button onClick={onRefresh}>Refresh Quality</button>}
    </div>
  ),
}))

// Sample test data - PRD content is now markdown format
const mockPRD: PRDDocument = {
  id: 'prd-1',
  title: 'Test PRD',
  description: 'A test PRD description',
  content: `# Overview

Overview content goes here.

# Requirements

Requirements content goes here.`,
  qualityScoreCompleteness: 85,
  qualityScoreClarity: 90,
  qualityScoreActionability: 80,
  qualityScoreOverall: 85,
  createdAt: '2024-01-01T10:00:00.000Z',
  updatedAt: '2024-01-01T12:00:00.000Z',
  version: 1,
  sourceChatSessionId: 'chat-session-1',
  prdType: 'new_feature',
}

const mockPRDWithoutQuality: PRDDocument = {
  ...mockPRD,
  qualityScoreCompleteness: undefined,
  qualityScoreClarity: undefined,
  qualityScoreActionability: undefined,
  qualityScoreOverall: undefined,
}

// Helper to render with router
function renderWithRouter(prdId: string = 'prd-1') {
  return render(
    <MemoryRouter initialEntries={[`/prds/${prdId}`]}>
      <Routes>
        <Route path="/prds/:id" element={<PRDEditor />} />
        <Route path="/prds" element={<div>PRD List</div>} />
        <Route path="/prds/chat" element={<div>PRD Chat</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PRDEditor', () => {
  const mockSetCurrentPRD = vi.fn()
  const mockUpdatePRD = vi.fn()
  const mockAnalyzeQuality = vi.fn()

  const defaultStoreState = {
    currentPRD: mockPRD,
    loading: false,
    error: null,
    setCurrentPRD: mockSetCurrentPRD,
    updatePRD: mockUpdatePRD,
    analyzeQuality: mockAnalyzeQuality,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePRDStore.mockReturnValue(defaultStoreState)
  })

  describe('Loading State', () => {
    it('shows loading spinner when loading', () => {
      mockUsePRDStore.mockReturnValue({ ...defaultStoreState, loading: true })
      renderWithRouter()
      expect(document.querySelector('.animate-spin')).toBeTruthy()
    })
  })

  describe('Error State', () => {
    it('displays error message when error occurs', () => {
      mockUsePRDStore.mockReturnValue({ ...defaultStoreState, error: 'Failed to load PRD' })
      renderWithRouter()
      expect(screen.getByText('Failed to load PRD')).toBeInTheDocument()
    })
  })

  describe('Not Found State', () => {
    it('displays not found message when PRD is null', () => {
      mockUsePRDStore.mockReturnValue({ ...defaultStoreState, currentPRD: null })
      renderWithRouter()
      expect(screen.getByText('PRD not found')).toBeInTheDocument()
    })
  })

  describe('PRD Display', () => {
    it('displays PRD title and description', () => {
      renderWithRouter()
      expect(screen.getByDisplayValue('Test PRD')).toBeInTheDocument()
      expect(screen.getByDisplayValue('A test PRD description')).toBeInTheDocument()
    })

    it('displays PRD sections', () => {
      renderWithRouter()
      expect(screen.getByText('Overview')).toBeInTheDocument()
      expect(screen.getByText('Requirements')).toBeInTheDocument()
    })

    it('displays quality badge when quality score exists', () => {
      renderWithRouter()
      expect(screen.getByText(/Excellent \(85%\)/)).toBeInTheDocument()
    })

    it('displays QualityScoreCard when quality scores exist', () => {
      renderWithRouter()
      expect(screen.getByTestId('quality-score-card')).toBeInTheDocument()
    })

    it('does not display QualityScoreCard when no quality scores', () => {
      mockUsePRDStore.mockReturnValue({ ...defaultStoreState, currentPRD: mockPRDWithoutQuality })
      renderWithRouter()
      expect(screen.queryByTestId('quality-score-card')).not.toBeInTheDocument()
    })
  })

  describe('Continue in Chat Button', () => {
    it('displays Continue in Chat button', () => {
      renderWithRouter()
      expect(screen.getByRole('button', { name: /continue in chat/i })).toBeInTheDocument()
    })

    it('navigates to chat with prdId when clicked', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      await user.click(screen.getByRole('button', { name: /continue in chat/i }))

      await waitFor(() => {
        expect(screen.getByText('PRD Chat')).toBeInTheDocument()
      })
    })
  })

  describe('Cancel Button', () => {
    it('navigates back to PRD list when Cancel is clicked', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      await user.click(screen.getByRole('button', { name: /cancel/i }))

      await waitFor(() => {
        expect(screen.getByText('PRD List')).toBeInTheDocument()
      })
    })
  })

  describe('Save Button', () => {
    it('calls updatePRD when Save is clicked', async () => {
      const user = userEvent.setup()
      mockUpdatePRD.mockResolvedValue(mockPRD)
      renderWithRouter()

      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(mockUpdatePRD).toHaveBeenCalledWith({
          id: 'prd-1',
          title: 'Test PRD',
          description: 'A test PRD description',
          content: expect.any(String),
        })
      })
    })

    it('shows saving state while saving', async () => {
      const user = userEvent.setup()
      mockUpdatePRD.mockImplementation(() => new Promise(() => {})) // Never resolves
      renderWithRouter()

      await user.click(screen.getByRole('button', { name: /save/i }))

      await waitFor(() => {
        expect(screen.getByText(/saving/i)).toBeInTheDocument()
      })
    })
  })

  describe('Analyze Quality Button', () => {
    it('calls analyzeQuality when clicked', async () => {
      const user = userEvent.setup()
      mockAnalyzeQuality.mockResolvedValue(mockPRD)
      renderWithRouter()

      await user.click(screen.getByRole('button', { name: /analyze quality/i }))

      await waitFor(() => {
        expect(mockAnalyzeQuality).toHaveBeenCalledWith('prd-1')
      })
    })

    it('shows analyzing state while analyzing', async () => {
      const user = userEvent.setup()
      mockAnalyzeQuality.mockImplementation(() => new Promise(() => {})) // Never resolves
      renderWithRouter()

      await user.click(screen.getByRole('button', { name: /analyze quality/i }))

      await waitFor(() => {
        expect(screen.getByText(/analyzing/i)).toBeInTheDocument()
      })
    })
  })

  describe('Form Editing', () => {
    it('allows editing title', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      const titleInput = screen.getByDisplayValue('Test PRD')
      await user.clear(titleInput)
      await user.type(titleInput, 'Updated PRD Title')

      expect(screen.getByDisplayValue('Updated PRD Title')).toBeInTheDocument()
    })

    it('allows editing description', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      const descriptionInput = screen.getByDisplayValue('A test PRD description')
      await user.clear(descriptionInput)
      await user.type(descriptionInput, 'Updated description')

      expect(screen.getByDisplayValue('Updated description')).toBeInTheDocument()
    })
  })

  describe('Initial Load', () => {
    it('calls setCurrentPRD with id on mount', () => {
      renderWithRouter('prd-123')
      expect(mockSetCurrentPRD).toHaveBeenCalledWith('prd-123')
    })
  })
})
