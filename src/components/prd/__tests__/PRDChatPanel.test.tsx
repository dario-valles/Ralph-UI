import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PRDChatPanel } from '../PRDChatPanel'
import type { ChatSession, ChatMessage } from '@/types'

// Mock scrollIntoView (not available in jsdom)
Element.prototype.scrollIntoView = vi.fn()

// Mock the store
const mockUsePRDChatStore = vi.fn()

vi.mock('@/stores/prdChatStore', () => ({
  usePRDChatStore: () => mockUsePRDChatStore(),
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
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePRDChatStore.mockReturnValue(defaultStoreState)
  })

  // ============================================================================
  // Agent Selector Tests
  // ============================================================================

  describe('Agent Selector', () => {
    it('renders agent selector dropdown', () => {
      render(<PRDChatPanel />)

      const agentSelector = screen.getByRole('combobox', { name: /agent/i })
      expect(agentSelector).toBeInTheDocument()
    })

    it('shows all available agent options', () => {
      render(<PRDChatPanel />)

      const agentSelector = screen.getByRole('combobox', { name: /agent/i })
      expect(agentSelector).toBeInTheDocument()

      // Check for all agent options
      expect(screen.getByText('Claude')).toBeInTheDocument()
      expect(screen.getByText('OpenCode')).toBeInTheDocument()
      expect(screen.getByText('Cursor')).toBeInTheDocument()
    })

    it('displays the currently selected agent', () => {
      render(<PRDChatPanel />)

      const agentSelector = screen.getByRole('combobox', { name: /agent/i })
      expect(agentSelector).toHaveValue('claude')
    })

    it('shows type selector when agent is changed', async () => {
      render(<PRDChatPanel />)

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

      render(<PRDChatPanel />)

      const agentSelector = screen.getByRole('combobox', { name: /agent/i })
      expect(agentSelector).toBeDisabled()
    })
  })

  // ============================================================================
  // Message Display Tests
  // ============================================================================

  describe('Message Display', () => {
    it('displays chat messages with correct content', () => {
      render(<PRDChatPanel />)

      expect(screen.getByText('Help me create a PRD for a todo app')).toBeInTheDocument()
      expect(
        screen.getByText(/I would be happy to help you create a PRD for a todo app/)
      ).toBeInTheDocument()
    })

    it('applies user message styling', () => {
      render(<PRDChatPanel />)

      const userMessage = screen.getByText('Help me create a PRD for a todo app')
      const messageContainer = userMessage.closest('[data-testid="message-user"]')
      expect(messageContainer).toBeInTheDocument()
    })

    it('applies assistant message styling', () => {
      render(<PRDChatPanel />)

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

      render(<PRDChatPanel />)

      expect(screen.getByText(/Start a conversation/i)).toBeInTheDocument()
    })

    it('shows message timestamps', () => {
      render(<PRDChatPanel />)

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
      render(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      expect(input).toBeInTheDocument()
    })

    it('displays send button', () => {
      render(<PRDChatPanel />)

      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeInTheDocument()
    })

    it('allows typing in message input', async () => {
      const user = userEvent.setup()
      render(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      await user.type(input, 'Hello world')

      expect(input).toHaveValue('Hello world')
    })

    it('calls sendMessage on submit', async () => {
      const user = userEvent.setup()
      render(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      await user.type(input, 'Create a PRD for my project')

      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)

      expect(mockSendMessage).toHaveBeenCalledWith('Create a PRD for my project')
    })

    it('clears input after sending message', async () => {
      const user = userEvent.setup()
      render(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      await user.type(input, 'Test message')

      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)

      expect(input).toHaveValue('')
    })

    it('sends message on Enter key press', async () => {
      const user = userEvent.setup()
      render(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      await user.type(input, 'Test message{enter}')

      expect(mockSendMessage).toHaveBeenCalledWith('Test message')
    })

    it('does not send empty messages', async () => {
      const user = userEvent.setup()
      render(<PRDChatPanel />)

      const sendButton = screen.getByRole('button', { name: /send/i })
      await user.click(sendButton)

      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('disables send button when input is empty', () => {
      render(<PRDChatPanel />)

      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeDisabled()
    })

    it('enables send button when input has content', async () => {
      const user = userEvent.setup()
      render(<PRDChatPanel />)

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

      render(<PRDChatPanel />)

      expect(screen.getByTestId('streaming-indicator')).toBeInTheDocument()
    })

    it('hides streaming indicator when not streaming', () => {
      render(<PRDChatPanel />)

      expect(screen.queryByTestId('streaming-indicator')).not.toBeInTheDocument()
    })

    it('disables input when streaming', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        streaming: true,
      })

      render(<PRDChatPanel />)

      const input = screen.getByPlaceholderText(/Type your message/i)
      expect(input).toBeDisabled()
    })

    it('disables send button when streaming', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        streaming: true,
      })

      render(<PRDChatPanel />)

      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeDisabled()
    })

    it('shows typing animation in streaming indicator', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        streaming: true,
      })

      render(<PRDChatPanel />)

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

      render(<PRDChatPanel />)

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

      render(<PRDChatPanel />)

      expect(screen.getByText(/Create a new session/i)).toBeInTheDocument()
    })

    it('disables send button when no session', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        currentSession: null,
        messages: [],
      })

      render(<PRDChatPanel />)

      const sendButton = screen.getByRole('button', { name: /send/i })
      expect(sendButton).toBeDisabled()
    })
  })

  // ============================================================================
  // Export to PRD Tests
  // ============================================================================

  describe('Export to PRD', () => {
    it('shows export button when messages exist', () => {
      render(<PRDChatPanel />)

      const exportButton = screen.getByRole('button', { name: /export to prd/i })
      expect(exportButton).toBeInTheDocument()
    })

    it('hides export button when no messages', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        messages: [],
      })

      render(<PRDChatPanel />)

      expect(screen.queryByRole('button', { name: /export to prd/i })).not.toBeInTheDocument()
    })

    it('calls exportToPRD when export button is clicked and quality is ready', async () => {
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

      const user = userEvent.setup()
      render(<PRDChatPanel />)

      const exportButton = screen.getByRole('button', { name: /export to prd/i })
      await user.click(exportButton)

      await waitFor(() => {
        expect(mockAssessQuality).toHaveBeenCalled()
        expect(mockExportToPRD).toHaveBeenCalled()
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
      render(<PRDChatPanel />)

      const exportButton = screen.getByRole('button', { name: /export to prd/i })
      await user.click(exportButton)

      await waitFor(() => {
        expect(mockAssessQuality).toHaveBeenCalled()
      })
      // Export should not be called if not ready
      expect(mockExportToPRD).not.toHaveBeenCalled()
    })

    it('disables export button when streaming', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        streaming: true,
      })

      render(<PRDChatPanel />)

      const exportButton = screen.getByRole('button', { name: /export to prd/i })
      expect(exportButton).toBeDisabled()
    })
  })

  // ============================================================================
  // Session Management Tests
  // ============================================================================

  describe('Session Management', () => {
    it('displays session list', () => {
      render(<PRDChatPanel />)

      // The title appears in both sidebar and header, use getAllByText
      const todoAppPRDs = screen.getAllByText('Todo App PRD')
      expect(todoAppPRDs.length).toBeGreaterThan(0)

      const ecommercePRDs = screen.getAllByText('E-commerce PRD')
      expect(ecommercePRDs.length).toBeGreaterThan(0)
    })

    it('highlights current session in the list', () => {
      render(<PRDChatPanel />)

      // Find the session item in the sidebar (not the header title)
      const sessionItems = screen.getAllByTestId('session-item')
      const activeSession = sessionItems.find(item => item.getAttribute('data-active') === 'true')
      expect(activeSession).toBeInTheDocument()
      expect(activeSession).toHaveTextContent('Todo App PRD')
    })

    it('shows create session button', () => {
      render(<PRDChatPanel />)

      const createButton = screen.getByRole('button', { name: /new session/i })
      expect(createButton).toBeInTheDocument()
    })

    it('shows type selector when create button is clicked', async () => {
      const user = userEvent.setup()
      render(<PRDChatPanel />)

      const createButton = screen.getByRole('button', { name: /new session/i })
      await user.click(createButton)

      // Should show the type selector modal
      await waitFor(() => {
        expect(screen.getByText(/What type of PRD are you creating/i)).toBeInTheDocument()
      })
    })

    it('calls setCurrentSession and loadHistory when session is selected', async () => {
      const user = userEvent.setup()
      render(<PRDChatPanel />)

      const session2 = screen.getByText('E-commerce PRD')
      await user.click(session2)

      expect(mockSetCurrentSession).toHaveBeenCalledWith(mockSessions[1])
      expect(mockLoadHistory).toHaveBeenCalledWith('session-2')
    })

    it('shows delete button for each session', () => {
      render(<PRDChatPanel />)

      const deleteButtons = screen.getAllByRole('button', { name: /delete session/i })
      expect(deleteButtons).toHaveLength(2)
    })

    it('calls deleteSession when delete button is clicked', async () => {
      const user = userEvent.setup()
      render(<PRDChatPanel />)

      const deleteButtons = screen.getAllByRole('button', { name: /delete session/i })
      await user.click(deleteButtons[0])

      expect(mockDeleteSession).toHaveBeenCalledWith('session-1')
    })

    it('shows empty state when no sessions exist', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        sessions: [],
        currentSession: null,
        messages: [],
      })

      render(<PRDChatPanel />)

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

      render(<PRDChatPanel />)

      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    })

    it('disables interactions when loading', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        loading: true,
      })

      render(<PRDChatPanel />)

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

      render(<PRDChatPanel />)

      expect(screen.getByText('Failed to send message')).toBeInTheDocument()
    })

    it('allows retry after error', () => {
      mockUsePRDChatStore.mockReturnValue({
        ...defaultStoreState,
        error: 'Failed to send message',
      })

      render(<PRDChatPanel />)

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
      render(<PRDChatPanel />)

      expect(screen.getByRole('combobox', { name: /agent/i })).toBeInTheDocument()
      expect(screen.getByRole('textbox')).toHaveAttribute('aria-label')
    })

    it('has proper heading hierarchy', () => {
      render(<PRDChatPanel />)

      const heading = screen.getByRole('heading', { name: /prd chat/i })
      expect(heading).toBeInTheDocument()
    })

    it('supports keyboard navigation', async () => {
      const user = userEvent.setup()
      render(<PRDChatPanel />)

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
      render(<PRDChatPanel />)

      expect(mockLoadSessions).toHaveBeenCalled()
    })

    it('calls loadHistory when currentSession exists', () => {
      render(<PRDChatPanel />)

      // loadHistory should have been called for the current session on mount
      expect(mockLoadHistory).toHaveBeenCalledWith('session-1')
    })
  })
})
