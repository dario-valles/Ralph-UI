// Toast notification store using Zustand
import { create } from 'zustand'
import type { RateLimitEvent } from '@/types'

export type ToastVariant = 'default' | 'success' | 'error' | 'warning'

export interface Toast {
  id: string
  title: string
  description?: string
  variant: ToastVariant
  duration?: number
}

interface ToastStore {
  toasts: Toast[]
  addToast: (toast: Omit<Toast, 'id'>) => void
  removeToast: (id: string) => void
  clearToasts: () => void
}

let toastId = 0

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = `toast-${++toastId}`
    const newToast: Toast = {
      ...toast,
      id,
      duration: toast.duration ?? 5000,
    }

    set((state) => ({
      toasts: [...state.toasts, newToast],
    }))

    // Auto-remove after duration
    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        set((state) => ({
          toasts: state.toasts.filter((t) => t.id !== id),
        }))
      }, newToast.duration)
    }
  },

  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    }))
  },

  clearToasts: () => {
    set({ toasts: [] })
  },
}))

// Convenience functions for common toast types
export const toast = {
  success: (title: string, description?: string) => {
    useToastStore.getState().addToast({ title, description, variant: 'success' })
  },
  error: (title: string, description?: string) => {
    useToastStore.getState().addToast({ title, description, variant: 'error' })
  },
  warning: (title: string, description?: string) => {
    useToastStore.getState().addToast({ title, description, variant: 'warning' })
  },
  default: (title: string, description?: string) => {
    useToastStore.getState().addToast({ title, description, variant: 'default' })
  },
  /** Show a rate limit warning toast for an agent */
  rateLimitWarning: (event: RateLimitEvent) => {
    const retryInfo = event.retryAfterMs
      ? `. Retry in ${Math.round(event.retryAfterMs / 1000)}s`
      : ''
    const limitTypeDisplay = event.limitType.replace(/_/g, ' ')

    useToastStore.getState().addToast({
      title: `Rate Limit: ${limitTypeDisplay}`,
      description: `Agent ${event.agentId.slice(0, 8)}... hit rate limit${retryInfo}`,
      variant: 'warning',
      duration: 8000, // Show for 8 seconds since rate limits are important
    })
  },
}
