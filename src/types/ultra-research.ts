// Ultra Research Mode types for multi-agent deep research

import type { AgentType } from './agent'

// ============================================================================
// Research Agent Configuration
// ============================================================================

/** Role that an agent plays in ultra research */
export type ResearchAgentRole = 'researcher' | 'moderator' | 'synthesizer'

/** Status of a research agent during execution */
export type ResearchAgentStatus =
  | 'idle'
  | 'researching'
  | 'discussing'
  | 'complete'
  | 'error'

/** Configuration for a single research agent */
export interface ResearchAgent {
  /** Unique identifier for the agent */
  id: string
  /** Display name for the agent */
  name: string
  /** Agent type (claude, opencode, cursor, etc.) */
  agentType: AgentType
  /** Provider ID for Claude agents (e.g., "zai", "minimax") */
  providerId?: string
  /** Role in the research process */
  role: ResearchAgentRole
  /** Research focus area (e.g., "Security", "UX/DX", "Performance") */
  angle?: string
  /** Current status during execution */
  status: ResearchAgentStatus
}

// ============================================================================
// Research Configuration
// ============================================================================

/** Execution mode for ultra research */
export type ResearchExecutionMode = 'parallel' | 'sequential'

/** Configuration for an ultra research session */
export interface UltraResearchConfig {
  /** Unique identifier for the config */
  id: string
  /** Whether ultra research is enabled */
  enabled: boolean
  /** Execution mode: parallel (faster) or sequential (deeper) */
  mode: ResearchExecutionMode
  /** List of research agents (max 5) */
  agents: ResearchAgent[]
  /** Number of discussion rounds (0-3) */
  discussionRounds: number
  /** Model/agent to use for final synthesis */
  synthesizeModel: string
}

// ============================================================================
// Research Findings
// ============================================================================

/** A finding from a research agent */
export interface ResearchFinding {
  /** ID of the agent that produced this finding */
  agentId: string
  /** Research angle/focus area */
  angle: string
  /** The actual research content */
  content: string
  /** Optional sources/references */
  sources?: string[]
  /** Confidence level (0-100) */
  confidence: number
  /** When this finding was produced */
  timestamp: string
}

// ============================================================================
// Discussion Types
// ============================================================================

/** Type of discussion entry */
export type DiscussionEntryType = 'feedback' | 'challenge' | 'agreement' | 'addition'

/** An entry in the agent discussion */
export interface DiscussionEntry {
  /** Discussion round number (1-based) */
  round: number
  /** ID of the agent making this entry */
  agentId: string
  /** ID of the agent being responded to (optional) */
  targetAgentId?: string
  /** Type of discussion contribution */
  type: DiscussionEntryType
  /** The discussion content */
  content: string
  /** When this entry was made */
  timestamp: string
}

// ============================================================================
// Research Session
// ============================================================================

/** Status of the overall research session */
export type ResearchSessionStatus =
  | 'planning'
  | 'researching'
  | 'discussing'
  | 'synthesizing'
  | 'complete'
  | 'error'
  | 'cancelled'

/** A complete ultra research session */
export interface ResearchSession {
  /** Unique identifier for the session */
  id: string
  /** ID of the chat session that initiated this research */
  chatSessionId: string
  /** Project path for this research session */
  projectPath: string
  /** Configuration used for this session */
  config: UltraResearchConfig
  /** The original user query that started the research */
  query: string
  /** Research angles assigned by the orchestrator */
  angles: string[]
  /** Findings from all agents */
  findings: ResearchFinding[]
  /** Discussion entries from all rounds */
  discussionLog: DiscussionEntry[]
  /** Final synthesized PRD content */
  synthesizedPrd?: string
  /** Current status of the session */
  status: ResearchSessionStatus
  /** Error message if status is 'error' */
  error?: string
  /** When the session was created */
  createdAt: string
  /** When the session was last updated */
  updatedAt: string
}

// ============================================================================
// Progress & Events
// ============================================================================

/** Progress information for the research session */
export interface ResearchProgress {
  /** Current status */
  status: ResearchSessionStatus
  /** Overall completion percentage (0-100) */
  overallProgress: number
  /** Current phase description */
  currentPhase: string
  /** Number of agents completed */
  agentsCompleted: number
  /** Total number of agents */
  totalAgents: number
  /** Current discussion round (if in discussing phase) */
  currentRound?: number
  /** Total discussion rounds configured */
  totalRounds: number
  /** Per-agent status */
  agentStatuses: Record<string, ResearchAgentStatus>
}

/** Event payload for agent progress updates */
export interface ResearchAgentProgressPayload {
  /** Session ID */
  sessionId: string
  /** Agent ID */
  agentId: string
  /** Streaming content chunk */
  content: string
}

/** Event payload for research session updates */
export interface ResearchSessionUpdatePayload {
  /** Session ID */
  sessionId: string
  /** Progress information */
  progress: ResearchProgress
}

/** Event payload for research errors */
export interface ResearchErrorPayload {
  /** Session ID */
  sessionId: string
  /** Error message */
  error: string
  /** Agent ID if error is agent-specific */
  agentId?: string
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/** Request to start an ultra research session */
export interface StartUltraResearchRequest {
  /** Configuration for the research */
  config: UltraResearchConfig
  /** The research query/topic */
  query: string
  /** Project path for context */
  projectPath: string
  /** Chat session ID to associate with */
  chatSessionId: string
}

/** Response from starting an ultra research session */
export interface StartUltraResearchResponse {
  /** The created research session */
  session: ResearchSession
}

/** Request to cancel a research session */
export interface CancelResearchRequest {
  /** Session ID to cancel */
  sessionId: string
}

/** Request to get research progress */
export interface GetResearchProgressRequest {
  /** Session ID */
  sessionId: string
}

// ============================================================================
// Default Configuration
// ============================================================================

/** Create a default ultra research configuration */
export function createDefaultUltraResearchConfig(): UltraResearchConfig {
  return {
    id: '',
    enabled: false,
    mode: 'parallel',
    agents: [],
    discussionRounds: 1,
    synthesizeModel: 'claude',
  }
}

/** Create a default research agent */
export function createDefaultResearchAgent(
  id: string,
  agentType: AgentType = 'claude',
  providerId?: string
): ResearchAgent {
  return {
    id,
    name: agentType.charAt(0).toUpperCase() + agentType.slice(1),
    agentType,
    providerId,
    role: 'researcher',
    status: 'idle',
  }
}

/** Maximum number of agents allowed */
export const MAX_RESEARCH_AGENTS = 5

/** Maximum number of discussion rounds */
export const MAX_DISCUSSION_ROUNDS = 3

/** Default research angles */
export const DEFAULT_RESEARCH_ANGLES = [
  'Security & Compliance',
  'User Experience',
  'Performance & Scalability',
  'Architecture & Maintainability',
  'Testing & Quality',
]
