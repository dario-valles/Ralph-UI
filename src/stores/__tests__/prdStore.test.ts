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

  const mockTemplate: PRDTemplate = {
    id: 'template-1',
    name: 'Startup MVP',
    description: 'Template for startup MVP',
    icon: '🚀',
    sections: JSON.stringify([{ name: 'Overview' }]),
    createdAt: new Date().toISOString(),
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

  it('should load PRDs successfully', async () => {
    vi.mocked(prdApi.list).mockResolvedValue([mockPRD])

    const store = usePRDStore.getState()
    await store.loadPRDs()

    expect(prdApi.list).toHaveBeenCalled()
    expect(usePRDStore.getState().prds).toEqual([mockPRD])
    expect(usePRDStore.getState().loading).toBe(false)
  })

  it('should load templates successfully', async () => {
    vi.mocked(prdApi.listTemplates).mockResolvedValue([mockTemplate])

    const store = usePRDStore.getState()
    await store.loadTemplates()

    expect(prdApi.listTemplates).toHaveBeenCalled()
    expect(usePRDStore.getState().templates).toEqual([mockTemplate])
  })

  it('should create a PRD', async () => {
    vi.mocked(prdApi.create).mockResolvedValue(mockPRD)

    const store = usePRDStore.getState()
    const result = await store.createPRD({ title: 'Test', content: {} })

    expect(result).toEqual(mockPRD)
    expect(usePRDStore.getState().prds).toContainEqual(mockPRD)
  })

  it('should clear error', () => {
    const store = usePRDStore.getState()
    store.error = 'Some error'

    store.clearError()

    expect(usePRDStore.getState().error).toBeNull()
  })
})
