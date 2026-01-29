/**
 * Chat command API wrapper
 *
 * Provides typed functions for managing chat commands via the backend API.
 */

import { invoke } from '@/lib/invoke'
import type {
  ChatCommandConfig,
  ChatCommandsResponse,
  ChatCommandScope,
} from '@/types'

/**
 * List all available chat commands (merged from builtin + project + global)
 *
 * @param projectPath - Optional project path for project-specific commands
 * @returns List of all commands with their current enabled/favorite state
 */
export async function listChatCommands(
  projectPath?: string
): Promise<ChatCommandConfig[]> {
  const response = await invoke<ChatCommandsResponse>('list_chat_commands', {
    projectPath,
  })
  return response?.commands ?? []
}

/**
 * Update a chat command's properties
 *
 * For builtin commands, this creates/updates a preference override.
 * For custom commands, this updates the command directly.
 *
 * @param options - Update options
 */
export async function updateChatCommand(options: {
  projectPath?: string
  id: string
  enabled?: boolean
  favorite?: boolean
  template?: string
  label?: string
  description?: string
  saveScope?: ChatCommandScope
}): Promise<void> {
  await invoke('update_chat_command', options)
}

/**
 * Create a new custom chat command
 *
 * The command ID must not conflict with any builtin command.
 *
 * @param options - Command creation options
 */
export async function createChatCommand(options: {
  projectPath?: string
  id: string
  label: string
  description: string
  template: string
  scope?: ChatCommandScope
}): Promise<void> {
  await invoke('create_chat_command', options)
}

/**
 * Delete a custom chat command
 *
 * Cannot delete builtin commands.
 *
 * @param options - Delete options
 */
export async function deleteChatCommand(options: {
  projectPath?: string
  id: string
  scope: ChatCommandScope
}): Promise<void> {
  await invoke('delete_chat_command', options)
}

/**
 * Reset a builtin command to its default state
 *
 * Removes any preference overrides for the specified builtin command.
 *
 * @param options - Reset options
 */
export async function resetChatCommand(options: {
  projectPath?: string
  id: string
  scope?: ChatCommandScope
}): Promise<void> {
  await invoke('reset_chat_command', options)
}

/**
 * Check if a command has been modified from its builtin default
 *
 * @param projectPath - Optional project path
 * @param commandId - Command ID to check
 * @returns True if the command has been modified
 */
export async function isChatCommandModified(
  projectPath: string | undefined,
  commandId: string
): Promise<boolean> {
  return await invoke<boolean>('is_chat_command_modified', {
    projectPath,
    commandId,
  })
}
