// Active agents grid for Mission Control dashboard

import { useNavigate } from 'react-router-dom'
import { Bot, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AgentMiniCard } from './AgentMiniCard'
import type { ActiveAgentWithContext } from '@/hooks/useMissionControlData'
import { cn } from '@/lib/utils'
import { useSessionStore } from '@/stores/sessionStore'
import { useProjectStore } from '@/stores/projectStore'

interface ActiveAgentsGridProps {
  agents: ActiveAgentWithContext[]
  loading?: boolean
  error?: string | null
  collapsed?: boolean
  onToggleCollapse?: () => void
  onRefresh?: () => void
  onRetry?: () => void
}

function AgentsSkeleton() {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {[1, 2].map((i) => (
        <div key={i} className="rounded-lg border p-3 animate-pulse">
          <div className="flex items-center gap-2 mb-2">
            <div className="h-8 w-8 bg-muted rounded-full" />
            <div className="flex-1">
              <div className="h-4 bg-muted rounded w-1/2 mb-1" />
              <div className="h-3 bg-muted rounded w-3/4" />
            </div>
            <div className="h-5 w-20 bg-muted rounded" />
          </div>
          <div className="h-4 bg-muted rounded w-full mb-2" />
          <div className="flex justify-between">
            <div className="h-3 bg-muted rounded w-16" />
            <div className="h-3 bg-muted rounded w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center border border-dashed rounded-lg">
      <Bot className="h-8 w-8 text-muted-foreground mb-2" />
      <h3 className="font-medium mb-1">No active agents</h3>
      <p className="text-sm text-muted-foreground max-w-sm">
        All agents are idle. Start a session to spawn agents.
      </p>
    </div>
  )
}

function ErrorState({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 px-4 text-center border border-dashed border-red-500/20 rounded-lg bg-red-500/5">
      <Bot className="h-8 w-8 text-red-500 mb-2" />
      <h3 className="font-medium mb-1 text-red-500">Failed to load agents</h3>
      <p className="text-sm text-muted-foreground mb-3 max-w-sm">
        {error}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      )}
    </div>
  )
}

export function ActiveAgentsGrid({
  agents,
  loading,
  error,
  collapsed,
  onToggleCollapse,
  onRefresh,
  onRetry,
}: ActiveAgentsGridProps) {
  const navigate = useNavigate()
  const { sessions, setCurrentSession } = useSessionStore()
  const { projects, setActiveProject } = useProjectStore()

  const handleAgentClick = (agent: ActiveAgentWithContext) => {
    // Set session and project context before navigating
    const session = sessions.find((s) => s.id === agent.session_id)
    if (session) {
      setCurrentSession(session)
      const project = projects.find((p) => p.path === session.projectPath)
      if (project) {
        setActiveProject(project.id)
      }
    }
    // Navigate to the agents page with the agent selected
    navigate('/agents', { state: { agentId: agent.id, sessionId: agent.session_id } })
  }

  // Sort agents by status (active states first) then by cost (higher first)
  const sortedAgents = [...agents].sort((a, b) => {
    const statusOrder: Record<string, number> = {
      implementing: 0,
      testing: 1,
      committing: 2,
      thinking: 3,
      reading: 4,
      idle: 5,
    }
    const aOrder = statusOrder[a.status] ?? 5
    const bOrder = statusOrder[b.status] ?? 5

    if (aOrder !== bOrder) return aOrder - bOrder
    return b.cost - a.cost
  })

  const activeCount = agents.filter(a => a.status !== 'idle').length

  return (
    <div className="space-y-3">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 text-left hover:text-primary transition-colors"
        >
          <h2 className="text-lg font-semibold">Active Agents</h2>
          {activeCount > 0 && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            ({activeCount})
          </span>
          {onToggleCollapse && (
            collapsed ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            )
          )}
        </button>

        {!collapsed && onRefresh && agents.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        )}
      </div>

      {/* Content */}
      {!collapsed && (
        <>
          {error ? (
            <ErrorState error={error} onRetry={onRetry} />
          ) : loading ? (
            <AgentsSkeleton />
          ) : agents.length === 0 ? (
            <EmptyState />
          ) : (
            <div className={cn(
              "grid gap-3",
              sortedAgents.length === 1 && "md:grid-cols-1 max-w-md",
              sortedAgents.length === 2 && "md:grid-cols-2",
              sortedAgents.length >= 3 && "md:grid-cols-2 lg:grid-cols-3"
            )}>
              {sortedAgents.map((agent) => (
                <AgentMiniCard
                  key={agent.id}
                  agent={agent}
                  onClick={() => handleAgentClick(agent)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
