// Terminal instance component - wraps xterm.js with PTY connection
// Uses WebSocket PTY for browser mode

import { useCallback, useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import {
  spawnTerminalAsync,
  killTerminal,
  writeToTerminal,
  resizeTerminal,
  decodeTerminalData,
  isPtyAvailable,
  type UnifiedPty,
} from '@/lib/terminal-api'
import { useTerminalStore } from '@/stores/terminalStore'
import { useGestureStore } from '@/stores/gestureStore'
import { useGestureDetection } from '@/hooks/useGestureDetection'
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
  const ptyRef = useRef<UnifiedPty | null>(null)
  const isInitializedRef = useRef(false)
  const { updateTerminalTitle } = useTerminalStore()
  const { settings, setTerminalFontSize } = useGestureStore()
  const [gestureIndicator, setGestureIndicator] = useState<'up' | 'down' | 'left' | 'right' | null>(null)

  // Check PTY availability synchronously (before any effects run)
  const [ptyAvailable] = useState(() => isPtyAvailable())

  // Pinch handlers
  const handlePinchIn = useCallback(
    (scale: number) => {
      if (!terminalRef.current || !isActive) return
      const newFontSize = Math.round(settings.terminalFontSize * scale)
      if (newFontSize !== settings.terminalFontSize) {
        setTerminalFontSize(newFontSize)
        terminalRef.current.options.fontSize = newFontSize
        fitAddonRef.current?.fit()
      }
    },
    [settings.terminalFontSize, setTerminalFontSize, isActive]
  )

  const handlePinchOut = useCallback(
    (scale: number) => {
      if (!terminalRef.current || !isActive) return
      const newFontSize = Math.round(settings.terminalFontSize * scale)
      if (newFontSize !== settings.terminalFontSize) {
        setTerminalFontSize(newFontSize)
        terminalRef.current.options.fontSize = newFontSize
        fitAddonRef.current?.fit()
      }
    },
    [settings.terminalFontSize, setTerminalFontSize, isActive]
  )

  // Setup gesture detection
  const gestureState = useGestureDetection(containerRef, {
    onSwipeUp: () => {
      if (settings.enableHistoryNavigation && isActive) {
        writeToTerminal(terminalId, '\x1b[A') // Up arrow - previous command
        setGestureIndicator('up')
        setTimeout(() => setGestureIndicator(null), 200)
      }
    },
    onSwipeDown: () => {
      if (settings.enableHistoryNavigation && isActive) {
        writeToTerminal(terminalId, '\x1b[B') // Down arrow - next command
        setGestureIndicator('down')
        setTimeout(() => setGestureIndicator(null), 200)
      }
    },
    onSwipeLeft: () => {
      if (settings.enableCursorMovement && isActive && gestureState) {
        // Calculate velocity to determine word vs character movement
        // Fast swipe (high velocity) moves by word using Ctrl+Left
        // Slow swipe (low velocity) moves by character using Left arrow
        const isFastSwipe = gestureState.distance > settings.cursorSwipeThreshold * 2
        if (isFastSwipe) {
          writeToTerminal(terminalId, '\x1b[1;5D') // Ctrl+Left - move cursor left by word
        } else {
          writeToTerminal(terminalId, '\x1b[D') // Left arrow - move cursor left by character
        }
        setGestureIndicator('left')
        setTimeout(() => setGestureIndicator(null), 200)
      }
    },
    onSwipeRight: () => {
      if (settings.enableCursorMovement && isActive && gestureState) {
        // Calculate velocity to determine word vs character movement
        // Fast swipe (high velocity) moves by word using Ctrl+Right
        // Slow swipe (low velocity) moves by character using Right arrow
        const isFastSwipe = gestureState.distance > settings.cursorSwipeThreshold * 2
        if (isFastSwipe) {
          writeToTerminal(terminalId, '\x1b[1;5C') // Ctrl+Right - move cursor right by word
        } else {
          writeToTerminal(terminalId, '\x1b[C') // Right arrow - move cursor right by character
        }
        setGestureIndicator('right')
        setTimeout(() => setGestureIndicator(null), 200)
      }
    },
    onTwoFingerSwipeUp: () => {
      if (settings.enablePageScroll && isActive) {
        writeToTerminal(terminalId, '\x1b[5~') // Page Up escape sequence
        setGestureIndicator('up')
        setTimeout(() => setGestureIndicator(null), 200)
      }
    },
    onTwoFingerSwipeDown: () => {
      if (settings.enablePageScroll && isActive) {
        writeToTerminal(terminalId, '\x1b[6~') // Page Down escape sequence
        setGestureIndicator('down')
        setTimeout(() => setGestureIndicator(null), 200)
      }
    },
    onPinchIn: handlePinchIn,
    onPinchOut: handlePinchOut,
    threshold: Math.min(settings.historySwipeThreshold, settings.cursorSwipeThreshold, settings.pageSwipeThreshold),
    pinchThreshold: settings.pinchThreshold,
    enabled: (settings.enableHistoryNavigation || settings.enableCursorMovement || settings.enablePageScroll || settings.enablePinchZoom) && isActive,
  })

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

    spawnTerminalAsync(terminalId, { cwd }, cols, rows)
      .then((pty) => {
        if (!mounted) {
          pty?.kill()
          return
        }

        if (!pty) {
          terminal.write('\x1b[31mFailed to spawn terminal: PTY not available\x1b[0m\r\n')
          return
        }

        ptyRef.current = pty

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
      })
      .catch((error) => {
        console.error('Failed to spawn PTY:', error)
        if (mounted) {
          terminal.write(`\x1b[31mFailed to spawn terminal: ${error}\x1b[0m\r\n`)
        }
      })

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
      killTerminal(terminalId)
      isInitializedRef.current = false
    }
  }, [terminalId, cwd, updateTerminalTitle, ptyAvailable, settings.terminalFontSize])

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
    <div
      ref={containerRef}
      className="w-full h-full bg-[#1a1a1a] relative"
      style={{ display: isActive ? 'block' : 'none' }}
    >
      {/* Gesture indicator - shows visual feedback for swipe gestures */}
      {gestureIndicator && (
        <div
          className="absolute inset-0 pointer-events-none flex items-center justify-center"
          style={{
            opacity: 0.3,
            backgroundColor:
              gestureIndicator === 'up'
                ? 'rgba(59, 130, 246, 0.2)'
                : gestureIndicator === 'down'
                  ? 'rgba(34, 197, 94, 0.2)'
                  : gestureIndicator === 'left'
                    ? 'rgba(168, 85, 247, 0.2)'
                    : 'rgba(249, 115, 22, 0.2)',
            animation: 'fadeOut 0.3s ease-out',
          }}
        >
          <div className="text-white text-2xl font-bold">
            {gestureIndicator === 'up'
              ? '↑ Previous'
              : gestureIndicator === 'down'
                ? '↓ Next'
                : gestureIndicator === 'left'
                  ? '← Cursor Left'
                  : '→ Cursor Right'}
          </div>
        </div>
      )}
      <style>{`
        @keyframes fadeOut {
          from {
            opacity: 0.3;
          }
          to {
            opacity: 0;
          }
        }
      `}</style>
    </div>
  )
}
