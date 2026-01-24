/**
 * Iteration History View
 *
 * Displays the history of Ralph Loop iterations with:
 * - Color-coded outcome badges
 * - Expandable row details
 * - Filtering by outcome type
 * - Summary statistics
 */

import { useState, useMemo } from 'react'
import { cn } from '@/lib/utils'
import { IterationRecord, IterationOutcome } from '@/types'
import {
  CheckCircle,
  XCircle,
  AlertCircle,
  SkipForward,
  Clock,
  ChevronDown,
  ChevronRight,
  Filter,
  AlertTriangle,
} from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface IterationHistoryViewProps {
  iterations: IterationRecord[]
  className?: string
}

// Outcome badge configuration
const outcomeBadgeConfig: Record<
  IterationOutcome,
  { icon: React.ReactNode; label: string; className: string }
> = {
  success: {
    icon: <CheckCircle className="h-3.5 w-3.5" />,
    label: 'Success',
    className: 'bg-green-500/10 text-green-500 border-green-500/20',
  },
  failed: {
    icon: <XCircle className="h-3.5 w-3.5" />,
    label: 'Failed',
    className: 'bg-red-500/10 text-red-500 border-red-500/20',
  },
  skipped: {
    icon: <SkipForward className="h-3.5 w-3.5" />,
    label: 'Skipped',
    className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  },
  interrupted: {
    icon: <AlertCircle className="h-3.5 w-3.5" />,
    label: 'Interrupted',
    className: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  },
}

function OutcomeBadge({ outcome }: { outcome: IterationOutcome }) {
  const config = outcomeBadgeConfig[outcome]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border',
        config.className
      )}
    >
      {config.icon}
      {config.label}
    </span>
  )
}

function formatDuration(secs: number): string {
  if (secs < 60) return `${secs.toFixed(1)}s`
  const mins = Math.floor(secs / 60)
  const remainingSecs = secs % 60
  return `${mins}m ${remainingSecs.toFixed(0)}s`
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

interface IterationRowProps {
  record: IterationRecord
}

function IterationRow({ record }: IterationRowProps) {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <CollapsibleTrigger asChild>
        <div
          className={cn(
            'flex items-center justify-between px-3 py-2 hover:bg-muted/50 cursor-pointer transition-colors',
            'border-b border-border/50'
          )}
        >
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-xs w-8">#{record.iteration}</span>
            <OutcomeBadge outcome={record.outcome} />
            <span className="text-sm text-muted-foreground">{record.agentType}</span>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {record.rateLimitEncountered && (
              <span className="flex items-center gap-1 text-orange-500">
                <AlertTriangle className="h-3 w-3" />
                Rate Limited
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDuration(record.durationSecs)}
            </span>
            <span>{formatTimestamp(record.startedAt)}</span>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="px-4 py-3 bg-muted/30 border-b border-border/50 space-y-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Started:</span>{' '}
              <span>{new Date(record.startedAt).toLocaleString()}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Completed:</span>{' '}
              <span>
                {record.completedAt ? new Date(record.completedAt).toLocaleString() : 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Execution ID:</span>{' '}
              <span className="font-mono text-xs">{record.executionId}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Record ID:</span>{' '}
              <span className="font-mono text-xs">{record.id}</span>
            </div>
          </div>

          {record.errorMessage && (
            <div className="mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded text-sm text-red-400">
              <span className="font-medium">Error: </span>
              {record.errorMessage}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

interface SummaryStatsProps {
  iterations: IterationRecord[]
}

function SummaryStats({ iterations }: SummaryStatsProps) {
  const stats = useMemo(() => {
    const total = iterations.length
    const successful = iterations.filter((i) => i.outcome === 'success').length
    const failed = iterations.filter((i) => i.outcome === 'failed').length
    const skipped = iterations.filter((i) => i.outcome === 'skipped').length
    const interrupted = iterations.filter((i) => i.outcome === 'interrupted').length
    const rateLimited = iterations.filter((i) => i.rateLimitEncountered).length
    const totalDuration = iterations.reduce((sum, i) => sum + i.durationSecs, 0)

    return {
      total,
      successful,
      failed,
      skipped,
      interrupted,
      rateLimited,
      totalDuration,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(1) : '0',
    }
  }, [iterations])

  return (
    <div className="grid grid-cols-4 gap-3 p-3 bg-muted/30 rounded-lg mb-4">
      <div className="text-center">
        <div className="text-2xl font-bold">{stats.total}</div>
        <div className="text-xs text-muted-foreground">Total</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-green-500">{stats.successful}</div>
        <div className="text-xs text-muted-foreground">Success ({stats.successRate}%)</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-red-500">{stats.failed}</div>
        <div className="text-xs text-muted-foreground">Failed</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-muted-foreground">
          {formatDuration(stats.totalDuration)}
        </div>
        <div className="text-xs text-muted-foreground">Total Time</div>
      </div>
    </div>
  )
}

type FilterOption = 'all' | IterationOutcome

export function IterationHistoryView({ iterations, className }: IterationHistoryViewProps) {
  const [filter, setFilter] = useState<FilterOption>('all')

  const filteredIterations = useMemo(() => {
    if (filter === 'all') return iterations
    return iterations.filter((i) => i.outcome === filter)
  }, [iterations, filter])

  const filterOptions: { value: FilterOption; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'success', label: 'Success' },
    { value: 'failed', label: 'Failed' },
    { value: 'skipped', label: 'Skipped' },
    { value: 'interrupted', label: 'Interrupted' },
  ]

  if (iterations.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center p-8 text-muted-foreground',
          className
        )}
      >
        <Clock className="h-12 w-12 mb-2 opacity-50" />
        <p>No iteration history yet</p>
        <p className="text-sm">History will appear here once the Ralph Loop runs</p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <SummaryStats iterations={iterations} />

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-medium">Iteration History ({filteredIterations.length})</h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 gap-1">
              <Filter className="h-3.5 w-3.5" />
              {filterOptions.find((o) => o.value === filter)?.label || 'Filter'}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {filterOptions.map((option) => (
              <DropdownMenuItem
                key={option.value}
                onClick={() => setFilter(option.value)}
                className={cn(filter === option.value && 'bg-accent')}
              >
                {option.label}
                {option.value !== 'all' && (
                  <span className="ml-auto text-xs text-muted-foreground">
                    {iterations.filter((i) => i.outcome === option.value).length}
                  </span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="border rounded-lg overflow-hidden">
        {filteredIterations.map((record) => (
          <IterationRow key={record.id} record={record} />
        ))}
      </div>
    </div>
  )
}

export default IterationHistoryView
