import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
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

// Mock onboarding store to indicate user has seen onboarding
vi.mock('@/stores/onboardingStore', () => ({
  useOnboardingStore: () => ({
    hasSeenMainOnboarding: true,
    markMainOnboardingAsSeen: vi.fn(),
  }),
}))

describe('PRDTypeSelector', () => {
  const mockOnSelect = vi.fn()

  beforeEach(() => {
    mockOnSelect.mockClear()
  })

  describe('Single-Step Type Selection', () => {
    it('renders all PRD types in a single view', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      // All types should be visible immediately
      expect(screen.getByRole('button', { name: /Bug Fix/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Refactoring/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /API Integration/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /New Feature/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Full New App/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /General/i })).toBeInTheDocument()
    })

    it('shows section headers', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      expect(screen.getByText('Quick PRD')).toBeInTheDocument()
      expect(screen.getByText('Full Project Plan')).toBeInTheDocument()
      expect(screen.getByText('Other')).toBeInTheDocument()
    })

    it('shows GitHub Import button as secondary action', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      expect(screen.getByRole('button', { name: /Import from GitHub Issues/i })).toBeInTheDocument()
    })

    it('opens naming dialog when clicking any PRD type', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Bug Fix/i }))

      expect(screen.getByText('Name Your Session')).toBeInTheDocument()
    })
  })

  describe('Guided Mode Assignment', () => {
    it('calls onSelect with guidedMode=false for Bug Fix (Quick PRD)', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/test/project" />)

      await user.click(screen.getByRole('button', { name: /Bug Fix/i }))
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

      await user.click(screen.getByRole('button', { name: /Refactoring/i }))
      await user.click(screen.getByRole('button', { name: /Create Session/i }))

      expect(mockOnSelect).toHaveBeenCalledWith(
        'refactoring',
        false, // guidedMode = false for Quick PRD
        '/my/project',
        'Refactoring'
      )
    })

    it('calls onSelect with guidedMode=false for API Integration (Quick PRD)', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/test/project" />)

      await user.click(screen.getByRole('button', { name: /API Integration/i }))
      await user.click(screen.getByRole('button', { name: /Create Session/i }))

      expect(mockOnSelect).toHaveBeenCalledWith(
        'api_integration',
        false, // guidedMode = false for Quick PRD
        '/test/project',
        'API Integration'
      )
    })

    it('calls onSelect with guidedMode=true for New Feature (Full Project)', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/test/project" />)

      await user.click(screen.getByRole('button', { name: /New Feature/i }))
      await user.click(screen.getByRole('button', { name: /Create Session/i }))

      expect(mockOnSelect).toHaveBeenCalledWith(
        'new_feature',
        true, // guidedMode = true for Full Project
        '/test/project',
        'My Feature'
      )
    })

    it('calls onSelect with guidedMode=true for Full New App', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/test/project" />)

      await user.click(screen.getByRole('button', { name: /Full New App/i }))
      await user.click(screen.getByRole('button', { name: /Create Session/i }))

      expect(mockOnSelect).toHaveBeenCalledWith(
        'full_new_app',
        true, // guidedMode = true for Full Project
        '/test/project',
        'My Project'
      )
    })

    it('calls onSelect with guidedMode=true for General', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/test/project" />)

      await user.click(screen.getByRole('button', { name: /General/i }))
      await user.click(screen.getByRole('button', { name: /Create Session/i }))

      expect(mockOnSelect).toHaveBeenCalledWith(
        'general',
        true, // guidedMode = true for General (not a quick PRD type)
        '/test/project',
        'My PRD'
      )
    })
  })

  describe('Session Naming Dialog', () => {
    it('allows custom session name', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/test/project" />)

      await user.click(screen.getByRole('button', { name: /Bug Fix/i }))

      const nameInput = screen.getByRole('textbox')
      await user.clear(nameInput)
      await user.type(nameInput, 'Custom Session Name')

      await user.click(screen.getByRole('button', { name: /Create Session/i }))

      expect(mockOnSelect).toHaveBeenCalledWith(
        'bug_fix',
        false,
        '/test/project',
        'Custom Session Name'
      )
    })

    it('closes dialog on cancel', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} />)

      await user.click(screen.getByRole('button', { name: /Bug Fix/i }))
      expect(screen.getByText('Name Your Session')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Cancel/i }))

      expect(screen.queryByText('Name Your Session')).not.toBeInTheDocument()
      expect(mockOnSelect).not.toHaveBeenCalled()
    })

    it('submits on Enter key', async () => {
      const user = userEvent.setup()
      render(<PRDTypeSelector onSelect={mockOnSelect} defaultProjectPath="/test" />)

      await user.click(screen.getByRole('button', { name: /Bug Fix/i }))

      const nameInput = screen.getByRole('textbox')
      await user.type(nameInput, '{Enter}')

      expect(mockOnSelect).toHaveBeenCalledWith('bug_fix', false, '/test', 'Bug Fix')
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
    it('disables type buttons when loading', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} loading={true} />)

      const bugFixButton = screen.getByRole('button', { name: /Bug Fix/i })
      expect(bugFixButton).toBeDisabled()

      const newFeatureButton = screen.getByRole('button', { name: /New Feature/i })
      expect(newFeatureButton).toBeDisabled()
    })

    it('disables GitHub import button when loading', () => {
      render(<PRDTypeSelector onSelect={mockOnSelect} loading={true} />)

      const importButton = screen.getByRole('button', { name: /Import from GitHub Issues/i })
      expect(importButton).toBeDisabled()
    })
  })
})
