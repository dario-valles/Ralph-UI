// Global statistics banner for Mission Control dashboard

import { Repeat, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GlobalStats } from '@/hooks/useMissionControlData'

interface GlobalStatsBarProps {
  stats: GlobalStats
  loading?: boolean
}

interface StatItemProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | number
  subtext?: string
  highlight?: boolean
  loading?: boolean
}

function StatItem({ icon: Icon, label, value, subtext, highlight, loading }: StatItemProps) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "flex items-center justify-center w-8 h-8 rounded-md",
        highlight ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
      )}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          {loading ? (
            <div className="h-5 w-12 bg-muted animate-pulse rounded" />
          ) : (
            <span className={cn(
              "text-lg font-semibold tabular-nums",
              highlight && "text-primary"
            )}>
              {value}
            </span>
          )}
          <span className="text-xs text-muted-foreground truncate">
            {label}
          </span>
        </div>
        {subtext && (
          <p className="text-xs text-muted-foreground truncate">
            {subtext}
          </p>
        )}
      </div>
    </div>
  )
}

export function GlobalStatsBar({ stats, loading }: GlobalStatsBarProps) {
  const hasActiveExecutions = stats.activeExecutionsCount > 0

  return (
    <div className="border-b bg-card/50 backdrop-blur supports-[backdrop-filter]:bg-card/50">
      <div className="flex items-center justify-between gap-6 px-4 py-3 overflow-x-auto">
        <StatItem
          icon={Repeat}
          label="Active Executions"
          value={stats.activeExecutionsCount}
          subtext={hasActiveExecutions ? 'Running' : 'None running'}
          highlight={hasActiveExecutions}
          loading={loading}
        />

        <div className="h-8 w-px bg-border flex-shrink-0" />

        <StatItem
          icon={FolderOpen}
          label="Projects"
          value={stats.totalProjects}
          subtext={stats.activeProjectsCount > 0 ? `${stats.activeProjectsCount} active` : 'None active'}
          loading={loading}
        />

        {/* Pulse indicator when executions are active */}
        {hasActiveExecutions && !loading && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
            </span>
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Live
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
