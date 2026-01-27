// Ralph Wiggum Loop API wrappers

import type {
  RalphPrd,
  RalphPrdStatus,
  RalphProgressSummary,
  RalphFiles,
  RalphYamlConfig,
  InitRalphPrdRequest,
  RalphStoryInput,
  StartRalphLoopRequest,
  RalphLoopState,
  RalphLoopMetrics,
  RalphWorktreeInfo,
  IterationRecord,
  ExecutionStateSnapshot,
  IterationStats,
  RalphLoopSnapshot,
  Assignment,
  AssignmentsFile,
  FileInUse,
  LearningsFile,
  LearningEntry,
  AddLearningInput,
  UpdateLearningInput,
} from '@/types'
import { invoke } from '../invoke'

export const ralphLoopApi = {
  /** Initialize a Ralph PRD at .ralph/prd.json */
  initPrd: async (request: InitRalphPrdRequest): Promise<RalphPrd> => {
    return await invoke('init_ralph_prd', { request })
  },

  /** Read the Ralph PRD from .ralph-ui/prds/{prdName}.json */
  getPrd: async (projectPath: string, prdName: string): Promise<RalphPrd> => {
    return await invoke('get_ralph_prd', { projectPath, prdName })
  },

  /** Get the status of the Ralph PRD */
  getPrdStatus: async (projectPath: string, prdName: string): Promise<RalphPrdStatus> => {
    return await invoke('get_ralph_prd_status', { projectPath, prdName })
  },

  /** Mark a story as passing in the PRD */
  markStoryPassing: async (projectPath: string, storyId: string): Promise<boolean> => {
    return await invoke('mark_ralph_story_passing', { projectPath, storyId })
  },

  /** Mark a story as failing in the PRD */
  markStoryFailing: async (projectPath: string, storyId: string): Promise<boolean> => {
    return await invoke('mark_ralph_story_failing', { projectPath, storyId })
  },

  /** Add a story to the PRD */
  addStory: async (projectPath: string, story: RalphStoryInput): Promise<void> => {
    return await invoke('add_ralph_story', { projectPath, story })
  },

  /** Remove a story from the PRD */
  removeStory: async (projectPath: string, storyId: string): Promise<boolean> => {
    return await invoke('remove_ralph_story', { projectPath, storyId })
  },

  /** Get progress.txt content */
  getProgress: async (projectPath: string, prdName: string): Promise<string> => {
    return await invoke('get_ralph_progress', { projectPath, prdName })
  },

  /** Get progress summary */
  getProgressSummary: async (
    projectPath: string,
    prdName: string
  ): Promise<RalphProgressSummary> => {
    return await invoke('get_ralph_progress_summary', { projectPath, prdName })
  },

  /** Add a note to progress.txt */
  addProgressNote: async (projectPath: string, iteration: number, note: string): Promise<void> => {
    return await invoke('add_ralph_progress_note', { projectPath, iteration, note })
  },

  /** Clear progress.txt and reinitialize */
  clearProgress: async (projectPath: string): Promise<void> => {
    return await invoke('clear_ralph_progress', { projectPath })
  },

  /** Get the prompt.md content */
  getPrompt: async (projectPath: string, prdName: string): Promise<string> => {
    return await invoke('get_ralph_prompt', { projectPath, prdName })
  },

  /** Update the prompt.md content */
  setPrompt: async (projectPath: string, content: string): Promise<void> => {
    return await invoke('set_ralph_prompt', { projectPath, content })
  },

  /** Start a Ralph loop execution */
  startLoop: async (request: StartRalphLoopRequest): Promise<string> => {
    return await invoke('start_ralph_loop', { request })
  },

  /** Stop a running Ralph loop */
  stopLoop: async (executionId: string): Promise<void> => {
    return await invoke('stop_ralph_loop', { executionId })
  },

  /** Get the state of a Ralph loop execution */
  getLoopState: async (executionId: string): Promise<RalphLoopState> => {
    return await invoke('get_ralph_loop_state', { executionId })
  },

  /** Get metrics for a Ralph loop execution */
  getLoopMetrics: async (executionId: string): Promise<RalphLoopMetrics> => {
    return await invoke('get_ralph_loop_metrics', { executionId })
  },

  /** List all active Ralph loop executions */
  listExecutions: async (): Promise<string[]> => {
    return await invoke('list_ralph_loop_executions')
  },

  /** List all active Ralph loop executions with details */
  listExecutionsWithDetails: async (): Promise<
    { executionId: string; projectPath: string | null; state: string | null }[]
  > => {
    return await invoke('list_ralph_loop_executions_with_details')
  },

  /** Get current agent ID for terminal connection */
  getCurrentAgentId: async (executionId: string): Promise<string | null> => {
    return await invoke('get_ralph_loop_current_agent', { executionId })
  },

  /** Get worktree path for a Ralph loop execution */
  getWorktreePath: async (executionId: string): Promise<string | null> => {
    return await invoke('get_ralph_loop_worktree_path', { executionId })
  },

  /** Cleanup a Ralph loop worktree */
  cleanupWorktree: async (
    projectPath: string,
    worktreePath: string,
    deleteDirectory?: boolean
  ): Promise<void> => {
    return await invoke('cleanup_ralph_worktree', { projectPath, worktreePath, deleteDirectory })
  },

  /** List all Ralph worktrees for a project */
  listWorktrees: async (projectPath: string): Promise<RalphWorktreeInfo[]> => {
    return await invoke('list_ralph_worktrees', { projectPath })
  },

  /** Convert a file-based PRD to Ralph loop format */
  convertPrdFileToRalph: async (request: {
    projectPath: string
    prdName: string
    branch: string
    agentType?: string
    model?: string
    providerId?: string // Alternative API provider (e.g., "zai", "minimax")
    maxIterations?: number
    maxCost?: number
    runTests?: boolean
    runLint?: boolean
    useWorktree?: boolean
    templateName?: string // US-014: Template selection in execution
  }): Promise<RalphPrd> => {
    return await invoke('convert_prd_file_to_ralph', { request })
  },

  /** Check if a project has Ralph loop files */
  hasRalphFiles: async (projectPath: string): Promise<boolean> => {
    return await invoke('has_ralph_files', { projectPath })
  },

  /** Get all Ralph files for a project */
  getRalphFiles: async (projectPath: string): Promise<RalphFiles> => {
    return await invoke('get_ralph_files', { projectPath })
  },

  /** Get Ralph config for a project */
  getConfig: async (projectPath: string): Promise<RalphYamlConfig> => {
    return await invoke('get_ralph_config', { projectPath })
  },

  /** Set Ralph config for a project */
  setConfig: async (projectPath: string, config: RalphYamlConfig): Promise<void> => {
    return await invoke('set_ralph_config', { projectPath, config })
  },

  /** Initialize Ralph config with defaults */
  initConfig: async (projectPath: string): Promise<RalphYamlConfig> => {
    return await invoke('init_ralph_config', { projectPath })
  },

  /** Update specific Ralph config fields */
  updateConfig: async (
    projectPath: string,
    updates: {
      maxIterations?: number
      maxCost?: number
      agent?: string
      model?: string
      testCommand?: string
      lintCommand?: string
      buildCommand?: string
    }
  ): Promise<RalphYamlConfig> => {
    return await invoke('update_ralph_config', { projectPath, ...updates })
  },

  // ============================================================================
  // Iteration History API
  // ============================================================================

  /** Get iteration history for an execution */
  getIterationHistory: async (executionId: string): Promise<IterationRecord[]> => {
    return await invoke('get_ralph_iteration_history', { executionId })
  },

  /** Get iteration statistics for an execution */
  getIterationStats: async (executionId: string): Promise<IterationStats> => {
    return await invoke('get_ralph_iteration_stats', { executionId })
  },

  /** Get all iterations with optional filters */
  getAllIterations: async (
    executionId?: string,
    outcomeFilter?: string,
    limit?: number
  ): Promise<IterationRecord[]> => {
    return await invoke('get_all_ralph_iterations', {
      executionId,
      outcomeFilter,
      limit,
    })
  },

  /** Check for stale executions (crash recovery) */
  checkStaleExecutions: async (
    projectPath: string,
    thresholdSecs?: number
  ): Promise<ExecutionStateSnapshot[]> => {
    return await invoke('check_stale_ralph_executions', { projectPath, thresholdSecs })
  },

  /** Recover stale iterations (mark as interrupted) */
  recoverStaleIterations: async (projectPath: string, executionId: string): Promise<number> => {
    return await invoke('recover_stale_ralph_iterations', { projectPath, executionId })
  },

  /** Delete iteration history for an execution */
  deleteIterationHistory: async (executionId: string): Promise<number> => {
    return await invoke('delete_ralph_iteration_history', { executionId })
  },

  /** Get consolidated snapshot for efficient polling
   * Combines state, metrics, agent ID, worktree path, and iteration history in a single IPC call
   */
  getSnapshot: async (executionId: string, projectPath: string): Promise<RalphLoopSnapshot> => {
    return await invoke('get_ralph_loop_snapshot', { executionId, projectPath })
  },

  /** Cleanup old iteration history records (maintenance)
   * Deletes iterations older than the specified number of days (default: 30)
   * @returns Number of records deleted
   */
  cleanupIterationHistory: async (projectPath: string, daysToKeep?: number): Promise<number> => {
    return await invoke('cleanup_ralph_iteration_history', { projectPath, daysToKeep })
  },

  /** Regenerate acceptance criteria for stories in a Ralph PRD.
   * This re-parses the PRD markdown file and extracts proper acceptance criteria,
   * updating the PRD JSON while preserving pass/fail status.
   * @returns Updated RalphPrd with regenerated acceptance criteria
   */
  regenerateAcceptanceCriteria: async (projectPath: string, prdName: string): Promise<RalphPrd> => {
    return await invoke('regenerate_ralph_prd_acceptance', {
      request: { projectPath, prdName },
    })
  },

  /** Regenerate stories using AI to properly extract user stories from PRD markdown.
   * This is useful when initial story extraction created generic tasks instead of
   * proper US-X.X user stories.
   * @returns Updated RalphPrd with AI-extracted stories
   */
  regenerateStoriesWithAI: async (
    projectPath: string,
    prdName: string,
    agentType: string,
    model?: string
  ): Promise<RalphPrd> => {
    return await invoke('regenerate_ralph_prd_stories', {
      request: { projectPath, prdName, agentType, model },
    })
  },

  // ============================================================================
  // Assignment API (US-2.3: View Parallel Progress)
  // ============================================================================

  /** Get all assignments for a PRD */
  getAssignments: async (projectPath: string, prdName: string): Promise<AssignmentsFile> => {
    return await invoke('get_ralph_assignments', { projectPath, prdName })
  },

  /** Get files currently in use by active agents */
  getFilesInUse: async (projectPath: string, prdName: string): Promise<FileInUse[]> => {
    return await invoke('get_ralph_files_in_use', { projectPath, prdName })
  },

  /** Manually assign a story to an agent (US-4.3: Manual Story Assignment) */
  manuallyAssignStory: async (
    projectPath: string,
    prdName: string,
    agentId: string,
    agentType: string,
    storyId: string,
    force: boolean = false,
    estimatedFiles?: string[]
  ): Promise<Assignment> => {
    return await invoke('manual_assign_ralph_story', {
      projectPath,
      prdName,
      input: {
        agent_id: agentId,
        agent_type: agentType,
        story_id: storyId,
        force,
        estimated_files: estimatedFiles,
      },
    })
  },

  /** Release a story assignment back to the pool (US-4.3: Manual Story Assignment) */
  releaseStoryAssignment: async (
    projectPath: string,
    prdName: string,
    storyId: string
  ): Promise<boolean> => {
    return await invoke('release_ralph_story_assignment', { projectPath, prdName, storyId })
  },

  // ============================================================================
  // Brief Viewing API (US-6.1: View Current Brief)
  // ============================================================================

  /** Get the current BRIEF.md content for a PRD */
  getBrief: async (projectPath: string, prdName: string): Promise<string> => {
    return await invoke('get_ralph_brief', { projectPath, prdName })
  },

  /** Regenerate the BRIEF.md file for a PRD */
  regenerateBrief: async (projectPath: string, prdName: string): Promise<string> => {
    return await invoke('regenerate_ralph_brief', { projectPath, prdName })
  },

  /** Get historical briefs for a PRD */
  getHistoricalBriefs: async (
    projectPath: string,
    prdName: string
  ): Promise<Array<{ iteration: number; content: string }>> => {
    return await invoke('get_ralph_historical_briefs', { projectPath, prdName })
  },

  // ============================================================================
  // Learnings API (US-3.3: Manual Learning Entry)
  // ============================================================================

  /** Get all learnings for a PRD */
  getLearnings: async (projectPath: string, prdName: string): Promise<LearningsFile> => {
    return await invoke('get_ralph_learnings', { projectPath, prdName })
  },

  /** Add a manual learning entry */
  addLearning: async (
    projectPath: string,
    prdName: string,
    input: AddLearningInput
  ): Promise<LearningEntry> => {
    return await invoke('add_ralph_learning', { projectPath, prdName, input })
  },

  /** Update an existing learning entry */
  updateLearning: async (
    projectPath: string,
    prdName: string,
    input: UpdateLearningInput
  ): Promise<LearningEntry> => {
    return await invoke('update_ralph_learning', { projectPath, prdName, input })
  },

  /** Delete a learning entry */
  deleteLearning: async (
    projectPath: string,
    prdName: string,
    learningId: string
  ): Promise<boolean> => {
    return await invoke('delete_ralph_learning', { projectPath, prdName, learningId })
  },

  /** Export learnings to markdown (US-6.3: Learning Analytics) */
  exportLearnings: async (projectPath: string, prdName: string): Promise<string> => {
    return await invoke('export_ralph_learnings', { projectPath, prdName })
  },
}
