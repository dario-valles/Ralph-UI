// Common types shared across domains

// ============================================================================
// Project Types (Workspace organization)
// ============================================================================

export interface Project {
  id: string
  path: string
  name: string
  lastUsedAt: string
  isFavorite: boolean
  createdAt: string
}

// ============================================================================
// Rate Limiting Types
// ============================================================================

export type RateLimitType =
  | 'http_429'
  | 'rate_limit'
  | 'quota_exceeded'
  | 'overloaded'
  | 'claude_rate_limit'
  | 'openai_rate_limit'
  | 'unknown'

export interface RateLimitEvent {
  agentId: string
  sessionId: string
  limitType: RateLimitType
  retryAfterMs?: number
  matchedPattern?: string
}

// ============================================================================
// Recovery Types
// ============================================================================

export interface StaleLockInfo {
  sessionId: string
  pid: number
  timestamp: string
  version: string
}

export interface RecoveryResult {
  sessionId: string
  tasksUnassigned: number
  success: boolean
  message: string
}

// ============================================================================
// Subagent Trace Types
// ============================================================================

export type SubagentEventType = 'spawned' | 'progress' | 'completed' | 'failed'

export interface SubagentEvent {
  eventType: SubagentEventType
  subagentId: string
  parentAgentId: string
  description: string
  timestamp: string
  depth: number
}

export interface SubagentTree {
  events: SubagentEvent[]
  hierarchy: Record<string, string[]>
  active: string[]
}

export interface SubagentTreeSummary {
  totalEvents: number
  activeSubagents: string[]
  maxDepth: number
  spawnCount: number
  completeCount: number
  failCount: number
}

// ============================================================================
// Tool Call Types (for collapsible tool call display)
// ============================================================================

export type ToolCallStatus = 'running' | 'completed' | 'failed'

export interface ToolCall {
  /** Unique tool call ID (from Claude's tool_use_id) */
  id: string
  /** Agent ID that made the tool call */
  agentId: string
  /** Name of the tool being called */
  toolName: string
  /** Tool input parameters */
  input?: unknown
  /** Tool output/result (may be truncated for large outputs) */
  output?: string
  /** Timestamp when tool call started */
  startedAt: string
  /** Timestamp when tool call completed */
  completedAt?: string
  /** Duration in milliseconds */
  durationMs?: number
  /** Status of the tool call */
  status: ToolCallStatus
}

export interface ToolCallStartedPayload {
  agentId: string
  toolId: string
  toolName: string
  input?: unknown
  timestamp: string
}

export interface ToolCallCompletedPayload {
  agentId: string
  toolId: string
  output?: string
  durationMs?: number
  timestamp: string
  isError: boolean
}

// ============================================================================
// Cross-Device Sync Event Payloads
// ============================================================================

export interface TaskStatusChangedPayload {
  taskId: string
  sessionId: string
  oldStatus: string
  newStatus: string
}

export interface SessionStatusChangedPayload {
  sessionId: string
  oldStatus: string
  newStatus: string
}

export interface AgentStatusChangedPayload {
  agentId: string
  sessionId: string
  oldStatus: string
  newStatus: string
}

export interface AgentCompletedPayload {
  agentId: string
  taskId: string
  sessionId: string
  exitCode?: number
}

export interface AgentFailedPayload {
  agentId: string
  taskId: string
  sessionId: string
  exitCode?: number
  error: string
}
