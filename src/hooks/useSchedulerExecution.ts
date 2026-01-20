// Hook for managing scheduler and agent execution orchestration

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSessionStore } from '@/stores/sessionStore'
import {
  initParallelScheduler,
  parallelAddTasks,
  parallelScheduleNext,
  parallelGetSchedulerStats,
  isGitRepository,
  initGitRepository,
  type SchedulerConfig,
} from '@/lib/parallel-api'
import type { ExecutionConfig, Task } from '@/types'

interface PendingSession {
  id: string
  projectPath: string
}

interface UseSchedulerExecutionReturn {
  /** Whether git init dialog should be shown */
  showGitInitDialog: boolean
  /** Whether git initialization is in progress */
  gitInitLoading: boolean
  /** Pending session info when waiting for git init decision */
  pendingSession: PendingSession | null
  /** Handler for initializing git repository */
  handleGitInit: () => Promise<void>
  /** Handler for skipping git initialization */
  handleSkipGitInit: () => Promise<void>
  /** Start the scheduler and spawn agents for a session */
  startSchedulerAndAgents: (
    sessionId: string,
    projectPath: string,
    tasks: Task[]
  ) => Promise<void>
  /** Check if project is a git repository and handle accordingly */
  checkGitAndExecute: (
    sessionId: string,
    projectPath: string,
    tasks: Task[]
  ) => Promise<boolean>
  /** Reset git dialog state */
  resetGitDialogState: () => void
}

/**
 * Hook for managing scheduler execution and git initialization flow
 *
 * Handles the orchestration of starting agents, including:
 * - Initializing the parallel scheduler
 * - Adding tasks to the scheduler
 * - Spawning agents up to maxParallel
 * - Git repository checks and initialization prompts
 *
 * @param config - The execution configuration
 * @param onComplete - Callback when execution completes (navigate away)
 * @returns Execution state and handlers
 *
 * @example
 * ```tsx
 * function ExecutionDialog({ config, onOpenChange }) {
 *   const {
 *     showGitInitDialog,
 *     gitInitLoading,
 *     handleGitInit,
 *     handleSkipGitInit,
 *     checkGitAndExecute,
 *   } = useSchedulerExecution(config, () => {
 *     onOpenChange(false)
 *     navigate('/agents')
 *   })
 *
 *   // When executing...
 *   const shouldContinue = await checkGitAndExecute(sessionId, projectPath, tasks)
 *   if (!shouldContinue) return // Git dialog shown
 * }
 * ```
 */
