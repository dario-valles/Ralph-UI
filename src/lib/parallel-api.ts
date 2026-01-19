// TypeScript API for parallel execution

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import type { Task, Agent, AgentType, SchedulingStrategy } from '../types'

// Check if we're running inside Tauri
const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

// Safe invoke wrapper that handles the case when Tauri isn't available
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri || typeof tauriInvoke !== 'function') {
    throw new Error(`Tauri is not available. Command '${cmd}' cannot be executed outside of Tauri.`)
  }
  return tauriInvoke<T>(cmd, args)
}

// ===== Scheduler Types =====
// Note: SchedulingStrategy is imported from '../types' for consistency

// Re-export for convenience
export type { SchedulingStrategy } from '../types'

export interface ResourceLimits {
  maxAgents: number
  maxCpuPerAgent: number
  maxMemoryMbPerAgent: number
  maxTotalCpu: number
  maxTotalMemoryMb: number
  maxRuntimeSecs: number
}

export interface SchedulerConfig {
  maxParallel: number
  maxIterations: number
  maxRetries: number
  agentType: AgentType
  strategy: SchedulingStrategy
  resourceLimits: ResourceLimits
  /** Model to use for agents (e.g., "anthropic/claude-sonnet-4-5") */
  model?: string
}

export interface SchedulerStats {
  pending: number
  ready: number
  running: number
  completed: number
  failed: number
  total: number
}

export interface PoolStats {
  runningAgents: number
  maxAgents: number
  totalCpuUsage: number
  maxTotalCpu: number
  totalMemoryMb: number
  maxTotalMemoryMb: number
}

export interface CompletedAgent {
  agentId: string
  taskId: string
  processId: number
  exitCode: number
  logs: { timestamp: string; level: string; message: string }[]
}

// ===== Worktree Types =====

export interface WorktreeAllocation {
  agentId: string
  taskId: string
  worktreePath: string
  branch: string
  createdAt: string
}

// ===== Conflict Types =====

export type ConflictType =
  | 'file_modification'
  | 'delete_modify'
  | 'file_creation'
  | 'directory_conflict'

export type ConflictResolutionStrategy =
  | 'use_first'
  | 'use_last'
  | 'use_priority'
  | 'auto_merge'
  | 'manual'

export interface MergeConflict {
  filePath: string
  conflictType: ConflictType
  agents: string[]
  branches: string[]
  recommendedStrategy: ConflictResolutionStrategy
  description: string
  autoResolvable: boolean
}

export interface ConflictSummary {
  totalConflicts: number
  autoResolvable: number
  manualRequired: number
  uniqueFiles: number
  conflictsByType: Record<ConflictType, number>
}

export interface ConflictResolutionResult {
  filePath: string
  strategyUsed: ConflictResolutionStrategy
  success: boolean
  message: string
}

// ===== Scheduler API =====

/**
 * Initialize the parallel scheduler
 */
export async function initParallelScheduler(
  config: SchedulerConfig,
  repoPath: string
): Promise<void> {
  return invoke('init_parallel_scheduler', { config, repoPath })
}

/**
 * Add a task to the parallel scheduler
 */
export async function parallelAddTask(task: Task): Promise<void> {
  return invoke('parallel_add_task', { task })
}

/**
 * Add multiple tasks to the scheduler
 */
export async function parallelAddTasks(tasks: Task[]): Promise<void> {
  return invoke('parallel_add_tasks', { tasks })
}

/**
 * Schedule the next task from the queue
 */
export async function parallelScheduleNext(
  sessionId: string,
  projectPath: string
): Promise<Agent | null> {
  return invoke('parallel_schedule_next', { sessionId, projectPath })
}

/**
 * Mark a task as completed
 */
export async function parallelCompleteTask(taskId: string): Promise<void> {
  return invoke('parallel_complete_task', { taskId })
}

/**
 * Mark a task as failed
 */
export async function parallelFailTask(
  taskId: string,
  error: string
): Promise<void> {
  return invoke('parallel_fail_task', { taskId, error })
}

/**
 * Stop all running tasks
 */
export async function parallelStopAll(): Promise<void> {
  return invoke('parallel_stop_all')
}

/**
 * Get scheduler statistics
 */
export async function parallelGetSchedulerStats(): Promise<SchedulerStats> {
  return invoke('parallel_get_scheduler_stats')
}

/**
 * Get pool statistics
 */
export async function parallelGetPoolStats(): Promise<PoolStats> {
  return invoke('parallel_get_pool_stats')
}

/**
 * Check for resource violations
 */
export async function parallelCheckViolations(): Promise<string[]> {
  return invoke('parallel_check_violations')
}

/**
 * Poll for completed agents (reaps zombies and returns finished agents)
 */
export async function parallelPollCompleted(): Promise<CompletedAgent[]> {
  return invoke('parallel_poll_completed')
}

// ===== Worktree API =====

/**
 * Allocate a worktree for an agent
 */
export async function worktreeAllocate(
  agentId: string,
  taskId: string,
  branch: string
): Promise<WorktreeAllocation> {
  return invoke('worktree_allocate', { agentId, taskId, branch })
}

/**
 * Deallocate a worktree
 */
