import '@testing-library/jest-dom'
import { toHaveNoViolations } from 'jest-axe'
import { expect, vi } from 'vitest'

// Extend Vitest's expect with jest-axe matchers
expect.extend(toHaveNoViolations)

// Mock __TAURI_INTERNALS__ to make isTauri checks pass in tests
Object.defineProperty(globalThis, '__TAURI_INTERNALS__', {
  value: {},
  writable: true,
  configurable: true,
})
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__TAURI_INTERNALS__', {
    value: {},
    writable: true,
    configurable: true,
  })
}

// Mock ResizeObserver for Radix UI components
class ResizeObserverMock {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
globalThis.ResizeObserver = ResizeObserverMock

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key]
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {}
  }),
  get length() {
    return Object.keys(localStorageMock.store).length
  },
  key: vi.fn((index: number) => Object.keys(localStorageMock.store)[index] ?? null),
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
})
