// Single activity event row for Mission Control timeline

import { CheckCircle2, Play, Bot, AlertCircle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ActivityEvent } from '@/hooks/useMissionControlData'

interface ActivityTimelineItemProps {
  event: ActivityEvent
}

const eventConfig = {
  task_completed: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
  task_started: {
    icon: Play,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
  },
  task_failed: {
    icon: AlertCircle,
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
  },
  agent_spawned: {
    icon: Bot,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
  },
  session_started: {
    icon: Play,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
  },
  session_completed: {
    icon: CheckCircle2,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
  },
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

export function ActivityTimelineItem({ event }: ActivityTimelineItemProps) {
  const config = eventConfig[event.eventType]
  const EventIcon = config.icon

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-muted/50 transition-colors">
      {/* Icon */}
      <div className={cn(
        "flex-shrink-0 p-1.5 rounded-full mt-0.5",
        config.bgColor
      )}>
        <EventIcon className={cn("h-3.5 w-3.5", config.color)} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm">
          <span className="font-medium">{event.description}</span>
        </p>
        <p className="text-xs text-muted-foreground truncate">
          {event.projectName} / {event.sessionName}
        </p>
      </div>

      {/* Timestamp */}
      <div className="flex-shrink-0 flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="h-3 w-3" />
        {formatTime(event.timestamp)}
      </div>
    </div>
  )
}
