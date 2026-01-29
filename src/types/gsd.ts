// GSD (Get Stuff Done) workflow types
// These types must match the Rust structs in server/src/gsd/

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
 * Custom prompts for GSD workflow phases
 */
export interface GsdCustomPrompts {
  /** Custom prompt for deep questioning phase (discovery coach) */
  deepQuestioning?: string
  /** Custom prompt for architecture research */
  architecture?: string
  /** Custom prompt for codebase analysis */
  codebase?: string
  /** Custom prompt for best practices research */
  bestPractices?: string
  /** Custom prompt for risks research */
  risks?: string
  /** Custom prompt for AI requirement generation from user description */
  requirementGeneration?: string
}

/**
 * Project types with tailored question flows
 */
export type ProjectType =
  | 'web_app' // Full-stack web application
  | 'cli_tool' // Command-line interface
  | 'api_service' // REST/GraphQL API
  | 'library' // Code library/package
  | 'mobile_app' // iOS/Android app
  | 'desktop_app' // Desktop app (Electron, Tauri)
  | 'data_pipeline' // ETL/data processing
  | 'devops_tool' // DevOps/infrastructure tool
  | 'documentation' // Documentation site
  | 'other' // Catch-all

/**
 * Result of project type detection
 */
export interface ProjectTypeDetection {
  detectedType: ProjectType
  confidence: 'high' | 'medium' | 'low'
  evidence: string[] // Files/patterns found
  suggestedFrameworks: string[] // e.g., ['React', 'Vite']
  needsConfirmation: boolean // True if confidence < high
}

/**
 * Type of quality issue
 */
export type ContextQualityIssueType =
  | 'vague'
  | 'missing_info'
  | 'not_actionable'
  | 'too_broad'
  | 'contradictory'

/**
 * A quality issue with the context
 */
export interface ContextQualityIssue {
  issueType: ContextQualityIssueType
  message: string
  severity: 'error' | 'warning' | 'info'
  field: 'what' | 'why' | 'who' | 'done' | 'general'
}

/**
 * Context quality analysis result
 */
export interface ContextQualityReport {
  specificityScore: number // 0-100: How specific is the description?
  completenessScore: number // 0-100: How complete is the context?
  actionabilityScore: number // 0-100: Can you act on this?
  overallScore: number // Average of above
  issues: ContextQualityIssue[] // Specific problems found
  suggestions: string[] // How to improve
  isGoodEnough: boolean // True if overall >= 70
}

/**
 * Smart context suggestions for a project type
 */
export interface ContextSuggestions {
  projectType: ProjectType
  what: string[] // 3-5 example "what" descriptions
  why: string[] // 3-5 example "why" descriptions
  who: string[] // 3-5 example "who" descriptions
  done: string[] // 3-5 example "done" descriptions
}

/**
 * AI-generated project idea for brainstorming
 */
