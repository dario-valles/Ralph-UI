import { useState, memo } from 'react'
import { Loader2, CheckCircle, XCircle, ChevronDown, FileText, Edit, Terminal, Search, Globe } from 'lucide-react'
import type { ToolCall } from '@/types'
import { cn } from '@/lib/utils'

interface ToolActivityCardProps {
  toolCall: ToolCall
  className?: string
}

/** Render a tool icon based on tool name - memoized to prevent recreations */
const ToolIcon = memo(function ToolIcon({ toolName }: { toolName: string }) {
  const name = toolName.toLowerCase()
  const iconClass = "h-4 w-4 shrink-0 text-muted-foreground"

  if (name.includes('read')) return <FileText className={iconClass} />
  if (name.includes('write') || name.includes('edit')) return <Edit className={iconClass} />
  if (name.includes('bash') || name.includes('terminal')) return <Terminal className={iconClass} />
  if (name.includes('search') || name.includes('grep') || name.includes('glob')) return <Search className={iconClass} />
  if (name.includes('web') || name.includes('fetch')) return <Globe className={iconClass} />
  return <Terminal className={iconClass} /> // Default icon
})

/** Format tool name for display */
function formatToolName(toolName: string): string {
  // Common tool name transformations
  const nameMap: Record<string, string> = {
    read: 'Read',
    write: 'Write',
    edit: 'Edit',
    bash: 'Bash',
    grep: 'Grep',
    glob: 'Glob',
    webfetch: 'WebFetch',
    websearch: 'WebSearch',
    ls: 'LS',
  }
  const lower = toolName.toLowerCase()
  return nameMap[lower] || toolName
}

/** Format duration in a human-readable way */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const secs = Math.floor(ms / 1000)
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60)
  const remainingSecs = secs % 60
  return `${mins}m ${remainingSecs}s`
}

/**
 * ToolActivityCard displays a single tool call with expandable details.
 * Shows tool name, status indicator, and collapsible input/output sections.
 */
export function ToolActivityCard({ toolCall, className }: ToolActivityCardProps) {
  const [expanded, setExpanded] = useState(false)

  const hasInput = toolCall.input !== undefined
  const hasOutput = toolCall.output !== undefined && toolCall.output.length > 0
  const isExpandable = hasInput || hasOutput

  return (
    <div
      className={cn(
        'border rounded-lg my-2 bg-muted/30 overflow-hidden transition-colors',
        toolCall.status === 'running' && 'border-primary/30 bg-primary/5',
        toolCall.status === 'failed' && 'border-destructive/30 bg-destructive/5',
        className
      )}
    >
      <button
        onClick={() => isExpandable && setExpanded(!expanded)}
        disabled={!isExpandable}
        className={cn(
          'w-full p-2 sm:p-3 flex items-center gap-2 text-left',
          isExpandable && 'hover:bg-muted/50 cursor-pointer',
          !isExpandable && 'cursor-default'
        )}
      >
        {/* Status indicator */}
        {toolCall.status === 'running' ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
        ) : toolCall.status === 'failed' ? (
          <XCircle className="h-4 w-4 shrink-0 text-destructive" />
        ) : (
          <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
        )}

        {/* Tool icon and name */}
        <ToolIcon toolName={toolCall.toolName} />
        <span className="text-sm font-medium">
          Using {formatToolName(toolCall.toolName)}
        </span>

        {/* Duration badge */}
        {toolCall.durationMs != null && (
          <span className="text-xs text-muted-foreground ml-auto mr-2">
            {formatDuration(toolCall.durationMs)}
          </span>
        )}

        {/* Expand indicator */}
        {isExpandable && (
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-180'
            )}
          />
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border/50">
          {hasInput && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-1">Input</p>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32 overflow-y-auto">
                {typeof toolCall.input === 'string'
                  ? toolCall.input
                  : JSON.stringify(toolCall.input, null, 2)}
              </pre>
            </div>
          )}
          {hasOutput && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Result</p>
              <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
                {toolCall.output}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface ToolActivityListProps {
  toolCalls: ToolCall[]
  className?: string
}

/**
 * ToolActivityList displays a list of tool calls for an agent.
 * Useful for showing all tool activity in a streaming indicator.
 */
export function ToolActivityList({ toolCalls, className }: ToolActivityListProps) {
  if (toolCalls.length === 0) return null

  return (
    <div className={cn('space-y-1', className)}>
      {toolCalls.map((toolCall) => (
        <ToolActivityCard key={toolCall.id} toolCall={toolCall} />
      ))}
    </div>
  )
}
