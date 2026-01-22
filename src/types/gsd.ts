// GSD (Get Stuff Done) workflow types
// These types must match the Rust structs in src-tauri/src/gsd/

/**
 * Phases in the GSD workflow
 */
export type GsdPhase =
  | 'deep_questioning'
  | 'project_document'
  | 'research'
  | 'requirements'
  | 'scoping'
  | 'roadmap'
  | 'verification'
  | 'export'

/**
 * Phase metadata for display
 */
export interface GsdPhaseInfo {
  phase: GsdPhase
  displayName: string
  description: string
  index: number
}

/**
 * All phases with metadata
 */
export const GSD_PHASES: GsdPhaseInfo[] = [
  {
    phase: 'deep_questioning',
    displayName: 'Deep Questioning',
    description: 'Open-ended exploration to understand what you want to build',
    index: 0,
  },
  {
    phase: 'project_document',
    displayName: 'Project Document',
    description: 'Create PROJECT.md capturing vision, goals, and constraints',
    index: 1,
  },
  {
    phase: 'research',
    displayName: 'Research',
    description: 'Parallel agents explore technical approaches',
    index: 2,
  },
  {
    phase: 'requirements',
    displayName: 'Requirements',
    description: 'Enumerate all features with REQ-IDs',
    index: 3,
  },
  {
    phase: 'scoping',
    displayName: 'Scoping',
    description: 'Select v1/v2/out-of-scope features',
    index: 4,
  },
  {
    phase: 'roadmap',
    displayName: 'Roadmap',
    description: 'Derive phases from scoped requirements',
    index: 5,
  },
  {
    phase: 'verification',
    displayName: 'Verification',
    description: 'Check coverage and detect gaps',
    index: 6,
  },
  {
    phase: 'export',
    displayName: 'Export',
    description: 'Convert planning docs to Ralph PRD format',
    index: 7,
  },
]

/**
 * Context gathered during deep questioning
 */
export interface QuestioningContext {
  /** What is being built (the core idea) */
  what?: string
  /** Why it's being built (motivation, problem being solved) */
  why?: string
  /** Who will use it (target users) */
  who?: string
  /** Definition of done (success criteria) */
  done?: string
  /** Additional context notes */
  notes: string[]
}

/**
 * Status of a single research agent
 */
export interface AgentResearchStatus {
  /** Whether this research is running */
  running: boolean
  /** Whether this research is complete */
  complete: boolean
  /** Error message if failed */
  error?: string
  /** Output file path (if complete) */
  outputPath?: string
}

/**
 * Status of all research agents
 */
export interface ResearchStatus {
  /** Architecture research status */
  architecture: AgentResearchStatus
  /** Codebase analysis status */
  codebase: AgentResearchStatus
  /** Best practices research status */
  bestPractices: AgentResearchStatus
  /** Risks and challenges research status */
  risks: AgentResearchStatus
}

/**
 * User decisions made during the workflow
 */
export type GsdDecision =
  | { type: 'proceed' }
  | { type: 'go_back' }
  | {
      type: 'scope_selection'
      v1: string[]
      v2: string[]
      outOfScope: string[]
    }
  | { type: 'verification_approved' }
  | { type: 'edit_requirements'; requirementIds: string[] }
  | { type: 'exported'; prdName: string }

/**
 * Complete state of a GSD workflow session
 */
export interface GsdWorkflowState {
  /** Session ID (links to chat session) */
  sessionId: string
  /** Current phase */
  currentPhase: GsdPhase
  /** Context gathered during questioning */
  questioningContext: QuestioningContext
  /** Status of research agents */
  researchStatus: ResearchStatus
  /** History of decisions made */
  decisions: GsdDecision[]
  /** When the workflow started */
  startedAt: string
  /** When the workflow was last updated */
  updatedAt: string
  /** Whether the workflow is complete */
  isComplete: boolean
  /** Error message if the workflow failed */
  error?: string
}

/**
 * Result of a single research agent
 */
export interface ResearchResult {
  /** Type of research performed */
  researchType: string
  /** Whether the research completed successfully */
  success: boolean
  /** The research output content */
  content?: string
  /** Error message if failed */
  error?: string
  /** Output file path */
  outputPath?: string
  /** Duration in seconds */
  durationSecs: number
  /** Which CLI agent was used */
  cliAgent: string
}

/**
 * Synthesized research summary
 */
