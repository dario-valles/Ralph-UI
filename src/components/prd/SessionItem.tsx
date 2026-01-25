import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, Trash2, Loader2 } from 'lucide-react'
import type { ChatSession } from '@/types'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/date-utils'

interface SessionItemProps {
  session: ChatSession
  isActive: boolean
  isProcessing?: boolean
  onSelect: () => void
  onDelete: () => void
}

export function SessionItem({
  session,
  isActive,
  isProcessing,
  onSelect,
  onDelete,
}: SessionItemProps) {
  return (
    <div
      data-testid="session-item"
      data-active={isActive}
      data-processing={isProcessing}
      className={cn(
        'group p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors',
        isActive && 'bg-muted'
      )}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isProcessing ? (
            <Loader2 className="h-4 w-4 shrink-0 text-primary animate-spin" />
          ) : (
            <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="text-sm truncate">{session.title || 'Untitled Session'}</span>
          {isProcessing && (
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-1">
          {session.messageCount != null && session.messageCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs font-normal">
              {session.messageCount}
            </Badge>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            aria-label="Delete session"
            className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {session.updatedAt && (
        <div className="pl-6 mt-0.5">
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(session.updatedAt)}
          </span>
        </div>
      )}
    </div>
  )
}
