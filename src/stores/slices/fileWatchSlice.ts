/**
 * File Watch Slice
 *
 * Handles PRD plan file watching for real-time updates.
 */
import { prdChatApi } from '@/lib/backend-api'
import type {
  SetState,
  GetState,
  FileWatchSlice,
} from './prdChatTypes'
import { getSessionWithPath } from './prdChatTypes'

/**
 * Creates the file watch slice
 */
export const createFileWatchSlice = (
  set: SetState,
  get: GetState
): FileWatchSlice => ({
  // Initial state
  watchedPlanContent: null,
  watchedPlanPath: null,
  isWatchingPlan: false,

  // Start watching the PRD plan file for the current session
  startWatchingPlanFile: async () => {
    const { isWatchingPlan } = get()
    const ctx = getSessionWithPath(get)
    if (!ctx || isWatchingPlan) return

    try {
      const result = await prdChatApi.startWatchingPlanFile(ctx.session.id, ctx.projectPath)
      if (result.success) {
        set({
          isWatchingPlan: true,
          watchedPlanPath: result.path,
          watchedPlanContent: result.initialContent,
        })
      } else {
        // Don't show error for missing project path - it's expected for some sessions
        if (result.error && !result.error.includes('no project path')) {
          set({
            error: result.error,
          })
        }
      }
    } catch (error) {
      // Silently fail - not all sessions have project paths
      console.warn('Failed to start watching plan file:', error)
    }
  },

  // Stop watching the PRD plan file
  stopWatchingPlanFile: async () => {
    const { currentSession, isWatchingPlan } = get()
    if (!currentSession || !isWatchingPlan) {
      return
    }

    try {
      await prdChatApi.stopWatchingPlanFile(currentSession.id)
    } catch {
      // Ignore errors when stopping
    } finally {
      set({
        isWatchingPlan: false,
        watchedPlanContent: null,
        watchedPlanPath: null,
      })
    }
  },

  // Update plan content (called from event listener)
  updatePlanContent: (content: string, path: string) => {
    set({
      watchedPlanContent: content,
      watchedPlanPath: path,
    })
  },
})
