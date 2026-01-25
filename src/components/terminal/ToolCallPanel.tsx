// Tool Call Panel - Collapsible display of tool calls for an agent
// Shows structured, expandable view of tool calls with input/output

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { subscribeEvent } from '@/lib/events-client'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
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

// Animation variants for staggered list reveals
const listContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.02,
    },
  },
} as const

const listItemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: {
    opacity: 1,
    x: 0,
    transition: {
      duration: 0.15,
      ease: [0.25, 0.46, 0.45, 0.94] as const, // easeOut cubic bezier
    },
  },
  exit: {
    opacity: 0,
    x: 10,
    transition: {
      duration: 0.1,
    },
  },
} as const

// Status badge animation variants
const statusBadgeVariants = {
  initial: { scale: 0.8, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.8, opacity: 0 },
} as const

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
          {/* Animated expand/collapse chevron */}
          <motion.span
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="flex-shrink-0"
          >
            <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
          </motion.span>

          {/* Tool icon */}
          <span className="text-zinc-400 flex-shrink-0">{getToolIcon(toolCall.toolName)}</span>

          {/* Tool name */}
          <span className="font-medium text-sm flex-shrink-0 text-zinc-100">
            {toolCall.toolName}
          </span>

          {/* Input summary */}
          {inputSummary && (
            <span className="text-xs text-zinc-400 truncate flex-1 font-mono">{inputSummary}</span>
          )}

          {/* Animated status indicator */}
          <span className="flex items-center gap-2 flex-shrink-0 ml-auto">
            {toolCall.durationMs !== undefined && (
              <span className="text-xs text-zinc-400">{formatDuration(toolCall.durationMs)}</span>
            )}
            <AnimatePresence mode="wait">
              {isRunning && (
                <motion.span
                  key="running"
                  variants={statusBadgeVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.15 }}
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                </motion.span>
              )}
              {toolCall.status === 'completed' && (
                <motion.span
                  key="completed"
                  variants={statusBadgeVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.15 }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                </motion.span>
              )}
              {isFailed && (
                <motion.span
                  key="failed"
                  variants={statusBadgeVariants}
                  initial="initial"
                  animate="animate"
                  exit="exit"
                  transition={{ duration: 0.15 }}
                >
                  <XCircle className="h-3.5 w-3.5 text-red-400" />
                </motion.span>
              )}
            </AnimatePresence>
          </span>
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="pl-9 pr-3 pb-3 space-y-2">
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
      unlistenStart = await subscribeEvent<ToolCallStartedPayload>('tool:started', (payload) => {
        if (payload.agentId === agentId) {
          addToolCall(payload)
        }
      })

      // Listen for tool call completed events
      unlistenComplete = await subscribeEvent<ToolCallCompletedPayload>(
        'tool:completed',
        (payload) => {
          if (payload.agentId === agentId) {
            completeToolCall(payload)
          }
        }
      )
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
          <Wrench className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-medium text-zinc-200">Tool Calls</span>
          <div className="flex items-center gap-1.5 ml-2">
            <AnimatePresence mode="popLayout">
              {runningCount > 0 && (
                <motion.div
                  key="running-badge"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5">
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    {runningCount}
                  </Badge>
                </motion.div>
              )}
              {completedCount > 0 && (
                <motion.div
                  key="completed-badge"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Badge
                    variant="outline"
                    className="text-xs px-1.5 py-0 h-5 text-green-500 border-green-500/30"
                  >
                    {completedCount}
                  </Badge>
                </motion.div>
              )}
              {failedCount > 0 && (
                <motion.div
                  key="failed-badge"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.8, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  <Badge
                    variant="outline"
                    className="text-xs px-1.5 py-0 h-5 text-red-500 border-red-500/30"
                  >
                    {failedCount}
                  </Badge>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        {agentToolCalls.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearToolCalls(agentId)}
            className="h-7 px-2 text-xs text-zinc-400 hover:text-zinc-200"
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
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <Wrench className="h-10 w-10 text-zinc-600 mb-3" />
              <p className="text-sm text-zinc-400">No tool calls yet</p>
              <p className="text-xs text-zinc-500 mt-1">
                Tool calls will appear here as the agent works
              </p>
            </motion.div>
          ) : (
            <motion.div
              variants={listContainerVariants}
              initial="hidden"
              animate="visible"
              className="space-y-1"
            >
              <AnimatePresence mode="popLayout">
                {agentToolCalls.map((toolCall, index) => (
                  <motion.div
                    key={`${toolCall.id}-${index}`}
                    variants={listItemVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                    layout
                    style={{
                      // Stagger delay only for first 10 items
                      transitionDelay: index < 10 ? `${index * 30}ms` : '0ms',
                    }}
                  >
                    <ToolCallItem toolCall={toolCall} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
