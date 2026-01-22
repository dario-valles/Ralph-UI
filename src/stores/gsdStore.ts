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
import type {
  RequirementsDoc,
  RoadmapDoc,
  VerificationResult,
  ScopeSelection,
  ConversionResult,
} from '@/types/planning'

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
  startResearch: (projectPath: string, context: string) => Promise<void>
  updateResearchStatus: (status: ResearchStatus) => void
  setResearchResults: (results: ResearchResult[]) => void
  setResearchSummary: (summary: string) => void

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
 * Default empty research status
 */
const defaultResearchStatus: ResearchStatus = {
  architecture: { running: false, complete: false },
  codebase: { running: false, complete: false },
  bestPractices: { running: false, complete: false },
  risks: { running: false, complete: false },
}

/**
 * Default empty questioning context
 */
const defaultQuestioningContext: QuestioningContext = {
  notes: [],
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
      projectDocContent: null,
      summaryContent: null,
      config: null,
      planningSessions: [],

      // Session management
      startGsdSession: async (projectPath, chatSessionId) => {
        void projectPath // Will be used when Tauri command is implemented
        set({ isLoading: true, error: null })
        try {
          // TODO: Call Tauri command start_gsd_session
          const now = new Date().toISOString()
          const state: GsdWorkflowState = {
            sessionId: chatSessionId,
            currentPhase: 'deep_questioning',
            questioningContext: defaultQuestioningContext,
            researchStatus: defaultResearchStatus,
            decisions: [],
            startedAt: now,
            updatedAt: now,
            isComplete: false,
          }
          set({ workflowState: state, isLoading: false })
          return state
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to start GSD session'
          set({ error: message, isLoading: false })
          throw error
        }
      },

      loadGsdState: async (projectPath, sessionId) => {
        void projectPath // Will be used when Tauri command is implemented
        void sessionId
        set({ isLoading: true, error: null })
        try {
          // TODO: Call Tauri command get_gsd_state
          set({ isLoading: false })
          return get().workflowState
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to load GSD state'
          set({ error: message, isLoading: false })
          throw error
        }
      },

      clearGsdState: () => {
        set({
          workflowState: null,
          requirementsDoc: null,
          roadmapDoc: null,
          verificationResult: null,
          researchResults: [],
          researchSummary: null,
          projectDocContent: null,
          summaryContent: null,
          error: null,
        })
      },

      // Phase navigation
      advancePhase: async () => {
        const { workflowState } = get()
        if (!workflowState) return null

        const phaseOrder: GsdPhase[] = [
          'deep_questioning',
          'project_document',
          'research',
          'requirements',
          'scoping',
          'roadmap',
          'verification',
          'export',
        ]
        const currentIndex = phaseOrder.indexOf(workflowState.currentPhase)
        if (currentIndex >= phaseOrder.length - 1) {
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

        const nextPhase = phaseOrder[currentIndex + 1]
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

        const phaseOrder: GsdPhase[] = [
          'deep_questioning',
          'project_document',
          'research',
          'requirements',
          'scoping',
          'roadmap',
          'verification',
          'export',
        ]
        const currentIndex = phaseOrder.indexOf(workflowState.currentPhase)
        if (currentIndex <= 0) return null

        const prevPhase = phaseOrder[currentIndex - 1]
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
      startResearch: async (projectPath, context) => {
        void projectPath // Will be used when Tauri command is implemented
        void context
        const { workflowState } = get()
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

        // TODO: Call Tauri command start_research
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

      // Requirements
      loadRequirements: async (projectPath, sessionId) => {
        void projectPath // Will be used when Tauri command is implemented
        void sessionId
        set({ isLoading: true })
        try {
          // TODO: Call Tauri command to load requirements
          set({ isLoading: false })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      setRequirementsDoc: (doc: RequirementsDoc) => {
        set({ requirementsDoc: doc })
      },

      applyScopeSelection: async (selection: ScopeSelection) => {
        const { requirementsDoc } = get()
        if (!requirementsDoc) return

        // Apply selection to local state
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

        // TODO: Call Tauri command to persist
      },

      // Roadmap
      loadRoadmap: async (projectPath, sessionId) => {
        void projectPath // Will be used when Tauri command is implemented
        void sessionId
        set({ isLoading: true })
        try {
          // TODO: Call Tauri command to load roadmap
          set({ isLoading: false })
        } catch (error) {
          set({ isLoading: false })
          throw error
        }
      },

      generateRoadmap: async (projectPath, sessionId) => {
        void projectPath // Will be used when Tauri command is implemented
        void sessionId
        set({ isLoading: true })
        try {
          // TODO: Call Tauri command to generate roadmap
          set({ isLoading: false })
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
        void projectPath // Will be used when Tauri command is implemented
        void sessionId
        set({ isLoading: true })
        try {
          // TODO: Call Tauri command verify_plans
          const result: VerificationResult = {
            passed: true,
            coveragePercentage: 100,
            issues: [],
            warnings: [],
            stats: {
              totalRequirements: 0,
              v1Count: 0,
              v2Count: 0,
              outOfScopeCount: 0,
              unscopedCount: 0,
              inRoadmapCount: 0,
              notInRoadmapCount: 0,
              withDependenciesCount: 0,
              orphanedDependencies: 0,
            },
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
        void projectPath // Will be used when Tauri command is implemented
        void sessionId
        set({ isLoading: true })
        try {
          // TODO: Call Tauri command export_gsd_to_ralph
          const result: ConversionResult = {
            prd: {
              title: prdName,
              branch,
              stories: [],
            },
            storyCount: 0,
            skipped: [],
          }
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
        void projectPath // Will be used when Tauri command is implemented
        // TODO: Call Tauri command list_planning_sessions
        set({ planningSessions: [] })
      },
    }),
    { name: 'gsd-store' }
  )
)
