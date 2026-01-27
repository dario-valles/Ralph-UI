/**
 * Shared types for PRD Chat store slices
 */
import type {
  ChatSession,
  ChatMessage,
  ChatAttachment,
  QualityAssessment,
  GuidedQuestion,
  ExtractedPRDContent,
  PRDTypeValue,
  AgentType,
} from '@/types'
import type {
  ResearchStatus,
  ResearchResult,
  ResearchSynthesis,
} from '@/types/gsd'
import type {
  RequirementsDoc,
  RoadmapDoc,
  ScopeSelection,
  RequirementCategory,
  Requirement,
} from '@/types/planning'
import type { AsyncState } from '@/lib/store-utils'

/**
 * Phase state for hybrid GSD in chat
 */
export interface HybridPhaseState {
  /** Whether research has been started */
  researchStarted: boolean
  /** Whether research is complete */
  researchComplete: boolean
  /** Whether requirements have been generated */
  requirementsGenerated: boolean
  /** Whether scoping is complete (no unscoped requirements) */
  scopingComplete: boolean
  /** Whether roadmap has been generated */
  roadmapGenerated: boolean
  /** Number of unscoped requirements */
  unscopedCount: number
}

/**
 * Initial research status
 */
export const INITIAL_RESEARCH_STATUS: ResearchStatus = {
  architecture: { running: false, complete: false },
  codebase: { running: false, complete: false },
  bestPractices: { running: false, complete: false },
  risks: { running: false, complete: false },
}

/**
 * Initial phase state
 */
export const INITIAL_PHASE_STATE: HybridPhaseState = {
  researchStarted: false,
  researchComplete: false,
  requirementsGenerated: false,
  scopingComplete: false,
  roadmapGenerated: false,
  unscopedCount: 0,
}

/**
 * Options for starting a chat session
 */
export interface StartSessionOptions {
  agentType: string
  projectPath: string // Required for file-based storage
  prdId?: string
  prdType?: PRDTypeValue
  guidedMode?: boolean
  templateId?: string
  structuredMode?: boolean
  title?: string // Custom session title
}

// ============================================================================
// Slice State Interfaces
// ============================================================================

/**
 * Core chat state (sessions, messages, basic state)
 */
export interface ChatCoreState extends AsyncState {
  sessions: ChatSession[]
  currentSession: ChatSession | null
  messages: ChatMessage[]
  streaming: boolean
  processingSessionId: string | null
}

/**
 * Session management slice state and actions
 */
export interface ChatSessionSlice {
  // State is in ChatCoreState
  // Actions
  startSession: (options: StartSessionOptions) => Promise<void>
  updateSessionAgent: (agentType: string, providerId?: string) => Promise<void>
  loadSessions: (projectPath?: string) => Promise<void>
  setCurrentSession: (session: ChatSession | null) => void
  deleteSession: (sessionId: string) => Promise<void>
  clearError: () => void
}

/**
 * Messaging slice state and actions
 */
export interface MessagingSlice {
  // State
  qualityAssessment: QualityAssessment | null
  guidedQuestions: GuidedQuestion[]
  extractedContent: ExtractedPRDContent | null

  // Actions
  sendMessage: (content: string, attachments?: ChatAttachment[]) => Promise<void>
  loadHistory: (sessionId: string, projectPath?: string) => Promise<void>
  assessQuality: () => Promise<QualityAssessment | null>
  loadGuidedQuestions: (prdType: PRDTypeValue) => Promise<void>
  previewExtraction: () => Promise<ExtractedPRDContent | null>
  setStructuredMode: (enabled: boolean) => Promise<void>
  clearExtractedStructure: () => Promise<void>
}

/**
 * File watching slice state and actions
 */
export interface FileWatchSlice {
  // State
  watchedPlanContent: string | null
  watchedPlanPath: string | null
  isWatchingPlan: boolean

  // Actions
  startWatchingPlanFile: () => Promise<void>
  stopWatchingPlanFile: () => Promise<void>
  updatePlanContent: (content: string, path: string) => void
}

/**
 * Research slice state and actions (hybrid GSD)
 */
export interface ResearchSlice {
  // State
  researchStatus: ResearchStatus
  researchResults: ResearchResult[]
  researchSynthesis: ResearchSynthesis | null
  selectedResearchAgent: AgentType | null
  availableResearchAgents: AgentType[]
  isResearchRunning: boolean
  isSynthesizing: boolean

  // Actions
  loadAvailableAgents: () => Promise<void>
  setSelectedResearchAgent: (agent: AgentType | null) => void
  setResearchStatus: (status: ResearchStatus | null, isRunning?: boolean) => void
  checkResearchStatus: () => Promise<void>
  loadSynthesis: () => Promise<void>
  startResearch: (context: string, agentType?: string) => Promise<void>
  synthesizeResearch: () => Promise<ResearchSynthesis | null>
}

/**
 * GSD workflow slice state and actions (requirements, scoping, roadmap)
 */
export interface GsdSlice {
  // State
  requirementsDoc: RequirementsDoc | null
  roadmapDoc: RoadmapDoc | null
  phaseState: HybridPhaseState
  isGeneratingRequirements: boolean

  // Actions
  generateRequirements: () => Promise<RequirementsDoc | null>
  loadRequirements: () => Promise<void>
  applyScopeSelection: (selection: ScopeSelection) => Promise<void>
  addRequirement: (
    category: RequirementCategory,
    title: string,
    description: string
  ) => Promise<Requirement | null>
  generateRoadmap: () => Promise<RoadmapDoc | null>
  loadRoadmap: () => Promise<void>
  clearHybridState: () => void
  updatePhaseState: () => void
}

// ============================================================================
// Combined Store Type
// ============================================================================

/**
 * Full PRD Chat store type combining all slices
 */
export type PRDChatStore = ChatCoreState &
  ChatSessionSlice &
  MessagingSlice &
  FileWatchSlice &
  ResearchSlice &
  GsdSlice

/**
 * Zustand setter type for slices
 */
export type SetState = (
  partial: Partial<PRDChatStore> | ((state: PRDChatStore) => Partial<PRDChatStore>)
) => void

/**
 * Zustand getter type for slices
 */
export type GetState = () => PRDChatStore

/**
 * Helper to get required session with project path
 * Returns null if not available
 */
export const getSessionWithPath = (
  get: GetState
): { session: ChatSession; projectPath: string } | null => {
  const { currentSession } = get()
  if (!currentSession || !currentSession.projectPath) {
    return null
  }
  return { session: currentSession, projectPath: currentSession.projectPath }
}
