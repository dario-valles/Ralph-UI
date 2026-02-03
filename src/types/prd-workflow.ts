// PRD Workflow types
// These types must match the Rust structs in server/src/prd_workflow/

/**
 * Workflow phases (5 simplified phases)
 */
export type WorkflowPhase =
  | 'discovery'
  | 'research'
  | 'requirements'
  | 'planning'
  | 'export'

/**
 * Phase metadata for display
 */
export interface WorkflowPhaseInfo {
  phase: WorkflowPhase
  displayName: string
  description: string
  index: number
}

/**
 * All phases with metadata
 */
export const WORKFLOW_PHASES: WorkflowPhaseInfo[] = [
  {
    phase: 'discovery',
    displayName: 'Discovery',
    description: 'Chat-based context gathering (what/why/who/done)',
    index: 0,
  },
  {
    phase: 'research',
    displayName: 'Research',
    description: 'Parallel AI agent research on requirements',
    index: 1,
  },
  {
    phase: 'requirements',
    displayName: 'Requirements',
    description: 'Define requirements with dependencies and scoping',
    index: 2,
  },
  {
    phase: 'planning',
    displayName: 'Planning',
    description: 'Generate roadmap and verify coverage',
    index: 3,
  },
  {
    phase: 'export',
    displayName: 'Export',
    description: 'Convert to RalphPrd format',
    index: 4,
  },
]

/**
 * Status of a phase
 */
export type PhaseStatus = 'not_started' | 'in_progress' | 'complete' | 'skipped'

/**
 * Workflow mode
 */
export type WorkflowMode = 'new' | 'existing'

/**
 * Execution mode for requirements
 */
export type ExecutionMode = 'sequential' | 'parallel'

/**
 * Project context gathered during discovery
 */
export interface ProjectContext {
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
  /** Technical constraints identified */
  constraints: string[]
  /** Explicit non-goals */
  nonGoals: string[]
}

/**
 * State description for current/desired state workflow
 */
export interface StateDescription {
  /** Brief summary of the state */
  summary: string
  /** User flows in this state */
  userFlows: string[]
  /** Components involved */
  components: string[]
  /** Data models/structures */
  dataModels: string[]
  /** Constraints and limitations */
  constraints: string[]
}

/**
 * Current → Desired state specification
 */
export interface SpecState {
  /** Current state description (what exists today) */
  current: StateDescription
  /** Desired state description (what should exist) */
  desired: StateDescription
  /** Implementation notes derived from the gap */
  implementationNotes: string[]
}

/**
 * Scope level for requirements
 */
export type ScopeLevel = 'v1' | 'v2' | 'out_of_scope' | 'unscoped'

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
 * Requirement status
 */
export type RequirementStatus =
  | 'pending'
  | 'blocked'
  | 'ready'
  | 'in_progress'
  | 'done'

/**
 * A single requirement
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
  /** Acceptance criteria (BDD format supported) */
  acceptanceCriteria: string[]
  /** Scope level (v1, v2, out-of-scope) */
  scope: ScopeLevel
  /** IDs of requirements this depends on */
  dependsOn: string[]
  /** Estimated effort (S/M/L/XL) */
  effort?: string
  /** Priority within scope (1 = highest) */
  priority?: number
  /** Tags for filtering */
  tags: string[]
  /** Requirement status */
  status: RequirementStatus
}

/**
 * Research agent configuration
 */
export interface ResearchAgentConfig {
  /** Unique identifier for this agent */
  id: string
  /** Display name */
  name: string
  /** Description of what this agent researches */
  description: string
  /** Output filename (e.g., "architecture.md") */
  outputFilename: string
  /** Template name for the agent's prompt */
  templateName: string
  /** Whether this agent is enabled */
  enabled: boolean
  /** Whether this agent requires a codebase */
  requiresCodebase: boolean
}

/**
 * Research configuration
 */
export interface ResearchConfig {
  /** Configured research agents */
  agents: ResearchAgentConfig[]
  /** Whether to run agents in parallel */
  parallel: boolean
  /** Timeout for each agent in seconds */
  timeoutSecs: number
  /** Whether to skip agents that fail */
  skipOnFailure: boolean
  /** CLI agent type to use */
  cliAgentType: string
  /** Model to use for research agents */
  model?: string
}

