// WebSocket PTY client for browser mode
// Provides the same interface as tauri-pty but over WebSocket
// Supports session persistence and reconnection for mobile resilience (US-3, US-4)

export interface WebSocketPty {
  write(data: string): void
  onData(callback: (data: Uint8Array | string) => void): () => void
  onExit(callback: (info: { exitCode: number }) => void): () => void
  resize(cols: number, rows: number): void
  kill(): void
  /** Session ID for reconnection (set after server confirms session) */
  getSessionId(): string | null
  /** Terminal ID used for this PTY */
  getTerminalId(): string
}

interface WebSocketPtyOptions {
  serverUrl: string
  token: string
  terminalId: string
  cols: number
  rows: number
  cwd?: string
}

interface ReconnectOptions {
  serverUrl: string
  token: string
  terminalId: string
  sessionId: string
}

type MessageType = 'setup' | 'resize' | 'input'

interface ClientMessage {
  type: MessageType
  cols?: number
  rows?: number
  data?: string
  cwd?: string
}

/** Server message types */
interface SessionMessage {
  type: 'session'
  data: {
    sessionId: string
    terminalId: string
  }
}

interface ReplayMessage {
  type: 'replay'
  data: string
}

interface ErrorMessage {
  error: string
}

type ServerMessage = SessionMessage | ReplayMessage | ErrorMessage

/**
 * Create a WebSocket-based PTY connection for browser mode
 */
export function createWebSocketPty(options: WebSocketPtyOptions): Promise<WebSocketPty> {
  return new Promise((resolve, reject) => {
    const { serverUrl, token, terminalId, cols, rows, cwd } = options

    // Build WebSocket URL
    const wsProtocol = serverUrl.startsWith('https') ? 'wss' : 'ws'
    const baseUrl = serverUrl.replace(/^https?/, wsProtocol)
    const wsUrl = `${baseUrl}/ws/pty/${terminalId}?token=${encodeURIComponent(token)}`

    const ws = new WebSocket(wsUrl)
    const dataCallbacks: Array<(data: Uint8Array | string) => void> = []
    const exitCallbacks: Array<(info: { exitCode: number }) => void> = []
    let isConnected = false
    let sessionId: string | null = null

    ws.onopen = () => {
      isConnected = true

      // Send setup message
      const setupMessage: ClientMessage = {
        type: 'setup',
        cols,
        rows,
        cwd,
      }
      ws.send(JSON.stringify(setupMessage))

      // Resolve with the PTY interface
      resolve({
        write(data: string) {
          if (!isConnected) return

          const message: ClientMessage = {
            type: 'input',
            data,
          }
          ws.send(JSON.stringify(message))
        },

        onData(callback) {
          dataCallbacks.push(callback)
          return () => {
            const index = dataCallbacks.indexOf(callback)
            if (index !== -1) {
              dataCallbacks.splice(index, 1)
            }
          }
        },

        onExit(callback) {
          exitCallbacks.push(callback)
          return () => {
            const index = exitCallbacks.indexOf(callback)
            if (index !== -1) {
              exitCallbacks.splice(index, 1)
            }
          }
        },

        resize(newCols: number, newRows: number) {
          if (!isConnected) return

          const message: ClientMessage = {
            type: 'resize',
            cols: newCols,
            rows: newRows,
          }
          ws.send(JSON.stringify(message))
        },

        kill() {
          isConnected = false
          ws.close()
        },

        getSessionId() {
          return sessionId
        },

        getTerminalId() {
          return terminalId
        },
      })
    }

    ws.onmessage = (event) => {
      // Check if it's a structured message
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data) as ServerMessage

          // Handle session info message
          if ('type' in parsed && parsed.type === 'session') {
            sessionId = parsed.data.sessionId
            console.log(`PTY session established: ${sessionId}`)
            // Store session mapping for reconnection
            storePtySession(terminalId, sessionId)
            return
          }

          // Handle replay message (buffered output on reconnection)
          if ('type' in parsed && parsed.type === 'replay') {
            console.log(`Replaying ${parsed.data.length} chars of buffered output`)
            dataCallbacks.forEach((cb) => cb(parsed.data))
            return
          }

          // Handle error message
          if ('error' in parsed) {
            console.error('PTY error:', parsed.error)
            dataCallbacks.forEach((cb) => cb(`\x1b[31mError: ${parsed.error}\x1b[0m\r\n`))
            return
          }
        } catch {
          // Not JSON, treat as terminal output
        }

        // Forward to callbacks as terminal output
        dataCallbacks.forEach((cb) => cb(event.data))
      } else if (event.data instanceof Blob) {
        // Handle binary data
        event.data.arrayBuffer().then((buffer) => {
          dataCallbacks.forEach((cb) => cb(new Uint8Array(buffer)))
        })
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket PTY error:', error)
      if (!isConnected) {
        reject(new Error('Failed to connect to PTY server'))
      }
    }

    ws.onclose = (event) => {
      isConnected = false
      // Treat close as exit with code based on clean close
      const exitCode = event.wasClean ? 0 : 1
      exitCallbacks.forEach((cb) => cb({ exitCode }))
    }

    // Timeout for connection
    setTimeout(() => {
      if (!isConnected) {
        ws.close()
        reject(new Error('PTY connection timeout'))
      }
    }, 10000)
  })
}

/**
 * Reconnect to an existing PTY session
 * Used for mobile resilience when reconnecting after disconnect
 */
