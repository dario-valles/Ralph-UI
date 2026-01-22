// Tool Call Panel - Collapsible display of tool calls for an agent
// Shows structured, expandable view of tool calls with input/output

import { useState, useEffect, useRef } from 'react'
import { listen } from '@tauri-apps/api/event'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  CheckCircle2,
  XCircle,
  Wrench,
  FileText,
  Code,
  Search,
  FolderOpen,
  Terminal,
  Globe,
  Edit3,
  Trash2,
  Copy,
} from 'lucide-react'
import { useToolCallStore } from '@/stores/toolCallStore'
import type { ToolCall, ToolCallStartedPayload, ToolCallCompletedPayload } from '@/types'
import { cn } from '@/lib/utils'

interface ToolCallPanelProps {
  agentId: string
  className?: string
}

// Map tool names to icons
const toolIcons: Record<string, React.ReactNode> = {
  Read: <FileText className="h-3.5 w-3.5" />,
  Write: <Edit3 className="h-3.5 w-3.5" />,
  Edit: <Edit3 className="h-3.5 w-3.5" />,
  Bash: <Terminal className="h-3.5 w-3.5" />,
  Grep: <Search className="h-3.5 w-3.5" />,
  Glob: <FolderOpen className="h-3.5 w-3.5" />,
  Task: <Code className="h-3.5 w-3.5" />,
  WebFetch: <Globe className="h-3.5 w-3.5" />,
  WebSearch: <Globe className="h-3.5 w-3.5" />,
  TodoWrite: <CheckCircle2 className="h-3.5 w-3.5" />,
  NotebookEdit: <Edit3 className="h-3.5 w-3.5" />,
}

function getToolIcon(toolName: string): React.ReactNode {
  return toolIcons[toolName] || <Wrench className="h-3.5 w-3.5" />
}

// Format duration in a human-readable way
function formatDuration(ms?: number): string {
  if (ms === undefined) return ''
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

// Truncate long strings for display
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 3) + '...'
}

// Format JSON for display with syntax highlighting colors (via ANSI-like classes)
function formatInput(input: unknown): string {
  if (input === undefined || input === null) return ''
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}

// Get a summary of the input for collapsed view
function getInputSummary(toolName: string, input: unknown): string {
  if (!input || typeof input !== 'object') return ''

  const obj = input as Record<string, unknown>

  // Tool-specific summaries
  switch (toolName) {
    case 'Read':
      return obj.file_path ? truncate(String(obj.file_path), 50) : ''
    case 'Write':
      return obj.file_path ? truncate(String(obj.file_path), 50) : ''
    case 'Edit':
      return obj.file_path ? truncate(String(obj.file_path), 50) : ''
    case 'Bash':
      return obj.command ? truncate(String(obj.command), 50) : ''
    case 'Grep':
      return obj.pattern ? truncate(String(obj.pattern), 40) : ''
    case 'Glob':
      return obj.pattern ? truncate(String(obj.pattern), 40) : ''
    case 'Task':
      return obj.description ? truncate(String(obj.description), 50) : ''
    case 'WebFetch':
      return obj.url ? truncate(String(obj.url), 50) : ''
    case 'WebSearch':
      return obj.query ? truncate(String(obj.query), 50) : ''
    default:
      return ''
  }
}

interface ToolCallItemProps {
  toolCall: ToolCall
}

