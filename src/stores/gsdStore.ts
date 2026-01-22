import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type {
  GsdPhase,
  GsdWorkflowState,
  GsdDecision,
  QuestioningContext,
  ResearchStatus,
  ResearchResult,
  GsdConfig,
  PlanningSessionInfo,
} from '@/types/gsd'
import { getNextPhase, getPreviousPhase } from '@/types/gsd'
import { gsdApi } from '@/lib/tauri-api'
import type {
  RequirementsDoc,
  RoadmapDoc,
  VerificationResult,
  ScopeSelection,
  ConversionResult,
} from '@/types/planning'
import type { AgentType } from '@/types'

/**
 * GSD Store State
 */
interface GsdState {
  // Workflow state
  workflowState: GsdWorkflowState | null
  isLoading: boolean
  error: string | null

  // Planning documents
  requirementsDoc: RequirementsDoc | null
  roadmapDoc: RoadmapDoc | null
  verificationResult: VerificationResult | null

  // Research
  researchResults: ResearchResult[]
  researchSummary: string | null
  selectedResearchAgent: AgentType | null
  availableResearchAgents: AgentType[]

  // Planning files content
  projectDocContent: string | null
  summaryContent: string | null

  // Configuration
  config: GsdConfig | null

  // Planning sessions list
  planningSessions: PlanningSessionInfo[]
}

/**
 * GSD Store Actions
 */
interface GsdActions {
  // Session management
  startGsdSession: (projectPath: string, chatSessionId: string) => Promise<GsdWorkflowState>
  loadGsdState: (projectPath: string, sessionId: string) => Promise<GsdWorkflowState | null>
  setWorkflowState: (state: GsdWorkflowState | null) => void
  clearGsdState: () => void

  // Phase navigation
  advancePhase: () => Promise<GsdPhase | null>
  goBackPhase: () => Promise<GsdPhase | null>
  setPhase: (phase: GsdPhase) => void

  // Questioning context
  updateQuestioningContext: (context: Partial<QuestioningContext>) => void
  setQuestioningContextItem: (
    key: 'what' | 'why' | 'who' | 'done',
    value: string
  ) => void
  addContextNote: (note: string) => void

  // Research
  startResearch: (projectPath: string, context: string, agentType?: string) => Promise<void>
  updateResearchStatus: (status: ResearchStatus) => void
  setResearchResults: (results: ResearchResult[]) => void
  setResearchSummary: (summary: string) => void
  setSelectedResearchAgent: (agent: AgentType | null) => void
  loadAvailableAgents: () => Promise<void>

  // Requirements
  loadRequirements: (projectPath: string, sessionId: string) => Promise<void>
  setRequirementsDoc: (doc: RequirementsDoc) => void
  applyScopeSelection: (selection: ScopeSelection) => Promise<void>

  // Roadmap
  loadRoadmap: (projectPath: string, sessionId: string) => Promise<void>
  generateRoadmap: (projectPath: string, sessionId: string) => Promise<void>
  setRoadmapDoc: (doc: RoadmapDoc) => void

  // Verification
  runVerification: (projectPath: string, sessionId: string) => Promise<VerificationResult>
  setVerificationResult: (result: VerificationResult) => void

  // Conversion/Export
  exportToRalph: (
    projectPath: string,
    sessionId: string,
    prdName: string,
    branch: string
  ) => Promise<ConversionResult>

  // Decisions
  recordDecision: (decision: GsdDecision) => void

  // Error handling
  setError: (error: string | null) => void
  setLoading: (loading: boolean) => void

  // Config
  loadConfig: (projectPath: string) => Promise<void>
  setConfig: (config: GsdConfig) => void

  // Planning sessions
  loadPlanningSessions: (projectPath: string) => Promise<void>
}

/**
 * GSD Store
 */