export interface GeneratedIdea {
  id: string
  title: string // "Recipe Knowledge Base"
  summary: string // 2-sentence overview
  context: QuestioningContext // Fully filled what/why/who/done
  suggestedFeatures: string[] // 3-5 key features
  techStack?: string[] // Suggested technologies
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
  /** Custom prompts for GSD workflow phases */
  customPrompts?: GsdCustomPrompts
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
 * Information about research in a session
 */
export interface ResearchSessionInfo {
  sessionId: string
  createdAt?: string
  hasArchitecture: boolean
  hasCodebase: boolean
  hasBestPractices: boolean
  hasRisks: boolean
  hasSynthesis: boolean
  /** Total size of research files in bytes */
  totalSizeBytes: number
}

/**
 * Options for cloning a GSD session
 */
export interface CloneSessionOptions {
  /** Copy project context (PROJECT.md) */
  copyContext: boolean
  /** Copy research outputs */
  copyResearch: boolean
  /** Copy requirements document */
  copyRequirements: boolean
}

/**
 * A generated requirement from AI (with temporary ID and suggested scope)
 */
export interface GeneratedRequirement {
  /** Temporary ID (e.g., GEN-01) before being accepted */
  id: string
  /** Category of the requirement */
  category: string
  /** Short title */
  title: string
  /** Detailed description */
  description: string
  /** Acceptance criteria */
  acceptanceCriteria: string[]
  /** AI-suggested scope (v1, v2, out_of_scope) */
  suggestedScope: string
}

/**
 * Result of AI requirement generation
 */
export interface GenerateRequirementsResult {
  /** Generated requirements */
  requirements: GeneratedRequirement[]
  /** Number of requirements generated */
  count: number
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
    status.architecture.complete &&
    !status.architecture.error &&
    status.codebase.complete &&
    !status.codebase.error &&
    status.bestPractices.complete &&
    !status.bestPractices.error &&
    status.risks.complete &&
    !status.risks.error
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

/**
 * Idea generation modes
 */
export type IdeaGenMode = 'blank_page' | 'vague_notion' | 'explore_space' | 'validate' | 'compare'

/**
 * Dimensions for varying ideas
 */
export type VariationDimension =
  | 'target_user'
  | 'tech_stack'
  | 'features'
  | 'business_model'
  | 'platform'

/**
 * Complexity level for feasibility
 */
export type ComplexityLevel = 'low' | 'medium' | 'high'

/**
 * Competition level
 */
export type CompetitionLevel = 'low' | 'medium' | 'high'

/**
 * Monetization potential
 */
export type MonetizationPotential = 'low' | 'medium' | 'high'

/**
 * Technical feasibility analysis
 */
export interface IdeaFeasibility {
  /** Overall feasibility score (0-100) */
  feasibilityScore: number
  /** Complexity level */
  complexityLevel: ComplexityLevel
  /** Estimated weeks for each phase */
  estimatedWeeks: {
    /** Minimum viable product */
    mvp: number
    /** Version 1 with core features */
    v1: number
    /** Version 2 with advanced features */
    v2: number
  }
  /** Required technical skills */
  requiredSkills: string[]
  /** Risk factors with mitigation strategies */
  riskFactors: Array<{ risk: string; mitigation: string }>
  /** Simplified MVP idea if original is too complex */
  simplifiedMvp?: GeneratedIdea
}

/**
 * Market opportunity analysis
 */
export interface MarketOpportunity {
  /** Total addressable market */
  tam: string
  /** Serviceable addressable market */
  sam: string
  /** Target user count estimate */
  targetUserCount: string
  /** Channels for user acquisition */
  acquisitionChannels: string[]
  /** Competition level */
  competition: CompetitionLevel
  /** Monetization potential */
  monetizationPotential: MonetizationPotential
  /** Competitor analysis */
  competitors: Array<{
    name: string
    strengths: string[]
    weaknesses: string[]
  }>
  /** Market gaps and opportunities */
  gaps: string[]
}

/**
 * Validated idea with feasibility and market analysis
 * Note: The base idea fields are nested under 'base' to match Rust serialization
 */
export interface ValidatedIdea {
  /** The base idea (flattened in JSON via serde flatten, but nested in TS for type clarity) */
  base: GeneratedIdea
  /** Technical feasibility analysis */
  feasibility?: IdeaFeasibility
  /** Market opportunity analysis */
  market?: MarketOpportunity
  /** User score (0-100) based on interests */
  userScore?: number
  /** Interest match score (0-100) */
  interestMatchScore?: number
}

/**
 * Idea generation state
 */
export interface IdeaGenerationState {
  /** Current mode */
  mode: IdeaGenMode
  /** User's interests */
  interests: string[]
  /** Generated ideas */
  ideas: ValidatedIdea[]
  /** Currently selected idea ID */
  selectedIdeaId?: string
  /** Dimensions to vary */
  variationDimensions: VariationDimension[]
  /** Whether ideas are being generated */
  isGenerating: boolean
  /** Whether validation is running */
  isValidating: boolean
  /** Error message if any */
  error?: string
}
