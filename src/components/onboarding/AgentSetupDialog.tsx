// Agent setup dialog for first-time users
// Shows detected agents and lets users configure which ones to use

import { useState, useEffect } from 'react'
import { ResponsiveModal } from '@/components/ui/responsive-modal'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { getAllAgentsStatus } from '@/lib/api/agent-api'
import type { AgentType, AgentStatusInfo } from '@/types'
import { Bot, Check, X, Loader2, AlertCircle, Copy, CheckCheck } from 'lucide-react'
import { toast } from '@/stores/toastStore'

interface AgentSetupDialogProps {
  open: boolean
  onComplete: () => void
}

export function AgentSetupDialog({ open, onComplete }: AgentSetupDialogProps) {
  const {
    markAgentSetupComplete,
    setEnabledAgents,
    setPreferredAgent,
    enabledAgents: storedEnabledAgents,
    preferredAgent: storedPreferredAgent,
  } = useOnboardingStore()

  const [agents, setAgents] = useState<AgentStatusInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Local state for selections
  const [selectedAgents, setSelectedAgents] = useState<Set<AgentType>>(new Set())
  const [defaultAgent, setDefaultAgent] = useState<AgentType | null>(null)

  // Load agent status on mount
  useEffect(() => {
    if (!open) return

    const loadAgents = async () => {
      setLoading(true)
      setError(null)
      try {
        const status = await getAllAgentsStatus()
        setAgents(status)

        // Auto-select available agents
        const available = status.filter((a) => a.available).map((a) => a.agentType)
        setSelectedAgents(new Set(available))

        // Set default to first available agent (prefer claude)
        if (available.includes('claude')) {
          setDefaultAgent('claude')
        } else if (available.length > 0) {
          setDefaultAgent(available[0])
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to detect agents')
      } finally {
        setLoading(false)
      }
    }

    loadAgents()
  }, [open])

  // Initialize from stored values if they exist
  useEffect(() => {
    if (storedEnabledAgents.length > 0) {
      setSelectedAgents(new Set(storedEnabledAgents))
    }
    if (storedPreferredAgent) {
      setDefaultAgent(storedPreferredAgent)
    }
  }, [storedEnabledAgents, storedPreferredAgent])

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
  }

  const handleComplete = () => {
    setEnabledAgents(Array.from(selectedAgents))
    setPreferredAgent(defaultAgent)
    markAgentSetupComplete()
    onComplete()
  }

  const handleSkip = () => {
    markAgentSetupComplete()
    onComplete()
  }

  const availableCount = agents.filter((a) => a.available).length
  const selectedArray = Array.from(selectedAgents)

  const footer = (
    <div className="flex gap-2 w-full">
      <Button variant="outline" onClick={handleSkip} className="flex-1">
        Skip
      </Button>
      <Button onClick={handleComplete} disabled={selectedAgents.size === 0} className="flex-1">
        Get Started
      </Button>
    </div>
  )

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) handleSkip()
      }}
      title="Set Up Your AI Agents"
      description={
        loading
          ? 'Detecting installed agents...'
          : `Found ${availableCount} agent${availableCount !== 1 ? 's' : ''} installed`
      }
      size="md"
      footer={footer}
    >
      {loading ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Scanning for AI coding agents...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <AlertCircle className="h-8 w-8 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Agent list */}
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

          {/* Default agent selector */}
          {selectedAgents.size > 0 && (
            <div className="pt-4 border-t">
              <label className="text-sm font-medium mb-2 block">Default Agent</label>
              <Select
                value={defaultAgent || ''}
                onValueChange={(value) => setDefaultAgent(value as AgentType)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select default agent" />
                </SelectTrigger>
                <SelectContent>
                  {selectedArray.map((agentType) => {
                    const agent = agents.find((a) => a.agentType === agentType)
                    return (
                      <SelectItem key={agentType} value={agentType}>
                        {agent?.displayName || agentType}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                This agent will be used by default for new sessions
              </p>
            </div>
          )}

          {/* No agents warning */}
          {availableCount === 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                No AI coding agents detected. Install at least one agent to use Ralph UI.
              </p>
            </div>
          )}
        </div>
      )}
    </ResponsiveModal>
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
      className={`rounded-lg border transition-colors ${
        agent.available
          ? 'bg-background hover:bg-muted/50 cursor-pointer'
          : 'bg-muted/30'
      }`}
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
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            agent.available ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
          }`}
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
