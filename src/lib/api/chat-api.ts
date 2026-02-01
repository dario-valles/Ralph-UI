// PRD Chat API wrappers

import type {
  ChatSession,
  ChatMessage,
  ChatAttachment,
  SendMessageResponse,
  QualityAssessment,
  DetailedQualityAssessment,
  EnhancedQualityReport,
  UnifiedQualityReport,
  GuidedQuestion,
  ExtractedPRDContent,
  PRDTypeValue,
  AssignPrdResult,
} from '@/types'
import { invoke } from '../invoke'
import type { AgentAvailabilityResult, WatchFileResponse } from './types'

export const prdChatApi = {
  startSession: async (
    agentType: string,
    projectPath: string,
    prdId?: string,
    prdType?: PRDTypeValue,
    guidedMode?: boolean,
    templateId?: string,
    structuredMode?: boolean,
    title?: string
  ): Promise<ChatSession> => {
    return await invoke('start_prd_chat_session', {
      request: {
        agentType,
        projectPath,
        prdId,
        prdType,
        guidedMode,
        templateId,
        structuredMode,
        title,
      },
    })
  },

  sendMessage: async (
    sessionId: string,
    content: string,
    projectPath: string,
    attachments?: ChatAttachment[]
  ): Promise<SendMessageResponse> => {
    return await invoke('send_prd_chat_message', {
      request: { sessionId, content, projectPath, attachments },
    })
  },

  getHistory: async (sessionId: string, projectPath: string): Promise<ChatMessage[]> => {
    return await invoke('get_prd_chat_history', { sessionId, projectPath })
  },

  getSessions: async (projectPath: string): Promise<ChatSession[]> => {
    return await invoke('list_prd_chat_sessions', { projectPath })
  },

  /** Update agent type and optional provider for a session */
  updateSessionAgent: async (
    sessionId: string,
    projectPath: string,
    agentType: string,
    providerId?: string
  ): Promise<void> => {
    return await invoke('update_prd_chat_agent', { sessionId, projectPath, agentType, providerId })
  },

  deleteSession: async (sessionId: string, projectPath: string): Promise<void> => {
    return await invoke('delete_prd_chat_session', { sessionId, projectPath })
  },

  /**
   * @deprecated Use assessUnifiedQuality instead
   * Assess the quality of a PRD chat session before export
   */
  assessQuality: async (sessionId: string, projectPath: string): Promise<QualityAssessment> => {
    return await invoke('assess_prd_quality', { sessionId, projectPath })
  },

  /**
   * @deprecated Use assessUnifiedQuality instead - this endpoint is unused
   * Assess detailed quality with specific checks (vague language, testability, etc.)
   */
  assessDetailedQuality: async (
    sessionId: string,
    projectPath: string
  ): Promise<DetailedQualityAssessment> => {
    return await invoke('assess_detailed_prd_quality', { sessionId, projectPath })
  },

  /**
   * @deprecated Use assessUnifiedQuality instead
   * Assess enhanced quality with 13-point checklist and vague language detection
   */
  assessEnhancedQuality: async (
    sessionId: string,
    projectPath: string
  ): Promise<EnhancedQualityReport> => {
    return await invoke('assess_enhanced_prd_quality', { sessionId, projectPath })
  },

  /** Assess unified quality combining 13-check system with 3D dimension scores */
  assessUnifiedQuality: async (
    sessionId: string,
    projectPath: string
  ): Promise<UnifiedQualityReport> => {
    return await invoke('assess_unified_prd_quality', { sessionId, projectPath })
  },

  /** Get guided questions based on PRD type */
  getGuidedQuestions: async (prdType: PRDTypeValue): Promise<GuidedQuestion[]> => {
    return await invoke('get_guided_questions', { prdType })
  },

  /** Preview extracted PRD content before export */
  previewExtraction: async (
    sessionId: string,
    projectPath: string
  ): Promise<ExtractedPRDContent> => {
    return await invoke('preview_prd_extraction', { sessionId, projectPath })
  },

  /** Check if an agent CLI is available in the system PATH */
  checkAgentAvailability: async (agentType: string): Promise<AgentAvailabilityResult> => {
    return await invoke('check_agent_availability', { agentType })
  },

  /** Set structured output mode for a session */
  setStructuredMode: async (
    sessionId: string,
    projectPath: string,
    enabled: boolean
  ): Promise<void> => {
    return await invoke('set_structured_mode', { sessionId, projectPath, enabled })
  },

  /** Clear extracted structure for a session */
  clearExtractedStructure: async (sessionId: string, projectPath: string): Promise<void> => {
    return await invoke('clear_extracted_structure', { sessionId, projectPath })
  },

  /** Start watching a PRD plan file for changes */
  startWatchingPlanFile: async (
    sessionId: string,
    projectPath: string
  ): Promise<WatchFileResponse> => {
    return await invoke('start_watching_prd_file', { sessionId, projectPath })
  },

  /** Stop watching a PRD plan file */
  stopWatchingPlanFile: async (sessionId: string): Promise<boolean> => {
    return await invoke('stop_watching_prd_file', { sessionId })
  },

  /** Get the current content of a PRD plan file */
  getPlanContent: async (sessionId: string, projectPath: string): Promise<string | null> => {
    return await invoke('get_prd_plan_content', { sessionId, projectPath })
  },

  /** Assign an external .md file as the PRD for a session */
  assignFileAsPrd: async (
    projectPath: string,
    sessionId: string,
    sourceFilePath: string
  ): Promise<AssignPrdResult> => {
    return await invoke('assign_file_as_prd', { projectPath, sessionId, sourceFilePath })
  },

  /** Update a session's prd_id (used for auto-assignment when agent creates PRD in standard location) */
  updateSessionPrdId: async (
    projectPath: string,
    sessionId: string,
    prdId: string
  ): Promise<void> => {
    return await invoke('update_session_prd_id', { projectPath, sessionId, prdId })
  },
}
