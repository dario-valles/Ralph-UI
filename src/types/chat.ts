// Chat types for PRD chat and messaging

// ============================================================================
// Chat Message Types
// ============================================================================

export type ChatMessageRole = 'user' | 'assistant' | 'system'

// ============================================================================
// Chat Attachment Types
// ============================================================================

/** Supported MIME types for chat attachments */
export type AttachmentMimeType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

/** An image attachment in a chat message */
export interface ChatAttachment {
  /** Unique identifier for the attachment */
  id: string
  /** MIME type of the attachment */
  mimeType: AttachmentMimeType
  /** Base64-encoded data (without data URL prefix) */
  data: string
  /** Original filename (optional) */
  filename?: string
  /** Size in bytes */
  size: number
  /** Image width in pixels (optional) */
  width?: number
  /** Image height in pixels (optional) */
  height?: number
}

/** Validation constants for attachments */
export const ATTACHMENT_LIMITS = {
  /** Maximum file size per attachment (10 MB) */
  MAX_SIZE: 10 * 1024 * 1024,
  /** Maximum number of attachments per message */
  MAX_COUNT: 5,
  /** Supported MIME types */
  SUPPORTED_TYPES: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const,
} as const

export interface ChatMessage {
  id: string
  sessionId: string
  role: ChatMessageRole
  content: string
  createdAt: string
  metadata?: Record<string, unknown>
  /** Optional image attachments for this message */
  attachments?: ChatAttachment[]
}

// ============================================================================
// PRD Type Values
// ============================================================================

export type PRDTypeValue =
  | 'new_feature'
  | 'bug_fix'
  | 'refactoring'
  | 'api_integration'
  | 'general'
  | 'full_new_app'

// ============================================================================
// Chat Session Types
// ============================================================================

export interface ChatSession {
  id: string
  agentType: string
  /** Provider ID for Claude (e.g., "zai", "minimax") - only used with Claude agent */
  providerId?: string
  projectPath?: string
  prdId?: string
  title?: string
  /** Type of PRD being created */
  prdType?: PRDTypeValue
  /** Whether guided interview mode is enabled */
  guidedMode: boolean
  /** Latest quality score (0-100) */
  qualityScore?: number
  /** Template ID if using a template */
  templateId?: string
  /** Whether structured output mode is enabled */
  structuredMode: boolean
  /** Extracted PRD structure (JSON string) */
  extractedStructure?: string
  /** Whether GSD (Get Stuff Done) workflow mode is enabled */
  gsdMode: boolean
  /** GSD workflow state (JSON-serialized GsdWorkflowState) */
  gsdState?: string
  createdAt: string
  updatedAt: string
  messageCount?: number
  /**
   * ISO timestamp when a pending operation (agent execution) started.
   * Used to restore "thinking" state after page reload.
   */
  pendingOperationStartedAt?: string
  /**
   * External session ID for CLI agent session resumption.
   * When set, allows resuming the agent's native session instead of resending
   * full conversation history, resulting in 67-90% token savings.
   */
  externalSessionId?: string
}

export interface SendMessageResponse {
  userMessage: ChatMessage
  assistantMessage: ChatMessage
}

// ============================================================================
// Pasted Text Block Types
// ============================================================================

/** Represents a block of pasted multiline text */
export interface PastedTextBlock {
  /** Unique identifier for the paste block */
  id: string
  /** Full pasted content */
  content: string
  /** Number of lines in the content */
  lineCount: number
  /** Sequential paste number for display (#1, #2, #3...) */
  pasteNumber: number
  /** First line of content (truncated for preview) */
  firstLine: string
  /** Timestamp when the paste occurred */
  createdAt: number
}
