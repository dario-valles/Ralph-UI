import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useToastStore, toast } from '../toastStore'

describe('toastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useToastStore.setState({ toasts: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('addToast', () => {
    it('should add a toast to the store', () => {
      const store = useToastStore.getState()
      store.addToast({ title: 'Test', variant: 'default' })

      expect(useToastStore.getState().toasts).toHaveLength(1)
      expect(useToastStore.getState().toasts[0].title).toBe('Test')
    })

    it('should set default duration of 5000ms', () => {
      const store = useToastStore.getState()
      store.addToast({ title: 'Test', variant: 'default' })

      expect(useToastStore.getState().toasts[0].duration).toBe(5000)
    })

    it('should respect custom duration', () => {
      const store = useToastStore.getState()
      store.addToast({ title: 'Test', variant: 'default', duration: 10000 })

      expect(useToastStore.getState().toasts[0].duration).toBe(10000)
    })

    it('should auto-remove toast after duration', () => {
      const store = useToastStore.getState()
      store.addToast({ title: 'Test', variant: 'default', duration: 5000 })

      expect(useToastStore.getState().toasts).toHaveLength(1)

      vi.advanceTimersByTime(5000)

      expect(useToastStore.getState().toasts).toHaveLength(0)
    })

    it('should not auto-remove toast when duration is 0', () => {
      const store = useToastStore.getState()
      store.addToast({ title: 'Test', variant: 'default', duration: 0 })

      vi.advanceTimersByTime(10000)

      expect(useToastStore.getState().toasts).toHaveLength(1)
    })
  })

  describe('removeToast', () => {
    it('should remove a specific toast', () => {
      const store = useToastStore.getState()
      store.addToast({ title: 'Test 1', variant: 'default' })
      store.addToast({ title: 'Test 2', variant: 'default' })

      const toastId = useToastStore.getState().toasts[0].id
      store.removeToast(toastId)

      expect(useToastStore.getState().toasts).toHaveLength(1)
      expect(useToastStore.getState().toasts[0].title).toBe('Test 2')
    })

    it('should clear pending timeout when removing toast manually', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

      const store = useToastStore.getState()
      store.addToast({ title: 'Test', variant: 'default', duration: 5000 })

      const toastId = useToastStore.getState().toasts[0].id
      store.removeToast(toastId)

      expect(clearTimeoutSpy).toHaveBeenCalled()
      clearTimeoutSpy.mockRestore()
    })
  })

  describe('clearToasts', () => {
    it('should remove all toasts', () => {
      const store = useToastStore.getState()
      store.addToast({ title: 'Test 1', variant: 'default' })
      store.addToast({ title: 'Test 2', variant: 'default' })
      store.addToast({ title: 'Test 3', variant: 'default' })

      store.clearToasts()

      expect(useToastStore.getState().toasts).toHaveLength(0)
    })

    it('should clear all pending timeouts', () => {
      const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')

      const store = useToastStore.getState()
      store.addToast({ title: 'Test 1', variant: 'default', duration: 5000 })
      store.addToast({ title: 'Test 2', variant: 'default', duration: 5000 })

      store.clearToasts()

      // Should have cleared both timeouts
      expect(clearTimeoutSpy).toHaveBeenCalledTimes(2)
      clearTimeoutSpy.mockRestore()
    })
  })

  describe('toast convenience functions', () => {
    it('should add success toast', () => {
      toast.success('Success!', 'Description')

      const toasts = useToastStore.getState().toasts
      expect(toasts).toHaveLength(1)
      expect(toasts[0].variant).toBe('success')
      expect(toasts[0].title).toBe('Success!')
      expect(toasts[0].description).toBe('Description')
    })

    it('should add error toast', () => {
      toast.error('Error!', 'Something went wrong')

      const toasts = useToastStore.getState().toasts
      expect(toasts).toHaveLength(1)
      expect(toasts[0].variant).toBe('error')
    })

    it('should add warning toast', () => {
      toast.warning('Warning!')

      const toasts = useToastStore.getState().toasts
      expect(toasts).toHaveLength(1)
      expect(toasts[0].variant).toBe('warning')
    })

    it('should add default toast', () => {
      toast.default('Info')

      const toasts = useToastStore.getState().toasts
      expect(toasts).toHaveLength(1)
      expect(toasts[0].variant).toBe('default')
    })
  })

  describe('rateLimitWarning', () => {
    it('should show rate limit warning toast', () => {
      toast.rateLimitWarning({
        agentId: 'agent-123-456',
        sessionId: 'session-1',
        limitType: 'http_429',
        retryAfterMs: 5000,
      })

      const toasts = useToastStore.getState().toasts
      expect(toasts).toHaveLength(1)
      expect(toasts[0].variant).toBe('warning')
      expect(toasts[0].title).toContain('Rate Limit')
      // Agent ID is truncated to first 8 chars
      expect(toasts[0].description).toContain('agent-12')
      expect(toasts[0].description).toContain('5s')
      expect(toasts[0].duration).toBe(8000)
    })

    it('should handle rate limit without retry time', () => {
      toast.rateLimitWarning({
        agentId: 'agent-123',
        sessionId: 'session-1',
        limitType: 'quota_exceeded',
      })

      const toasts = useToastStore.getState().toasts
      expect(toasts).toHaveLength(1)
      expect(toasts[0].description).not.toContain('Retry in')
    })
  })
})
