// Frontend API for agent management
// Re-exports from src/lib/api/agent-api.ts for backwards compatibility

export {
  getAgent,
  getAgentsForSession,
  getAgentsForTask,
  getActiveAgents,
  updateAgentStatus,
  updateAgentMetrics,
  addAgentLog,
  getAgentLogs,
  cleanupStaleAgents,
  agentHasPty,
  getAgentPtyId,
  getAgentPtyHistory,
  processAgentPtyData,
  notifyAgentPtyExit,
  getStatusColor,
  getStatusLabel,
  getLogLevelColor,
  formatCost,
  formatTokens,
} from './api/agent-api'

export type { Agent, AgentStatus, LogEntry, LogLevel, StaleAgentCleanupResult } from './api/agent-api'
