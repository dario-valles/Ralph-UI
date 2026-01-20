import { describe, it, expect, vi } from 'vitest'
import {
  getErrorMessage,
  createAsyncAction,
  createAsyncActionWithArgs,
  runAsyncAction,
  type AsyncState,
  type SetState,
} from '../store-utils'

describe('store-utils', () => {
  describe('getErrorMessage', () => {
    it('extracts message from Error objects', () => {
      const error = new Error('Something went wrong')
      expect(getErrorMessage(error)).toBe('Something went wrong')
    })

    it('returns string errors as-is', () => {
      expect(getErrorMessage('String error')).toBe('String error')
    })

    it('converts other types to string', () => {
      expect(getErrorMessage(42)).toBe('42')
      expect(getErrorMessage(null)).toBe('null')
      expect(getErrorMessage(undefined)).toBe('undefined')
      expect(getErrorMessage({ foo: 'bar' })).toBe('[object Object]')
    })
  })

  describe('createAsyncAction', () => {
    interface TestState extends AsyncState {
      data: string[]
    }

    it('sets loading state and updates on success', async () => {
      const setCalls: Partial<TestState>[] = []
      const set: SetState<TestState> = (partial) => {
        if (typeof partial === 'function') {
          setCalls.push(partial({ loading: false, error: null, data: [] }))
        } else {
          setCalls.push(partial as Partial<TestState>)
        }
      }

      const action = createAsyncAction<TestState, { data: string[] }>(set, async () => {
        return { data: ['item1', 'item2'] }
      })

      await action()

      expect(setCalls).toHaveLength(2)
      expect(setCalls[0]).toEqual({ loading: true, error: null })
      expect(setCalls[1]).toEqual({ data: ['item1', 'item2'], loading: false })
    })

    it('sets error state on failure', async () => {
      const setCalls: Partial<TestState>[] = []
      const set: SetState<TestState> = (partial) => {
        if (typeof partial === 'function') {
          setCalls.push(partial({ loading: false, error: null, data: [] }))
        } else {
          setCalls.push(partial as Partial<TestState>)
        }
      }

      const action = createAsyncAction<TestState, void>(set, async () => {
        throw new Error('API error')
      })

      await action()

      expect(setCalls).toHaveLength(2)
      expect(setCalls[0]).toEqual({ loading: true, error: null })
      expect(setCalls[1]).toEqual({ error: 'API error', loading: false })
    })

    it('respects setLoading: false option', async () => {
      const setCalls: Partial<TestState>[] = []
      const set: SetState<TestState> = (partial) => {
        setCalls.push(partial as Partial<TestState>)
      }

      const action = createAsyncAction<TestState, { data: string[] }>(
        set,
        async () => ({ data: ['test'] }),
        { setLoading: false }
      )

      await action()

      expect(setCalls).toHaveLength(1)
      expect(setCalls[0]).toEqual({ data: ['test'], loading: false })
    })

    it('uses custom error transformer', async () => {
      const setCalls: Partial<TestState>[] = []
      const set: SetState<TestState> = (partial) => {
        setCalls.push(partial as Partial<TestState>)
      }

      const action = createAsyncAction<TestState, void>(
        set,
        async () => {
          throw new Error('Original error')
        },
        { transformError: () => 'Custom error message' }
      )

      await action()

      expect(setCalls[1]).toEqual({ error: 'Custom error message', loading: false })
    })
  })

  describe('createAsyncActionWithArgs', () => {
    interface TestState extends AsyncState {
      user: { id: string; name: string } | null
    }

    it('passes arguments to the action', async () => {
      const setCalls: Partial<TestState>[] = []
      const set: SetState<TestState> = (partial) => {
        setCalls.push(partial as Partial<TestState>)
      }

      const fetchUser = createAsyncActionWithArgs<
        TestState,
        [string],
        { user: { id: string; name: string } }
      >(set, async (id: string) => {
        return { user: { id, name: 'Test User' } }
      })

      await fetchUser('user-123')

      expect(setCalls).toHaveLength(2)
      expect(setCalls[1]).toEqual({
        user: { id: 'user-123', name: 'Test User' },
        loading: false,
      })
    })

    it('handles multiple arguments', async () => {
      const actionFn = vi.fn().mockResolvedValue({ user: null })
      const set: SetState<TestState> = vi.fn()

      const action = createAsyncActionWithArgs<
        TestState,
        [string, number, boolean],
        { user: null }
      >(set, actionFn)

      await action('id', 42, true)

      expect(actionFn).toHaveBeenCalledWith('id', 42, true)
    })
  })

  describe('runAsyncAction', () => {
    interface TestState extends AsyncState {
      items: number[]
    }

    it('runs action and updates state', async () => {
      const setCalls: Partial<TestState>[] = []
      const set: SetState<TestState> = (partial) => {
        setCalls.push(partial as Partial<TestState>)
      }

      await runAsyncAction(set, async () => {
        return { items: [1, 2, 3] }
      })

      expect(setCalls).toHaveLength(2)
      expect(setCalls[0]).toEqual({ loading: true, error: null })
      expect(setCalls[1]).toEqual({ items: [1, 2, 3], loading: false })
    })

    it('handles errors', async () => {
      const setCalls: Partial<TestState>[] = []
      const set: SetState<TestState> = (partial) => {
        setCalls.push(partial as Partial<TestState>)
      }

      await runAsyncAction(set, async () => {
        throw new Error('Failed to load')
      })

      expect(setCalls).toHaveLength(2)
      expect(setCalls[1]).toEqual({ error: 'Failed to load', loading: false })
    })
  })
})
