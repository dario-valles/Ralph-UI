import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { PRDList } from '../PRDList'
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

// Mock window.confirm
const mockConfirm = vi.fn()
window.confirm = mockConfirm

// Sample test data
const mockPRDs: PRDDocument[] = [
  {
    id: 'prd-1',
    title: 'Feature PRD',
    description: 'A new feature PRD',
    content: '{}',
    qualityScoreOverall: 85,
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T12:00:00.000Z',
    version: 1,
    sourceChatSessionId: 'chat-session-1', // Created from chat
    prdType: 'new_feature',
  },
  {
    id: 'prd-2',
    title: 'Bug Fix PRD',
    description: 'A bug fix PRD',
    content: '{}',
    qualityScoreOverall: 70,
    createdAt: '2024-01-02T10:00:00.000Z',
    updatedAt: '2024-01-02T12:00:00.000Z',
    version: 1,
    // No sourceChatSessionId - created manually
  },
  {
    id: 'prd-3',
    title: 'Refactoring PRD',
    description: 'A refactoring PRD',
    content: '{}',
    // No quality score - not analyzed
    createdAt: '2024-01-03T10:00:00.000Z',
    updatedAt: '2024-01-03T12:00:00.000Z',
    version: 1,
  },
]

// Helper to render with router
function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/prds']}>
      <Routes>
        <Route path="/prds" element={<PRDList />} />
        <Route path="/prds/new" element={<div>Create PRD</div>} />
        <Route path="/prds/chat" element={<div>PRD Chat</div>} />
        <Route path="/prds/:id" element={<div>PRD Editor</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PRDList', () => {
  const mockLoadPRDs = vi.fn()
  const mockDeletePRD = vi.fn()

  const defaultStoreState = {
    prds: mockPRDs,
    loading: false,
    error: null,
    loadPRDs: mockLoadPRDs,
    deletePRD: mockDeletePRD,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePRDStore.mockReturnValue(defaultStoreState)
  })

  describe('Loading State', () => {
    it('shows loading spinner when loading with no PRDs', () => {
      mockUsePRDStore.mockReturnValue({ ...defaultStoreState, loading: true, prds: [] })
      renderWithRouter()
      expect(document.querySelector('.animate-spin')).toBeTruthy()
    })

    it('does not show loading spinner when loading with existing PRDs', () => {
      mockUsePRDStore.mockReturnValue({ ...defaultStoreState, loading: true })
      renderWithRouter()
      expect(screen.getByText('Feature PRD')).toBeInTheDocument()
    })
  })

  describe('Error State', () => {
    it('displays error message when error occurs', () => {
      mockUsePRDStore.mockReturnValue({ ...defaultStoreState, error: 'Failed to load PRDs' })
      renderWithRouter()
      expect(screen.getByText('Failed to load PRDs')).toBeInTheDocument()
    })
  })

  describe('Empty State', () => {
    it('displays empty state when no PRDs exist', () => {
      mockUsePRDStore.mockReturnValue({ ...defaultStoreState, prds: [] })
      renderWithRouter()
      expect(screen.getByText('No PRDs yet')).toBeInTheDocument()
      expect(screen.getByText('Create your first PRD to get started')).toBeInTheDocument()
    })

    it('displays no results message when search has no matches', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      const searchInput = screen.getByPlaceholderText('Search PRDs...')
      await user.type(searchInput, 'nonexistent')

      expect(screen.getByText('No PRDs found')).toBeInTheDocument()
      expect(screen.getByText('Try adjusting your search query')).toBeInTheDocument()
    })
  })

  describe('PRD List Display', () => {
    it('displays all PRDs', () => {
      renderWithRouter()
      expect(screen.getByText('Feature PRD')).toBeInTheDocument()
      expect(screen.getByText('Bug Fix PRD')).toBeInTheDocument()
      expect(screen.getByText('Refactoring PRD')).toBeInTheDocument()
    })

    it('displays PRD descriptions', () => {
      renderWithRouter()
      expect(screen.getByText('A new feature PRD')).toBeInTheDocument()
      expect(screen.getByText('A bug fix PRD')).toBeInTheDocument()
    })
  })

  describe('From Chat Badge', () => {
    it('displays "From Chat" badge for PRDs created from chat', () => {
      renderWithRouter()
      const badges = screen.getAllByText('From Chat')
      expect(badges.length).toBe(1) // Only prd-1 has sourceChatSessionId
    })

    it('does not display "From Chat" badge for manually created PRDs', () => {
      mockUsePRDStore.mockReturnValue({
        ...defaultStoreState,
        prds: [mockPRDs[1]], // Bug Fix PRD without sourceChatSessionId
      })
      renderWithRouter()
      expect(screen.queryByText('From Chat')).not.toBeInTheDocument()
    })
  })

  describe('Quality Badges', () => {
    it('displays quality score for analyzed PRDs', () => {
      renderWithRouter()
      expect(screen.getByText('85%')).toBeInTheDocument()
      expect(screen.getByText('70%')).toBeInTheDocument()
    })

    it('displays "Not Analyzed" for PRDs without quality score', () => {
      renderWithRouter()
      expect(screen.getByText('Not Analyzed')).toBeInTheDocument()
    })
  })

  describe('Create PRD Button', () => {
    it('displays Create PRD button', () => {
      renderWithRouter()
      expect(screen.getByRole('button', { name: /create prd/i })).toBeInTheDocument()
    })

    it('navigates to PRD Chat when clicked', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      await user.click(screen.getByRole('button', { name: /create prd/i }))

      await waitFor(() => {
        expect(screen.getByText('PRD Chat')).toBeInTheDocument()
      })
    })
  })

  describe('Search', () => {
    it('filters PRDs by title', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      const searchInput = screen.getByPlaceholderText('Search PRDs...')
      await user.type(searchInput, 'Feature')

      expect(screen.getByText('Feature PRD')).toBeInTheDocument()
      expect(screen.queryByText('Bug Fix PRD')).not.toBeInTheDocument()
    })

    it('filters PRDs by description', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      const searchInput = screen.getByPlaceholderText('Search PRDs...')
      await user.type(searchInput, 'bug fix')

      expect(screen.queryByText('Feature PRD')).not.toBeInTheDocument()
      expect(screen.getByText('Bug Fix PRD')).toBeInTheDocument()
    })

    it('is case insensitive', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      const searchInput = screen.getByPlaceholderText('Search PRDs...')
      await user.type(searchInput, 'FEATURE')

      expect(screen.getByText('Feature PRD')).toBeInTheDocument()
    })
  })

  describe('Delete PRD', () => {
    it('shows confirmation dialog before deleting', async () => {
      const user = userEvent.setup()
      mockConfirm.mockReturnValue(false)
      renderWithRouter()

      const deleteButtons = screen.getAllByRole('button').filter(btn =>
        btn.querySelector('svg.lucide-trash-2')
      )
      await user.click(deleteButtons[0])

      expect(mockConfirm).toHaveBeenCalledWith('Are you sure you want to delete this PRD?')
      expect(mockDeletePRD).not.toHaveBeenCalled()
    })

    it('deletes PRD when confirmed', async () => {
      const user = userEvent.setup()
      mockConfirm.mockReturnValue(true)
      mockDeletePRD.mockResolvedValue(undefined)
      renderWithRouter()

      const deleteButtons = screen.getAllByRole('button').filter(btn =>
        btn.querySelector('svg.lucide-trash-2')
      )
      await user.click(deleteButtons[0])

      await waitFor(() => {
        expect(mockDeletePRD).toHaveBeenCalledWith('prd-1')
      })
    })
  })

  describe('Row Click Navigation', () => {
    it('navigates to PRD editor when row is clicked', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      await user.click(screen.getByText('Feature PRD'))

      await waitFor(() => {
        expect(screen.getByText('PRD Editor')).toBeInTheDocument()
      })
    })
  })

  describe('Initial Load', () => {
    it('calls loadPRDs on mount', () => {
      renderWithRouter()
      expect(mockLoadPRDs).toHaveBeenCalled()
    })
  })
})
