import { invoke } from "@tauri-apps/api/core";

// ========================================
// Git Types
// ========================================

export interface BranchInfo {
  name: string;
  is_head: boolean;
  upstream: string | null;
  commit_id: string;
}

export interface CommitInfo {
  id: string;
  short_id: string;
  message: string;
  author: string;
  email: string;
  timestamp: number;
  parent_ids: string[];
}

export interface WorktreeInfo {
  name: string;
  path: string;
  branch: string | null;
  is_locked: boolean;
}

export interface FileStatus {
  path: string;
  status: string;
}

export interface DiffInfo {
  files_changed: number;
  insertions: number;
  deletions: number;
  files: FileDiff[];
}

export interface FileDiff {
  old_path: string | null;
  new_path: string | null;
  status: string;
  insertions: number;
  deletions: number;
}

export interface MergeResult {
  success: boolean;
  message: string;
  conflict_files: string[];
  commit_id: string | null;
  fast_forward: boolean;
}

// ========================================
// GitHub Types
// ========================================

export interface PullRequest {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  head_branch: string;
  base_branch: string;
  created_at: string;
  updated_at: string;
  merged: boolean;
}

export interface Issue {
  number: number;
  title: string;
  body: string | null;
  state: string;
  html_url: string;
  labels: string[];
  created_at: string;
  updated_at: string;
}

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
    return invoke("git_create_branch", { repoPath, name, force });
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
    return invoke("git_create_branch_from_commit", {
      repoPath,
      name,
      commitId,
      force,
    });
  },

  /**
   * Delete a branch
   */
  deleteBranch: async (repoPath: string, name: string): Promise<void> => {
    return invoke("git_delete_branch", { repoPath, name });
  },

  /**
   * List all branches
   */
  listBranches: async (repoPath: string): Promise<BranchInfo[]> => {
    return invoke("git_list_branches", { repoPath });
  },

  /**
   * Get the current branch
   */
  getCurrentBranch: async (repoPath: string): Promise<BranchInfo> => {
    return invoke("git_get_current_branch", { repoPath });
  },

  /**
   * Checkout a branch
   */
  checkoutBranch: async (repoPath: string, name: string): Promise<void> => {
    return invoke("git_checkout_branch", { repoPath, name });
  },

  /**
   * Create a worktree
   */
  createWorktree: async (
    repoPath: string,
    branch: string,
    path: string
  ): Promise<WorktreeInfo> => {
    return invoke("git_create_worktree", { repoPath, branch, path });
  },

  /**
   * List all worktrees
   */
  listWorktrees: async (repoPath: string): Promise<WorktreeInfo[]> => {
    return invoke("git_list_worktrees", { repoPath });
  },

  /**
   * Remove a worktree
   */
  removeWorktree: async (repoPath: string, name: string): Promise<void> => {
    return invoke("git_remove_worktree", { repoPath, name });
  },

  /**
   * Get git status
   */
  getStatus: async (repoPath: string): Promise<FileStatus[]> => {
    return invoke("git_get_status", { repoPath });
  },

  /**
   * Get commit history
   */
  getCommitHistory: async (
    repoPath: string,
    maxCount: number = 50
  ): Promise<CommitInfo[]> => {
    return invoke("git_get_commit_history", { repoPath, maxCount });
  },

  /**
   * Get a specific commit
   */
  getCommit: async (repoPath: string, commitId: string): Promise<CommitInfo> => {
    return invoke("git_get_commit", { repoPath, commitId });
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
    return invoke("git_create_commit", {
      repoPath,
      message,
      authorName,
      authorEmail,
    });
  },

  /**
   * Stage files for commit
   */
  stageFiles: async (repoPath: string, paths: string[]): Promise<void> => {
    return invoke("git_stage_files", { repoPath, paths });
  },

  /**
   * Stage all files
   */
  stageAll: async (repoPath: string): Promise<void> => {
    return invoke("git_stage_all", { repoPath });
  },

  /**
   * Get diff between commits
   */
  getDiff: async (
    repoPath: string,
    fromCommit?: string,
    toCommit?: string
  ): Promise<DiffInfo> => {
    return invoke("git_get_diff", { repoPath, fromCommit, toCommit });
  },

  /**
   * Get working directory diff
   */
  getWorkingDiff: async (repoPath: string): Promise<DiffInfo> => {
    return invoke("git_get_working_diff", { repoPath });
  },

  /**
   * Merge a source branch into a target branch
   */
  mergeBranch: async (
    repoPath: string,
    sourceBranch: string,
    targetBranch: string
  ): Promise<MergeResult> => {
    return invoke("git_merge_branch", { repoPath, sourceBranch, targetBranch });
  },

  /**
   * Abort an ongoing merge
   */
  mergeAbort: async (repoPath: string): Promise<void> => {
    return invoke("git_merge_abort", { repoPath });
  },

  /**
   * Check for merge conflicts between two branches without merging
   */
  checkMergeConflicts: async (
    repoPath: string,
    sourceBranch: string,
    targetBranch: string
  ): Promise<string[]> => {
    return invoke("git_check_merge_conflicts", {
      repoPath,
      sourceBranch,
      targetBranch,
    });
  },
};

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
    return invoke("github_create_pull_request", {
      token,
      owner,
      repo,
      title,
      body,
      head,
      base,
      draft,
    });
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
    return invoke("github_get_pull_request", {
      token,
      owner,
      repo,
      number,
    });
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
    return invoke("github_list_pull_requests", {
      token,
      owner,
      repo,
      state,
    });
  },

  /**
   * Get an issue by number
   */
  getIssue: async (
    token: string,
    owner: string,
    repo: string,
    number: number
  ): Promise<Issue> => {
    return invoke("github_get_issue", { token, owner, repo, number });
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
    return invoke("github_list_issues", { token, owner, repo, state });
  },
};

