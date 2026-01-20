// Session management store using Zustand

import { create } from 'zustand'
import type { Session, SessionStatus } from '@/types'
import { sessionApi } from '@/lib/tauri-api'
import { asyncAction, type AsyncState } from '@/lib/store-utils'

interface SessionStore extends AsyncState {
  sessions: Session[]
  currentSession: Session | null

  // Actions
  fetchSessions: () => Promise<void>
  fetchSession: (id: string) => Promise<void>
  createSession: (name: string, projectPath: string) => Promise<Session | undefined>
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
    await asyncAction(set, async () => {
      const sessions = await sessionApi.getAll()
      return { sessions }
    })
  },

  fetchSession: async (id: string) => {
    await asyncAction(set, async () => {
      const session = await sessionApi.getById(id)
      return { currentSession: session }
    })
  },

  createSession: async (name: string, projectPath: string) => {
    return asyncAction(set, async () => {
      const session = await sessionApi.create(name, projectPath)
      return {
        sessions: [...get().sessions, session],
        currentSession: session,
        __result: session,
      }
    })
  },

  updateSession: async (session: Session) => {
    await asyncAction(set, async () => {
      const updatedSession = await sessionApi.update(session)
      const state = get()
      return {
        sessions: state.sessions.map((s) =>
          s.id === updatedSession.id ? updatedSession : s
        ),
        currentSession:
          state.currentSession?.id === updatedSession.id
            ? updatedSession
            : state.currentSession,
      }
    })
  },

  deleteSession: async (id: string) => {
    await asyncAction(set, async () => {
      await sessionApi.delete(id)
      const state = get()
      return {
        sessions: state.sessions.filter((s) => s.id !== id),
        currentSession: state.currentSession?.id === id ? null : state.currentSession,
      }
    })
  },

  updateSessionStatus: async (sessionId: string, status: SessionStatus) => {
    await asyncAction(set, async () => {
      await sessionApi.updateStatus(sessionId, status)
      const state = get()
      return {
        sessions: state.sessions.map((s) =>
          s.id === sessionId ? { ...s, status } : s
        ),
        currentSession:
          state.currentSession?.id === sessionId
            ? { ...state.currentSession, status }
            : state.currentSession,
      }
    })
  },

  setCurrentSession: (session: Session | null) => {
    set({ currentSession: session })
  },
}))
