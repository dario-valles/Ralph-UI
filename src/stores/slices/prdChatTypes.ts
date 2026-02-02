/**
 * Shared types for PRD Chat store slices
 *
 * Note: GSD workflow has been replaced by prd-workflow. Use prdWorkflowStore for workflow management.
 */
import type {
  ChatSession,
  ChatMessage,
  ChatAttachment,
  QualityAssessment,
  EnhancedQualityReport,
  UnifiedQualityReport,
  GuidedQuestion,
  ExtractedPRDContent,
  PRDTypeValue,
} from '@/types'
import type { AsyncState } from '@/lib/store-utils'
import type { ContextSlice } from './contextSlice'

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
  /** @deprecated Use unifiedQualityReport instead - kept for backwards compatibility */
  qualityAssessment: QualityAssessment | null
  /** @deprecated Use unifiedQualityReport instead - kept for backwards compatibility */
  enhancedQualityReport: EnhancedQualityReport | null
  /** Unified quality report combining 13-check system with 3D dimension scores */
  unifiedQualityReport: UnifiedQualityReport | null
  guidedQuestions: GuidedQuestion[]
  extractedContent: ExtractedPRDContent | null

  // Actions
  sendMessage: (content: string, attachments?: ChatAttachment[]) => Promise<void>
  loadHistory: (sessionId: string, projectPath?: string) => Promise<void>
  /** @deprecated Use assessUnifiedQuality instead */
  assessQuality: () => Promise<QualityAssessment | null>
  /** @deprecated Use assessUnifiedQuality instead */
  assessEnhancedQuality: () => Promise<EnhancedQualityReport | null>
  /** Assess unified quality - combines 13-check system with 3D dimension scores */
  assessUnifiedQuality: () => Promise<UnifiedQualityReport | null>
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
  ContextSlice

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
