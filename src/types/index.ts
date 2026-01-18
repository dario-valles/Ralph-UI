// Core domain types based on the implementation plan

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
// Task Types
// ============================================================================

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
  startedAt?: string // RFC3339 timestamp from backend
  completedAt?: string // RFC3339 timestamp from backend
  branch?: string
  worktreePath?: string
  error?: string
}

export type SessionStatus = 'active' | 'paused' | 'completed' | 'failed'
export type AgentType = 'claude' | 'opencode' | 'cursor' | 'codex'

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
  createdAt: string // RFC3339 timestamp from backend
  lastResumedAt?: string // RFC3339 timestamp from backend
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
  timestamp: string // RFC3339 timestamp from backend
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
  /** ID of the chat session this PRD was created from (if any) */
  sourceChatSessionId?: string
  /** Type of PRD (new_feature, bug_fix, refactoring, api_integration, general) */
  prdType?: PRDTypeValue
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
  /** Dry-run mode: preview execution without spawning agents */
  dryRun?: boolean
}

/** Result of a dry-run schedule preview */
export interface DryRunResult {
  taskId: string
  taskTitle: string
  agentType: AgentType
  branch: string
  worktreePath: string
  maxIterations: number
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
  prdType?: PRDTypeValue
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
  | { skip: Record<string, never> }
  | { abort: Record<string, never> }

export interface FallbackConfig {
  enabled: boolean
  primaryAgent: AgentType
  fallbackChain: AgentType[]
  baseBackoffMs: number
  maxBackoffMs: number
}

// ============================================================================
// PRD Chat Types
// ============================================================================

export type ChatMessageRole = 'user' | 'assistant' | 'system'

export interface ChatMessage {
  id: string
  sessionId: string
  role: ChatMessageRole
  content: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export type PRDTypeValue = 'new_feature' | 'bug_fix' | 'refactoring' | 'api_integration' | 'general'

export interface ChatSession {
  id: string
  agentType: string
  projectPath?: string
  prdId?: string
  title?: string
  /** Type of PRD being created */
  prdType?: PRDTypeValue
  /** Whether guided interview mode is enabled */
  guidedMode: boolean
  /** Latest quality score (0-100) */
  qualityScore?: number
  /** Template ID if using a template */
  templateId?: string
  createdAt: string
  updatedAt: string
  messageCount?: number
}

export interface SendMessageResponse {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

// ============================================================================
// Quality Assessment Types
// ============================================================================

export interface QualityAssessment {
  /** Completeness score (0-100) */
  completeness: number
  /** Clarity score (0-100) */
  clarity: number
  /** Actionability score (0-100) */
  actionability: number
  /** Overall quality score (0-100) */
  overall: number
  /** List of missing sections that need to be filled */
  missingSections: string[]
  /** Suggestions for improving the PRD */
  suggestions: string[]
  /** Whether the PRD is ready for export */
  readyForExport: boolean
}

// ============================================================================
// Guided Questions Types
// ============================================================================

export type QuestionType = 'multiple_choice' | 'free_text' | 'confirmation'

export interface GuidedQuestion {
  id: string
  question: string
  questionType: QuestionType
  options?: string[]
  required: boolean
  hint?: string
}

// ============================================================================
// Extracted PRD Content Types
// ============================================================================

export interface ExtractedPRDContent {
  overview: string
  userStories: string[]
  functionalRequirements: string[]
  nonFunctionalRequirements: string[]
  technicalConstraints: string[]
  successMetrics: string[]
  tasks: string[]
  acceptanceCriteria: string[]
  outOfScope: string[]
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
