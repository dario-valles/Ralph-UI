// Terminal API wrapper for tauri-pty and WebSocket PTY
// Provides an abstraction layer over both desktop (Tauri) and browser (WebSocket) PTY

import type { IPty } from 'tauri-pty'
import type { SpawnOptions } from '@/types/terminal'
import { isTauri } from '@/lib/tauri-check'
import { createWebSocketPty, getServerConnection } from '@/lib/websocket-pty'

// Unified PTY interface that works for both Tauri and WebSocket
export interface UnifiedPty {
  write(data: string): void
  onData(callback: (data: Uint8Array | string) => void): () => void
  onExit(callback: (info: { exitCode: number }) => void): () => void
  resize(cols: number, rows: number): void
  kill(): void
}

// Dynamically import spawn only in Tauri environment
let spawn: typeof import('tauri-pty').spawn | null = null
if (isTauri) {
  import('tauri-pty').then((mod) => {
    spawn = mod.spawn
  })
}

// Store for active PTY instances (both types)
const ptyInstances = new Map<string, UnifiedPty>()

// Text decoder for converting Uint8Array to string
const textDecoder = new TextDecoder()

/**
 * Get the default shell based on the platform
 */
function getDefaultShell(): string {
  // macOS and Linux use $SHELL, Windows uses cmd.exe
  if (typeof navigator !== 'undefined' && navigator.platform) {
    if (navigator.platform.toLowerCase().includes('win')) {
      return 'cmd.exe'
    }
  }
  // Default to zsh on macOS (default since Catalina), bash on Linux
  if (typeof navigator !== 'undefined' && navigator.platform === 'MacIntel') {
    return '/bin/zsh'
  }
  return '/bin/bash'
}

/**
 * Wrap a tauri-pty IPty to match the UnifiedPty interface
 */
function wrapTauriPty(pty: IPty): UnifiedPty {
  return {
    write(data: string) {
      pty.write(data)
    },
    onData(callback) {
      return pty.onData(callback)
    },
    onExit(callback) {
      return pty.onExit(callback)
    },
    resize(cols: number, rows: number) {
      pty.resize(cols, rows)
    },
    kill() {
      pty.kill()
    },
  }
}

/**
 * Check if PTY is available in any mode (Tauri or WebSocket)
 */
export function isPtyAvailable(): boolean {
  if (isTauri && spawn !== null) {
    return true
  }
  // Check for WebSocket PTY availability
  const connection = getServerConnection()
  return connection !== null
}

/**
 * Check if we're in Tauri mode with PTY available
 */
export function isTauriPtyAvailable(): boolean {
  return isTauri && spawn !== null
}

/**
 * Check if we're in browser mode with WebSocket PTY available
 */
export function isWebSocketPtyAvailable(): boolean {
  if (isTauri) return false
  const connection = getServerConnection()
  return connection !== null
}

/**
 * Spawn a new PTY process (async to support WebSocket mode)
 * Returns null if PTY is not available
 */
export async function spawnTerminalAsync(
  terminalId: string,
  options: SpawnOptions = {},
  cols: number = 80,
  rows: number = 24
): Promise<UnifiedPty | null> {
  // Try Tauri PTY first
  if (isTauri && spawn) {
    const shell = options.shell || getDefaultShell()
    const args = options.args || []
    const cwd = options.cwd
    const env = options.env || {}

    const pty = spawn(shell, args, {
      cwd,
      cols,
      rows,
      env: Object.keys(env).length > 0 ? env : undefined,
    })

    const unified = wrapTauriPty(pty)
    ptyInstances.set(terminalId, unified)
    return unified
  }

  // Try WebSocket PTY
  const connection = getServerConnection()
  if (connection) {
    try {
      const wsPty = await createWebSocketPty({
        serverUrl: connection.url,
        token: connection.token,
        terminalId,
        cols,
        rows,
        cwd: options.cwd,
      })

      ptyInstances.set(terminalId, wsPty)
      return wsPty
    } catch (error) {
      console.error('Failed to create WebSocket PTY:', error)
      return null
    }
  }

  console.warn('No PTY backend available')
  return null
}

/**
 * Spawn a new PTY process (sync, for backwards compatibility - Tauri only)
 * @deprecated Use spawnTerminalAsync instead
 */
export function spawnTerminal(
  terminalId: string,
  options: SpawnOptions = {},
  cols: number = 80,
  rows: number = 24
): UnifiedPty | null {
  if (!isTauri || !spawn) {
    console.warn('Sync spawnTerminal only works in Tauri mode. Use spawnTerminalAsync for browser mode.')
    return null
  }

  const shell = options.shell || getDefaultShell()
  const args = options.args || []
  const cwd = options.cwd
  const env = options.env || {}

  const pty = spawn(shell, args, {
    cwd,
    cols,
    rows,
    env: Object.keys(env).length > 0 ? env : undefined,
  })

  const unified = wrapTauriPty(pty)
  ptyInstances.set(terminalId, unified)
  return unified
}

/**
 * Write data to a PTY
 */
export function writeToTerminal(terminalId: string, data: string): void {
  const pty = ptyInstances.get(terminalId)
  if (!pty) {
    throw new Error(`Terminal ${terminalId} not found`)
  }
  pty.write(data)
}

/**
 * Resize a PTY
 */
export function resizeTerminal(terminalId: string, cols: number, rows: number): void {
  const pty = ptyInstances.get(terminalId)
  if (!pty) {
    throw new Error(`Terminal ${terminalId} not found`)
  }
  pty.resize(cols, rows)
}

/**
 * Kill a PTY process
 */
export function killTerminal(terminalId: string): void {
  const pty = ptyInstances.get(terminalId)
  if (!pty) {
    return // Already killed or never existed
  }
  pty.kill()
  ptyInstances.delete(terminalId)
}

/**
 * Get a PTY instance for event wiring
 */
export function getPty(terminalId: string): UnifiedPty | undefined {
  return ptyInstances.get(terminalId)
}

/**
 * Check if a PTY exists
 */
export function hasPty(terminalId: string): boolean {
  return ptyInstances.has(terminalId)
}

/**
 * Decode Uint8Array to string
 */
export function decodeTerminalData(data: Uint8Array): string {
  return textDecoder.decode(data)
}
