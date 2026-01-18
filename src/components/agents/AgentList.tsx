import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Agent, getStatusColor, getStatusLabel, formatCost, formatTokens } from '@/lib/agent-api'
import { Bot, Clock, DollarSign, Hash, GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AgentListProps {
  agents: Agent[]
  onSelectAgent: (agentId: string) => void
  selectedAgentId?: string | null
  showActiveOnly?: boolean
  totalAgents?: number
}

export function AgentList({
  agents,
  onSelectAgent,
  selectedAgentId,
  showActiveOnly,
  totalAgents,
}: AgentListProps) {
  if (agents.length === 0) {
    return (
      <Card className="h-full">
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <Bot className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="font-semibold text-lg mb-1">
            {showActiveOnly ? 'No Active Agents' : 'No Agents'}
          </h3>
          <p className="text-sm text-muted-foreground max-w-[200px]">
            {showActiveOnly
              ? `All ${totalAgents || 0} agents are idle. Toggle filter to see all.`
              : 'No agents have been spawned for this session yet.'}
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground px-1">
        {showActiveOnly
          ? `Showing ${agents.length} active of ${totalAgents || agents.length} total`
          : `${agents.length} agent${agents.length !== 1 ? 's' : ''}`}
      </div>

      <div className="space-y-2">
        {agents.map((agent) => (
          <Card
            key={agent.id}
            className={cn(
              'cursor-pointer transition-all hover:bg-accent/50',
              selectedAgentId === agent.id && 'ring-2 ring-primary bg-accent/30'
            )}
            onClick={() => onSelectAgent(agent.id)}
          >
            <CardContent className="p-4">
              {/* Header with ID and Status */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-muted-foreground" />
                  <span className="font-mono font-medium">{agent.id.slice(0, 8)}</span>
                </div>
                <Badge className={cn(getStatusColor(agent.status), 'text-xs')}>
                  {getStatusLabel(agent.status)}
                </Badge>
              </div>

              {/* Quick Stats Row */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>{agent.iterationCount} iterations</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Hash className="h-3 w-3" />
                  <span>{formatTokens(agent.tokens)} tokens</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <DollarSign className="h-3 w-3" />
                  <span>{formatCost(agent.cost)}</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <GitBranch className="h-3 w-3" />
                  <span className="truncate" title={agent.branch}>
                    {agent.branch.split('/').pop()}
                  </span>
                </div>
              </div>

              {/* Task ID if available */}
              {agent.taskId && (
                <div className="mt-2 pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    Task: <code className="font-mono">{agent.taskId.slice(0, 12)}</code>
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
