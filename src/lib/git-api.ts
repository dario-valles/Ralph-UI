import { invoke } from '@tauri-apps/api/core'

// ========================================
// Git Types
// ========================================

export interface BranchInfo {
  name: string
  is_head: boolean
  upstream: string | null
  commit_id: string
}

export interface CommitInfo {
  id: string
  short_id: string
  message: string
  author: string
  email: string
  timestamp: number
  parent_ids: string[]
}

export interface WorktreeInfo {
  name: string
  path: string
  branch: string | null
  is_locked: boolean
}

export interface FileStatus {
  path: string
  status: string
}

export interface DiffInfo {
  files_changed: number
  insertions: number
  deletions: number
  files: FileDiff[]
}

export interface FileDiff {
  old_path: string | null
  new_path: string | null
  status: string
  insertions: number
  deletions: number
}

export interface MergeResult {
  success: boolean
  message: string
  conflict_files: string[]
  commit_id: string | null
  fast_forward: boolean
}

// ========================================
// GitHub Types
// ========================================

export interface PullRequest {
  number: number
  title: string
  body: string | null
  state: string
  html_url: string
  head_branch: string
  base_branch: string
  created_at: string
  updated_at: string
  merged: boolean
}

export interface Issue {
  number: number
  title: string
  body: string | null
  state: string
  html_url: string
  labels: string[]
  created_at: string
  updated_at: string
}

/**
 * Result of importing GitHub issues to a PRD
 */
export interface IssueImportResult {
  importedCount: number
  skippedCount: number
  importedStoryIds: string[]
  warnings: string[]
}

// ========================================
// Conflict Resolution Types
// ========================================

/**
 * Detailed information about a single file in conflict
 */
export interface ConflictInfo {
  path: string
  our_content: string // Content from target branch (ours)
  their_content: string // Content from source branch (theirs)
  ancestor_content: string // Content from common ancestor
  conflict_markers: string // Full file with conflict markers
}

/**
 * Resolution for a single conflicted file
 */
export interface ConflictResolution {
  path: string
  resolved_content: string
}

/**
 * Options for merge workflow (direct merge vs PR)
 */
export interface MergeOptions {
  source_branch: string
  target_branch: string
  create_pr?: boolean // Create PR instead of direct merge
  pr_title?: string
  pr_body?: string
  pr_draft?: boolean
  auto_resolve_conflicts?: boolean // Use AI for conflict resolution
}

/**
 * Result of a merge workflow operation
 */
export interface MergeWorkflowResult {
  merged: boolean
  pr_url?: string // If PR was created
  commit_id?: string // If direct merge succeeded
  conflicts_resolved?: number // Count of AI-resolved conflicts
  error?: string
}

/**
 * Result of resolving a single conflict with AI
 */
export interface ConflictResolutionResult {
  path: string
  success: boolean
  resolvedContent?: string
  error?: string
  durationSecs: number
}

/**
 * Result of resolving all conflicts in a merge with AI
 */
export interface MergeResolutionResult {
  resolutions: ConflictResolutionResult[]
  resolvedCount: number
  failedCount: number
  totalDurationSecs: number
}

/**
 * Supported AI agent types for conflict resolution
 */
export type ConflictResolverAgent = 'claude' | 'opencode' | 'cursor' | 'codex' | 'qwen' | 'droid'

// ========================================
// Git API Functions
// ========================================

