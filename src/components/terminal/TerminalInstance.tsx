// Terminal instance component - wraps xterm.js with PTY connection
// Uses WebSocket PTY for browser mode
// Supports session reconnection for mobile resilience (US-4)

import { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import {
  spawnTerminalAsync,
  disconnectTerminal,
  writeToTerminal,
  resizeTerminal,
  decodeTerminalData,
  isPtyAvailable,
  reconnectTerminal,
  hasStoredSession,
  type UnifiedPty,
} from '@/lib/terminal-api'
import { useTerminalStore } from '@/stores/terminalStore'
import { useGestureStore } from '@/stores/gestureStore'
import { useConnectionStore } from '@/stores/connectionStore'
import { Loader2, RefreshCw, WifiOff } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'

interface TerminalInstanceProps {
  terminalId: string
  cwd?: string
  isActive: boolean
}

type TerminalConnectionState = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

export function TerminalInstance({ terminalId, cwd, isActive }: TerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  const ptyRef = useRef<UnifiedPty | null>(null)
  const isInitializedRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const attemptReconnectRef = useRef<((terminal: Terminal) => void) | null>(null)
  const { updateTerminalTitle } = useTerminalStore()
  const { settings } = useGestureStore()
  const connectionStatus = useConnectionStore((state) => state.status)

  // Terminal connection state
  const [terminalState, setTerminalState] = useState<TerminalConnectionState>('connecting')
  const [reconnectCountdown, setReconnectCountdown] = useState(0)
  const [reconnectAttempt, setReconnectAttempt] = useState(0)

  // Check PTY availability synchronously (before any effects run)
  const [ptyAvailable] = useState(() => isPtyAvailable())

  // Max reconnection attempts and delays
  const MAX_RECONNECT_ATTEMPTS = 10
  const BASE_RECONNECT_DELAY = 1000
  const MAX_RECONNECT_DELAY = 30000

  // Wire up a PTY to the terminal
  const wirePty = useCallback(
    (pty: UnifiedPty, terminal: Terminal) => {
      ptyRef.current = pty
      setTerminalState('connected')
      reconnectAttemptsRef.current = 0

      // Wire PTY output to xterm
      pty.onData((data: unknown) => {
        try {
          if (typeof data === 'string') {
            terminal.write(data)
          } else if (data instanceof Uint8Array) {
            terminal.write(decodeTerminalData(data))
          } else if (Array.isArray(data)) {
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

      // Handle PTY exit - attempt reconnection
      pty.onExit(({ exitCode }: { exitCode: number }) => {
        // If exit was clean (user closed), don't reconnect
        if (exitCode === 0) {
          terminal.write(`\r\n\x1b[90mProcess exited with code ${exitCode}\x1b[0m\r\n`)
          setTerminalState('disconnected')
          return
        }

        // Check if we have a stored session and can reconnect
        if (hasStoredSession(terminalId) && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          attemptReconnectRef.current?.(terminal)
        } else {
          terminal.write(`\r\n\x1b[90mProcess exited with code ${exitCode}\x1b[0m\r\n`)
          setTerminalState('disconnected')
        }
      })
    },
    [terminalId, updateTerminalTitle]
  )

  // Attempt to reconnect to the PTY session
  const attemptReconnect = useCallback(
    async (terminal: Terminal) => {
      reconnectAttemptsRef.current += 1
      setReconnectAttempt(reconnectAttemptsRef.current)
      setTerminalState('reconnecting')

      // Calculate delay with exponential backoff
      const delay = Math.min(
        BASE_RECONNECT_DELAY * Math.pow(1.5, reconnectAttemptsRef.current - 1),
        MAX_RECONNECT_DELAY
      )

      // Show countdown
      const startTime = Date.now()
      const countdownInterval = setInterval(() => {
        const remaining = Math.max(0, delay - (Date.now() - startTime))
        setReconnectCountdown(Math.ceil(remaining / 1000))
        if (remaining <= 0) {
          clearInterval(countdownInterval)
        }
      }, 100)

      // Wait for delay
      await new Promise((resolve) => setTimeout(resolve, delay))
      clearInterval(countdownInterval)

      try {
        console.log(
          `Terminal ${terminalId}: Reconnection attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`
        )
        const pty = await reconnectTerminal(terminalId)

        if (pty) {
          terminal.write('\r\n\x1b[32m✓ Reconnected to session\x1b[0m\r\n')
          wirePty(pty, terminal)
        } else {
          // No session to reconnect to
          if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
            terminal.write('\r\n\x1b[31m✗ Failed to reconnect after maximum attempts\x1b[0m\r\n')
            setTerminalState('disconnected')
          } else {
            // Retry using the ref to avoid closure issues
            attemptReconnectRef.current?.(terminal)
          }
        }
      } catch (error) {
        console.error('Reconnection error:', error)
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          terminal.write('\r\n\x1b[31m✗ Reconnection failed\x1b[0m\r\n')
          setTerminalState('disconnected')
        } else {
          attemptReconnectRef.current?.(terminal)
        }
      }
    },
    [terminalId, wirePty]
  )

  // Keep the ref updated with the latest attemptReconnect function
  useEffect(() => {
    attemptReconnectRef.current = attemptReconnect
  }, [attemptReconnect])

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || isInitializedRef.current || !ptyAvailable) return

    isInitializedRef.current = true
    let mounted = true

    // Create xterm instance
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: settings.terminalFontSize,
      fontFamily:
        '"MesloLGS NF", "Hack Nerd Font", "FiraCode Nerd Font", "JetBrainsMono Nerd Font", Menlo, Monaco, "Courier New", monospace',
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

    // Spawn PTY process with initial dimensions (async)
    const cols = terminal.cols || 80
    const rows = terminal.rows || 24

    // First, try to reconnect to an existing session
    const initTerminal = async () => {
      // Check if there's a stored session we can reconnect to
      if (hasStoredSession(terminalId)) {
        setTerminalState('reconnecting')
        try {
          const pty = await reconnectTerminal(terminalId)
          if (pty && mounted) {
            terminal.write('\x1b[32m✓ Reconnected to existing session\x1b[0m\r\n')
            wirePty(pty, terminal)
            return
          }
        } catch (error) {
          console.log('Reconnection failed, spawning new terminal:', error)
        }
      }

      // No session to reconnect to, spawn new
      setTerminalState('connecting')
      try {
        const pty = await spawnTerminalAsync(terminalId, { cwd }, cols, rows)

        if (!mounted) {
          pty?.kill()
          return
        }

        if (!pty) {
          terminal.write('\x1b[31mFailed to spawn terminal: PTY not available\x1b[0m\r\n')
          setTerminalState('disconnected')
          return
        }

        wirePty(pty, terminal)
      } catch (error) {
        console.error('Failed to spawn PTY:', error)
        if (mounted) {
          terminal.write(`\x1b[31mFailed to spawn terminal: ${error}\x1b[0m\r\n`)
          setTerminalState('disconnected')
        }
      }
    }

    initTerminal()

    return () => {
      mounted = false
      // Cleanup on unmount
      if (terminalRef.current) {
        terminalRef.current.dispose()
        terminalRef.current = null
      }
      if (webglAddonRef.current) {
        webglAddonRef.current.dispose()
        webglAddonRef.current = null
      }
      // Use disconnectTerminal instead of killTerminal to preserve session storage
      // This allows reconnection when panel is reopened (mobile resilience)
      // Explicit close (X button) calls closeTerminal in store which removes from terminals list
      disconnectTerminal(terminalId)
      isInitializedRef.current = false
    }
  }, [terminalId, cwd, ptyAvailable, settings.terminalFontSize, wirePty])

  // Update font size when setting changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.fontSize = settings.terminalFontSize
      fitAddonRef.current?.fit()
    }
  }, [settings.terminalFontSize])

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

  // Trigger reconnection when server connection is restored
  useEffect(() => {
    if (
      connectionStatus === 'connected' &&
      terminalState === 'disconnected' &&
      hasStoredSession(terminalId) &&
      terminalRef.current
    ) {
      console.log(`Server reconnected, attempting terminal ${terminalId} reconnection`)
      attemptReconnect(terminalRef.current)
    }
  }, [connectionStatus, terminalState, terminalId, attemptReconnect])

  // Show error state if PTY unavailable
  if (!ptyAvailable) {
    return (
      <div
        className="w-full h-full bg-[#1a1a1a] flex items-center justify-center"
        style={{ display: isActive ? 'flex' : 'none' }}
      >
        <div className="text-center p-4 max-w-md">
          <div className="text-red-400 text-lg mb-2">Terminal Unavailable</div>
          <div className="text-zinc-400 text-sm">
            Terminal is not available. Connect to a Ralph UI server in browser mode or use the
            desktop app.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full" style={{ display: isActive ? 'block' : 'none' }}>
      <div
        ref={containerRef}
        className="w-full h-full bg-[#1a1a1a]"
        style={{ touchAction: 'pan-y pinch-zoom' }}
      />

      {/* Reconnection overlay */}
      {(terminalState === 'reconnecting' || terminalState === 'connecting') && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
          <div className="text-center p-4 max-w-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
            <div className="text-white text-sm font-medium mb-1">
              {terminalState === 'reconnecting' ? 'Reconnecting to terminal...' : 'Connecting...'}
            </div>
            {reconnectCountdown > 0 && (
              <div className="text-zinc-400 text-xs">Retrying in {reconnectCountdown}s</div>
            )}
            {reconnectAttempt > 0 && (
              <div className="text-zinc-500 text-xs mt-1">
                Attempt {reconnectAttempt}/{MAX_RECONNECT_ATTEMPTS}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Disconnected overlay with retry button */}
      {terminalState === 'disconnected' && hasStoredSession(terminalId) && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
          <div className="text-center p-4 max-w-sm">
            <WifiOff className="h-8 w-8 text-zinc-400 mx-auto mb-3" />
            <div className="text-white text-sm font-medium mb-2">Terminal disconnected</div>
            <button
              onClick={() => {
                if (terminalRef.current) {
                  reconnectAttemptsRef.current = 0
                  setReconnectAttempt(0)
                  attemptReconnect(terminalRef.current)
                }
              }}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded hover:bg-primary/90 transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Reconnect
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