function ToolCallItem({ toolCall }: ToolCallItemProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const isRunning = toolCall.status === 'running'
  const isFailed = toolCall.status === 'failed'

  const inputSummary = getInputSummary(toolCall.toolName, toolCall.input)
  const hasInput = toolCall.input !== undefined
  const hasOutput = toolCall.output !== undefined && toolCall.output.length > 0

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <button
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
            'hover:bg-zinc-800/50 rounded-md',
            isRunning && 'bg-blue-500/10',
            isFailed && 'bg-red-500/10'
          )}
        >
          {/* Expand/Collapse indicator */}
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          )}

          {/* Tool icon */}
          <span className="text-muted-foreground flex-shrink-0">{getToolIcon(toolCall.toolName)}</span>

          {/* Tool name */}
          <span className="font-medium text-sm flex-shrink-0">{toolCall.toolName}</span>

          {/* Input summary */}
          {inputSummary && (
            <span className="text-xs text-muted-foreground truncate flex-1 font-mono">
              {inputSummary}
            </span>
          )}

          {/* Status indicator */}
          <span className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {toolCall.durationMs !== undefined && (
              <span className="text-xs text-muted-foreground">{formatDuration(toolCall.durationMs)}</span>
            )}
            {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />}
            {toolCall.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />}
            {isFailed && <XCircle className="h-3.5 w-3.5 text-red-500" />}
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pl-9 pr-3 pb-3 space-y-2">
          {/* Input section */}
          {hasInput && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Input</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(formatInput(toolCall.input))
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <pre className="text-xs bg-zinc-900/50 p-2 rounded overflow-x-auto max-h-40 font-mono">
                {formatInput(toolCall.input)}
              </pre>
            </div>
          )}

          {/* Output section */}
          {hasOutput && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {isFailed ? 'Error' : 'Output'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    navigator.clipboard.writeText(toolCall.output || '')
                  }}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <pre
                className={cn(
                  'text-xs p-2 rounded overflow-x-auto max-h-60 font-mono whitespace-pre-wrap',
                  isFailed ? 'bg-red-500/10 text-red-400' : 'bg-zinc-900/50'
                )}
              >
                {toolCall.output}
              </pre>
            </div>
          )}

          {/* Timestamps */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Started: {new Date(toolCall.startedAt).toLocaleTimeString()}</span>
            {toolCall.completedAt && (
              <span>Completed: {new Date(toolCall.completedAt).toLocaleTimeString()}</span>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function ToolCallPanel({ agentId, className }: ToolCallPanelProps): React.JSX.Element {
  const { toolCalls, addToolCall, completeToolCall, clearToolCalls } = useToolCallStore()
  const agentToolCalls = toolCalls.get(agentId) || []
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAutoScrollRef = useRef(true)
  const prevLengthRef = useRef(0)

  // Set up event listeners on mount
  useEffect(() => {
    let unlistenStart: (() => void) | undefined
    let unlistenComplete: (() => void) | undefined

    const setup = async () => {
      // Listen for tool call started events
      unlistenStart = await listen<ToolCallStartedPayload>('tool:started', (event) => {
        if (event.payload.agentId === agentId) {
          addToolCall(event.payload)
        }
      })

      // Listen for tool call completed events
      unlistenComplete = await listen<ToolCallCompletedPayload>('tool:completed', (event) => {
        if (event.payload.agentId === agentId) {
          completeToolCall(event.payload)
        }
      })
    }

    setup()

    return () => {
      unlistenStart?.()
      unlistenComplete?.()
    }
  }, [agentId, addToolCall, completeToolCall])

  // Auto-scroll to latest tool call when new ones appear
  useEffect(() => {
    if (agentToolCalls.length > prevLengthRef.current && isAutoScrollRef.current) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
    prevLengthRef.current = agentToolCalls.length
  }, [agentToolCalls.length])

  // Detect if user has scrolled away from top
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement
    isAutoScrollRef.current = target.scrollTop < 50
  }

  const runningCount = agentToolCalls.filter((tc) => tc.status === 'running').length
  const completedCount = agentToolCalls.filter((tc) => tc.status === 'completed').length
  const failedCount = agentToolCalls.filter((tc) => tc.status === 'failed').length

  return (
    <div className={cn('flex flex-col h-full bg-zinc-950', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Tool Calls</span>
          <div className="flex items-center gap-1.5 ml-2">
            {runningCount > 0 && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                {runningCount}
              </Badge>
            )}
            {completedCount > 0 && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 text-green-500 border-green-500/30">
                {completedCount}
              </Badge>
            )}
            {failedCount > 0 && (
              <Badge variant="outline" className="text-xs px-1.5 py-0 h-5 text-red-500 border-red-500/30">
                {failedCount}
              </Badge>
            )}
          </div>
        </div>
        {agentToolCalls.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearToolCalls(agentId)}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Tool call list */}
      <ScrollArea className="flex-1" onScrollCapture={handleScroll} ref={scrollRef}>
        <div className="p-2 space-y-1">
          {agentToolCalls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Wrench className="h-10 w-10 text-zinc-700 mb-3" />
              <p className="text-sm text-zinc-500">No tool calls yet</p>
              <p className="text-xs text-zinc-600 mt-1">Tool calls will appear here as the agent works</p>
            </div>
          ) : (
            agentToolCalls.map((toolCall, index) => (
              <ToolCallItem key={`${toolCall.id}-${index}`} toolCall={toolCall} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
