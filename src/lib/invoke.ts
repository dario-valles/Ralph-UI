/**
 * Shared Tauri invoke wrapper with HTTP fallback for browser mode
 *
 * Provides a safe wrapper around Tauri's invoke function that:
 * - Uses native Tauri IPC when running in desktop mode
 * - Falls back to HTTP API when running in browser mode (server mode)
 * - Provides consistent error handling across both modes
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { isTauri } from './tauri-check'

/**
 * Server configuration for browser mode
 * Stored in localStorage so users can configure their connection
 */
const SERVER_CONFIG_KEY = 'ralph_server_config'

interface ServerConfig {
  url: string
  token: string
}

/**
 * Get the server configuration from localStorage
 */
export function getServerConfig(): ServerConfig | null {
  if (typeof localStorage === 'undefined') return null
  const stored = localStorage.getItem(SERVER_CONFIG_KEY)
  if (!stored) return null
  try {
    return JSON.parse(stored) as ServerConfig
  } catch {
    return null
  }
}

/**
 * Set the server configuration in localStorage
 */
export function setServerConfig(config: ServerConfig): void {
  localStorage.setItem(SERVER_CONFIG_KEY, JSON.stringify(config))
}

/**
 * Clear the server configuration from localStorage
 */
export function clearServerConfig(): void {
  localStorage.removeItem(SERVER_CONFIG_KEY)
}

/**
 * Check if we're in browser mode (not Tauri, but have server config)
 */
export function isBrowserMode(): boolean {
  return !isTauri && getServerConfig() !== null
}

/**
 * Safe invoke wrapper that handles both Tauri and browser modes.
 * Use this instead of directly importing from @tauri-apps/api/core.
 *
 * In Tauri desktop mode: Uses native IPC
 * In browser mode: Uses HTTP POST to /api/invoke
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  // If Tauri is available, use native IPC
  if (isTauri && typeof tauriInvoke === 'function') {
    return tauriInvoke<T>(cmd, args)
  }

  // Browser mode - use HTTP fallback
  const config = getServerConfig()
  if (!config) {
    throw new Error(
      `Not connected to Ralph UI server. Please configure the server URL and auth token.`
    )
  }

  const response = await fetch(`${config.url}/api/invoke`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.token}`,
    },
    body: JSON.stringify({ cmd, args: args || {} }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    if (response.status === 401) {
      throw new Error('Unauthorized: Invalid or expired auth token')
    }
    throw new Error(`Server error (${response.status}): ${errorText}`)
  }

  // Handle empty responses (void commands)
  const text = await response.text()
  if (!text || text === 'null') {
    return undefined as T
  }

  try {
    const parsed = JSON.parse(text)

    // Server wraps responses in {success: true, data: ...} format
    // Extract the data field for successful responses
    if (parsed && typeof parsed === 'object' && 'success' in parsed) {
      if (!parsed.success) {
        throw new Error(parsed.error || 'Command failed')
      }
      // Return the data field (or undefined for void commands)
      return parsed.data as T
    }

    // Fallback: return parsed response directly
    return parsed as T
  } catch (e) {
    // Re-throw if it's our error
    if (e instanceof Error && e.message !== 'Unexpected end of JSON input') {
      throw e
    }
    // If it's not valid JSON, return as-is (for string responses)
    return text as T
  }
}
