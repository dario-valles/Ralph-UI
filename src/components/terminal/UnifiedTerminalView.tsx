// Unified Terminal View - Merges terminal output and tool calls into a single stream
// Tool calls appear as collapsible sections inline within the terminal output

import { useState, useEffect, useRef, useCallback } from 'react'
import { subscribeEvent } from '@/lib/events-client'
import Ansi from 'ansi-to-react'
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
  Copy,
  Trash2,
} from 'lucide-react'
import { getAgentPtyHistory } from '@/lib/agent-api'
import { decodeTerminalData } from '@/lib/terminal-api'
import type { ToolCall, ToolCallStartedPayload, ToolCallCompletedPayload } from '@/types'
import { cn } from '@/lib/utils'

interface UnifiedTerminalViewProps {
  agentId: string
  className?: string
}

// Stream item types for chronological ordering
type StreamItem =
  | { type: 'text'; content: string; timestamp: number; id: string }
  | { type: 'tool_call'; toolCall: ToolCall; timestamp: number; id: string }

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

// Format JSON for display
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

// Tool call item component (inline within stream)
interface InlineToolCallItemProps {
  toolCall: ToolCall
}

function InlineToolCallItem({ toolCall }: InlineToolCallItemProps): React.JSX.Element {
  const [isOpen, setIsOpen] = useState(false)
  const isRunning = toolCall.status === 'running'
  const isFailed = toolCall.status === 'failed'

  const inputSummary = getInputSummary(toolCall.toolName, toolCall.input)
  const hasInput = toolCall.input !== undefined
  const hasOutput = toolCall.output !== undefined && toolCall.output.length > 0

  return (
    <div className="my-1">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              'w-full flex items-center gap-2 px-3 py-2 text-left transition-colors',
              'hover:bg-zinc-800/50 rounded-md border border-zinc-800',
              isRunning && 'bg-blue-500/10 border-blue-500/30',
              isFailed && 'bg-red-500/10 border-red-500/30',
              !isRunning && !isFailed && 'bg-zinc-900/50'
            )}
          >
            {/* Expand/Collapse indicator */}
            {isOpen ? (
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-zinc-500 flex-shrink-0" />
            )}

            {/* Tool icon */}
            <span className="text-zinc-400 flex-shrink-0">{getToolIcon(toolCall.toolName)}</span>

            {/* Tool name */}
            <span className="font-medium text-sm flex-shrink-0 text-zinc-100">
              {toolCall.toolName}
            </span>

            {/* Input summary */}
            {inputSummary && (
              <span className="text-xs text-zinc-400 truncate flex-1 font-mono">
                {inputSummary}
              </span>
            )}

            {/* Status indicator */}
            <span className="flex items-center gap-2 flex-shrink-0 ml-auto">
              {toolCall.durationMs !== undefined && (
                <span className="text-xs text-zinc-400">{formatDuration(toolCall.durationMs)}</span>
              )}
              {isRunning && <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />}
              {toolCall.status === 'completed' && (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
              )}
              {isFailed && <XCircle className="h-3.5 w-3.5 text-red-400" />}
            </span>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="pl-9 pr-3 pb-3 pt-2 space-y-2 bg-zinc-900/30 rounded-b-md border-x border-b border-zinc-800 -mt-1">
            {/* Input section */}
            {hasInput && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">Input</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-300"
                    onClick={(e) => {
                      e.stopPropagation()
                      navigator.clipboard.writeText(formatInput(toolCall.input))
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
                <pre className="text-xs bg-zinc-900 p-2 rounded overflow-x-auto max-h-40 font-mono text-zinc-200 border border-zinc-800">
                  {formatInput(toolCall.input)}
                </pre>
              </div>
            )}

            {/* Output section */}
            {hasOutput && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">
                    {isFailed ? 'Error' : 'Output'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-zinc-500 hover:text-zinc-300"
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
                    'text-xs p-2 rounded overflow-x-auto max-h-60 font-mono whitespace-pre-wrap border',
                    isFailed
                      ? 'bg-red-950/50 text-red-300 border-red-900/50'
                      : 'bg-zinc-900 text-zinc-200 border-zinc-800'
                  )}
                >
                  {toolCall.output}
                </pre>
              </div>
            )}

            {/* Timestamps */}
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <span>Started: {new Date(toolCall.startedAt).toLocaleTimeString()}</span>
              {toolCall.completedAt && (
                <span>Completed: {new Date(toolCall.completedAt).toLocaleTimeString()}</span>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

// Terminal text block component with ANSI parsing
interface TerminalTextBlockProps {
  content: string
}

function TerminalTextBlock({ content }: TerminalTextBlockProps): React.JSX.Element {
  // Skip rendering empty content
  if (!content.trim()) return <></>

  return (
    <div className="font-mono text-sm text-zinc-200 whitespace-pre-wrap break-all leading-relaxed px-2">
      <Ansi>{content}</Ansi>
    </div>
  )
}

export function UnifiedTerminalView({
  agentId,
  className,
}: UnifiedTerminalViewProps): React.JSX.Element {
  const [streamItems, setStreamItems] = useState<StreamItem[]>([])
  const [toolCalls, setToolCalls] = useState<Map<string, ToolCall>>(new Map())
  const scrollRef = useRef<HTMLDivElement>(null)
  const isAutoScrollRef = useRef(true)
  const textBufferRef = useRef<string>('')
  const lastFlushRef = useRef<number>(0)
  const textIdCounterRef = useRef(0)

  // Generate unique ID for text blocks
  const getTextId = useCallback(() => {
    textIdCounterRef.current += 1
    return `text-${textIdCounterRef.current}`
  }, [])

  // Flush text buffer to stream
  const flushTextBuffer = useCallback(() => {
    if (textBufferRef.current.length > 0) {
      const content = textBufferRef.current
      textBufferRef.current = ''
      setStreamItems((prev) => [
        ...prev,
        {
          type: 'text',
          content,
          timestamp: Date.now(),
          id: getTextId(),
        },
      ])
    }
    lastFlushRef.current = Date.now()
  }, [getTextId])

  // Add text to buffer and flush periodically
  const addTextToStream = useCallback(
    (text: string) => {
      textBufferRef.current += text

      // Flush if buffer is large or enough time has passed
      const now = Date.now()
      if (textBufferRef.current.length > 500 || now - lastFlushRef.current > 100) {
        flushTextBuffer()
      }
    },
    [flushTextBuffer]
  )

  // Handle tool call start
  const handleToolStart = useCallback(
    (payload: ToolCallStartedPayload) => {
      // Flush any pending text before tool call
      flushTextBuffer()

      const toolCall: ToolCall = {
        id: payload.toolId,
        agentId: payload.agentId,
        toolName: payload.toolName,
        input: payload.input,
        startedAt: payload.timestamp,
        status: 'running',
      }

      setToolCalls((prev) => {
        const newMap = new Map(prev)
        newMap.set(payload.toolId, toolCall)
        return newMap
      })

      setStreamItems((prev) => [
        ...prev,
        {
          type: 'tool_call',
          toolCall,
          timestamp: Date.now(),
          id: payload.toolId,
        },
      ])
    },
    [flushTextBuffer]
  )

  // Handle tool call completion
  const handleToolComplete = useCallback((payload: ToolCallCompletedPayload) => {
    setToolCalls((prev) => {
      const newMap = new Map(prev)
      const existing = newMap.get(payload.toolId)
      if (existing) {
        const startTime = new Date(existing.startedAt).getTime()
        const endTime = new Date(payload.timestamp).getTime()
        const durationMs = payload.durationMs ?? endTime - startTime

        const updated: ToolCall = {
          ...existing,
          output: payload.output,
          completedAt: payload.timestamp,
          durationMs,
          status: payload.isError ? 'failed' : 'completed',
        }
        newMap.set(payload.toolId, updated)

        // Also update the stream item
        setStreamItems((prev) =>
          prev.map((item) => {
            if (item.type === 'tool_call' && item.id === payload.toolId) {
              return { ...item, toolCall: updated }
            }
            return item
          })
        )
      }
      return newMap
    })
  }, [])

  // Clear all items
  const handleClear = useCallback(() => {
    setStreamItems([])
    setToolCalls(new Map())
    textBufferRef.current = ''
  }, [])

  // Load initial history and set up event listeners
  useEffect(() => {
    let unlistenPty: (() => void) | undefined
    let unlistenToolStart: (() => void) | undefined
    let unlistenToolComplete: (() => void) | undefined
    let flushInterval: ReturnType<typeof setInterval> | undefined

    const setup = async () => {
      // Load PTY history
      try {
        const history = await getAgentPtyHistory(agentId)
        if (history.length > 0) {
          const decoded = decodeTerminalData(history)
          setStreamItems([
            {
              type: 'text',
              content: decoded,
              timestamp: Date.now(),
              id: getTextId(),
            },
          ])
        }
      } catch (error) {
        console.error('Failed to load PTY history:', error)
      }

      // Listen for PTY data events
      unlistenPty = await subscribeEvent<{ agentId: string; data: number[] }>(
        'agent-pty-data',
        (payload) => {
          if (payload.agentId === agentId) {
            const data = new Uint8Array(payload.data)
            const decoded = decodeTerminalData(data)
            addTextToStream(decoded)
          }
        }
      )

      // Listen for tool call started events
      unlistenToolStart = await subscribeEvent<ToolCallStartedPayload>(
        'tool:started',
        (payload) => {
          if (payload.agentId === agentId) {
            handleToolStart(payload)
          }
        }
      )

      // Listen for tool call completed events
      unlistenToolComplete = await subscribeEvent<ToolCallCompletedPayload>(
        'tool:completed',
        (payload) => {
          if (payload.agentId === agentId) {
            handleToolComplete(payload)
          }
        }
      )

      // Periodic flush for any remaining buffered text
      flushInterval = setInterval(flushTextBuffer, 200)
    }

    setup()

    return () => {
      unlistenPty?.()
      unlistenToolStart?.()
      unlistenToolComplete?.()
      if (flushInterval) clearInterval(flushInterval)
    }
  }, [agentId, addTextToStream, handleToolStart, handleToolComplete, flushTextBuffer, getTextId])

  // Auto-scroll to bottom when new items appear
  useEffect(() => {
    if (isAutoScrollRef.current && scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight
      }
    }
  }, [streamItems])

  // Detect if user has scrolled away from bottom
  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    const target = event.target as HTMLDivElement
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50
    isAutoScrollRef.current = isAtBottom
  }

  // Count stats
  const runningCount = Array.from(toolCalls.values()).filter((tc) => tc.status === 'running').length
  const completedCount = Array.from(toolCalls.values()).filter(
    (tc) => tc.status === 'completed'
  ).length
  const failedCount = Array.from(toolCalls.values()).filter((tc) => tc.status === 'failed').length

  return (
    <div className={cn('flex flex-col h-full bg-zinc-950', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">Terminal</span>
          {toolCalls.size > 0 && (
            <div className="flex items-center gap-1.5 ml-2">
              {runningCount > 0 && (
                <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  {runningCount}
                </Badge>
              )}
              {completedCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-xs px-1.5 py-0 h-5 text-green-500 border-green-500/30"
                >
                  {completedCount}
                </Badge>
              )}
              {failedCount > 0 && (
                <Badge
                  variant="outline"
                  className="text-xs px-1.5 py-0 h-5 text-red-500 border-red-500/30"
                >
                  {failedCount}
                </Badge>
              )}
            </div>
          )}
        </div>
        {streamItems.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200"
          >
            <Trash2 className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Unified stream */}
      <ScrollArea className="flex-1" onScrollCapture={handleScroll} ref={scrollRef}>
        <div className="p-2">
          {streamItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Terminal className="h-10 w-10 text-zinc-600 mb-3" />
              <p className="text-sm text-zinc-400">No output yet</p>
              <p className="text-xs text-zinc-500 mt-1">
                Terminal output and tool calls will appear here
              </p>
            </div>
          ) : (
            streamItems.map((item) => {
              if (item.type === 'text') {
                return <TerminalTextBlock key={item.id} content={item.content} />
              } else {
                return <InlineToolCallItem key={item.id} toolCall={item.toolCall} />
              }
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
