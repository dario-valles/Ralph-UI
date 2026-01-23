// Ralph Wiggum Loop State Management Store
import { create } from 'zustand'
import { ralphLoopApi } from '@/lib/backend-api'
import { gitApi, type CommitInfo } from '@/lib/git-api'
import { asyncAction, type AsyncState } from '@/lib/store-utils'
import type {
  RalphPrd,
  RalphPrdStatus,
  RalphProgressSummary,
  RalphFiles,
  RalphConfig,
  RalphLoopState,
  RalphLoopMetrics,
  InitRalphPrdRequest,
  RalphStoryInput,
  StartRalphLoopRequest,
  IterationRecord,
} from '@/types'

interface RalphLoopStore extends AsyncState {
  // State
  currentProjectPath: string | null
  currentPrdName: string | null // For file-based PRDs in .ralph-ui/prds/
  prd: RalphPrd | null
  prdStatus: RalphPrdStatus | null
  progress: string
  progressSummary: RalphProgressSummary | null
  prompt: string
  ralphFiles: RalphFiles | null
  config: RalphConfig | null
  commits: CommitInfo[]

  // Execution state
  activeExecutionId: string | null
  executionState: RalphLoopState | null
  executionMetrics: RalphLoopMetrics | null
  activeExecutions: string[]
  currentAgentId: string | null
  worktreePath: string | null
  executionBranch: string | null
  iterationHistory: IterationRecord[]

  // Actions - PRD Management
  setProjectPath: (path: string | null, prdName: string | null) => void
  loadPrd: (projectPath: string, prdName: string, silent?: boolean) => Promise<void>
  loadPrdStatus: (projectPath: string, prdName: string, silent?: boolean) => Promise<void>
  initPrd: (request: InitRalphPrdRequest) => Promise<RalphPrd | undefined>
  markStoryPassing: (storyId: string) => Promise<boolean>
  markStoryFailing: (storyId: string) => Promise<boolean>
  addStory: (story: RalphStoryInput) => Promise<void>
  removeStory: (storyId: string) => Promise<boolean>

  // Actions - Progress Management
  loadProgress: (projectPath: string, prdName: string) => Promise<void>
  loadProgressSummary: (projectPath: string, prdName: string, silent?: boolean) => Promise<void>
  addProgressNote: (iteration: number, note: string) => Promise<void>
  clearProgress: () => Promise<void>

  // Actions - Prompt Management
  loadPrompt: (projectPath: string, prdName: string) => Promise<void>
  updatePrompt: (content: string) => Promise<void>

  // Actions - Loop Execution
  startLoop: (request: StartRalphLoopRequest) => Promise<string | undefined>
  stopLoop: () => Promise<void>
  loadLoopState: (silent?: boolean) => Promise<void>
  loadLoopMetrics: (silent?: boolean) => Promise<void>
  loadIterationHistory: (silent?: boolean) => Promise<void>
  /** Load consolidated snapshot (state, metrics, history) in a single IPC call */
  loadSnapshot: (silent?: boolean) => Promise<void>
  listExecutions: () => Promise<void>

  // Actions - Git
  loadCommits: (projectPath: string, maxCount?: number) => Promise<void>

  // Actions - Config
  loadConfig: (projectPath: string) => Promise<void>
  updateConfig: (updates: {
    maxIterations?: number
    maxCost?: number
    agent?: string
    model?: string
    testCommand?: string
    lintCommand?: string
    buildCommand?: string
  }) => Promise<void>

  // Actions - Execution Discovery
  checkForActiveExecution: () => Promise<void>

  // Actions - Utilities
  checkRalphFiles: (projectPath: string) => Promise<RalphFiles | undefined>
  refreshAll: () => Promise<void>
  clearError: () => void
}

// Helper: reload PRD and status data for a project
const reloadPrdData = async (projectPath: string, prdName: string) => {
  const [prd, prdStatus] = await Promise.all([
    ralphLoopApi.getPrd(projectPath, prdName),
    ralphLoopApi.getPrdStatus(projectPath, prdName),
  ])
  return { prd, prdStatus }
}

// Helper: reload progress data for a project
const reloadProgressData = async (projectPath: string, prdName: string) => {
  const [progress, progressSummary] = await Promise.all([
    ralphLoopApi.getProgress(projectPath, prdName),
    ralphLoopApi.getProgressSummary(projectPath, prdName),
  ])
  return { progress, progressSummary }
}

