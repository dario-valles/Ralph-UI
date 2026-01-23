// Planning types for GSD workflow
// These types must match the Rust structs in src-tauri/src/gsd/

/**
 * Requirement category
 */
export type RequirementCategory =
  | 'core'
  | 'ui'
  | 'data'
  | 'integration'
  | 'security'
  | 'performance'
  | 'testing'
  | 'documentation'
  | 'other'

/**
 * Category display info
 */
export const REQUIREMENT_CATEGORIES: Record<
  RequirementCategory,
  { prefix: string; displayName: string }
> = {
  core: { prefix: 'CORE', displayName: 'Core Functionality' },
  ui: { prefix: 'UI', displayName: 'User Interface' },
  data: { prefix: 'DATA', displayName: 'Data & Storage' },
  integration: { prefix: 'INT', displayName: 'Integrations' },
  security: { prefix: 'SEC', displayName: 'Security' },
  performance: { prefix: 'PERF', displayName: 'Performance' },
  testing: { prefix: 'TEST', displayName: 'Testing' },
  documentation: { prefix: 'DOC', displayName: 'Documentation' },
  other: { prefix: 'OTHER', displayName: 'Other' },
}

/**
 * Scope level for requirements
 */
export type ScopeLevel = 'v1' | 'v2' | 'out_of_scope' | 'unscoped'

/**
 * Scope level display info
 */
export const SCOPE_LEVELS: Record<ScopeLevel, { displayName: string; color: string }> = {
  v1: { displayName: 'V1 (Must Have)', color: 'green' },
  v2: { displayName: 'V2 (Nice to Have)', color: 'blue' },
  out_of_scope: { displayName: 'Out of Scope', color: 'gray' },
  unscoped: { displayName: 'Not Yet Scoped', color: 'yellow' },
}

/**
 * A single requirement in the GSD workflow
 */
export interface Requirement {
  /** Unique requirement ID (e.g., CORE-01, UI-03) */
  id: string
  /** Category of the requirement */
  category: RequirementCategory
  /** Short title */
  title: string
  /** Detailed description */
  description: string
  /** User story format (optional) */
  userStory?: string
  /** Acceptance criteria */
  acceptanceCriteria: string[]
  /** Scope level (v1, v2, out-of-scope) */
  scope: ScopeLevel
  /** Dependencies on other requirement IDs */
  dependencies: string[]
  /** Estimated effort (S/M/L/XL) */
  effort?: string
  /** Priority within scope (1 = highest) */
  priority?: number
  /** Tags for filtering */
  tags: string[]
}

/**
 * Requirements document containing all enumerated requirements
 */
export interface RequirementsDoc {
  /** All requirements indexed by ID */
  requirements: Record<string, Requirement>
}

/**
 * Scope selection made by the user
 */
export interface ScopeSelection {
  /** Requirements selected for v1 */
  v1: string[]
  /** Requirements selected for v2 */
  v2: string[]
  /** Requirements marked out of scope */
  outOfScope: string[]
}

/**
 * A phase in the execution roadmap
 */
export interface RoadmapPhase {
  /** Phase number (1-based) */
  number: number
  /** Phase title */
  title: string
  /** Description of what this phase accomplishes */
  description: string
  /** Requirement IDs included in this phase */
  requirementIds: string[]
  /** Estimated effort summary */
  effortSummary: string
  /** Prerequisites (previous phase numbers) */
  prerequisites: number[]
  /** Milestone for this phase */
  milestone?: string
}

/**
 * Complete roadmap document
 */
export interface RoadmapDoc {
  /** Version being planned (typically "v1") */
  version: string
  /** Phases in order */
  phases: RoadmapPhase[]
  /** Requirements not included in any phase */
  deferred: string[]
}

/**
 * Severity of verification issues
 */
export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low'

/**
 * A verification issue (blocking)
 */
export interface VerificationIssue {
  /** Issue code for categorization */
  code: string
  /** Severity level */
  severity: IssueSeverity
  /** Human-readable message */
  message: string
  /** Related requirement IDs (if any) */
  relatedRequirements: string[]
  /** Suggested fix */
  suggestion?: string
}

