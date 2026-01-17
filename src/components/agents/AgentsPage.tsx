import { useEffect, useMemo } from 'react'
import { useAgentStore } from '@/stores/agentStore'
import { useSessionStore } from '@/stores/sessionStore'
import { AgentList } from './AgentList'
import { AgentDetail } from './AgentDetail'
import { AgentLogViewer } from './AgentLogViewer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RefreshCw, Play } from 'lucide-react'

export function AgentsPage() {
  const { currentSession } = useSessionStore()
  const {
    agents,
    activeAgentId,
    loading,
    error,
    setActiveAgent,
    loadAgentsForSession,
    loadActiveAgents,
    updateStatus,
    clearError,
  } = useAgentStore()

  // Load agents when session changes
  useEffect(() => {
    if (currentSession?.id) {
      loadAgentsForSession(currentSession?.id)
    }
  }, [currentSession?.id, loadAgentsForSession])

  // Get selected agent
  const selectedAgent = useMemo(() => {
    return agents.find((a) => a.id === activeAgentId) || null
  }, [agents, activeAgentId])

  const handleRefresh = () => {
    if (currentSession?.id) {
      loadAgentsForSession(currentSession?.id)
    }
  }

  const handleLoadActive = () => {
    if (currentSession?.id) {
      loadActiveAgents(currentSession?.id)
    }
  }

  const handleStopAgent = async (agentId: string) => {
    await updateStatus(agentId, 'idle')
  }

  const handleRestartAgent = async (agentId: string) => {
    await updateStatus(agentId, 'thinking')
  }

  if (!currentSession?.id) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground">Monitor your AI agents</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>No Session Selected</CardTitle>
            <CardDescription>Please select a session to view agents</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
          <p className="text-muted-foreground">
            Monitor AI agents for session {currentSession?.id.slice(0, 8)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleLoadActive} variant="outline" size="sm">
            <Play className="h-4 w-4 mr-2" />
            Show Active Only
          </Button>
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm text-destructive">{error}</p>
              <Button onClick={clearError} variant="ghost" size="sm">
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent List */}
        <div className="lg:col-span-1">
          <AgentList
            agents={agents}
            onSelectAgent={setActiveAgent}
            selectedAgentId={activeAgentId}
          />
        </div>

        {/* Agent Detail and Logs */}
        <div className="lg:col-span-2 space-y-6">
          <AgentDetail
            agent={selectedAgent}
            onStop={handleStopAgent}
            onRestart={handleRestartAgent}
          />
          <AgentLogViewer
            logs={selectedAgent?.logs || []}
            agentId={selectedAgent?.id}
          />
        </div>
      </div>
    </div>
  )
}
