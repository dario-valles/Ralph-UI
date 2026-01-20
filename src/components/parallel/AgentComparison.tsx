// Agent comparison dashboard for parallel execution

import { Card } from '../ui/card'
import { Badge } from '../ui/badge'
import { getStatusColor } from '@/lib/agent-api'
import type { Agent } from '../../types'

interface AgentComparisonProps {
  agents: Agent[]
}

export function AgentComparison({ agents }: AgentComparisonProps) {
  if (agents.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-muted-foreground text-center">
          No agents running
        </p>
      </Card>
    )
  }

  const totalTokens = agents.reduce((sum, agent) => sum + agent.tokens, 0)
  const totalCost = agents.reduce((sum, agent) => sum + agent.cost, 0)
  const avgIterations =
    agents.reduce((sum, agent) => sum + agent.iterationCount, 0) / agents.length

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Active Agents</div>
          <div className="text-2xl font-bold">{agents.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Tokens</div>
          <div className="text-2xl font-bold">{totalTokens.toLocaleString()}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Total Cost</div>
          <div className="text-2xl font-bold">${totalCost.toFixed(2)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-sm text-muted-foreground">Avg Iterations</div>
          <div className="text-2xl font-bold">{avgIterations.toFixed(1)}</div>
        </Card>
      </div>

      {/* Agent Comparison Table */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Agent Details</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b">
              <tr className="text-left">
                <th className="pb-2 pr-4">Agent ID</th>
                <th className="pb-2 pr-4">Task</th>
                <th className="pb-2 pr-4">Status</th>
                <th className="pb-2 pr-4">Branch</th>
                <th className="pb-2 pr-4 text-right">Iterations</th>
                <th className="pb-2 pr-4 text-right">Tokens</th>
                <th className="pb-2 pr-4 text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <code className="text-sm">{agent.id.substring(0, 8)}</code>
                  </td>
                  <td className="py-3 pr-4">
                    <code className="text-sm">{agent.taskId}</code>
                  </td>
                  <td className="py-3 pr-4">
                    <Badge
                      className={`${getStatusColor(agent.status)} text-white`}
                    >
                      {agent.status}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4">
                    <code className="text-sm">{agent.branch}</code>
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {agent.iterationCount}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {agent.tokens.toLocaleString()}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    ${agent.cost.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Performance Comparison */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-4">Performance Comparison</h3>
        <div className="space-y-2">
          {agents.map((agent) => {
            const efficiency =
              agent.tokens > 0 ? (agent.cost / agent.tokens) * 1000 : 0

            return (
              <div key={agent.id} className="flex items-center gap-4">
                <div className="w-32">
                  <code className="text-sm">{agent.id.substring(0, 8)}</code>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-blue-500 h-full transition-all"
                        style={{
                          width: `${Math.min((agent.iterationCount / 10) * 100, 100)}%`,
                        }}
                      />
                    </div>
                    <div className="text-sm text-muted-foreground w-16 text-right">
                      {agent.iterationCount} iter
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Efficiency: ${efficiency.toFixed(4)}/1K tokens
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
