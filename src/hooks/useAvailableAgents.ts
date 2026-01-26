/**
 * Hook for loading available AI agents dynamically
 *
 * Fetches the list of available AI coding agents from the backend.
 * Falls back to ['claude'] if the API call fails.
 */

import { useState, useEffect, useCallback } from 'react'
import type { AgentType } from '@/types/agent'
import { gsdApi } from '@/lib/api/gsd-api'

interface UseAvailableAgentsReturn {
  /** Array of available agent types */
  agents: AgentType[]
  /** Whether agents are currently loading */
  loading: boolean
  /** Error message if loading failed */
  error: string | null
  /** Refresh agents from backend */
  refresh: () => Promise<void>
}

/**
 * Hook to load available AI agents
 *
 * @returns Object with agents array, loading state, error state, and refresh function
 *
 * @example
 * ```tsx
 * function AgentSelector() {
 *   const { agents, loading, error } = useAvailableAgents()
 *
 *   if (loading) return <LoadingSpinner />
 *
 *   return (
 *     <Select>
 *       {agents.map((agent) => (
 *         <option key={agent} value={agent}>{formatAgentName(agent)}</option>
 *       ))}
 *     </Select>
 *   )
 * }
 * ```
 */
export function useAvailableAgents(): UseAvailableAgentsReturn {
  const [agents, setAgents] = useState<AgentType[]>(['claude'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadAgents = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await gsdApi.getAvailableAgents()
      setAgents(result.length > 0 ? result : ['claude'])
    } catch (err) {
      console.error('Failed to load available agents:', err)
      setError(err instanceof Error ? err.message : String(err))
      setAgents(['claude'])
    } finally {
      setLoading(false)
    }
  }, [])

  // Load agents on mount
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      try {
        const result = await gsdApi.getAvailableAgents()
        if (!cancelled) {
          setAgents(result.length > 0 ? result : ['claude'])
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load available agents:', err)
          setError(err instanceof Error ? err.message : String(err))
          setAgents(['claude'])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  return {
    agents,
    loading,
    error,
    refresh: loadAgents,
  }
}