export const gitApi = {
  /**
   * Create a new branch
   */
  createBranch: async (
    repoPath: string,
    name: string,
    force: boolean = false
  ): Promise<BranchInfo> => {
    return invoke('git_create_branch', { repoPath, name, force })
  },

  /**
   * Create a branch from a specific commit
   */
  createBranchFromCommit: async (
    repoPath: string,
    name: string,
    commitId: string,
    force: boolean = false
  ): Promise<BranchInfo> => {
    return invoke('git_create_branch_from_commit', {
      repoPath,
      name,
      commitId,
      force,
    })
  },

  /**
   * Delete a branch
   */
  deleteBranch: async (repoPath: string, name: string): Promise<void> => {
    return invoke('git_delete_branch', { repoPath, name })
  },

  /**
   * List all branches
   */
  listBranches: async (repoPath: string): Promise<BranchInfo[]> => {
    return invoke('git_list_branches', { repoPath })
  },

  /**
   * Get the current branch
   */
  getCurrentBranch: async (repoPath: string): Promise<BranchInfo> => {
    return invoke('git_get_current_branch', { repoPath })
  },

  /**
   * Checkout a branch
   */
  checkoutBranch: async (repoPath: string, name: string): Promise<void> => {
    return invoke('git_checkout_branch', { repoPath, name })
  },

  /**
   * Create a worktree
   */
  createWorktree: async (repoPath: string, branch: string, path: string): Promise<WorktreeInfo> => {
    return invoke('git_create_worktree', { repoPath, branch, path })
  },

  /**
   * List all worktrees
   */
  listWorktrees: async (repoPath: string): Promise<WorktreeInfo[]> => {
    return invoke('git_list_worktrees', { repoPath })
  },

  /**
   * Remove a worktree
   */
  removeWorktree: async (repoPath: string, name: string): Promise<void> => {
    return invoke('git_remove_worktree', { repoPath, name })
  },

  /**
   * Get git status
   */
  getStatus: async (repoPath: string): Promise<FileStatus[]> => {
    return invoke('git_get_status', { repoPath })
  },

  /**
   * Get commit history
   */
  getCommitHistory: async (repoPath: string, maxCount: number = 50): Promise<CommitInfo[]> => {
    return invoke('git_get_commit_history', { repoPath, maxCount })
  },

  /**
   * Get a specific commit
   */
  getCommit: async (repoPath: string, commitId: string): Promise<CommitInfo> => {
    return invoke('git_get_commit', { repoPath, commitId })
  },

  /**
   * Create a commit
   */
  createCommit: async (
    repoPath: string,
    message: string,
    authorName: string,
    authorEmail: string
  ): Promise<CommitInfo> => {
    return invoke('git_create_commit', {
      repoPath,
      message,
      authorName,
      authorEmail,
    })
  },

  /**
   * Stage files for commit
   */
  stageFiles: async (repoPath: string, paths: string[]): Promise<void> => {
    return invoke('git_stage_files', { repoPath, paths })
  },

  /**
   * Stage all files
   */
  stageAll: async (repoPath: string): Promise<void> => {
    return invoke('git_stage_all', { repoPath })
  },

  /**
   * Get diff between commits
   */
  getDiff: async (repoPath: string, fromCommit?: string, toCommit?: string): Promise<DiffInfo> => {
    return invoke('git_get_diff', { repoPath, fromCommit, toCommit })
  },

  /**
   * Get working directory diff
   */
  getWorkingDiff: async (repoPath: string): Promise<DiffInfo> => {
    return invoke('git_get_working_diff', { repoPath })
  },

  /**
   * Merge a source branch into a target branch
   */
  mergeBranch: async (
    repoPath: string,
    sourceBranch: string,
    targetBranch: string
  ): Promise<MergeResult> => {
    return invoke('git_merge_branch', { repoPath, sourceBranch, targetBranch })
  },

  /**
   * Abort an ongoing merge
   */
  mergeAbort: async (repoPath: string): Promise<void> => {
    return invoke('git_merge_abort', { repoPath })
  },

  /**
   * Check for merge conflicts between two branches without merging
   */
  checkMergeConflicts: async (
    repoPath: string,
    sourceBranch: string,
    targetBranch: string
  ): Promise<string[]> => {
    return invoke('git_check_merge_conflicts', {
      repoPath,
      sourceBranch,
      targetBranch,
    })
  },

  // ========================================
  // Conflict Resolution Functions
  // ========================================

  /**
   * Get detailed conflict information for files in a merge conflict state.
   * Call this after mergeBranch returns with conflicts to get the content
   * needed for AI-assisted resolution.
   */
  getConflictDetails: async (repoPath: string): Promise<ConflictInfo[]> => {
    return invoke('git_get_conflict_details', { repoPath })
  },

  /**
   * Apply a resolved file content and stage it.
   * Use this after AI has resolved the conflict.
   */
  resolveConflict: async (repoPath: string, resolution: ConflictResolution): Promise<void> => {
    return invoke('git_resolve_conflict', {
      repoPath,
      path: resolution.path,
      resolvedContent: resolution.resolved_content,
    })
  },

  /**
   * Complete a merge after all conflicts have been resolved.
   * Creates the merge commit.
   */
  completeMerge: async (
    repoPath: string,
    message: string,
    authorName: string,
    authorEmail: string
  ): Promise<CommitInfo> => {
    return invoke('git_complete_merge', {
      repoPath,
      message,
      authorName,
      authorEmail,
    })
  },

  /**
   * Push a branch to the remote repository
   */
  pushBranch: async (
    repoPath: string,
    branchName: string,
    force: boolean = false
  ): Promise<void> => {
    return invoke('git_push_branch', { repoPath, branchName, force })
  },

  /**
   * Resolve all conflicts using AI (Claude Code or other CLI agent).
   * This command:
   * 1. Gets conflict details (3-way diff) for all conflicted files
   * 2. Runs an AI agent to resolve each conflict
   * 3. Applies the resolved content and stages the files
   *
   * After this succeeds, call completeMerge to create the merge commit.
   *
   * @param repoPath - Path to the git repository
   * @param agentType - AI agent to use (defaults to 'claude')
   * @param model - Optional model override
   * @param timeoutSecs - Timeout per conflict in seconds (defaults to 120)
   */
  resolveConflictsWithAI: async (
    repoPath: string,
    agentType?: ConflictResolverAgent,
    model?: string,
    timeoutSecs?: number
  ): Promise<MergeResolutionResult> => {
    return invoke('git_resolve_conflicts_with_ai', {
      repoPath,
      agentType,
      model,
      timeoutSecs,
    })
  },
}

