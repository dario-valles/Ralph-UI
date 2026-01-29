/**
 * Hook for available AI agents
 *
 * Returns the list of supported AI coding agents.
 * This is a static list based on the AgentType union.
 */

import { useCallback } from 'react'
import type { AgentType } from '@/types/agent'

/** All supported agent types */
const SUPPORTED_AGENTS: AgentType[] = [
  'claude',
  'opencode',
  'cursor',
  'codex',
  'qwen',
  'droid',
  'gemini',
]

interface UseAvailableAgentsReturn {
  /** Array of available agent types */
  agents: AgentType[]
  /** Whether agents are currently loading (always false - static list) */
  loading: boolean
  /** Error message if loading failed (always null - static list) */
  error: string | null
  /** Refresh agents (no-op for static list) */
  refresh: () => Promise<void>
}

/**
 * Hook to get available AI agents
 *
 * @returns Object with agents array, loading state, error state, and refresh function
 *
 * @example
 * ```tsx
 * function AgentSelector() {
 *   const { agents } = useAvailableAgents()
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
  const refresh = useCallback(async () => {
    // No-op - agents are static
  }, [])

  return {
    agents: SUPPORTED_AGENTS,
    loading: false,
    error: null,
    refresh,
  }
}
