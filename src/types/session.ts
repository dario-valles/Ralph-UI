// Session and task types

import type { AgentType } from './agent'

// ============================================================================
// Task Types
// ============================================================================

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

// Error categories for task failures
export type ErrorCategory =
  | 'test_failure' // Test assertions failed
  | 'lint_error' // Linting/formatting errors
  | 'build_error' // Compilation/build failures
  | 'timeout' // Task exceeded time limit
  | 'crash' // Process crash or unexpected termination
  | 'rate_limit' // API rate limiting
  | 'conflict' // Git merge conflicts
  | 'dependency' // Missing or incompatible dependencies
  | 'unknown' // Uncategorized errors

export interface CategorizedError {
  category: ErrorCategory
  message: string
  details?: string
  file?: string
  line?: number
  suggestedFix?: string
}

export interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: number
  dependencies: string[] // Task IDs
  assignedAgent?: string
  estimatedTokens?: number
  actualTokens?: number
  startedAt?: string // RFC3339 timestamp from backend
  completedAt?: string // RFC3339 timestamp from backend
  branch?: string
  worktreePath?: string
  error?: string
}

// ============================================================================
// Session Types
// ============================================================================

export type SessionStatus = 'active' | 'paused' | 'completed' | 'failed'

export interface SessionConfig {
  maxParallel: number
  maxIterations: number
  maxRetries: number
  agentType: AgentType
  /** API provider for Claude agent (e.g., "anthropic", "zai", "minimax"). Only applies to Claude. */
  providerId?: string
  autoCreatePRs: boolean
  draftPRs: boolean
  runTests: boolean
  runLint: boolean
}

export interface Session {
  id: string
  name: string
  projectPath: string
  createdAt: string // RFC3339 timestamp from backend
  lastResumedAt?: string // RFC3339 timestamp from backend
  status: SessionStatus
  config: SessionConfig
  tasks: Task[]
  totalCost: number
  totalTokens: number
}

/**
 * Lightweight session index entry for efficient session listings.
 * Use this for list views where full task details aren't needed.
 * Matches Rust's SessionIndexEntry in server/src/file_storage/index.rs
 */
export interface SessionIndexEntry {
  id: string
  name: string
  /** Session status as lowercase string (e.g., "active", "paused", "completed") */
  status: string
  /** Last update timestamp (RFC3339) */
  updatedAt: string
  /** Total number of tasks in the session */
  taskCount: number
  /** Number of completed tasks */
  completedTaskCount: number
}

// ============================================================================
// Session Management Types
// ============================================================================

export interface SessionTemplate {
  id: string
  name: string
  description: string
  config: SessionConfig
  createdAt: string // RFC3339 timestamp from backend
}

export interface SessionRecoveryState {
  sessionId: string
  timestamp: string // RFC3339 timestamp from backend
  activeTasks: string[]
  activeAgents: string[]
}

export interface SessionComparison {
  session1Id: string
  session2Id: string
  session1Name: string
  session2Name: string
  tasksCompletedDiff: number
  totalCostDiff: number
  totalTokensDiff: number
  configDifferences: string[]
  performanceSummary: string
}

export interface SessionAnalytics {
  sessionId: string
  totalTasks: number
  completedTasks: number
  failedTasks: number
  inProgressTasks: number
  completionRate: number
  averageCostPerTask: number
  averageTokensPerTask: number
  totalDurationHours: number
}
