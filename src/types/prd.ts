// PRD (Product Requirements Document) types

import type { AgentType } from './agent'
import type { PRDTypeValue } from './chat'

// ============================================================================
// PRD Document Types
// ============================================================================

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
// Execution Types
// ============================================================================

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
