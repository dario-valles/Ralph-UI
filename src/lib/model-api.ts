// Model discovery API wrappers

import { invoke } from '@tauri-apps/api/core'
import type { AgentType } from '@/types'

/**
 * Information about an available model
 */
export interface ModelInfo {
  /** Unique model identifier (e.g., "anthropic/claude-sonnet-4-5") */
  id: string
  /** Human-readable display name (e.g., "Claude Sonnet 4.5") */
  name: string
  /** Provider name (e.g., "anthropic", "openai") */
  provider: string
  /** Whether this is the default model for the agent */
  isDefault: boolean
}

/**
 * Get available models for an agent type
 *
 * Returns models from cache if available, otherwise discovers them from CLI.
 * Falls back to default models if CLI discovery fails.
 *
 * @param agentType - The type of agent to get models for
 * @returns Array of available models
 */
export async function getAvailableModels(agentType: AgentType): Promise<ModelInfo[]> {
  return invoke<ModelInfo[]>('get_available_models', { agentType })
}

/**
 * Refresh model cache for a specific agent type or all if undefined
 *
 * Invalidates the cache, forcing a fresh discovery on next request.
 *
 * @param agentType - Optional agent type to refresh, refreshes all if undefined
 */
export async function refreshModels(agentType?: AgentType): Promise<void> {
  return invoke('refresh_models', { agentType: agentType ?? null })
}

/**
 * Get the default model ID for an agent type from a model list
 *
 * @param models - Array of models to search
 * @returns The ID of the default model, or the first model's ID if none is marked default
 */
export function getDefaultModelId(models: ModelInfo[]): string {
  const defaultModel = models.find((m) => m.isDefault)
  return defaultModel?.id ?? models[0]?.id ?? ''
}

/**
 * Get a model's display name by ID from a model list
 *
 * @param models - Array of models to search
 * @param modelId - The model ID to find
 * @returns The model's name, or the ID if not found
 */
export function getModelName(models: ModelInfo[], modelId: string): string {
  const model = models.find((m) => m.id === modelId)
  return model?.name ?? modelId
}
