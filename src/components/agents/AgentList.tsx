import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Agent, getStatusColor, getStatusLabel, formatCost, formatTokens } from '@/lib/agent-api'
import { Activity, Clock, DollarSign, Hash } from 'lucide-react'

interface AgentListProps {
  agents: Agent[]
  onSelectAgent: (agentId: string) => void
  selectedAgentId?: string | null
}

export function AgentList({ agents, onSelectAgent, selectedAgentId }: AgentListProps) {
  if (agents.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
          <CardDescription>No agents running</CardDescription>
        </CardHeader>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Agents</h2>
        <p className="text-sm text-muted-foreground">{agents.length} agent(s) running</p>
      </div>

      <div className="grid gap-4">
        {agents.map((agent) => (
          <Card
            key={agent.id}
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedAgentId === agent.id ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => onSelectAgent(agent.id)}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Agent {agent.id.slice(0, 8)}</CardTitle>
                <Badge className={getStatusColor(agent.status)}>{getStatusLabel(agent.status)}</Badge>
              </div>
              <CardDescription>Task: {agent.task_id.slice(0, 8)}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>Iterations: {agent.iteration_count}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <span>Tokens: {formatTokens(agent.tokens)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                  <span>Cost: {formatCost(agent.cost)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span>PID: {agent.process_id || 'N/A'}</span>
                </div>
              </div>
              <div className="mt-4 text-sm">
                <div className="text-muted-foreground">Branch: {agent.branch}</div>
                <div className="text-muted-foreground text-xs truncate">
                  Worktree: {agent.worktree_path}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
