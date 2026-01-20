import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useTaskStore } from '../taskStore'
import { taskApi } from '@/lib/tauri-api'
import { createMockTask } from '@/test/store-test-utils'
import type { TaskStatus } from '@/types'

// Mock the Tauri API
vi.mock('@/lib/tauri-api', () => ({
  taskApi: {
    getForSession: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
    importPRD: vi.fn(),
  },
}))

describe('taskStore', () => {
  const mockTask = createMockTask()
  const mockTask2 = createMockTask({
    id: 'task-2',
    title: 'Second Task',
    priority: 2,
    status: 'in_progress' as TaskStatus,
  })

  beforeEach(() => {
    // Reset store state
    const store = useTaskStore.getState()
    store.tasks = []
    store.loading = false
    store.error = null
    store.filter = {
      sortBy: 'priority',
      sortOrder: 'asc',
    }
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchTasks', () => {
    it('should fetch tasks for a session successfully', async () => {
      const mockTasks = [mockTask, mockTask2]
      vi.mocked(taskApi.getForSession).mockResolvedValue(mockTasks)

      const store = useTaskStore.getState()
      await store.fetchTasks('session-1')

      expect(taskApi.getForSession).toHaveBeenCalledWith('session-1')
      expect(useTaskStore.getState().tasks).toEqual(mockTasks)
      expect(useTaskStore.getState().loading).toBe(false)
      expect(useTaskStore.getState().error).toBeNull()
    })

    it('should handle fetch error', async () => {
      const errorMessage = 'Failed to fetch tasks'
      vi.mocked(taskApi.getForSession).mockRejectedValue(new Error(errorMessage))

      const store = useTaskStore.getState()
      await store.fetchTasks('session-1')

      expect(useTaskStore.getState().tasks).toEqual([])
      expect(useTaskStore.getState().error).toContain(errorMessage)
      expect(useTaskStore.getState().loading).toBe(false)
    })

    it('should set loading state during fetch', async () => {
      let loadingDuringFetch = false
      vi.mocked(taskApi.getForSession).mockImplementation(async () => {
        loadingDuringFetch = useTaskStore.getState().loading
        return []
      })

      const store = useTaskStore.getState()
      await store.fetchTasks('session-1')

      expect(loadingDuringFetch).toBe(true)
    })
  })

  describe('createTask', () => {
    it('should create a new task successfully', async () => {
      vi.mocked(taskApi.create).mockResolvedValue(mockTask)

      const store = useTaskStore.getState()
      await store.createTask('session-1', mockTask)

      expect(taskApi.create).toHaveBeenCalledWith('session-1', mockTask)
      expect(useTaskStore.getState().tasks).toContain(mockTask)
      expect(useTaskStore.getState().loading).toBe(false)
      expect(useTaskStore.getState().error).toBeNull()
    })

    it('should handle create error', async () => {
      const errorMessage = 'Failed to create task'
      vi.mocked(taskApi.create).mockRejectedValue(new Error(errorMessage))

      const store = useTaskStore.getState()
      await store.createTask('session-1', mockTask)

      expect(useTaskStore.getState().error).toContain(errorMessage)
    })

    it('should add new task to existing tasks', async () => {
      const store = useTaskStore.getState()
      store.tasks = [mockTask]

      vi.mocked(taskApi.create).mockResolvedValue(mockTask2)
      await store.createTask('session-1', mockTask2)

      expect(useTaskStore.getState().tasks).toHaveLength(2)
      expect(useTaskStore.getState().tasks).toContain(mockTask)
      expect(useTaskStore.getState().tasks).toContain(mockTask2)
    })
  })

  describe('updateTask', () => {
    it('should update an existing task', async () => {
      const updatedTask = { ...mockTask, title: 'Updated Task' }
      vi.mocked(taskApi.update).mockResolvedValue(updatedTask)

      const store = useTaskStore.getState()
      store.tasks = [mockTask, mockTask2]

      await store.updateTask(updatedTask)

      expect(taskApi.update).toHaveBeenCalledWith(updatedTask)
      expect(useTaskStore.getState().tasks[0]).toEqual(updatedTask)
      expect(useTaskStore.getState().loading).toBe(false)
    })

    it('should handle update error', async () => {
      const errorMessage = 'Failed to update task'
      vi.mocked(taskApi.update).mockRejectedValue(new Error(errorMessage))

      const store = useTaskStore.getState()
      await store.updateTask(mockTask)

      expect(useTaskStore.getState().error).toContain(errorMessage)
    })

    it('should not affect other tasks when updating one', async () => {
      const updatedTask = { ...mockTask, title: 'Updated' }
      vi.mocked(taskApi.update).mockResolvedValue(updatedTask)

      const store = useTaskStore.getState()
      store.tasks = [mockTask, mockTask2]

      await store.updateTask(updatedTask)

      expect(useTaskStore.getState().tasks[1]).toEqual(mockTask2)
    })
  })

  describe('deleteTask', () => {
    it('should delete a task successfully', async () => {
      vi.mocked(taskApi.delete).mockResolvedValue(undefined)

      const store = useTaskStore.getState()
      store.tasks = [mockTask, mockTask2]

      await store.deleteTask('task-1')

      expect(taskApi.delete).toHaveBeenCalledWith('task-1')
      expect(useTaskStore.getState().tasks).toHaveLength(1)
      expect(useTaskStore.getState().tasks).not.toContainEqual(mockTask)
      expect(useTaskStore.getState().tasks).toContainEqual(mockTask2)
    })

    it('should handle delete error', async () => {
      const errorMessage = 'Failed to delete task'
      vi.mocked(taskApi.delete).mockRejectedValue(new Error(errorMessage))

      const store = useTaskStore.getState()
      store.tasks = [mockTask]

      await store.deleteTask('task-1')

      expect(useTaskStore.getState().tasks).toContainEqual(mockTask)
      expect(useTaskStore.getState().error).toContain(errorMessage)
    })
  })

  describe('updateTaskStatus', () => {
    it('should update task status successfully', async () => {
      vi.mocked(taskApi.updateStatus).mockResolvedValue(undefined)

      const store = useTaskStore.getState()
      store.tasks = [mockTask, mockTask2]

      await store.updateTaskStatus('task-1', 'completed')

      expect(taskApi.updateStatus).toHaveBeenCalledWith('task-1', 'completed')
      expect(useTaskStore.getState().tasks[0].status).toBe('completed')
      expect(useTaskStore.getState().loading).toBe(false)
    })

    it('should handle status update error', async () => {
      const errorMessage = 'Failed to update status'
      vi.mocked(taskApi.updateStatus).mockRejectedValue(new Error(errorMessage))

      const store = useTaskStore.getState()
      await store.updateTaskStatus('task-1', 'completed')

      expect(useTaskStore.getState().error).toContain(errorMessage)
    })
  })

  describe('importPRD', () => {
    it('should import tasks from PRD successfully', async () => {
      const importedTasks = [mockTask, mockTask2]
      vi.mocked(taskApi.importPRD).mockResolvedValue(importedTasks)

      const store = useTaskStore.getState()
      await store.importPRD('session-1', '{"tasks": []}', 'json')

      expect(taskApi.importPRD).toHaveBeenCalledWith('session-1', '{"tasks": []}', 'json')
      expect(useTaskStore.getState().tasks).toEqual(importedTasks)
      expect(useTaskStore.getState().loading).toBe(false)
    })

    it('should append imported tasks to existing tasks', async () => {
      const existingTask = { ...mockTask, id: 'existing-1' }
      const importedTasks = [mockTask, mockTask2]

      vi.mocked(taskApi.importPRD).mockResolvedValue(importedTasks)

      const store = useTaskStore.getState()
      store.tasks = [existingTask]

      await store.importPRD('session-1', '{"tasks": []}')

      expect(useTaskStore.getState().tasks).toHaveLength(3)
      expect(useTaskStore.getState().tasks).toContainEqual(existingTask)
    })

    it('should handle import error', async () => {
      const errorMessage = 'Failed to parse PRD'
      vi.mocked(taskApi.importPRD).mockRejectedValue(new Error(errorMessage))

      const store = useTaskStore.getState()
      await expect(store.importPRD('session-1', 'invalid')).rejects.toThrow(errorMessage)

      expect(useTaskStore.getState().error).toContain(errorMessage)
    })
  })

  describe('setFilter', () => {
    it('should update filter settings', () => {
      const store = useTaskStore.getState()
      store.setFilter({ status: 'completed', searchQuery: 'test' })

      expect(useTaskStore.getState().filter.status).toBe('completed')
      expect(useTaskStore.getState().filter.searchQuery).toBe('test')
    })

    it('should merge with existing filter settings', () => {
      const store = useTaskStore.getState()
      store.filter = { sortBy: 'priority', sortOrder: 'asc' }

      store.setFilter({ status: 'pending' })

      expect(useTaskStore.getState().filter.sortBy).toBe('priority')
      expect(useTaskStore.getState().filter.status).toBe('pending')
    })
  })

  describe('getFilteredTasks', () => {
    beforeEach(() => {
      const store = useTaskStore.getState()
      store.tasks = [
        { ...mockTask, status: 'pending', title: 'Task A', priority: 1 },
        { ...mockTask2, status: 'completed', title: 'Task B', priority: 2 },
        { ...mockTask, id: 'task-3', status: 'pending', title: 'Task C', priority: 3 },
      ]
    })

    it('should filter by status', () => {
      const store = useTaskStore.getState()
      store.setFilter({ status: 'pending' })

      const filtered = store.getFilteredTasks()

      expect(filtered).toHaveLength(2)
      expect(filtered.every((t) => t.status === 'pending')).toBe(true)
    })

    it('should filter by search query in title', () => {
      const store = useTaskStore.getState()
      store.setFilter({ searchQuery: 'Task B' })

      const filtered = store.getFilteredTasks()

      expect(filtered).toHaveLength(1)
      expect(filtered[0].title).toBe('Task B')
    })

    it('should filter by search query in description', () => {
      const store = useTaskStore.getState()
      store.tasks[0].description = 'Special description'
      store.setFilter({ searchQuery: 'special' })

      const filtered = store.getFilteredTasks()

      expect(filtered).toHaveLength(1)
      expect(filtered[0].description).toContain('Special')
    })

    it('should sort by priority ascending', () => {
      const store = useTaskStore.getState()
      store.setFilter({ sortBy: 'priority', sortOrder: 'asc' })

      const filtered = store.getFilteredTasks()

      expect(filtered[0].priority).toBe(1)
      expect(filtered[1].priority).toBe(2)
      expect(filtered[2].priority).toBe(3)
    })

    it('should sort by priority descending', () => {
      const store = useTaskStore.getState()
      store.setFilter({ sortBy: 'priority', sortOrder: 'desc' })

      const filtered = store.getFilteredTasks()

      expect(filtered[0].priority).toBe(3)
      expect(filtered[1].priority).toBe(2)
      expect(filtered[2].priority).toBe(1)
    })

    it('should sort by title', () => {
      const store = useTaskStore.getState()
      store.setFilter({ sortBy: 'title', sortOrder: 'asc' })

      const filtered = store.getFilteredTasks()

      expect(filtered[0].title).toBe('Task A')
      expect(filtered[1].title).toBe('Task B')
      expect(filtered[2].title).toBe('Task C')
    })

    it('should sort by status', () => {
      const store = useTaskStore.getState()
      store.setFilter({ sortBy: 'status', sortOrder: 'asc' })

      const filtered = store.getFilteredTasks()

      expect(filtered[0].status).toBe('completed')
    })

    it('should combine filters', () => {
      const store = useTaskStore.getState()
      store.setFilter({
        status: 'pending',
        searchQuery: 'Task C',
        sortBy: 'priority',
        sortOrder: 'asc',
      })

      const filtered = store.getFilteredTasks()

      expect(filtered).toHaveLength(1)
      expect(filtered[0].title).toBe('Task C')
      expect(filtered[0].status).toBe('pending')
    })
  })

  describe('error handling', () => {
    it('should handle string errors', async () => {
      vi.mocked(taskApi.getForSession).mockRejectedValue('String error')

      const store = useTaskStore.getState()
      await store.fetchTasks('session-1')

      expect(useTaskStore.getState().error).toBe('String error')
    })

    it('should handle unknown error types', async () => {
      vi.mocked(taskApi.getForSession).mockRejectedValue({ custom: 'error' })

      const store = useTaskStore.getState()
      await store.fetchTasks('session-1')

      expect(useTaskStore.getState().error).toBeTruthy()
    })
  })
})