/**
 * A verification warning (non-blocking)
 */
export interface VerificationWarning {
  /** Warning code */
  code: string
  /** Human-readable message */
  message: string
  /** Related requirement IDs */
  relatedRequirements: string[]
}

/**
 * Verification statistics
 */
export interface VerificationStats {
  /** Total requirements */
  totalRequirements: number
  /** Requirements in v1 scope */
  v1Count: number
  /** Requirements in v2 scope */
  v2Count: number
  /** Requirements out of scope */
  outOfScopeCount: number
  /** Unscoped requirements */
  unscopedCount: number
  /** Requirements in roadmap */
  inRoadmapCount: number
  /** Requirements not in roadmap */
  notInRoadmapCount: number
  /** Requirements with dependencies */
  withDependenciesCount: number
  /** Orphaned dependencies (referenced but don't exist) */
  orphanedDependencies: number
}

/**
 * Result of verification checks
 */
export interface VerificationResult {
  /** Whether all checks passed */
  passed: boolean
  /** Overall coverage percentage (0-100) */
  coveragePercentage: number
  /** Issues found during verification */
  issues: VerificationIssue[]
  /** Warnings (non-blocking) */
  warnings: VerificationWarning[]
  /** Summary statistics */
  stats: VerificationStats
}

/**
 * A single verification iteration
 */
export interface VerificationIteration {
  /** Iteration number (1-indexed) */
  iteration: number
  /** When this iteration was performed */
  timestamp: string
  /** The verification result for this iteration */
  result: VerificationResult
  /** Issue codes that were fixed since the previous iteration */
  issuesFixed: string[]
  /** Issue codes that are new since the previous iteration */
  newIssues: string[]
}

/**
 * Summary of verification history
 */
export interface VerificationHistorySummary {
  /** Total number of verification iterations */
  totalIterations: number
  /** Total issues found across all iterations */
  totalIssuesFound: number
  /** Total issues that were fixed */
  totalIssuesFixed: number
  /** Current number of remaining issues */
  currentIssues: number
  /** Improvement percentage from first to latest iteration */
  improvementPercentage?: number
}

/**
 * Verification history tracking all iterations
 */
export interface VerificationHistory {
  /** All verification iterations */
  iterations: VerificationIteration[]
  /** Current iteration number */
  currentIteration: number
}

/**
 * Result of a verification iteration (from command)
 */
export interface VerificationIterationResult {
  /** The verification result */
  result: VerificationResult
  /** Current iteration number */
  iteration: number
  /** Issues that were fixed since previous iteration */
  issuesFixed: string[]
  /** New issues since previous iteration */
  newIssues: string[]
  /** Summary of verification history */
  summary: VerificationHistorySummary
}

/**
 * Execution configuration stored with a PRD
 *
 * This captures the execution settings that were used (or should be used) when
 * running the Ralph loop for this PRD. When a PRD is executed, these settings
 * take precedence over global config. If not present, global RalphConfig is used.
 *
 * Config precedence: PRD stored > global config > defaults
 */
export interface PrdExecutionConfig {
  /** Agent type to use (claude, opencode, cursor, codex) */
  agentType?: string
  /** Model to use (e.g., "claude-sonnet-4-5") */
  model?: string
  /** Maximum iterations per execution */
  maxIterations?: number
  /** Maximum cost limit in dollars */
  maxCost?: number
  /** Whether to run tests after each iteration */
  runTests?: boolean
  /** Whether to run lint after each iteration */
  runLint?: boolean
  /** Whether to use a worktree for isolation */
  useWorktree?: boolean
  /** Agent timeout in seconds (0 = no timeout) */
  agentTimeoutSecs?: number
  /** Template name for prompt generation */
  templateName?: string
  /** Automatically create PRs for completed stories */
  autoCreatePrs?: boolean
  /** Create PRs as drafts */
  draftPrs?: boolean
}

