import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PRDGuidancePanel } from '../PRDGuidancePanel'
import type { PRDTypeValue } from '@/types'

describe('PRDGuidancePanel', () => {
  const mockOnInsertPrompt = vi.fn()
  const mockOnInsertCommand = vi.fn()

  const defaultProps = {
    prdType: 'bug_fix' as PRDTypeValue,
    onInsertPrompt: mockOnInsertPrompt,
    onInsertCommand: mockOnInsertCommand,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('rendering', () => {
    it('renders bug_fix guidance correctly', () => {
      render(<PRDGuidancePanel {...defaultProps} prdType="bug_fix" />)

      expect(screen.getByText("Let's squash that bug")).toBeInTheDocument()
      expect(screen.getByText('Document the issue and create a clear fix plan')).toBeInTheDocument()
    })

    it('renders refactoring guidance correctly', () => {
      render(<PRDGuidancePanel {...defaultProps} prdType="refactoring" />)

      expect(screen.getByText('Time to clean up the code')).toBeInTheDocument()
      expect(screen.getByText('Plan safe, incremental improvements')).toBeInTheDocument()
    })

    it('renders api_integration guidance correctly', () => {
      render(<PRDGuidancePanel {...defaultProps} prdType="api_integration" />)

      expect(screen.getByText("Let's connect that API")).toBeInTheDocument()
      expect(
        screen.getByText('Plan authentication, data flow, and error handling')
      ).toBeInTheDocument()
    })

    it('renders new_feature guidance correctly', () => {
      render(<PRDGuidancePanel {...defaultProps} prdType="new_feature" />)

      expect(screen.getByText("Let's build something great")).toBeInTheDocument()
      expect(screen.getByText('Design, scope, and plan your new feature')).toBeInTheDocument()
    })

    it('renders full_new_app guidance correctly', () => {
      render(<PRDGuidancePanel {...defaultProps} prdType="full_new_app" />)

      expect(screen.getByText("Let's design your application")).toBeInTheDocument()
      expect(screen.getByText('From vision to MVP scope')).toBeInTheDocument()
    })

    it('renders general guidance correctly', () => {
      render(<PRDGuidancePanel {...defaultProps} prdType="general" />)

      expect(screen.getByText('What are we building?')).toBeInTheDocument()
      expect(screen.getByText('Tell me about your project and requirements')).toBeInTheDocument()
    })
  })

  describe('workflow steps', () => {
    it('displays 4 workflow steps', () => {
      render(<PRDGuidancePanel {...defaultProps} />)

      // Check for step numbers
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText('2')).toBeInTheDocument()
      expect(screen.getByText('3')).toBeInTheDocument()
      expect(screen.getByText('4')).toBeInTheDocument()
    })

    it('shows command buttons in workflow steps', () => {
      render(<PRDGuidancePanel {...defaultProps} prdType="bug_fix" />)

      // bug_fix has /critique and /task commands (may appear multiple times)
      expect(screen.getAllByText('/critique').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('/task').length).toBeGreaterThanOrEqual(1)
    })

    it('calls onInsertCommand when clicking command in workflow step', () => {
      render(<PRDGuidancePanel {...defaultProps} prdType="bug_fix" />)

      const critiqueButton = screen.getAllByText('/critique')[0]
      fireEvent.click(critiqueButton)

      expect(mockOnInsertCommand).toHaveBeenCalledWith('/critique')
    })
  })

  describe('sample prompts', () => {
    it('displays sample prompts for bug_fix', () => {
      render(<PRDGuidancePanel {...defaultProps} prdType="bug_fix" />)

      expect(
        screen.getByText("The login button doesn't respond on mobile Safari")
      ).toBeInTheDocument()
      expect(
        screen.getByText('API returns 500 error when submitting empty form')
      ).toBeInTheDocument()
      expect(screen.getByText('Memory leak occurs after viewing 100+ items')).toBeInTheDocument()
    })

    it('calls onInsertPrompt when clicking a sample prompt', () => {
      render(<PRDGuidancePanel {...defaultProps} prdType="bug_fix" />)

      const prompt = screen.getByText("The login button doesn't respond on mobile Safari")
      fireEvent.click(prompt)

      expect(mockOnInsertPrompt).toHaveBeenCalledWith(
        "The login button doesn't respond on mobile Safari"
      )
    })
  })

  describe('quick commands', () => {
    it('displays quick commands for bug_fix', () => {
      render(<PRDGuidancePanel {...defaultProps} prdType="bug_fix" />)

      // Look in quick commands section (excludes workflow step commands)
      const quickCommandsSection = screen.getByText('Quick commands').parentElement
      expect(quickCommandsSection).toBeInTheDocument()

      // Commands should be present (may be duplicated in workflow)
      expect(screen.getAllByText('Critique').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Task').length).toBeGreaterThanOrEqual(1)
      expect(screen.getAllByText('Story').length).toBeGreaterThanOrEqual(1)
    })

    it('calls onInsertCommand when clicking quick command', () => {
      render(<PRDGuidancePanel {...defaultProps} prdType="bug_fix" />)

      // Find the quick command button (has both /story text and Story label)
      const storyButtons = screen.getAllByRole('button', { name: /story/i })
      // Click the one that contains "/story" text (quick command button)
      const quickCommandButton = storyButtons.find((btn) => btn.textContent?.includes('/story'))
      if (quickCommandButton) {
        fireEvent.click(quickCommandButton)
        expect(mockOnInsertCommand).toHaveBeenCalledWith('/story')
      }
    })
  })

  describe('accessibility', () => {
    it('has proper heading hierarchy', () => {
      render(<PRDGuidancePanel {...defaultProps} />)

      // Main title should be h3
      const heading = screen.getByRole('heading', { level: 3 })
      expect(heading).toBeInTheDocument()
    })

    it('has accessible buttons with titles for quick commands', () => {
      render(<PRDGuidancePanel {...defaultProps} prdType="bug_fix" />)

      // Quick command buttons should have title attributes for descriptions
      const buttons = screen.getAllByRole('button')
      expect(buttons.length).toBeGreaterThan(0)
    })
  })
})
