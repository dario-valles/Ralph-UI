/**
 * Ultra Research Progress View
 *
 * Displays the progress of an active ultra research session including:
 * - Overall progress bar and phase
 * - Per-agent status cards with streaming output
 * - Discussion timeline (if applicable)
 * - Final synthesis preview
 */
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Microscope,
  Bot,
  Check,
  Loader2,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  FileText,
  X,
} from 'lucide-react'
import { usePRDChatStore } from '@/stores/prdChatStore'
import type { ResearchAgentStatus, ResearchSessionStatus } from '@/types'

const STATUS_CONFIG: Record<
  ResearchSessionStatus,
  { color: string; bgColor: string; icon: React.ReactNode }
> = {
  planning: {
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    icon: <Loader2 className="h-4 w-4 animate-spin" />,
  },
  researching: {
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-950/30',
    icon: <Microscope className="h-4 w-4" />,
  },
  discussing: {
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    icon: <MessageSquare className="h-4 w-4" />,
  },
  synthesizing: {
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-950/30',
    icon: <FileText className="h-4 w-4" />,
  },
  complete: {
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    icon: <Check className="h-4 w-4" />,
  },
  error: {
    color: 'text-red-600',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    icon: <AlertCircle className="h-4 w-4" />,
  },
  cancelled: {
    color: 'text-gray-600',
    bgColor: 'bg-gray-50 dark:bg-gray-950/30',
    icon: <X className="h-4 w-4" />,
  },
}

const AGENT_STATUS_ICONS: { [K in ResearchAgentStatus]: React.ReactNode } = {
  idle: <Bot className="h-4 w-4 text-muted-foreground" />,
  researching: <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />,
  discussing: <MessageSquare className="h-4 w-4 text-purple-500" />,
  complete: <Check className="h-4 w-4 text-green-500" />,
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
}

export function UltraResearchProgress() {
  const {
    activeResearchSession,
    researchProgress,
    agentStreamingContent,
    researchError,
    cancelUltraResearch,
    clearResearchState,
  } = usePRDChatStore()

  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set())

  if (!activeResearchSession || !researchProgress) {
    return null
  }

  const statusConfig = STATUS_CONFIG[researchProgress.status]
  const isTerminal = ['complete', 'error', 'cancelled'].includes(researchProgress.status)

  const toggleAgentExpanded = (agentId: string) => {
    setExpandedAgents((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) {
        next.delete(agentId)
      } else {
        next.add(agentId)
      }
      return next
    })
  }

  const handleDismiss = () => {
    clearResearchState()
  }

  return (
    <Card className={`border-2 ${statusConfig.bgColor}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={statusConfig.color}>{statusConfig.icon}</div>
            <CardTitle className="text-sm font-medium">
              Ultra Research: {researchProgress.status === 'complete' ? 'Complete' : 'In Progress'}
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {!isTerminal && (
              <Button
                variant="outline"
                size="sm"
                onClick={cancelUltraResearch}
                className="h-7 text-xs"
              >
                Cancel
              </Button>
            )}
            {isTerminal && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDismiss}
                className="h-7 text-xs"
              >
                Dismiss
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Overall Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{researchProgress.currentPhase}</span>
            <span className="font-medium">{researchProgress.overallProgress}%</span>
          </div>
          <Progress value={researchProgress.overallProgress} className="h-2" />
        </div>

        {/* Error Message */}
        {researchError && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Error</span>
            </div>
            <p className="text-sm text-red-600 mt-1">{researchError}</p>
          </div>
        )}

        {/* Agent Status Grid */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Agents ({researchProgress.agentsCompleted}/{researchProgress.totalAgents})
            </span>
            {researchProgress.currentRound !== undefined && (
              <Badge variant="outline" className="text-xs">
                Round {researchProgress.currentRound}/{researchProgress.totalRounds}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {activeResearchSession.config.agents.map((agent) => {
              const agentStatus = researchProgress.agentStatuses[agent.id] || 'idle'
              const streamContent = agentStreamingContent[agent.id]
              const isExpanded = expandedAgents.has(agent.id)

              return (
                <Collapsible key={agent.id} open={isExpanded}>
                  <Card className="p-2">
                    <CollapsibleTrigger
                      className="w-full"
                      onClick={() => toggleAgentExpanded(agent.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {AGENT_STATUS_ICONS[agentStatus]}
                          <div className="text-left">
                            <p className="text-xs font-medium">{agent.name}</p>
                            {agent.angle && (
                              <p className="text-[10px] text-muted-foreground truncate max-w-[100px]">
                                {agent.angle}
                              </p>
                            )}
                          </div>
                        </div>
                        {streamContent && (
                          isExpanded ? (
                            <ChevronDown className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          )
                        )}
                      </div>
                    </CollapsibleTrigger>

                    {streamContent && (
                      <CollapsibleContent>
                        <ScrollArea className="h-24 mt-2 rounded border p-2">
                          <pre className="text-[10px] whitespace-pre-wrap font-mono text-muted-foreground">
                            {streamContent.slice(-500)}
                          </pre>
                        </ScrollArea>
                      </CollapsibleContent>
                    )}
                  </Card>
                </Collapsible>
              )
            })}
          </div>
        </div>

        {/* Synthesized PRD Preview */}
        {activeResearchSession.synthesizedPrd && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-green-600" />
              <span className="text-xs font-medium">Synthesized PRD</span>
            </div>
            <ScrollArea className="h-32 rounded border p-3 bg-background">
              <pre className="text-xs whitespace-pre-wrap font-mono">
                {activeResearchSession.synthesizedPrd.slice(0, 1000)}
                {activeResearchSession.synthesizedPrd.length > 1000 && '...'}
              </pre>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