// ========================================
// Helper Functions
// ========================================

export const gitHelpers = {
  /**
   * Format commit message for display
   */
  formatCommitMessage: (commit: CommitInfo, maxLength: number = 50): string => {
    const firstLine = commit.message.split("\n")[0];
    if (firstLine.length <= maxLength) {
      return firstLine;
    }
    return firstLine.substring(0, maxLength - 3) + "...";
  },

  /**
   * Format timestamp to readable date
   */
  formatTimestamp: (timestamp: number): string => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleString();
  },

  /**
   * Get branch status badge color
   */
  getBranchStatusColor: (isHead: boolean): string => {
    return isHead ? "bg-green-500" : "bg-gray-500";
  },

  /**
   * Get file status color
   */
  getFileStatusColor: (status: string): string => {
    if (status.includes("new")) return "text-green-600";
    if (status.includes("modified")) return "text-yellow-600";
    if (status.includes("deleted")) return "text-red-600";
    return "text-gray-600";
  },

  /**
   * Get diff stats summary
   */
  getDiffSummary: (diff: DiffInfo): string => {
    const { files_changed, insertions, deletions } = diff;
    const parts = [];

    if (files_changed > 0) {
      parts.push(`${files_changed} file${files_changed !== 1 ? "s" : ""}`);
    }

    if (insertions > 0) {
      parts.push(`+${insertions}`);
    }

    if (deletions > 0) {
      parts.push(`-${deletions}`);
    }

    return parts.join(", ");
  },
};

export const githubHelpers = {
  /**
   * Get PR state badge color
   */
  getPRStateColor: (state: string): string => {
    switch (state.toLowerCase()) {
      case "open":
        return "bg-green-500";
      case "closed":
        return "bg-red-500";
      case "merged":
        return "bg-purple-500";
      default:
        return "bg-gray-500";
    }
  },

  /**
   * Get issue state badge color
   */
  getIssueStateColor: (state: string): string => {
    return state.toLowerCase() === "open" ? "bg-green-500" : "bg-gray-500";
  },

  /**
   * Format date for display
   */
  formatDate: (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString();
  },
};
