// Agent Terminal instance component - connects to an agent's PTY process
// Unlike TerminalInstance, this connects to an existing PTY rather than spawning a new one

import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { listen } from '@tauri-apps/api/event'
import {
  getAgentPtyId,
  getAgentPtyHistory,
  processAgentPtyData,
  notifyAgentPtyExit,
} from '@/lib/agent-api'
import { writeToTerminal, resizeTerminal, decodeTerminalData, getPty } from '@/lib/terminal-api'
import { useTerminalStore } from '@/stores/terminalStore'
import '@xterm/xterm/css/xterm.css'

interface AgentTerminalInstanceProps {
  terminalId: string
  agentId: string
  isActive: boolean
}

export function AgentTerminalInstance({ terminalId, agentId, isActive }: AgentTerminalInstanceProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const webglAddonRef = useRef<WebglAddon | null>(null)
  const isInitializedRef = useRef(false)
  const ptyIdRef = useRef<string | null>(null)
  const currentAgentIdRef = useRef<string | null>(null)
  const unlistenRef = useRef<(() => void) | null>(null)
  const unlistenExitRef = useRef<(() => void) | null>(null)
  const { updateTerminalTitle, updateAgentTerminalStatus } = useTerminalStore()

  // Initialize terminal and connect to agent PTY
  const initTerminal = useCallback(async () => {
    if (!containerRef.current || isInitializedRef.current) return

    isInitializedRef.current = true

    // Create xterm instance with same styling as TerminalInstance
    const terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: '"MesloLGS NF", "Hack Nerd Font", "FiraCode Nerd Font", "JetBrainsMono Nerd Font", Menlo, Monaco, "Courier New", monospace',
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

    // Track the current agent
    currentAgentIdRef.current = agentId

    try {
      // Get the PTY ID for this agent
      const ptyId = await getAgentPtyId(agentId)
      if (!ptyId) {
        terminal.write('\x1b[33mNo active terminal for this agent.\x1b[0m\r\n')
        terminal.write('\x1b[90mThe agent may not have been spawned in PTY mode.\x1b[0m\r\n')
        return
      }

      ptyIdRef.current = ptyId

      // Get and replay history
      const history = await getAgentPtyHistory(agentId)
      if (history.length > 0) {
        terminal.write(decodeTerminalData(history))
      }

      // Get the PTY instance to wire up events
      const pty = getPty(ptyId)
      if (pty) {
        // Wire PTY output to xterm
        pty.onData((data: unknown) => {
          try {
            let dataBytes: Uint8Array
            if (typeof data === 'string') {
              dataBytes = new TextEncoder().encode(data)
              terminal.write(data)
            } else if (data instanceof Uint8Array) {
              dataBytes = data
              terminal.write(decodeTerminalData(data))
            } else if (Array.isArray(data)) {
              dataBytes = new Uint8Array(data)
              terminal.write(decodeTerminalData(dataBytes))
            } else {
              console.warn('Unknown PTY data type:', typeof data, data)
              return
            }
            // Forward to backend for log parsing and history storage
            processAgentPtyData(agentId, dataBytes).catch(console.error)
          } catch (err) {
            console.error('Error processing PTY data:', err)
          }
        })

        // Wire xterm input to PTY
        terminal.onData((data: string) => {
          writeToTerminal(ptyId, data)
        })

        // Handle terminal resize
        terminal.onResize(({ cols, rows }) => {
          resizeTerminal(ptyId, cols, rows)
        })

        // Handle PTY exit
        pty.onExit(({ exitCode }: { exitCode: number }) => {
          terminal.write(`\r\n\x1b[90mAgent process exited with code ${exitCode}\x1b[0m\r\n`)
          updateAgentTerminalStatus(agentId, 'exited')
          notifyAgentPtyExit(agentId, exitCode).catch(console.error)
        })
      } else {
        // PTY not found locally - listen for events from backend
        terminal.write('\x1b[90mConnecting to agent terminal...\x1b[0m\r\n')

        // Listen for PTY data events
        const unlisten = await listen<{ agentId: string; data: number[] }>('agent-pty-data', (event) => {
          if (event.payload.agentId === agentId) {
            const data = new Uint8Array(event.payload.data)
            terminal.write(decodeTerminalData(data))
          }
        })
        unlistenRef.current = unlisten

        // Listen for PTY exit events
        await listen<{ agentId: string; exitCode: number }>('agent-pty-exit', (event) => {
          if (event.payload.agentId === agentId) {
            terminal.write(`\r\n\x1b[90mAgent process exited with code ${event.payload.exitCode}\x1b[0m\r\n`)
            updateAgentTerminalStatus(agentId, 'exited')
          }
        })
      }

      // Listen for title changes
      terminal.onTitleChange((title) => {
        updateTerminalTitle(terminalId, title)
      })
    } catch (error) {
      console.error('Failed to connect to agent PTY:', error)
      terminal.write(`\x1b[31mFailed to connect to agent terminal: ${error}\x1b[0m\r\n`)
    }
  }, [agentId, terminalId, updateTerminalTitle, updateAgentTerminalStatus])

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
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
      if (unlistenExitRef.current) {
        unlistenExitRef.current()
        unlistenExitRef.current = null
      }
      isInitializedRef.current = false
      currentAgentIdRef.current = null
      // Note: We don't kill the PTY here - the agent owns it
    }
  }, [initTerminal])

  // Handle agent transitions without remounting (for Ralph Loop iteration changes)
  useEffect(() => {
    // Skip if terminal isn't initialized yet or if this is the initial render
    if (!terminalRef.current || !isInitializedRef.current) return
    // Skip if agent hasn't actually changed
    if (currentAgentIdRef.current === agentId) return

    const transitionToNewAgent = async () => {
      const terminal = terminalRef.current
      if (!terminal) return

      // Cleanup previous event listeners
      if (unlistenRef.current) {
        unlistenRef.current()
        unlistenRef.current = null
      }
      if (unlistenExitRef.current) {
        unlistenExitRef.current()
        unlistenExitRef.current = null
      }

      // Update tracked agent ID
      currentAgentIdRef.current = agentId

      // Show transition message
      terminal.write('\r\n\x1b[90m─────────────────────────────────────────\x1b[0m\r\n')
      terminal.write(`\x1b[36mSwitching to new iteration...\x1b[0m\r\n`)
      terminal.write('\x1b[90m─────────────────────────────────────────\x1b[0m\r\n\r\n')

      try {
        // Get the PTY ID for the new agent
        const ptyId = await getAgentPtyId(agentId)
        if (!ptyId) {
          terminal.write('\x1b[33mWaiting for agent terminal...\x1b[0m\r\n')
          return
        }

        ptyIdRef.current = ptyId

        // Get and replay history for the new agent
        const history = await getAgentPtyHistory(agentId)
        if (history.length > 0) {
          terminal.write(decodeTerminalData(history))
        }

        // Get the PTY instance to wire up events
        const pty = getPty(ptyId)
        if (pty) {
          // Wire PTY output to xterm
          pty.onData((data: unknown) => {
            try {
              let dataBytes: Uint8Array
              if (typeof data === 'string') {
                dataBytes = new TextEncoder().encode(data)
                terminal.write(data)
              } else if (data instanceof Uint8Array) {
                dataBytes = data
                terminal.write(decodeTerminalData(data))
              } else if (Array.isArray(data)) {
                dataBytes = new Uint8Array(data)
                terminal.write(decodeTerminalData(dataBytes))
              } else {
                console.warn('Unknown PTY data type:', typeof data, data)
                return
              }
              // Forward to backend for log parsing and history storage
              processAgentPtyData(agentId, dataBytes).catch(console.error)
            } catch (err) {
              console.error('Error processing PTY data:', err)
            }
          })

          // Wire xterm input to PTY
          terminal.onData((data: string) => {
            writeToTerminal(ptyId, data)
          })

          // Handle terminal resize
          terminal.onResize(({ cols, rows }) => {
            resizeTerminal(ptyId, cols, rows)
          })

          // Handle PTY exit
          pty.onExit(({ exitCode }: { exitCode: number }) => {
            terminal.write(`\r\n\x1b[90mAgent process exited with code ${exitCode}\x1b[0m\r\n`)
            updateAgentTerminalStatus(agentId, 'exited')
            notifyAgentPtyExit(agentId, exitCode).catch(console.error)
          })
        } else {
          // PTY not found locally - listen for events from backend
          const unlisten = await listen<{ agentId: string; data: number[] }>('agent-pty-data', (event) => {
            if (event.payload.agentId === agentId) {
              const data = new Uint8Array(event.payload.data)
              terminal.write(decodeTerminalData(data))
            }
          })
          unlistenRef.current = unlisten

          const unlistenExit = await listen<{ agentId: string; exitCode: number }>('agent-pty-exit', (event) => {
            if (event.payload.agentId === agentId) {
              terminal.write(`\r\n\x1b[90mAgent process exited with code ${event.payload.exitCode}\x1b[0m\r\n`)
              updateAgentTerminalStatus(agentId, 'exited')
            }
          })
          unlistenExitRef.current = unlistenExit
        }
      } catch (error) {
        console.error('Failed to connect to agent PTY:', error)
        terminal.write(`\x1b[31mFailed to connect to agent terminal: ${error}\x1b[0m\r\n`)
      }
    }

    transitionToNewAgent()
  }, [agentId, updateAgentTerminalStatus])

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
