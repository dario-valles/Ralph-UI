import { create } from 'zustand'
import { Session, Task } from '@/types'

interface SessionState {
  currentSession: Session | null
  sessions: Session[]
  setCurrentSession: (session: Session | null) => void
  addSession: (session: Session) => void
  updateSession: (id: string, updates: Partial<Session>) => void
  deleteSession: (id: string) => void
  addTask: (sessionId: string, task: Task) => void
  updateTask: (sessionId: string, taskId: string, updates: Partial<Task>) => void
  deleteTask: (sessionId: string, taskId: string) => void
}

export const useSessionStore = create<SessionState>((set) => ({
  currentSession: null,
  sessions: [],

  setCurrentSession: (session) => set({ currentSession: session }),

  addSession: (session) =>
    set((state) => ({
      sessions: [...state.sessions, session],
    })),

  updateSession: (id, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      currentSession:
        state.currentSession?.id === id
          ? { ...state.currentSession, ...updates }
          : state.currentSession,
    })),

  deleteSession: (id) =>
    set((state) => ({
      sessions: state.sessions.filter((s) => s.id !== id),
      currentSession: state.currentSession?.id === id ? null : state.currentSession,
    })),

  addTask: (sessionId, task) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, tasks: [...s.tasks, task] } : s
      ),
      currentSession:
        state.currentSession?.id === sessionId
          ? { ...state.currentSession, tasks: [...state.currentSession.tasks, task] }
          : state.currentSession,
    })),

  updateTask: (sessionId, taskId, updates) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
            }
          : s
      ),
      currentSession:
        state.currentSession?.id === sessionId
          ? {
              ...state.currentSession,
              tasks: state.currentSession.tasks.map((t) =>
                t.id === taskId ? { ...t, ...updates } : t
              ),
            }
          : state.currentSession,
    })),

  deleteTask: (sessionId, taskId) =>
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.id === sessionId ? { ...s, tasks: s.tasks.filter((t) => t.id !== taskId) } : s
      ),
      currentSession:
        state.currentSession?.id === sessionId
          ? {
              ...state.currentSession,
              tasks: state.currentSession.tasks.filter((t) => t.id !== taskId),
            }
          : state.currentSession,
    })),
}))
