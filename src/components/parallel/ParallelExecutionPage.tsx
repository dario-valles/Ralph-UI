// Parallel execution page with scheduler controls and monitoring

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Badge } from '../ui/badge'
import { AgentComparison } from './AgentComparison'
import { ConflictResolution } from './ConflictResolution'
import type { Agent, AgentType } from '../../types'
import type {
  SchedulerConfig,
  SchedulerStats,
  PoolStats,
  MergeConflict,
  ConflictResolutionStrategy,
} from '../../lib/parallel-api'
import { Select } from '../ui/select'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import {
  initParallelScheduler,
  parallelScheduleNext,
  parallelStopAll,
  parallelGetSchedulerStats,
  parallelGetPoolStats,
  parallelCheckViolations,
  conflictsDetect,
  conflictsResolve,
  createDefaultSchedulerConfig,
  calculateUtilization,
  getSchedulingStrategyLabel,
} from '../../lib/parallel-api'

export function ParallelExecutionPage() {
  const [initialized, setInitialized] = useState(false)
  const [projectPath, setProjectPath] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [config, setConfig] = useState<SchedulerConfig>(
    createDefaultSchedulerConfig()
  )

  const [schedulerStats, setSchedulerStats] = useState<SchedulerStats | null>(
    null
  )
  const [poolStats, setPoolStats] = useState<PoolStats | null>(null)
  const [agents, setAgents] = useState<Agent[]>([])
  const [conflicts, setConflicts] = useState<MergeConflict[]>([])
  const [violations, setViolations] = useState<string[]>([])

  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load available models for the current agent type
  const { models, loading: modelsLoading, defaultModelId } = useAvailableModels(config.agentType)

  // Initialize scheduler
  const handleInitialize = async () => {
    try {
      await initParallelScheduler(config, projectPath)
      setInitialized(true)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize')
    }
  }

  // Schedule next task
  const handleScheduleNext = async () => {
    if (!initialized) return

    try {
      const agent = await parallelScheduleNext(sessionId, projectPath)
      if (agent) {
        setAgents((prev) => [...prev, agent])
      }
      await refreshStats()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule')
    }
  }

  // Start parallel execution
  const handleStart = async () => {
    setIsRunning(true)
    setError(null)

    // Schedule tasks up to max parallel limit
    for (let i = 0; i < config.maxParallel; i++) {
      await handleScheduleNext()
    }

    // Start monitoring loop
    startMonitoring()
  }

  // Stop all agents
  const handleStop = async () => {
    try {
      await parallelStopAll()
      setIsRunning(false)
      stopMonitoring()
      await refreshStats()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop')
    }
  }

  // Refresh statistics
  const refreshStats = async () => {
    if (!initialized) return

    try {
      const [scheduler, pool] = await Promise.all([
        parallelGetSchedulerStats(),
        parallelGetPoolStats(),
      ])

      setSchedulerStats(scheduler)
      setPoolStats(pool)
    } catch (err) {
      console.error('Failed to refresh stats:', err)
    }
  }

  // Check for violations and conflicts
  const checkHealth = async () => {
    if (!initialized) return

    try {
      const newViolations = await parallelCheckViolations()
      setViolations(newViolations)

      // Detect conflicts between branches
      const branches = agents.map((a) => [a.branch, a.id] as [string, string])
      if (branches.length > 1) {
        const detectedConflicts = await conflictsDetect(branches)
        setConflicts(detectedConflicts)
      }
    } catch (err) {
      console.error('Failed to check health:', err)
    }
  }

  // Monitoring interval
  const monitoringIntervalRef = useRef<number | null>(null)

  const stopMonitoring = useCallback(() => {
    if (monitoringIntervalRef.current) {
      clearInterval(monitoringIntervalRef.current)
      monitoringIntervalRef.current = null
    }
  }, [])

  const startMonitoring = useCallback(() => {
    monitoringIntervalRef.current = window.setInterval(() => {
      refreshStats()
      checkHealth()
    }, 5000) // Every 5 seconds
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Stable interval callback
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopMonitoring()
    }
  }, [stopMonitoring])

  // Resolve conflict
  const handleResolveConflict = async (
    conflict: MergeConflict,
    strategy: ConflictResolutionStrategy
  ) => {
    if (!initialized) return

    try {
      // Get base branch (main or master) for resolution
      const baseBranch = 'main'

      const result = await conflictsResolve(conflict, strategy, baseBranch)

      if (result.success) {
        // Remove resolved conflict from the list
        setConflicts((prev) => prev.filter((c) => c.filePath !== conflict.filePath))
        setError(null)
      } else {
        setError(`Conflict resolution: ${result.message}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve conflict')
    }
  }

  const utilization = poolStats ? calculateUtilization(poolStats) : null

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Parallel Execution</h1>
          <p className="text-muted-foreground">
            Manage multiple agents running in parallel
          </p>
        </div>
        <div className="flex gap-2">
          {!initialized ? (
            <Button onClick={handleInitialize}>Initialize</Button>
          ) : !isRunning ? (
            <Button onClick={handleStart}>Start</Button>
          ) : (
            <Button variant="destructive" onClick={handleStop}>
              Stop All
            </Button>
          )}
        </div>
      </div>

      {/* Configuration */}
      {!initialized && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Configuration</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Project Path</label>
              <Input
                type="text"
                value={projectPath}
                onChange={(e) => setProjectPath(e.target.value)}
                placeholder="/path/to/project"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Session ID</label>
              <Input
                type="text"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                placeholder="session-id"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Agent Type</label>
              <Select
                value={config.agentType}
                onChange={(e) => {
                  const newAgentType = e.target.value as AgentType
                  // Model will be updated when models load for the new agent type
                  setConfig({ ...config, agentType: newAgentType, model: undefined })
                }}
                className="mt-1"
              >
                <option value="claude">Claude Code</option>
                <option value="opencode">OpenCode</option>
                <option value="cursor">Cursor</option>
                <option value="codex">Codex CLI</option>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Model</label>
              <Select
                value={config.model || defaultModelId || ''}
                onChange={(e) => setConfig({ ...config, model: e.target.value })}
                className="mt-1"
                disabled={modelsLoading}
              >
                {modelsLoading ? (
                  <option>Loading models...</option>
                ) : (
                  models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))
                )}
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Max Parallel</label>
              <Input
                type="number"
                value={config.maxParallel}
                onChange={(e) =>
                  setConfig({ ...config, maxParallel: parseInt(e.target.value) })
                }
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Scheduling Strategy</label>
              <div className="mt-1">
                <Badge>{getSchedulingStrategyLabel(config.strategy)}</Badge>
              </div>
            </div>
          </div>
        </Card>
      )}

      {error && (
        <Card className="p-4 bg-red-50 border-red-200">
          <p className="text-red-600">{error}</p>
        </Card>
      )}

      {/* Status Dashboard */}
      {initialized && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-4 gap-4">
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Pending</div>
              <div className="text-2xl font-bold">
                {schedulerStats?.pending || 0}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Running</div>
              <div className="text-2xl font-bold">
                {schedulerStats?.running || 0}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Completed</div>
              <div className="text-2xl font-bold">
                {schedulerStats?.completed || 0}
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-sm text-muted-foreground">Failed</div>
              <div className="text-2xl font-bold text-red-600">
                {schedulerStats?.failed || 0}
              </div>
            </Card>
          </div>

          {/* Resource Utilization */}
          {poolStats && utilization && (
            <Card className="p-4">
              <h3 className="text-lg font-semibold mb-4">Resource Utilization</h3>
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">Agents</span>
                    <span className="text-sm font-medium">
                      {poolStats.runningAgents}/{poolStats.maxAgents}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${utilization.agents}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">CPU</span>
                    <span className="text-sm font-medium">
                      {poolStats.totalCpuUsage.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(utilization.cpu, 100)}%` }}
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">Memory</span>
                    <span className="text-sm font-medium">
                      {poolStats.totalMemoryMb}MB
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-purple-500 h-2 rounded-full transition-all"
                      style={{ width: `${Math.min(utilization.memory, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Violations */}
          {violations.length > 0 && (
            <Card className="p-4 bg-yellow-50 border-yellow-200">
              <h3 className="text-lg font-semibold mb-2">
                ⚠️ Resource Violations
              </h3>
              <p className="text-sm text-yellow-800">
                {violations.length} agent(s) exceeded resource limits
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {violations.map((agentId) => (
                  <Badge key={agentId} className="bg-yellow-500">
                    {agentId.substring(0, 8)}
                  </Badge>
                ))}
              </div>
            </Card>
          )}

          {/* Agent Comparison */}
          {agents.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Agent Comparison</h2>
              <AgentComparison agents={agents} />
            </div>
          )}

          {/* Conflict Resolution */}
          {conflicts.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Merge Conflicts</h2>
              <ConflictResolution
                conflicts={conflicts}
                onResolve={handleResolveConflict}
              />
            </div>
          )}
        </>
      )}
    </div>
  )
}