export const useGsdStore = create<GsdState & GsdActions>()(
  devtools(
    (set, get) => ({
      // Initial state
      workflowState: null,
      isLoading: false,
      error: null,
      requirementsDoc: null,
      roadmapDoc: null,
      verificationResult: null,
      researchResults: [],
      researchSummary: null,
      selectedResearchAgent: null,
      availableResearchAgents: [],
      projectDocContent: null,
      summaryContent: null,
      config: null,
      planningSessions: [],

      // Session management
      startGsdSession: async (projectPath, chatSessionId) => {
        set({ isLoading: true, error: null })
        try {
          const state = await gsdApi.startSession(projectPath, chatSessionId)
          set({ workflowState: state, isLoading: false })
          return state
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to start GSD session'
          set({ error: message, isLoading: false })
          throw error
        }
      },

      loadGsdState: async (projectPath, sessionId) => {
        set({ isLoading: true, error: null })
        try {
          const state = await gsdApi.getState(projectPath, sessionId)
          set({ workflowState: state, isLoading: false })
          return state
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to load GSD state'
          set({ error: message, isLoading: false })
          throw error
        }
      },

      setWorkflowState: (state) => {
        set({ workflowState: state })
      },

      clearGsdState: () => {
        set({
          workflowState: null,
          requirementsDoc: null,
          roadmapDoc: null,
          verificationResult: null,
          researchResults: [],
          researchSummary: null,
          selectedResearchAgent: null,
          projectDocContent: null,
          summaryContent: null,
          error: null,
        })
      },

      // Phase navigation
      advancePhase: async () => {
        const { workflowState } = get()
        if (!workflowState) return null

        const nextPhase = getNextPhase(workflowState.currentPhase)
        if (!nextPhase) {
          // Mark as complete
          set({
            workflowState: {
              ...workflowState,
              isComplete: true,
              updatedAt: new Date().toISOString(),
            },
          })
          return null
        }

        set({
          workflowState: {
            ...workflowState,
            currentPhase: nextPhase,
            updatedAt: new Date().toISOString(),
          },
        })
        return nextPhase
      },

      goBackPhase: async () => {
        const { workflowState } = get()
        if (!workflowState) return null

        const prevPhase = getPreviousPhase(workflowState.currentPhase)
        if (!prevPhase) return null

        set({
          workflowState: {
            ...workflowState,
            currentPhase: prevPhase,
            updatedAt: new Date().toISOString(),
          },
        })
        return prevPhase
      },

      setPhase: (phase: GsdPhase) => {
        const { workflowState } = get()
        if (!workflowState) return

        set({
          workflowState: {
            ...workflowState,
            currentPhase: phase,
            updatedAt: new Date().toISOString(),
          },
        })
      },

      // Questioning context
      updateQuestioningContext: (context: Partial<QuestioningContext>) => {
        const { workflowState } = get()
        if (!workflowState) return

        set({
          workflowState: {
            ...workflowState,
            questioningContext: {
              ...workflowState.questioningContext,
              ...context,
            },
            updatedAt: new Date().toISOString(),
          },
        })
      },

      setQuestioningContextItem: (
        key: 'what' | 'why' | 'who' | 'done',
        value: string
      ) => {
        const { updateQuestioningContext } = get()
        updateQuestioningContext({ [key]: value })
      },

      addContextNote: (note: string) => {
        const { workflowState } = get()
        if (!workflowState) return

        set({
          workflowState: {
            ...workflowState,
            questioningContext: {
              ...workflowState.questioningContext,
              notes: [...workflowState.questioningContext.notes, note],
            },
            updatedAt: new Date().toISOString(),
          },
        })
      },

      // Research
      startResearch: async (projectPath, context, agentType) => {
        const { workflowState, selectedResearchAgent } = get()
        if (!workflowState) return

        // Mark all as running
        set({
          workflowState: {
            ...workflowState,
            researchStatus: {
              architecture: { running: true, complete: false },
              codebase: { running: true, complete: false },
              bestPractices: { running: true, complete: false },
              risks: { running: true, complete: false },
            },
            updatedAt: new Date().toISOString(),
          },
        })

        try {
          const status = await gsdApi.startResearch(
            projectPath,
            workflowState.sessionId,
            context,
            agentType || selectedResearchAgent || undefined
          )
          set({
            workflowState: {
              ...get().workflowState!,
              researchStatus: status,
              updatedAt: new Date().toISOString(),
            },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to start research'
          set({ error: message })
        }
      },

      updateResearchStatus: (status: ResearchStatus) => {
        const { workflowState } = get()
        if (!workflowState) return

        set({
          workflowState: {
            ...workflowState,
            researchStatus: status,
            updatedAt: new Date().toISOString(),
          },
        })
      },

      setResearchResults: (results: ResearchResult[]) => {
        set({ researchResults: results })
      },

      setResearchSummary: (summary: string) => {
        set({ researchSummary: summary })
      },

      setSelectedResearchAgent: (agent: AgentType | null) => {
        set({ selectedResearchAgent: agent })
      },

      loadAvailableAgents: async () => {
        try {
          const { gsdApi } = await import('@/lib/tauri-api')
          const agents = await gsdApi.getAvailableAgents()
          set({ availableResearchAgents: agents })
          // Auto-select first available agent if none selected
          if (agents.length > 0 && !get().selectedResearchAgent) {
            set({ selectedResearchAgent: agents[0] })
          }
        } catch (error) {
          console.error('Failed to load available agents:', error)
          // Fallback to claude
          set({ availableResearchAgents: ['claude'] })
          if (!get().selectedResearchAgent) {
            set({ selectedResearchAgent: 'claude' })
          }
        }
      },

      // Requirements
      loadRequirements: async (projectPath, sessionId) => {
        set({ isLoading: true })
        try {
          const requirementsDoc = await gsdApi.loadRequirements(projectPath, sessionId)
          set({ requirementsDoc, isLoading: false })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      setRequirementsDoc: (doc: RequirementsDoc) => {
        set({ requirementsDoc: doc })
      },

      applyScopeSelection: async (selection: ScopeSelection) => {
        const { requirementsDoc, workflowState } = get()
        if (!requirementsDoc || !workflowState) return

        try {
          // Call backend to persist and get updated doc
          const updatedDoc = await gsdApi.scopeRequirements(
            workflowState.projectPath,
            workflowState.sessionId,
            selection
          )
          set({ requirementsDoc: updatedDoc })
        } catch (error) {
          // Fall back to local state update if backend fails
          const updatedRequirements = { ...requirementsDoc.requirements }
          for (const id of selection.v1) {
            if (updatedRequirements[id]) {
              updatedRequirements[id] = { ...updatedRequirements[id], scope: 'v1' }
            }
          }
          for (const id of selection.v2) {
            if (updatedRequirements[id]) {
              updatedRequirements[id] = { ...updatedRequirements[id], scope: 'v2' }
            }
          }
          for (const id of selection.outOfScope) {
            if (updatedRequirements[id]) {
              updatedRequirements[id] = {
                ...updatedRequirements[id],
                scope: 'out_of_scope',
              }
            }
          }
          set({ requirementsDoc: { requirements: updatedRequirements } })
          const message = error instanceof Error ? error.message : 'Failed to persist scope'
          set({ error: message })
        }
      },

      // Roadmap
      loadRoadmap: async (projectPath, sessionId) => {
        set({ isLoading: true })
        try {
          const roadmapDoc = await gsdApi.loadRoadmap(projectPath, sessionId)
          set({ roadmapDoc, isLoading: false })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      generateRoadmap: async (projectPath, sessionId) => {
        set({ isLoading: true })
        try {
          const roadmapDoc = await gsdApi.createRoadmap(projectPath, sessionId)
          set({ roadmapDoc, isLoading: false })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      setRoadmapDoc: (doc: RoadmapDoc) => {
        set({ roadmapDoc: doc })
      },

      // Verification
      runVerification: async (projectPath, sessionId) => {
        set({ isLoading: true })
        try {
          const iterationResult = await gsdApi.verifyPlans(projectPath, sessionId)
          // Convert VerificationIterationResult to VerificationResult for local state
          const result: VerificationResult = {
            passed: iterationResult.passed,
            coveragePercentage: iterationResult.coveragePercentage,
            issues: iterationResult.issues,
            warnings: iterationResult.warnings,
            stats: iterationResult.stats,
          }
          set({ verificationResult: result, isLoading: false })
          return result
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      setVerificationResult: (result: VerificationResult) => {
        set({ verificationResult: result })
      },

      // Conversion/Export
      exportToRalph: async (projectPath, sessionId, prdName, branch) => {
        set({ isLoading: true })
        try {
          const result = await gsdApi.exportToRalph(projectPath, sessionId, prdName, branch)
          set({ isLoading: false })
          return result
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      // Decisions
      recordDecision: (decision: GsdDecision) => {
        const { workflowState } = get()
        if (!workflowState) return

        set({
          workflowState: {
            ...workflowState,
            decisions: [...workflowState.decisions, decision],
            updatedAt: new Date().toISOString(),
          },
        })
      },

      // Error handling
      setError: (error: string | null) => {
        set({ error })
      },

      setLoading: (loading: boolean) => {
        set({ isLoading: loading })
      },

      // Config
      loadConfig: async (projectPath) => {
        void projectPath // Will be used when Tauri command is implemented
        // TODO: Load from Tauri
        const defaultConfig: GsdConfig = {
          researchAgentType: 'claude',
          maxParallelResearch: 4,
          researchTimeoutSecs: 300,
          autoAdvance: false,
          minContextItems: 3,
          includeCodebaseAnalysis: true,
        }
        set({ config: defaultConfig })
      },

      setConfig: (config: GsdConfig) => {
        set({ config })
      },

      // Planning sessions
      loadPlanningSessions: async (projectPath) => {
        try {
          const planningSessions = await gsdApi.listSessions(projectPath)
          set({ planningSessions })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to load planning sessions'
          set({ error: message, planningSessions: [] })
        }
      },
    }),
    { name: 'gsd-store' }
  )
)
