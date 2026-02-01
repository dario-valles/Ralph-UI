/**
 * Messaging Slice
 *
 * Handles message sending/receiving, quality assessment, guided questions,
 * and structured output mode.
 */
import { prdChatApi } from '@/lib/backend-api'
import { asyncAction, errorToString } from '@/lib/store-utils'
import { generateUUID } from '@/lib/utils'
import type {
  SetState,
  GetState,
  MessagingSlice,
} from './prdChatTypes'
import { getSessionWithPath } from './prdChatTypes'
import type {
  ChatMessage,
  ChatAttachment,
  QualityAssessment,
  EnhancedQualityReport,
  UnifiedQualityReport,
  ExtractedPRDContent,
  PRDTypeValue,
} from '@/types'

/**
 * Creates the messaging slice
 */
export const createMessagingSlice = (
  set: SetState,
  get: GetState
): MessagingSlice => ({
  // Initial state
  qualityAssessment: null,
  enhancedQualityReport: null,
  unifiedQualityReport: null,
  guidedQuestions: [],
  extractedContent: null,

  // Send a message and receive a response
  sendMessage: async (content: string, attachments?: ChatAttachment[]) => {
    const { currentSession } = get()
    if (!currentSession) {
      throw new Error('No active session')
    }
    if (!currentSession.projectPath) {
      throw new Error('Session has no project path')
    }

    // Capture session ID at start to verify it hasn't changed when response arrives
    const sessionId = currentSession.id
    const projectPath = currentSession.projectPath

    // Log agent configuration being used
    const agentType = currentSession.agentType || 'claude'
    const providerId = currentSession.providerId
    console.log('📤 [PRD Chat] Sending message:')
    console.log('  Agent:', agentType)
    console.log('  Provider:', providerId || '(default)')
    console.log('  Session:', sessionId)
    console.log('  Message preview:', content.substring(0, 100) + (content.length > 100 ? '...' : ''))

    // Create optimistic user message with UUID to prevent collision
    const optimisticMessage: ChatMessage = {
      id: `temp-${generateUUID()}`,
      sessionId,
      role: 'user',
      content,
      createdAt: new Date().toISOString(),
      attachments,
    }

    // Add optimistic message and set streaming state
    set((state) => ({
      messages: [...state.messages, optimisticMessage],
      streaming: true,
      processingSessionId: sessionId,
      error: null,
    }))

    try {
      const response = await prdChatApi.sendMessage(sessionId, content, projectPath, attachments)

      // Replace optimistic message with actual messages and update session message count
      set((state) => {
        // If user switched to a different session while processing,
        // don't update messages - just clear streaming state
        if (state.currentSession?.id !== sessionId) {
          return {
            streaming: false,
            processingSessionId: null,
          }
        }

        // Update current session's message count locally
        const updatedSession = state.currentSession
          ? {
              ...state.currentSession,
              messageCount: (state.currentSession.messageCount || 0) + 2,
            }
          : null

        // Also update the session in the sessions list
        const updatedSessions = state.sessions.map((s) =>
          s.id === updatedSession?.id ? updatedSession : s
        )

        return {
          messages: [
            ...state.messages.filter((m) => m.id !== optimisticMessage.id),
            response.userMessage,
            response.assistantMessage,
          ],
          streaming: false,
          processingSessionId: null,
          currentSession: updatedSession,
          sessions: updatedSessions,
        }
      })
    } catch (error) {
      // Remove optimistic message on error (only if still on same session)
      set((state) => {
        // If user switched sessions, just clear streaming state
        if (state.currentSession?.id !== sessionId) {
          return {
            streaming: false,
            processingSessionId: null,
            error: errorToString(error),
          }
        }
        return {
          messages: state.messages.filter((m) => m.id !== optimisticMessage.id),
          streaming: false,
          processingSessionId: null,
          error: errorToString(error),
        }
      })
      throw error
    }
  },

  // Load message history for a session
  // projectPath can be passed explicitly for robustness (e.g., during reconnection)
  loadHistory: async (sessionId: string, projectPath?: string) => {
    // Resolve project path: explicit param > currentSession > sessions list
    let resolvedPath = projectPath
    if (!resolvedPath) {
      const ctx = getSessionWithPath(get)
      resolvedPath = ctx?.projectPath
    }
    if (!resolvedPath) {
      const { sessions } = get()
      const session = sessions.find((s) => s.id === sessionId)
      resolvedPath = session?.projectPath
    }
    if (!resolvedPath) {
      set({ error: 'No project path available' })
      return
    }

    await asyncAction(set, async () => {
      const messages = await prdChatApi.getHistory(sessionId, resolvedPath!)

      // Check if operation completed while we were away (last message is from assistant)
      // If so, clear streaming state since the response is already available
      const { streaming, processingSessionId } = get()
      const lastMessage = messages[messages.length - 1]
      const operationCompleted =
        streaming && processingSessionId === sessionId && lastMessage?.role === 'assistant'

      return {
        messages,
        ...(operationCompleted ? { streaming: false, processingSessionId: null } : {}),
      }
    })
  },

  // Assess quality of current session
  assessQuality: async (): Promise<QualityAssessment | null> => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return null

    set({ loading: true, error: null })
    try {
      const assessment = await prdChatApi.assessQuality(ctx.session.id, ctx.projectPath)
      set({ qualityAssessment: assessment, loading: false })
      return assessment
    } catch (error) {
      set({ error: errorToString(error), loading: false })
      return null
    }
  },

  // Assess enhanced quality with 13-point checklist
  assessEnhancedQuality: async (): Promise<EnhancedQualityReport | null> => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return null

    set({ loading: true, error: null })
    try {
      const report = await prdChatApi.assessEnhancedQuality(ctx.session.id, ctx.projectPath)
      set({ enhancedQualityReport: report, loading: false })
      return report
    } catch (error) {
      set({ error: errorToString(error), loading: false })
      return null
    }
  },

  // Assess unified quality - combines 13-check system with 3D dimension scores
  assessUnifiedQuality: async (): Promise<UnifiedQualityReport | null> => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return null

    set({ loading: true, error: null })
    try {
      const report = await prdChatApi.assessUnifiedQuality(ctx.session.id, ctx.projectPath)
      // Also update legacy fields for backwards compatibility
      const legacyAssessment = {
        completeness: report.completeness,
        clarity: report.clarity,
        actionability: report.actionability,
        overall: report.overall,
        missingSections: report.missingSections,
        suggestions: report.suggestions,
        readyForExport: report.readyForExport,
      }
      set({
        unifiedQualityReport: report,
        qualityAssessment: legacyAssessment,
        enhancedQualityReport: {
          checks: report.checks,
          vagueWarnings: report.vagueWarnings,
          totalScore: report.checks.reduce((sum, c) => sum + c.score, 0),
          maxScore: report.checks.reduce((sum, c) => sum + c.maxScore, 0),
          percentage: report.overall,
          grade: report.grade,
          passedCount: report.passedCount,
          totalChecks: report.totalChecks,
          readyForExport: report.readyForExport,
          summary: report.summary,
        },
        loading: false,
      })
      return report
    } catch (error) {
      set({ error: errorToString(error), loading: false })
      return null
    }
  },

  // Load guided questions for a PRD type
  loadGuidedQuestions: async (prdType: PRDTypeValue) => {
    try {
      const questions = await prdChatApi.getGuidedQuestions(prdType)
      set({ guidedQuestions: questions })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  // Preview extraction before export
  previewExtraction: async (): Promise<ExtractedPRDContent | null> => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return null

    set({ loading: true, error: null })
    try {
      const content = await prdChatApi.previewExtraction(ctx.session.id, ctx.projectPath)
      set({ extractedContent: content, loading: false })
      return content
    } catch (error) {
      set({ error: errorToString(error), loading: false })
      return null
    }
  },

  // Set structured output mode for current session
  setStructuredMode: async (enabled: boolean) => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return

    try {
      await prdChatApi.setStructuredMode(ctx.session.id, ctx.projectPath, enabled)
      // Update local state
      set((state) => {
        const updatedSession = state.currentSession
          ? { ...state.currentSession, structuredMode: enabled }
          : null
        const updatedSessions = state.sessions.map((s) =>
          s.id === ctx.session.id ? { ...s, structuredMode: enabled } : s
        )
        return {
          currentSession: updatedSession,
          sessions: updatedSessions,
        }
      })
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },

  // Clear extracted structure for current session
  clearExtractedStructure: async () => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return

    try {
      await prdChatApi.clearExtractedStructure(ctx.session.id, ctx.projectPath)
    } catch (error) {
      set({ error: errorToString(error) })
    }
  },
})
