import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { PRDTemplateSelector } from '../PRDTemplateSelector'
import type { PRDTemplate, PRDDocument } from '@/types'

// Mock the store
const mockUsePRDStore = vi.fn()

vi.mock('@/stores/prdStore', () => ({
  usePRDStore: () => mockUsePRDStore(),
}))

// Sample test data
const mockTemplates: PRDTemplate[] = [
  {
    id: 'startup-mvp',
    name: 'Startup MVP',
    description: 'Lean, focused on core features',
    icon: '🚀',
    systemTemplate: true,
    templateStructure: JSON.stringify({
      sections: [
        { id: 'problem', title: 'Problem Statement', required: true },
        { id: 'solution', title: 'Proposed Solution', required: true },
      ],
    }),
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z',
  },
  {
    id: 'enterprise-feature',
    name: 'Enterprise Feature',
    description: 'Comprehensive with compliance',
    icon: '🏢',
    systemTemplate: true,
    templateStructure: JSON.stringify({
      sections: [
        { id: 'business_case', title: 'Business Case', required: true },
      ],
    }),
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z',
  },
  {
    id: 'bug-fix',
    name: 'Bug Fix',
    description: 'Structured approach to bug resolution',
    icon: '🐛',
    systemTemplate: true,
    templateStructure: JSON.stringify({
      sections: [
        { id: 'bug_description', title: 'Bug Description', required: true },
      ],
    }),
    createdAt: '2024-01-01T10:00:00.000Z',
    updatedAt: '2024-01-01T10:00:00.000Z',
  },
]

const mockCreatedPRD: PRDDocument = {
  id: 'new-prd-1',
  title: 'New Startup MVP',
  content: '{}',
  createdAt: '2024-01-01T10:00:00.000Z',
  updatedAt: '2024-01-01T10:00:00.000Z',
  version: 1,
}

