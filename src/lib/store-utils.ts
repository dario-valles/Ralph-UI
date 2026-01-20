/**
 * Utility functions for Zustand stores to reduce boilerplate.
 */

/**
 * Extract error message from unknown error types.
 * Handles Error objects, strings, and unknown types consistently.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === 'string') {
    return error
  }
  return String(error)
}

/**
 * Type for store state with common loading/error fields.
 */
export interface AsyncState {
  loading: boolean
  error: string | null
}

/**
 * Type for the set function from Zustand.
 */
export type SetState<T> = (
  partial: T | Partial<T> | ((state: T) => T | Partial<T>),
  replace?: boolean
) => void

/**
 * Creates a wrapper for async store actions that handles loading state and errors.
 *
 * @example
 * ```typescript
 * const fetchUsers = createAsyncAction(set, async () => {
 *   const users = await api.getUsers()
 *   return { users }
 * })
 * ```
 */
export function createAsyncAction<T extends AsyncState, R>(
  set: SetState<T>,
  action: () => Promise<Partial<T> | void>,
  options?: {
    /** Custom error transformer */
    transformError?: (error: unknown) => string
    /** Whether to set loading state (default: true) */
    setLoading?: boolean
  }
): () => Promise<R | void> {
  const { transformError = getErrorMessage, setLoading = true } = options ?? {}

  return async () => {
    if (setLoading) {
      set({ loading: true, error: null } as Partial<T>)
    }
    try {
      const result = await action()
      set({ ...result, loading: false } as Partial<T>)
      return result as R
    } catch (error) {
      set({ error: transformError(error), loading: false } as Partial<T>)
    }
  }
}

/**
 * Creates a wrapper for async store actions with arguments.
 *
 * @example
 * ```typescript
 * const fetchUser = createAsyncActionWithArgs(set, async (id: string) => {
 *   const user = await api.getUser(id)
 *   return { currentUser: user }
 * })
 * ```
 */
export function createAsyncActionWithArgs<T extends AsyncState, Args extends unknown[], R>(
  set: SetState<T>,
  action: (...args: Args) => Promise<Partial<T> | R | void>,
  options?: {
    /** Custom error transformer */
    transformError?: (error: unknown) => string
    /** Whether to set loading state (default: true) */
    setLoading?: boolean
  }
): (...args: Args) => Promise<R | void> {
  const { transformError = getErrorMessage, setLoading = true } = options ?? {}

  return async (...args: Args) => {
    if (setLoading) {
      set({ loading: true, error: null } as Partial<T>)
    }
    try {
      const result = await action(...args)
      if (result && typeof result === 'object' && !Array.isArray(result)) {
        set({ ...result, loading: false } as Partial<T>)
      } else {
        set({ loading: false } as Partial<T>)
      }
      return result as R
    } catch (error) {
      set({ error: transformError(error), loading: false } as Partial<T>)
    }
  }
}

/**
 * Standard async action runner that sets loading/error state.
 * Use this when you need more control over the state updates.
 *
 * @example
 * ```typescript
 * fetchSessions: async () => {
 *   await runAsyncAction(set, async () => {
 *     const sessions = await sessionApi.getAll()
 *     return { sessions }
 *   })
 * }
 * ```
 */
export async function runAsyncAction<T extends AsyncState>(
  set: SetState<T>,
  action: () => Promise<Partial<T>>
): Promise<void> {
  set({ loading: true, error: null } as Partial<T>)
  try {
    const result = await action()
    set({ ...result, loading: false } as Partial<T>)
  } catch (error) {
    set({ error: getErrorMessage(error), loading: false } as Partial<T>)
  }
}
