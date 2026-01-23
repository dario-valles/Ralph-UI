// WebSocket PTY client for browser mode
// Provides the same interface as tauri-pty but over WebSocket

export interface WebSocketPty {
  write(data: string): void
  onData(callback: (data: Uint8Array | string) => void): () => void
  onExit(callback: (info: { exitCode: number }) => void): () => void
  resize(cols: number, rows: number): void
  kill(): void
}

interface WebSocketPtyOptions {
  serverUrl: string
  token: string
  terminalId: string
  cols: number
  rows: number
  cwd?: string
}

type MessageType = 'setup' | 'resize' | 'input'

interface ClientMessage {
  type: MessageType
  cols?: number
  rows?: number
  data?: string
  cwd?: string
}

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
      })
    }

    ws.onmessage = (event) => {
      // Check if it's an error message
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data)
          if (parsed.error) {
            console.error('PTY error:', parsed.error)
            // Still forward to terminal for display
            dataCallbacks.forEach((cb) => cb(`\x1b[31mError: ${parsed.error}\x1b[0m\r\n`))
            return
          }
        } catch {
          // Not JSON, treat as terminal output
        }

        // Forward to callbacks
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
 * Check if WebSocket PTY is available (browser mode with server connection)
 */
export function isWebSocketPtyAvailable(): boolean {
  // Check if we have a server connection stored
  const stored = localStorage.getItem('ralph_server_config')
  if (!stored) return false

  try {
    const connection = JSON.parse(stored)
    return !!(connection.url && connection.token)
  } catch {
    return false
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
