import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TaskDetail } from '../TaskDetail'
import { useTaskStore } from '@/stores/taskStore'
import type { Task } from '@/types'

// Mock the store
vi.mock('@/stores/taskStore', () => ({
  useTaskStore: vi.fn(),
}))

const mockTask: Task = {
  id: 'task-1',
  title: 'Test Task',
  description: 'Test description',
  status: 'pending',
  priority: 1,
  dependencies: ['task-0'],
  assignedAgent: 'agent-1',
  estimatedTokens: 1000,
  actualTokens: undefined,
  startedAt: undefined,
  completedAt: undefined,
  branch: 'feature/test',
  worktreePath: undefined,
  error: undefined,
}

describe('TaskDetail', () => {
  const mockUpdateTask = vi.fn()
  const mockUpdateTaskStatus = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useTaskStore).mockReturnValue({
      tasks: [mockTask],
      updateTask: mockUpdateTask,
      updateTaskStatus: mockUpdateTaskStatus,
      loading: false,
      error: null,
    } as ReturnType<typeof useTaskStore>)
  })

  it('renders task details', () => {
    render(<TaskDetail open={true} onOpenChange={vi.fn()} taskId="task-1" />)

    expect(screen.getByText('Test Task')).toBeInTheDocument()
    expect(screen.getByText('Test description')).toBeInTheDocument()
    expect(screen.getByText('Priority 1')).toBeInTheDocument()
  })

  it('does not render when closed', () => {
    render(<TaskDetail open={false} onOpenChange={vi.fn()} taskId="task-1" />)

    expect(screen.queryByText('Test Task')).not.toBeInTheDocument()
  })

  it('does not render when taskId is null', () => {
    render(<TaskDetail open={true} onOpenChange={vi.fn()} taskId={null} />)

    expect(screen.queryByText('Test Task')).not.toBeInTheDocument()
  })

  it('enters edit mode when Edit button is clicked', async () => {
    render(<TaskDetail open={true} onOpenChange={vi.fn()} taskId="task-1" />)

    const editButton = screen.getByText('Edit Task')
    fireEvent.click(editButton)

    await waitFor(() => {
      expect(screen.getByText('Save Changes')).toBeInTheDocument()
    })
  })

  it('updates task title in edit mode', async () => {
    render(<TaskDetail open={true} onOpenChange={vi.fn()} taskId="task-1" />)

    // Enter edit mode
    const editButton = screen.getByText('Edit Task')
    fireEvent.click(editButton)

    // Find title input and change it
    const titleInput = screen.getByDisplayValue('Test Task')
    fireEvent.change(titleInput, { target: { value: 'Updated Task' } })

    // Save changes
    const saveButton = screen.getByText('Save Changes')
    fireEvent.click(saveButton)

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Updated Task',
        })
      )
    })
  })

  it('updates task description in edit mode', async () => {
    render(<TaskDetail open={true} onOpenChange={vi.fn()} taskId="task-1" />)

    // Enter edit mode
    fireEvent.click(screen.getByText('Edit Task'))

    // Find description textarea and change it
    const descriptionInput = screen.getByDisplayValue('Test description')
    fireEvent.change(descriptionInput, { target: { value: 'Updated description' } })

    // Save changes
    fireEvent.click(screen.getByText('Save Changes'))

    await waitFor(() => {
      expect(mockUpdateTask).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Updated description',
        })
      )
    })
  })

  it('cancels edit mode', async () => {
    render(<TaskDetail open={true} onOpenChange={vi.fn()} taskId="task-1" />)

    // Enter edit mode
    fireEvent.click(screen.getByText('Edit Task'))

    // Change title
    const titleInput = screen.getByDisplayValue('Test Task')
    fireEvent.change(titleInput, { target: { value: 'Updated Task' } })

    // Cancel
    const cancelButton = screen.getByRole('button', { name: /cancel/i })
    fireEvent.click(cancelButton)

    await waitFor(() => {
      expect(screen.getByText('Edit Task')).toBeInTheDocument()
      expect(mockUpdateTask).not.toHaveBeenCalled()
    })
  })

  it('displays dependencies', () => {
    render(<TaskDetail open={true} onOpenChange={vi.fn()} taskId="task-1" />)

    expect(screen.getByText('task-0')).toBeInTheDocument()
  })

  it('displays assigned agent', () => {
    render(<TaskDetail open={true} onOpenChange={vi.fn()} taskId="task-1" />)

    expect(screen.getByText('agent-1')).toBeInTheDocument()
  })

  it('displays branch information', () => {
    render(<TaskDetail open={true} onOpenChange={vi.fn()} taskId="task-1" />)

    expect(screen.getByText('feature/test')).toBeInTheDocument()
  })

  it('displays error message when task has error', () => {
    const taskWithError = { ...mockTask, error: 'Test error message' }
    vi.mocked(useTaskStore).mockReturnValue({
      tasks: [taskWithError],
      updateTask: mockUpdateTask,
      updateTaskStatus: mockUpdateTaskStatus,
      loading: false,
      error: null,
    } as ReturnType<typeof useTaskStore>)

    render(<TaskDetail open={true} onOpenChange={vi.fn()} taskId="task-1" />)

    expect(screen.getByText('Test error message')).toBeInTheDocument()
  })

  it('closes dialog when Close button is clicked', () => {
    const mockOnOpenChange = vi.fn()
    render(<TaskDetail open={true} onOpenChange={mockOnOpenChange} taskId="task-1" />)

    const closeButton = screen.getByText('Close')
    fireEvent.click(closeButton)

    expect(mockOnOpenChange).toHaveBeenCalledWith(false)
  })
})
