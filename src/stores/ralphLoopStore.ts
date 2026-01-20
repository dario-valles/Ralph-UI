// Ralph Wiggum Loop State Management Store
import { create } from 'zustand'
import { ralphLoopApi } from '@/lib/tauri-api'
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
} from '@/types'

interface RalphLoopStore extends AsyncState {
  // State
  currentProjectPath: string | null
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

  // Actions - PRD Management
  setProjectPath: (path: string | null) => void
  loadPrd: (projectPath: string) => Promise<void>
  loadPrdStatus: (projectPath: string) => Promise<void>
  initPrd: (request: InitRalphPrdRequest) => Promise<RalphPrd | undefined>
  markStoryPassing: (storyId: string) => Promise<boolean>
  markStoryFailing: (storyId: string) => Promise<boolean>
  addStory: (story: RalphStoryInput) => Promise<void>
  removeStory: (storyId: string) => Promise<boolean>

  // Actions - Progress Management
  loadProgress: (projectPath: string) => Promise<void>
  loadProgressSummary: (projectPath: string) => Promise<void>
  addProgressNote: (iteration: number, note: string) => Promise<void>
  clearProgress: () => Promise<void>

  // Actions - Prompt Management
  loadPrompt: (projectPath: string) => Promise<void>
  updatePrompt: (content: string) => Promise<void>

  // Actions - Loop Execution
  startLoop: (request: StartRalphLoopRequest) => Promise<string | undefined>
  stopLoop: () => Promise<void>
  loadLoopState: (silent?: boolean) => Promise<void>
  loadLoopMetrics: (silent?: boolean) => Promise<void>
  loadPrdStatusSilent: (projectPath: string) => Promise<void>
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
  convertPrdToRalph: (request: {
    prdId: string
    branch: string
    agentType?: string
    model?: string
    maxIterations?: number
    maxCost?: number
    runTests?: boolean
    runLint?: boolean
  }) => Promise<RalphPrd | undefined>
  refreshAll: () => Promise<void>
  clearError: () => void
}

