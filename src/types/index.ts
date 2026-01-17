// Core domain types based on the implementation plan

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

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
  startedAt?: Date
  completedAt?: Date
  branch?: string
  worktreePath?: string
  error?: string
}

export type SessionStatus = 'active' | 'paused' | 'completed' | 'failed'
export type AgentType = 'claude' | 'opencode' | 'cursor'

export interface SessionConfig {
  maxParallel: number
  maxIterations: number
  maxRetries: number
  agentType: AgentType
  autoCreatePRs: boolean
  draftPRs: boolean
  runTests: boolean
  runLint: boolean
}

export interface Session {
  id: string
  name: string
  projectPath: string
  createdAt: Date
  lastResumedAt?: Date
  status: SessionStatus
  config: SessionConfig
  tasks: Task[]
  totalCost: number
  totalTokens: number
}

export type AgentStatus =
  | 'idle'
  | 'thinking'
  | 'reading'
  | 'implementing'
  | 'testing'
  | 'committing'

export interface LogEntry {
  timestamp: Date
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

export interface Agent {
  id: string
  sessionId: string
  taskId: string
  status: AgentStatus
  processId?: number
  worktreePath: string
  branch: string
  iterationCount: number
  tokens: number
  cost: number
  logs: LogEntry[]
  subagents: Agent[] // Nested agent calls
}

// Phase 6: Session Management Types
export interface SessionTemplate {
  id: string
  name: string
  description: string
  config: SessionConfig
  createdAt: Date
}

export interface SessionRecoveryState {
  sessionId: string
  timestamp: Date
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

// Phase 7.5: PRD Management Types

export interface PRDSection {
  id: string
  title: string
  content: string
  required: boolean
}

export interface PRDDocument {
  id: string
  title: string
  description?: string
  templateId?: string
  content: string // JSON string of sections
  qualityScoreCompleteness?: number
  qualityScoreClarity?: number
  qualityScoreActionability?: number
  qualityScoreOverall?: number
  createdAt: string
  updatedAt: string
  version: number
  projectPath?: string
}

export interface PRDTemplate {
  id: string
  name: string
  description?: string
  icon?: string
  systemTemplate: boolean
  templateStructure: string // JSON string
  createdAt: string
  updatedAt: string
}

export type PRDExecutionStatus = 'not_started' | 'in_progress' | 'completed' | 'failed' | 'paused'

export interface PRDExecution {
  id: string
  prdId: string
  sessionId: string
  status: PRDExecutionStatus
  startedAt: string
  completedAt?: string
  totalTasks: number
  completedTasks: number
  failedTasks: number
  config: string // JSON string of ExecutionConfig
}

export interface ExecutionConfig {
  sessionName?: string
  agentType: AgentType
  executionMode: 'sequential' | 'parallel'
  maxParallel: number
  maxIterations: number
  maxRetries: number
  autoCreatePRs: boolean
  draftPRs: boolean
  runTests: boolean
  runLint: boolean
}

export interface PRDQualityScores {
  completeness: number
  clarity: number
  actionability: number
  overall: number
}

export interface CreatePRDRequest {
  title: string
  description?: string
  templateId?: string
  projectPath?: string
}

export interface UpdatePRDRequest {
  id: string
  title?: string
  description?: string
  content?: string
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface RalphConfig {
  execution: RalphExecutionConfig
  git: RalphGitConfig
  validation: RalphValidationConfig
  templates: RalphTemplateConfig
  fallback: RalphFallbackSettings
}

export interface RalphExecutionConfig {
  maxParallel: number
  maxIterations: number
  maxRetries: number
  agentType: string
  strategy: string
}

export interface RalphGitConfig {
  autoCreatePrs: boolean
  draftPrs: boolean
  branchPattern: string
}

export interface RalphValidationConfig {
  runTests: boolean
  runLint: boolean
  testCommand?: string
  lintCommand?: string
}

export interface RalphTemplateConfig {
  defaultTemplate?: string
  templatesDir?: string
}

export interface RalphFallbackSettings {
  enabled: boolean
  baseBackoffMs: number
  maxBackoffMs: number
  fallbackAgent?: string
}

export interface ConfigPaths {
  globalPath?: string
  projectPath?: string
  globalExists: boolean
  projectExists: boolean
}

// ============================================================================
// Template Types
// ============================================================================

export interface TemplateInfo {
  name: string
  source: 'builtin' | 'global' | 'project' | 'custom'
  description: string
}

export interface RenderRequest {
  templateName: string
  taskTitle?: string
  taskDescription?: string
  acceptanceCriteria?: string[]
  dependencies?: string[]
  prdContent?: string
  customVars?: Record<string, string>
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
// Error Strategy Types (for Parallel Scheduler)
// ============================================================================

export type ErrorStrategy =
  | { retry: { maxAttempts: number; backoffMs: number } }
  | { skip: {} }
  | { abort: {} }

export interface FallbackConfig {
  enabled: boolean
  primaryAgent: AgentType
  fallbackChain: AgentType[]
  baseBackoffMs: number
  maxBackoffMs: number
}
