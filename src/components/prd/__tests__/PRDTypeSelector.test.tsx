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

// Mock SimpleGSDIntro component
vi.mock('../gsd/SimpleGSDIntro', () => ({
  SimpleGSDIntro: ({ onStart, onSkip }: { onStart: () => void; onSkip: () => void }) => (
    <div data-testid="simple-gsd-intro">
      <button onClick={onStart}>Get Started</button>
      <button onClick={onSkip}>Skip</button>
    </div>
  ),
}))

// Mock onboarding store to indicate user has seen onboarding
vi.mock('@/stores/onboardingStore', () => ({
  useOnboardingStore: () => ({
    hasSeenGSDOnboarding: true, // Mock as already seen to skip onboarding in tests
    markGSDOnboardingAsSeen: vi.fn(),
  }),
}))

describe('PRDTypeSelector', () => {
  const mockOnSelect = vi.fn()

  beforeEach(() => {
    mockOnSelect.mockClear()
  })

  describe('Step 1: Workflow Mode Selection', () => {
    it('renders workflow options on initial render', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      expect(screen.getByRole('button', { name: /Full Project Plan/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Import from GitHub/i })).toBeInTheDocument()
    })

    it('shows recommended badge on Full Project Plan option', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      const guidedButton = screen.getByRole('button', { name: /Full Project Plan/i })
      expect(within(guidedButton).getByText('Recommended')).toBeInTheDocument()
    })

    it('displays features for Full Project Plan option', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      // Full Project Plan features
      expect(screen.getByText('Deep questioning session')).toBeInTheDocument()
      expect(screen.getByText('Parallel research agents')).toBeInTheDocument()
      expect(screen.getByText('Requirements scoping')).toBeInTheDocument()
      expect(screen.getByText('Roadmap generation')).toBeInTheDocument()
    })

    it('navigates to type selection when clicking Full Project Plan', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Full Project Plan/i }))

      // Should now show type selection step
      expect(screen.getByText('What type of PRD are you creating?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Bug Fix/i })).toBeInTheDocument()
    })
  })

  describe('Step 2: PRD Type Selection', () => {
    it('shows all PRD types in step 2', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Full Project Plan/i }))

      expect(screen.getByRole('button', { name: /New Feature/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Full New App/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Bug Fix/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Refactoring/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /API Integration/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /General/i })).toBeInTheDocument()
    })

    it('shows PRD type groupings', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Full Project Plan/i }))

      // Should show section headers
      expect(screen.getByText('Quick PRD')).toBeInTheDocument()
      expect(screen.getByText('Full Project Plan')).toBeInTheDocument()
      expect(screen.getByText('Other')).toBeInTheDocument()
    })

    it('shows Back button in step 2', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Full Project Plan/i }))

      expect(screen.getByRole('button', { name: /Back/i })).toBeInTheDocument()
    })

    it('navigates back to step 1 when clicking Back', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Full Project Plan/i }))
      await user.click(screen.getByRole('button', { name: /Back/i }))

      // Should be back on step 1
      expect(screen.getByText('How would you like to create your PRD?')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Full Project Plan/i })).toBeInTheDocument()
    })

    it('continue button is disabled until a type is selected', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Full Project Plan/i }))

      const continueButton = screen.getByRole('button', { name: /Continue/i })
      expect(continueButton).toBeDisabled()
    })

    it('continue button is enabled after selecting a type', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Full Project Plan/i }))
      await user.click(screen.getByRole('button', { name: /New Feature/i }))

      const continueButton = screen.getByRole('button', { name: /Continue/i })
      expect(continueButton).toBeEnabled()
    })

    it('calls onSelect with guidedMode=true for New Feature', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/test/project" />)

      await user.click(screen.getByRole('button', { name: /Full Project Plan/i }))
      await user.click(screen.getByRole('button', { name: /New Feature/i }))
      await user.click(screen.getByRole('button', { name: /Continue/i }))

      // Opens naming dialog, confirm with default name
      await user.click(screen.getByRole('button', { name: /Create Session/i }))

      expect(mockOnSelect).toHaveBeenCalledWith(
        'new_feature',
        true, // guidedMode
        '/test/project',
        'My Feature' // default title
      )
    })

    it('calls onSelect with guidedMode=false for Bug Fix (Quick PRD)', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/test/project" />)

      await user.click(screen.getByRole('button', { name: /Full Project Plan/i }))

      // Click Bug Fix (Quick PRD)
      await user.click(screen.getByRole('button', { name: /Bug Fix/i }))

      // Should open naming dialog immediately
      expect(screen.getByText('Name Your Session')).toBeInTheDocument()

      // Confirm with default name
      await user.click(screen.getByRole('button', { name: /Create Session/i }))

      expect(mockOnSelect).toHaveBeenCalledWith(
        'bug_fix',
        false, // guidedMode = false for Quick PRD
        '/test/project',
        'Bug Fix'
      )
    })

    it('calls onSelect with guidedMode=false for Refactoring (Quick PRD)', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/my/project" />)

      await user.click(screen.getByRole('button', { name: /Full Project Plan/i }))
      await user.click(screen.getByRole('button', { name: /Refactoring/i }))

      // Should open naming dialog immediately
      expect(screen.getByText('Name Your Session')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Create Session/i }))

      expect(mockOnSelect).toHaveBeenCalledWith(
        'refactoring',
        false, // guidedMode = false for Quick PRD
        '/my/project',
        'Refactoring'
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

      const guidedButton = screen.getByRole('button', { name: /Full Project Plan/i })
      expect(guidedButton).toBeDisabled()
    })

    it('disables type buttons when loading in step 2', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Full Project Plan/i }))

      // Rerender with loading state
      rerender(<PRDTypeSelector onSelect={mockOnSelect} loading={true} />)

      const bugFixButton = screen.getByRole('button', { name: /Bug Fix/i })
      expect(bugFixButton).toBeDisabled()
    })
  })
})
