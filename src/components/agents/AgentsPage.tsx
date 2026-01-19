import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useAgentStore } from '@/stores/agentStore'
import { useSessionStore } from '@/stores/sessionStore'
import { AgentList } from './AgentList'
import { AgentDetail } from './AgentDetail'
import { AgentLogViewer } from './AgentLogViewer'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Bot, Filter, FilterX } from 'lucide-react'
import { cleanupStaleAgents, LogEntry } from '@/lib/agent-api'
import { parallelPollCompleted, parallelGetAgentLogs } from '@/lib/parallel-api'

export function AgentsPage() {
  const { currentSession } = useSessionStore()
  const {
    agents,
    activeAgentId,
    loading,
    error,
    setActiveAgent,
    loadAgentsForSession,
    updateStatus,
    clearError,
  } = useAgentStore()

  const [showActiveOnly, setShowActiveOnly] = useState(false)
  const [realtimeLogs, setRealtimeLogs] = useState<LogEntry[]>([])
  const [realtimeLogsAgentId, setRealtimeLogsAgentId] = useState<string | null>(null)

  // Load agents when session changes
  useEffect(() => {
    if (currentSession?.id) {
      loadAgentsForSession(currentSession?.id)
    }
  }, [currentSession?.id, loadAgentsForSession])

  // Poll for completed agents (detects zombie processes and updates status)
  const pollIntervalRef = useRef<number | null>(null)

  const pollCompleted = useCallback(async () => {
    const sessionId = currentSession?.id
    if (!sessionId) return

    let needsRefresh = false

    // First try poll_completed (saves logs if scheduler is running)
    try {
      const completed = await parallelPollCompleted()
      if (completed.length > 0) {
        console.log('[AgentsPage] Completed agents (with logs):', completed)
        needsRefresh = true
      }
    } catch {
      // Scheduler not initialized, try cleanup instead
      try {
        const cleaned = await cleanupStaleAgents()
        if (cleaned.length > 0) {
          console.log('[AgentsPage] Cleaned up stale agents:', cleaned)
          needsRefresh = true
        }
      } catch {
        // Cleanup may fail, which is fine
      }
    }

    if (needsRefresh) {
      loadAgentsForSession(sessionId)
    }
  }, [currentSession, loadAgentsForSession])

  // Start/stop polling when we have active agents
  useEffect(() => {
    const hasActiveAgents = agents.some((a) => a.status !== 'idle')

    if (hasActiveAgents && !pollIntervalRef.current) {
      // Start polling every 3 seconds
      pollIntervalRef.current = window.setInterval(pollCompleted, 3000)
    } else if (!hasActiveAgents && pollIntervalRef.current) {
      // Stop polling when no active agents
      clearInterval(pollIntervalRef.current)
      pollIntervalRef.current = null
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current)
        pollIntervalRef.current = null
      }
    }
  }, [agents, pollCompleted])

  // Real-time log polling for active selected agent
  const logPollIntervalRef = useRef<number | null>(null)

  const fetchRealtimeLogs = useCallback(async () => {
    if (!activeAgentId) return

    const agent = agents.find((a) => a.id === activeAgentId)
    if (!agent || agent.status === 'idle') {
      // Agent is idle, clear realtime logs
      setRealtimeLogsAgentId(null)
      setRealtimeLogs([])
      return
    }

    try {
      const logs = await parallelGetAgentLogs(activeAgentId)
      setRealtimeLogsAgentId(activeAgentId)
      setRealtimeLogs(logs as LogEntry[])
    } catch {
      // Scheduler not initialized or other error, fall back to DB logs
      setRealtimeLogsAgentId(null)
      setRealtimeLogs([])
    }
  }, [activeAgentId, agents])

  // Start/stop log polling for the selected active agent
  useEffect(() => {
    const agent = agents.find((a) => a.id === activeAgentId)
    const isAgentActive = agent && agent.status !== 'idle'

    if (isAgentActive) {
      // Poll every 1 second (first poll happens after 1s, which is fine for UX)
      logPollIntervalRef.current = window.setInterval(fetchRealtimeLogs, 1000)
    }

    return () => {
      if (logPollIntervalRef.current) {
        clearInterval(logPollIntervalRef.current)
        logPollIntervalRef.current = null
      }
    }
  }, [activeAgentId, agents, fetchRealtimeLogs])

  // Filter agents based on toggle
  const filteredAgents = useMemo(() => {
    if (!showActiveOnly) return agents
    return agents.filter((a) => a.status !== 'idle')
  }, [agents, showActiveOnly])

  // Get selected agent
  const selectedAgent = useMemo(() => {
    return agents.find((a) => a.id === activeAgentId) || null
  }, [agents, activeAgentId])

  // Effective logs to display - realtime logs for active agents, DB logs for idle
  const effectiveLogs = useMemo(() => {
    if (!selectedAgent) return []

    // If agent is active and we have realtime logs for this specific agent, use them
    if (selectedAgent.status !== 'idle' && realtimeLogsAgentId === selectedAgent.id && realtimeLogs.length > 0) {
      return realtimeLogs
    }

    // Fall back to DB logs (for idle agents or before first poll)
    return selectedAgent.logs || []
  }, [selectedAgent, realtimeLogs, realtimeLogsAgentId])

  // Status summary
  const statusSummary = useMemo(() => {
    const active = agents.filter((a) => a.status !== 'idle').length
    const idle = agents.filter((a) => a.status === 'idle').length
    return { active, idle, total: agents.length }
  }, [agents])

  const handleRefresh = () => {
    if (currentSession?.id) {
      loadAgentsForSession(currentSession?.id)
    }
  }

  const handleToggleActiveOnly = () => {
    setShowActiveOnly(!showActiveOnly)
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
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              No Session Selected
            </CardTitle>
            <CardDescription>Please select a session from the sidebar to view agents</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Agents</h1>
            {statusSummary.total > 0 && (
              <div className="flex items-center gap-2">
                {statusSummary.active > 0 && (
                  <Badge variant="default" className="bg-green-500">
                    {statusSummary.active} active
                  </Badge>
                )}
                {statusSummary.idle > 0 && (
                  <Badge variant="secondary">
                    {statusSummary.idle} idle
                  </Badge>
                )}
              </div>
            )}
          </div>
          <p className="text-muted-foreground">
            Session: {currentSession?.name || currentSession?.id.slice(0, 8)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleToggleActiveOnly}
            variant={showActiveOnly ? 'default' : 'outline'}
            size="sm"
          >
            {showActiveOnly ? (
              <>
                <FilterX className="h-4 w-4 mr-2" />
                Show All
              </>
            ) : (
              <>
                <Filter className="h-4 w-4 mr-2" />
                Active Only
              </>
            )}
          </Button>
          <Button onClick={handleRefresh} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <Card className="border-destructive bg-destructive/5">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-destructive">{error}</p>
              <Button onClick={clearError} variant="ghost" size="sm">
                Dismiss
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Agent List - narrower */}
        <div className="lg:col-span-4 xl:col-span-3">
          <AgentList
            agents={filteredAgents}
            onSelectAgent={setActiveAgent}
            selectedAgentId={activeAgentId}
            showActiveOnly={showActiveOnly}
            totalAgents={agents.length}
          />
        </div>

        {/* Agent Detail and Logs - wider */}
        <div className="lg:col-span-8 xl:col-span-9 space-y-6">
          <AgentDetail
            agent={selectedAgent}
            onStop={handleStopAgent}
            onRestart={handleRestartAgent}
          />
          <AgentLogViewer
            logs={effectiveLogs}
            agentId={selectedAgent?.id}
          />
        </div>
      </div>
    </div>
  )
}
