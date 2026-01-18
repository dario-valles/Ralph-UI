import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

// Mock all the hooks BEFORE importing the component
vi.mock('@/hooks/useMissionControlData', () => ({
  useGlobalStats: () => ({
    activeAgentsCount: 2,
    tasksInProgress: 3,
    tasksCompletedToday: 5,
    totalTasksToday: 8,
    totalCostToday: 0.15,
    activeProjectsCount: 2,
    totalProjects: 3,
    loading: false,
    error: null,
  }),
  useProjectStatuses: () => ({
    projectStatuses: [
      {
        project: { id: 'project-1', name: 'Project 1', path: '/path/to/project1' },
        activeSessions: [],
        runningAgentsCount: 1,
        totalTasks: 5,
        completedTasks: 3,
        inProgressTasks: 2,
        health: 'healthy',
        lastActivity: new Date(),
        totalCost: 0.05,
      },
    ],
    loading: false,
    error: null,
  }),
  useAllActiveAgents: () => ({
    activeAgents: [
      {
        id: 'agent-1',
        sessionId: 'session-1',
        taskId: 'task-1',
        status: 'thinking',
        projectPath: '/path/to/project1',
        projectName: 'Project 1',
        sessionName: 'Session 1',
        taskTitle: 'Task 1',
        duration: 60000,
        tokens: 100,
        cost: 0.05,
        logs: [],
        subagents: [],
      },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
  useActivityFeed: () => ({
    events: [
      {
        id: 'event-1',
        timestamp: new Date(),
        eventType: 'task_completed',
        projectPath: '/path/to/project1',
        projectName: 'Project 1',
        sessionName: 'Session 1',
        description: 'Completed: Test Task',
      },
    ],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
  useTauriEventListeners: vi.fn(),
}))

vi.mock('@/stores/projectStore', () => ({
  useProjectStore: (selector: ((state: { loadProjects: ReturnType<typeof vi.fn> }) => unknown) | undefined) => {
    const state = { loadProjects: vi.fn() }
    return typeof selector === 'function' ? selector(state) : state
  },
}))

vi.mock('@/stores/sessionStore', () => ({
  useSessionStore: (selector: ((state: { fetchSessions: ReturnType<typeof vi.fn> }) => unknown) | undefined) => {
    const state = { fetchSessions: vi.fn() }
    return typeof selector === 'function' ? selector(state) : state
  },
}))

// Mock child components to simplify testing
vi.mock('../GlobalStatsBar', () => ({
  GlobalStatsBar: ({ stats, loading }: { stats: { activeAgentsCount: number }; loading: boolean }) => (
    <div data-testid="global-stats-bar">
      {loading ? 'Loading...' : `Active: ${stats.activeAgentsCount}`}
    </div>
  ),
}))

vi.mock('../ProjectsOverview', () => ({
  ProjectsOverview: ({ projectStatuses, collapsed, onToggleCollapse }: { projectStatuses: unknown[]; collapsed: boolean; onToggleCollapse: () => void }) => (
    <div data-testid="projects-overview">
      <button onClick={onToggleCollapse}>Toggle Projects</button>
      {collapsed ? 'Collapsed' : `Projects: ${projectStatuses.length}`}
    </div>
  ),
}))

vi.mock('../ActiveAgentsGrid', () => ({
  ActiveAgentsGrid: ({ agents, collapsed, onToggleCollapse }: { agents: unknown[]; collapsed: boolean; onToggleCollapse: () => void }) => (
    <div data-testid="active-agents-grid">
      <button onClick={onToggleCollapse}>Toggle Agents</button>
      {collapsed ? 'Collapsed' : `Agents: ${agents.length}`}
    </div>
  ),
}))

vi.mock('../ActivityTimeline', () => ({
  ActivityTimeline: ({ events, collapsed, onToggleCollapse }: { events: unknown[]; collapsed: boolean; onToggleCollapse: () => void }) => (
    <div data-testid="activity-timeline">
      <button onClick={onToggleCollapse}>Toggle Activity</button>
      {collapsed ? 'Collapsed' : `Events: ${events.length}`}
    </div>
  ),
}))

vi.mock('../QuickActionsBar', () => ({
  QuickActionsBar: ({ onRefreshAll, isRefreshing }: { onRefreshAll: () => void; isRefreshing: boolean }) => (
    <div data-testid="quick-actions-bar">
      <button onClick={onRefreshAll} disabled={isRefreshing}>
        {isRefreshing ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  ),
}))

// Import the component AFTER mocks are set up
import { MissionControlPage } from '../MissionControlPage'

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key]
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {}
  }),
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

describe('MissionControlPage', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorageMock.store = {}
    localStorageMock.getItem.mockClear()
    localStorageMock.setItem.mockClear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const renderComponent = () => {
    return render(
      <MemoryRouter>
        <MissionControlPage />
      </MemoryRouter>
    )
  }

  it('should render the page title', () => {
    renderComponent()

    expect(screen.getByText('Mission Control')).toBeInTheDocument()
    expect(screen.getByText('Overview of all projects and agent activity')).toBeInTheDocument()
  })

  it('should render all main sections', () => {
    renderComponent()

    expect(screen.getByTestId('global-stats-bar')).toBeInTheDocument()
    expect(screen.getByTestId('projects-overview')).toBeInTheDocument()
    expect(screen.getByTestId('active-agents-grid')).toBeInTheDocument()
    expect(screen.getByTestId('activity-timeline')).toBeInTheDocument()
    expect(screen.getByTestId('quick-actions-bar')).toBeInTheDocument()
  })

  it('should render keyboard shortcuts hint', () => {
    renderComponent()

    expect(screen.getByText('Projects')).toBeInTheDocument()
    expect(screen.getByText('Agents')).toBeInTheDocument()
    expect(screen.getByText('Activity')).toBeInTheDocument()
    // "Refresh" appears in both the QuickActionsBar and keyboard hints
    expect(screen.getAllByText('Refresh').length).toBeGreaterThanOrEqual(1)
    // Check the Cmd+R shortcut
    expect(screen.getByText('Cmd+R')).toBeInTheDocument()
  })

  it('should display stats from hooks', () => {
    renderComponent()

    expect(screen.getByTestId('global-stats-bar')).toHaveTextContent('Active: 2')
    expect(screen.getByTestId('projects-overview')).toHaveTextContent('Projects: 1')
    expect(screen.getByTestId('active-agents-grid')).toHaveTextContent('Agents: 1')
    expect(screen.getByTestId('activity-timeline')).toHaveTextContent('Events: 1')
  })

  it('should toggle projects section on click', async () => {
    renderComponent()

    const toggleButton = screen.getByText('Toggle Projects')
    fireEvent.click(toggleButton)

    // The component should re-render with collapsed state
    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mission-control-projects-collapsed', 'true')
    })
  })

  it('should toggle agents section on click', async () => {
    renderComponent()

    const toggleButton = screen.getByText('Toggle Agents')
    fireEvent.click(toggleButton)

    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mission-control-agents-collapsed', 'true')
    })
  })

  it('should toggle activity section on click', async () => {
    renderComponent()

    const toggleButton = screen.getByText('Toggle Activity')
    fireEvent.click(toggleButton)

    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mission-control-activity-collapsed', 'true')
    })
  })

  it('should handle keyboard shortcut 1 for projects toggle', async () => {
    renderComponent()

    fireEvent.keyDown(window, { key: '1' })

    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mission-control-projects-collapsed', 'true')
    })
  })

  it('should handle keyboard shortcut 2 for agents toggle', async () => {
    renderComponent()

    fireEvent.keyDown(window, { key: '2' })

    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mission-control-agents-collapsed', 'true')
    })
  })

  it('should handle keyboard shortcut 3 for activity toggle', async () => {
    renderComponent()

    fireEvent.keyDown(window, { key: '3' })

    await waitFor(() => {
      expect(localStorageMock.setItem).toHaveBeenCalledWith('mission-control-activity-collapsed', 'true')
    })
  })

  it('should not trigger keyboard shortcuts when input is focused', async () => {
    // Create a component with an input
    render(
      <MemoryRouter>
        <div>
          <input data-testid="test-input" />
          <MissionControlPage />
        </div>
      </MemoryRouter>
    )

    const input = screen.getByTestId('test-input')
    input.focus()

    localStorageMock.setItem.mockClear()
    fireEvent.keyDown(input, { key: '1' })

    // Should not trigger toggle - no calls to setItem for projects-collapsed
    expect(localStorageMock.setItem).not.toHaveBeenCalledWith('mission-control-projects-collapsed', expect.any(String))
  })

  it('should handle Cmd+R refresh shortcut', async () => {
    renderComponent()

    const event = new KeyboardEvent('keydown', {
      key: 'r',
      metaKey: true,
      bubbles: true,
    })

    // Spy on preventDefault
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault')

    window.dispatchEvent(event)

    // The refresh should have been triggered
    await waitFor(() => {
      expect(preventDefaultSpy).toHaveBeenCalled()
    })
  })

  it('should persist collapse state in localStorage', () => {
    // Set initial collapsed state
    localStorageMock.store['mission-control-projects-collapsed'] = 'true'

    renderComponent()

    // The projects section should be collapsed
    expect(screen.getByTestId('projects-overview')).toHaveTextContent('Collapsed')
  })

  it('should restore collapse state from localStorage', () => {
    localStorageMock.store['mission-control-projects-collapsed'] = 'true'
    localStorageMock.store['mission-control-agents-collapsed'] = 'true'
    localStorageMock.store['mission-control-activity-collapsed'] = 'true'

    renderComponent()

    expect(screen.getByTestId('projects-overview')).toHaveTextContent('Collapsed')
    expect(screen.getByTestId('active-agents-grid')).toHaveTextContent('Collapsed')
    expect(screen.getByTestId('activity-timeline')).toHaveTextContent('Collapsed')
  })
})
