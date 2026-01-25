/**
 * Server Connection Dialog
 *
 * Shown in browser mode when not connected to a Ralph UI server.
 * Allows users to enter the server URL and auth token.
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, Server, Key, Loader2, CheckCircle2 } from 'lucide-react'
import { getServerConfig, setServerConfig } from '@/lib/invoke'
import { connectEvents } from '@/lib/events-client'
import { isTauri } from '@/lib/env-check'

interface ServerConnectionDialogProps {
  onConnected: () => void
}

export function ServerConnectionDialog({ onConnected }: ServerConnectionDialogProps) {
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pre-fill from existing config or derive from browser URL
  useEffect(() => {
    const config = getServerConfig()
    if (config) {
      setUrl(config.url)
      setToken(config.token)
    } else {
      // Default to current browser origin (works for tunnels, remote access, etc.)
      // For localhost dev with separate Vite server, fall back to default port
      const origin = window.location.origin
      const isLocalDev =
        origin.includes('localhost:1420') || origin.includes('127.0.0.1:1420')
      setUrl(isLocalDev ? 'http://localhost:3420' : origin)
    }
  }, [])

  const handleConnect = async () => {
    if (!url.trim() || !token.trim()) {
      setError('Please enter both server URL and auth token')
      return
    }

    setIsConnecting(true)
    setError(null)

    try {
      const normalizedUrl = url.replace(/\/$/, '')

      // First check if server is reachable via health endpoint (no auth required)
      const healthUrl = normalizedUrl + '/health'
      const healthResponse = await fetch(healthUrl)
      if (!healthResponse.ok) {
        throw new Error(`Server not reachable: ${healthResponse.status}`)
      }

      // Validate token by calling an authenticated endpoint
      // Use invoke with a simple command that requires auth
      const invokeUrl = normalizedUrl + '/api/invoke'
      const authResponse = await fetch(invokeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ cmd: 'get_projects', args: {} }),
      })

      if (!authResponse.ok) {
        if (authResponse.status === 401) {
          throw new Error('Invalid auth token')
        }
        throw new Error(`Server returned ${authResponse.status}`)
      }

      // Token is valid - now save the config
      setServerConfig({ url: normalizedUrl, token })

      // Connect WebSocket events
      await connectEvents()

      onConnected()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to server')
    } finally {
      setIsConnecting(false)
    }
  }

  // Don't render in Tauri mode
  if (isTauri) {
    return null
  }

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Server className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Connect to Ralph UI Server</CardTitle>
          <CardDescription>
            Enter the server URL and auth token displayed when you started the server.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="server-url">Server URL</Label>
            <div className="relative">
              <Server className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="server-url"
                type="url"
                placeholder="http://localhost:3420"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="pl-9"
                disabled={isConnecting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="auth-token">Auth Token</Label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="auth-token"
                type="password"
                placeholder="Enter the token from server output"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="pl-9 font-mono"
                disabled={isConnecting}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              The auth token is displayed when you run{' '}
              <code className="bg-muted px-1 rounded">bun run server</code>
            </p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-md">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Button
            onClick={handleConnect}
            disabled={isConnecting || !url.trim() || !token.trim()}
            className="w-full"
          >
            {isConnecting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Connect
              </>
            )}
          </Button>

          <div className="text-center text-xs text-muted-foreground">
            <p>Start the server with:</p>
            <code className="bg-muted px-2 py-1 rounded mt-1 inline-block">bun run server</code>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
