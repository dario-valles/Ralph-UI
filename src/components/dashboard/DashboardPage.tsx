import { useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Activity, CheckCircle2, Clock, DollarSign, FolderOpen, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Link } from 'react-router-dom'
import { useAgentStore } from '@/stores/agentStore'
import { useTaskStore } from '@/stores/taskStore'
import { useSessionStore } from '@/stores/sessionStore'

export function DashboardPage() {
  const { agents } = useAgentStore()
  const { tasks } = useTaskStore()
  const { sessions, currentSession, fetchSessions } = useSessionStore()

  // Fetch sessions on mount
  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // Calculate stats
  const activeAgents = agents.filter(
    (a) => a.status !== 'idle'
  ).length

  const completedTasks = tasks.filter((t) => t.status === 'completed').length
  const pendingTasks = tasks.filter(
    (t) => t.status === 'pending' || t.status === 'in_progress'
  ).length

  const totalCost = agents.reduce((sum, agent) => sum + agent.cost, 0)

  // Get recent sessions
  const recentSessions = [...sessions]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 3)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Overview of your autonomous AI agent activities</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeAgents}</div>
            <p className="text-xs text-muted-foreground">
              {activeAgents === 0
                ? 'No agents running'
                : activeAgents === 1
                  ? '1 agent working'
                  : `${activeAgents} agents working`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tasks Completed</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedTasks}</div>
            <p className="text-xs text-muted-foreground">
              {completedTasks === 0
                ? 'No tasks completed yet'
                : `${tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0}% completion rate`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Tasks</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingTasks}</div>
            <p className="text-xs text-muted-foreground">
              {pendingTasks === 0 ? 'No pending tasks' : 'Tasks awaiting completion'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalCost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">This session</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Get started with common workflows</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link to="/sessions" className="block">
              <Button variant="outline" className="w-full justify-start">
                <FolderOpen className="mr-2 h-4 w-4" />
                Create New Session
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>
            </Link>
            <Link to="/tasks" className="block">
              <Button variant="outline" className="w-full justify-start">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Manage Tasks
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>
            </Link>
            <Link to="/prd" className="block">
              <Button variant="outline" className="w-full justify-start">
                <Activity className="mr-2 h-4 w-4" />
                Create PRD
                <ArrowRight className="ml-auto h-4 w-4" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Sessions</CardTitle>
            <CardDescription>
              {sessions.length === 0
                ? 'No sessions yet'
                : `${sessions.length} total session${sessions.length === 1 ? '' : 's'}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recentSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No sessions created yet. Create a new session to get started.
              </p>
            ) : (
              <div className="space-y-3">
                {recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div>
                      <p className="font-medium">{session.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {session.status} - {session.tasks?.length || 0} tasks
                      </p>
                    </div>
                    <Link to={`/sessions/${session.id}`}>
                      <Button variant="ghost" size="sm">
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Current Session Status */}
      {currentSession && (
        <Card>
          <CardHeader>
            <CardTitle>Current Session: {currentSession.name}</CardTitle>
            <CardDescription>
              Status: {currentSession.status} | Project: {currentSession.projectPath}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm font-medium">Tasks</p>
                <p className="text-2xl font-bold">{currentSession.tasks?.length || 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Total Tokens</p>
                <p className="text-2xl font-bold">{currentSession.totalTokens?.toLocaleString() || 0}</p>
              </div>
              <div>
                <p className="text-sm font-medium">Total Cost</p>
                <p className="text-2xl font-bold">${currentSession.totalCost?.toFixed(2) || '0.00'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
