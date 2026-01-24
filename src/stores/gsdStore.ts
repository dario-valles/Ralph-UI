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
import { gsdApi } from '@/lib/backend-api'
import { asyncAction, errorToString, type AsyncState } from '@/lib/store-utils'
import type {
  RequirementsDoc,
  RoadmapDoc,
  VerificationResult,
  ScopeSelection,
  ConversionResult,
  PrdExecutionConfig,
} from '@/types/planning'
import type { AgentType } from '@/types'

/**
 * GSD Store State
 */
interface GsdState extends AsyncState {
  // Workflow state
  workflowState: GsdWorkflowState | null
  // Project path for the current workflow (not part of GsdWorkflowState)
  currentProjectPath: string | null

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
  setQuestioningContextItem: (key: 'what' | 'why' | 'who' | 'done', value: string) => void
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
    branch: string,
    includeV2?: boolean,
    executionConfig?: PrdExecutionConfig
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
    (set, get) => {
      // Helper to update workflow state with automatic timestamp
      const updateWorkflowState = (
        updates:
          | Partial<GsdWorkflowState>
          | ((state: GsdWorkflowState) => Partial<GsdWorkflowState>)
      ): boolean => {
        const { workflowState } = get()
        if (!workflowState) return false

        const resolvedUpdates = typeof updates === 'function' ? updates(workflowState) : updates
        set({
          workflowState: {
            ...workflowState,
            ...resolvedUpdates,
            updatedAt: new Date().toISOString(),
          },
        })
        return true
      }

      return {
        // Initial state
        workflowState: null,
        currentProjectPath: null,
        loading: false,
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
          const result = await asyncAction(
            set,
            async () => {
              const state = await gsdApi.startSession(projectPath, chatSessionId)
              return { workflowState: state, currentProjectPath: projectPath, __result: state }
            },
            { rethrow: true }
          )
          return result!
        },

        loadGsdState: async (projectPath, sessionId) => {
          const result = await asyncAction(
            set,
            async () => {
              const state = await gsdApi.getState(projectPath, sessionId)
              return { workflowState: state, currentProjectPath: projectPath, __result: state }
            },
            { rethrow: true }
          )
          return result ?? null
        },

        setWorkflowState: (state) => {
          set({ workflowState: state })
        },

        clearGsdState: () => {
          set({
            workflowState: null,
            currentProjectPath: null,
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
            updateWorkflowState({ isComplete: true })
            return null
          }

          updateWorkflowState({ currentPhase: nextPhase })
          return nextPhase
        },

        goBackPhase: async () => {
          const { workflowState } = get()
          if (!workflowState) return null

          const prevPhase = getPreviousPhase(workflowState.currentPhase)
          if (!prevPhase) return null

          updateWorkflowState({ currentPhase: prevPhase })
          return prevPhase
        },

        setPhase: (phase: GsdPhase) => {
          updateWorkflowState({ currentPhase: phase })
        },

        // Questioning context
        updateQuestioningContext: (context: Partial<QuestioningContext>) => {
          updateWorkflowState((state) => ({
            questioningContext: {
              ...state.questioningContext,
              ...context,
            },
          }))
        },

        setQuestioningContextItem: (key: 'what' | 'why' | 'who' | 'done', value: string) => {
          const { updateQuestioningContext } = get()
          updateQuestioningContext({ [key]: value })
        },

        addContextNote: (note: string) => {
          updateWorkflowState((state) => ({
            questioningContext: {
              ...state.questioningContext,
              notes: [...state.questioningContext.notes, note],
            },
          }))
        },

        // Research
        startResearch: async (projectPath, context, agentType) => {
          const { workflowState, selectedResearchAgent } = get()
          if (!workflowState) return

          // Mark all as running
          updateWorkflowState({
            researchStatus: {
              architecture: { running: true, complete: false },
              codebase: { running: true, complete: false },
              bestPractices: { running: true, complete: false },
              risks: { running: true, complete: false },
            },
          })

          try {
            const status = await gsdApi.startResearch(
              projectPath,
              workflowState.sessionId,
              context,
              agentType || selectedResearchAgent || undefined
            )
            updateWorkflowState({ researchStatus: status })
          } catch (error) {
            set({ error: errorToString(error) })
          }
        },

        updateResearchStatus: (status: ResearchStatus) => {
          updateWorkflowState({ researchStatus: status })
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
            const { gsdApi } = await import('@/lib/backend-api')
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
          await asyncAction(
            set,
            async () => {
              const requirementsDoc = await gsdApi.loadRequirements(projectPath, sessionId)
              return { requirementsDoc }
            },
            { rethrow: true }
          )
        },

        setRequirementsDoc: (doc: RequirementsDoc) => {
          set({ requirementsDoc: doc })
        },

        applyScopeSelection: async (selection: ScopeSelection) => {
          const { requirementsDoc, workflowState, currentProjectPath } = get()
          if (!requirementsDoc || !workflowState || !currentProjectPath) return

          try {
            // Call backend to persist and get updated doc
            const updatedDoc = await gsdApi.scopeRequirements(
              currentProjectPath,
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
            set({
              requirementsDoc: { requirements: updatedRequirements },
              error: errorToString(error),
            })
          }
        },

        // Roadmap
        loadRoadmap: async (projectPath, sessionId) => {
          await asyncAction(
            set,
            async () => {
              const roadmapDoc = await gsdApi.loadRoadmap(projectPath, sessionId)
              return { roadmapDoc }
            },
            { rethrow: true }
          )
        },

        generateRoadmap: async (projectPath, sessionId) => {
          await asyncAction(
            set,
            async () => {
              const roadmapDoc = await gsdApi.createRoadmap(projectPath, sessionId)
              return { roadmapDoc }
            },
            { rethrow: true }
          )
        },

        setRoadmapDoc: (doc: RoadmapDoc) => {
          set({ roadmapDoc: doc })
        },

        // Verification
        runVerification: async (projectPath, sessionId) => {
          const result = await asyncAction(
            set,
            async () => {
              const iterationResult = await gsdApi.verifyPlans(projectPath, sessionId)
              // Extract VerificationResult from VerificationIterationResult
              const verificationResult: VerificationResult = iterationResult.result
              return { verificationResult, __result: verificationResult }
            },
            { rethrow: true }
          )
          return result!
        },

        setVerificationResult: (result: VerificationResult) => {
          set({ verificationResult: result })
        },

        // Conversion/Export
        exportToRalph: async (
          projectPath,
          sessionId,
          prdName,
          branch,
          includeV2,
          executionConfig
        ) => {
          const result = await asyncAction(
            set,
            async () => {
              const exportResult = await gsdApi.exportToRalph(
                projectPath,
                sessionId,
                prdName,
                branch,
                includeV2,
                executionConfig
              )
              return { __result: exportResult }
            },
            { rethrow: true }
          )
          return result!
        },

        // Decisions
        recordDecision: (decision: GsdDecision) => {
          updateWorkflowState((state) => ({
            decisions: [...state.decisions, decision],
          }))
        },

        // Error handling
        setError: (error: string | null) => {
          set({ error })
        },

        setLoading: (isLoading: boolean) => {
          set({ loading: isLoading })
        },

        // Config
        loadConfig: async (projectPath) => {
          void projectPath // Will be used when backend config is implemented
          // TODO: Load from backend
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
            set({ error: errorToString(error), planningSessions: [] })
          }
        },
      }
    },
    { name: 'gsd-store' }
  )
)
