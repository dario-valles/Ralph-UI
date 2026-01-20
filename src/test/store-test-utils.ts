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
