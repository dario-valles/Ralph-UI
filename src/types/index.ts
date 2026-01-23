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

export type SessionStatus = 'active' | 'paused' | 'completed' | 'failed'
export type AgentType = 'claude' | 'opencode' | 'cursor' | 'codex' | 'qwen' | 'droid'

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
  /** AI-extracted structured items (JSON-serialized ExtractedPRDStructure) */
  extractedStructure?: string
}

/** A PRD file found in the .ralph-ui/prds/ directory */
export interface PRDFile {
  /** Unique identifier derived from filename (e.g., "file:new-feature-prd-abc123") */
  id: string
  /** Title extracted from first # heading or derived from filename */
  title: string
  /** Full markdown content */
  content: string
  /** Path to the project */
  projectPath: string
  /** File path relative to project */
  filePath: string
  /** File modification time as ISO string */
  modifiedAt: string
  /** Whether this PRD has an associated .json file (Ralph Loop initialized) */
  hasRalphJson: boolean
  /** Whether this PRD has a progress file */
  hasProgress: boolean
}

/** Result of deleting a PRD file and its related resources */
export interface DeletePrdResult {
  /** Files that were deleted */
  deletedFiles: string[]
  /** Worktrees that were removed */
  removedWorktrees: string[]
  /** Branches that were deleted */
  deletedBranches: string[]
  /** Any warnings during deletion */
  warnings: string[]
}