export const useRalphLoopStore = create<RalphLoopStore>((set, get) => ({
  // Initial state
  currentProjectPath: null,
  currentPrdName: null,
  prd: null,
  prdStatus: null,
  progress: '',
  progressSummary: null,
  prompt: '',
  ralphFiles: null,
  config: null,
  commits: [],
  activeExecutionId: null,
  executionState: null,
  executionMetrics: null,
  activeExecutions: [],
  currentAgentId: null,
  worktreePath: null,
  executionBranch: null,
  iterationHistory: [],
  loading: false,
  error: null,

  // Set the current project path and optional prdName
  setProjectPath: (path: string | null, prdName?: string | null) => {
    set({ currentProjectPath: path, currentPrdName: prdName || null })
    if (path) {
      // Load Ralph files for the project
      get().checkRalphFiles(path)
    }
  },

  // Load PRD from .ralph-ui/prds/{prdName}.json
  loadPrd: async (projectPath: string, prdName: string, silent?: boolean) => {
    await asyncAction(set, async () => {
      const prd = await ralphLoopApi.getPrd(projectPath, prdName)
      return { prd, currentProjectPath: projectPath, currentPrdName: prdName }
    }, { silent })
  },

  // Load PRD status
  loadPrdStatus: async (projectPath: string, prdName: string, silent?: boolean) => {
    await asyncAction(set, async () => {
      const prdStatus = await ralphLoopApi.getPrdStatus(projectPath, prdName)
      return { prdStatus }
    }, { silent })
  },

  // Initialize a new Ralph PRD (legacy - creates in .ralph/ format)
  // Note: This is deprecated in favor of file-based PRDs
  initPrd: async (request: InitRalphPrdRequest) => {
    // This creates a legacy PRD - prdName would come from the created PRD ID
    // For now, skip prdStatus since it's legacy
    return asyncAction(
      set,
      async () => {
        const prd = await ralphLoopApi.initPrd(request)
        return {
          prd,
          currentProjectPath: request.projectPath,
          __result: prd,
        }
      },
      { rethrow: true }
    )
  },

  // Mark a story as passing
  markStoryPassing: async (storyId: string) => {
    const { currentProjectPath, currentPrdName } = get()
    if (!currentProjectPath || !currentPrdName) return false

    const result = await asyncAction(
      set,
      async () => {
        const success = await ralphLoopApi.markStoryPassing(currentProjectPath, storyId)
        if (success) {
          return { ...(await reloadPrdData(currentProjectPath, currentPrdName)), __result: success }
        }
        return { __result: success }
      },
      { rethrow: true }
    )
    return result ?? false
  },

  // Mark a story as failing
  markStoryFailing: async (storyId: string) => {
    const { currentProjectPath, currentPrdName } = get()
    if (!currentProjectPath || !currentPrdName) return false

    const result = await asyncAction(
      set,
      async () => {
        const success = await ralphLoopApi.markStoryFailing(currentProjectPath, storyId)
        if (success) {
          return { ...(await reloadPrdData(currentProjectPath, currentPrdName)), __result: success }
        }
        return { __result: success }
      },
      { rethrow: true }
    )
    return result ?? false
  },

  // Add a story to the PRD
  addStory: async (story: RalphStoryInput) => {
    const { currentProjectPath, currentPrdName } = get()
    if (!currentProjectPath || !currentPrdName) return

    await asyncAction(
      set,
      async () => {
        await ralphLoopApi.addStory(currentProjectPath, story)
        return await reloadPrdData(currentProjectPath, currentPrdName)
      },
      { rethrow: true }
    )
  },

  // Remove a story from the PRD
  removeStory: async (storyId: string) => {
    const { currentProjectPath, currentPrdName } = get()
    if (!currentProjectPath || !currentPrdName) return false

    const result = await asyncAction(
      set,
      async () => {
        const success = await ralphLoopApi.removeStory(currentProjectPath, storyId)
        if (success) {
          return { ...(await reloadPrdData(currentProjectPath, currentPrdName)), __result: success }
        }
        return { __result: success }
      },
      { rethrow: true }
    )
    return result ?? false
  },

  // Load progress.txt content
  loadProgress: async (projectPath: string, prdName: string) => {
    await asyncAction(set, async () => {
      const progress = await ralphLoopApi.getProgress(projectPath, prdName)
      return { progress }
    })
  },

  // Load progress summary
  loadProgressSummary: async (projectPath: string, prdName: string, silent?: boolean) => {
    await asyncAction(set, async () => {
      const progressSummary = await ralphLoopApi.getProgressSummary(projectPath, prdName)
      return { progressSummary }
    }, { silent })
  },

  // Add a note to progress.txt
  addProgressNote: async (iteration: number, note: string) => {
    const { currentProjectPath, currentPrdName } = get()
    if (!currentProjectPath || !currentPrdName) return

    await asyncAction(
      set,
      async () => {
        await ralphLoopApi.addProgressNote(currentProjectPath, iteration, note)
        return await reloadProgressData(currentProjectPath, currentPrdName)
      },
      { rethrow: true }
    )
  },

  // Clear progress.txt
  clearProgress: async () => {
    const projectPath = get().currentProjectPath
    if (!projectPath) return

    await asyncAction(
      set,
      async () => {
        await ralphLoopApi.clearProgress(projectPath)
        return { progress: '', progressSummary: null }
      },
      { rethrow: true }
    )
  },

  // Load prompt.md content
  loadPrompt: async (projectPath: string, prdName: string) => {
    await asyncAction(set, async () => {
      const prompt = await ralphLoopApi.getPrompt(projectPath, prdName)
      return { prompt }
    })
  },

  // Update prompt.md content
  updatePrompt: async (content: string) => {
    const projectPath = get().currentProjectPath
    if (!projectPath) return

    await asyncAction(
      set,
      async () => {
        await ralphLoopApi.setPrompt(projectPath, content)
        return { prompt: content }
      },
      { rethrow: true }
    )
  },

  // Start a Ralph loop execution
  startLoop: async (request: StartRalphLoopRequest) => {
    return asyncAction(
      set,
      async () => {
        const executionId = await ralphLoopApi.startLoop(request)
        const executionState = await ralphLoopApi.getLoopState(executionId)
        return {
          activeExecutionId: executionId,
          executionState,
          currentProjectPath: request.projectPath,
          __result: executionId,
        }
      },
      { rethrow: true }
    )
  },

  // Stop the current Ralph loop
  stopLoop: async () => {
    const executionId = get().activeExecutionId
    if (!executionId) return

    await asyncAction(
      set,
      async () => {
        await ralphLoopApi.stopLoop(executionId)
        const executionState = await ralphLoopApi.getLoopState(executionId)
        return { executionState }
      },
      { rethrow: true }
    )
  },

  // Load loop state
  loadLoopState: async (silent?: boolean) => {
    const executionId = get().activeExecutionId
    if (!executionId) return

    await asyncAction(
      set,
      async () => {
        const [executionState, currentAgentId, worktreePath] = await Promise.all([
          ralphLoopApi.getLoopState(executionId),
          ralphLoopApi.getCurrentAgentId(executionId),
          ralphLoopApi.getWorktreePath(executionId),
        ])
        return { executionState, currentAgentId, worktreePath }
      },
      { silent }
    )
  },

  // Load loop metrics
  loadLoopMetrics: async (silent?: boolean) => {
    const executionId = get().activeExecutionId
    if (!executionId) return

    await asyncAction(
      set,
      async () => {
        const executionMetrics = await ralphLoopApi.getLoopMetrics(executionId)
        return { executionMetrics }
      },
      { silent }
    )
  },

  // Load iteration history for the active execution
  loadIterationHistory: async (silent?: boolean) => {
    const executionId = get().activeExecutionId
    if (!executionId) return

    await asyncAction(
      set,
      async () => {
        const iterationHistory = await ralphLoopApi.getIterationHistory(executionId)
        return { iterationHistory: iterationHistory ?? [] }
      },
      { silent }
    )
  },

  // Load consolidated snapshot (state, metrics, agent ID, worktree, iteration history)
  // This combines 4 separate IPC calls into 1 for efficient polling
  loadSnapshot: async (silent?: boolean) => {
    const executionId = get().activeExecutionId
    const projectPath = get().currentProjectPath
    if (!executionId || !projectPath) return

    await asyncAction(
      set,
      async () => {
        const snapshot = await ralphLoopApi.getSnapshot(executionId, projectPath)
        return {
          executionState: snapshot.state ?? null,
          executionMetrics: snapshot.metrics ?? null,
          currentAgentId: snapshot.currentAgentId ?? null,
          worktreePath: snapshot.worktreePath ?? null,
          iterationHistory: snapshot.iterationHistory ?? [],
        }
      },
      { silent }
    )
  },

  // List all active executions
  listExecutions: async () => {
    await asyncAction(set, async () => {
      const activeExecutions = await ralphLoopApi.listExecutions()
      return { activeExecutions }
    })
  },

  // Load git commit history for the project
  loadCommits: async (projectPath: string, maxCount: number = 50) => {
    await asyncAction(set, async () => {
      const commits = await gitApi.getCommitHistory(projectPath, maxCount)
      return { commits }
    })
  },

  // Load Ralph config for a project
  loadConfig: async (projectPath: string) => {
    await asyncAction(set, async () => {
      const config = await ralphLoopApi.getConfig(projectPath)
      return { config }
    })
  },

  // Update Ralph config
  updateConfig: async (updates: {
    maxIterations?: number
    maxCost?: number
    agent?: string
    model?: string
    testCommand?: string
    lintCommand?: string
    buildCommand?: string
  }) => {
    const projectPath = get().currentProjectPath
    if (!projectPath) return

    await asyncAction(
      set,
      async () => {
        const config = await ralphLoopApi.updateConfig(projectPath, updates)
        return { config }
      },
      { rethrow: true }
    )
  },

  // Check for an active execution for a project and resume tracking
  checkForActiveExecution: async () => {
    // Get the PRD to check for last execution ID
    const prd = get().prd
    const projectPath = get().currentProjectPath
    if (!prd?.metadata?.lastExecutionId || !projectPath) {
      return
    }

    const lastExecutionId = prd.metadata.lastExecutionId

    try {
      // Use getSnapshot which has file-based fallback (avoids 400 errors when execution not in memory)
      const snapshot = await ralphLoopApi.getSnapshot(lastExecutionId, projectPath)

      // Helper to check if state is active
      const isActiveState = (state: RalphLoopState | null): boolean => {
        if (!state) return false
        return state.type === 'running' || state.type === 'paused' || state.type === 'retrying'
      }

      if (snapshot.state && isActiveState(snapshot.state)) {
        // Execution is still active, resume tracking
        set({
          activeExecutionId: lastExecutionId,
          executionState: snapshot.state,
          currentAgentId: snapshot.currentAgentId ?? null,
          worktreePath: snapshot.worktreePath ?? null,
          executionMetrics: snapshot.metrics ?? null,
        })
      }
    } catch {
      // Execution doesn't exist anymore (not in memory or file), ignore
      console.debug('[RalphLoopStore] Last execution not found:', lastExecutionId)
    }
  },

  // Check Ralph files for a project
  checkRalphFiles: async (projectPath: string) => {
    return asyncAction(set, async () => {
      const ralphFiles = await ralphLoopApi.getRalphFiles(projectPath)
      return { ralphFiles, __result: ralphFiles }
    })
  },

  // Refresh all data for the current project
  refreshAll: async () => {
    const { currentProjectPath, currentPrdName } = get()
    if (!currentProjectPath || !currentPrdName) return

    await asyncAction(set, async () => {
      const [prd, prdStatus, progress, progressSummary, prompt, ralphFiles, commits, config] =
        await Promise.all([
          ralphLoopApi.getPrd(currentProjectPath, currentPrdName).catch(() => null),
          ralphLoopApi.getPrdStatus(currentProjectPath, currentPrdName).catch(() => null),
          ralphLoopApi.getProgress(currentProjectPath, currentPrdName).catch(() => ''),
          ralphLoopApi.getProgressSummary(currentProjectPath, currentPrdName).catch(() => null),
          ralphLoopApi.getPrompt(currentProjectPath, currentPrdName).catch(() => ''),
          ralphLoopApi.getRalphFiles(currentProjectPath).catch(() => null),
          gitApi.getCommitHistory(currentProjectPath, 50).catch(() => []),
          ralphLoopApi.getConfig(currentProjectPath).catch(() => null),
        ])
      return { prd, prdStatus, progress, progressSummary, prompt, ralphFiles, commits, config }
    })
  },

  // Clear error state
  clearError: () => {
    set({ error: null })
  },
}))