// Helper to render with router
function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/prds/new']}>
      <Routes>
        <Route path="/prds/new" element={<PRDTemplateSelector />} />
        <Route path="/prds" element={<div>PRD List</div>} />
        <Route path="/prds/chat" element={<div>PRD Chat</div>} />
        <Route path="/prds/:id" element={<div>PRD Editor</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('PRDTemplateSelector', () => {
  const mockLoadTemplates = vi.fn()
  const mockCreatePRD = vi.fn()

  const defaultStoreState = {
    templates: mockTemplates,
    loading: false,
    error: null,
    loadTemplates: mockLoadTemplates,
    createPRD: mockCreatePRD,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePRDStore.mockReturnValue(defaultStoreState)
    mockCreatePRD.mockResolvedValue(mockCreatedPRD)
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
      mockUsePRDStore.mockReturnValue({ ...defaultStoreState, error: 'Failed to load templates' })
      renderWithRouter()
      expect(screen.getByText('Failed to load templates')).toBeInTheDocument()
    })
  })

  describe('PRD Type Selection', () => {
    it('displays all PRD type options', () => {
      renderWithRouter()
      expect(screen.getByText('New Feature')).toBeInTheDocument()
      // Bug Fix appears twice (type and template), use getAllByText
      expect(screen.getAllByText('Bug Fix').length).toBeGreaterThanOrEqual(1)
      expect(screen.getByText('Refactoring')).toBeInTheDocument()
      expect(screen.getByText('API Integration')).toBeInTheDocument()
      expect(screen.getByText('General')).toBeInTheDocument()
    })

    it('shows "What are you building?" heading', () => {
      renderWithRouter()
      expect(screen.getByText('What are you building?')).toBeInTheDocument()
    })

    it('allows selecting a PRD type', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      await user.click(screen.getByText('New Feature'))

      // Should show description for selected type
      expect(screen.getByText('Build something new from scratch')).toBeInTheDocument()
    })

    it('allows toggling PRD type selection off', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      // Select
      await user.click(screen.getByText('New Feature'))
      expect(screen.getByText('Build something new from scratch')).toBeInTheDocument()

      // Deselect
      await user.click(screen.getByText('New Feature'))
      expect(screen.queryByText('Build something new from scratch')).not.toBeInTheDocument()
    })

    it('passes prdType to createPRD when selected', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      // Select PRD type - use the first one which is "New Feature" to avoid duplication
      await user.click(screen.getByText('New Feature'))

      // Click continue
      await user.click(screen.getByRole('button', { name: /continue/i }))

      await waitFor(() => {
        expect(mockCreatePRD).toHaveBeenCalledWith(
          expect.objectContaining({
            prdType: 'new_feature',
          })
        )
      })
    })
  })

  describe('AI Chat Option', () => {
    it('displays AI Chat option prominently', () => {
      renderWithRouter()
      expect(screen.getByText('Create with AI Chat')).toBeInTheDocument()
      expect(screen.getByText(/Let AI guide you/)).toBeInTheDocument()
    })

    it('shows "Start Chat" button when AI Chat is selected', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      await user.click(screen.getByText('Create with AI Chat'))

      expect(screen.getByRole('button', { name: /start chat/i })).toBeInTheDocument()
    })

    it('navigates to chat when Start Chat is clicked', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      await user.click(screen.getByText('Create with AI Chat'))
      await user.click(screen.getByRole('button', { name: /start chat/i }))

      await waitFor(() => {
        expect(screen.getByText('PRD Chat')).toBeInTheDocument()
      })
    })
  })

  describe('Template Selection', () => {
    it('displays templates', () => {
      renderWithRouter()
      expect(screen.getByText('Startup MVP')).toBeInTheDocument()
      expect(screen.getByText('Enterprise Feature')).toBeInTheDocument()
      // Bug Fix appears in both PRD types and templates
      expect(screen.getAllByText('Bug Fix').length).toBeGreaterThanOrEqual(1)
    })

    it('displays template descriptions', () => {
      renderWithRouter()
      expect(screen.getByText('Lean, focused on core features')).toBeInTheDocument()
    })

    it('allows selecting a template', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      await user.click(screen.getByText('Startup MVP'))

      expect(screen.getByText('Using: Startup MVP')).toBeInTheDocument()
    })

    it('shows template preview when selected', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      await user.click(screen.getByText('Startup MVP'))

      expect(screen.getByText('Sections included:')).toBeInTheDocument()
      // These are Badge components showing section names
      expect(screen.getAllByText('Problem Statement').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Proposed Solution').length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Start from Scratch', () => {
    it('displays "Start from Scratch" option', () => {
      renderWithRouter()
      expect(screen.getByText('Start from Scratch')).toBeInTheDocument()
    })

    it('shows "Starting from scratch" when selected', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      await user.click(screen.getByText('Start from Scratch'))

      expect(screen.getByText('Starting from scratch')).toBeInTheDocument()
    })
  })

  describe('Search', () => {
    it('filters templates by name', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      const searchInput = screen.getByPlaceholderText('Search templates...')
      await user.type(searchInput, 'Startup')

      expect(screen.getByText('Startup MVP')).toBeInTheDocument()
      expect(screen.queryByText('Enterprise Feature')).not.toBeInTheDocument()
    })

    it('filters templates by description', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      const searchInput = screen.getByPlaceholderText('Search templates...')
      await user.type(searchInput, 'compliance')

      expect(screen.queryByText('Startup MVP')).not.toBeInTheDocument()
      expect(screen.getByText('Enterprise Feature')).toBeInTheDocument()
    })
  })

  describe('Create PRD', () => {
    it('calls createPRD with template when Continue is clicked', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      await user.click(screen.getByText('Startup MVP'))
      await user.click(screen.getByRole('button', { name: /continue/i }))

      await waitFor(() => {
        expect(mockCreatePRD).toHaveBeenCalledWith({
          title: 'New Startup MVP',
          description: 'Lean, focused on core features',
          templateId: 'startup-mvp',
          projectPath: undefined,
          prdType: undefined,
        })
      })
    })

    it('navigates to PRD editor after creation', async () => {
      const user = userEvent.setup()
      renderWithRouter()

      await user.click(screen.getByText('Startup MVP'))
      await user.click(screen.getByRole('button', { name: /continue/i }))

      await waitFor(() => {
        expect(screen.getByText('PRD Editor')).toBeInTheDocument()
      })
    })

    it('shows creating state while creating', async () => {
      const user = userEvent.setup()
      mockCreatePRD.mockImplementation(() => new Promise(() => {})) // Never resolves
      renderWithRouter()

      await user.click(screen.getByText('Startup MVP'))
      await user.click(screen.getByRole('button', { name: /continue/i }))

      await waitFor(() => {
        // Check for the loading spinner
        expect(document.querySelector('.animate-spin')).toBeTruthy()
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

  describe('Initial Load', () => {
    it('calls loadTemplates on mount', () => {
      renderWithRouter()
      expect(mockLoadTemplates).toHaveBeenCalled()
    })
  })
})
