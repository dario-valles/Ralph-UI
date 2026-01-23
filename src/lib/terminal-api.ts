// Terminal API wrapper for WebSocket PTY
// Provides an abstraction layer for browser-based terminal emulation

import type { SpawnOptions } from '@/types/terminal'
import { createWebSocketPty, getServerConnection } from '@/lib/websocket-pty'

// Unified PTY interface
export interface UnifiedPty {
  write(data: string): void
  onData(callback: (data: Uint8Array | string) => void): () => void
  onExit(callback: (info: { exitCode: number }) => void): () => void
  resize(cols: number, rows: number): void
  kill(): void
}

// Store for active PTY instances
const ptyInstances = new Map<string, UnifiedPty>()

// Text decoder for converting Uint8Array to string
const textDecoder = new TextDecoder()

/**
 * Check if PTY is available (requires server connection)
 */
export function isPtyAvailable(): boolean {
  const connection = getServerConnection()
  return connection !== null
}

/**
 * Spawn a new PTY process via WebSocket
 * Returns null if PTY is not available
 */
export async function spawnTerminalAsync(
  terminalId: string,
  options: SpawnOptions = {},
  cols: number = 80,
  rows: number = 24
): Promise<UnifiedPty | null> {
  const connection = getServerConnection()
  if (!connection) {
    console.warn('No server connection available for PTY')
    return null
  }

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
