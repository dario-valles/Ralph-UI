// API Provider API wrappers for backend commands
//
// Manages alternative API providers (z.ai, MiniMax) that provide
// Claude-compatible APIs.

import type { ApiProviderInfo, ProviderTestResult } from '@/types'
import { invoke } from '../invoke'

// ============================================================================
// Provider API
// ============================================================================

export const providerApi = {
  /**
   * Get all available API providers with their status
   */
  getAll: async (): Promise<ApiProviderInfo[]> => {
    return await invoke('get_api_providers')
  },

  /**
   * Get the currently active provider ID
   */
  getActive: async (): Promise<string> => {
    return await invoke('get_active_provider')
  },

  /**
   * Set the active API provider
   */
  setActive: async (providerId: string): Promise<void> => {
    return await invoke('set_active_provider', { providerId })
  },

  /**
   * Set a provider's API token
   * Token is stored securely in ~/.ralph-ui/secrets.toml
   */
  setToken: async (providerId: string, token: string): Promise<void> => {
    return await invoke('set_provider_token', { providerId, token })
  },

  /**
   * Delete a provider's API token
   */
  deleteToken: async (providerId: string): Promise<void> => {
    return await invoke('delete_provider_token', { providerId })
  },

  /**
   * Test a provider's connection
   * Verifies the token is configured and valid
   */
  testConnection: async (providerId: string): Promise<ProviderTestResult> => {
    return await invoke('test_provider_connection', { providerId })
  },
}
