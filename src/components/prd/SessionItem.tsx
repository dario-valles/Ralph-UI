import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MessageSquare,
  Trash2,
  Loader2,
  MoreHorizontal,
  Copy,
  Bug,
  RefreshCcw,
  Plug,
  Sparkles,
  Rocket,
  FileText,
  LucideIcon,
} from 'lucide-react'
import type { ChatSession, PRDTypeValue } from '@/types'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/lib/date-utils'

// Get the icon component for a PRD type
function getPrdTypeIcon(prdType?: PRDTypeValue): LucideIcon {
  switch (prdType) {
    case 'bug_fix':
      return Bug
    case 'refactoring':
      return RefreshCcw
    case 'api_integration':
      return Plug
    case 'new_feature':
      return Sparkles
    case 'full_new_app':
      return Rocket
    case 'general':
    default:
      return FileText
  }
}

// Get the color classes for a PRD type icon
function getPrdTypeColor(prdType?: PRDTypeValue): string {
  switch (prdType) {
    case 'bug_fix':
      return 'text-red-500 dark:text-red-400'
    case 'refactoring':
      return 'text-purple-500 dark:text-purple-400'
    case 'api_integration':
      return 'text-green-500 dark:text-green-400'
    case 'new_feature':
      return 'text-blue-500 dark:text-blue-400'
    case 'full_new_app':
      return 'text-amber-500 dark:text-amber-400'
    case 'general':
    default:
      return 'text-gray-500 dark:text-gray-400'
  }
}

interface SessionItemProps {
  session: ChatSession
  isActive: boolean
  isProcessing?: boolean
  onSelect: () => void
  onDelete: () => void
  onClone?: () => void
}

export function SessionItem({
  session,
  isActive,
  isProcessing,
  onSelect,
  onDelete,
  onClone,
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
          ) : session.prdType ? (
            (() => {
              const TypeIcon = getPrdTypeIcon(session.prdType)
              return <TypeIcon className={cn('h-4 w-4 shrink-0', getPrdTypeColor(session.prdType))} />
            })()
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => e.stopPropagation()}
                aria-label="Session actions"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-32">
              {onClone && (
                <DropdownMenuItem
                  onClick={(e) => {
                    e.stopPropagation()
                    onClone()
                  }}
                >
                  <Copy className="h-3.5 w-3.5 mr-2" />
                  Clone
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete()
                }}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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
