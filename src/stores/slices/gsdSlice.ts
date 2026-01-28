/**
 * GSD Slice
 *
 * Handles GSD workflow state for requirements, scoping, and roadmap:
 * - Generating/loading requirements
 * - Applying scope selections
 * - Generating/loading roadmap
 * - Phase state management
 */
import { gsdApi } from '@/lib/api/gsd-api'
import { errorToString } from '@/lib/store-utils'
import type { SetState, GetState, GsdSlice } from './prdChatTypes'
import { getSessionWithPath, INITIAL_RESEARCH_STATUS, INITIAL_PHASE_STATE } from './prdChatTypes'
import type {
  ScopeSelection,
  RequirementCategory,
  Requirement,
  RequirementsDoc,
  RoadmapDoc,
} from '@/types/planning'
import type {
  ProjectType,
  QuestioningContext,
  ProjectTypeDetection,
  ContextQualityReport,
  ContextSuggestions,
} from '@/types/gsd'

/**
 * Creates the GSD slice
 */
export const createGsdSlice = (set: SetState, get: GetState): GsdSlice => ({
  // Initial state
  requirementsDoc: null,
  roadmapDoc: null,
  phaseState: INITIAL_PHASE_STATE,
  isGeneratingRequirements: false,

  // New Initial State
  projectType: null,
  projectTypeDetection: null,
  isDetectingProjectType: false,
  contextQuality: null,
  isAnalyzingQuality: false,
  contextSuggestions: null,
  isLoadingSuggestions: false,

  // Generate requirements from research
  generateRequirements: async (): Promise<RequirementsDoc | null> => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return null

    set({ isGeneratingRequirements: true, loading: true, error: null })
    try {
      const requirements = await gsdApi.generateRequirementsFromResearch(
        ctx.projectPath,
        ctx.session.id
      )
      set({ requirementsDoc: requirements })
      get().updatePhaseState()
      return requirements
    } catch (error) {
      set({ error: errorToString(error) })
      return null
    } finally {
      set({ isGeneratingRequirements: false, loading: false })
    }
  },

  // Load existing requirements
  loadRequirements: async () => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return

    try {
      const requirements = await gsdApi.loadRequirements(ctx.projectPath, ctx.session.id)
      set({ requirementsDoc: requirements })
      get().updatePhaseState()
    } catch (error) {
      // Silently fail - requirements may not exist yet
      console.warn('Failed to load requirements:', error)
    }
  },

  // Apply scope selection
  applyScopeSelection: async (selection: ScopeSelection) => {
    const ctx = getSessionWithPath(get)
    const { requirementsDoc } = get()
    if (!ctx || !requirementsDoc) return

    set({ loading: true, error: null })
    try {
      const updated = await gsdApi.scopeRequirements(ctx.projectPath, ctx.session.id, selection)
      set({ requirementsDoc: updated })
      get().updatePhaseState()
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
          updatedRequirements[id] = { ...updatedRequirements[id], scope: 'out_of_scope' }
        }
      }
      set({
        requirementsDoc: { requirements: updatedRequirements },
        error: errorToString(error),
      })
      get().updatePhaseState()
    } finally {
      set({ loading: false })
    }
  },

  // Add a custom requirement
  addRequirement: async (
    category: RequirementCategory,
    title: string,
    description: string
  ): Promise<Requirement | null> => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return null

    try {
      const newReq = await gsdApi.addRequirement(
        ctx.projectPath,
        ctx.session.id,
        category,
        title,
        description
      )
      // Update requirements state
      const { requirementsDoc } = get()
      if (requirementsDoc) {
        set({
          requirementsDoc: {
            ...requirementsDoc,
            requirements: { ...requirementsDoc.requirements, [newReq.id]: newReq },
          },
        })
      }
      get().updatePhaseState()
      return newReq
    } catch (error) {
      set({ error: errorToString(error) })
      return null
    }
  },

  // Generate roadmap from scoped requirements
  generateRoadmap: async (): Promise<RoadmapDoc | null> => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return null

    set({ loading: true, error: null })
    try {
      const roadmap = await gsdApi.createRoadmap(ctx.projectPath, ctx.session.id)
      set({ roadmapDoc: roadmap })
      get().updatePhaseState()
      return roadmap
    } catch (error) {
      set({ error: errorToString(error) })
      return null
    } finally {
      set({ loading: false })
    }
  },

  // Load existing roadmap
  loadRoadmap: async () => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return

    try {
      const roadmap = await gsdApi.loadRoadmap(ctx.projectPath, ctx.session.id)
      set({ roadmapDoc: roadmap })
      get().updatePhaseState()
    } catch (error) {
      // Silently fail - roadmap may not exist yet
      console.warn('Failed to load roadmap:', error)
    }
  },

  // Clear hybrid GSD state
  clearHybridState: () => {
    set({
      researchStatus: INITIAL_RESEARCH_STATUS,
      researchResults: [],
      researchSynthesis: null,
      requirementsDoc: null,
      roadmapDoc: null,
      phaseState: INITIAL_PHASE_STATE,
      isResearchRunning: false,
      isSynthesizing: false,
      isGeneratingRequirements: false,
      projectType: null,
      projectTypeDetection: null,
      contextQuality: null,
      contextSuggestions: null,
    })
  },

  // Update phase state based on current data
  updatePhaseState: () => {
    const { researchStatus, researchSynthesis, requirementsDoc, roadmapDoc } = get()

    // Check if research has started
    const researchStarted =
      researchStatus.architecture.running ||
      researchStatus.architecture.complete ||
      researchStatus.codebase.running ||
      researchStatus.codebase.complete ||
      researchStatus.bestPractices.running ||
      researchStatus.bestPractices.complete ||
      researchStatus.risks.running ||
      researchStatus.risks.complete

    // Check if research is complete (all agents done without errors)
    const researchComplete =
      researchStatus.architecture.complete &&
      !researchStatus.architecture.error &&
      researchStatus.codebase.complete &&
      !researchStatus.codebase.error &&
      researchStatus.bestPractices.complete &&
      !researchStatus.bestPractices.error &&
      researchStatus.risks.complete &&
      !researchStatus.risks.error &&
      researchSynthesis !== null

    // Check requirements
    const requirementsGenerated =
      requirementsDoc !== null && Object.keys(requirementsDoc.requirements).length > 0

    // Check scoping
    let unscopedCount = 0
    if (requirementsDoc) {
      unscopedCount = Object.values(requirementsDoc.requirements).filter(
        (r) => !r.scope || r.scope === 'unscoped'
      ).length
    }
    const scopingComplete = requirementsGenerated && unscopedCount === 0

    // Check roadmap
    const roadmapGenerated = roadmapDoc !== null && roadmapDoc.phases.length > 0

    set({
      phaseState: {
        researchStarted,
        researchComplete,
        requirementsGenerated,
        scopingComplete,
        roadmapGenerated,
        unscopedCount,
      },
    })
  },

  detectProjectType: async (): Promise<ProjectTypeDetection | null> => {
    const ctx = getSessionWithPath(get)
    if (!ctx) return null

    set({ isDetectingProjectType: true })
    try {
      const detection = await gsdApi.detectProjectType(ctx.projectPath)
      set({ projectTypeDetection: detection, projectType: detection.detectedType })
      return detection
    } catch (error) {
      console.error('Failed to detect project type:', error)
      return null
    } finally {
      set({ isDetectingProjectType: false })
    }
  },

  analyzeContextQuality: async (
    context: QuestioningContext
  ): Promise<ContextQualityReport | null> => {
    const { projectType } = get()
    set({ isAnalyzingQuality: true })
    try {
      const report = await gsdApi.analyzeContextQuality(context, projectType || undefined)
      set({ contextQuality: report })
      return report
    } catch (error) {
      console.error('Failed to analyze context quality:', error)
      return null
    } finally {
      set({ isAnalyzingQuality: false })
    }
  },

  generateContextSuggestions: async (
    projectType: ProjectType,
    context: QuestioningContext
  ): Promise<ContextSuggestions | null> => {
    set({ isLoadingSuggestions: true })
    try {
      const suggestions = await gsdApi.generateContextSuggestions(projectType, context)
      set({ contextSuggestions: suggestions })
      return suggestions
    } catch (error) {
      console.error('Failed to generate suggestions:', error)
      return null
    } finally {
      set({ isLoadingSuggestions: false })
    }
  },

  setProjectType: (type: ProjectType | null) => {
    set({ projectType: type })
  },
})
