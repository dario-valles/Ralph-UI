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
// Specific Quality Check Types
// ============================================================================

/** Severity level for quality check issues */
export type QualityCheckSeverity = 'error' | 'warning' | 'info'

/** A specific quality check issue found in PRD content */
export interface QualityCheck {
  /** Unique identifier for this check type (e.g., "vague-language", "missing-acceptance-criteria") */
  id: string
  /** Human-readable name for the check */
  name: string
  /** Severity level (error, warning, info) */
  severity: QualityCheckSeverity
  /** Specific message describing the issue */
  message: string
  /** Location reference (line number, section name, or specific text) */
  location?: string
  /** The specific text that triggered this check (for highlighting) */
  matchedText?: string
  /** Suggested fix or improvement */
  suggestion?: string
}

/** Extended quality assessment with specific checks */
export interface DetailedQualityAssessment extends QualityAssessment {
  /** Specific quality checks performed */
  qualityChecks: QualityCheck[]
  /** Summary counts by severity */
  errorCount: number
  warningCount: number
  infoCount: number
}

// ============================================================================
// Enhanced Quality Check Types (13-Check System)
// ============================================================================

/** A single enhanced quality check result with pass/fail and scoring */
export interface EnhancedQualityCheck {
  /** Unique identifier for this check (e.g., "executive_summary", "smart_goals") */
  id: string
  /** Human-readable name for the check */
  name: string
  /** Whether this check passed */
  passed: boolean
  /** Points earned for this check */
  score: number
  /** Maximum points possible for this check */
  maxScore: number
  /** Result message (success or failure description) */
  message: string
  /** Suggested fix if the check failed */
  suggestion?: string
  /** Location in the PRD where the issue was found */
  location?: string
}

/** A warning about vague language that should be made specific */
export interface VagueLanguageWarning {
  /** The vague term found (e.g., "fast", "secure") */
  term: string
  /** Location in the PRD (section name or line excerpt) */
  location: string
  /** Specific replacement suggestion */
  suggestion: string
}

/** Quality grade based on total score */
export type QualityGrade = 'EXCELLENT' | 'GOOD' | 'ACCEPTABLE' | 'NEEDS_WORK'

/** Comprehensive quality report with 13 checks and vague language detection */
export interface EnhancedQualityReport {
  /** Individual quality check results */
  checks: EnhancedQualityCheck[]
  /** Vague language warnings */
  vagueWarnings: VagueLanguageWarning[]
  /** Total score earned across all checks */
  totalScore: number
  /** Maximum possible score */
  maxScore: number
  /** Score as percentage (0-100) */
  percentage: number
  /** Quality grade based on percentage */
  grade: QualityGrade
  /** Number of checks that passed */
  passedCount: number
  /** Total number of checks */
  totalChecks: number
  /** Whether the PRD is ready for export */
  readyForExport: boolean
  /** Summary of issues to fix */
  summary: string
}

// ============================================================================
// Structured Discovery Question Types
// ============================================================================

/** Category for discovery questions */
export type DiscoveryCategory = 'essential' | 'technical' | 'implementation'

/** A structured discovery question with category and follow-up hint */
export interface DiscoveryQuestion {
  /** Unique identifier for the question */
  id: string
  /** Category of the question */
  category: DiscoveryCategory
  /** The question text */
  question: string
  /** Hint for follow-up probing */
  followUpHint: string
  /** Whether this question is required for PRD readiness */
  required: boolean
}

