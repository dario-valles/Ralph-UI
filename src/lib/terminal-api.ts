// Terminal API wrapper for tauri-pty
// Provides an abstraction layer over the PTY plugin

import { spawn, type IPty } from 'tauri-pty'
import type { SpawnOptions } from '@/types/terminal'

// Store for active PTY instances
const ptyInstances = new Map<string, IPty>()

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
 * Spawn a new PTY process
 */
export function spawnTerminal(
  terminalId: string,
  options: SpawnOptions = {},
  cols: number = 80,
  rows: number = 24
): IPty {
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

  ptyInstances.set(terminalId, pty)
  return pty
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
export function getPty(terminalId: string): IPty | undefined {
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
