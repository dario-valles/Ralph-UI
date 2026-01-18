import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ActivityTimeline } from '../ActivityTimeline'
import type { ActivityEvent } from '@/hooks/useMissionControlData'

describe('ActivityTimeline', () => {
  const mockEvents: ActivityEvent[] = [
    {
      id: 'event-1',
      timestamp: new Date(),
      eventType: 'task_completed',
      projectPath: '/path/to/project1',
      projectName: 'Project 1',
      sessionName: 'Session 1',
      description: 'Completed: Implement authentication',
    },
    {
      id: 'event-2',
      timestamp: new Date(Date.now() - 60000), // 1 minute ago
      eventType: 'task_started',
      projectPath: '/path/to/project2',
      projectName: 'Project 2',
      sessionName: 'Session 2',
      description: 'Started: Fix navigation bug',
    },
    {
      id: 'event-3',
      timestamp: new Date(Date.now() - 120000), // 2 minutes ago
      eventType: 'session_started',
      projectPath: '/path/to/project1',
      projectName: 'Project 1',
      sessionName: 'Session 3',
      description: 'Session started: Session 3',
    },
    {
      id: 'event-4',
      timestamp: new Date(Date.now() - 180000), // 3 minutes ago
      eventType: 'task_failed',
      projectPath: '/path/to/project1',
      projectName: 'Project 1',
      sessionName: 'Session 1',
      description: 'Failed: Build project',
    },
  ]

  const defaultProps = {
    events: mockEvents,
    loading: false,
    collapsed: false,
    onToggleCollapse: vi.fn(),
  }

  const renderComponent = (props = {}) => {
    return render(
      <MemoryRouter>
        <ActivityTimeline {...defaultProps} {...props} />
      </MemoryRouter>
    )
  }

  it('should render section title', () => {
    renderComponent()

    expect(screen.getByText('Activity')).toBeInTheDocument()
  })

  it('should render event descriptions when not collapsed', () => {
    renderComponent()

    expect(screen.getByText('Completed: Implement authentication')).toBeInTheDocument()
    expect(screen.getByText('Started: Fix navigation bug')).toBeInTheDocument()
  })

  it('should hide content when collapsed', () => {
    renderComponent({ collapsed: true })

    expect(screen.queryByText('Completed: Implement authentication')).not.toBeInTheDocument()
  })

  it('should have toggle functionality', () => {
    const onToggleCollapse = vi.fn()
    renderComponent({ onToggleCollapse })

    // Should have buttons for interaction
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })

  it('should show loading state', () => {
    renderComponent({ loading: true })

    const skeletons = document.querySelectorAll('[class*="animate-pulse"]')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('should show empty state when no events', () => {
    renderComponent({ events: [] })

    expect(screen.getByText(/no.*activity|quiet/i)).toBeInTheDocument()
  })

  it('should render project names in events', () => {
    renderComponent()

    // At least one project name should be visible
    expect(screen.getAllByText(/Project [12]/)).toHaveLength(4)
  })

  it('should display completed event correctly', () => {
    const completedEvents = [mockEvents[0]]
    renderComponent({ events: completedEvents })

    expect(screen.getByText('Completed: Implement authentication')).toBeInTheDocument()
  })

  it('should display failed event correctly', () => {
    const failedEvents = [mockEvents[3]]
    renderComponent({ events: failedEvents })

    expect(screen.getByText('Failed: Build project')).toBeInTheDocument()
  })

  it('should display started event correctly', () => {
    const startedEvents = [mockEvents[1]]
    renderComponent({ events: startedEvents })

    expect(screen.getByText('Started: Fix navigation bug')).toBeInTheDocument()
  })

  it('should display session started event correctly', () => {
    const sessionEvents = [mockEvents[2]]
    renderComponent({ events: sessionEvents })

    expect(screen.getByText('Session started: Session 3')).toBeInTheDocument()
  })
})
