import { describe, it, expect, beforeEach, vi } from 'vitest'
import { usePRDStore } from '../prdStore'
import { prdApi } from '@/lib/tauri-api'
import type { PRDDocument, PRDTemplate } from '@/types'

// Mock the tauri API
vi.mock('@/lib/tauri-api', () => ({
  prdApi: {
    list: vi.fn(),
    listTemplates: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn(),
    analyzeQuality: vi.fn(),
    execute: vi.fn(),
  },
}))

describe('prdStore', () => {
  const mockPRD: PRDDocument = {
    id: 'prd-1',
    title: 'Test PRD',
    description: 'Test description',
    templateId: 'template-1',
    content: JSON.stringify({ overview: 'Test' }),
    qualityScoreCompleteness: 85,
    qualityScoreClarity: 90,
    qualityScoreActionability: 80,
    qualityScoreOverall: 85,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1,
    projectPath: '/test/path',
  }

  const mockPRD2: PRDDocument = {
    ...mockPRD,
    id: 'prd-2',
    title: 'Test PRD 2',
    qualityScoreCompleteness: 70,
  }

  const mockTemplate: PRDTemplate = {
    id: 'template-1',
    name: 'Startup MVP',
    description: 'Template for startup MVP',
    icon: '🚀',
    systemTemplate: true,
    templateStructure: JSON.stringify([{ name: 'Overview' }]),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  beforeEach(() => {
    const store = usePRDStore.getState()
    store.prds = []
    store.currentPRD = null
    store.templates = []
    store.loading = false
    store.error = null
    vi.clearAllMocks()
  })

  describe('loadPRDs', () => {
    it('should load PRDs successfully', async () => {
      vi.mocked(prdApi.list).mockResolvedValue([mockPRD])

      const store = usePRDStore.getState()
      await store.loadPRDs()

      expect(prdApi.list).toHaveBeenCalled()
      expect(usePRDStore.getState().prds).toEqual([mockPRD])
      expect(usePRDStore.getState().loading).toBe(false)
    })

    it('should load multiple PRDs', async () => {
      vi.mocked(prdApi.list).mockResolvedValue([mockPRD, mockPRD2])

      const store = usePRDStore.getState()
      await store.loadPRDs()

      expect(usePRDStore.getState().prds).toHaveLength(2)
      expect(usePRDStore.getState().prds).toEqual([mockPRD, mockPRD2])
    })

    it('should handle errors when loading PRDs', async () => {
      const error = new Error('Failed to load')
      vi.mocked(prdApi.list).mockRejectedValue(error)

      const store = usePRDStore.getState()
      await store.loadPRDs()

      expect(usePRDStore.getState().error).toBe('Failed to load')
      expect(usePRDStore.getState().loading).toBe(false)
    })

    it('should set loading state during load', async () => {
      let loadingDuringCall = false
      vi.mocked(prdApi.list).mockImplementation(async () => {
        loadingDuringCall = usePRDStore.getState().loading
        return [mockPRD]
      })

      const store = usePRDStore.getState()
      await store.loadPRDs()

      expect(loadingDuringCall).toBe(true)
    })
  })

  describe('loadTemplates', () => {
    it('should load templates successfully', async () => {
      vi.mocked(prdApi.listTemplates).mockResolvedValue([mockTemplate])

      const store = usePRDStore.getState()
      await store.loadTemplates()

      expect(prdApi.listTemplates).toHaveBeenCalled()
      expect(usePRDStore.getState().templates).toEqual([mockTemplate])
    })

    it('should handle errors when loading templates', async () => {
      const error = new Error('Template error')
      vi.mocked(prdApi.listTemplates).mockRejectedValue(error)

      const store = usePRDStore.getState()
      await store.loadTemplates()

      expect(usePRDStore.getState().error).toBe('Template error')
      expect(usePRDStore.getState().loading).toBe(false)
    })
  })

  describe('createPRD', () => {
    it('should create a PRD', async () => {
      vi.mocked(prdApi.create).mockResolvedValue(mockPRD)

      const store = usePRDStore.getState()
      const result = await store.createPRD({ title: 'Test', content: {} })

      expect(result).toEqual(mockPRD)
      expect(usePRDStore.getState().prds).toContainEqual(mockPRD)
      expect(usePRDStore.getState().currentPRD).toEqual(mockPRD)
    })

    it('should add new PRD to beginning of list', async () => {
      const store = usePRDStore.getState()
      store.prds = [mockPRD2]

      vi.mocked(prdApi.create).mockResolvedValue(mockPRD)
      await store.createPRD({ title: 'Test', content: {} })

      expect(usePRDStore.getState().prds[0]).toEqual(mockPRD)
      expect(usePRDStore.getState().prds[1]).toEqual(mockPRD2)
    })

    it('should handle create errors', async () => {
      const error = new Error('Create failed')
      vi.mocked(prdApi.create).mockRejectedValue(error)

      const store = usePRDStore.getState()
      await expect(store.createPRD({ title: 'Test', content: {} })).rejects.toThrow('Create failed')
      expect(usePRDStore.getState().error).toBe('Create failed')
    })
  })

  describe('updatePRD', () => {
    it('should update a PRD', async () => {
      const updatedPRD = { ...mockPRD, title: 'Updated Title' }
      vi.mocked(prdApi.update).mockResolvedValue(updatedPRD)

      const store = usePRDStore.getState()
      store.prds = [mockPRD, mockPRD2]
      await store.updatePRD({ id: mockPRD.id, title: 'Updated Title' })

      expect(usePRDStore.getState().prds[0].title).toBe('Updated Title')
    })

    it('should update currentPRD if it matches', async () => {
      const updatedPRD = { ...mockPRD, title: 'Updated Title' }
      vi.mocked(prdApi.update).mockResolvedValue(updatedPRD)

      const store = usePRDStore.getState()
      store.currentPRD = mockPRD
      await store.updatePRD({ id: mockPRD.id, title: 'Updated Title' })

      expect(usePRDStore.getState().currentPRD?.title).toBe('Updated Title')
    })

    it('should not update currentPRD if different', async () => {
      const updatedPRD = { ...mockPRD, title: 'Updated Title' }
      vi.mocked(prdApi.update).mockResolvedValue(updatedPRD)

      const store = usePRDStore.getState()
      store.currentPRD = mockPRD2
      await store.updatePRD({ id: mockPRD.id, title: 'Updated Title' })

      expect(usePRDStore.getState().currentPRD).toEqual(mockPRD2)
    })

    it('should handle update errors', async () => {
      const error = new Error('Update failed')
      vi.mocked(prdApi.update).mockRejectedValue(error)

      const store = usePRDStore.getState()
      await expect(store.updatePRD({ id: mockPRD.id })).rejects.toThrow('Update failed')
      expect(usePRDStore.getState().error).toBe('Update failed')
    })
  })

  describe('deletePRD', () => {
    it('should delete a PRD', async () => {
      vi.mocked(prdApi.delete).mockResolvedValue(undefined)

      const store = usePRDStore.getState()
      store.prds = [mockPRD, mockPRD2]
      await store.deletePRD(mockPRD.id)

      expect(usePRDStore.getState().prds).toEqual([mockPRD2])
    })

    it('should clear currentPRD if deleted', async () => {
      vi.mocked(prdApi.delete).mockResolvedValue(undefined)

      const store = usePRDStore.getState()
      store.currentPRD = mockPRD
      store.prds = [mockPRD]
      await store.deletePRD(mockPRD.id)

      expect(usePRDStore.getState().currentPRD).toBeNull()
    })

    it('should not clear currentPRD if different', async () => {
      vi.mocked(prdApi.delete).mockResolvedValue(undefined)

      const store = usePRDStore.getState()
      store.currentPRD = mockPRD2
      store.prds = [mockPRD, mockPRD2]
      await store.deletePRD(mockPRD.id)

      expect(usePRDStore.getState().currentPRD).toEqual(mockPRD2)
    })

    it('should handle delete errors', async () => {
      const error = new Error('Delete failed')
      vi.mocked(prdApi.delete).mockRejectedValue(error)

      const store = usePRDStore.getState()
      await expect(store.deletePRD(mockPRD.id)).rejects.toThrow('Delete failed')
      expect(usePRDStore.getState().error).toBe('Delete failed')
    })
  })

  describe('setCurrentPRD', () => {
    it('should load and set current PRD by ID', async () => {
      vi.mocked(prdApi.getById).mockResolvedValue(mockPRD)

      const store = usePRDStore.getState()
      await store.setCurrentPRD(mockPRD.id)

      expect(prdApi.getById).toHaveBeenCalledWith(mockPRD.id)
      expect(usePRDStore.getState().currentPRD).toEqual(mockPRD)
    })

    it('should clear current PRD when ID is null', async () => {
      const store = usePRDStore.getState()
      store.currentPRD = mockPRD
      await store.setCurrentPRD(null)

      expect(usePRDStore.getState().currentPRD).toBeNull()
      expect(prdApi.getById).not.toHaveBeenCalled()
    })

    it('should handle errors when setting current PRD', async () => {
      const error = new Error('Load failed')
      vi.mocked(prdApi.getById).mockRejectedValue(error)

      const store = usePRDStore.getState()
      await store.setCurrentPRD(mockPRD.id)

      expect(usePRDStore.getState().error).toBe('Load failed')
      expect(usePRDStore.getState().currentPRD).toBeNull()
    })
  })

  describe('analyzeQuality', () => {
    it('should analyze PRD quality', async () => {
      const analyzedPRD = {
        ...mockPRD,
        qualityScoreCompleteness: 95,
        qualityScoreClarity: 92,
        qualityScoreActionability: 88,
        qualityScoreOverall: 92,
      }
      vi.mocked(prdApi.analyzeQuality).mockResolvedValue(analyzedPRD)

      const store = usePRDStore.getState()
      store.prds = [mockPRD]
      await store.analyzeQuality(mockPRD.id)

      expect(usePRDStore.getState().prds[0].qualityScoreOverall).toBe(92)
    })

    it('should update currentPRD quality if it matches', async () => {
      const analyzedPRD = { ...mockPRD, qualityScoreOverall: 95 }
      vi.mocked(prdApi.analyzeQuality).mockResolvedValue(analyzedPRD)

      const store = usePRDStore.getState()
      store.currentPRD = mockPRD
      await store.analyzeQuality(mockPRD.id)

      expect(usePRDStore.getState().currentPRD?.qualityScoreOverall).toBe(95)
    })

    it('should handle analyze errors', async () => {
      const error = new Error('Analysis failed')
      vi.mocked(prdApi.analyzeQuality).mockRejectedValue(error)

      const store = usePRDStore.getState()
      await expect(store.analyzeQuality(mockPRD.id)).rejects.toThrow('Analysis failed')
      expect(usePRDStore.getState().error).toBe('Analysis failed')
    })
  })

  describe('clearError', () => {
    it('should clear error', () => {
      const store = usePRDStore.getState()
      store.error = 'Some error'

      store.clearError()

      expect(usePRDStore.getState().error).toBeNull()
    })

    it('should not affect other state', () => {
      const store = usePRDStore.getState()
      store.error = 'Some error'
      store.prds = [mockPRD]
      store.currentPRD = mockPRD

      store.clearError()

      expect(usePRDStore.getState().prds).toEqual([mockPRD])
      expect(usePRDStore.getState().currentPRD).toEqual(mockPRD)
    })
  })
})
