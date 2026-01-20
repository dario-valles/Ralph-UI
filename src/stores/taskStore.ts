// Task management store using Zustand

import { create } from 'zustand'
import type { Task, TaskStatus } from '@/types'
import { taskApi } from '@/lib/tauri-api'
import { asyncAction, type AsyncState } from '@/lib/store-utils'

interface TaskFilter {
  status?: TaskStatus
  searchQuery?: string
  sortBy?: 'priority' | 'title' | 'status' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

/**
 * Natural sort comparison for strings containing numbers
 * Examples: "US-1.1" < "US-1.2" < "US-5.2" < "US-10.1"
 */
function naturalCompare(a: string, b: string): number {
  const aParts = a.split(/(\d+\.?\d*)/).filter(Boolean)
  const bParts = b.split(/(\d+\.?\d*)/).filter(Boolean)

  const maxLen = Math.max(aParts.length, bParts.length)
  for (let i = 0; i < maxLen; i++) {
    const aPart = aParts[i] || ''
    const bPart = bParts[i] || ''

    const aNum = parseFloat(aPart)
    const bNum = parseFloat(bPart)

    // Both are numbers - compare numerically
    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum
    } else {
      // At least one is not a number - compare as strings
      const cmp = aPart.localeCompare(bPart)
      if (cmp !== 0) return cmp
    }
  }
  return 0
}

interface TaskStore extends AsyncState {
  tasks: Task[]
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
    await asyncAction(set, async () => {
      const tasks = await taskApi.getForSession(sessionId)
      return { tasks }
    })
  },

  createTask: async (sessionId: string, task: Task) => {
    await asyncAction(set, async () => {
      const newTask = await taskApi.create(sessionId, task)
      return { tasks: [...get().tasks, newTask] }
    })
  },

  updateTask: async (task: Task) => {
    await asyncAction(set, async () => {
      const updatedTask = await taskApi.update(task)
      return { tasks: get().tasks.map((t) => (t.id === updatedTask.id ? updatedTask : t)) }
    })
  },

  deleteTask: async (taskId: string) => {
    await asyncAction(set, async () => {
      await taskApi.delete(taskId)
      return { tasks: get().tasks.filter((t) => t.id !== taskId) }
    })
  },

  updateTaskStatus: async (taskId: string, status: TaskStatus) => {
    await asyncAction(set, async () => {
      await taskApi.updateStatus(taskId, status)
      return { tasks: get().tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) }
    })
  },

  importPRD: async (sessionId: string, content: string, format?: string) => {
    await asyncAction(set, async () => {
      const tasks = await taskApi.importPRD(sessionId, content, format)
      return { tasks: [...get().tasks, ...tasks] }
    }, { rethrow: true })
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
            // Secondary sort by title (natural sort) when priorities are equal
            if (comparison === 0) {
              comparison = naturalCompare(a.title, b.title)
            }
            break
          case 'title':
            comparison = naturalCompare(a.title, b.title)
            break
          case 'status':
            comparison = a.status.localeCompare(b.status)
            // Secondary sort by priority, then title when status is equal
            if (comparison === 0) {
              comparison = a.priority - b.priority
              if (comparison === 0) {
                comparison = naturalCompare(a.title, b.title)
              }
            }
            break
        }
        return filter.sortOrder === 'desc' ? -comparison : comparison
      })
    }

    return filtered
  },
}))
