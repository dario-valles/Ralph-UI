// Git API wrappers
// Re-exports from src/lib/api/git-api.ts for backwards compatibility

export {
  gitApi,
  githubApi,
  gitHelpers,
  githubHelpers,
  conflictHelpers,
} from './api/git-api'

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
} from './api/git-api'
