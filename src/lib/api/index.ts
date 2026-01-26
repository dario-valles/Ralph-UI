// API Module Index
// Re-exports all domain-specific API modules for convenient imports

// Types from types.ts
export type { AgentAvailabilityResult, WatchFileResponse, ActivityEvent, GlobalStats } from './types'

// Session API
export { sessionApi } from './session-api'

// Project API
export { projectApi } from './project-api'

// PRD API
export { prdApi } from './prd-api'

// Chat API
export { prdChatApi } from './chat-api'

// Mission Control API
export { missionControlApi } from './mission-control-api'

// Ralph Loop API
export { ralphLoopApi } from './ralph-loop-api'

// GSD Workflow API
export { gsdApi } from './gsd-api'

// Template API (from backend-api.ts)
export { templateApi } from './template-api'

// Agent API
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
} from './agent-api'
export type { LogLevel, StaleAgentCleanupResult } from './agent-api'

// Git API
export { gitApi, githubApi, gitHelpers, githubHelpers, conflictHelpers } from './git-api'
export type {
  BranchInfo,
  CommitInfo,
  WorktreeInfo,
  FileStatus,
  DiffInfo,
  FileDiff,
  MergeResult,
  PullRequest,
  Issue,
  IssueImportResult,
  ConflictInfo,
  ConflictResolution,
  MergeOptions,
  MergeWorkflowResult,
  ConflictResolutionResult,
  MergeResolutionResult,
  ConflictResolverAgent,
} from './git-api'

// Config API
export { configApi, recoveryApi, traceApi } from './config-api'

// Provider API
export { providerApi } from './provider-api'
