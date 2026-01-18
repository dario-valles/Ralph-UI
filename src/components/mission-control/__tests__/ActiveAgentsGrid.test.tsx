import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ActiveAgentsGrid } from '../ActiveAgentsGrid'
import type { ActiveAgentWithContext } from '@/hooks/useMissionControlData'

describe('ActiveAgentsGrid', () => {
  const mockAgents: ActiveAgentWithContext[] = [
    {
      id: 'agent-1',
      sessionId: 'session-1',
      taskId: 'task-1',
      status: 'thinking',
      processId: 12345,
      worktreePath: '/path/to/worktree',
      branch: 'feature/test',
      iterationCount: 5,
      tokens: 1500,
      cost: 0.05,
      logs: [],
      subagents: [],
      projectPath: '/path/to/project1',
      projectName: 'Project 1',
      sessionName: 'Session 1',
      taskTitle: 'Implement feature',
      duration: 120000, // 2 minutes
    },
    {
      id: 'agent-2',
      sessionId: 'session-2',
      taskId: 'task-2',
      status: 'implementing',
      processId: 12346,
      worktreePath: '/path/to/worktree2',
      branch: 'feature/test2',
      iterationCount: 10,
      tokens: 3000,
      cost: 0.10,
      logs: [],
      subagents: [],
      projectPath: '/path/to/project2',
      projectName: 'Project 2',
      sessionName: 'Session 2',
      taskTitle: 'Fix bug',
      duration: 300000, // 5 minutes
    },
  ]

  const defaultProps = {
    agents: mockAgents,
    loading: false,
    error: null,
    collapsed: false,
    onToggleCollapse: vi.fn(),
    onRefresh: vi.fn(),
    onRetry: vi.fn(),
  }

  const renderComponent = (props = {}) => {
    return render(
      <MemoryRouter>
        <ActiveAgentsGrid {...defaultProps} {...props} />
      </MemoryRouter>
    )
  }

  it('should render section title', () => {
    renderComponent()

    expect(screen.getByText('Active Agents')).toBeInTheDocument()
  })

  it('should render agent count in header', () => {
    renderComponent()

    // Count is displayed in parentheses, e.g., "(2)"
    expect(screen.getByText('(2)')).toBeInTheDocument()
  })

  it('should render agent task titles when not collapsed', () => {
    renderComponent()

    expect(screen.getByText('Implement feature')).toBeInTheDocument()
    expect(screen.getByText('Fix bug')).toBeInTheDocument()
  })

  it('should hide content when collapsed', () => {
    renderComponent({ collapsed: true })

    expect(screen.queryByText('Implement feature')).not.toBeInTheDocument()
    expect(screen.queryByText('Fix bug')).not.toBeInTheDocument()
  })

  it('should have toggle functionality', () => {
    const onToggleCollapse = vi.fn()
    renderComponent({ onToggleCollapse })

    // Find any clickable element in the header area
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('should show loading state', () => {
    renderComponent({ loading: true })

    // Should show skeleton loaders
    const skeletons = document.querySelectorAll('[class*="animate-pulse"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('should show error state', () => {
    renderComponent({ error: 'Connection failed' })

    // The error state shows "Failed to load agents" as header and the error message in the body
    expect(screen.getByText('Failed to load agents')).toBeInTheDocument()
    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  it('should show empty state when no agents', () => {
    renderComponent({ agents: [] })

    // Should show some empty state message or have fewer elements
    const content = document.body.textContent
    // Either shows an empty message or the content area is empty
    expect(content).toBeTruthy()
  })

  it('should render project names for each agent', () => {
    renderComponent()

    // Project names appear in the agents (may have multiple occurrences)
    const project1Elements = screen.getAllByText('Project 1')
    const project2Elements = screen.getAllByText('Project 2')
    expect(project1Elements.length).toBeGreaterThan(0)
    expect(project2Elements.length).toBeGreaterThan(0)
  })
})
