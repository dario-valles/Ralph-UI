/**
 * Shared Tauri invoke wrapper
 *
 * Provides a safe wrapper around Tauri's invoke function that:
 * - Checks if Tauri runtime is available
 * - Provides consistent error messages for non-Tauri environments
 * - Re-exports the invoke function for use across API modules
 */

import { invoke as tauriInvoke } from '@tauri-apps/api/core'
import { isTauri } from './tauri-check'

/**
 * Safe invoke wrapper that handles the case when Tauri isn't available.
 * Use this instead of directly importing from @tauri-apps/api/core.
 */
export async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri || typeof tauriInvoke !== 'function') {
    throw new Error(`Tauri is not available. Command '${cmd}' cannot be executed outside of Tauri.`)
  }
  return tauriInvoke<T>(cmd, args)
}
