// Terminal instance component - wraps xterm.js with PTY connection

import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { spawnTerminal, killTerminal, writeToTerminal, resizeTerminal, decodeTerminalData } from '@/lib/terminal-api'
import { useTerminalStore } from '@/stores/terminalStore'
import '@xterm/xterm/css/xterm.css'

interface TerminalInstanceProps {
  terminalId: string
  cwd?: string
  isActive: boolean
}

export function TerminalInstance({ terminalId, cwd, isActive }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  const isInitializedRef = useRef(false)
  const { updateTerminalTitle } = useTerminalStore()

  // Initialize terminal
  const initTerminal = useCallback(() => {
    if (!containerRef.current || isInitializedRef.current) return

    isInitializedRef.current = true

    // Create xterm instance
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1a1a1a',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        cursorAccent: '#1a1a1a',
        selectionBackground: '#404040',
        black: '#000000',
        red: '#ff5555',
        green: '#50fa7b',
        yellow: '#f1fa8c',
        blue: '#bd93f9',
        magenta: '#ff79c6',
        cyan: '#8be9fd',
        white: '#bfbfbf',
        brightBlack: '#4d4d4d',
        brightRed: '#ff6e6e',
        brightGreen: '#69ff94',
        brightYellow: '#ffffa5',
        brightBlue: '#d6acff',
        brightMagenta: '#ff92df',
        brightCyan: '#a4ffff',
        brightWhite: '#ffffff',
      },
      allowProposedApi: true,
    })

    terminalRef.current = terminal

    // Add FitAddon for auto-sizing
    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    terminal.loadAddon(fitAddon)

    // Add WebLinks addon for clickable URLs
    const webLinksAddon = new WebLinksAddon()
    terminal.loadAddon(webLinksAddon)

    // Open terminal in container
    terminal.open(containerRef.current)

    // Try to load WebGL addon for GPU acceleration
    try {
      const webglAddon = new WebglAddon()
      webglAddon.onContextLoss(() => {
        webglAddon.dispose()
        webglAddonRef.current = null
      })
      terminal.loadAddon(webglAddon)
      webglAddonRef.current = webglAddon
    } catch {
      console.warn('WebGL addon failed to load, falling back to canvas renderer')
    }

    // Fit terminal to container
    fitAddon.fit()

    // Spawn PTY process with initial dimensions
    try {
      const cols = terminal.cols || 80
      const rows = terminal.rows || 24
      const pty = spawnTerminal(terminalId, { cwd }, cols, rows)

      // Wire PTY output to xterm
      pty.onData((data: unknown) => {
        try {
          if (typeof data === 'string') {
            terminal.write(data)
          } else if (data instanceof Uint8Array) {
            terminal.write(decodeTerminalData(data))
          } else if (Array.isArray(data)) {
            // Data comes as number array from Tauri
            terminal.write(decodeTerminalData(new Uint8Array(data)))
          } else {
            console.warn('Unknown PTY data type:', typeof data, data)
          }
        } catch (err) {
          console.error('Error processing PTY data:', err)
        }
      })

      // Wire xterm input to PTY
      terminal.onData((data: string) => {
        writeToTerminal(terminalId, data)
      })

      // Handle terminal resize
      terminal.onResize(({ cols, rows }) => {
        resizeTerminal(terminalId, cols, rows)
      })

      // Listen for title changes
      terminal.onTitleChange((title) => {
        updateTerminalTitle(terminalId, title)
      })

      // Handle PTY exit
      pty.onExit(({ exitCode }: { exitCode: number }) => {
        terminal.write(`\r\n\x1b[90mProcess exited with code ${exitCode}\x1b[0m\r\n`)
      })
    } catch (error) {
      console.error('Failed to spawn PTY:', error)
      terminal.write(`\x1b[31mFailed to spawn terminal: ${error}\x1b[0m\r\n`)
    }
  }, [terminalId, cwd, updateTerminalTitle])

  // Initialize on mount
  useEffect(() => {
    initTerminal()

    return () => {
      // Cleanup on unmount
      if (terminalRef.current) {
        terminalRef.current.dispose()
        terminalRef.current = null
      }
      if (webglAddonRef.current) {
        webglAddonRef.current.dispose()
        webglAddonRef.current = null
      }
      killTerminal(terminalId)
      isInitializedRef.current = false
    }
  }, [initTerminal, terminalId])

  // Handle container resize
  useEffect(() => {
    if (!containerRef.current || !fitAddonRef.current) return

    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && terminalRef.current) {
        try {
          fitAddonRef.current.fit()
        } catch {
          // Ignore fit errors during transitions
        }
      }
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [])

  // Focus terminal when it becomes active
  useEffect(() => {
    if (isActive && terminalRef.current) {
      terminalRef.current.focus()
    }
  }, [isActive])

  // Refit on visibility change
  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      // Small delay to ensure container is visible
      const timer = setTimeout(() => {
        fitAddonRef.current?.fit()
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [isActive])

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#1a1a1a]"
      style={{ display: isActive ? 'block' : 'none' }}
    />
  )
}
