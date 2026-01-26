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

// Mock ImportGitHubIssuesDialog component
vi.mock('../ImportGitHubIssuesDialog', () => ({
  ImportGitHubIssuesDialog: () => null,
}))

describe('PRDTypeSelector', () => {
  const mockOnSelect = vi.fn()

  beforeEach(() => {
    mockOnSelect.mockClear()
  })

  describe('Step 1: Workflow Mode Selection', () => {
    it('renders workflow options on initial render', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      expect(screen.getByRole('button', { name: /AI-Guided PRD/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Import from GitHub/i })).toBeInTheDocument()
    })

    it('shows recommended badge on AI-Guided PRD option', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      const guidedButton = screen.getByRole('button', { name: /AI-Guided PRD/i })
      expect(within(guidedButton).getByText('Recommended')).toBeInTheDocument()
    })

    it('displays features for AI-Guided PRD option', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      // AI-Guided PRD features
      expect(screen.getByText('Type-specific questions')).toBeInTheDocument()
      expect(screen.getByText('Parallel research agents')).toBeInTheDocument()
      expect(screen.getByText('Requirements scoping')).toBeInTheDocument()
      expect(screen.getByText('Roadmap generation')).toBeInTheDocument()
    })

    it('navigates to type selection when clicking AI-Guided PRD', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /AI-Guided PRD/i }))

      // Should now show type selection step
      expect(screen.getByText('What type of PRD are you creating?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Bug Fix/i })).toBeInTheDocument()
    })
  })

  describe('Step 2: PRD Type Selection', () => {
    it('shows all PRD types in step 2', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /AI-Guided PRD/i }))

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

      await user.click(screen.getByRole('button', { name: /AI-Guided PRD/i }))

      expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument()
    })

    it('navigates back to step 1 when clicking Back', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /AI-Guided PRD/i }))
      await user.click(screen.getByRole('button', { name: /Back/i }))

      // Should be back on step 1
      expect(screen.getByText('How would you like to create your PRD?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /AI-Guided PRD/i })).toBeInTheDocument()
    })

    it('continue button is disabled until a type is selected', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /AI-Guided PRD/i }))

      const continueButton = screen.getByRole('button', { name: /Continue/i })
      expect(continueButton).toBeDisabled()
    })

    it('continue button is enabled after selecting a type', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /AI-Guided PRD/i }))
      await user.click(screen.getByRole('button', { name: /Bug Fix/i }))

      const continueButton = screen.getByRole('button', { name: /Continue/i })
      expect(continueButton).toBeEnabled()
    })

    it('calls onSelect with correct parameters for Bug Fix', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/test/project" />)

      await user.click(screen.getByRole('button', { name: /AI-Guided PRD/i }))
      await user.click(screen.getByRole('button', { name: /Bug Fix/i }))
      await user.click(screen.getByRole('button', { name: /Continue/i }))

      // Opens naming dialog, confirm with default name
      await user.click(screen.getByRole('button', { name: /Create Session/i }))

      expect(mockOnSelect).toHaveBeenCalledWith(
        'bug_fix',
        true, // guidedMode
        '/test/project',
        'Bug Fix PRD' // default title
      )
    })

    it('calls onSelect with correct parameters for Refactoring', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/my/project" />)

      await user.click(screen.getByRole('button', { name: /AI-Guided PRD/i }))
      await user.click(screen.getByRole('button', { name: /Refactoring/i }))
      await user.click(screen.getByRole('button', { name: /Continue/i }))

      // Opens naming dialog, confirm with default name
      await user.click(screen.getByRole('button', { name: /Create Session/i }))

      expect(mockOnSelect).toHaveBeenCalledWith(
        'refactoring',
        true,
        '/my/project',
        'Refactoring PRD'
      )
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

      const guidedButton = screen.getByRole('button', { name: /AI-Guided PRD/i })
      expect(guidedButton).toBeDisabled()
    })

    it('disables type buttons when loading in step 2', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /AI-Guided PRD/i }))

      // Rerender with loading state
      rerender(<PRDTypeSelector onSelect={mockOnSelect} loading={true} />)

      const bugFixButton = screen.getByRole('button', { name: /Bug Fix/i })
      expect(bugFixButton).toBeDisabled()
    })
  })
})
