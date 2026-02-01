// Core domain types - re-exported from domain-specific files

// ============================================================================
// Common Types
// ============================================================================

export type {
  Project,
  ProjectFolder,
  ProjectSetupStatus,
  DirectoryEntry,
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
  TaskStatusChangedPayload,
  SessionStatusChangedPayload,
  AgentStatusChangedPayload,
  AgentCompletedPayload,
  AgentFailedPayload,
} from './common'

// ============================================================================
// Agent Types
// ============================================================================

export type { AgentType, AgentStatus, LogEntry, Agent, AgentStatusInfo } from './agent'
export {
  formatAgentName,
  parseAgentWithProvider,
  formatAgentWithProvider,
  buildAgentProviderValue,
} from './agent'

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
  QualityCheck,
  QualityCheckSeverity,
  DetailedQualityAssessment,
  DiscoveryProgress,
  DiscoverySummary,
  QuestionType,
  GuidedQuestion,
  ExtractedPRDContent,
  SchedulingStrategy,
  ExecutionConfig,
  DryRunResult,
  EffortSize,
  Complexity,
  PRDItemType,
  StructuredPRDItem,
  ExtractedPRDStructure,
  // Enhanced quality check types (13-check system)
  EnhancedQualityCheck,
  VagueLanguageWarning,
  QualityGrade,
  EnhancedQualityReport,
  // Unified quality report (consolidates Basic + Enhanced)
  UnifiedQualityReport,
  // Structured discovery question types
  DiscoveryCategory,
  DiscoveryQuestion,
} from './prd'

export { DISCOVERY_QUESTIONS, getQuestionsByCategory, getRequiredQuestions } from './prd'

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
  PastedTextBlock,
  MdFileDetectedPayload,
  AssignPrdResult,
} from './chat'

export { ATTACHMENT_LIMITS } from './chat'

// ============================================================================
// Chat Command Types
// ============================================================================

export type {
  ChatCommandScope,
  ChatCommandConfig,
  ChatCommandsResponse,
  UpdateChatCommandRequest,
  CreateChatCommandRequest,
  DeleteChatCommandRequest,
  ResetChatCommandRequest,
} from './chat-commands'

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
  ProviderModelInfo,
  ApiProviderInfo,
  ProviderTestResult,
} from './config'

// ============================================================================
// Ralph Loop Types
// ============================================================================

export type {
  RalphExecutionMode,
  RalphStory,
  RalphPrdMetadata,
  RalphPrd,
  RalphPrdStatus,
  RalphLoopState,
  RalphIterationMetrics,
  RalphLoopMetrics,
  ParallelAgentStatus,
  RalphLoopParallelSnapshot,
  MergeConflict,
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
  AnalyzePrdStoriesRequest,
  AnalyzePrdStoriesResponse,
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
// Planning Types (used by PRD Workflow)
// ============================================================================

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

// ============================================================================
// PRD Workflow Types (New centralized workflow system)
// ============================================================================

export type {
  WorkflowPhase,
  WorkflowPhaseInfo,
  PhaseStatus,
  WorkflowMode,
  ExecutionMode,
  ProjectContext,
  StateDescription,
  SpecState,
  ScopeLevel as PrdWorkflowScopeLevel,
  RequirementCategory as PrdWorkflowCategory,
  RequirementStatus,
  Requirement as PrdWorkflowRequirement,
  ResearchAgentConfig,
  ResearchConfig,
  ResearchAgentStatus,
  ResearchStatus as PrdWorkflowResearchStatus,
  DependencyStats,
  PrdWorkflowState,
  WorkflowInfo,
  PhaseAction,
  AddRequirementResult,
  ScopeSelection as PrdWorkflowScopeSelection,
  DependencyValidationResult,
  ExportResult as PrdWorkflowExportResult,
  IdeasAnalysisResult,
  AcceptanceCriteriaResult,
  SpecStateAnalysisResult,
} from './prd-workflow'

export {
  WORKFLOW_PHASES,
  getPhaseInfo as getPrdWorkflowPhaseInfo,
  getNextPhase as getPrdWorkflowNextPhase,
  getPreviousPhase as getPrdWorkflowPreviousPhase,
  isContextComplete,
  getMissingContextItems as getPrdWorkflowMissingContextItems,
  calculateWorkflowCompletion,
  getRequirementsByScope as getPrdWorkflowRequirementsByScope,
  getReadyRequirements,
  getCategoryInfo,
  getScopeInfo,
  getStatusInfo,
} from './prd-workflow'

// ============================================================================
// Context Types (Project Context Files)
// ============================================================================

export type {
  ContextMode,
  ContextConfig,
  ContextFile,
  ProjectContextState,
  DependencyInfo,
  TechStackInfo,
  ProjectAnalysis,
  ContextChatSession,
  ContextChatMessage,
  StartContextChatRequest,
  SendContextChatMessageRequest,
  SendContextChatMessageResponse,
  SaveContextFromChatRequest,
  ContextFileName,
} from './context'

export {
  CONTEXT_FILE_NAMES,
  MAX_CONTEXT_FILE_SIZE,
  TOKENS_PER_CHAR,
  DEFAULT_CONTEXT_TEMPLATE,
  estimateTokens,
  isContextConfigured,
  getTotalTokenCount,
  capitalizeContextFileName,
  createDefaultContextConfig,
  createDefaultProjectContext,
} from './context'
