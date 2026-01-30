// Project Context Types - Types for project-level context files
//
// Context files provide AI agents with consistent understanding of a project's
// product vision, tech stack, conventions, and workflow preferences.

import type { ChatMessageRole } from './chat'

// ============================================================================
// Context Mode
// ============================================================================

/**
 * Mode for context file organization
 * - single: Single context.md file for simple projects
 * - multi: Multiple files (product.md, tech-stack.md, etc.) for complex projects
 */
export type ContextMode = 'single' | 'multi'

// ============================================================================
// Context Configuration
// ============================================================================

/**
 * Configuration for context injection behavior
 */
export interface ContextConfig {
  /** Whether context injection is enabled */
  enabled: boolean
  /** Organization mode (single file vs multiple files) */
  mode: ContextMode
  /** Include context in PRD Chat prompts */
  includeInPrdChat: boolean
  /** Include context in Ralph Loop prompts */
  includeInRalphLoop: boolean
  /** List of enabled context files (for multi-file mode) */
  enabledFiles: string[]
  /** When context was last updated */
  lastUpdated?: string // ISO date string
}

// ============================================================================
// Context File Types
// ============================================================================

/** Names of supported multi-file context files */
export const CONTEXT_FILE_NAMES = ['product', 'tech-stack', 'workflow', 'conventions'] as const
export type ContextFileName = (typeof CONTEXT_FILE_NAMES)[number]

/**
 * A single context file with its content
 */
export interface ContextFile {
  /** File name (without .md extension) */
  name: string
  /** File content (markdown) */
  content: string
  /** When file was last modified (ISO date string) */
  updatedAt: string
  /** Estimated token count for this file */
  tokenCount: number
}

/**
 * Complete project context state
 */
export interface ProjectContextState {
  /** Configuration for context behavior */
  config: ContextConfig
  /** Context files (single "context" or multiple files depending on mode) */
  files: ContextFile[]
  /** Whether user has dismissed the setup prompt */
  setupDismissed: boolean
}

// ============================================================================
// Project Analysis Types (for Context Chat)
// ============================================================================

/**
 * Information about a detected dependency
 */
export interface DependencyInfo {
  /** Package name */
  name: string
  /** Version (if detected) */
  version?: string
  /** Category (framework, testing, tooling, etc.) */
  category: string
  /** Whether it's a dev dependency */
  isDev: boolean
}

/**
 * Detected tech stack information from project files
 */
export interface TechStackInfo {
  /** Primary programming languages */
  languages: string[]
  /** Frameworks detected */
  frameworks: string[]
  /** Key dependencies (top ~15) */
  dependencies: DependencyInfo[]
  /** Build/dev tools */
  tools: string[]
  /** Package manager used */
  packageManager?: string
}

/**
 * Analysis of project structure for context generation
 */
export interface ProjectAnalysis {
  /** Summary extracted from CLAUDE.md if present */
  claudeMdSummary?: string
  /** Detected tech stack from package.json, Cargo.toml, etc. */
  detectedStack: TechStackInfo
  /** Summary of key directory structure */
  fileStructureSummary: string
  /** Existing context content (if updating) */
  existingContext?: string
  /** Whether CLAUDE.md exists (for import suggestion) */
  hasClaudeMd: boolean
  /** Project name (from package.json, Cargo.toml, or directory) */
  projectName?: string
}

// ============================================================================
// Context Chat Session
// ============================================================================

/**
 * A chat session specifically for context generation
 */
export interface ContextChatSession {
  /** Unique session ID */
  id: string
  /** Project path this context is for */
  projectPath: string
  /** Agent type being used */
  agentType: string
  /** Project analysis performed at session start */
  analysis: ProjectAnalysis
  /** Extracted context content (from <context> blocks in AI responses) */
  extractedContext?: string
  /** Whether context has been saved */
  contextSaved: boolean
  /** Session creation time (ISO date string) */
  createdAt: string
  /** Last update time (ISO date string) */
  updatedAt: string
  /** Number of messages in the session */
  messageCount: number
  /** External session ID for CLI agent session resumption */
  externalSessionId?: string
}

/**
 * A message in a context chat session
 */
export interface ContextChatMessage {
  /** Unique message ID */
  id: string
  /** Session this message belongs to */
  sessionId: string
  /** Message role (user/assistant/system) */
  role: ChatMessageRole
  /** Message content */
  content: string
  /** When message was created (ISO date string) */
  createdAt: string
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request to start a context chat session
 */
export interface StartContextChatRequest {
  projectPath: string
  agentType: string
}

/**
 * Request to send a message in context chat
 */
export interface SendContextChatMessageRequest {
  sessionId: string
  projectPath: string
  content: string
}

/**
 * Response from sending a context chat message
 */
export interface SendContextChatMessageResponse {
  /** The user's message */
  userMessage: ContextChatMessage
  /** The assistant's response message */
  assistantMessage: ContextChatMessage
  /** Extracted context (if <context> block found in response) */
  extractedContext?: string
}

/**
 * Request to save context from chat
 */
export interface SaveContextFromChatRequest {
  sessionId: string
  projectPath: string
  /** Optional custom content (defaults to extracted context) */
  content?: string
}

// ============================================================================
// Constants
// ============================================================================

/** Maximum size for a single context file (2KB to keep prompts manageable) */
export const MAX_CONTEXT_FILE_SIZE = 2048

/** Approximate tokens per character (rough estimate for display) */
export const TOKENS_PER_CHAR = 0.25

/** Default template for single-file context */
export const DEFAULT_CONTEXT_TEMPLATE = `# Project Context

## Product
<!-- What is this product? Who is it for? What problems does it solve? -->

## Tech Stack
<!-- Key technologies, frameworks, languages, architecture patterns -->

## Conventions
<!-- Coding style, naming conventions, file organization patterns -->

## Workflow
<!-- Development process preferences (TDD, PR requirements, etc.) -->
`

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Estimate token count for content
 */
export function estimateTokens(content: string): number {
  return Math.floor(content.length * TOKENS_PER_CHAR)
}

/**
 * Check if context state is configured (has any files)
 */
export function isContextConfigured(context: ProjectContextState): boolean {
  return context.files.length > 0
}

/**
 * Get total token count across all context files
 */
export function getTotalTokenCount(context: ProjectContextState): number {
  return context.files.reduce((sum, file) => sum + file.tokenCount, 0)
}

/**
 * Capitalize a context file name for display (e.g., "tech-stack" -> "Tech Stack")
 */
export function capitalizeContextFileName(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Create default context config
 */
export function createDefaultContextConfig(): ContextConfig {
  return {
    enabled: true,
    mode: 'single',
    includeInPrdChat: true,
    includeInRalphLoop: true,
    enabledFiles: ['product', 'tech-stack', 'workflow', 'conventions'],
  }
}

/**
 * Create default project context state
 */
export function createDefaultProjectContext(): ProjectContextState {
  return {
    config: createDefaultContextConfig(),
    files: [],
    setupDismissed: false,
  }
}
