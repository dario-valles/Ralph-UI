/**
 * HTTP invoke wrapper for backend API calls
 *
 * Provides a consistent interface for calling backend commands via HTTP.
 * All commands are routed through the /api/invoke endpoint on the Axum server.
 */

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
 * Check if we're connected to a server
 */
export function isBrowserMode(): boolean {
  return getServerConfig() !== null
}

/**
 * Invoke a backend command via HTTP
 * All commands are routed through POST /api/invoke
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
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
