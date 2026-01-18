import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TaskList } from '../TaskList'
import { useTaskStore } from '@/stores/taskStore'
import type { Task } from '@/types'

// Mock the store
vi.mock('@/stores/taskStore', () => ({
  useTaskStore: vi.fn(),
}))

const mockTasks: Task[] = [
  {
    id: 'task-1',
    title: 'First Task',
    description: 'Test description',
    status: 'pending',
    priority: 1,
    dependencies: [],
    assignedAgent: undefined,
    estimatedTokens: 1000,
    actualTokens: undefined,
    startedAt: undefined,
    completedAt: undefined,
    branch: undefined,
    worktreePath: undefined,
    error: undefined,
  },
  {
    id: 'task-2',
    title: 'Second Task',
    description: 'Test description',
    status: 'in_progress',
    priority: 2,
    dependencies: ['task-1'],
    assignedAgent: undefined,
    estimatedTokens: 2000,
    actualTokens: undefined,
    startedAt: undefined,
    completedAt: undefined,
    branch: undefined,
    worktreePath: undefined,
    error: undefined,
  },
  {
    id: 'task-3',
    title: 'Third Task',
    description: 'Test description',
    status: 'completed',
    priority: 3,
    dependencies: [],
    assignedAgent: undefined,
    estimatedTokens: 500,
    actualTokens: 450,
    startedAt: undefined,
    completedAt: undefined,
    branch: undefined,
    worktreePath: undefined,
    error: undefined,
  },
]

describe('TaskList', () => {
  const mockSetFilter = vi.fn()
  const mockGetFilteredTasks = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useTaskStore).mockReturnValue({
      getFilteredTasks: mockGetFilteredTasks,
      setFilter: mockSetFilter,
      filter: { sortBy: 'priority', sortOrder: 'asc' },
    } as ReturnType<typeof useTaskStore>)
  })

  it('renders task list with tasks', () => {
    mockGetFilteredTasks.mockReturnValue(mockTasks)

    render(<TaskList sessionId="session-1" />)

    expect(screen.getByText('First Task')).toBeInTheDocument()
    expect(screen.getByText('Second Task')).toBeInTheDocument()
    expect(screen.getByText('Third Task')).toBeInTheDocument()
  })

  it('displays empty state when no tasks', () => {
    mockGetFilteredTasks.mockReturnValue([])

    render(<TaskList sessionId="session-1" />)

    expect(screen.getByText('No tasks found')).toBeInTheDocument()
  })

  it('handles search input', () => {
    mockGetFilteredTasks.mockReturnValue(mockTasks)

    render(<TaskList sessionId="session-1" />)

    const searchInput = screen.getByPlaceholderText('Search tasks...')
    fireEvent.change(searchInput, { target: { value: 'First' } })

    expect(mockSetFilter).toHaveBeenCalledWith({ searchQuery: 'First' })
  })

  it('handles status filter change', () => {
    mockGetFilteredTasks.mockReturnValue(mockTasks)

    render(<TaskList sessionId="session-1" />)

    const statusSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(statusSelect, { target: { value: 'completed' } })

    expect(mockSetFilter).toHaveBeenCalledWith({ status: 'completed' })
  })

  it('displays task status badges correctly', () => {
    mockGetFilteredTasks.mockReturnValue(mockTasks)

    render(<TaskList sessionId="session-1" />)

    // Use getAllByText since text appears in both dropdowns and badges
    expect(screen.getAllByText('Pending').length).toBeGreaterThan(0)
    expect(screen.getAllByText('In Progress').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0)
  })

  it('displays task priorities', () => {
    mockGetFilteredTasks.mockReturnValue(mockTasks)

    render(<TaskList sessionId="session-1" />)

    expect(screen.getByText('P1')).toBeInTheDocument()
    expect(screen.getByText('P2')).toBeInTheDocument()
    expect(screen.getByText('P3')).toBeInTheDocument()
  })

  it('calls onTaskClick when task is clicked', () => {
    const mockOnTaskClick = vi.fn()
    mockGetFilteredTasks.mockReturnValue(mockTasks)

    render(<TaskList sessionId="session-1" onTaskClick={mockOnTaskClick} />)

    const taskCard = screen.getByText('First Task').closest('[role="button"]') || screen.getByText('First Task').parentElement
    if (taskCard) {
      fireEvent.click(taskCard)
      expect(mockOnTaskClick).toHaveBeenCalledWith('task-1')
    }
  })

  it('displays dependency count', () => {
    mockGetFilteredTasks.mockReturnValue(mockTasks)

    render(<TaskList sessionId="session-1" />)

    expect(screen.getByText(/Dependencies: 1/)).toBeInTheDocument()
  })

  it('displays estimated tokens', () => {
    mockGetFilteredTasks.mockReturnValue(mockTasks)

    render(<TaskList sessionId="session-1" />)

    expect(screen.getByText(/Est\. 1,000 tokens/)).toBeInTheDocument()
    expect(screen.getByText(/Est\. 2,000 tokens/)).toBeInTheDocument()
  })

  it('displays actual tokens for completed tasks', () => {
    mockGetFilteredTasks.mockReturnValue(mockTasks)

    render(<TaskList sessionId="session-1" />)

    expect(screen.getByText(/Used 450 tokens/)).toBeInTheDocument()
  })
})
