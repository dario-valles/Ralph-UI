// Chat command configuration types
// Matches server/src/models/chat_commands.rs

/**
 * Scope of a chat command configuration
 */
export type ChatCommandScope = 'builtin' | 'project' | 'global'

/**
 * Configuration for a single chat command
 */
export interface ChatCommandConfig {
  /** Unique command identifier (e.g., "ideas", "research", "my-custom") */
  id: string

  /** Display label for the command (e.g., "Ideas", "Research") */
  label: string

  /** Brief description of what the command does */
  description: string

  /** Template text to insert when command is selected */
  template: string

  /** Whether the command is enabled (shown in menu) */
  enabled: boolean

  /** Whether the command is marked as favorite */
  favorite: boolean

  /** Scope of the command (where it came from) */
  scope: ChatCommandScope
}

/**
 * Response type for list_chat_commands
 */
export interface ChatCommandsResponse {
  /** All available commands (merged from builtin + project + global) */
  commands: ChatCommandConfig[]
}

/**
 * Request type for update_chat_command
 */
export interface UpdateChatCommandRequest {
  /** Command ID to update */
  id: string

  /** New enabled state */
  enabled?: boolean

  /** New favorite state */
  favorite?: boolean

  /** New template (for custom commands or overriding builtins) */
  template?: string

  /** New label */
  label?: string

  /** New description */
  description?: string

  /** Scope to save to (project or global) */
  saveScope?: ChatCommandScope
}

/**
 * Request type for create_chat_command
 */
export interface CreateChatCommandRequest {
  /** Unique command ID (must not conflict with builtins) */
  id: string

  /** Display label */
  label: string

  /** Brief description */
  description: string

  /** Template text */
  template: string

  /** Scope to save to (project or global) */
  scope?: ChatCommandScope
}

/**
 * Request type for delete_chat_command
 */
export interface DeleteChatCommandRequest {
  /** Command ID to delete */
  id: string

  /** Scope to delete from (project or global) */
  scope: ChatCommandScope
}

/**
 * Request type for reset_chat_command
 */
export interface ResetChatCommandRequest {
  /** Command ID to reset */
  id: string

  /** Scope to reset from (project or global, or undefined for both) */
  scope?: ChatCommandScope
}
