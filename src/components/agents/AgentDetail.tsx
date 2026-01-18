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
  Square,
  RotateCcw,
  Bot,
  Copy,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface AgentDetailProps {
  agent: Agent | null
  onStop?: (agentId: string) => void
  onRestart?: (agentId: string) => void
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-6 w-6 p-0"
      onClick={handleCopy}
      title={`Copy ${label}`}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground" />
      )}
    </Button>
  )
}

export function AgentDetail({ agent, onStop, onRestart }: AgentDetailProps) {
  if (!agent) {
    return (
      <Card className="h-full">
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Bot className="h-16 w-16 text-muted-foreground/30 mb-4" />
          <h3 className="font-semibold text-lg mb-1">No Agent Selected</h3>
          <p className="text-sm text-muted-foreground">
            Select an agent from the list to view details
          </p>
        </CardContent>
      </Card>
    )
  }

  const isRunning = agent.status !== 'idle'

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <CardTitle className="text-xl font-mono">
                Agent {agent.id.slice(0, 8)}
              </CardTitle>
              <Badge className={cn(getStatusColor(agent.status), 'text-sm px-3')}>
                {getStatusLabel(agent.status)}
              </Badge>
            </div>
            <CardDescription className="flex items-center gap-2">
              Task: <code className="font-mono">{agent.taskId ? agent.taskId.slice(0, 12) : 'N/A'}</code>
              {agent.taskId && <CopyButton text={agent.taskId} label="Task ID" />}
            </CardDescription>
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
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Clock className="h-4 w-4" />
              <span>Iterations</span>
            </div>
            <div className="text-2xl font-bold">{agent.iterationCount}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Hash className="h-4 w-4" />
              <span>Tokens</span>
            </div>
            <div className="text-2xl font-bold">{formatTokens(agent.tokens)}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <DollarSign className="h-4 w-4" />
              <span>Cost</span>
            </div>
            <div className="text-2xl font-bold">{formatCost(agent.cost)}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Activity className="h-4 w-4" />
              <span>Process ID</span>
            </div>
            <div className="text-2xl font-bold font-mono">{agent.processId || 'N/A'}</div>
          </div>
        </div>

        {/* Git Information */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Git Information
          </h3>
          <div className="rounded-lg border divide-y">
            <div className="flex items-center justify-between p-3">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Branch</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded font-mono">{agent.branch}</code>
                <CopyButton text={agent.branch} label="branch" />
              </div>
            </div>
            <div className="flex items-start justify-between p-3">
              <div className="flex items-center gap-2">
                <FolderTree className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Worktree</span>
              </div>
              <div className="flex items-center gap-2 max-w-[60%]">
                <code className="text-sm bg-muted px-2 py-1 rounded font-mono break-all text-right">
                  {agent.worktreePath}
                </code>
                <CopyButton text={agent.worktreePath} label="worktree path" />
              </div>
            </div>
          </div>
        </div>

        {/* Subagents (if any) */}
        {agent.subagents && agent.subagents.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Subagents ({agent.subagents.length})
            </h3>
            <div className="rounded-lg border divide-y">
              {agent.subagents.map((subagent) => (
                <div
                  key={subagent.id}
                  className="flex items-center justify-between p-3"
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

        {/* Session Information */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Session Information
          </h3>
          <div className="rounded-lg border divide-y">
            <div className="flex items-center justify-between p-3">
              <span className="text-sm font-medium">Session ID</span>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                  {agent.sessionId}
                </code>
                <CopyButton text={agent.sessionId} label="session ID" />
              </div>
            </div>
            <div className="flex items-center justify-between p-3">
              <span className="text-sm font-medium">Task ID</span>
              <div className="flex items-center gap-2">
                <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                  {agent.taskId || 'N/A'}
                </code>
                {agent.taskId && <CopyButton text={agent.taskId} label="task ID" />}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
