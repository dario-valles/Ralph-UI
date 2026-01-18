// Hook for loading available models dynamically

import { useState, useEffect, useCallback } from 'react'
import type { AgentType } from '@/types'
import {
  getAvailableModels,
  refreshModels,
  getDefaultModelId,
  type ModelInfo,
} from '@/lib/model-api'

interface UseAvailableModelsReturn {
  /** Array of available models for the agent type */
  models: ModelInfo[]
  /** Whether models are currently loading */
  loading: boolean
  /** Error message if loading failed */
  error: string | null
  /** Refresh models from CLI (invalidates cache) */
  refresh: () => Promise<void>
  /** Get the default model ID */
  defaultModelId: string
}

/**
 * Hook to load available models for an agent type
 *
 * Fetches models from the backend, which discovers them from CLI or uses fallbacks.
 * Results are cached on the backend with a 5-minute TTL.
 *
 * @param agentType - The type of agent to get models for
 * @returns Object with models, loading state, error state, and refresh function
 *
 * @example
 * ```tsx
 * function ModelSelector({ agentType }: { agentType: AgentType }) {
 *   const { models, loading, error, refresh, defaultModelId } = useAvailableModels(agentType)
 *
 *   if (loading) return <LoadingSpinner />
 *   if (error) return <ErrorMessage message={error} />
 *
 *   return (
 *     <Select defaultValue={defaultModelId}>
 *       {models.map((m) => (
 *         <option key={m.id} value={m.id}>{m.name}</option>
 *       ))}
 *     </Select>
 *   )
 * }
 * ```
 */
export function useAvailableModels(agentType: AgentType): UseAvailableModelsReturn {
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load models when agent type changes
  useEffect(() => {
    let cancelled = false

    const loadModels = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await getAvailableModels(agentType)
        if (!cancelled) {
          setModels(result)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadModels()

    return () => {
      cancelled = true
    }
  }, [agentType])

  // Refresh function that invalidates cache and reloads
  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      // Invalidate cache for this agent type
      await refreshModels(agentType)
      // Fetch fresh models
      const result = await getAvailableModels(agentType)
      setModels(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [agentType])

  // Compute default model ID
  const defaultModelId = getDefaultModelId(models)

  return {
    models,
    loading,
    error,
    refresh,
    defaultModelId,
  }
}