/**
 * Check if an execution config has any fields set
 */
export function hasAnyExecutionConfigFields(config: PrdExecutionConfig): boolean {
  return (
    config.agentType !== undefined ||
    config.model !== undefined ||
    config.maxIterations !== undefined ||
    config.maxCost !== undefined ||
    config.runTests !== undefined ||
    config.runLint !== undefined ||
    config.useWorktree !== undefined ||
    config.agentTimeoutSecs !== undefined ||
    config.templateName !== undefined ||
    config.autoCreatePrs !== undefined ||
    config.draftPrs !== undefined
  )
}

/**
 * Validate execution config fields
 * Returns error message if invalid, undefined if valid
 */
export function validateExecutionConfig(config: PrdExecutionConfig): string | undefined {
  if (config.maxIterations !== undefined && config.maxIterations <= 0) {
    return 'Max iterations must be greater than 0'
  }
  if (config.maxCost !== undefined && config.maxCost < 0) {
    return 'Max cost cannot be negative'
  }
  if (config.agentType !== undefined) {
    const validTypes = ['claude', 'opencode', 'cursor', 'codex']
    if (!validTypes.includes(config.agentType)) {
      return `Invalid agent type: ${config.agentType}. Must be one of: ${validTypes.join(', ')}`
    }
  }
  return undefined
}

/**
 * Options for converting to RalphPrd
 */
export interface ConversionOptions {
  /** Branch name for the PRD */
  branch: string
  /** Whether to include v2 requirements as lower priority */
  includeV2: boolean
  /** Source chat session ID (for metadata) */
  sourceChatId?: string
  /** Custom title (overrides derived title) */
  customTitle?: string
  /** Custom description (overrides derived description) */
  customDescription?: string
  /** Execution settings to store with the PRD */
  executionConfig?: PrdExecutionConfig
}

/**
 * A requirement that was skipped during conversion
 */
export interface SkippedRequirement {
  requirementId: string
  reason: string
}

/**
 * Result of conversion
 */
export interface ConversionResult {
  /** The generated RalphPrd */
  prd: import('./index').RalphPrd
  /** Number of stories created */
  storyCount: number
  /** Requirements that were skipped (with reasons) */
  skipped: SkippedRequirement[]
}

/**
 * Helper to get requirements by scope
 */
export function getRequirementsByScope(
  doc: RequirementsDoc,
  scope: ScopeLevel
): Requirement[] {
  return Object.values(doc.requirements).filter((r) => r.scope === scope)
}

/**
 * Helper to get requirements by category
 */
export function getRequirementsByCategory(
  doc: RequirementsDoc,
  category: RequirementCategory
): Requirement[] {
  return Object.values(doc.requirements).filter((r) => r.category === category)
}

/**
 * Helper to count requirements by scope
 */
export function countRequirementsByScope(
  doc: RequirementsDoc
): Record<ScopeLevel, number> {
  const counts: Record<ScopeLevel, number> = {
    v1: 0,
    v2: 0,
    out_of_scope: 0,
    unscoped: 0,
  }
  for (const req of Object.values(doc.requirements)) {
    counts[req.scope]++
  }
  return counts
}

/**
 * Helper to get unscoped requirements
 */
export function getUnscopedRequirements(doc: RequirementsDoc): Requirement[] {
  return getRequirementsByScope(doc, 'unscoped')
}

/**
 * Parse REQ-ID to extract category prefix
 */
export function parseReqId(id: string): { prefix: string; number: number } | null {
  const match = id.match(/^([A-Z]+)-(\d+)$/)
  if (!match) return null
  return {
    prefix: match[1],
    number: parseInt(match[2], 10),
  }
}

/**
 * Get category from REQ-ID
 */
export function getCategoryFromReqId(id: string): RequirementCategory | null {
  const parsed = parseReqId(id)
  if (!parsed) return null

  for (const [category, info] of Object.entries(REQUIREMENT_CATEGORIES)) {
    if (info.prefix === parsed.prefix) {
      return category as RequirementCategory
    }
  }
  return null
}
