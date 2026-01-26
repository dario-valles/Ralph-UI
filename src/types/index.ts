// Core domain types - re-exported from domain-specific files
// This file maintains backward compatibility with existing imports

// ============================================================================
// Common Types
// ============================================================================

export type {
  Project,
  RateLimitType,
  RateLimitEvent,
  StaleLockInfo,
  RecoveryResult,
  SubagentEventType,
  SubagentEvent,
  SubagentTree,
  SubagentTreeSummary,
  ToolCallStatus,
  ToolCall,
  ToolCallStartedPayload,
  ToolCallCompletedPayload,
} from './common'

// ============================================================================
// Agent Types
// ============================================================================

export type { AgentType, AgentStatus, LogEntry, Agent } from './agent'

// ============================================================================
// Session Types
// ============================================================================

export type {
  TaskStatus,
  ErrorCategory,
  CategorizedError,
  Task,
  SessionStatus,
  SessionConfig,
  Session,
  SessionIndexEntry,
  SessionTemplate,
  SessionRecoveryState,
  SessionComparison,
  SessionAnalytics,
} from './session'

// ============================================================================
// PRD Types
// ============================================================================

export type {
  PRDSection,
  PRDDocument,
  PRDFile,
  DeletePrdResult,
  ExportResult,
  PRDTemplate,
  PRDExecutionStatus,
  PRDExecution,
  PRDQualityScores,
  CreatePRDRequest,
  UpdatePRDRequest,
  QualityAssessment,
  QuestionType,
  GuidedQuestion,
  ExtractedPRDContent,
  SchedulingStrategy,
  ExecutionConfig,
  DryRunResult,
} from './prd'

// ============================================================================
// Chat Types
// ============================================================================

export type {
  ChatMessageRole,
  AttachmentMimeType,
  ChatAttachment,
  ChatMessage,
  PRDTypeValue,
  ChatSession,
  SendMessageResponse,
} from './chat'

export { ATTACHMENT_LIMITS } from './chat'

// ============================================================================
// Configuration Types
// ============================================================================

export type {
  RalphExecutionConfig,
  RalphGitConfig,
  RalphValidationConfig,
  RalphTemplateConfig,
  RalphErrorStrategy,
  RalphFallbackSettings,
  RalphConfig,
  ConfigPaths,
  TemplateInfo,
  RenderRequest,
  TemplatePreviewResult,
  SampleContext,
  IterationOutcome,
  FallbackChainConfig,
  IterationRecord,
  ExecutionStateSnapshot,
  IterationStats,
  ErrorStrategy,
  FallbackConfig,
} from './config'

// ============================================================================
// Ralph Loop Types
// ============================================================================

export type {
  RalphStory,
  RalphPrdMetadata,
  RalphPrd,
  RalphPrdStatus,
  RalphLoopState,
  RalphIterationMetrics,
  RalphLoopMetrics,
  RalphLoopSnapshot,
  RalphLoopStatusEvent,
  RalphLoopCompletedPayload,
  RalphLoopErrorType,
  RalphLoopErrorPayload,
  RalphProgressEntryType,
  RalphProgressEntry,
  RalphProgressSummary,
  RalphFiles,
  RalphProjectConfig,
  RalphLoopConfig,
  RalphYamlConfig,
  InitRalphPrdRequest,
  RalphStoryInput,
  StartRalphLoopRequest,
  ConvertPrdToRalphRequest,
  RalphWorktreeInfo,
  AssignmentStatus,
  Assignment,
  AssignmentsFile,
  FileInUse,
  FileConflict,
  AssignmentChangeType,
  AssignmentChangedPayload,
  FileConflictDetectedPayload,
  FileConflictInfo,
  AgentFileUse,
  LearningType,
  LearningEntry,
  LearningsFile,
  AddLearningInput,
  UpdateLearningInput,
} from './ralph-loop'

// ============================================================================
// Terminal Types (re-exported from terminal.ts)
// ============================================================================

export type {
  TerminalInstance,
  TerminalPane,
  TerminalPanelMode,
  TerminalState,
  SplitDirection,
  SpawnOptions,
} from './terminal'

// ============================================================================
// GSD (Get Stuff Done) Types - Re-export from dedicated files
// ============================================================================

export type {
  GsdPhase,
  GsdPhaseInfo,
  QuestioningContext,
  AgentResearchStatus,
  ResearchStatus,
  GsdDecision,
  GsdWorkflowState,
  ResearchResult,
  ResearchSynthesis,
  GsdConfig,
  PlanningSessionInfo,
  ResearchSessionInfo,
  CloneSessionOptions,
} from './gsd'

export {
  GSD_PHASES,
  getPhaseInfo,
  getNextPhase,
  getPreviousPhase,
  isQuestioningComplete,
  getMissingContextItems,
  isResearchComplete,
  getResearchCompletionPercentage,
  getWorkflowCompletionPercentage,
} from './gsd'

export type {
  RequirementCategory,
  ScopeLevel,
  Requirement,
  RequirementsDoc,
  ScopeSelection,
  RoadmapPhase,
  RoadmapDoc,
  IssueSeverity,
  VerificationIssue,
  VerificationWarning,
  VerificationStats,
  VerificationResult,
  ConversionOptions,
  SkippedRequirement,
  ConversionResult,
  PrdExecutionConfig,
} from './planning'

export {
  REQUIREMENT_CATEGORIES,
  SCOPE_LEVELS,
  getRequirementsByScope,
  getRequirementsByCategory,
  countRequirementsByScope,
  getUnscopedRequirements,
  parseReqId,
  getCategoryFromReqId,
  hasAnyExecutionConfigFields,
  validateExecutionConfig,
} from './planning'
