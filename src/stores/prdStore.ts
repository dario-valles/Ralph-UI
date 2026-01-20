// PRD State Management Store
import { create } from 'zustand'
import { prdApi } from '@/lib/tauri-api'
import { asyncAction, type AsyncState } from '@/lib/store-utils'
import type {
  PRDDocument,
  PRDTemplate,
  CreatePRDRequest,
  UpdatePRDRequest,
  ExecutionConfig,
} from '@/types'

interface PRDStore extends AsyncState {
  // State
  prds: PRDDocument[]
  currentPRD: PRDDocument | null
  templates: PRDTemplate[]

  // Actions
  loadPRDs: () => Promise<void>
  loadTemplates: () => Promise<void>
  createPRD: (request: CreatePRDRequest) => Promise<PRDDocument | undefined>
  updatePRD: (request: UpdatePRDRequest) => Promise<PRDDocument | undefined>
  deletePRD: (id: string) => Promise<void>
  setCurrentPRD: (id: string | null) => Promise<void>
  analyzeQuality: (id: string) => Promise<void>
  executePRD: (id: string, config: ExecutionConfig) => Promise<string | undefined>
  clearError: () => void
}

export const usePRDStore = create<PRDStore>((set, get) => ({
  // Initial state
  prds: [],
  currentPRD: null,
  templates: [],
  loading: false,
  error: null,

  // Load all PRDs from database
  loadPRDs: async () => {
    await asyncAction(set, async () => {
      const prds = await prdApi.list()
      return { prds }
    })
  },

  // Load all templates
  loadTemplates: async () => {
    await asyncAction(set, async () => {
      const templates = await prdApi.listTemplates()
      return { templates }
    })
  },

  // Create a new PRD
  createPRD: async (request: CreatePRDRequest) => {
    return asyncAction(set, async () => {
      const prd = await prdApi.create(request)
      return {
        prds: [prd, ...get().prds],
        currentPRD: prd,
        __result: prd,
      }
    }, { rethrow: true })
  },

  // Update an existing PRD
  updatePRD: async (request: UpdatePRDRequest) => {
    return asyncAction(set, async () => {
      const updatedPRD = await prdApi.update(request)
      const state = get()
      return {
        prds: state.prds.map((p) => (p.id === updatedPRD.id ? updatedPRD : p)),
        currentPRD: state.currentPRD?.id === updatedPRD.id ? updatedPRD : state.currentPRD,
        __result: updatedPRD,
      }
    }, { rethrow: true })
  },

  // Delete a PRD
  deletePRD: async (id: string) => {
    await asyncAction(set, async () => {
      await prdApi.delete(id)
      const state = get()
      return {
        prds: state.prds.filter((p) => p.id !== id),
        currentPRD: state.currentPRD?.id === id ? null : state.currentPRD,
      }
    }, { rethrow: true })
  },

  // Set the current PRD (load from database if needed)
  setCurrentPRD: async (id: string | null) => {
    if (!id) {
      set({ currentPRD: null })
      return
    }
    await asyncAction(set, async () => {
      const prd = await prdApi.getById(id)
      return { currentPRD: prd }
    })
  },

  // Analyze PRD quality
  analyzeQuality: async (id: string) => {
    await asyncAction(set, async () => {
      const updatedPRD = await prdApi.analyzeQuality(id)
      const state = get()
      return {
        prds: state.prds.map((p) => (p.id === updatedPRD.id ? updatedPRD : p)),
        currentPRD: state.currentPRD?.id === updatedPRD.id ? updatedPRD : state.currentPRD,
      }
    }, { rethrow: true })
  },

  // Execute PRD (create tasks and launch agents)
  executePRD: async (id: string, config: ExecutionConfig) => {
    return asyncAction(set, async () => {
      const sessionId = await prdApi.execute(id, config)
      return { __result: sessionId }
    }, { rethrow: true })
  },

  // Clear error
  clearError: () => {
    set({ error: null })
  },
}))