// ========================================
// GitHub API Functions
// ========================================

export const githubApi = {
  /**
   * Create a pull request
   */
  createPullRequest: async (
    token: string,
    owner: string,
    repo: string,
    title: string,
    body: string,
    head: string,
    base: string,
    draft: boolean = false
  ): Promise<PullRequest> => {
    return invoke('github_create_pull_request', {
      token,
      owner,
      repo,
      title,
      body,
      head,
      base,
      draft,
    })
  },

  /**
   * Get a pull request by number
   */
  getPullRequest: async (
    token: string,
    owner: string,
    repo: string,
    number: number
  ): Promise<PullRequest> => {
    return invoke('github_get_pull_request', {
      token,
      owner,
      repo,
      number,
    })
  },

  /**
   * List pull requests
   */
  listPullRequests: async (
    token: string,
    owner: string,
    repo: string,
    state?: string
  ): Promise<PullRequest[]> => {
    return invoke('github_list_pull_requests', {
      token,
      owner,
      repo,
      state,
    })
  },

  /**
   * Get an issue by number
   */
  getIssue: async (token: string, owner: string, repo: string, number: number): Promise<Issue> => {
    return invoke('github_get_issue', { token, owner, repo, number })
  },

  /**
   * List issues
   */
  listIssues: async (
    token: string,
    owner: string,
    repo: string,
    state?: string
  ): Promise<Issue[]> => {
    return invoke('github_list_issues', { token, owner, repo, state })
  },

  /**
   * Import GitHub issues into a Ralph PRD as stories
   *
   * @param token - GitHub personal access token
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param projectPath - Path to the project directory
   * @param prdName - Name for the PRD file
   * @param labels - Only import issues with these labels (optional)
   * @param includeBody - Include issue body as story description (default: true)
   * @param useLabelsAsTags - Use issue labels as story tags (default: true)
   */
  importIssuesToPrd: async (
    token: string,
    owner: string,
    repo: string,
    projectPath: string,
    prdName: string,
    labels?: string[],
    includeBody?: boolean,
    useLabelsAsTags?: boolean
  ): Promise<IssueImportResult> => {
    return invoke('github_import_issues_to_prd', {
      token,
      owner,
      repo,
      projectPath,
      prdName,
      labels,
      includeBody,
      useLabelsAsTags,
    })
  },
}

// ========================================
// Helper Functions
// ========================================

export const gitHelpers = {
  /**
   * Format commit message for display
   */
  formatCommitMessage: (commit: CommitInfo, maxLength: number = 50): string => {
    const firstLine = commit.message.split('\n')[0]
    if (firstLine.length <= maxLength) {
      return firstLine
    }
    return firstLine.substring(0, maxLength - 3) + '...'
  },

  /**
   * Format timestamp to readable date
   */
  formatTimestamp: (timestamp: number): string => {
    const date = new Date(timestamp * 1000)
    return date.toLocaleString()
  },

  /**
   * Get branch status badge color
   */
  getBranchStatusColor: (isHead: boolean): string => {
    return isHead ? 'bg-green-500' : 'bg-gray-500'
  },

  /**
   * Get file status color
   */
  getFileStatusColor: (status: string): string => {
    if (status.includes('new')) return 'text-green-600'
    if (status.includes('modified')) return 'text-yellow-600'
    if (status.includes('deleted')) return 'text-red-600'
    return 'text-gray-600'
  },

  /**
   * Get diff stats summary
   */
  getDiffSummary: (diff: DiffInfo): string => {
    const { files_changed, insertions, deletions } = diff
    const parts = []

    if (files_changed > 0) {
      parts.push(`${files_changed} file${files_changed !== 1 ? 's' : ''}`)
    }

    if (insertions > 0) {
      parts.push(`+${insertions}`)
    }

    if (deletions > 0) {
      parts.push(`-${deletions}`)
    }

    return parts.join(', ')
  },
}

