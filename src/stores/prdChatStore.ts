/**
 * PRD Chat State Management Store
 *
 * This store manages all PRD chat functionality including:
 * - Chat sessions and messages
 * - Messaging with AI agents
 * - File watching for plan updates
 * - Research operations (hybrid GSD)
 * - Requirements and roadmap generation (GSD workflow)
 *
 * The store is organized using the Zustand slices pattern for maintainability.
 */
import { create } from 'zustand'
import {
  // Types
  type PRDChatStore,
  type HybridPhaseState,
  type StartSessionOptions,
  // Slices
  createChatSessionSlice,
  createMessagingSlice,
  createFileWatchSlice,
  createResearchSlice,
  createGsdSlice,
} from './slices'

// Re-export types for backward compatibility
export type { HybridPhaseState, StartSessionOptions }

/**
 * PRD Chat Store
 *
 * Combines all slices into a single store with unified state management.
 */
export const usePRDChatStore = create<PRDChatStore>((set, get) => {
  // Create all slices
  const chatSessionSlice = createChatSessionSlice(set, get)
  const messagingSlice = createMessagingSlice(set, get)
  const fileWatchSlice = createFileWatchSlice(set, get)
  const researchSlice = createResearchSlice(set, get)
  const gsdSlice = createGsdSlice(set, get)

  return {
    // =========================================================================
    // Core State (ChatCoreState)
    // =========================================================================
    sessions: [],
    currentSession: null,
    messages: [],
    loading: false,
    streaming: false,
    error: null,
    processingSessionId: null,

    // =========================================================================
    // Messaging State
    // =========================================================================
    qualityAssessment: messagingSlice.qualityAssessment,
    guidedQuestions: messagingSlice.guidedQuestions,
    extractedContent: messagingSlice.extractedContent,

    // =========================================================================
    // File Watch State
    // =========================================================================
    watchedPlanContent: fileWatchSlice.watchedPlanContent,
    watchedPlanPath: fileWatchSlice.watchedPlanPath,
    isWatchingPlan: fileWatchSlice.isWatchingPlan,

    // =========================================================================
    // Research State (Hybrid GSD)
    // =========================================================================
    researchStatus: researchSlice.researchStatus,
    researchResults: researchSlice.researchResults,
    researchSynthesis: researchSlice.researchSynthesis,
    selectedResearchAgent: researchSlice.selectedResearchAgent,
    availableResearchAgents: researchSlice.availableResearchAgents,
    isResearchRunning: researchSlice.isResearchRunning,
    isSynthesizing: researchSlice.isSynthesizing,

    // =========================================================================
    // GSD Workflow State
    // =========================================================================
    requirementsDoc: gsdSlice.requirementsDoc,
    roadmapDoc: gsdSlice.roadmapDoc,
    phaseState: gsdSlice.phaseState,
    isGeneratingRequirements: gsdSlice.isGeneratingRequirements,

    // =========================================================================
    // Chat Session Actions
    // =========================================================================
    startSession: chatSessionSlice.startSession,
    updateSessionAgent: chatSessionSlice.updateSessionAgent,
    loadSessions: chatSessionSlice.loadSessions,
    setCurrentSession: chatSessionSlice.setCurrentSession,
    deleteSession: chatSessionSlice.deleteSession,
    clearError: chatSessionSlice.clearError,

    // =========================================================================
    // Messaging Actions
    // =========================================================================
    sendMessage: messagingSlice.sendMessage,
    loadHistory: messagingSlice.loadHistory,
    assessQuality: messagingSlice.assessQuality,
    loadGuidedQuestions: messagingSlice.loadGuidedQuestions,
    previewExtraction: messagingSlice.previewExtraction,
    setStructuredMode: messagingSlice.setStructuredMode,
    clearExtractedStructure: messagingSlice.clearExtractedStructure,

    // =========================================================================
    // File Watch Actions
    // =========================================================================
    startWatchingPlanFile: fileWatchSlice.startWatchingPlanFile,
    stopWatchingPlanFile: fileWatchSlice.stopWatchingPlanFile,
    updatePlanContent: fileWatchSlice.updatePlanContent,

    // =========================================================================
    // Research Actions (Hybrid GSD)
    // =========================================================================
    loadAvailableAgents: researchSlice.loadAvailableAgents,
    setSelectedResearchAgent: researchSlice.setSelectedResearchAgent,
    setResearchStatus: researchSlice.setResearchStatus,
    checkResearchStatus: researchSlice.checkResearchStatus,
    loadSynthesis: researchSlice.loadSynthesis,
    startResearch: researchSlice.startResearch,
    synthesizeResearch: researchSlice.synthesizeResearch,

    // =========================================================================
    // GSD Workflow Actions
    // =========================================================================
    generateRequirements: gsdSlice.generateRequirements,
    loadRequirements: gsdSlice.loadRequirements,
    applyScopeSelection: gsdSlice.applyScopeSelection,
    addRequirement: gsdSlice.addRequirement,
    generateRoadmap: gsdSlice.generateRoadmap,
    loadRoadmap: gsdSlice.loadRoadmap,
    clearHybridState: gsdSlice.clearHybridState,
    updatePhaseState: gsdSlice.updatePhaseState,
  }
})
