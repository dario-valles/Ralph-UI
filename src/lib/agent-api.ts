// Frontend API for agent management

import { invoke as tauriInvoke } from '@tauri-apps/api/core'

// Check if we're running inside Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Safe invoke wrapper that handles the case when Tauri isn't available
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri || typeof tauriInvoke !== 'function') {
    throw new Error(`Tauri is not available. Command '${cmd}' cannot be executed outside of Tauri.`)
  }
  return tauriInvoke<T>(cmd, args)
}

export interface Agent {
  id: string
  sessionId: string
  taskId: string
  status: AgentStatus
  processId: number | null
  worktreePath: string
  branch: string
  iterationCount: number
  tokens: number
  cost: number
  logs: LogEntry[]
  subagents: Agent[]
}

export type AgentStatus = 'idle' | 'thinking' | 'reading' | 'implementing' | 'testing' | 'committing'

export type LogLevel = 'info' | 'warn' | 'error' | 'debug'

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
}

export interface CreateAgentParams {
  id: string
  sessionId: string
  taskId: string
  status: AgentStatus
  processId: number | null
  worktreePath: string
  branch: string
  iterationCount: number
  tokens: number
  cost: number
  logs: LogEntry[]
  subagents: Agent[]
}

// Agent CRUD operations

export async function createAgent(agent: CreateAgentParams): Promise<void> {
  return invoke('create_agent', { agent })
}

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
  iterationCount: number,
): Promise<void> {
  return invoke('update_agent_metrics', { agentId, tokens, cost, iterationCount })
}

export async function updateAgentProcessId(
  agentId: string,
  processId: number | null,
): Promise<void> {
  return invoke('update_agent_process_id', { agentId, processId })
}

export async function deleteAgent(agentId: string): Promise<void> {
  return invoke('delete_agent', { agentId })
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
