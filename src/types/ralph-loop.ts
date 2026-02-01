// Ralph Wiggum Loop types

import type { AgentType } from './agent'
import type { IterationRecord } from './config'

// ============================================================================
// Ralph PRD Types
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

// ============================================================================
// Ralph Loop State Types
// ============================================================================

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

/** Status of a parallel agent (for parallel execution mode) */
export interface ParallelAgentStatus {
  /** Agent ID */
  agentId: string
  /** Story ID being worked on */
  storyId: string
  /** Story title */
  storyTitle: string
  /** Agent status */
  status: 'running' | 'completed' | 'failed' | 'merging'
  /** Worktree path for this agent */
  worktreePath: string
  /** Branch name */
  branchName: string
  /** Start time */
  startTime: string
  /** End time (if completed) */
  endTime?: string
  /** Error message (if failed) */
  error?: string
}

/** Extended snapshot for parallel execution */
export interface RalphLoopParallelSnapshot extends RalphLoopSnapshot {
  /** Parallel execution mode enabled */
  parallelMode: boolean
  /** Maximum parallel agents configured */
  maxParallel?: number
  /** Status of all active parallel agents */
  activeAgents: ParallelAgentStatus[]
  /** Merge queue - stories waiting to be merged */
  mergeQueue: string[]
  /** Conflicts detected during merge */
  conflicts: MergeConflict[]
}

/** Information about a merge conflict */
export interface MergeConflict {
  /** Story ID that caused the conflict */
  storyId: string
  /** Branch that conflicted */
  branchName: string
  /** Files with conflicts */
  conflictingFiles: string[]
  /** Timestamp of conflict detection */
  detectedAt: string
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

// ============================================================================
// Progress Types
// ============================================================================

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

// ============================================================================
// Ralph Files and Config Types
// ============================================================================

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

/** Ralph configuration from .ralph/config.yaml (for loop execution) */
export interface RalphYamlConfig {
  project: RalphProjectConfig
  ralph: RalphLoopConfig
}

// ============================================================================
// Request Types
// ============================================================================

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

/** Execution mode for Ralph Loop */
export type RalphExecutionMode = 'sequential' | 'parallel'

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
  /** Template name to use for prompt generation */
  templateName?: string
  /** Custom test command (e.g., "npm test", "cargo test") */
  testCommand?: string
  /** Custom lint command (e.g., "npm run lint", "cargo clippy") */
  lintCommand?: string
  /** Execution mode: sequential (default) or parallel (Beta) */
  executionMode?: RalphExecutionMode
  /** Maximum parallel agents when using parallel execution mode (default: 3) */
  maxParallel?: number
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
// Multi-Agent Assignment Types (US-2.2: Avoid File Conflicts)
// ============================================================================

/** Assignment status for multi-agent coordination */
export type AssignmentStatus = 'active' | 'completed' | 'failed' | 'released'

/** An assignment of a story to an agent */
export interface Assignment {
  id: string
  agentId: string
  agentType: AgentType
  storyId: string
  status: AssignmentStatus
  estimatedFiles: string[]
  iterationStart?: number
  iterationEnd?: number
  errorMessage?: string
  assignedAt: string
  updatedAt?: string
}

/** The complete assignments file structure (US-2.3: View Parallel Progress) */
export interface AssignmentsFile {
  assignments: Assignment[]
  createdAt: string
  lastUpdated: string
  currentIteration: number
  executionId?: string
}

/** A file currently in use by an agent */
export interface FileInUse {
  path: string
  agentId: string
  agentType: AgentType
  storyId: string
}

/** A potential file conflict between agents */
export interface FileConflict {
  path: string
  conflictingAgentId: string
  conflictingAgentType: AgentType
  conflictingStoryId: string
}

/** Type of assignment change event */
export type AssignmentChangeType = 'created' | 'completed' | 'failed' | 'released' | 'files_updated'

/** Payload for assignment changed events */
export interface AssignmentChangedPayload {
  changeType: AssignmentChangeType
  agentId: string
  agentType: string
  storyId: string
  prdName: string
  estimatedFiles: string[]
  timestamp: string
}

/** Payload for file conflict detection events */
export interface FileConflictDetectedPayload {
  conflictingFiles: FileConflictInfo[]
  prdName: string
  timestamp: string
}

/** Information about a single file conflict */
export interface FileConflictInfo {
  path: string
  agents: AgentFileUse[]
}

/** Information about an agent using a file */
export interface AgentFileUse {
  agentId: string
  agentType: string
  storyId: string
}

// ============================================================================
// Learnings Types (US-3.3: Manual Learning Entry)
// ============================================================================

/** Type/category of a learning */
export type LearningType = 'architecture' | 'gotcha' | 'pattern' | 'testing' | 'tooling' | 'general'

/** A single learning entry */
export interface LearningEntry {
  /** Unique identifier */
  id: string
  /** Which iteration this learning was discovered in */
  iteration: number
  /** Type/category of the learning */
  learningType: LearningType
  /** The learning content (description) */
  content: string
  /** Associated story ID (if any) */
  storyId?: string
  /** Optional code example */
  codeExample?: string
  /** When this learning was recorded */
  timestamp: string
  /** Source of this learning (agent or human) */
  source: string
}

/** The complete learnings file structure */
export interface LearningsFile {
  /** List of all learnings */
  entries: LearningEntry[]
  /** When this file was created */
  createdAt: string
  /** When this file was last updated */
  lastUpdated: string
  /** Total iterations that have contributed learnings */
  totalIterations: number
}

/** Input for adding a manual learning */
export interface AddLearningInput {
  /** Type/category of the learning */
  learningType: string
  /** The learning content (description) */
  content: string
  /** Optional code example */
  codeExample?: string
  /** Optional associated story ID */
  storyId?: string
}

/** Input for updating an existing learning */
export interface UpdateLearningInput {
  /** ID of the learning to update */
  id: string
  /** Updated type/category (optional) */
  learningType?: string
  /** Updated content (optional) */
  content?: string
  /** Updated code example (optional, empty string to remove) */
  codeExample?: string
  /** Updated story ID (optional, empty string to remove) */
  storyId?: string
}

// ============================================================================
// PRD Story Analysis Types (Document Section Detection)
// ============================================================================

/** Request to analyze PRD stories for document sections */
export interface AnalyzePrdStoriesRequest {
  /** Project path */
  projectPath: string
  /** PRD name (without .json extension) */
  prdName: string
}

/** Response from analyzing PRD stories */
export interface AnalyzePrdStoriesResponse {
  /** Whether there are implementation-focused stories (not just doc sections) */
  hasImplementationStories: boolean
  /** Number of stories that appear to be document sections */
  documentSectionCount: number
  /** Total number of stories */
  totalStories: number
  /** List of story IDs that appear to be document sections */
  documentSectionIds: string[]
  /** Whether we suggest regenerating stories with AI */
  suggestRegeneration: boolean
}
