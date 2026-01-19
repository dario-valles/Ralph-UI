import { useEffect, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { LogEntry, getLogLevelColor } from '@/lib/agent-api'
import { Terminal } from 'lucide-react'

interface AgentLogViewerProps {
  logs: LogEntry[]
  agentId?: string
}

export function AgentLogViewer({ logs, agentId }: AgentLogViewerProps) {
  const logsEndRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const wasNearBottomRef = useRef(true)

  // Track if user is near bottom before logs update
  const checkIfNearBottom = () => {
    const container = scrollContainerRef.current
    if (!container) return true
    const threshold = 50 // pixels from bottom
    return container.scrollHeight - container.scrollTop - container.clientHeight < threshold
  }

  // Auto-scroll to bottom only if user was already near bottom
  useEffect(() => {
    if (wasNearBottomRef.current) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  // Update near-bottom status on scroll
  const handleScroll = () => {
    wasNearBottomRef.current = checkIfNearBottom()
  }

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Terminal className="h-5 w-5" />
          <CardTitle>Agent Logs</CardTitle>
        </div>
        <CardDescription>
          {agentId ? `Agent ${agentId.slice(0, 8)} - ${logs.length} log entries` : 'Select an agent to view logs'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <p>No logs available</p>
          </div>
        ) : (
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="h-[300px] overflow-y-auto bg-gray-900 rounded-md p-4 font-mono text-sm"
          >
            <div className="space-y-1">
              {logs.map((log, index) => (
                <div key={index} className="flex gap-3 text-gray-200">
                  <span className="text-gray-500 flex-shrink-0">{formatTimestamp(log.timestamp)}</span>
                  <Badge
                    variant="outline"
                    className={`flex-shrink-0 ${getLogLevelColor(log.level)} border-none`}
                  >
                    {log.level.toUpperCase()}
                  </Badge>
                  <span className="flex-1 break-words">{log.message}</span>
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
