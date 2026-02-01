/**
 * PRD Chat State Management Store
 *
 * This store manages PRD chat functionality including:
 * - Chat sessions and messages
 * - Messaging with AI agents
 * - File watching for plan updates
 *
 * Note: For PRD workflow management (phases, requirements, research),
 * use prdWorkflowStore instead.
 */
import { create } from 'zustand'
import {
  // Types
  type PRDChatStore,
  type StartSessionOptions,
  // Slices
  createChatSessionSlice,
  createMessagingSlice,
  createFileWatchSlice,
} from './slices'

// Re-export types
export type { StartSessionOptions }

/**
 * PRD Chat Store
 *
 * Combines all slices into a single store with unified state management.
 */
export const usePRDChatStore = create<PRDChatStore>((set, get) => {
  const chatSessionSlice = createChatSessionSlice(set, get)
  const messagingSlice = createMessagingSlice(set, get)
  const fileWatchSlice = createFileWatchSlice(set, get)

  return {
    // Core State (ChatCoreState)
    sessions: [],
    currentSession: null,
    messages: [],
    loading: false,
    streaming: false,
    error: null,
    processingSessionId: null,

    // Messaging State
    qualityAssessment: messagingSlice.qualityAssessment,
    enhancedQualityReport: messagingSlice.enhancedQualityReport,
    unifiedQualityReport: messagingSlice.unifiedQualityReport,
    guidedQuestions: messagingSlice.guidedQuestions,
    extractedContent: messagingSlice.extractedContent,

    // File Watch State
    watchedPlanContent: fileWatchSlice.watchedPlanContent,
    watchedPlanPath: fileWatchSlice.watchedPlanPath,
    isWatchingPlan: fileWatchSlice.isWatchingPlan,

    // Chat Session Actions
    startSession: chatSessionSlice.startSession,
    updateSessionAgent: chatSessionSlice.updateSessionAgent,
    loadSessions: chatSessionSlice.loadSessions,
    setCurrentSession: chatSessionSlice.setCurrentSession,
    deleteSession: chatSessionSlice.deleteSession,
    clearError: chatSessionSlice.clearError,

    // Messaging Actions
    sendMessage: messagingSlice.sendMessage,
    loadHistory: messagingSlice.loadHistory,
    assessQuality: messagingSlice.assessQuality,
    assessEnhancedQuality: messagingSlice.assessEnhancedQuality,
    assessUnifiedQuality: messagingSlice.assessUnifiedQuality,
    loadGuidedQuestions: messagingSlice.loadGuidedQuestions,
    previewExtraction: messagingSlice.previewExtraction,
    setStructuredMode: messagingSlice.setStructuredMode,
    clearExtractedStructure: messagingSlice.clearExtractedStructure,

    // File Watch Actions
    startWatchingPlanFile: fileWatchSlice.startWatchingPlanFile,
    stopWatchingPlanFile: fileWatchSlice.stopWatchingPlanFile,
    updatePlanContent: fileWatchSlice.updatePlanContent,
  }
})
