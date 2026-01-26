import '@testing-library/jest-dom'
import { toHaveNoViolations } from 'jest-axe'
import { expect, vi } from 'vitest'

// Extend Vitest's expect with jest-axe matchers
expect.extend(toHaveNoViolations)

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

// Default viewport width for tests (desktop)
let currentViewportWidth = 1024

/**
 * Set the viewport width for responsive design testing.
 * Call this before rendering components to test different breakpoints.
 *
 * Common breakpoints:
 * - 320: Small mobile
 * - 375: iPhone SE/standard mobile
 * - 768: Tablet
 * - 1024: Desktop (default)
 * - 1280: Large desktop
 *
 * @example
 * ```ts
 * import { setViewport } from '@/test/setup'
 *
 * beforeEach(() => {
 *   setViewport(375) // Test mobile
 * })
 *
 * afterEach(() => {
 *   setViewport(1024) // Reset to desktop
 * })
 * ```
 */
export const setViewport = (width: number) => {
  currentViewportWidth = width
  // Re-apply the matchMedia mock with new width
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => {
      // Parse min-width and max-width queries
      const minWidthMatch = query.match(/\(min-width:\s*(\d+)px\)/)
      const maxWidthMatch = query.match(/\(max-width:\s*(\d+)px\)/)

      let matches = false
      if (minWidthMatch) {
        matches = currentViewportWidth >= parseInt(minWidthMatch[1], 10)
      } else if (maxWidthMatch) {
        matches = currentViewportWidth <= parseInt(maxWidthMatch[1], 10)
      }

      return {
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }
    }),
  })
}

/**
 * Reset viewport to desktop default (1024px)
 */
export const resetViewport = () => {
  setViewport(1024)
}

// Initialize with desktop viewport
setViewport(1024)
