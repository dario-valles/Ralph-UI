import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useAvailableModels } from '../useAvailableModels'
import type { ModelInfo } from '@/lib/model-api'

// Mock model-api
const mockGetAvailableModels = vi.fn()
const mockRefreshModels = vi.fn()

vi.mock('@/lib/model-api', async () => {
  const actual = await vi.importActual('@/lib/model-api')
  return {
    ...actual,
    getAvailableModels: () => mockGetAvailableModels(),
    refreshModels: () => mockRefreshModels(),
  }
})

describe('useAvailableModels', () => {
  const mockModels: ModelInfo[] = [
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', provider: 'anthropic', isDefault: true },
    { id: 'claude-opus-4-5', name: 'Claude Opus 4.5', provider: 'anthropic', isDefault: false },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAvailableModels.mockResolvedValue(mockModels)
    mockRefreshModels.mockResolvedValue(undefined)
  })

  it('starts with loading state', () => {
    const { result } = renderHook(() => useAvailableModels('claude'))

    expect(result.current.loading).toBe(true)
    expect(result.current.models).toEqual([])
    expect(result.current.error).toBeNull()
  })

  it('loads models successfully', async () => {
    const { result } = renderHook(() => useAvailableModels('claude'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.models).toEqual(mockModels)
    expect(result.current.error).toBeNull()
    expect(result.current.defaultModelId).toBe('claude-sonnet-4-5')
  })

  it('handles errors gracefully', async () => {
    mockGetAvailableModels.mockRejectedValue(new Error('Failed to fetch models'))

    const { result } = renderHook(() => useAvailableModels('claude'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.models).toEqual([])
    expect(result.current.error).toBe('Failed to fetch models')
  })

  it('reloads models when agent type changes', async () => {
    const { result, rerender } = renderHook(({ agentType }) => useAvailableModels(agentType), {
      initialProps: { agentType: 'claude' as const },
    })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockGetAvailableModels).toHaveBeenCalledTimes(1)

    // Change agent type
    rerender({ agentType: 'opencode' as const })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockGetAvailableModels).toHaveBeenCalledTimes(2)
  })

  it('provides refresh function', async () => {
    const { result } = renderHook(() => useAvailableModels('claude'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(mockGetAvailableModels).toHaveBeenCalledTimes(1)

    // Call refresh
    await act(async () => {
      await result.current.refresh()
    })

    // Should have called refreshModels and getAvailableModels again
    expect(mockRefreshModels).toHaveBeenCalledTimes(1)
    expect(mockGetAvailableModels).toHaveBeenCalledTimes(2)
  })

  it('returns empty defaultModelId when no models', async () => {
    mockGetAvailableModels.mockResolvedValue([])

    const { result } = renderHook(() => useAvailableModels('claude'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.defaultModelId).toBe('')
  })

  it('returns first model id as default when no model is marked as default', async () => {
    const modelsWithoutDefault: ModelInfo[] = [
      { id: 'model-1', name: 'Model 1', provider: 'test', isDefault: false },
      { id: 'model-2', name: 'Model 2', provider: 'test', isDefault: false },
    ]
    mockGetAvailableModels.mockResolvedValue(modelsWithoutDefault)

    const { result } = renderHook(() => useAvailableModels('claude'))

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.defaultModelId).toBe('model-1')
  })
})
