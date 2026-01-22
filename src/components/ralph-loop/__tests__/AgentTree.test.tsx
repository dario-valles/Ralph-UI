import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
})