/** Result of exporting a PRD chat session */
export interface ExportResult {
  prd: PRDDocument
  /** Session ID if tasks were created (for navigation to Tasks page) */
  sessionId?: string
  /** Number of tasks created from the PRD */
  taskCount: number
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

/** Scheduling strategy - determines task ordering and parallelism */
export type SchedulingStrategy =
  | 'sequential'
  | 'dependency_first'
  | 'priority'
  | 'fifo'
  | 'cost_first'

export interface ExecutionConfig {
  sessionName?: string
  agentType: AgentType
  /** Execution strategy - determines task ordering and parallelism */
  strategy: SchedulingStrategy
  maxParallel: number
  maxIterations: number
  maxRetries: number
  autoCreatePRs: boolean
  draftPRs: boolean
  runTests: boolean
  runLint: boolean
  /** Dry-run mode: preview execution without spawning agents */
  dryRun?: boolean
  /** Model to use for agents (e.g., "anthropic/claude-sonnet-4-5", "claude-sonnet-4-5") */
  model?: string
  /** If true and an active session exists for this project, reuse it instead of creating a new one */
  reuseSession?: boolean
}

/** Result of a dry-run schedule preview */
export interface DryRunResult {
  taskId: string
  taskTitle: string
  agentType: AgentType
  branch: string
  worktreePath: string
  maxIterations: number
  /** Model that would be used (if specified) */
  model?: string
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
  /** Default model to use for agents */
  model?: string
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
  /** Model to use for the fallback agent */
  fallbackModel?: string
  /** Error handling strategy */
  errorStrategy?: RalphErrorStrategy
  /** Ordered list of fallback agents (advanced mode) */
  fallbackChain?: AgentType[]
  /** Whether to test if primary agent has recovered */
  testPrimaryRecovery?: boolean
  /** Test primary recovery every N iterations */
  recoveryTestInterval?: number
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

// Template Preview Types (US-013)
export interface TemplatePreviewResult {
  success: boolean
  output: string | null
  error: string | null
  errorLine: number | null
  variablesUsed: string[]
  variablesUnused: string[]
  sampleContext: SampleContext
}

export interface SampleContext {
  taskTitle: string
  taskDescription: string
  acceptanceCriteria: string[]
  dependencies: string[]
  prdContent: string
  recentProgress: string
  codebasePatterns: string
  prdCompletedCount: number
  prdTotalCount: number
  selectionReason: string
  currentDate: string
  timestamp: string
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
// Error Strategy Types (for Ralph Loop & Parallel Scheduler)
// ============================================================================

/** Error handling strategy for Ralph Loop iterations */
export type RalphErrorStrategy =
  | { type: 'retry'; max_attempts: number; backoff_ms: number }
  | { type: 'skip' }
  | { type: 'abort' }

/** Outcome of a single Ralph Loop iteration */
export type IterationOutcome = 'success' | 'failed' | 'skipped' | 'interrupted'

/** Extended fallback configuration with chain support */
export interface FallbackChainConfig {
  /** Ordered list of agents to try (first is primary) */
  fallbackChain: AgentType[]
  /** Whether to test if primary agent has recovered */
  testPrimaryRecovery: boolean
  /** Test primary recovery every N iterations */
  recoveryTestInterval: number
  /** Base backoff time in ms */
  baseBackoffMs: number
  /** Maximum backoff time in ms */
  maxBackoffMs: number
  /** Whether fallback is enabled */
  enabled: boolean
}

/** Record of a single iteration stored in the database */
export interface IterationRecord {
  id: string
  executionId: string
  iteration: number
  outcome: IterationOutcome
  durationSecs: number
  agentType: string
  rateLimitEncountered: boolean
  errorMessage?: string
  startedAt: string
  completedAt?: string
}

/** Execution state snapshot for crash recovery */
export interface ExecutionStateSnapshot {
  executionId: string
  state: string
  lastHeartbeat: string
}

/** Iteration statistics summary */
export interface IterationStats {
  total: number
  successful: number
  failed: number
  skipped: number
  interrupted: number
  rateLimited: number
  totalDurationSecs: number
}

// Legacy error strategy types (for backward compatibility)
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

// ============================================================================
// Chat Attachment Types
// ============================================================================

/** Supported MIME types for chat attachments */
export type AttachmentMimeType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

/** An image attachment in a chat message */
export interface ChatAttachment {
  /** Unique identifier for the attachment */
  id: string
  /** MIME type of the attachment */
  mimeType: AttachmentMimeType
  /** Base64-encoded data (without data URL prefix) */
  data: string
  /** Original filename (optional) */
  filename?: string
  /** Size in bytes */
  size: number
  /** Image width in pixels (optional) */
  width?: number
  /** Image height in pixels (optional) */
  height?: number
}

/** Validation constants for attachments */
export const ATTACHMENT_LIMITS = {
  /** Maximum file size per attachment (10 MB) */
  MAX_SIZE: 10 * 1024 * 1024,
  /** Maximum number of attachments per message */
  MAX_COUNT: 5,
  /** Supported MIME types */
  SUPPORTED_TYPES: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const,
} as const

export interface ChatMessage {
  id: string
  sessionId: string
  role: ChatMessageRole
  content: string
  createdAt: string
  metadata?: Record<string, unknown>
  /** Optional image attachments for this message */
  attachments?: ChatAttachment[]
}

export type PRDTypeValue =
  | 'new_feature'
  | 'bug_fix'
  | 'refactoring'
  | 'api_integration'
  | 'general'
  | 'full_new_app'

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
  /** Whether structured output mode is enabled */
  structuredMode: boolean
  /** Extracted PRD structure (JSON string) */
  extractedStructure?: string
  /** Whether GSD (Get Stuff Done) workflow mode is enabled */
  gsdMode?: boolean
  /** GSD workflow state (JSON-serialized GsdWorkflowState) */
  gsdState?: string
  createdAt: string
  updatedAt: string
  messageCount?: number
  /**
   * ISO timestamp when a pending operation (agent execution) started.
   * Used to restore "thinking" state after page reload.
   */
  pendingOperationStartedAt?: string
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
// Terminal Types (re-exported from terminal.ts)
// ============================================================================

export type {
  TerminalInstance,
  TerminalPane,
  TerminalPanelMode,
  TerminalState,
  SplitDirection,
  SpawnOptions,
} from './terminal'

// ============================================================================
// Ralph Wiggum Loop Types
// ============================================================================

/** A story/task in the Ralph PRD */
export interface RalphStory {
  id: string
  title: string
  description?: string
  /** Acceptance criteria that must be met */
  acceptance: string
  /** Whether this story passes all acceptance criteria */
  passes: boolean
  /** Priority level (lower = higher priority) */
  priority: number
  /** Dependencies on other story IDs */
  dependencies: string[]
  /** Tags for categorization */
  tags: string[]
  /** Estimated effort (S/M/L/XL) */
  effort?: string
}

/** PRD metadata */
export interface RalphPrdMetadata {
  createdAt?: string
  updatedAt?: string
  sourceChatId?: string
  totalIterations: number
  lastExecutionId?: string
  lastWorktreePath?: string
}

/** The PRD document stored in .ralph/prd.json */
export interface RalphPrd {
  title: string
  description?: string
  branch: string
  stories: RalphStory[]
  metadata?: RalphPrdMetadata
}

/** Status summary for a PRD */
export interface RalphPrdStatus {
  total: number
  passed: number
  failed: number
  allPass: boolean
  progressPercent: number
  incompleteStoryIds: string[]
  nextStoryId?: string
}

/** State of a running Ralph loop */
export type RalphLoopState =
  | { type: 'idle' }
  | { type: 'running'; iteration: number }
  | { type: 'retrying'; iteration: number; attempt: number; reason: string; delayMs: number }
  | { type: 'paused'; iteration: number; reason: string }
  | { type: 'completed'; totalIterations: number }
  | { type: 'failed'; iteration: number; reason: string }
  | { type: 'cancelled'; iteration: number }

/** Metrics for a single iteration */
export interface RalphIterationMetrics {
  iteration: number
  tokens: number
  inputTokens: number
  outputTokens: number
  cost: number
  durationSecs: number
  storyId?: string
  storyCompleted: boolean
  exitCode: number
  retryAttempts: number
  wasRetried: boolean
}

/** Cumulative metrics for an entire Ralph loop execution */
export interface RalphLoopMetrics {
  totalIterations: number
  totalTokens: number
  totalCost: number
  totalDurationSecs: number
  storiesCompleted: number
  storiesRemaining: number
  iterations: RalphIterationMetrics[]
}

/** Consolidated snapshot for efficient polling
 * Combines multiple data sources in a single IPC call
 */
export interface RalphLoopSnapshot {
  state: RalphLoopState | null
  metrics: RalphLoopMetrics | null
  currentAgentId: string | null
  worktreePath: string | null
  iterationHistory: IterationRecord[]
}

/** Status update event during Ralph loop execution */
export interface RalphLoopStatusEvent {
  executionId: string
  state: RalphLoopState
  prdStatus?: RalphPrdStatus
  iterationMetrics?: RalphIterationMetrics
  timestamp: string
  /** Current agent ID for terminal connection */
  currentAgentId?: string
  /** Worktree path if using worktree isolation */
  worktreePath?: string
  /** Branch name for this execution */
  branch?: string
}

/** Payload for Ralph loop completion events (when all stories pass) */
export interface RalphLoopCompletedPayload {
  /** Execution ID */
  executionId: string
  /** PRD name (session name) */
  prdName: string
  /** Total iterations taken to complete */
  totalIterations: number
  /** Total stories completed */
  completedStories: number
  /** Total stories in PRD */
  totalStories: number
  /** Total duration in seconds */
  durationSecs: number
  /** Total cost in dollars */
  totalCost: number
  /** Timestamp of completion */
  timestamp: string
}

/** Type of error that occurred in the Ralph Loop */
export type RalphLoopErrorType =
  | 'agent_crash'
  | 'parse_error'
  | 'git_conflict'
  | 'rate_limit'
  | 'max_iterations'
  | 'max_cost'
  | 'timeout'
  | 'unknown'

/** Payload for Ralph loop error events */
export interface RalphLoopErrorPayload {
  /** Execution ID */
  executionId: string
  /** PRD name (session name) */
  prdName: string
  /** Type of error */
  errorType: RalphLoopErrorType
  /** Error message (truncated to 200 chars for notification) */
  message: string
  /** Current iteration when error occurred */
  iteration: number
  /** Timestamp of error */
  timestamp: string
  /** Number of stories remaining (for max_iterations error) */
  storiesRemaining?: number
  /** Total number of stories (for max_iterations error) */
  totalStories?: number
}

/** Progress entry type */
export type RalphProgressEntryType =
  | 'iteration_start'
  | 'iteration_end'
  | 'learning'
  | 'error'
  | 'story_completed'
  | 'note'

/** A single entry in progress.txt */
export interface RalphProgressEntry {
  iteration: number
  timestamp: string
  entryType: RalphProgressEntryType
  content: string
}

/** Summary of progress.txt */
export interface RalphProgressSummary {
  totalEntries: number
  totalIterations: number
  learningsCount: number
  errorsCount: number
  storiesCompleted: number
}

/** Information about Ralph loop files */
export interface RalphFiles {
  hasPrd: boolean
  hasProgress: boolean
  hasPrompt: boolean
  hasConfig: boolean
  prdPath: string
  progressPath: string
  promptPath: string
  configPath: string
  /** Names of PRD files found in .ralph-ui/prds/ */
  prdNames: string[]
}

/** Project-specific configuration */
export interface RalphProjectConfig {
  name?: string
  testCommand?: string
  lintCommand?: string
  buildCommand?: string
}

/** Loop-specific configuration */
export interface RalphLoopConfig {
  maxIterations: number
  completionPromise: string
  agent: string
  model?: string
  maxCost?: number
}

/** Ralph configuration from .ralph/config.yaml */
export interface RalphConfig {
  project: RalphProjectConfig
  ralph: RalphLoopConfig
}

/** Request to initialize a Ralph PRD */
export interface InitRalphPrdRequest {
  projectPath: string
  title: string
  description?: string
  branch: string
  stories: RalphStoryInput[]
}

/** Input for creating a Ralph story */
export interface RalphStoryInput {
  id: string
  title: string
  description?: string
  acceptance: string
  priority?: number
  dependencies?: string[]
  tags?: string[]
  effort?: string
}

/** Request to start a Ralph loop */
export interface StartRalphLoopRequest {
  projectPath: string
  agentType: string
  model?: string
  maxIterations?: number
  runTests?: boolean
  runLint?: boolean
  branch?: string
  completionPromise?: string
  maxCost?: number
  /** Whether to use a worktree for isolation (default: true) */
  useWorktree?: boolean
  /** Agent timeout in seconds (default: 1800 = 30 minutes, 0 = no timeout) */
  agentTimeoutSecs?: number
  /**
   * PRD name for multi-PRD support (e.g., "my-feature-a1b2c3d4")
   *
   * When set, PRD files are stored in `.ralph-ui/prds/{prdName}.json`.
   * When undefined, the legacy `.ralph/prd.json` path is used.
   */
  prdName?: string
}

/** Request to convert a database PRD to Ralph format */
export interface ConvertPrdToRalphRequest {
  prdId: string
  branch: string
  agentType?: string
  model?: string
  maxIterations?: number
  maxCost?: number
  runTests?: boolean
  runLint?: boolean
  /** Whether to use a worktree for isolation (default: true) */
  useWorktree?: boolean
}

/** Information about a Ralph worktree */
export interface RalphWorktreeInfo {
  name: string
  path: string
  branch?: string
  isLocked: boolean
}

// ============================================================================
// GSD (Get Stuff Done) Types - Re-export from dedicated files
// ============================================================================

export type {
  GsdPhase,
  GsdPhaseInfo,
  QuestioningContext,
  AgentResearchStatus,
  ResearchStatus,
  GsdDecision,
  GsdWorkflowState,
  ResearchResult,
  ResearchSynthesis,
  GsdConfig,
  PlanningSessionInfo,
} from './gsd'

export {
  GSD_PHASES,
  getPhaseInfo,
  getNextPhase,
  getPreviousPhase,
  isQuestioningComplete,
  getMissingContextItems,
  isResearchComplete,
  getResearchCompletionPercentage,
  getWorkflowCompletionPercentage,
} from './gsd'

export type {
  RequirementCategory,
  ScopeLevel,
  Requirement,
  RequirementsDoc,
  ScopeSelection,
  RoadmapPhase,
  RoadmapDoc,
  IssueSeverity,
  VerificationIssue,
  VerificationWarning,
  VerificationStats,
  VerificationResult,
  ConversionOptions,
  SkippedRequirement,
  ConversionResult,
  PrdExecutionConfig,
} from './planning'

export {
  REQUIREMENT_CATEGORIES,
  SCOPE_LEVELS,
  getRequirementsByScope,
  getRequirementsByCategory,
  countRequirementsByScope,
  getUnscopedRequirements,
  parseReqId,
  getCategoryFromReqId,
  hasAnyExecutionConfigFields,
  validateExecutionConfig,
} from './planning'
