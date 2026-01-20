// Focused Agent Logs - Tabbed view per agent with filtering
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Terminal,
  Search,
  Filter,
  X,
  ChevronDown,
  AlertCircle,
  AlertTriangle,
  Info,
  Bug,
  Download,
  SquareTerminal,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { LogEntry, getLogLevelColor, agentHasPty } from '@/lib/agent-api'
import { useTerminalStore } from '@/stores/terminalStore'
import type { Agent } from '@/types'

interface FocusedAgentLogsProps {
  agents: Agent[]
  activeAgentId: string | null
  onAgentSelect: (agentId: string) => void
  getLogs: (agentId: string) => LogEntry[]
}

type LogLevel = 'info' | 'warn' | 'error' | 'debug'

const LOG_LEVEL_ICONS: Record<LogLevel, React.ReactNode> = {
  info: <Info className="h-3 w-3" />,
  warn: <AlertTriangle className="h-3 w-3" />,
  error: <AlertCircle className="h-3 w-3" />,
  debug: <Bug className="h-3 w-3" />,
}

export function FocusedAgentLogs({
  agents,
  activeAgentId,
  onAgentSelect,
  getLogs,
}: FocusedAgentLogsProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [enabledLevels, setEnabledLevels] = useState<Set<LogLevel>>(
    new Set(['info', 'warn', 'error', 'debug'])
  )
  const [hasPty, setHasPty] = useState(false)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const wasNearBottomRef = useRef(true)
  const { createAgentTerminal } = useTerminalStore()

  // Check if the active agent has a PTY
  useEffect(() => {
    let cancelled = false

    const checkPty = async () => {
      if (!activeAgentId) {
        if (!cancelled) setHasPty(false)
        return
      }
      try {
        const result = await agentHasPty(activeAgentId)
        if (!cancelled) setHasPty(result)
      } catch {
        if (!cancelled) setHasPty(false)
      }
    }

    checkPty()

    return () => {
      cancelled = true
    }
  }, [activeAgentId])

  // Handle opening the agent terminal
  const handleOpenTerminal = useCallback(() => {
    if (!activeAgentId) return
    const agent = agents.find((a) => a.id === activeAgentId)
    if (!agent) return
    const title = agent.taskId
      ? `Agent: ${agent.taskId.slice(0, 8)}`
      : `Agent ${agent.id.slice(0, 8)}`
    createAgentTerminal(activeAgentId, title, agent.worktreePath)
  }, [activeAgentId, agents, createAgentTerminal])

  // Get active agents (not idle)
  const activeAgents = useMemo(() => {
    return agents.filter((a) => a.status !== 'idle')
  }, [agents])

  // Get logs for the selected agent
  const logs = useMemo(() => {
    if (!activeAgentId) return []
    return getLogs(activeAgentId)
  }, [activeAgentId, getLogs])

  // Filter logs based on search query and log levels
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Filter by log level
      if (!enabledLevels.has(log.level as LogLevel)) {
        return false
      }
      // Filter by search query
      if (searchQuery && !log.message.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false
      }
      return true
    })
  }, [logs, searchQuery, enabledLevels])

  // Count logs by level for badges
  const logCounts = useMemo(() => {
    const counts: Record<LogLevel, number> = { info: 0, warn: 0, error: 0, debug: 0 }
    logs.forEach((log) => {
      const level = log.level as LogLevel
      if (counts[level] !== undefined) {
        counts[level]++
      }
    })
    return counts
  }, [logs])

  // Auto-scroll management
  const checkIfNearBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return true
    const threshold = 50
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
  }, [])

  useEffect(() => {
    if (wasNearBottomRef.current) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [filteredLogs])

  const handleScroll = () => {
    wasNearBottomRef.current = checkIfNearBottom()
  }

  // Toggle log level filter
  const toggleLevel = (level: LogLevel) => {
    setEnabledLevels((prev) => {
      const next = new Set(prev)
      if (next.has(level)) {
        next.delete(level)
      } else {
        next.add(level)
      }
      return next
    })
  }

  // Download logs as JSON
  const handleDownloadLogs = () => {
    if (!activeAgentId || filteredLogs.length === 0) return

    const dataStr = JSON.stringify(filteredLogs, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `agent-${activeAgentId.slice(0, 8)}-logs.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    })
  }

  const selectedAgent = agents.find((a) => a.id === activeAgentId)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            <CardTitle>Agent Logs</CardTitle>
            {filteredLogs.length > 0 && (
              <Badge variant="secondary" className="ml-2">
                {filteredLogs.length} entries
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Log level filter */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Filter className="h-4 w-4 mr-1" />
                  Filter
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {(['error', 'warn', 'info', 'debug'] as LogLevel[]).map((level) => (
                  <DropdownMenuCheckboxItem
                    key={level}
                    checked={enabledLevels.has(level)}
                    onCheckedChange={() => toggleLevel(level)}
                  >
                    <span className="flex items-center gap-2">
                      {LOG_LEVEL_ICONS[level]}
                      <span className="capitalize">{level}</span>
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {logCounts[level]}
                      </Badge>
                    </span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Open Terminal button - only show if agent has PTY and is not idle */}
            {hasPty && selectedAgent?.status !== 'idle' && (
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleOpenTerminal}
                title="Open interactive terminal for this agent"
              >
                <SquareTerminal className="h-4 w-4 mr-1" />
                Terminal
              </Button>
            )}

            {/* Download button */}
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={handleDownloadLogs}
              disabled={filteredLogs.length === 0}
            >
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Agent Tabs */}
        {activeAgents.length > 0 && (
          <div className="flex gap-1 mt-3 overflow-x-auto pb-1">
            {activeAgents.map((agent) => (
              <Button
                key={agent.id}
                variant={activeAgentId === agent.id ? 'default' : 'outline'}
                size="sm"
                className="flex-shrink-0 h-7 text-xs"
                onClick={() => onAgentSelect(agent.id)}
              >
                <span className="max-w-[120px] truncate">
                  {agent.taskId ? `Task: ${agent.taskId.slice(0, 8)}` : `Agent ${agent.id.slice(0, 8)}`}
                </span>
                <Badge
                  variant="secondary"
                  className={`ml-2 text-xs ${
                    agent.status === 'implementing'
                      ? 'bg-blue-100 text-blue-700'
                      : agent.status === 'testing'
                        ? 'bg-yellow-100 text-yellow-700'
                        : agent.status === 'committing'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {agent.status}
                </Badge>
              </Button>
            ))}
          </div>
        )}

        {/* Search input */}
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-8"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {!activeAgentId ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <Terminal className="h-12 w-12 mb-4 opacity-50" />
            <p>Select an agent to view logs</p>
            {activeAgents.length === 0 && agents.length > 0 && (
              <p className="text-sm mt-1">No agents are currently active</p>
            )}
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            {logs.length === 0 ? (
              <>
                <Terminal className="h-12 w-12 mb-4 opacity-50" />
                <p>No logs available for this agent</p>
              </>
            ) : (
              <>
                <Search className="h-12 w-12 mb-4 opacity-50" />
                <p>No logs match your filters</p>
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('')
                    setEnabledLevels(new Set(['info', 'warn', 'error', 'debug']))
                  }}
                >
                  Clear filters
                </Button>
              </>
            )}
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="h-[350px] overflow-y-auto bg-gray-900 rounded-md p-4 font-mono text-xs"
          >
            <div className="space-y-0.5">
              {filteredLogs.map((log, index) => (
                <div
                  key={index}
                  className={`flex gap-2 py-0.5 px-1 rounded hover:bg-gray-800/50 ${
                    log.level === 'error'
                      ? 'text-red-300'
                      : log.level === 'warn'
                        ? 'text-yellow-300'
                        : log.level === 'debug'
                          ? 'text-gray-400'
                          : 'text-gray-200'
                  }`}
                >
                  <span className="text-gray-500 flex-shrink-0 tabular-nums">
                    {formatTimestamp(log.timestamp)}
                  </span>
                  <Badge
                    variant="outline"
                    className={`flex-shrink-0 h-5 px-1.5 text-[10px] ${getLogLevelColor(log.level)} border-none`}
                  >
                    {log.level.substring(0, 3).toUpperCase()}
                  </Badge>
                  <span className="flex-1 break-words whitespace-pre-wrap">{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}

        {/* Quick stats footer */}
        {selectedAgent && logs.length > 0 && (
          <div className="flex items-center justify-between mt-3 pt-3 border-t text-xs text-muted-foreground">
            <div className="flex gap-4">
              <span>
                <span className="text-red-500 font-medium">{logCounts.error}</span> errors
              </span>
              <span>
                <span className="text-yellow-500 font-medium">{logCounts.warn}</span> warnings
              </span>
              <span>
                <span className="text-blue-500 font-medium">{logCounts.info}</span> info
              </span>
            </div>
            <div>
              Agent: {selectedAgent.id.slice(0, 8)} | Status: {selectedAgent.status}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
