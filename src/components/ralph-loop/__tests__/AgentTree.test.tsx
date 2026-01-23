import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { AgentTree } from '../AgentTree'
import type { SubagentNode } from '@/hooks/useSubagentEvents'

// Mock the useSubagentEvents hook
const mockUseSubagentEvents = vi.fn()

vi.mock('@/hooks/useSubagentEvents', () => ({
  useSubagentEvents: () => mockUseSubagentEvents(),
}))

describe('AgentTree', () => {
  const mockSubagentNode: SubagentNode = {
    id: 'agent-1-sub-1',
    parentAgentId: 'agent-1',
    description: 'Search for files',
    status: 'running',
    startedAt: new Date().toISOString(),
    depth: 1,
    children: [],
  }

  const mockCompletedNode: SubagentNode = {
    id: 'agent-1-sub-2',
    parentAgentId: 'agent-1',
    description: 'Analyze code structure',
    status: 'completed',
    startedAt: new Date(Date.now() - 10000).toISOString(),
    completedAt: new Date().toISOString(),
    durationSecs: 10,
    depth: 1,
    children: [],
  }

  const mockFailedNode: SubagentNode = {
    id: 'agent-1-sub-3',
    parentAgentId: 'agent-1',
    description: 'Failed task',
    status: 'failed',
    startedAt: new Date(Date.now() - 5000).toISOString(),
    completedAt: new Date().toISOString(),
    durationSecs: 5,
    error: 'Something went wrong',
    depth: 1,
    children: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    // Mock scrollTo since jsdom doesn't support it
    Element.prototype.scrollTo = vi.fn()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders empty state when no subagents', () => {
    mockUseSubagentEvents.mockReturnValue({
      subagents: [],
      subagentMap: new Map(),
      activeCount: 0,
      totalCount: 0,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: false,
    })

    render(<AgentTree agentId="agent-1" />)

    expect(screen.getByText('No subagent activity')).toBeInTheDocument()
    expect(screen.getByText('Subagents will appear here as they spawn')).toBeInTheDocument()
  })

  it('renders subagent tree with running node', () => {
    const subagentMap = new Map<string, SubagentNode>()
    subagentMap.set(mockSubagentNode.id, mockSubagentNode)

    mockUseSubagentEvents.mockReturnValue({
      subagents: [mockSubagentNode],
      subagentMap,
      activeCount: 1,
      totalCount: 1,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: true,
    })

    render(<AgentTree agentId="agent-1" />)

    expect(screen.getByText('Search for files')).toBeInTheDocument()
    expect(screen.getByText('1 running')).toBeInTheDocument()
    expect(screen.getByText('1 total')).toBeInTheDocument()
  })

  it('renders completed node with duration', () => {
    const subagentMap = new Map<string, SubagentNode>()
    subagentMap.set(mockCompletedNode.id, mockCompletedNode)

    mockUseSubagentEvents.mockReturnValue({
      subagents: [mockCompletedNode],
      subagentMap,
      activeCount: 0,
      totalCount: 1,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: true,
    })

    render(<AgentTree agentId="agent-1" />)

    expect(screen.getByText('Analyze code structure')).toBeInTheDocument()
    expect(screen.getByText('10s')).toBeInTheDocument()
  })

  it('renders failed node with error badge', () => {
    const subagentMap = new Map<string, SubagentNode>()
    subagentMap.set(mockFailedNode.id, mockFailedNode)

    mockUseSubagentEvents.mockReturnValue({
      subagents: [mockFailedNode],
      subagentMap,
      activeCount: 0,
      totalCount: 1,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: true,
    })

    render(<AgentTree agentId="agent-1" />)

    expect(screen.getByText('Failed task')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })

  it('renders nested children and supports expand/collapse', () => {
    const childNode: SubagentNode = {
      id: 'agent-1-sub-1-sub-1',
      parentAgentId: 'agent-1',
      description: 'Child task',
      status: 'completed',
      startedAt: new Date().toISOString(),
      durationSecs: 5,
      depth: 2,
      children: [],
    }

    const parentNode: SubagentNode = {
      ...mockSubagentNode,
      children: [childNode],
    }

    const subagentMap = new Map<string, SubagentNode>()
    subagentMap.set(parentNode.id, parentNode)
    subagentMap.set(childNode.id, childNode)

    mockUseSubagentEvents.mockReturnValue({
      subagents: [parentNode],
      subagentMap,
      activeCount: 1,
      totalCount: 2,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: true,
    })

    render(<AgentTree agentId="agent-1" />)

    // Parent should be visible
    expect(screen.getByText('Search for files')).toBeInTheDocument()

    // Child should be visible initially (defaultExpanded)
    expect(screen.getByText('Child task')).toBeInTheDocument()

    // Click to collapse
    const parentButton = screen.getByText('Search for files').closest('button')!
    fireEvent.click(parentButton)

    // Child should be hidden after collapse
    expect(screen.queryByText('Child task')).not.toBeInTheDocument()

    // Click to expand again
    fireEvent.click(parentButton)
    expect(screen.getByText('Child task')).toBeInTheDocument()
  })

  it('displays multiple subagents sorted by start time', () => {
    const subagentMap = new Map<string, SubagentNode>()
    subagentMap.set(mockSubagentNode.id, mockSubagentNode)
    subagentMap.set(mockCompletedNode.id, mockCompletedNode)
    subagentMap.set(mockFailedNode.id, mockFailedNode)

    // Subagents should be sorted by startedAt (newest first)
    mockUseSubagentEvents.mockReturnValue({
      subagents: [mockSubagentNode, mockFailedNode, mockCompletedNode],
      subagentMap,
      activeCount: 1,
      totalCount: 3,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: true,
    })

    render(<AgentTree agentId="agent-1" />)

    expect(screen.getByText('3 total')).toBeInTheDocument()
    expect(screen.getByText('Search for files')).toBeInTheDocument()
    expect(screen.getByText('Analyze code structure')).toBeInTheDocument()
    expect(screen.getByText('Failed task')).toBeInTheDocument()
  })

  it('formats duration correctly for minutes', () => {
    const longDurationNode: SubagentNode = {
      ...mockCompletedNode,
      durationSecs: 125, // 2m 5s
    }

    const subagentMap = new Map<string, SubagentNode>()
    subagentMap.set(longDurationNode.id, longDurationNode)

    mockUseSubagentEvents.mockReturnValue({
      subagents: [longDurationNode],
      subagentMap,
      activeCount: 0,
      totalCount: 1,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: true,
    })

    render(<AgentTree agentId="agent-1" />)

    expect(screen.getByText('2m 5s')).toBeInTheDocument()
  })

  it('highlights new nodes with animation class', () => {
    const subagentMap = new Map<string, SubagentNode>()
    subagentMap.set(mockSubagentNode.id, mockSubagentNode)

    mockUseSubagentEvents.mockReturnValue({
      subagents: [mockSubagentNode],
      subagentMap,
      activeCount: 1,
      totalCount: 1,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: true,
    })

    render(<AgentTree agentId="agent-1" />)

    // New node should have data-new-node attribute
    const nodeButton = screen.getByText('Search for files').closest('button')!
    expect(nodeButton).toHaveAttribute('data-new-node', 'true')
    expect(nodeButton).toHaveClass('animate-highlight-fade')
  })

  it('removes highlight animation after duration', async () => {
    const subagentMap = new Map<string, SubagentNode>()
    subagentMap.set(mockSubagentNode.id, mockSubagentNode)

    mockUseSubagentEvents.mockReturnValue({
      subagents: [mockSubagentNode],
      subagentMap,
      activeCount: 1,
      totalCount: 1,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: true,
    })

    render(<AgentTree agentId="agent-1" />)

    // Initially should have highlight
    const nodeButton = screen.getByText('Search for files').closest('button')!
    expect(nodeButton).toHaveAttribute('data-new-node', 'true')

    // Advance timers past the highlight duration (2000ms)
    act(() => {
      vi.advanceTimersByTime(2100)
    })

    // After timeout, highlight should be removed
    expect(nodeButton).not.toHaveAttribute('data-new-node')
    expect(nodeButton).not.toHaveClass('animate-highlight-fade')
  })

  it('supports autoScroll prop', () => {
    const subagentMap = new Map<string, SubagentNode>()
    subagentMap.set(mockSubagentNode.id, mockSubagentNode)

    mockUseSubagentEvents.mockReturnValue({
      subagents: [mockSubagentNode],
      subagentMap,
      activeCount: 1,
      totalCount: 1,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: true,
    })

    // Should not throw when autoScroll is enabled (default)
    const { rerender } = render(<AgentTree agentId="agent-1" />)

    // Should not throw when autoScroll is disabled
    rerender(<AgentTree agentId="agent-1" autoScroll={false} />)

    expect(screen.getByText('Search for files')).toBeInTheDocument()
  })

  it('shows live status updates when node status changes', () => {
    const subagentMap = new Map<string, SubagentNode>()
    subagentMap.set(mockSubagentNode.id, mockSubagentNode)

    mockUseSubagentEvents.mockReturnValue({
      subagents: [mockSubagentNode],
      subagentMap,
      activeCount: 1,
      totalCount: 1,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: true,
    })

    const { rerender } = render(<AgentTree agentId="agent-1" />)

    // Initially running
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.getByText('1 running')).toBeInTheDocument()

    // Update to completed
    const completedNode: SubagentNode = {
      ...mockSubagentNode,
      status: 'completed',
      completedAt: new Date().toISOString(),
      durationSecs: 10,
    }
    const updatedMap = new Map<string, SubagentNode>()
    updatedMap.set(completedNode.id, completedNode)

    mockUseSubagentEvents.mockReturnValue({
      subagents: [completedNode],
      subagentMap: updatedMap,
      activeCount: 0,
      totalCount: 1,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: true,
    })

    rerender(<AgentTree agentId="agent-1" />)

    // Now showing completed
    expect(screen.queryByText('Running')).not.toBeInTheDocument()
    expect(screen.queryByText('1 running')).not.toBeInTheDocument()
    expect(screen.getByText('10s')).toBeInTheDocument()
  })

  it('handles status transition from running to failed', () => {
    const subagentMap = new Map<string, SubagentNode>()
    subagentMap.set(mockSubagentNode.id, mockSubagentNode)

    mockUseSubagentEvents.mockReturnValue({
      subagents: [mockSubagentNode],
      subagentMap,
      activeCount: 1,
      totalCount: 1,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: true,
    })

    const { rerender } = render(<AgentTree agentId="agent-1" />)

    // Initially running
    expect(screen.getByText('Running')).toBeInTheDocument()

    // Update to failed
    const failedNode: SubagentNode = {
      ...mockSubagentNode,
      status: 'failed',
      completedAt: new Date().toISOString(),
      durationSecs: 5,
      error: 'Task failed',
    }
    const updatedMap = new Map<string, SubagentNode>()
    updatedMap.set(failedNode.id, failedNode)

    mockUseSubagentEvents.mockReturnValue({
      subagents: [failedNode],
      subagentMap: updatedMap,
      activeCount: 0,
      totalCount: 1,
      activityCount: 0,
      resetActivityCount: vi.fn(),
      clear: vi.fn(),
      isListening: true,
    })

    rerender(<AgentTree agentId="agent-1" />)

    // Now showing failed
    expect(screen.queryByText('Running')).not.toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('5s')).toBeInTheDocument()
  })

  describe('Subagent Detail Panel', () => {
    const mockDetailNode: SubagentNode = {
      id: 'agent-1-sub-1',
      parentAgentId: 'agent-1',
      description: 'Search for files',
      status: 'completed',
      startedAt: '2026-01-22T10:00:00.000Z',
      completedAt: '2026-01-22T10:00:10.000Z',
      durationSecs: 10,
      depth: 1,
      subagentType: 'Explore',
      summary: 'Found 5 matching files',
      children: [],
    }

    const mockFailedDetailNode: SubagentNode = {
      id: 'agent-1-sub-2',
      parentAgentId: 'agent-1',
      description: 'Failed task',
      status: 'failed',
      startedAt: '2026-01-22T10:00:00.000Z',
      completedAt: '2026-01-22T10:00:05.000Z',
      durationSecs: 5,
      error: 'Connection timed out after 5000ms',
      depth: 1,
      children: [],
    }

    it('opens detail panel when clicking a node', () => {
      const subagentMap = new Map<string, SubagentNode>()
      subagentMap.set(mockDetailNode.id, mockDetailNode)

      mockUseSubagentEvents.mockReturnValue({
        subagents: [mockDetailNode],
        subagentMap,
        activeCount: 0,
        totalCount: 1,
        activityCount: 0,
        resetActivityCount: vi.fn(),
        clear: vi.fn(),
        isListening: true,
      })

      render(<AgentTree agentId="agent-1" />)

      // Detail panel should not be visible initially
      expect(screen.queryByTestId('subagent-detail-panel')).not.toBeInTheDocument()

      // Click the node to open detail panel
      const nodeButton = screen.getByText('Search for files').closest('button')!
      fireEvent.click(nodeButton)

      // Detail panel should now be visible
      expect(screen.getByTestId('subagent-detail-panel')).toBeInTheDocument()
      expect(screen.getByText('Agent Details')).toBeInTheDocument()
    })

    it('shows full agent details in panel', () => {
      const subagentMap = new Map<string, SubagentNode>()
      subagentMap.set(mockDetailNode.id, mockDetailNode)

      mockUseSubagentEvents.mockReturnValue({
        subagents: [mockDetailNode],
        subagentMap,
        activeCount: 0,
        totalCount: 1,
        activityCount: 0,
        resetActivityCount: vi.fn(),
        clear: vi.fn(),
        isListening: true,
      })

      render(<AgentTree agentId="agent-1" />)

      // Click to open detail panel
      const nodeButton = screen.getByText('Search for files').closest('button')!
      fireEvent.click(nodeButton)

      // Check all detail fields are displayed
      expect(screen.getByText('Task')).toBeInTheDocument()
      expect(screen.getByText('Agent Type')).toBeInTheDocument()
      expect(screen.getByText('Explore')).toBeInTheDocument()
      expect(screen.getByText('Start Time')).toBeInTheDocument()
      expect(screen.getByText('End Time')).toBeInTheDocument()
      expect(screen.getByText('Summary')).toBeInTheDocument()
      expect(screen.getByText('Found 5 matching files')).toBeInTheDocument()
    })

    it('shows error message for failed agents', () => {
      const subagentMap = new Map<string, SubagentNode>()
      subagentMap.set(mockFailedDetailNode.id, mockFailedDetailNode)

      mockUseSubagentEvents.mockReturnValue({
        subagents: [mockFailedDetailNode],
        subagentMap,
        activeCount: 0,
        totalCount: 1,
        activityCount: 0,
        resetActivityCount: vi.fn(),
        clear: vi.fn(),
        isListening: true,
      })

      render(<AgentTree agentId="agent-1" />)

      // Click to open detail panel
      const nodeButton = screen.getByText('Failed task').closest('button')!
      fireEvent.click(nodeButton)

      // Check error message is displayed
      expect(screen.getByText('Error Message')).toBeInTheDocument()
      expect(screen.getByText('Connection timed out after 5000ms')).toBeInTheDocument()
    })

    it('closes detail panel when clicking the same node again', () => {
      const subagentMap = new Map<string, SubagentNode>()
      subagentMap.set(mockDetailNode.id, mockDetailNode)

      mockUseSubagentEvents.mockReturnValue({
        subagents: [mockDetailNode],
        subagentMap,
        activeCount: 0,
        totalCount: 1,
        activityCount: 0,
        resetActivityCount: vi.fn(),
        clear: vi.fn(),
        isListening: true,
      })

      render(<AgentTree agentId="agent-1" />)

      // Click to open detail panel
      const nodeButton = screen.getByText('Search for files').closest('button')!
      fireEvent.click(nodeButton)

      // Detail panel should be visible
      expect(screen.getByTestId('subagent-detail-panel')).toBeInTheDocument()

      // Click the same node again to close
      fireEvent.click(nodeButton)

      // Detail panel should be hidden
      expect(screen.queryByTestId('subagent-detail-panel')).not.toBeInTheDocument()
    })

    it('has a copy button that copies agent details to clipboard', async () => {
      const subagentMap = new Map<string, SubagentNode>()
      subagentMap.set(mockDetailNode.id, mockDetailNode)

      mockUseSubagentEvents.mockReturnValue({
        subagents: [mockDetailNode],
        subagentMap,
        activeCount: 0,
        totalCount: 1,
        activityCount: 0,
        resetActivityCount: vi.fn(),
        clear: vi.fn(),
        isListening: true,
      })

      // Mock clipboard API
      const writeTextMock = vi.fn().mockResolvedValue(undefined)
      Object.assign(navigator, {
        clipboard: {
          writeText: writeTextMock,
        },
      })

      render(<AgentTree agentId="agent-1" />)

      // Click to open detail panel
      const nodeButton = screen.getByText('Search for files').closest('button')!
      fireEvent.click(nodeButton)

      // Find and click the copy button
      const copyButton = screen.getByTestId('copy-details-button')
      fireEvent.click(copyButton)

      // Verify clipboard was called with agent details
      expect(writeTextMock).toHaveBeenCalledTimes(1)
      const copiedText = writeTextMock.mock.calls[0][0]
      expect(copiedText).toContain('Agent ID: agent-1-sub-1')
      expect(copiedText).toContain('Description: Search for files')
      expect(copiedText).toContain('Status: completed')
      expect(copiedText).toContain('Type: Explore')
      expect(copiedText).toContain('Summary: Found 5 matching files')
    })

    it('switches detail panel when clicking a different node', () => {
      const node2: SubagentNode = {
        id: 'agent-1-sub-2',
        parentAgentId: 'agent-1',
        description: 'Another task',
        status: 'completed',
        startedAt: '2026-01-22T10:00:00.000Z',
        durationSecs: 15,
        depth: 1,
        children: [],
      }

      const subagentMap = new Map<string, SubagentNode>()
      subagentMap.set(mockDetailNode.id, mockDetailNode)
      subagentMap.set(node2.id, node2)

      mockUseSubagentEvents.mockReturnValue({
        subagents: [mockDetailNode, node2],
        subagentMap,
        activeCount: 0,
        totalCount: 2,
        activityCount: 0,
        resetActivityCount: vi.fn(),
        clear: vi.fn(),
        isListening: true,
      })

      render(<AgentTree agentId="agent-1" />)

      // Click the first node
      const node1Button = screen.getByText('Search for files').closest('button')!
      fireEvent.click(node1Button)

      // First node's detail panel should be visible
      expect(screen.getByTestId('subagent-detail-panel')).toBeInTheDocument()
      expect(screen.getByText('Explore')).toBeInTheDocument()

      // Click the second node
      const node2Button = screen.getByText('Another task').closest('button')!
      fireEvent.click(node2Button)

      // Second node's detail panel should be visible (first should be closed)
      const panels = screen.getAllByTestId('subagent-detail-panel')
      expect(panels).toHaveLength(1)
      expect(screen.queryByText('Explore')).not.toBeInTheDocument()
    })
  })
})