export const useRalphLoopStore = create<RalphLoopStore>((set, get) => ({
  // Initial state
  currentProjectPath: null,
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
  loading: false,
  error: null,

  // Set the current project path
  setProjectPath: (path: string | null) => {
    set({ currentProjectPath: path })
    if (path) {
      // Load Ralph files for the project
      get().checkRalphFiles(path)
    }
  },

  // Load PRD from .ralph/prd.json
  loadPrd: async (projectPath: string) => {
    await asyncAction(set, async () => {
      const prd = await ralphLoopApi.getPrd(projectPath)
      return { prd, currentProjectPath: projectPath }
    })
  },

  // Load PRD status
  loadPrdStatus: async (projectPath: string) => {
    await asyncAction(set, async () => {
      const prdStatus = await ralphLoopApi.getPrdStatus(projectPath)
      return { prdStatus }
    })
  },

  // Initialize a new Ralph PRD
  initPrd: async (request: InitRalphPrdRequest) => {
    return asyncAction(
      set,
      async () => {
        const prd = await ralphLoopApi.initPrd(request)
        const prdStatus = await ralphLoopApi.getPrdStatus(request.projectPath)
        return {
          prd,
          prdStatus,
          currentProjectPath: request.projectPath,
          __result: prd,
        }
      },
      { rethrow: true }
    )
  },

  // Mark a story as passing
  markStoryPassing: async (storyId: string) => {
    const projectPath = get().currentProjectPath
    if (!projectPath) return false

    const result = await asyncAction(
      set,
      async () => {
        const success = await ralphLoopApi.markStoryPassing(projectPath, storyId)
        if (success) {
          // Reload PRD and status
          const prd = await ralphLoopApi.getPrd(projectPath)
          const prdStatus = await ralphLoopApi.getPrdStatus(projectPath)
          return { prd, prdStatus, __result: success }
        }
        return { __result: success }
      },
      { rethrow: true }
    )
    return result ?? false
  },

  // Mark a story as failing
  markStoryFailing: async (storyId: string) => {
    const projectPath = get().currentProjectPath
    if (!projectPath) return false

    const result = await asyncAction(
      set,
      async () => {
        const success = await ralphLoopApi.markStoryFailing(projectPath, storyId)
        if (success) {
          // Reload PRD and status
          const prd = await ralphLoopApi.getPrd(projectPath)
          const prdStatus = await ralphLoopApi.getPrdStatus(projectPath)
          return { prd, prdStatus, __result: success }
        }
        return { __result: success }
      },
      { rethrow: true }
    )
    return result ?? false
  },

  // Add a story to the PRD
  addStory: async (story: RalphStoryInput) => {
    const projectPath = get().currentProjectPath
    if (!projectPath) return

    await asyncAction(
      set,
      async () => {
        await ralphLoopApi.addStory(projectPath, story)
        // Reload PRD and status
        const prd = await ralphLoopApi.getPrd(projectPath)
        const prdStatus = await ralphLoopApi.getPrdStatus(projectPath)
        return { prd, prdStatus }
      },
      { rethrow: true }
    )
  },

  // Remove a story from the PRD
  removeStory: async (storyId: string) => {
    const projectPath = get().currentProjectPath
    if (!projectPath) return false

    const result = await asyncAction(
      set,
      async () => {
        const success = await ralphLoopApi.removeStory(projectPath, storyId)
        if (success) {
          // Reload PRD and status
          const prd = await ralphLoopApi.getPrd(projectPath)
          const prdStatus = await ralphLoopApi.getPrdStatus(projectPath)
          return { prd, prdStatus, __result: success }
        }
        return { __result: success }
      },
      { rethrow: true }
    )
    return result ?? false
  },

  // Load progress.txt content
  loadProgress: async (projectPath: string) => {
    await asyncAction(set, async () => {
      const progress = await ralphLoopApi.getProgress(projectPath)
      return { progress }
    })
  },

  // Load progress summary
  loadProgressSummary: async (projectPath: string) => {
    await asyncAction(set, async () => {
      const progressSummary = await ralphLoopApi.getProgressSummary(projectPath)
      return { progressSummary }
    })
  },

  // Add a note to progress.txt
  addProgressNote: async (iteration: number, note: string) => {
    const projectPath = get().currentProjectPath
    if (!projectPath) return

    await asyncAction(
      set,
      async () => {
        await ralphLoopApi.addProgressNote(projectPath, iteration, note)
        // Reload progress
        const progress = await ralphLoopApi.getProgress(projectPath)
        const progressSummary = await ralphLoopApi.getProgressSummary(projectPath)
        return { progress, progressSummary }
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
  loadPrompt: async (projectPath: string) => {
    await asyncAction(set, async () => {
      const prompt = await ralphLoopApi.getPrompt(projectPath)
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
    console.log('[RalphLoopStore] startLoop called with request:', request)
    return asyncAction(
      set,
      async () => {
        console.log('[RalphLoopStore] Calling ralphLoopApi.startLoop...')
        const executionId = await ralphLoopApi.startLoop(request)
        console.log('[RalphLoopStore] Got executionId:', executionId)
        const executionState = await ralphLoopApi.getLoopState(executionId)
        console.log('[RalphLoopStore] Got executionState:', executionState)
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

    await asyncAction(set, async () => {
      const [executionState, currentAgentId, worktreePath] = await Promise.all([
        ralphLoopApi.getLoopState(executionId),
        ralphLoopApi.getCurrentAgentId(executionId),
        ralphLoopApi.getWorktreePath(executionId),
      ])
      return { executionState, currentAgentId, worktreePath }
    }, { silent })
  },

  // Load loop metrics
  loadLoopMetrics: async (silent?: boolean) => {
    const executionId = get().activeExecutionId
    if (!executionId) return

    await asyncAction(set, async () => {
      const executionMetrics = await ralphLoopApi.getLoopMetrics(executionId)
      return { executionMetrics }
    }, { silent })
  },

  // Load PRD status silently (for background polling)
  loadPrdStatusSilent: async (projectPath: string) => {
    await asyncAction(set, async () => {
      const prdStatus = await ralphLoopApi.getPrdStatus(projectPath)
      return { prdStatus }
    }, { silent: true })
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
    if (!prd?.metadata?.lastExecutionId) {
      return
    }

    const lastExecutionId = prd.metadata.lastExecutionId

    try {
      // Get the state of the last execution
      const executionState = await ralphLoopApi.getLoopState(lastExecutionId)

      // Helper to check if state is active
      const isActiveState = (state: RalphLoopState): boolean => {
        return state.type === 'running' || state.type === 'paused' || state.type === 'retrying'
      }

      if (isActiveState(executionState)) {
        // Execution is still active, resume tracking
        const [currentAgentId, worktreePath, executionMetrics] = await Promise.all([
          ralphLoopApi.getCurrentAgentId(lastExecutionId),
          ralphLoopApi.getWorktreePath(lastExecutionId),
          ralphLoopApi.getLoopMetrics(lastExecutionId).catch(() => null),
        ])

        set({
          activeExecutionId: lastExecutionId,
          executionState,
          currentAgentId,
          worktreePath,
          executionMetrics,
        })
      }
    } catch {
      // Execution doesn't exist anymore, ignore
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

  // Convert a database PRD to Ralph format
  convertPrdToRalph: async (request: {
    prdId: string
    branch: string
    agentType?: string
    model?: string
    maxIterations?: number
    maxCost?: number
    runTests?: boolean
    runLint?: boolean
  }) => {
    return asyncAction(
      set,
      async () => {
        const prd = await ralphLoopApi.convertPrdToRalph(request)
        const projectPath = get().currentProjectPath
        if (projectPath) {
          const prdStatus = await ralphLoopApi.getPrdStatus(projectPath)
          return { prd, prdStatus, __result: prd }
        }
        return { prd, __result: prd }
      },
      { rethrow: true }
    )
  },

  // Refresh all data for the current project
  refreshAll: async () => {
    const projectPath = get().currentProjectPath
    if (!projectPath) return

    await asyncAction(set, async () => {
      const [prd, prdStatus, progress, progressSummary, prompt, ralphFiles, commits, config] = await Promise.all([
        ralphLoopApi.getPrd(projectPath).catch(() => null),
        ralphLoopApi.getPrdStatus(projectPath).catch(() => null),
        ralphLoopApi.getProgress(projectPath).catch(() => ''),
        ralphLoopApi.getProgressSummary(projectPath).catch(() => null),
        ralphLoopApi.getPrompt(projectPath).catch(() => ''),
        ralphLoopApi.getRalphFiles(projectPath).catch(() => null),
        gitApi.getCommitHistory(projectPath, 50).catch(() => []),
        ralphLoopApi.getConfig(projectPath).catch(() => null),
      ])
      return { prd, prdStatus, progress, progressSummary, prompt, ralphFiles, commits, config }
    })
  },

  // Clear error state
  clearError: () => {
    set({ error: null })
  },
}))
