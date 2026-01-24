import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PRDTypeSelector } from '../PRDTypeSelector'

// Mock ProjectPicker component
vi.mock('@/components/projects/ProjectPicker', () => ({
  ProjectPicker: ({
    value,
    onChange,
    label,
  }: {
    value: string
    onChange: (v: string) => void
    label: string
  }) => (
    <div data-testid="project-picker">
      <label>{label}</label>
      <input
        data-testid="project-picker-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}))

describe('PRDTypeSelector', () => {
  const mockOnSelect = vi.fn()

  beforeEach(() => {
    mockOnSelect.mockClear()
  })

  describe('Step 1: Workflow Mode Selection', () => {
    it('renders both workflow options on initial render', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      expect(screen.getByRole('button', { name: /Guided Interview/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /GSD Workflow/i })).toBeInTheDocument()
    })

    it('shows recommended badge on GSD Workflow option', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      const gsdButton = screen.getByRole('button', { name: /GSD Workflow/i })
      expect(within(gsdButton).getByText('Recommended for new projects')).toBeInTheDocument()
    })

    it('displays features for each workflow option', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      // Guided Interview features
      expect(screen.getByText('Type-specific questions')).toBeInTheDocument()
      expect(screen.getByText('Iterative refinement')).toBeInTheDocument()
      expect(screen.getByText('Quick for small tasks')).toBeInTheDocument()

      // GSD Workflow features
      expect(screen.getByText('Deep questioning phase')).toBeInTheDocument()
      expect(screen.getByText('Research agents')).toBeInTheDocument()
      expect(screen.getByText('Requirements scoping')).toBeInTheDocument()
      expect(screen.getByText('Roadmap generation')).toBeInTheDocument()
    })

    it('shows continue button only after selecting GSD mode', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      // Initially no continue button
      expect(screen.queryByRole('button', { name: /Continue/i })).not.toBeInTheDocument()

      // Select GSD mode
      await user.click(screen.getByRole('button', { name: /GSD Workflow/i }))

      // Now continue button should appear
      expect(screen.getByRole('button', { name: /Continue/i })).toBeInTheDocument()
    })

    it('calls onSelect with correct parameters for GSD Workflow', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/test/project" />)

      await user.click(screen.getByRole('button', { name: /GSD Workflow/i }))
      await user.click(screen.getByRole('button', { name: /Continue/i }))

      expect(mockOnSelect).toHaveBeenCalledWith(
        'new_feature', // default type for GSD mode
        false, // guidedMode is false when GSD is on
        '/test/project',
        true // gsdMode is true
      )
    })

    it('navigates to type selection when clicking Guided Interview', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Guided Interview/i }))

      // Should now show type selection step
      expect(screen.getByText('What type of PRD are you creating?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Bug Fix/i })).toBeInTheDocument()
    })
  })

  describe('Step 2: PRD Type Selection (Guided Interview)', () => {
    it('shows all PRD types in step 2', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Guided Interview/i }))

      expect(screen.getByRole('button', { name: /New Feature/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Full New App/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Bug Fix/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Refactoring/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /API Integration/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /General/i })).toBeInTheDocument()
    })

    it('shows Back button in step 2', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Guided Interview/i }))

      expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument()
    })

    it('navigates back to step 1 when clicking Back', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Guided Interview/i }))
      await user.click(screen.getByRole('button', { name: /Back/i }))

      // Should be back on step 1
      expect(screen.getByText('How would you like to create your PRD?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Guided Interview/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /GSD Workflow/i })).toBeInTheDocument()
    })

    it('continue button is disabled until a type is selected', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Guided Interview/i }))

      const continueButton = screen.getByRole('button', { name: /Continue/i })
      expect(continueButton).toBeDisabled()
    })

    it('continue button is enabled after selecting a type', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Guided Interview/i }))
      await user.click(screen.getByRole('button', { name: /Bug Fix/i }))

      const continueButton = screen.getByRole('button', { name: /Continue/i })
      expect(continueButton).toBeEnabled()
    })

    it('calls onSelect with correct parameters for Guided Interview with Bug Fix', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/test/project" />)

      await user.click(screen.getByRole('button', { name: /Guided Interview/i }))
      await user.click(screen.getByRole('button', { name: /Bug Fix/i }))
      await user.click(screen.getByRole('button', { name: /Continue/i }))

      expect(mockOnSelect).toHaveBeenCalledWith(
        'bug_fix',
        true, // guidedMode is true
        '/test/project',
        false // gsdMode is false
      )
    })

    it('calls onSelect with correct parameters for Guided Interview with Refactoring', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/my/project" />)

      await user.click(screen.getByRole('button', { name: /Guided Interview/i }))
      await user.click(screen.getByRole('button', { name: /Refactoring/i }))
      await user.click(screen.getByRole('button', { name: /Continue/i }))

      expect(mockOnSelect).toHaveBeenCalledWith('refactoring', true, '/my/project', false)
    })
  })

  describe('Project Context', () => {
    it('shows project picker when no default path', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      expect(screen.getByTestId('project-picker')).toBeInTheDocument()
    })

    it('shows simplified project view when defaultProjectPath is provided', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/test/my-project" />)

      expect(screen.getByText('my-project')).toBeInTheDocument()
      expect(screen.getByText('Using active workspace. Click to change.')).toBeInTheDocument()
    })
  })

  describe('Loading State', () => {
    it('disables workflow buttons when loading', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} loading={true} />)

      const guidedButton = screen.getByRole('button', { name: /Guided Interview/i })
      const gsdButton = screen.getByRole('button', { name: /GSD Workflow/i })

      expect(guidedButton).toBeDisabled()
      expect(gsdButton).toBeDisabled()
    })

    it('shows loading state on continue button for GSD', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /GSD Workflow/i }))

      // Rerender with loading state
      rerender(<PRDTypeSelector onSelect={mockOnSelect} loading={true} />)

      expect(screen.getByText('Starting...')).toBeInTheDocument()
    })

    it('disables type buttons when loading in step 2', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Guided Interview/i }))

      // Rerender with loading state
      rerender(<PRDTypeSelector onSelect={mockOnSelect} loading={true} />)

      const bugFixButton = screen.getByRole('button', { name: /Bug Fix/i })
      expect(bugFixButton).toBeDisabled()
    })
  })
})
