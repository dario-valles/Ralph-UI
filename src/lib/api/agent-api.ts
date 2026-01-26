// Frontend API for agent management

import type { Agent, AgentStatus, LogEntry } from '@/types'
import { invoke } from '../invoke'

// Re-export types for backwards compatibility
export type { Agent, AgentStatus, LogEntry }
export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

// Agent CRUD operations

export async function getAgent(agentId: string): Promise<Agent | null> {
  return invoke('get_agent', { agentId })
}

export async function getAgentsForSession(sessionId: string): Promise<Agent[]> {
  return invoke('get_agents_for_session', { sessionId })
}

export async function getAgentsForTask(taskId: string): Promise<Agent[]> {
  return invoke('get_agents_for_task', { taskId })
}

export async function getActiveAgents(sessionId: string): Promise<Agent[]> {
  return invoke('get_active_agents', { sessionId })
}

export async function updateAgentStatus(agentId: string, status: AgentStatus): Promise<void> {
  return invoke('update_agent_status', { agentId, status })
}

export async function updateAgentMetrics(
  agentId: string,
  tokens: number,
  cost: number,
  iterationCount: number
): Promise<void> {
  return invoke('update_agent_metrics', { agentId, tokens, cost, iterationCount })
}

export async function addAgentLog(agentId: string, log: LogEntry): Promise<void> {
  return invoke('add_agent_log', { agentId, log })
}

export async function getAgentLogs(agentId: string): Promise<LogEntry[]> {
  return invoke('get_agent_logs', { agentId })
}

// Stale agent cleanup

export interface StaleAgentCleanupResult {
  agentId: string
  sessionId: string
  processId: number | null
  wasZombie: boolean
}

/**
 * Cleanup stale agents whose processes are no longer running.
 * This is useful after app restart when agents in the database
 * are still marked as active but their processes have terminated.
 */
export async function cleanupStaleAgents(): Promise<StaleAgentCleanupResult[]> {
  return invoke('cleanup_stale_agents')
}

// ============================================================================
// Agent PTY (Interactive Terminal) Operations
// ============================================================================

/**
 * Check if an agent has an associated PTY (interactive terminal)
 */
export async function agentHasPty(agentId: string): Promise<boolean> {
  return invoke('agent_has_pty', { agentId })
}

/**
 * Get the PTY ID for an agent (for connecting to the terminal)
 */
export async function getAgentPtyId(agentId: string): Promise<string | null> {
  return invoke('get_agent_pty_id', { agentId })
}

/**
 * Get the PTY history (raw output) for an agent
 * Used to replay output when opening a terminal late
 */
export async function getAgentPtyHistory(agentId: string): Promise<Uint8Array> {
  const data = await invoke<number[]>('get_agent_pty_history', { agentId })
  return new Uint8Array(data)
}

/**
 * Process PTY data from an agent
 * Called to forward PTY output to the backend for log parsing and history storage
 */
export async function processAgentPtyData(agentId: string, data: Uint8Array): Promise<void> {
  return invoke('process_agent_pty_data', { agentId, data: Array.from(data) })
}

/**
 * Notify that an agent's PTY has exited
 */
export async function notifyAgentPtyExit(agentId: string, exitCode: number): Promise<void> {
  return invoke('notify_agent_pty_exit', { agentId, exitCode })
}

// Helper functions

export function getStatusColor(status: AgentStatus): string {
  switch (status) {
    case 'idle':
      return 'bg-gray-500'
    case 'thinking':
      return 'bg-blue-500'
    case 'reading':
      return 'bg-purple-500'
    case 'implementing':
      return 'bg-green-500'
    case 'testing':
      return 'bg-yellow-500'
    case 'committing':
      return 'bg-orange-500'
    default:
      return 'bg-gray-500'
  }
}

export function getStatusLabel(status: AgentStatus): string {
  switch (status) {
    case 'idle':
      return 'Idle'
    case 'thinking':
      return 'Thinking'
    case 'reading':
      return 'Reading'
    case 'implementing':
      return 'Implementing'
    case 'testing':
      return 'Testing'
    case 'committing':
      return 'Committing'
    default:
      return 'Unknown'
  }
}

export function getLogLevelColor(level: LogLevel): string {
  switch (level) {
    case 'info':
      return 'text-blue-600'
    case 'warn':
      return 'text-yellow-600'
    case 'error':
      return 'text-red-600'
    case 'debug':
      return 'text-gray-600'
    default:
      return 'text-gray-600'
  }
}

export function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`
}

export function formatTokens(tokens: number): string {
  return tokens.toLocaleString()
}
