// Session management store using Zustand

import { create } from 'zustand'
import type { Session, SessionStatus } from '@/types'
import { sessionApi } from '@/lib/tauri-api'

interface SessionStore {
  sessions: Session[]
  currentSession: Session | null
  loading: boolean
  error: string | null

  // Actions
  fetchSessions: () => Promise<void>
  fetchSession: (id: string) => Promise<void>
  createSession: (name: string, projectPath: string) => Promise<Session | null>
  updateSession: (session: Session) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  updateSessionStatus: (sessionId: string, status: SessionStatus) => Promise<void>
  setCurrentSession: (session: Session | null) => void
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  sessions: [],
  currentSession: null,
  loading: false,
  error: null,

  fetchSessions: async () => {
    set({ loading: true, error: null })
    try {
      const sessions = await sessionApi.getAll()
      set({ sessions, loading: false })
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  fetchSession: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const session = await sessionApi.getById(id)
      set({ currentSession: session, loading: false })
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  createSession: async (name: string, projectPath: string) => {
    set({ loading: true, error: null })
    try {
      const session = await sessionApi.create(name, projectPath)
      set((state) => ({
        sessions: [...state.sessions, session],
        currentSession: session,
        loading: false,
      }))
      return session
    } catch (error) {
      set({ error: String(error), loading: false })
      return null
    }
  },

  updateSession: async (session: Session) => {
    set({ loading: true, error: null })
    try {
      const updatedSession = await sessionApi.update(session)
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === updatedSession.id ? updatedSession : s
        ),
        currentSession:
          state.currentSession?.id === updatedSession.id
            ? updatedSession
            : state.currentSession,
        loading: false,
      }))
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  deleteSession: async (id: string) => {
    set({ loading: true, error: null })
    try {
      await sessionApi.delete(id)
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== id),
        currentSession: state.currentSession?.id === id ? null : state.currentSession,
        loading: false,
      }))
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  updateSessionStatus: async (sessionId: string, status: SessionStatus) => {
    set({ loading: true, error: null })
    try {
      await sessionApi.updateStatus(sessionId, status)
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, status } : s
        ),
        currentSession:
          state.currentSession?.id === sessionId
            ? { ...state.currentSession, status }
            : state.currentSession,
        loading: false,
      }))
    } catch (error) {
      set({ error: String(error), loading: false })
    }
  },

  setCurrentSession: (session: Session | null) => {
    set({ currentSession: session })
  },
}))
