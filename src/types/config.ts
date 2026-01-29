// Configuration types for Ralph settings

import type { AgentType } from './agent'

// ============================================================================
// Ralph Configuration Types
// ============================================================================

export interface RalphExecutionConfig {
  maxParallel: number
  maxIterations: number
  maxRetries: number
  agentType: string
  strategy: string
  /** Default model to use for agents */
  model?: string
  /** API provider for Claude (e.g., "anthropic", "zai", "minimax") */
  apiProvider?: string
  /** Dry-run mode: preview execution without actually spawning agents */
  dryRun?: boolean
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
  useAiForAcceptanceCriteria?: boolean
}

export interface RalphTemplateConfig {
  defaultTemplate?: string
  templatesDir?: string
}

/** Error handling strategy for Ralph Loop iterations */
export type RalphErrorStrategy =
  | { type: 'retry'; max_attempts: number; backoff_ms: number }
  | { type: 'skip' }
  | { type: 'abort' }

export interface RalphFallbackSettings {
  enabled: boolean
  baseBackoffMs: number
  maxBackoffMs: number
  /** Model to use for the fallback agent */
  fallbackModel?: string
  /** API provider for the fallback agent */
  fallbackApiProvider?: string
  /** Error handling strategy */
  errorStrategy?: RalphErrorStrategy
  /** Ordered list of fallback agents */
  fallbackChain?: AgentType[]
  /** Whether to test if primary agent has recovered */
  testPrimaryRecovery?: boolean
  /** Test primary recovery every N iterations */
  recoveryTestInterval?: number
}

// Main RalphConfig - used throughout the app for settings
export interface RalphConfig {
  execution: RalphExecutionConfig
  git: RalphGitConfig
  validation: RalphValidationConfig
  templates: RalphTemplateConfig
  fallback: RalphFallbackSettings
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
// Error Strategy Types (for Ralph Loop & Parallel Scheduler)
// ============================================================================

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

// Error strategy types
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
// API Provider Types (z.ai, MiniMax, etc.)
// ============================================================================

/** Model info for an API provider */
export interface ProviderModelInfo {
  name: string
  isDefault: boolean
}

/** API provider information */
export interface ApiProviderInfo {
  /** Provider ID (e.g., "anthropic", "zai", "minimax") */
  id: string
  /** Display name */
  name: string
  /** Base URL for the API */
  baseUrl: string
  /** Whether this provider has an API token configured */
  hasToken: boolean
  /** Whether this provider is currently active */
  isActive: boolean
  /** Available models for this provider */
  models: ProviderModelInfo[]
}

/** Result of testing a provider connection */
export interface ProviderTestResult {
  success: boolean
  message: string
}