export function useSchedulerExecution(
  config: ExecutionConfig,
  onComplete: () => void
): UseSchedulerExecutionReturn {
  const navigate = useNavigate()

  // Git initialization dialog state
  const [showGitInitDialog, setShowGitInitDialog] = useState(false)
  const [gitInitLoading, setGitInitLoading] = useState(false)
  const [pendingSession, setPendingSession] = useState<PendingSession | null>(null)

  /**
   * Start the scheduler and spawn agents
   */
  async function startSchedulerAndAgents(
    sessionId: string,
    projectPath: string,
    tasks: Task[]
  ): Promise<void> {
    const isParallel = config.strategy !== 'sequential'
    const schedulerConfig: SchedulerConfig = {
      maxParallel: isParallel ? config.maxParallel : 1,
      maxIterations: config.maxIterations,
      maxRetries: config.maxRetries,
      agentType: config.agentType,
      strategy: config.strategy,
      resourceLimits: {
        maxAgents: config.maxParallel,
        maxCpuPerAgent: 50,
        maxMemoryMbPerAgent: 2048,
        maxTotalCpu: 80,
        maxTotalMemoryMb: 8192,
        maxRuntimeSecs: 3600,
      },
      model: config.model,
    }

    console.log('[PRD Execution] Starting agent spawn process...', {
      sessionId,
      projectPath,
      taskCount: tasks?.length ?? 0,
      schedulerConfig,
    })

    // Log task details for debugging
    if (tasks && tasks.length > 0) {
      console.log(
        '[PRD Execution] First 3 tasks:',
        tasks.slice(0, 3).map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          dependencies: t.dependencies,
        }))
      )
    } else {
      console.warn('[PRD Execution] WARNING: No tasks provided to scheduler!')
    }

    console.log('[PRD Execution] Initializing scheduler...')
    try {
      await initParallelScheduler(schedulerConfig, projectPath)
      console.log('[PRD Execution] Scheduler initialized successfully')
    } catch (initErr) {
      console.error('[PRD Execution] FAILED to initialize scheduler:', initErr)
      throw initErr
    }

    // Add tasks to the scheduler
    console.log('[PRD Execution] Adding', tasks?.length ?? 0, 'tasks to scheduler...')
    try {
      await parallelAddTasks(tasks)
      console.log('[PRD Execution] Tasks added successfully')

      // Get scheduler stats to verify task state
      const stats = await parallelGetSchedulerStats()
      console.log('[PRD Execution] Scheduler stats after adding tasks:', stats)
      if (stats.ready === 0 && stats.pending > 0) {
        console.warn(
          '[PRD Execution] WARNING: All tasks are pending, none are ready! Check task dependencies.'
        )
      }
    } catch (addErr) {
      console.error('[PRD Execution] FAILED to add tasks:', addErr)
      throw addErr
    }

    // Schedule agents (up to maxParallel)
    const maxToSpawn = isParallel ? config.maxParallel : 1
    console.log('[PRD Execution] Attempting to schedule up to', maxToSpawn, 'agents...')

    let spawnedCount = 0
    for (let i = 0; i < maxToSpawn; i++) {
      console.log(`[PRD Execution] Scheduling agent ${i + 1}/${maxToSpawn}...`)
      try {
        const agent = await parallelScheduleNext(sessionId, projectPath)
        if (agent) {
          spawnedCount++
          console.log(`[PRD Execution] Agent ${i + 1} scheduled successfully:`, {
            agentId: agent.id,
            taskId: agent.taskId,
            processId: agent.processId,
            branch: agent.branch,
          })
        } else {
          console.log(`[PRD Execution] parallelScheduleNext returned null - no more tasks ready`)
          break
        }
      } catch (scheduleErr) {
        console.error(`[PRD Execution] FAILED to schedule agent ${i + 1}:`, scheduleErr)
        // Continue trying to schedule other agents
      }
    }

    console.log(`[PRD Execution] Agent spawning complete. Spawned: ${spawnedCount}/${maxToSpawn}`)

    // Get final scheduler stats
    try {
      const finalStats = await parallelGetSchedulerStats()
      console.log('[PRD Execution] Final scheduler stats:', finalStats)
    } catch (statsErr) {
      console.warn('[PRD Execution] Could not get final scheduler stats:', statsErr)
    }

    if (spawnedCount === 0) {
      console.warn(
        '[PRD Execution] WARNING: No agents were spawned! Check backend logs for scheduler state.'
      )
    }
  }

  /**
   * Handle git initialization and continue execution
   */
  async function handleGitInit(): Promise<void> {
    if (!pendingSession) return

    setGitInitLoading(true)
    try {
      await initGitRepository(pendingSession.projectPath)
      console.log('[PRD Execution] Git repository initialized')

      // Get session from store to access tasks
      const session = useSessionStore.getState().currentSession
      if (session?.tasks && session.tasks.length > 0) {
        await startSchedulerAndAgents(pendingSession.id, pendingSession.projectPath, session.tasks)
      }

      setShowGitInitDialog(false)
      setPendingSession(null)
      onComplete()
      navigate('/agents')
    } catch (err) {
      console.error('[PRD Execution] Failed to initialize git:', err)
    } finally {
      setGitInitLoading(false)
    }
  }

  /**
   * Handle skipping git init - still spawn agents without git worktrees
   */
  async function handleSkipGitInit(): Promise<void> {
    if (!pendingSession) {
      setShowGitInitDialog(false)
      onComplete()
      navigate('/agents')
      return
    }

    setGitInitLoading(true)
    try {
      // Get session from store to access tasks
      const session = useSessionStore.getState().currentSession
      if (session?.tasks && session.tasks.length > 0) {
        // Spawn agents anyway - scheduler will use project path directly without git worktrees
        console.log('[PRD Execution] Skipping git init, spawning agents without worktrees...')
        await startSchedulerAndAgents(pendingSession.id, pendingSession.projectPath, session.tasks)
      }
    } catch (err) {
      console.error('[PRD Execution] Failed to start agents without git:', err)
    } finally {
      setGitInitLoading(false)
      setShowGitInitDialog(false)
      setPendingSession(null)
      onComplete()
      navigate('/agents')
    }
  }

  /**
   * Check if project is a git repository and handle accordingly
   * Returns true if execution should continue, false if git dialog was shown
   */
  async function checkGitAndExecute(
    sessionId: string,
    projectPath: string,
    tasks: Task[]
  ): Promise<boolean> {
    // Check if path is a git repository
    let isGitRepo = false
    try {
      isGitRepo = await isGitRepository(projectPath)
      console.log('[PRD Execution] Git repository check:', { isGitRepo, projectPath })
    } catch (gitCheckErr) {
      console.error(
        '[PRD Execution] Failed to check git repository, treating as non-git:',
        gitCheckErr
      )
      // Treat errors as "not a git repo"
      isGitRepo = false
    }

    if (!isGitRepo) {
      // Pause execution and show dialog
      console.log('[PRD Execution] Project is not a git repository, prompting user...')
      setPendingSession({ id: sessionId, projectPath })
      setShowGitInitDialog(true)
      return false // Don't continue - dialog will handle rest
    }

    // Is a git repo, start scheduler and agents
    try {
      await startSchedulerAndAgents(sessionId, projectPath, tasks)
    } catch (schedulerErr) {
      // Log scheduler errors but don't fail the whole execution
      // The session and tasks were created successfully
      console.error('[PRD Execution] Failed to start scheduler/agents:', schedulerErr)
    }

    return true
  }

  /**
   * Reset git dialog state (e.g., when dialog closes)
   */
  function resetGitDialogState(): void {
    setShowGitInitDialog(false)
    setPendingSession(null)
    setGitInitLoading(false)
  }

  return {
    showGitInitDialog,
    gitInitLoading,
    pendingSession,
    handleGitInit,
    handleSkipGitInit,
    startSchedulerAndAgents,
    checkGitAndExecute,
    resetGitDialogState,
  }
}
