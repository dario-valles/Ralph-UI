// Agents configuration tab for Settings page
// Allows users to re-detect agents and change their preferences

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { AgentModelSelector } from '@/components/shared/AgentModelSelector'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { getAllAgentsStatus } from '@/lib/api/agent-api'
import type { AgentType, AgentStatusInfo } from '@/types'
import { Bot, Check, X, Loader2, RefreshCw, AlertCircle, Copy, CheckCheck } from 'lucide-react'
import { toast } from '@/stores/toastStore'
import { useAgentModelSelector } from '@/hooks/useAgentModelSelector'
import { cn } from '@/lib/utils'

export function AgentsTab() {
  const {
    enabledAgents,
    preferredAgent,
    preferredModel,
    preferredProvider,
    setEnabledAgents,
    setPreferredAgent,
    setPreferredModel,
    setPreferredProvider,
    hasCompletedAgentSetup,
    markAgentSetupComplete,
  } = useOnboardingStore()

  const [agents, setAgents] = useState<AgentStatusInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Local state for selections (initialized from store)
  const [selectedAgents, setSelectedAgents] = useState<Set<AgentType>>(new Set(enabledAgents))
  const [defaultAgent, setDefaultAgent] = useState<AgentType | null>(preferredAgent)

  // Agent and model selector state
  const {
    agentType,
    setAgentType,
    providerId,
    setProviderId,
    modelId,
    setModelId,
    models,
    modelsLoading,
    defaultModelId,
    agentOptions,
    agentsLoading: agentOptionsLoading,
    handleAgentOptionChange,
    currentAgentOptionValue,
  } = useAgentModelSelector({
    initialAgent: preferredAgent || undefined,
    initialModel: preferredModel || undefined,
    initialProvider: preferredProvider || undefined,
  })

  // Track if there are unsaved changes
  const [hasChanges, setHasChanges] = useState(false)

  const loadAgents = async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await getAllAgentsStatus()
      setAgents(status)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to detect agents')
    } finally {
      setLoading(false)
    }
  }

  // Load agents on mount
  useEffect(() => {
    loadAgents()
  }, [])

  // Update local state when store changes
  useEffect(() => {
    setSelectedAgents(new Set(enabledAgents))
    setDefaultAgent(preferredAgent)
    // Only update selector if not already set by user
    if (preferredAgent && !hasChanges) {
      setAgentType(preferredAgent)
      if (preferredProvider) {
        setProviderId(preferredProvider)
      }
      if (preferredModel) {
        setModelId(preferredModel)
      }
    }
  }, [enabledAgents, preferredAgent, preferredModel, preferredProvider, setAgentType, setProviderId, setModelId, hasChanges])

  const handleToggleAgent = (agentType: AgentType) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev)
      if (next.has(agentType)) {
        next.delete(agentType)
        // If we removed the default agent, pick a new one
        if (defaultAgent === agentType) {
          const remaining = Array.from(next)
          setDefaultAgent(remaining.length > 0 ? remaining[0] : null)
        }
      } else {
        next.add(agentType)
        // If no default set, use this one
        if (!defaultAgent) {
          setDefaultAgent(agentType)
        }
      }
      return next
    })
    setHasChanges(true)
  }

  const handleDefaultChange = (agent: AgentType) => {
    setDefaultAgent(agent)
    setAgentType(agent)
    setHasChanges(true)
  }

  const handleSave = () => {
    setEnabledAgents(Array.from(selectedAgents))
    setPreferredAgent(agentType)
    setPreferredModel(modelId || null)
    setPreferredProvider(providerId || null)
    if (!hasCompletedAgentSetup) {
      markAgentSetupComplete()
    }
    setHasChanges(false)
  }

  const handleResetToDetected = () => {
    const available = agents.filter((a) => a.available).map((a) => a.agentType)
    setSelectedAgents(new Set(available))
    if (available.includes('claude')) {
      setDefaultAgent('claude')
    } else if (available.length > 0) {
      setDefaultAgent(available[0])
    } else {
      setDefaultAgent(null)
    }
    setHasChanges(true)
  }

  const availableCount = agents.filter((a) => a.available).length

  return (
    <div className="space-y-6">
      {/* Header with actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-medium">AI Agents</h3>
          <p className="text-sm text-muted-foreground">
            Configure which AI coding agents are available for use
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAgents} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', loading && 'animate-spin')} />
            Re-detect
          </Button>
          <Button variant="outline" size="sm" onClick={handleResetToDetected} disabled={loading}>
            Reset to Detected
          </Button>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-4 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Agent detection status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Detection Status</CardTitle>
          <CardDescription>
            {loading
              ? 'Scanning for installed agents...'
              : `${availableCount} of ${agents.length} agents are installed on this system`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {agents.map((agent) => (
                <AgentRow
                  key={agent.agentType}
                  agent={agent}
                  checked={selectedAgents.has(agent.agentType)}
                  onToggle={() => handleToggleAgent(agent.agentType)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Default agent and model selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Agent & Model</CardTitle>
          <CardDescription>
            The agent and model to use by default when creating new sessions or PRDs
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedAgents.size === 0 ? (
            <p className="text-sm text-muted-foreground">
              Enable at least one agent above to set a default
            </p>
          ) : (
            <div className="space-y-4">
              <AgentModelSelector
                agentType={agentType}
                modelId={modelId}
                onAgentChange={(agent) => {
                  handleDefaultChange(agent)
                }}
                onModelChange={(model) => {
                  setModelId(model)
                  setHasChanges(true)
                }}
                models={models}
                modelsLoading={modelsLoading}
                defaultModelId={defaultModelId}
                agentOptions={agentOptions.filter((opt) => selectedAgents.has(opt.agentType))}
                currentAgentOptionValue={currentAgentOptionValue}
                onAgentOptionChange={(value) => {
                  handleAgentOptionChange(value)
                  setHasChanges(true)
                }}
                agentsLoading={agentOptionsLoading}
              />
              <p className="text-xs text-muted-foreground">
                This agent and model will be used as the default for new sessions and PRDs
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save changes notice */}
      {hasChanges && (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
          <CardContent className="pt-4 flex items-center justify-between">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              You have unsaved changes to your agent configuration
            </p>
            <Button size="sm" onClick={handleSave}>
              Save Changes
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// Individual agent row component
interface AgentRowProps {
  agent: AgentStatusInfo
  checked: boolean
  onToggle: () => void
}

function AgentRow({ agent, checked, onToggle }: AgentRowProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(agent.installHint)
      setCopied(true)
      toast.success('Copied to clipboard')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        agent.available ? 'bg-background hover:bg-muted/50 cursor-pointer' : 'bg-muted/30'
      )}
    >
      {/* Main row */}
      <div
        className="flex items-center gap-3 p-3"
        onClick={agent.available ? onToggle : undefined}
      >
        {/* Checkbox */}
        <Checkbox
          checked={checked}
          disabled={!agent.available}
          onCheckedChange={agent.available ? onToggle : undefined}
          onClick={(e) => e.stopPropagation()}
        />

        {/* Agent icon */}
        <div
          className={cn(
            'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
            agent.available ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          )}
        >
          <Bot className="h-4 w-4" />
        </div>

        {/* Agent info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{agent.displayName}</span>
            <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
              {agent.cliCommand}
            </code>
          </div>
        </div>

        {/* Status badge */}
        {agent.available ? (
          <Badge variant="success" size="sm" className="flex-shrink-0">
            <Check className="h-3 w-3 mr-1" />
            Installed
          </Badge>
        ) : (
          <Badge variant="secondary" size="sm" className="flex-shrink-0">
            <X className="h-3 w-3 mr-1" />
            Not Found
          </Badge>
        )}
      </div>

      {/* Install hint row (only for unavailable agents) */}
      {!agent.available && (
        <div className="px-3 pb-3 pt-0">
          <div className="flex items-center gap-2 bg-muted/50 rounded-md p-2">
            <code className="text-xs text-muted-foreground flex-1 break-all">
              {agent.installHint}
            </code>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 flex-shrink-0"
              onClick={handleCopy}
            >
              {copied ? (
                <CheckCheck className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
