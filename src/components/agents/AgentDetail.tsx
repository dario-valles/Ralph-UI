import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useState, useMemo } from 'react'
import { useTaskStore } from '@/stores/taskStore'
import { TaskDetail } from '@/components/tasks/TaskDetail'
import { SubagentTreePanel } from '@/components/agents/SubagentTreePanel'

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
  const { tasks } = useTaskStore()
  const [taskDetailOpen, setTaskDetailOpen] = useState(false)

  // Find the task associated with this agent
  const taskId = agent?.taskId
  const task = useMemo(() => {
    if (!taskId) return null
    return tasks.find((t) => t.id === taskId) || null
  }, [taskId, tasks])

  const handleTaskClick = () => {
    setTaskDetailOpen(true)
  }

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
              Task:{' '}
              {agent.taskId ? (
                <button
                  onClick={handleTaskClick}
                  className="inline-flex items-center gap-1 text-primary hover:underline cursor-pointer max-w-[300px] truncate"
                  title={task?.title || agent.taskId}
                >
                  <span className="truncate">{task?.title || agent.taskId}</span>
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </button>
              ) : (
                <span className="text-muted-foreground">N/A</span>
              )}
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

        {/* Tabbed Information */}
        <Tabs defaultValue="git" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="git">Git</TabsTrigger>
            <TabsTrigger value="session">Session</TabsTrigger>
            <TabsTrigger value="subagents">
              Subagents
              {agent.subagents && agent.subagents.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-5 px-1.5">
                  {agent.subagents.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="git" className="mt-4">
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
          </TabsContent>

          <TabsContent value="session" className="mt-4">
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
                <span className="text-sm font-medium">Task</span>
                <div className="flex items-center gap-2">
                  {agent.taskId ? (
                    <button
                      onClick={handleTaskClick}
                      className="text-sm bg-muted px-2 py-1 rounded inline-flex items-center gap-1 text-primary hover:bg-muted/80 cursor-pointer max-w-[250px]"
                      title={task?.title || agent.taskId}
                    >
                      <span className="truncate">{task?.title || agent.taskId}</span>
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                    </button>
                  ) : (
                    <code className="text-sm bg-muted px-2 py-1 rounded font-mono">N/A</code>
                  )}
                  {agent.taskId && <CopyButton text={agent.taskId} label="task ID" />}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Subagents Tab - Show for both static subagents and live activity */}
          <TabsContent value="subagents" className="mt-4">
            {/* Live subagent activity panel (real-time events) */}
            <SubagentTreePanel
              agentId={agent.id}
              defaultExpanded={true}
              maxHeight="400px"
              className="mb-4"
            />

            {/* Static subagent list from agent data (if available) */}
            {agent.subagents && agent.subagents.length > 0 && (
              <div className="rounded-lg border divide-y">
                <div className="px-3 py-2 bg-muted/30 text-xs text-muted-foreground font-medium">
                  Static Subagent List
                </div>
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
            )}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* Task Detail Modal */}
      <TaskDetail
        open={taskDetailOpen}
        onOpenChange={setTaskDetailOpen}
        taskId={agent.taskId || null}
      />
    </Card>
  )
}
