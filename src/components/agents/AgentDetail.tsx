import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Agent, getStatusColor, getStatusLabel, formatCost, formatTokens } from '@/lib/agent-api'
import {
  Activity,
  Clock,
  DollarSign,
  Hash,
  GitBranch,
  FolderTree,
  Play,
  Square,
  RotateCcw,
} from 'lucide-react'

interface AgentDetailProps {
  agent: Agent | null
  onStop?: (agentId: string) => void
  onRestart?: (agentId: string) => void
}

export function AgentDetail({ agent, onStop, onRestart }: AgentDetailProps) {
  if (!agent) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Agent Details</CardTitle>
          <CardDescription>Select an agent to view details</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const isRunning = agent.status !== 'idle'

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Agent {agent.id.slice(0, 8)}
              <Badge className={getStatusColor(agent.status)}>
                {getStatusLabel(agent.status)}
              </Badge>
            </CardTitle>
            <CardDescription>Task: {agent.task_id}</CardDescription>
          </div>
          <div className="flex gap-2">
            {isRunning && onStop && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onStop(agent.id)}
              >
                <Square className="h-4 w-4 mr-2" />
                Stop
              </Button>
            )}
            {!isRunning && onRestart && (
              <Button
                size="sm"
                variant="default"
                onClick={() => onRestart(agent.id)}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Restart
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Metrics Section */}
        <div>
          <h3 className="font-semibold mb-3">Metrics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Iteration Count</span>
              </div>
              <div className="text-2xl font-bold">{agent.iteration_count}</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Hash className="h-4 w-4" />
                <span>Total Tokens</span>
              </div>
              <div className="text-2xl font-bold">{formatTokens(agent.tokens)}</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <DollarSign className="h-4 w-4" />
                <span>Total Cost</span>
              </div>
              <div className="text-2xl font-bold">{formatCost(agent.cost)}</div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Activity className="h-4 w-4" />
                <span>Process ID</span>
              </div>
              <div className="text-2xl font-bold">{agent.process_id || 'N/A'}</div>
            </div>
          </div>
        </div>

        {/* Git Information */}
        <div>
          <h3 className="font-semibold mb-3">Git Information</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Branch:</span>
              <code className="text-sm bg-muted px-2 py-1 rounded">{agent.branch}</code>
            </div>
            <div className="flex items-start gap-2">
              <FolderTree className="h-4 w-4 text-muted-foreground mt-1" />
              <div>
                <span className="text-sm font-medium">Worktree Path:</span>
                <code className="text-sm bg-muted px-2 py-1 rounded block mt-1 break-all">
                  {agent.worktree_path}
                </code>
              </div>
            </div>
          </div>
        </div>

        {/* Subagents (if any) */}
        {agent.subagents && agent.subagents.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">Subagents ({agent.subagents.length})</h3>
            <div className="space-y-2">
              {agent.subagents.map((subagent) => (
                <div
                  key={subagent.id}
                  className="flex items-center justify-between p-2 border rounded-md"
                >
                  <span className="text-sm font-mono">{subagent.id.slice(0, 8)}</span>
                  <Badge className={getStatusColor(subagent.status)}>
                    {getStatusLabel(subagent.status)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Session and Task Info */}
        <div>
          <h3 className="font-semibold mb-3">Session Information</h3>
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-muted-foreground">Session ID:</span>
              <code className="ml-2 bg-muted px-2 py-1 rounded font-mono">
                {agent.session_id}
              </code>
            </div>
            <div>
              <span className="text-muted-foreground">Task ID:</span>
              <code className="ml-2 bg-muted px-2 py-1 rounded font-mono">
                {agent.task_id}
              </code>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