export interface ResearchSynthesis {
  /** The generated summary content */
  content: string
  /** Number of research files included */
  filesIncluded: number
  /** Files that were missing or failed */
  missingFiles: string[]
  /** Key themes extracted from research */
  keyThemes: string[]
}

/**
 * Types of quality issues
 */
export type QualityIssueType =
  | 'vague'
  | 'not_user_centric'
  | 'not_atomic'
  | 'no_acceptance_criteria'
  | 'too_short'
  | 'banned_word'

/**
 * A quality issue with a requirement
 */
export interface QualityIssue {
  /** Type of issue */
  issueType: QualityIssueType
  /** Description of the issue */
  message: string
  /** Severity level (error, warning, info) */
  severity: string
}

/**
 * Quality validation result for a single requirement
 */
export interface RequirementQualityResult {
  /** The requirement ID */
  id: string
  /** Whether the requirement passes quality checks */
  isValid: boolean
  /** List of quality issues found */
  issues: QualityIssue[]
  /** Suggestions for improvement */
  suggestions: string[]
}

/**
 * Result of validating all requirements
 */
export interface RequirementsValidationResult {
  /** Validation results for each requirement */
  results: RequirementQualityResult[]
  /** Overall quality score (0-100) */
  qualityScore: number
  /** Total number of requirements */
  totalRequirements: number
  /** Number of valid requirements */
  validRequirements: number
}

/**
 * Configuration for the GSD workflow
 */
export interface GsdConfig {
  /** Agent type to use for research */
  researchAgentType: string
  /** Model to use for research agents */
  researchModel?: string
  /** Maximum number of research agents to run in parallel */
  maxParallelResearch: number
  /** Timeout for each research agent in seconds */
  researchTimeoutSecs: number
  /** Whether to auto-advance after each phase */
  autoAdvance: boolean
  /** Minimum context items required before allowing proceed */
  minContextItems: number
  /** Whether to include codebase analysis in research */
  includeCodebaseAnalysis: boolean
}

/**
 * Information about a planning session
 */
export interface PlanningSessionInfo {
  sessionId: string
  phase?: GsdPhase
  isComplete: boolean
  updatedAt?: string
}

/**
 * Helper function to get phase info by phase key
 */
export function getPhaseInfo(phase: GsdPhase): GsdPhaseInfo | undefined {
  return GSD_PHASES.find((p) => p.phase === phase)
}

/**
 * Helper function to get the next phase
 */
export function getNextPhase(phase: GsdPhase): GsdPhase | undefined {
  const info = getPhaseInfo(phase)
  if (!info || info.index >= GSD_PHASES.length - 1) return undefined
  return GSD_PHASES[info.index + 1].phase
}

/**
 * Helper function to get the previous phase
 */
export function getPreviousPhase(phase: GsdPhase): GsdPhase | undefined {
  const info = getPhaseInfo(phase)
  if (!info || info.index <= 0) return undefined
  return GSD_PHASES[info.index - 1].phase
}

/**
 * Check if questioning context is complete
 */
export function isQuestioningComplete(context: QuestioningContext): boolean {
  return !!(context.what && context.why && context.who && context.done)
}

/**
 * Get missing context items
 */
export function getMissingContextItems(
  context: QuestioningContext
): ('what' | 'why' | 'who' | 'done')[] {
  const missing: ('what' | 'why' | 'who' | 'done')[] = []
  if (!context.what) missing.push('what')
  if (!context.why) missing.push('why')
  if (!context.who) missing.push('who')
  if (!context.done) missing.push('done')
  return missing
}

/**
 * Check if research is complete
 */
export function isResearchComplete(status: ResearchStatus): boolean {
  return (
    (status.architecture.complete && !status.architecture.error) &&
    (status.codebase.complete && !status.codebase.error) &&
    (status.bestPractices.complete && !status.bestPractices.error) &&
    (status.risks.complete && !status.risks.error)
  )
}

/**
 * Get research completion percentage
 */
export function getResearchCompletionPercentage(status: ResearchStatus): number {
  const total = 4
  const complete = [
    status.architecture.complete && !status.architecture.error,
    status.codebase.complete && !status.codebase.error,
    status.bestPractices.complete && !status.bestPractices.error,
    status.risks.complete && !status.risks.error,
  ].filter(Boolean).length
  return Math.round((complete / total) * 100)
}

/**
 * Get workflow completion percentage based on current phase
 */
export function getWorkflowCompletionPercentage(phase: GsdPhase): number {
  const info = getPhaseInfo(phase)
  if (!info) return 0
  return Math.round((info.index / GSD_PHASES.length) * 100)
}
