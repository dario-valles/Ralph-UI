// PRD State Management Store
import { create } from 'zustand'
import { prdApi } from '@/lib/tauri-api'
import type {
  PRDDocument,
  PRDTemplate,
  CreatePRDRequest,
  UpdatePRDRequest,
  ExecutionConfig,
} from '@/types'

interface PRDStore {
  // State
  prds: PRDDocument[]
  currentPRD: PRDDocument | null
  templates: PRDTemplate[]
  loading: boolean
  error: string | null

  // Actions
  loadPRDs: () => Promise<void>
  loadTemplates: () => Promise<void>
  createPRD: (request: CreatePRDRequest) => Promise<PRDDocument>
  updatePRD: (request: UpdatePRDRequest) => Promise<PRDDocument>
  deletePRD: (id: string) => Promise<void>
  setCurrentPRD: (id: string | null) => Promise<void>
  analyzeQuality: (id: string) => Promise<void>
  executePRD: (id: string, config: ExecutionConfig) => Promise<string>
  clearError: () => void
}

export const usePRDStore = create<PRDStore>((set) => ({
  // Initial state
  prds: [],
  currentPRD: null,
  templates: [],
  loading: false,
  error: null,

  // Load all PRDs from database
  loadPRDs: async () => {
    set({ loading: true, error: null })
    try {
      const prds = await prdApi.list()
      set({ prds, loading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load PRDs',
        loading: false,
      })
    }
  },

  // Load all templates
  loadTemplates: async () => {
    set({ loading: true, error: null })
    try {
      const templates = await prdApi.listTemplates()
      set({ templates, loading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load templates',
        loading: false,
      })
    }
  },

  // Create a new PRD
  createPRD: async (request: CreatePRDRequest) => {
    set({ loading: true, error: null })
    try {
      const prd = await prdApi.create(request)
      set((state) => ({
        prds: [prd, ...state.prds],
        currentPRD: prd,
        loading: false,
      }))
      return prd
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to create PRD',
        loading: false,
      })
      throw error
    }
  },

  // Update an existing PRD
  updatePRD: async (request: UpdatePRDRequest) => {
    set({ loading: true, error: null })
    try {
      const updatedPRD = await prdApi.update(request)
      set((state) => ({
        prds: state.prds.map((p) => (p.id === updatedPRD.id ? updatedPRD : p)),
        currentPRD: state.currentPRD?.id === updatedPRD.id ? updatedPRD : state.currentPRD,
        loading: false,
      }))
      return updatedPRD
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to update PRD',
        loading: false,
      })
      throw error
    }
  },

  // Delete a PRD
  deletePRD: async (id: string) => {
    set({ loading: true, error: null })
    try {
      await prdApi.delete(id)
      set((state) => ({
        prds: state.prds.filter((p) => p.id !== id),
        currentPRD: state.currentPRD?.id === id ? null : state.currentPRD,
        loading: false,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to delete PRD',
        loading: false,
      })
      throw error
    }
  },

  // Set the current PRD (load from database if needed)
  setCurrentPRD: async (id: string | null) => {
    if (!id) {
      set({ currentPRD: null })
      return
    }

    set({ loading: true, error: null })
    try {
      const prd = await prdApi.getById(id)
      set({ currentPRD: prd, loading: false })
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to load PRD',
        loading: false,
      })
    }
  },

  // Analyze PRD quality
  analyzeQuality: async (id: string) => {
    set({ loading: true, error: null })
    try {
      const updatedPRD = await prdApi.analyzeQuality(id)
      set((state) => ({
        prds: state.prds.map((p) => (p.id === updatedPRD.id ? updatedPRD : p)),
        currentPRD: state.currentPRD?.id === updatedPRD.id ? updatedPRD : state.currentPRD,
        loading: false,
      }))
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to analyze quality',
        loading: false,
      })
      throw error
    }
  },

  // Execute PRD (create tasks and launch agents)
  executePRD: async (id: string, config: ExecutionConfig) => {
    set({ loading: true, error: null })
    try {
      const sessionId = await prdApi.execute(id, config)
      set({ loading: false })
      return sessionId
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to execute PRD',
        loading: false,
      })
      throw error
    }
  },

  // Clear error
  clearError: () => {
    set({ error: null })
  },
}))
