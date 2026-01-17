// Task management store using Zustand

import { create } from 'zustand'
import type { Task, TaskStatus } from '@/types'
import { taskApi } from '@/lib/tauri-api'

interface TaskFilter {
  status?: TaskStatus
  searchQuery?: string
  sortBy?: 'priority' | 'title' | 'status' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

interface TaskStore {
  tasks: Task[]
  loading: boolean
  error: string | null
  filter: TaskFilter

  // Actions
  fetchTasks: (sessionId: string) => Promise<void>
  createTask: (sessionId: string, task: Task) => Promise<void>
  updateTask: (task: Task) => Promise<void>
  deleteTask: (taskId: string) => Promise<void>
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>
  importPRD: (sessionId: string, content: string, format?: string) => Promise<void>
  setFilter: (filter: Partial<TaskFilter>) => void
  getFilteredTasks: () => Task[]
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  loading: false,
  error: null,
  filter: {
    sortBy: 'priority',
    sortOrder: 'asc',
  },

  fetchTasks: async (sessionId: string) => {
    set({ loading: true, error: null })
    try {
      const tasks = await taskApi.getForSession(sessionId)
      set({ tasks, loading: false })
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  createTask: async (sessionId: string, task: Task) => {
    set({ loading: true, error: null })
    try {
      const newTask = await taskApi.create(sessionId, task)
      set((state) => ({
        tasks: [...state.tasks, newTask],
        loading: false,
      }))
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  updateTask: async (task: Task) => {
    set({ loading: true, error: null })
    try {
      const updatedTask = await taskApi.update(task)
      set((state) => ({
        tasks: state.tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)),
        loading: false,
      }))
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  deleteTask: async (taskId: string) => {
    set({ loading: true, error: null })
    try {
      await taskApi.delete(taskId)
      set((state) => ({
        tasks: state.tasks.filter((t) => t.id !== taskId),
        loading: false,
      }))
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  updateTaskStatus: async (taskId: string, status: TaskStatus) => {
    set({ loading: true, error: null })
    try {
      await taskApi.updateStatus(taskId, status)
      set((state) => ({
        tasks: state.tasks.map((t) =>
          t.id === taskId ? { ...t, status } : t
        ),
        loading: false,
      }))
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  importPRD: async (sessionId: string, content: string, format?: string) => {
    set({ loading: true, error: null })
    try {
      const tasks = await taskApi.importPRD(sessionId, content, format)
      set((state) => ({
        tasks: [...state.tasks, ...tasks],
        loading: false,
      }))
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  setFilter: (filter: Partial<TaskFilter>) => {
    set((state) => ({
      filter: { ...state.filter, ...filter },
    }))
  },

  getFilteredTasks: () => {
    const { tasks, filter } = get()
    let filtered = [...tasks]

    // Filter by status
    if (filter.status) {
      filtered = filtered.filter((t) => t.status === filter.status)
    }

    // Filter by search query
    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase()
      filtered = filtered.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          t.description.toLowerCase().includes(query)
      )
    }

    // Sort
    if (filter.sortBy) {
      filtered.sort((a, b) => {
        let comparison = 0
        switch (filter.sortBy) {
          case 'priority':
            comparison = a.priority - b.priority
            break
          case 'title':
            comparison = a.title.localeCompare(b.title)
            break
          case 'status':
            comparison = a.status.localeCompare(b.status)
            break
        }
        return filter.sortOrder === 'desc' ? -comparison : comparison
      })
    }

    return filtered
  },
}))
