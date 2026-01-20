/**
 * Zustand store utilities for reducing async action boilerplate.
 */

import type { StoreApi } from 'zustand'

/**
 * Common state shape for stores with loading/error tracking.
 */
interface AsyncState {
  loading: boolean
  error: string | null
}

type SetState<T> = StoreApi<T>['setState']

/**
 * Runs an async action with automatic loading/error state management.
 *
 * Before: Sets loading=true, error=null
 * After: Sets loading=false
 * On error: Sets error=String(error), loading=false
 *
 * @param set - Zustand's set function
 * @param action - Async function that returns partial state to merge, or void
 * @returns The result of the action, or undefined on error
 *
 * @example
 * // Simple action that returns data
 * fetchSessions: async () => {
 *   await runAsyncAction(set, async () => {
 *     const sessions = await sessionApi.getAll()
 *     return { sessions }
 *   })
 * }
 *
 * // Action that needs current state
 * createSession: async (name) => {
 *   return await runAsyncAction(set, async () => {
 *     const session = await sessionApi.create(name)
 *     return (state) => ({
 *       sessions: [...state.sessions, session],
 *       currentSession: session,
 *     })
 *   })
 * }
 */
export async function runAsyncAction<T extends AsyncState, R = void>(
  set: SetState<T>,
  action: () => Promise<Partial<T> | ((state: T) => Partial<T>) | R>
): Promise<R | undefined> {
  set({ loading: true, error: null } as Partial<T>)
  try {
    const result = await action()
    // Check if result is a state updater function
    if (typeof result === 'function') {
      set((state) => ({ ...(result as (state: T) => Partial<T>)(state), loading: false }) as T)
    } else if (result && typeof result === 'object') {
      // Result is a partial state object
      set({ ...result, loading: false } as Partial<T>)
    } else {
      set({ loading: false } as Partial<T>)
    }
    return result as R
  } catch (error) {
    set({ error: String(error), loading: false } as Partial<T>)
    return undefined
  }
}

/**
 * Runs an async action that may throw and should propagate the error.
 * Unlike runAsyncAction, this re-throws errors after setting error state.
 *
 * @param set - Zustand's set function
 * @param action - Async function that returns partial state to merge
 * @throws Re-throws any error after updating error state
 */
export async function runAsyncActionOrThrow<T extends AsyncState, R = void>(
  set: SetState<T>,
  action: () => Promise<Partial<T> | R>
): Promise<R> {
  set({ loading: true, error: null } as Partial<T>)
  try {
    const result = await action()
    if (result && typeof result === 'object') {
      set({ ...result, loading: false } as Partial<T>)
    } else {
      set({ loading: false } as Partial<T>)
    }
    return result as R
  } catch (error) {
    set({ error: String(error), loading: false } as Partial<T>)
    throw error
  }
}
