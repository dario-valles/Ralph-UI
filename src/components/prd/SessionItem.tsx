import { Button } from '@/components/ui/button'
import { MessageSquare, Trash2, Loader2 } from 'lucide-react'
import type { ChatSession } from '@/types'
import { cn } from '@/lib/utils'

interface SessionItemProps {
  session: ChatSession
  isActive: boolean
  isProcessing?: boolean
  onSelect: () => void
  onDelete: () => void
}

export function SessionItem({ session, isActive, isProcessing, onSelect, onDelete }: SessionItemProps) {
  return (
    <div
      data-testid="session-item"
      data-active={isActive}
      data-processing={isProcessing}
      className={cn(
        'flex items-center justify-between p-2 rounded-md cursor-pointer hover:bg-muted/50 transition-colors',
        isActive && 'bg-muted'
      )}
      onClick={onSelect}
    >
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
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        aria-label="Delete session"
        className="h-7 w-7 p-0"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
