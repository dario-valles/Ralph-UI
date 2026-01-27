import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { providerApi } from '@/lib/api'
import type { ApiProviderInfo, ProviderTestResult } from '@/types'
import { CheckCircle2, XCircle, Loader2, Eye, EyeOff, Trash2, ExternalLink } from 'lucide-react'

export function ApiProviderSettings() {
  const [providers, setProviders] = useState<ApiProviderInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<Record<string, ProviderTestResult>>({})
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({})
  const [showTokens, setShowTokens] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  // Load providers on mount
  const loadProviders = useCallback(async () => {
    try {
      setLoading(true)
      const data = await providerApi.getAll()
      setProviders(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load providers')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  // Set active provider
  const handleSetActive = async (providerId: string) => {
    try {
      setSaving(providerId)
      await providerApi.setActive(providerId)
      await loadProviders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set provider')
    } finally {
      setSaving(null)
    }
  }

  // Save token
  const handleSaveToken = async (providerId: string) => {
    const token = tokenInputs[providerId]
    if (!token?.trim()) return

    try {
      setSaving(providerId)
      await providerApi.setToken(providerId, token.trim())
      setTokenInputs((prev) => ({ ...prev, [providerId]: '' }))
      await loadProviders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save token')
    } finally {
      setSaving(null)
    }
  }

  // Delete token
  const handleDeleteToken = async (providerId: string) => {
    try {
      setSaving(providerId)
      await providerApi.deleteToken(providerId)
      await loadProviders()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete token')
    } finally {
      setSaving(null)
    }
  }

  // Test connection
  const handleTestConnection = async (providerId: string) => {
    try {
      setTesting(providerId)
      const result = await providerApi.testConnection(providerId)
      setTestResult((prev) => ({ ...prev, [providerId]: result }))
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [providerId]: {
          success: false,
          message: err instanceof Error ? err.message : 'Connection test failed',
        },
      }))
    } finally {
      setTesting(null)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>API Providers</CardTitle>
          <CardDescription>Configure alternative API providers for Claude</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Providers</CardTitle>
        <CardDescription>
          Configure alternative API providers (z.ai, MiniMax) that provide Claude-compatible APIs.
          Configured providers appear as separate options in the agent selector (e.g., "Claude (Z.AI)").
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
        )}

        <div className="space-y-4">
          {providers.map((provider) => (
            <div
              key={provider.id}
              className={`rounded-lg border p-4 transition-colors ${
                provider.isActive
                  ? 'border-green-500/50 bg-green-500/5 dark:border-green-500/30 dark:bg-green-500/10'
                  : 'border-border/50 hover:bg-muted/30'
              }`}
            >
              {/* Provider Header */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{provider.name}</h3>
                      {/* Show "Ready" for all providers that can be used */}
                      {(provider.hasToken || provider.id === 'anthropic') && (
                        <Badge variant="success" className="text-xs">
                          Ready
                        </Badge>
                      )}
                      {/* Show "Default" indicator for the globally active provider */}
                      {provider.isActive && (
                        <Badge variant="outline" className="text-xs">
                          Default
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{provider.baseUrl}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {!provider.isActive && (provider.hasToken || provider.id === 'anthropic') && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetActive(provider.id)}
                      disabled={saving === provider.id}
                    >
                      {saving === provider.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        'Set Default'
                      )}
                    </Button>
                  )}
                </div>
              </div>

              {/* Available Models */}
              {provider.models.length > 0 && (
                <div className="mt-3">
                  <Label className="text-xs text-muted-foreground">Available Models</Label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {provider.models.map((model) => (
                      <Badge
                        key={model.name}
                        variant={model.isDefault ? 'default' : 'outline'}
                        className="text-xs"
                      >
                        {model.name}
                        {model.isDefault && ' (default)'}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Token Configuration (not for Anthropic which uses default config) */}
              {provider.id !== 'anthropic' && (
                <div className="mt-4 space-y-3">
                  <Label className="text-sm">API Token</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <Input
                        type={showTokens[provider.id] ? 'text' : 'password'}
                        placeholder={
                          provider.hasToken ? 'Token configured (enter new to replace)' : 'Enter API token...'
                        }
                        value={tokenInputs[provider.id] || ''}
                        onChange={(e) =>
                          setTokenInputs((prev) => ({ ...prev, [provider.id]: e.target.value }))
                        }
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() =>
                          setShowTokens((prev) => ({
                            ...prev,
                            [provider.id]: !prev[provider.id],
                          }))
                        }
                      >
                        {showTokens[provider.id] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleSaveToken(provider.id)}
                        disabled={saving === provider.id || !tokenInputs[provider.id]?.trim()}
                      >
                        {saving === provider.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Save'
                        )}
                      </Button>
                      {provider.hasToken && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDeleteToken(provider.id)}
                          disabled={saving === provider.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleTestConnection(provider.id)}
                        disabled={testing === provider.id}
                      >
                        {testing === provider.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Test'
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Test Result */}
                  {testResult[provider.id] && (
                    <div
                      className={`flex items-center gap-2 rounded-md p-2 text-sm ${
                        testResult[provider.id].success
                          ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                          : 'bg-destructive/10 text-destructive'
                      }`}
                    >
                      {testResult[provider.id].success ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : (
                        <XCircle className="h-4 w-4" />
                      )}
                      {testResult[provider.id].message}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Info Section */}
        <div className="rounded-lg bg-muted/30 p-4">
          <h4 className="text-sm font-medium">About API Providers</h4>
          <p className="mt-1 text-sm text-muted-foreground">
            Alternative API providers like z.ai and MiniMax offer Claude-compatible APIs. When using
            these providers, your requests are routed through their infrastructure instead of
            directly to Anthropic.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href="https://z.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              z.ai <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://minimax.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              MiniMax <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
