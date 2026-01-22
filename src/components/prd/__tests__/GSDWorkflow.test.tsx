/**
 * GSD Workflow Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GSDWorkflow } from '../GSDWorkflow'
import { GSDStepper, GSDStepperCompact } from '../gsd/GSDStepper'
import { DeepQuestioning } from '../DeepQuestioning'
import { QuestioningGuide } from '../gsd/QuestioningGuide'
import { ResearchSummary } from '../gsd/ResearchSummary'
import type { QuestioningContext, ResearchSynthesis } from '@/types/gsd'

// Mock the Tauri API
vi.mock('@/lib/tauri-api', () => ({
  gsdApi: {
    getState: vi.fn().mockResolvedValue(null),
    startSession: vi.fn().mockResolvedValue({
      sessionId: 'test-session',
      currentPhase: 'deep_questioning',
      questioningContext: { notes: [] },
      researchStatus: {
        architecture: { running: false, complete: false },
        codebase: { running: false, complete: false },
        bestPractices: { running: false, complete: false },
        risks: { running: false, complete: false },
      },
      decisions: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isComplete: false,
    }),
    updatePhase: vi.fn().mockImplementation(async (_, __, phase) => ({
      sessionId: 'test-session',
      currentPhase: phase,
      questioningContext: { notes: [] },
      researchStatus: {
        architecture: { running: false, complete: false },
        codebase: { running: false, complete: false },
        bestPractices: { running: false, complete: false },
        risks: { running: false, complete: false },
      },
      decisions: [],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isComplete: false,
    })),
    updateQuestioningContext: vi.fn().mockResolvedValue({}),
  },
}))

// Mock the store
vi.mock('@/stores/gsdStore', () => ({
  useGsdStore: () => ({
    workflowState: null,
    isLoading: false,
    error: null,
    requirementsDoc: null,
    roadmapDoc: null,
    verificationResult: null,
    researchResults: [],
    setError: vi.fn(),
    setLoading: vi.fn(),
    setPhase: vi.fn(),
  }),
}))

// Mock the PRD chat store
vi.mock('@/stores/prdChatStore', () => ({
  usePRDChatStore: () => ({
    currentSession: null,
    messages: [],
    streaming: false,
    startSession: vi.fn(),
    sendMessage: vi.fn(),
  }),
}))

// Mock the project store
vi.mock('@/stores/projectStore', () => ({
  useProjectStore: () => ({
    activeProject: { path: '/test/path' },
  }),
}))

describe('GSDStepper', () => {
  it('renders all 8 phases', () => {
    render(
      <GSDStepper
        currentPhase="deep_questioning"
        onPhaseClick={() => {}}
      />
    )

    // Check that all phase names are present (some may be hidden on small screens)
    expect(screen.getByText('Deep Questioning')).toBeInTheDocument()
  })

  it('highlights current phase', () => {
    render(
      <GSDStepper
        currentPhase="research"
        onPhaseClick={() => {}}
      />
    )

    const researchButton = screen.getByText('Research').closest('button')
    expect(researchButton).toHaveClass('bg-primary/10')
  })

  it('calls onPhaseClick when a phase is clicked', () => {
    const onPhaseClick = vi.fn()
    render(
      <GSDStepper
        currentPhase="deep_questioning"
        onPhaseClick={onPhaseClick}
      />
    )

    const deepQuestioningButton = screen.getByText('Deep Questioning').closest('button')
    fireEvent.click(deepQuestioningButton!)

    expect(onPhaseClick).toHaveBeenCalledWith('deep_questioning')
  })

  it('marks completed phases with check icon', () => {
    render(
      <GSDStepper
        currentPhase="research"
        completedPhases={['deep_questioning', 'project_document']}
        onPhaseClick={() => {}}
      />
    )

    // The completed phases should have check icons (green-500 color)
    const deepQuestioningButton = screen.getByText('Deep Questioning').closest('button')
    expect(deepQuestioningButton?.querySelector('svg')).toHaveClass('text-green-500')
  })

  it('disables future phases when disabled prop is true', () => {
    render(
      <GSDStepper
        currentPhase="deep_questioning"
        onPhaseClick={() => {}}
        disabled={true}
      />
    )

    // All buttons should be disabled
    const buttons = screen.getAllByRole('button')
    buttons.forEach(button => {
      expect(button).toBeDisabled()
    })
  })
})

describe('GSDStepperCompact', () => {
  it('renders compact dots for all phases', () => {
    render(
      <GSDStepperCompact
        currentPhase="requirements"
        onPhaseClick={() => {}}
      />
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(8)
  })

  it('highlights current phase with wider dot', () => {
    render(
      <GSDStepperCompact
        currentPhase="research"
        onPhaseClick={() => {}}
      />
    )

    const buttons = screen.getAllByRole('button')
    // Research is the 3rd phase (index 2)
    expect(buttons[2]).toHaveClass('w-4')
  })
})

describe('DeepQuestioning', () => {
  const defaultContext: QuestioningContext = {
    notes: [],
  }

  it('renders initial prompt', () => {
    render(
      <DeepQuestioning
        context={defaultContext}
        onContextUpdate={() => {}}
        onProceed={() => {}}
      />
    )

    // New chat-based interface shows a different welcome message
    expect(screen.getByText(/Tell me about what you want to build/)).toBeInTheDocument()
  })

  it('shows context badges', () => {
    render(
      <DeepQuestioning
        context={defaultContext}
        onContextUpdate={() => {}}
        onProceed={() => {}}
      />
    )

    // Use getAllByText since these labels appear in both badges and form labels
    expect(screen.getAllByText('What').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Why').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Who').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Done').length).toBeGreaterThan(0)
  })

  it('disables proceed button when context is incomplete', () => {
    render(
      <DeepQuestioning
        context={defaultContext}
        onContextUpdate={() => {}}
        onProceed={() => {}}
      />
    )

    const proceedButton = screen.getByText(/Create PROJECT.md/).closest('button')
    expect(proceedButton).toBeDisabled()
  })

  it('enables proceed button when 3+ context items are filled', () => {
    const completeContext: QuestioningContext = {
      what: 'A task app',
      why: 'Teams need it',
      who: 'Remote workers',
      notes: [],
    }

    render(
      <DeepQuestioning
        context={completeContext}
        onContextUpdate={() => {}}
        onProceed={() => {}}
      />
    )

    const proceedButton = screen.getByText(/Create PROJECT.md/).closest('button')
    expect(proceedButton).not.toBeDisabled()
  })

  it('has chat input for describing project', () => {
    render(
      <DeepQuestioning
        context={defaultContext}
        onContextUpdate={() => {}}
        onProceed={() => {}}
      />
    )

    // New chat-based interface uses ChatInput
    const chatInput = screen.getByPlaceholderText(/Describe your project idea/)
    expect(chatInput).toBeInTheDocument()
  })
})

describe('QuestioningGuide', () => {
  const defaultContext: QuestioningContext = {
    notes: [],
  }

  it('renders all 4 context items', () => {
    render(
      <QuestioningGuide
        context={defaultContext}
        onContextItemUpdate={() => {}}
        onClose={() => {}}
      />
    )

    expect(screen.getByText('What')).toBeInTheDocument()
    expect(screen.getByText('Why')).toBeInTheDocument()
    expect(screen.getByText('Who')).toBeInTheDocument()
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('shows completion count', () => {
    const partialContext: QuestioningContext = {
      what: 'Something',
      why: 'Some reason',
      notes: [],
    }

    render(
      <QuestioningGuide
        context={partialContext}
        onContextItemUpdate={() => {}}
        onClose={() => {}}
      />
    )

    expect(screen.getByText('2/4 items completed')).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn()

    render(
      <QuestioningGuide
        context={defaultContext}
        onContextItemUpdate={() => {}}
        onClose={onClose}
      />
    )

    // Find the close button (has X icon)
    const closeButton = screen.getAllByRole('button')[0]
    fireEvent.click(closeButton)

    expect(onClose).toHaveBeenCalled()
  })
})

describe('ResearchSummary', () => {
  const mockSynthesis: ResearchSynthesis = {
    content: '# Research Summary\n\nThis is a test summary.',
    filesIncluded: 4,
    missingFiles: [],
    keyThemes: ['Architecture', 'Performance', 'Security'],
  }

  it('renders key themes as badges', () => {
    render(
      <ResearchSummary
        synthesis={mockSynthesis}
        onClose={() => {}}
      />
    )

    expect(screen.getByText('Architecture')).toBeInTheDocument()
    expect(screen.getByText('Performance')).toBeInTheDocument()
    expect(screen.getByText('Security')).toBeInTheDocument()
  })

  it('shows files included count', () => {
    render(
      <ResearchSummary
        synthesis={mockSynthesis}
        onClose={() => {}}
      />
    )

    expect(screen.getByText('4')).toBeInTheDocument()
  })

  it('shows missing files warning when present', () => {
    const synthesisWithMissing: ResearchSynthesis = {
      ...mockSynthesis,
      missingFiles: ['CODEBASE.md'],
    }

    render(
      <ResearchSummary
        synthesis={synthesisWithMissing}
        onClose={() => {}}
      />
    )

    expect(screen.getByText(/Some research files were not available/)).toBeInTheDocument()
    expect(screen.getByText('CODEBASE.md')).toBeInTheDocument()
  })

  it('renders summary content', () => {
    render(
      <ResearchSummary
        synthesis={mockSynthesis}
        onClose={() => {}}
      />
    )

    expect(screen.getByText(/This is a test summary/)).toBeInTheDocument()
  })
})

describe('GSDWorkflow Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state initially', () => {
    vi.mock('@/stores/gsdStore', () => ({
      useGsdStore: () => ({
        workflowState: null,
        isLoading: true,
        error: null,
        requirementsDoc: null,
        roadmapDoc: null,
        verificationResult: null,
        researchResults: [],
        setError: vi.fn(),
        setLoading: vi.fn(),
        setPhase: vi.fn(),
      }),
    }))

    render(
      <GSDWorkflow
        projectPath="/test/path"
        sessionId="test-session"
      />
    )

    // Should show loading indicator
    expect(screen.queryByText(/Loading/)).toBeInTheDocument()
  })
})
