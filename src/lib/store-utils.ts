/**
 * Shared utilities for Zustand stores
 *
 * Provides helpers to reduce boilerplate in async action handlers.
 */

/**
 * Base state interface that async stores should include
 */
export interface AsyncState {
  loading: boolean
  error: string | null
}

/**
 * Options for asyncAction helper
 */
export interface AsyncActionOptions {
  /** Re-throw error after setting error state (default: false) */
  rethrow?: boolean
  /** Skip setting loading state (useful for background polling) */
  silent?: boolean
}

/**
 * Helper to reduce boilerplate in async store actions.
 *
 * Handles the common pattern of:
 * 1. Set loading: true, error: null
 * 2. Execute async action
 * 3. Update state on success (with loading: false)
 * 4. Set error on failure (with loading: false)
 *
 * @example
 * ```ts
 * fetchItems: async () => {
 *   await asyncAction(set, async () => {
 *     const items = await api.getItems()
 *     return { items }
 *   })
 * }
 * ```
 *
 * @example
 * ```ts
 * // With return value
 * createItem: async (data) => {
 *   return asyncAction(set, async () => {
 *     const item = await api.create(data)
 *     return { items: [...get().items, item] }
 *   }, { rethrow: true })
 * }
 * ```
 */
export async function asyncAction<TState extends AsyncState, TResult = void>(
  set: (partial: Partial<TState> | ((state: TState) => Partial<TState>)) => void,
  action: () => Promise<Partial<TState> & { __result?: TResult }>,
  options?: AsyncActionOptions
): Promise<TResult | undefined> {
  // Only set loading state if not silent (for background polling, skip loading)
  if (!options?.silent) {
    set({ loading: true, error: null } as Partial<TState>)
  }
  try {
    const updates = await action()
    const { __result, ...stateUpdates } = updates
    if (options?.silent) {
      // Silent mode: only update data, not loading state
      set({ ...stateUpdates } as Partial<TState>)
    } else {
      set({ ...stateUpdates, loading: false } as Partial<TState>)
    }
    return __result
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (!options?.silent) {
      set({ error: errorMessage, loading: false } as Partial<TState>)
    }
    if (options?.rethrow) {
      throw error
    }
    return undefined
  }
}

/**
 * Converts an error to a string message.
 * Uses error.message if available, otherwise String(error).
 */
export function errorToString(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
