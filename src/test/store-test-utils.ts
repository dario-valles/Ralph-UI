/**
 * Shared test utilities for store tests.
 * Provides mock data factories and common setup patterns.
 */

import { vi, expect } from 'vitest'

// ============================================================================
// Store Reset Helpers
// ============================================================================

/**
 * Reset a store to its initial state.
 * Usage: resetStore(useProjectStore, { projects: [], activeProject: null, loading: false, error: null })
 */
export function resetStore<T extends object>(
  store: { getState: () => T },
  initialState: Partial<T>
): void {
  const state = store.getState()
  Object.assign(state, initialState)
}

// ============================================================================
// Common Initial States
// ============================================================================

/**
 * Common initial state for stores with loading/error pattern.
 * Extend this with store-specific fields.
 */
export const INITIAL_ASYNC_STATE = {
  loading: false,
  error: null,
} as const

/**
 * Initial state for PRD store.
 */
export const PRD_STORE_INITIAL_STATE = {
  prds: [],
  currentPRD: null,
  templates: [],
  ...INITIAL_ASYNC_STATE,
}

/**
 * Initial state for project store.
 */
export const PROJECT_STORE_INITIAL_STATE = {
  projects: [],
  activeProject: null,
  recentProjects: [],
  favoriteProjects: [],
  ...INITIAL_ASYNC_STATE,
}

// ============================================================================
// Mock API Factories
// ============================================================================

/**
 * Creates a mock PRD API with all methods mocked.
 */
export function createMockPrdApi() {
  return {
    create: vi.fn(),
    list: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    listTemplates: vi.fn(),
    analyzeQuality: vi.fn(),
    execute: vi.fn(),
  }
}

/**
 * Creates a mock project API with all methods mocked.
 */
export function createMockProjectApi() {
  return {
    register: vi.fn(),
    getById: vi.fn(),
    getByPath: vi.fn(),
    getAll: vi.fn(),
    getRecent: vi.fn(),
    getFavorites: vi.fn(),
    updateName: vi.fn(),
    toggleFavorite: vi.fn(),
    setFavorite: vi.fn(),
    touch: vi.fn(),
    delete: vi.fn(),
  }
}

/**
 * Creates a mock Ralph Loop API with all methods mocked.
 */
export function createMockRalphLoopApi() {
  return {
    initPrd: vi.fn(),
    getPrd: vi.fn(),
    getPrdStatus: vi.fn(),
    markStoryPassing: vi.fn(),
    markStoryFailing: vi.fn(),
    addStory: vi.fn(),
    removeStory: vi.fn(),
    getProgress: vi.fn(),
    getProgressSummary: vi.fn(),
    addProgressNote: vi.fn(),
    clearProgress: vi.fn(),
    getPrompt: vi.fn(),
    setPrompt: vi.fn(),
    startLoop: vi.fn(),
    stopLoop: vi.fn(),
    getLoopState: vi.fn(),
    getLoopMetrics: vi.fn(),
    listExecutions: vi.fn(),
    getCurrentAgentId: vi.fn(),
    getWorktreePath: vi.fn(),
    cleanupWorktree: vi.fn(),
    listWorktrees: vi.fn(),
    hasRalphFiles: vi.fn(),
    getRalphFiles: vi.fn(),
    getConfig: vi.fn(),
    setConfig: vi.fn(),
    initConfig: vi.fn(),
    updateConfig: vi.fn(),
    getIterationHistory: vi.fn(),
    getIterationStats: vi.fn(),
    getAllIterations: vi.fn(),
    checkStaleExecutions: vi.fn(),
    recoverStaleIterations: vi.fn(),
    deleteIterationHistory: vi.fn(),
    getSnapshot: vi.fn(),
    cleanupIterationHistory: vi.fn(),
  }
}

// ============================================================================
// Test Assertion Helpers
// ============================================================================

/**
 * Assert that a store is in loading state.
 */
export function expectLoading<T extends { loading: boolean; error: string | null }>(store: {
  getState: () => T
}): void {
  const state = store.getState()
  expect(state.loading).toBe(true)
  expect(state.error).toBeNull()
}

/**
 * Assert that a store has completed loading successfully.
 */
export function expectSuccess<T extends { loading: boolean; error: string | null }>(store: {
  getState: () => T
}): void {
  const state = store.getState()
  expect(state.loading).toBe(false)
  expect(state.error).toBeNull()
}

/**
 * Assert that a store has an error.
 */
export function expectError<T extends { loading: boolean; error: string | null }>(
  store: { getState: () => T },
  errorMessage?: string
): void {
  const state = store.getState()
  expect(state.loading).toBe(false)
  if (errorMessage) {
    expect(state.error).toContain(errorMessage)
  } else {
    expect(state.error).not.toBeNull()
  }
}
