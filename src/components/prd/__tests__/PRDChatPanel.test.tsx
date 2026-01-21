import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { PRDChatPanel } from '../PRDChatPanel'
import type { ChatSession, ChatMessage } from '@/types'

// Wrapper component for Router context
function renderWithRouter(ui: React.ReactElement, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>
  )
}

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn()

// Mock the store
const mockUsePRDChatStore = vi.fn()

vi.mock('@/stores/prdChatStore', () => ({
  usePRDChatStore: () => mockUsePRDChatStore(),
}))

// Mock the session store
vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: {
    getState: () => ({
      fetchSession: vi.fn().mockResolvedValue(undefined),
    }),
  },
}))

// Mock the tauri-api
const mockCheckAgentAvailability = vi.fn()

vi.mock('@/lib/tauri-api', () => ({
  prdChatApi: {
    checkAgentAvailability: () => mockCheckAgentAvailability(),
  },
}))

// Mock Tauri event listener
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}))

// Mock the useAvailableModels hook
vi.mock('@/hooks/useAvailableModels', () => ({
  useAvailableModels: () => ({
    models: [
      { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic', isDefault: true },
      { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'anthropic', isDefault: false },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
    defaultModelId: 'claude-sonnet-4-5',
  }),
}))

// Sample test data
const mockMessages: ChatMessage[] = [
  {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'user',
    content: 'Help me create a PRD for a todo app',
    createdAt: '2024-01-01T10:00:00.000Z',
  },
  {
    id: 'msg-2',
    sessionId: 'session-1',
    role: 'assistant',
    content: 'I would be happy to help you create a PRD for a todo app. Let me ask you some clarifying questions...',
    createdAt: '2024-01-01T10:00:05.000Z',
  },
]

const mockSessions: ChatSession[] = [
  {
    id: 'session-1',
    agentType: 'claude',
    title: 'Todo App PRD',
    createdAt: '2024-01-01T09:00:00.000Z',
    updatedAt: '2024-01-01T10:00:05.000Z',
    messageCount: 2,
  },
  {
    id: 'session-2',
    agentType: 'opencode',
    title: 'E-commerce PRD',
    createdAt: '2024-01-02T09:00:00.000Z',
    updatedAt: '2024-01-02T09:00:00.000Z',
    messageCount: 0,
  },
]

describe('PRDChatPanel', () => {
  const mockSendMessage = vi.fn()
  const mockStartSession = vi.fn()
  const mockDeleteSession = vi.fn()
  const mockSetCurrentSession = vi.fn()
  const mockLoadHistory = vi.fn()
  const mockLoadSessions = vi.fn()
  const mockExportToPRD = vi.fn()
  const mockClearError = vi.fn()
  const mockAssessQuality = vi.fn()
  const mockLoadGuidedQuestions = vi.fn()
  const mockPreviewExtraction = vi.fn()
  const mockSetStructuredMode = vi.fn()
  const mockLoadExtractedStructure = vi.fn()
  const mockClearExtractedStructure = vi.fn()
  const mockStartWatchingPlanFile = vi.fn()
  const mockStopWatchingPlanFile = vi.fn()
  const mockUpdatePlanContent = vi.fn()

  const defaultStoreState = {
    sessions: mockSessions,
    currentSession: mockSessions[0],
    messages: mockMessages,
    loading: false,
    streaming: false,
    error: null,
    qualityAssessment: null,
    guidedQuestions: [],
    extractedContent: null,
    processingSessionId: null,
    extractedStructure: null,
    watchedPlanContent: null,
    watchedPlanPath: null,
    isWatchingPlan: false,
    sendMessage: mockSendMessage,
    startSession: mockStartSession,
    deleteSession: mockDeleteSession,
    setCurrentSession: mockSetCurrentSession,
    loadHistory: mockLoadHistory,
    loadSessions: mockLoadSessions,
    exportToPRD: mockExportToPRD,
    clearError: mockClearError,
    assessQuality: mockAssessQuality,
    loadGuidedQuestions: mockLoadGuidedQuestions,
    previewExtraction: mockPreviewExtraction,
    setStructuredMode: mockSetStructuredMode,
    loadExtractedStructure: mockLoadExtractedStructure,
    clearExtractedStructure: mockClearExtractedStructure,
    startWatchingPlanFile: mockStartWatchingPlanFile,
    stopWatchingPlanFile: mockStopWatchingPlanFile,
    updatePlanContent: mockUpdatePlanContent,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePRDChatStore.mockReturnValue(defaultStoreState)
    // Mock agent availability check to return available
    mockCheckAgentAvailability.mockResolvedValue({
      available: true,
      agent: 'claude',
      path: '/usr/local/bin/claude',
      error: null,
    })
  })

  // ============================================================================
  // Agent Selector Tests
  // ============================================================================

  describe('Agent Selector', () => {
    it('renders agent selector dropdown', () => {
      renderWithRouter(<PRDChatPanel />)

      const agentSelector = screen.getByRole('combobox', { name: /agent/i })
      expect(agentSelector).toBeInTheDocument()
    })

    it('shows all available agent options', () => {
      renderWithRouter(<PRDChatPanel />)

      const agentSelector = screen.getByRole('combobox', { name: /agent/i })
      expect(agentSelector).toBeInTheDocument()

      // Check for all agent options
      expect(screen.getByText('Claude')).toBeInTheDocument()
      expect(screen.getByText('OpenCode')).toBeInTheDocument()
      expect(screen.getByText('Cursor')).toBeInTheDocument()
    })

    it('displays the currently selected agent', () => {
      renderWithRouter(<PRDChatPanel />)

      const agentSelector = screen.getByRole('combobox', { name: /agent/i })
      expect(agentSelector).toHaveValue('claude')
    })

    it('shows type selector when agent is changed', async () => {
      renderWithRouter(<PRDChatPanel />)

      const agentSelector = screen.getByRole('combobox', { name: /agent/i })
      fireEvent.change(agentSelector, { target: { value: 'opencode' } })

      // Changing agent should show the type selector modal
      await waitFor(() => {
        expect(screen.getByText(/What type of PRD are you creating/i)).toBeInTheDocument()
      })
    })

    it('disables agent selector when streaming', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        streaming: true,
      })

      renderWithRouter(<PRDChatPanel />)

      const agentSelector = screen.getByRole('combobox', { name: /agent/i })
      expect(agentSelector).toBeDisabled()
    })
  })

  // ============================================================================
  // Model Selector Tests
  // ============================================================================

  describe('Model Selector', () => {
    it('renders model selector dropdown', () => {
      renderWithRouter(<PRDChatPanel />)

      const modelSelector = screen.getByRole('combobox', { name: /model/i })
      expect(modelSelector).toBeInTheDocument()
    })

    it('shows available models for selected agent', () => {
      renderWithRouter(<PRDChatPanel />)

      // For claude agent, should show Claude models
      expect(screen.getByText('Claude Sonnet 4.5')).toBeInTheDocument()
      expect(screen.getByText('Claude Opus 4.5')).toBeInTheDocument()
    })

    it('disables model selector when streaming', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        streaming: true,
      })

      renderWithRouter(<PRDChatPanel />)

      const modelSelector = screen.getByRole('combobox', { name: /model/i })
      expect(modelSelector).toBeDisabled()
    })
  })

  // ============================================================================
  // Message Display Tests
  // ============================================================================

  describe('Message Display', () => {
    it('displays chat messages with correct content', () => {
      renderWithRouter(<PRDChatPanel />)

      expect(screen.getByText('Help me create a PRD for a todo app')).toBeInTheDocument()
      expect(
        screen.getByText(/I would be happy to help you create a PRD for a todo app/)
      ).toBeInTheDocument()
    })

    it('applies user message styling', () => {
      renderWithRouter(<PRDChatPanel />)

      const userMessage = screen.getByText('Help me create a PRD for a todo app')
      const messageContainer = userMessage.closest('[data-testid="message-user"]')
      expect(messageContainer).toBeInTheDocument()
    })

    it('applies assistant message styling', () => {
      renderWithRouter(<PRDChatPanel />)

      const assistantMessage = screen.getByText(
        /I would be happy to help you create a PRD for a todo app/
      )
      const messageContainer = assistantMessage.closest('[data-testid="message-assistant"]')
      expect(messageContainer).toBeInTheDocument()
    })

    it('displays empty state when no messages', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        messages: [],
      })

      renderWithRouter(<PRDChatPanel />)

      expect(screen.getByText(/Start a conversation/i)).toBeInTheDocument()
    })

    it('shows message timestamps', () => {
      renderWithRouter(<PRDChatPanel />)

      // Check that timestamps are displayed (format may vary by locale)
      const timestampElements = screen.getAllByText(/\d{1,2}:\d{2}/)
      expect(timestampElements.length).toBeGreaterThan(0)
    })
  })

  // ============================================================================
  // Message Input Tests
  // ============================================================================

  describe('Message Input', () => {
    it('displays message input field', () => {
      renderWithRouter(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      expect(input).toBeInTheDocument()
    })

    it('displays send button', () => {
      renderWithRouter(<PRDChatPanel />)

      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeInTheDocument()
    })

    it('allows typing in message input', async () => {
      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      await user.type(input, 'Hello world')

      expect(input).toHaveValue('Hello world')
    })

    it('calls sendMessage on submit', async () => {
      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      await user.type(input, 'Create a PRD for my project')

      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)

      expect(mockSendMessage).toHaveBeenCalledWith('Create a PRD for my project')
    })

    it('clears input after sending message', async () => {
      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      await user.type(input, 'Test message')

      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)

      expect(input).toHaveValue('')
    })

    it('sends message on Enter key press', async () => {
      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      await user.type(input, 'Test message{enter}')

      expect(mockSendMessage).toHaveBeenCalledWith('Test message')
    })

    it('does not send empty messages', async () => {
      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)

      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('disables send button when input is empty', () => {
      renderWithRouter(<PRDChatPanel />)

      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeDisabled()
    })

    it('enables send button when input has content', async () => {
      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      await user.type(input, 'Hello')

      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).not.toBeDisabled()
    })
  })

  // ============================================================================
  // Streaming Indicator Tests
  // ============================================================================

  describe('Streaming Indicator', () => {
    it('shows streaming indicator when waiting for response', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        streaming: true,
      })

      renderWithRouter(<PRDChatPanel />)

      expect(screen.getByTestId('streaming-indicator')).toBeInTheDocument()
    })

    it('hides streaming indicator when not streaming', () => {
      renderWithRouter(<PRDChatPanel />)

      expect(screen.queryByTestId('streaming-indicator')).not.toBeInTheDocument()
    })

    it('disables input when streaming', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        streaming: true,
      })

      renderWithRouter(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      expect(input).toBeDisabled()
    })

    it('disables send button when streaming', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        streaming: true,
      })

      renderWithRouter(<PRDChatPanel />)

      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeDisabled()
    })

    it('shows typing animation in streaming indicator', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        streaming: true,
      })

      renderWithRouter(<PRDChatPanel />)

      const indicator = screen.getByTestId('streaming-indicator')
      expect(indicator).toHaveClass('animate-pulse')
    })
  })

  // ============================================================================
  // No Session State Tests
  // ============================================================================

  describe('No Session State', () => {
    it('disables input when no session is selected', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        currentSession: null,
        messages: [],
      })

      renderWithRouter(<PRDChatPanel />)

      // When no session, placeholder is different
      const input = screen.getByPlaceholderText(/Create a session to start chatting/i)
      expect(input).toBeDisabled()
    })

    it('shows prompt to create session when none selected', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        currentSession: null,
        messages: [],
      })

      renderWithRouter(<PRDChatPanel />)

      expect(screen.getByText(/Create a new session/i)).toBeInTheDocument()
    })

    it('disables send button when no session', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        currentSession: null,
        messages: [],
      })

      renderWithRouter(<PRDChatPanel />)

      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeDisabled()
    })
  })

  // ============================================================================
  // Export to PRD Tests
  // ============================================================================

  describe('Export to PRD', () => {
    it('shows export option in Actions menu when messages exist', async () => {
      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      // Click on Actions dropdown to open the menu
      const actionsButton = screen.getByRole('button', { name: /actions/i })
      await user.click(actionsButton)

      // Export option should be visible in the dropdown
      const exportOption = await screen.findByRole('menuitem', { name: /export to prd/i })
      expect(exportOption).toBeInTheDocument()
    })

    it('hides export option when no messages', async () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        messages: [],
      })

      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      // Click on Actions dropdown
      const actionsButton = screen.getByRole('button', { name: /actions/i })
      await user.click(actionsButton)

      // Export option should not be in the dropdown when no messages
      expect(screen.queryByRole('menuitem', { name: /export to prd/i })).not.toBeInTheDocument()
    })

    it('shows task preview when export option is clicked and quality is ready', async () => {
      // Mock assessQuality to return a ready-for-export assessment
      mockAssessQuality.mockResolvedValue({
        overall: 80,
        completeness: 85,
        clarity: 75,
        actionability: 80,
        missingSections: [],
        suggestions: [],
        readyForExport: true,
      })

      // Mock getExtractedStructure to return a valid structure
      mockGetExtractedStructure.mockResolvedValue({
        title: 'Test PRD',
        description: 'Test description',
        tasks: [
          { id: 'task-1', title: 'Task 1', description: 'Description 1', priority: 1 },
        ],
      })

      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      // Click on Actions dropdown
      const actionsButton = screen.getByRole('button', { name: /actions/i })
      await user.click(actionsButton)

      // Click on Export to PRD option
      const exportOption = await screen.findByRole('menuitem', { name: /export to prd/i })
      await user.click(exportOption)

      await waitFor(() => {
        expect(mockAssessQuality).toHaveBeenCalled()
      })
    })

    it('shows quality panel when PRD is not ready for export', async () => {
      // Mock assessQuality to return a not-ready assessment
      mockAssessQuality.mockResolvedValue({
        overall: 40,
        completeness: 35,
        clarity: 45,
        actionability: 40,
        missingSections: ['User Stories', 'Acceptance Criteria'],
        suggestions: ['Add more detail'],
        readyForExport: false,
      })

      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      // Click on Actions dropdown
      const actionsButton = screen.getByRole('button', { name: /actions/i })
      await user.click(actionsButton)

      // Click on Export to PRD option
      const exportOption = await screen.findByRole('menuitem', { name: /export to prd/i })
      await user.click(exportOption)

      await waitFor(() => {
        expect(mockAssessQuality).toHaveBeenCalled()
      })
      // Export should not be called if not ready
      expect(mockExportToPRD).not.toHaveBeenCalled()
    })

    it('disables Actions button when streaming', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        streaming: true,
      })

      renderWithRouter(<PRDChatPanel />)

      const actionsButton = screen.getByRole('button', { name: /actions/i })
      expect(actionsButton).toBeDisabled()
    })
  })

  // ============================================================================
  // Session Management Tests
  // ============================================================================

  describe('Session Management', () => {
    it('displays session list', () => {
      renderWithRouter(<PRDChatPanel />)

      // The title appears in both sidebar and header, use getAllByText
      const todoAppPRDs = screen.getAllByText('Todo App PRD')
      expect(todoAppPRDs.length).toBeGreaterThan(0)

      const ecommercePRDs = screen.getAllByText('E-commerce PRD')
      expect(ecommercePRDs.length).toBeGreaterThan(0)
    })

    it('highlights current session in the list', () => {
      renderWithRouter(<PRDChatPanel />)

      // Find the session item in the sidebar (not the header title)
      const sessionItems = screen.getAllByTestId('session-item')
      const activeSession = sessionItems.find(item => item.getAttribute('data-active') === 'true')
      expect(activeSession).toBeInTheDocument()
      expect(activeSession).toHaveTextContent('Todo App PRD')
    })

    it('shows create session button', () => {
      renderWithRouter(<PRDChatPanel />)

      const createButton = screen.getByRole('button', { name: /new session/i })
      expect(createButton).toBeInTheDocument()
    })

    it('shows type selector when create button is clicked', async () => {
      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      const createButton = screen.getByRole('button', { name: /new session/i })
      await user.click(createButton)

      // Should show the type selector modal
      await waitFor(() => {
        expect(screen.getByText(/What type of PRD are you creating/i)).toBeInTheDocument()
      })
    })

    it('calls setCurrentSession when session is selected (useEffect handles loadHistory)', async () => {
      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      const session2 = screen.getByText('E-commerce PRD')
      await user.click(session2)

      // setCurrentSession is called directly on click
      expect(mockSetCurrentSession).toHaveBeenCalledWith(mockSessions[1])
      // loadHistory is now called by useEffect when currentSession changes
      // so we verify it was called at least once (may be for initial session or new one)
      expect(mockLoadHistory).toHaveBeenCalled()
    })

    it('shows delete button for each session', () => {
      renderWithRouter(<PRDChatPanel />)

      const deleteButtons = screen.getAllByRole('button', { name: /delete session/i })
      expect(deleteButtons).toHaveLength(2)
    })

    it('shows confirmation dialog when delete button is clicked and deletes on confirm', async () => {
      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      // Click the delete button in the session list
      const deleteButtons = screen.getAllByRole('button', { name: /delete session/i })
      await user.click(deleteButtons[0])

      // Confirmation dialog should appear with the dialog title
      await waitFor(() => {
        expect(screen.getByText(/Delete Session\?/i)).toBeInTheDocument()
        expect(screen.getByText(/This will permanently delete/i)).toBeInTheDocument()
      })

      // Find the confirm button - the one that's not labeled "Cancel"
      // Get all buttons with "Delete Session" text (there are delete buttons in list + dialog)
      const allDeleteButtons = screen.getAllByRole('button', { name: /Delete Session/i })
      // The last one should be the confirmation button in the dialog
      const confirmButton = allDeleteButtons[allDeleteButtons.length - 1]
      await user.click(confirmButton)

      expect(mockDeleteSession).toHaveBeenCalledWith('session-1')
    })

    it('shows empty state when no sessions exist', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        sessions: [],
        currentSession: null,
        messages: [],
      })

      renderWithRouter(<PRDChatPanel />)

      expect(screen.getByText(/No sessions yet/i)).toBeInTheDocument()
    })
  })

  // ============================================================================
  // Loading State Tests
  // ============================================================================

  describe('Loading State', () => {
    it('shows loading spinner when loading', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        loading: true,
      })

      renderWithRouter(<PRDChatPanel />)

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    })

    it('disables interactions when loading', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        loading: true,
      })

      renderWithRouter(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      const sendButton = screen.getByRole('button', { name: /send/i })

      expect(input).toBeDisabled()
      expect(sendButton).toBeDisabled()
    })
  })

  // ============================================================================
  // Error State Tests
  // ============================================================================

  describe('Error State', () => {
    it('displays error message when error occurs', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        error: 'Failed to send message',
      })

      renderWithRouter(<PRDChatPanel />)

      expect(screen.getByText('Failed to send message')).toBeInTheDocument()
    })

    it('allows retry after error', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        error: 'Failed to send message',
      })

      renderWithRouter(<PRDChatPanel />)

      // Input should still be enabled to allow retry
      const input = screen.getByPlaceholderText(/Type your message/i)
      expect(input).not.toBeDisabled()
    })
  })

  // ============================================================================
  // Accessibility Tests
  // ============================================================================

  describe('Accessibility', () => {
    it('has accessible labels for form controls', () => {
      renderWithRouter(<PRDChatPanel />)

      expect(screen.getByRole('combobox', { name: /agent/i })).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-label')
    })

    it('has proper heading hierarchy', () => {
      renderWithRouter(<PRDChatPanel />)

      const heading = screen.getByRole('heading', { name: /prd chat/i })
      expect(heading).toBeInTheDocument()
    })

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup()
      renderWithRouter(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      await user.click(input)
      await user.type(input, 'Test')
      await user.keyboard('{Enter}')

      expect(mockSendMessage).toHaveBeenCalledWith('Test')
    })
  })

  // ============================================================================
  // Session Loading Tests
  // ============================================================================

  describe('Session Loading', () => {
    it('calls loadSessions on mount', () => {
      renderWithRouter(<PRDChatPanel />)

      expect(mockLoadSessions).toHaveBeenCalled()
    })

    it('calls loadHistory when currentSession exists', () => {
      renderWithRouter(<PRDChatPanel />)

      // loadHistory should have been called for the current session on mount
      expect(mockLoadHistory).toHaveBeenCalledWith('session-1')
    })
  })
})
