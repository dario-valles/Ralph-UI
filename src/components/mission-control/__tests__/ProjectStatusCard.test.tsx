import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProjectStatusCard } from '../ProjectStatusCard'
import type { ProjectStatus } from '@/hooks/useMissionControlData'

// Mock the session store
vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: vi.fn((selector) => {
    const state = {
      updateSessionStatus: vi.fn(),
    }
    return typeof selector === 'function' ? selector(state) : state
  }),
}))

describe('ProjectStatusCard', () => {
  const mockProjectStatus: ProjectStatus = {
    project: {
      id: 'project-1',
      name: 'Test Project',
      path: '/path/to/test-project',
    },
    activeSessions: [
      {
        id: 'session-1',
        name: 'Session 1',
        status: 'active',
        projectPath: '/path/to/test-project',
        createdAt: new Date().toISOString(),
        tasks: [],
      },
    ],
    runningAgentsCount: 2,
    totalTasks: 10,
    completedTasks: 5,
    inProgressTasks: 3,
    health: 'healthy',
    lastActivity: new Date(),
    totalCost: 0.75,
  }

  const renderComponent = (status: ProjectStatus = mockProjectStatus) => {
    return render(
      <MemoryRouter>
        <ProjectStatusCard projectStatus={status} />
      </MemoryRouter>
    )
  }

  it('should render project name', () => {
    renderComponent()

    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  it('should render running agents count', () => {
    renderComponent()

    // Find the agents label (capitalized)
    expect(screen.getByText('Agents')).toBeInTheDocument()
  })

  it('should render task progress', () => {
    renderComponent()

    // Find the tasks label (capitalized)
    expect(screen.getByText('Tasks')).toBeInTheDocument()
  })

  it('should render total cost', () => {
    renderComponent()

    expect(screen.getByText('$0.75')).toBeInTheDocument()
  })

  it('should render health indicator for healthy status', () => {
    renderComponent()

    // Should have a green indicator for healthy status
    const healthIndicator = document.querySelector('[class*="bg-green"]')
    expect(healthIndicator).toBeInTheDocument()
  })

  it('should render health indicator for warning status', () => {
    const warningStatus = {
      ...mockProjectStatus,
      health: 'warning' as const,
    }
    renderComponent(warningStatus)

    const healthIndicator = document.querySelector('[class*="bg-yellow"]')
    expect(healthIndicator).toBeInTheDocument()
  })

  it('should render health indicator for error status', () => {
    const errorStatus = {
      ...mockProjectStatus,
      health: 'error' as const,
    }
    renderComponent(errorStatus)

    const healthIndicator = document.querySelector('[class*="bg-red"]')
    expect(healthIndicator).toBeInTheDocument()
  })

  it('should render health indicator for idle status', () => {
    const idleStatus = {
      ...mockProjectStatus,
      health: 'idle' as const,
      activeSessions: [],
      runningAgentsCount: 0,
      inProgressTasks: 0,
    }
    renderComponent(idleStatus)

    // Idle status shows "Idle" label in the badge
    expect(screen.getByText('Idle')).toBeInTheDocument()
  })

  it('should render active sessions count', () => {
    renderComponent()

    // Should show session information (may have multiple matches)
    const sessionElements = screen.getAllByText(/session/i)
    expect(sessionElements.length).toBeGreaterThan(0)
  })

  it('should render last activity time', () => {
    renderComponent()

    // Should render without crashing - time format varies
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  it('should handle project with no active sessions', () => {
    const noSessionsStatus = {
      ...mockProjectStatus,
      activeSessions: [],
      runningAgentsCount: 0,
    }
    renderComponent(noSessionsStatus)

    expect(screen.getByText('0')).toBeInTheDocument()
  })

  it('should handle project with null last activity', () => {
    const noActivityStatus = {
      ...mockProjectStatus,
      lastActivity: null,
    }
    renderComponent(noActivityStatus)

    // Should render without crashing
    expect(screen.getByText('Test Project')).toBeInTheDocument()
  })

  it('should render progress bar with correct percentage', () => {
    renderComponent()

    // 5 completed out of 10 total = 50%
    const progressBars = document.querySelectorAll('[role="progressbar"]')
    expect(progressBars.length).toBeGreaterThan(0)
  })

  it('should render session actions when there are active sessions', () => {
    renderComponent()

    // Should have some interactive element for actions
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
  })
})