/**
 * PRD Workflow research agent status
 */
export interface PrdWorkflowResearchAgentStatus {
  /** Agent identifier */
  agentId: string
  /** Display name */
  name: string
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
 * Research status for all configured agents
 */
export interface ResearchStatus {
  /** Status of each research agent */
  agents: PrdWorkflowResearchAgentStatus[]
  /** Whether synthesis is complete */
  synthesisComplete: boolean
  /** Overall completion percentage (0-100) */
  completionPercentage: number
}

/**
 * Dependency graph statistics
 */
export interface DependencyStats {
  /** Total number of nodes */
  totalNodes: number
  /** Total number of dependency edges */
  totalDependencies: number
  /** Maximum depth of the dependency chain */
  maxDepth: number
  /** Nodes with no dependencies (can start immediately) */
  rootNodes: string[]
  /** Nodes that nothing depends on (end points) */
  leafNodes: string[]
}

/**
 * Complete unified state of a PRD workflow
 */
export interface PrdWorkflowState {
  /** Unique workflow ID */
  id: string
  /** Project path */
  projectPath: string
  /** Associated chat session ID */
  chatSessionId?: string
  /** Workflow mode (new or existing) */
  mode: WorkflowMode
  /** Current phase */
  phase: WorkflowPhase
  /** Status of each phase */
  phaseStatuses: Record<string, PhaseStatus>
  /** Project context gathered during discovery */
  context: ProjectContext
  /** Current/desired state specification */
  spec?: SpecState
  /** Research configuration */
  researchConfig: ResearchConfig
  /** Research status */
  researchStatus: ResearchStatus
  /** Requirements indexed by ID */
  requirements: Record<string, Requirement>
  /** Dependency graph (depends_on and blocks maps) */
  dependencyGraph: {
    dependsOn: Record<string, string[]>
    blocks: Record<string, string[]>
  }
  /** Counters for ID generation per category */
  categoryCounters: Record<string, number>
  /** Execution mode */
  executionMode: ExecutionMode
  /** When the workflow started */
  createdAt: string
  /** When the workflow was last updated */
  updatedAt: string
  /** Whether the workflow is complete */
  isComplete: boolean
  /** Error message if the workflow failed */
  error?: string
}

/**
 * Workflow info for listing
 */
export interface WorkflowInfo {
  id: string
  projectPath: string
  phase?: WorkflowPhase
  mode?: WorkflowMode
  isComplete: boolean
  createdAt?: string
  updatedAt?: string
  contextSummary?: string
}

/**
 * Phase action for phase updates
 */
export type PhaseAction =
  | { type: 'advance' }
  | { type: 'go_back' }
  | { type: 'skip' }
  | { type: 'set_phase'; phase: WorkflowPhase }

/**
 * Result of adding a requirement
 */
export interface AddRequirementResult {
  id: string
  state: PrdWorkflowState
}

/**
 * Scope selection for bulk updates
 */
export interface ScopeSelection {
  v1: string[]
  v2: string[]
  outOfScope: string[]
}

/**
 * Dependency validation result
 */
export interface DependencyValidationResult {
  valid: boolean
  error?: string
  stats?: DependencyStats
}

/**
 * Export result
 */
export interface ExportResult {
  prdName: string
  prdPath: string
  content: string
  /** Execution mode used for this PRD (sequential or parallel) */
  executionMode: ExecutionMode
}

/**
 * Ideas analysis result (for /ideas command)
 */
export interface IdeasAnalysisResult {
  quickWins: {
    id: string
    title: string
    description: string
    location: string
    effort: 'minutes' | 'hour'
    impact: 'low' | 'medium' | 'high'
  }[]
  refactoring: {
    id: string
    title: string
    description: string
    affectedFiles: string[]
    effort: 'small' | 'medium' | 'large'
    impact: 'low' | 'medium' | 'high'
    riskLevel: 'low' | 'medium' | 'high'
  }[]
  architecture: {
    id: string
    title: string
    description: string
    rationale: string
    effort: 'days' | 'weeks'
    impact: 'medium' | 'high'
    prerequisites: string[]
  }[]
  featureIdeas: {
    id: string
    title: string
    description: string
    userValue: string
    complexity: 'low' | 'medium' | 'high'
    suggestedApproach: string
  }[]
  summary: string
}

/**
 * Acceptance criteria result (for /criteria command)
 */
export interface AcceptanceCriteriaResult {
  scenarios: {
    name: string
    given: string
    when: string
    then: string
    and?: string[]
  }[]
  criteria: string[]
  outOfScope: string[]
}

/**
 * Spec state analysis result (for /spec command)
 */
export interface SpecStateAnalysisResult {
  current: StateDescription
  desired: StateDescription
  implementationNotes: string[]
  affectedAreas: string[]
  risks: string[]
}

// Helper functions

/**
 * Get phase info by phase
 */
export function getPhaseInfo(phase: WorkflowPhase): WorkflowPhaseInfo | undefined {
  return WORKFLOW_PHASES.find((p) => p.phase === phase)
}

/**
 * Get next phase
 */
export function getNextPhase(phase: WorkflowPhase): WorkflowPhase | undefined {
  const phases: WorkflowPhase[] = ['discovery', 'research', 'requirements', 'planning', 'export']
  const currentIndex = phases.indexOf(phase)
  if (currentIndex === -1 || currentIndex === phases.length - 1) {
    return undefined
  }
  return phases[currentIndex + 1]
}

/**
 * Get previous phase
 */
export function getPreviousPhase(phase: WorkflowPhase): WorkflowPhase | undefined {
  const phases: WorkflowPhase[] = ['discovery', 'research', 'requirements', 'planning', 'export']
  const currentIndex = phases.indexOf(phase)
  if (currentIndex <= 0) {
    return undefined
  }
  return phases[currentIndex - 1]
}

/**
 * Check if context is complete
 */
export function isContextComplete(context: ProjectContext): boolean {
  return Boolean(context.what && context.why && context.who && context.done)
}

/**
 * Get missing context items
 */
export function getMissingContextItems(context: ProjectContext): string[] {
  const missing: string[] = []
  if (!context.what) missing.push('what')
  if (!context.why) missing.push('why')
  if (!context.who) missing.push('who')
  if (!context.done) missing.push('done')
  return missing
}

/**
 * Calculate workflow completion percentage
 */
export function calculateWorkflowCompletion(state: PrdWorkflowState): number {
  const totalPhases = WORKFLOW_PHASES.length
  const completePhases = Object.values(state.phaseStatuses).filter(
    (status) => status === 'complete' || status === 'skipped'
  ).length
  return Math.round((completePhases / totalPhases) * 100)
}

/**
 * Get requirements by scope
 */
export function getRequirementsByScope(
  requirements: Record<string, Requirement>,
  scope: ScopeLevel
): Requirement[] {
  return Object.values(requirements).filter((r) => r.scope === scope)
}

/**
 * Get requirements that are ready
 */
export function getReadyRequirements(requirements: Record<string, Requirement>): Requirement[] {
  return Object.values(requirements).filter((r) => r.status === 'ready')
}

/**
 * Get requirement category display info
 */
export function getCategoryInfo(category: RequirementCategory): {
  prefix: string
  displayName: string
} {
  const info: Record<RequirementCategory, { prefix: string; displayName: string }> = {
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
  return info[category]
}

/**
 * Get scope display info
 */
export function getScopeInfo(scope: ScopeLevel): { displayName: string; color: string } {
  const info: Record<ScopeLevel, { displayName: string; color: string }> = {
    v1: { displayName: 'V1 (Must Have)', color: 'green' },
    v2: { displayName: 'V2 (Nice to Have)', color: 'blue' },
    out_of_scope: { displayName: 'Out of Scope', color: 'gray' },
    unscoped: { displayName: 'Not Yet Scoped', color: 'yellow' },
  }
  return info[scope]
}

/**
 * Get status display info
 */
export function getStatusInfo(status: RequirementStatus): {
  displayName: string
  color: string
  icon: string
} {
  const info: Record<RequirementStatus, { displayName: string; color: string; icon: string }> = {
    pending: { displayName: 'Pending', color: 'gray', icon: '⏳' },
    blocked: { displayName: 'Blocked', color: 'red', icon: '🚫' },
    ready: { displayName: 'Ready', color: 'green', icon: '✅' },
    in_progress: { displayName: 'In Progress', color: 'blue', icon: '🔄' },
    done: { displayName: 'Done', color: 'green', icon: '✓' },
  }
  return info[status]
}