// ========================================
// GitHub Helper Functions
// ========================================

export const githubHelpers = {
  /**
   * Get PR state badge color
   */
  getPRStateColor: (state: string): string => {
    switch (state.toLowerCase()) {
      case 'open':
        return 'bg-green-500'
      case 'closed':
        return 'bg-red-500'
      case 'merged':
        return 'bg-purple-500'
      default:
        return 'bg-gray-500'
    }
  },

  /**
   * Get issue state badge color
   */
  getIssueStateColor: (state: string): string => {
    return state.toLowerCase() === 'open' ? 'bg-green-500' : 'bg-gray-500'
  },

  /**
   * Format date for display
   */
  formatDate: (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString()
  },
}

// ========================================
// Conflict Resolution Helpers
// ========================================

export const conflictHelpers = {
  /**
   * Build an AI prompt for resolving a merge conflict.
   * The AI should return ONLY the resolved file content.
   */
  buildConflictResolutionPrompt: (conflict: ConflictInfo): string => {
    return `Resolve this merge conflict for file: ${conflict.path}

## Our version (target branch):
\`\`\`
${conflict.our_content}
\`\`\`

## Their version (source branch):
\`\`\`
${conflict.their_content}
\`\`\`

## Common ancestor:
\`\`\`
${conflict.ancestor_content}
\`\`\`

Instructions:
1. Analyze both versions and the ancestor to understand what changed
2. Merge the changes intelligently, keeping functionality from both sides where appropriate
3. Return ONLY the resolved file content, no explanation or markdown code blocks
4. Do NOT include conflict markers (<<<<<<, =======, >>>>>>>)
5. The result must be valid, syntactically correct code
6. Preserve proper indentation and formatting`
  },

  /**
   * Check if content still contains conflict markers
   */
  hasConflictMarkers: (content: string): boolean => {
    return content.includes('<<<<<<<') || content.includes('=======') || content.includes('>>>>>>>')
  },

  /**
   * Validate resolved content has no conflict markers and basic syntax check.
   * Returns an error message if invalid, or null if valid.
   */
  validateResolvedContent: (content: string, filePath: string): string | null => {
    // Check for conflict markers
    if (conflictHelpers.hasConflictMarkers(content)) {
      return 'Resolved content still contains conflict markers'
    }

    // Basic syntax validation based on file extension
    const ext = filePath.split('.').pop()?.toLowerCase()

    if (ext === 'json') {
      try {
        JSON.parse(content)
      } catch {
        return 'Invalid JSON syntax'
      }
    }

    // For other file types, we could add more validation
    // but for now we'll rely on the AI to produce valid content
    return null
  },

  /**
   * Extract the resolved content from AI response.
   * Handles cases where AI might wrap content in markdown code blocks.
   */
  parseAIResponse: (response: string): string => {
    let content = response.trim()

    // Remove markdown code block if present
    const codeBlockMatch = content.match(/^```[\w]*\n([\s\S]*)\n```$/m)
    if (codeBlockMatch) {
      content = codeBlockMatch[1]
    }

    // Also handle single backtick wrapping
    if (content.startsWith('`') && content.endsWith('`') && !content.includes('\n')) {
      content = content.slice(1, -1)
    }

    return content
  },

  /**
   * Create a ConflictResolution object from AI response
   */
  createResolution: (path: string, aiResponse: string): ConflictResolution => {
    return {
      path,
      resolved_content: conflictHelpers.parseAIResponse(aiResponse),
    }
  },

  /**
   * Build retry prompt when initial resolution was invalid
   */
  buildRetryPrompt: (conflict: ConflictInfo, previousAttempt: string, error: string): string => {
    return `Your previous conflict resolution attempt was invalid.

Error: ${error}

Previous attempt:
\`\`\`
${previousAttempt}
\`\`\`

Please try again. ${conflictHelpers.buildConflictResolutionPrompt(conflict)}`
  },
}