/** Discovery questions organized by category */
export const DISCOVERY_QUESTIONS: DiscoveryQuestion[] = [
  // Essential Questions (5) - Required for PRD readiness
  {
    id: 'problem',
    category: 'essential',
    question: "What problem does this solve? What's the user pain point or business impact?",
    followUpHint: 'Dig deeper: How severe is this problem? How often do users encounter it?',
    required: true,
  },
  {
    id: 'users',
    category: 'essential',
    question: 'Who is the target user or audience? Be specific about the persona.',
    followUpHint: "Clarify: What's their role? Technical level? How many users?",
    required: true,
  },
  {
    id: 'solution',
    category: 'essential',
    question: 'What is the proposed solution or feature? Describe the core functionality.',
    followUpHint: "Explore: What's the main workflow? Key interactions?",
    required: true,
  },
  {
    id: 'metrics',
    category: 'essential',
    question: 'What are the key success metrics? How will you measure success?',
    followUpHint: 'Be specific: What numbers? What baseline? What target?',
    required: true,
  },
  {
    id: 'constraints',
    category: 'essential',
    question: 'What constraints exist? (technical, timeline, budget, resources)',
    followUpHint: 'Consider: Hard deadlines? Team size? Technical limitations?',
    required: true,
  },

  // Technical Questions (4)
  {
    id: 'codebase',
    category: 'technical',
    question: 'Is this for an existing codebase or a greenfield project?',
    followUpHint: 'If existing: What patterns are already established?',
    required: false,
  },
  {
    id: 'stack',
    category: 'technical',
    question: 'What technology stack will be used? (languages, frameworks, databases)',
    followUpHint: 'Any preferences or constraints on technology choices?',
    required: false,
  },
  {
    id: 'integrations',
    category: 'technical',
    question: 'Any integration requirements? (third-party APIs, internal systems)',
    followUpHint: 'Consider: Auth systems, data sources, external services',
    required: false,
  },
  {
    id: 'performance',
    category: 'technical',
    question: 'What are the performance/scale requirements? (users, data volume, latency)',
    followUpHint: 'Be specific: Concurrent users? Requests/second? Response time?',
    required: false,
  },

  // Implementation Questions (3)
  {
    id: 'complexity',
    category: 'implementation',
    question:
      "What's the estimated complexity? (simple feature, typical project, complex system)",
    followUpHint: 'Consider: Number of components, integrations, unknowns',
    required: false,
  },
  {
    id: 'timeline',
    category: 'implementation',
    question: 'What are the timeline expectations? Any hard deadlines?',
    followUpHint: 'Phases: MVP deadline? Full feature deadline?',
    required: false,
  },
  {
    id: 'other',
    category: 'implementation',
    question: 'Anything else I should know? (edge cases, constraints, context)',
    followUpHint: "Think about: What could go wrong? What's been tried before?",
    required: false,
  },
]

/** Get questions filtered by category */
export function getQuestionsByCategory(category: DiscoveryCategory): DiscoveryQuestion[] {
  return DISCOVERY_QUESTIONS.filter((q) => q.category === category)
}

/** Get required questions only */
export function getRequiredQuestions(): DiscoveryQuestion[] {
  return DISCOVERY_QUESTIONS.filter((q) => q.required)
}

// ============================================================================
// Discovery Progress Types
// ============================================================================

/** Summary of discovered requirements */
export interface DiscoverySummary {
  /** Summarized "what" from the conversation */
  what?: string
  /** Summarized "who" (target users) */
  who?: string
  /** Summarized "why" (motivation) */
  why?: string
  /** Summarized "done" (success criteria) */
  done?: string
}

/** Tracks which discovery areas have been covered in the conversation */
export interface DiscoveryProgress {
  /** WHAT - Problem statement / core idea has been discussed */
  problemCovered: boolean
  /** WHO - Target users have been identified */
  usersCovered: boolean
  /** WHY - Motivation / value proposition is clear */
  motivationCovered: boolean
  /** DONE - Success criteria have been defined */
  successCovered: boolean
  /** TECH - Technical constraints have been discussed (optional for quick PRDs) */
  techCovered: boolean
  /** SCOPE - Boundaries / out-of-scope items defined (optional) */
  scopeCovered: boolean
  /** Summary of what's been gathered so far */
  summary?: DiscoverySummary
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
// Structured PRD Item Types
// ============================================================================

/** Effort size for tasks */
export type EffortSize = 'small' | 'medium' | 'large'

/** Technical complexity level */
export type Complexity = 'low' | 'medium' | 'high'

/** Type of PRD item */
export type PRDItemType = 'epic' | 'user_story' | 'task' | 'acceptance_criteria'

/** A structured PRD item extracted from agent output */
export interface StructuredPRDItem {
  type: PRDItemType
  id: string
  parentId?: string
  title: string
  description: string
  acceptanceCriteria?: string[]
  priority?: number
  /** Task IDs this item depends on */
  dependencies?: string[]
  /** Effort estimate: small, medium, large */
  estimatedEffort?: EffortSize
  tags?: string[]
  /** Technical complexity: low, medium, high */
  complexity?: Complexity
  /** Whether this task can be executed in parallel with other tasks */
  parallelizable?: boolean
  /** Suggested execution order (1 = first, higher = later) */
  suggestedOrder?: number
}

/** Collection of extracted PRD items grouped by type */
export interface ExtractedPRDStructure {
  epics: StructuredPRDItem[]
  userStories: StructuredPRDItem[]
  tasks: StructuredPRDItem[]
  acceptanceCriteria: StructuredPRDItem[]
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
