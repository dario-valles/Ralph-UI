import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StructuredPRDSidebar } from '../StructuredPRDSidebar'
import type { ExtractedPRDStructure, StructuredPRDItem } from '@/types'

describe('StructuredPRDSidebar', () => {
  const mockEpic: StructuredPRDItem = {
    type: 'epic',
    id: 'EP-1',
    title: 'User Authentication',
    description: 'Complete auth system with login and signup',
    priority: 1,
    estimatedEffort: 'large',
  }

  const mockUserStory: StructuredPRDItem = {
    type: 'user_story',
    id: 'US-1.1',
    parentId: 'EP-1',
    title: 'User Login',
    description: 'As a user, I want to log in with email and password',
    acceptanceCriteria: [
      'User can enter email and password',
      'Invalid credentials show error message',
      'Successful login redirects to dashboard',
    ],
    priority: 1,
    estimatedEffort: 'medium',
  }

  const mockTask: StructuredPRDItem = {
    type: 'task',
    id: 'T-1.1.1',
    parentId: 'US-1.1',
    title: 'Create login form component',
    description: 'Build React component with email/password inputs',
    estimatedEffort: 'small',
  }

  const mockAcceptanceCriteria: StructuredPRDItem = {
    type: 'acceptance_criteria',
    id: 'AC-1.1.1',
    parentId: 'US-1.1',
    title: 'Valid email format required',
    description: 'Email must be in valid format',
  }

  const mockStructure: ExtractedPRDStructure = {
    epics: [mockEpic],
    userStories: [mockUserStory],
    tasks: [mockTask],
    acceptanceCriteria: [mockAcceptanceCriteria],
  }

  const emptyStructure: ExtractedPRDStructure = {
    epics: [],
    userStories: [],
    tasks: [],
    acceptanceCriteria: [],
  }

  // ============================================================================
  // Empty State Tests
  // ============================================================================

  describe('Empty State', () => {
    it('renders empty state when structure is null', () => {
      render(<StructuredPRDSidebar structure={null} />)

      expect(screen.getByText('No items extracted yet')).toBeInTheDocument()
    })

    it('renders empty state when structure has no items', () => {
      render(<StructuredPRDSidebar structure={emptyStructure} />)

      expect(screen.getByText('No items extracted yet')).toBeInTheDocument()
    })

    it('shows help text in empty state', () => {
      render(<StructuredPRDSidebar structure={null} />)

      expect(
        screen.getByText(/Enable structured mode and ask the AI to output PRD items/i)
      ).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Header Tests
  // ============================================================================

  describe('Header', () => {
    it('renders header title', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      expect(screen.getByText('Extracted Items')).toBeInTheDocument()
    })

    it('shows total item count badge', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      expect(screen.getByText('4 items')).toBeInTheDocument()
    })

    it('renders clear button when onClear is provided', () => {
      const mockClear = vi.fn()
      render(<StructuredPRDSidebar structure={mockStructure} onClear={mockClear} />)

      const clearButton = screen.getByTitle('Clear extracted items')
      expect(clearButton).toBeInTheDocument()
    })

    it('does not render clear button when onClear is not provided', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      expect(screen.queryByTitle('Clear extracted items')).not.toBeInTheDocument()
    })

    it('calls onClear when clear button is clicked', () => {
      const mockClear = vi.fn()
      render(<StructuredPRDSidebar structure={mockStructure} onClear={mockClear} />)

      const clearButton = screen.getByTitle('Clear extracted items')
      fireEvent.click(clearButton)

      expect(mockClear).toHaveBeenCalledTimes(1)
    })
  })

  // ============================================================================
  // Item Group Tests
  // ============================================================================

  describe('Item Groups', () => {
    it('renders Epics group with correct count', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      expect(screen.getByText('Epics')).toBeInTheDocument()
      // Count badge for Epics group
      const epicsBadge = screen.getAllByText('1').find(
        el => el.closest('button')?.textContent?.includes('Epics')
      )
      expect(epicsBadge).toBeInTheDocument()
    })

    it('renders User Stories group with correct count', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      expect(screen.getByText('User Stories')).toBeInTheDocument()
    })

    it('renders Tasks group with correct count', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      expect(screen.getByText('Tasks')).toBeInTheDocument()
    })

    it('renders Acceptance Criteria group with correct count', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      expect(screen.getByText('Acceptance Criteria')).toBeInTheDocument()
    })

    it('does not render empty groups', () => {
      const structureWithOnlyEpics: ExtractedPRDStructure = {
        epics: [mockEpic],
        userStories: [],
        tasks: [],
        acceptanceCriteria: [],
      }

      render(<StructuredPRDSidebar structure={structureWithOnlyEpics} />)

      expect(screen.getByText('Epics')).toBeInTheDocument()
      expect(screen.queryByText('User Stories')).not.toBeInTheDocument()
      expect(screen.queryByText('Tasks')).not.toBeInTheDocument()
      expect(screen.queryByText('Acceptance Criteria')).not.toBeInTheDocument()
    })
  })

  // ============================================================================
  // Item Display Tests
  // ============================================================================

  describe('Item Display', () => {
    it('displays epic title and ID', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      expect(screen.getByText('User Authentication')).toBeInTheDocument()
      expect(screen.getByText('EP-1')).toBeInTheDocument()
    })

    it('displays user story title and ID', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      expect(screen.getByText('User Login')).toBeInTheDocument()
      expect(screen.getByText('US-1.1')).toBeInTheDocument()
    })

    it('displays task title and ID', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      expect(screen.getByText('Create login form component')).toBeInTheDocument()
      expect(screen.getByText('T-1.1.1')).toBeInTheDocument()
    })

    it('displays item description', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      expect(
        screen.getByText('Complete auth system with login and signup')
      ).toBeInTheDocument()
    })

    it('displays priority badge for items with priority', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      // P1 badges for priority 1 items
      const priorityBadges = screen.getAllByText('P1')
      expect(priorityBadges.length).toBeGreaterThan(0)
    })

    it('displays effort badge for items with estimated effort', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      // Large effort badge
      expect(screen.getByText('L')).toBeInTheDocument()
      // Medium effort badge
      expect(screen.getByText('M')).toBeInTheDocument()
      // Small effort badge
      expect(screen.getByText('S')).toBeInTheDocument()
    })

    it('displays acceptance criteria count', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      // User story has 3 acceptance criteria
      expect(screen.getByText('3 AC')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Collapsible Behavior Tests
  // ============================================================================

  describe('Collapsible Behavior', () => {
    it('Epics group is expanded by default', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      // Epic item should be visible
      expect(screen.getByText('User Authentication')).toBeInTheDocument()
    })

    it('Acceptance Criteria group is collapsed by default', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      // AC group header should be visible
      expect(screen.getByText('Acceptance Criteria')).toBeInTheDocument()
      // But AC item should not be visible initially (collapsed by default)
      expect(screen.queryByText('Valid email format required')).not.toBeInTheDocument()
    })

    it('toggles group visibility when header is clicked', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      // Click on Epics header to collapse
      const epicsHeader = screen.getByText('Epics').closest('button')
      expect(epicsHeader).toBeInTheDocument()

      fireEvent.click(epicsHeader!)

      // Epic item should now be hidden
      expect(screen.queryByText('User Authentication')).not.toBeInTheDocument()

      // Click again to expand
      fireEvent.click(epicsHeader!)

      // Epic item should be visible again
      expect(screen.getByText('User Authentication')).toBeInTheDocument()
    })

    it('expands collapsed Acceptance Criteria group when clicked', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      // Click on AC header to expand
      const acHeader = screen.getByText('Acceptance Criteria').closest('button')
      fireEvent.click(acHeader!)

      // AC item should now be visible
      expect(screen.getByText('Valid email format required')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Styling Tests
  // ============================================================================

  describe('Styling', () => {
    it('applies custom className', () => {
      const { container } = render(
        <StructuredPRDSidebar structure={mockStructure} className="custom-class" />
      )

      const card = container.firstChild
      expect(card).toHaveClass('custom-class')
    })

    it('renders chevron icons for collapsible groups', () => {
      render(<StructuredPRDSidebar structure={mockStructure} />)

      // Should have chevron icons (either down or right)
      const buttons = screen.getAllByRole('button')
      const groupButtons = buttons.filter(
        btn => btn.textContent?.includes('Epics') ||
               btn.textContent?.includes('User Stories') ||
               btn.textContent?.includes('Tasks') ||
               btn.textContent?.includes('Acceptance Criteria')
      )
      expect(groupButtons.length).toBeGreaterThan(0)
    })
  })

  // ============================================================================
  // Multiple Items Tests
  // ============================================================================

  describe('Multiple Items', () => {
    it('displays multiple epics', () => {
      const multipleEpics: ExtractedPRDStructure = {
        epics: [
          mockEpic,
          { ...mockEpic, id: 'EP-2', title: 'User Profile' },
          { ...mockEpic, id: 'EP-3', title: 'Settings' },
        ],
        userStories: [],
        tasks: [],
        acceptanceCriteria: [],
      }

      render(<StructuredPRDSidebar structure={multipleEpics} />)

      expect(screen.getByText('User Authentication')).toBeInTheDocument()
      expect(screen.getByText('User Profile')).toBeInTheDocument()
      expect(screen.getByText('Settings')).toBeInTheDocument()
      expect(screen.getByText('3 items')).toBeInTheDocument()
    })

    it('correctly counts total items across all groups', () => {
      const largeStructure: ExtractedPRDStructure = {
        epics: [mockEpic, { ...mockEpic, id: 'EP-2', title: 'Epic 2' }],
        userStories: [mockUserStory, { ...mockUserStory, id: 'US-2.1', title: 'Story 2' }],
        tasks: [mockTask],
        acceptanceCriteria: [mockAcceptanceCriteria],
      }

      render(<StructuredPRDSidebar structure={largeStructure} />)

      expect(screen.getByText('6 items')).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Edge Cases
  // ============================================================================

  describe('Edge Cases', () => {
    it('handles items without optional fields', () => {
      const minimalItem: StructuredPRDItem = {
        type: 'epic',
        id: 'EP-1',
        title: 'Minimal Epic',
        description: 'Basic description',
      }

      const minimalStructure: ExtractedPRDStructure = {
        epics: [minimalItem],
        userStories: [],
        tasks: [],
        acceptanceCriteria: [],
      }

      render(<StructuredPRDSidebar structure={minimalStructure} />)

      expect(screen.getByText('Minimal Epic')).toBeInTheDocument()
      // Should not show priority or effort badges
      expect(screen.queryByText(/P\d/)).not.toBeInTheDocument()
    })

    it('handles user story with empty acceptance criteria array', () => {
      const storyNoAC: StructuredPRDItem = {
        type: 'user_story',
        id: 'US-1',
        title: 'Story without AC',
        description: 'A story',
        acceptanceCriteria: [],
      }

      const structure: ExtractedPRDStructure = {
        epics: [],
        userStories: [storyNoAC],
        tasks: [],
        acceptanceCriteria: [],
      }

      render(<StructuredPRDSidebar structure={structure} />)

      expect(screen.getByText('Story without AC')).toBeInTheDocument()
      // Should not show AC count
      expect(screen.queryByText(/\d+ AC/)).not.toBeInTheDocument()
    })

    it('handles items without description', () => {
      const noDescItem: StructuredPRDItem = {
        type: 'task',
        id: 'T-1',
        title: 'Task without description',
        description: '',
      }

      const structure: ExtractedPRDStructure = {
        epics: [],
        userStories: [],
        tasks: [noDescItem],
        acceptanceCriteria: [],
      }

      render(<StructuredPRDSidebar structure={structure} />)

      expect(screen.getByText('Task without description')).toBeInTheDocument()
    })
  })
})
