/**
 * Shared test utilities for store tests.
 * Provides mock data factories and common setup patterns.
 */

import type { Session, SessionStatus, Task, TaskStatus } from '@/types'
import type { Agent, AgentStatus, LogEntry } from '@/lib/agent-api'

// ============================================================================
// Mock Session Factory
// ============================================================================

export function createMockSession(overrides?: Partial<Session>): Session {
  return {
    id: 'session-1',
    name: 'Test Session',
    projectPath: '/test/path',
    createdAt: '2026-01-17T10:00:00Z',
    lastResumedAt: undefined,
    status: 'active' as SessionStatus,
    config: {
      maxParallel: 3,
      maxIterations: 10,
      maxRetries: 3,
      agentType: 'claude',
      autoCreatePRs: true,
      draftPRs: false,
      runTests: true,
      runLint: true,
    },
    tasks: [],
    totalCost: 0,
    totalTokens: 0,
    ...overrides,
  }
}

// ============================================================================
// Mock Task Factory
// ============================================================================

export function createMockTask(overrides?: Partial<Task>): Task {
  return {
    id: 'task-1',
    title: 'Test Task',
    description: 'Test task description',
    status: 'pending' as TaskStatus,
    priority: 1,
    dependencies: [],
    assignedAgent: undefined,
    estimatedTokens: 1000,
    actualTokens: 0,
    startedAt: undefined,
    completedAt: undefined,
    branch: undefined,
    worktreePath: undefined,
    error: undefined,
    ...overrides,
  }
}

// ============================================================================
// Mock Agent Factory
// ============================================================================

export function createMockAgent(overrides?: Partial<Agent>): Agent {
  return {
    id: 'agent-1',
    sessionId: 'session-1',
    taskId: 'task-1',
    status: 'idle' as AgentStatus,
    processId: 12345,
    worktreePath: '/path/to/worktree',
    branch: 'feature/test',
    iterationCount: 0,
    tokens: 0,
    cost: 0,
    logs: [],
    subagents: [],
    ...overrides,
  }
}

// ============================================================================
// Mock Log Entry Factory
// ============================================================================

export function createMockLogEntry(overrides?: Partial<LogEntry>): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'Test log message',
    ...overrides,
  }
}

// ============================================================================
// Store Reset Helpers
// ============================================================================

/**
 * Reset a store to its initial state.
 * Usage: resetStore(useSessionStore, { sessions: [], currentSession: null, loading: false, error: null })
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
 * Initial state for session store.
 */
export const SESSION_STORE_INITIAL_STATE = {
  sessions: [],
  currentSession: null,
  ...INITIAL_ASYNC_STATE,
}

/**
 * Initial state for task store.
 */
export const TASK_STORE_INITIAL_STATE = {
  tasks: [],
  currentTask: null,
  ...INITIAL_ASYNC_STATE,
}

/**
 * Initial state for agent store.
 */
export const AGENT_STORE_INITIAL_STATE = {
  agents: [],
  activeAgents: [],
  currentAgent: null,
  agentLogs: {},
  ...INITIAL_ASYNC_STATE,
}

/**
 * Initial state for PRD store.
 */
export const PRD_STORE_INITIAL_STATE = {
  prds: [],
  currentPRD: null,
  templates: [],
  ...INITIAL_ASYNC_STATE,
}

// ============================================================================
// Mock API Factories
// ============================================================================

/**
 * Creates a mock session API with all methods mocked.
 * Use with vi.mock('@/lib/tauri-api', () => ({ sessionApi: createMockSessionApi() }))
 */
export function createMockSessionApi() {
  return {
    create: vi.fn(),
    getAll: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    updateStatus: vi.fn(),
  }
}

/**
 * Creates a mock task API with all methods mocked.
 */
export function createMockTaskApi() {
  return {
    create: vi.fn(),
    getBySession: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    updateStatus: vi.fn(),
    delete: vi.fn(),
    bulkCreate: vi.fn(),
    reorderTasks: vi.fn(),
  }
}

/**
 * Creates a mock agent API with all methods mocked.
 */
export function createMockAgentApi() {
  return {
    spawn: vi.fn(),
    getBySession: vi.fn(),
    getById: vi.fn(),
    getActiveForSession: vi.fn(),
    updateStatus: vi.fn(),
    getLogs: vi.fn(),
    stop: vi.fn(),
    restart: vi.fn(),
    cleanup: vi.fn(),
  }
}

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

// ============================================================================
// Test Assertion Helpers
// ============================================================================

/**
 * Assert that a store is in loading state.
 */
export function expectLoading<T extends { loading: boolean; error: string | null }>(
  store: { getState: () => T }
): void {
  const state = store.getState()
  expect(state.loading).toBe(true)
  expect(state.error).toBeNull()
}

/**
 * Assert that a store has completed loading successfully.
 */
export function expectSuccess<T extends { loading: boolean; error: string | null }>(
  store: { getState: () => T }
): void {
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

// Import vi from vitest for mock creation
import { vi, expect } from 'vitest'