export function reconnectWebSocketPty(options: ReconnectOptions): Promise<WebSocketPty> {
  return new Promise((resolve, reject) => {
    const { serverUrl, token, terminalId, sessionId } = options

    // Build reconnect WebSocket URL
    const wsProtocol = serverUrl.startsWith('https') ? 'wss' : 'ws'
    const baseUrl = serverUrl.replace(/^https?/, wsProtocol)
    const wsUrl = `${baseUrl}/ws/pty/${terminalId}/reconnect/${sessionId}?token=${encodeURIComponent(token)}`

    const ws = new WebSocket(wsUrl)
    const dataCallbacks: Array<(data: Uint8Array | string) => void> = []
    const exitCallbacks: Array<(info: { exitCode: number }) => void> = []
    let isConnected = false
    let currentSessionId: string | null = sessionId

    ws.onopen = () => {
      isConnected = true
      console.log(`PTY reconnection established for session: ${sessionId}`)

      // Resolve with the PTY interface
      resolve({
        write(data: string) {
          if (!isConnected) return

          const message: ClientMessage = {
            type: 'input',
            data,
          }
          ws.send(JSON.stringify(message))
        },

        onData(callback) {
          dataCallbacks.push(callback)
          return () => {
            const index = dataCallbacks.indexOf(callback)
            if (index !== -1) {
              dataCallbacks.splice(index, 1)
            }
          }
        },

        onExit(callback) {
          exitCallbacks.push(callback)
          return () => {
            const index = exitCallbacks.indexOf(callback)
            if (index !== -1) {
              exitCallbacks.splice(index, 1)
            }
          }
        },

        resize(newCols: number, newRows: number) {
          if (!isConnected) return

          const message: ClientMessage = {
            type: 'resize',
            cols: newCols,
            rows: newRows,
          }
          ws.send(JSON.stringify(message))
        },

        kill() {
          isConnected = false
          ws.close()
        },

        getSessionId() {
          return currentSessionId
        },

        getTerminalId() {
          return terminalId
        },
      })
    }

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data) as ServerMessage

          // Handle session confirmation
          if ('type' in parsed && parsed.type === 'session') {
            currentSessionId = parsed.data.sessionId
            console.log(`PTY session confirmed: ${currentSessionId}`)
            return
          }

          // Handle replay message (buffered output)
          if ('type' in parsed && parsed.type === 'replay') {
            console.log(`Replaying ${parsed.data.length} chars of buffered output`)
            dataCallbacks.forEach((cb) => cb(parsed.data))
            return
          }

          // Handle error message
          if ('error' in parsed) {
            console.error('PTY reconnect error:', parsed.error)
            dataCallbacks.forEach((cb) => cb(`\x1b[31mError: ${parsed.error}\x1b[0m\r\n`))
            return
          }
        } catch {
          // Not JSON, treat as terminal output
        }

        dataCallbacks.forEach((cb) => cb(event.data))
      } else if (event.data instanceof Blob) {
        event.data.arrayBuffer().then((buffer) => {
          dataCallbacks.forEach((cb) => cb(new Uint8Array(buffer)))
        })
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket PTY reconnect error:', error)
      if (!isConnected) {
        reject(new Error('Failed to reconnect to PTY session'))
      }
    }

    ws.onclose = (event) => {
      isConnected = false
      const exitCode = event.wasClean ? 0 : 1
      exitCallbacks.forEach((cb) => cb({ exitCode }))
    }

    // Timeout for reconnection
    setTimeout(() => {
      if (!isConnected) {
        ws.close()
        reject(new Error('PTY reconnection timeout'))
      }
    }, 10000)
  })
}

// Session storage for reconnection
const PTY_SESSION_STORAGE_KEY = 'ralph_pty_sessions'

interface PtySessionMap {
  [terminalId: string]: {
    sessionId: string
    timestamp: number
  }
}

/**
 * Store PTY session mapping for reconnection
 */
function storePtySession(terminalId: string, sessionId: string): void {
  try {
    const stored = localStorage.getItem(PTY_SESSION_STORAGE_KEY)
    const sessions: PtySessionMap = stored ? JSON.parse(stored) : {}

    sessions[terminalId] = {
      sessionId,
      timestamp: Date.now(),
    }

    localStorage.setItem(PTY_SESSION_STORAGE_KEY, JSON.stringify(sessions))
  } catch (e) {
    console.warn('Failed to store PTY session:', e)
  }
}

/**
 * Get stored PTY session for a terminal
 * Returns null if session doesn't exist or is too old (>10 minutes)
 */
export function getStoredPtySession(terminalId: string): string | null {
  try {
    const stored = localStorage.getItem(PTY_SESSION_STORAGE_KEY)
    if (!stored) return null

    const sessions: PtySessionMap = JSON.parse(stored)
    const session = sessions[terminalId]

    if (!session) return null

    // Session timeout: 10 minutes (matches server-side timeout)
    const SESSION_TIMEOUT_MS = 10 * 60 * 1000
    if (Date.now() - session.timestamp > SESSION_TIMEOUT_MS) {
      // Clean up expired session
      delete sessions[terminalId]
      localStorage.setItem(PTY_SESSION_STORAGE_KEY, JSON.stringify(sessions))
      return null
    }

    return session.sessionId
  } catch {
    return null
  }
}

/**
 * Clear stored PTY session for a terminal
 */
export function clearStoredPtySession(terminalId: string): void {
  try {
    const stored = localStorage.getItem(PTY_SESSION_STORAGE_KEY)
    if (!stored) return

    const sessions: PtySessionMap = JSON.parse(stored)
    delete sessions[terminalId]
    localStorage.setItem(PTY_SESSION_STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get server connection details for PTY
 */
export function getServerConnection(): { url: string; token: string } | null {
  const stored = localStorage.getItem('ralph_server_config')
  if (!stored) return null

  try {
    const connection = JSON.parse(stored)
    if (connection.url && connection.token) {
      return { url: connection.url, token: connection.token }
    }
    return null
  } catch {
    return null
  }
}