export async function worktreeDeallocate(worktreePath: string): Promise<void> {
  return invoke('worktree_deallocate', { worktreePath })
}

/**
 * Deallocate a worktree by agent ID
 */
export async function worktreeDeallocateByAgent(
  agentId: string
): Promise<void> {
  return invoke('worktree_deallocate_by_agent', { agentId })
}

/**
 * Get all worktree allocations
 */
export async function worktreeGetAllocations(): Promise<WorktreeAllocation[]> {
  return invoke('worktree_get_allocations')
}

/**
 * Cleanup orphaned worktrees
 */
export async function worktreeCleanupOrphaned(): Promise<string[]> {
  return invoke('worktree_cleanup_orphaned')
}

// ===== Conflict Detection API =====

/**
 * Detect conflicts between branches
 */
export async function conflictsDetect(
  branches: [string, string][]
): Promise<MergeConflict[]> {
  return invoke('conflicts_detect', { branches })
}

/**
 * Check if two branches can merge safely
 */
export async function conflictsCanMergeSafely(
  branch1: string,
  branch2: string
): Promise<boolean> {
  return invoke('conflicts_can_merge_safely', { branch1, branch2 })
}

/**
 * Get conflict summary
 */
export async function conflictsGetSummary(
  conflicts: MergeConflict[]
): Promise<ConflictSummary> {
  return invoke('conflicts_get_summary', { conflicts })
}

/**
 * Resolve a conflict using the specified strategy
 */
export async function conflictsResolve(
  conflict: MergeConflict,
  strategy: ConflictResolutionStrategy,
  baseBranch: string
): Promise<ConflictResolutionResult> {
  return invoke('conflicts_resolve', { conflict, strategy, baseBranch })
}

// ===== Helper Functions =====

/**
 * Create default resource limits
 */
export function createDefaultResourceLimits(): ResourceLimits {
  return {
    maxAgents: 5,
    maxCpuPerAgent: 50.0,
    maxMemoryMbPerAgent: 2048,
    maxTotalCpu: 80.0,
    maxTotalMemoryMb: 8192,
    maxRuntimeSecs: 3600,
  }
}

/**
 * Create default scheduler config
 */
export function createDefaultSchedulerConfig(
  agentType: AgentType = 'claude',
  model?: string
): SchedulerConfig {
  return {
    maxParallel: 3,
    maxIterations: 10,
    maxRetries: 2,
    agentType,
    strategy: 'dependency_first',
    resourceLimits: createDefaultResourceLimits(),
    model,
  }
}

/**
 * Format pool stats for display
 */
export function formatPoolStats(stats: PoolStats): string {
  const cpuPercent = stats.totalCpuUsage.toFixed(1)
  const memoryMb = stats.totalMemoryMb
  const agentCount = stats.runningAgents

  return `Agents: ${agentCount}/${stats.maxAgents} | CPU: ${cpuPercent}% | Memory: ${memoryMb}MB`
}

/**
 * Calculate resource utilization percentage
 */
export function calculateUtilization(stats: PoolStats): {
  agents: number
  cpu: number
  memory: number
} {
  return {
    agents: (stats.runningAgents / stats.maxAgents) * 100,
    cpu: (stats.totalCpuUsage / stats.maxTotalCpu) * 100,
    memory: (stats.totalMemoryMb / stats.maxTotalMemoryMb) * 100,
  }
}

/**
 * Get conflict type color for UI
 */
export function getConflictTypeColor(type: ConflictType): string {
  switch (type) {
    case 'file_modification':
      return 'yellow'
    case 'delete_modify':
      return 'red'
    case 'file_creation':
      return 'orange'
    case 'directory_conflict':
      return 'purple'
  }
}

/**
 * Get conflict type label
 */
export function getConflictTypeLabel(type: ConflictType): string {
  switch (type) {
    case 'file_modification':
      return 'File Modified'
    case 'delete_modify':
      return 'Delete/Modify'
    case 'file_creation':
      return 'File Created'
    case 'directory_conflict':
      return 'Directory Conflict'
  }
}

/**
 * Get resolution strategy label
 */
export function getResolutionStrategyLabel(
  strategy: ConflictResolutionStrategy
): string {
  switch (strategy) {
    case 'use_first':
      return 'Use First'
    case 'use_last':
      return 'Use Last'
    case 'use_priority':
      return 'Use Priority'
    case 'auto_merge':
      return 'Auto Merge'
    case 'manual':
      return 'Manual Resolution'
  }
}

/**
 * Get scheduling strategy label
 */
export function getSchedulingStrategyLabel(
  strategy: SchedulingStrategy
): string {
  switch (strategy) {
    case 'sequential':
      return 'Sequential'
    case 'priority':
      return 'Priority Order'
    case 'dependency_first':
      return 'Dependency First'
    case 'fifo':
      return 'First In First Out'
    case 'cost_first':
      return 'Highest Cost First'
  }
}

// ===== Git Repository Utilities =====

/**
 * Check if a path is a git repository
 */
export async function isGitRepository(path: string): Promise<boolean> {
  return invoke('git_is_repository', { path })
}

/**
 * Initialize a new git repository at the given path
 */
export async function initGitRepository(path: string): Promise<void> {
  return invoke('git_init_repository', { path })
}
