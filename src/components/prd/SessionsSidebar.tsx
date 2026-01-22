import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Plus, MessageSquare, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { SessionItem } from './SessionItem'
import { QualityScoreCard } from './QualityScoreCard'
import { cn } from '@/lib/utils'
import type { ChatSession, QualityAssessment } from '@/types'

interface SessionsSidebarProps {
  sessions: ChatSession[]
  currentSession: ChatSession | null
  processingSessionId: string | null
  hasMessages: boolean
  collapsed: boolean
  onCollapsedChange: (collapsed: boolean) => void
  onCreateSession: () => void
  onSelectSession: (session: ChatSession) => void
  onDeleteSession: (sessionId: string) => void
  qualityAssessment: QualityAssessment | null
  loading: boolean
  onRefreshQuality: () => void
}

/**
 * Sessions sidebar component for PRD Chat.
 * Supports collapsed mode for smaller screens.
 */
export function SessionsSidebar({
  sessions,
  currentSession,
  processingSessionId,
  hasMessages,
  collapsed,
  onCollapsedChange,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  qualityAssessment,
  loading,
  onRefreshQuality,
}: SessionsSidebarProps) {
  return (
    <Card
      className={cn(
        'shrink-0 flex flex-col transition-all duration-200',
        collapsed ? 'w-12' : 'w-48 xl:w-56 2xl:w-64'
      )}
    >
      <CardHeader className={cn('pb-2', collapsed && 'px-2')}>
        <div className="flex items-center justify-between gap-1">
          {!collapsed && <CardTitle className="text-sm font-medium truncate">Sessions</CardTitle>}
          <div className="flex items-center gap-0.5">
            {!collapsed && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCreateSession}
                aria-label="New session"
                className="h-7 w-7 p-0"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCollapsedChange(!collapsed)}
              aria-label={collapsed ? 'Expand sessions' : 'Collapse sessions'}
              className="h-7 w-7 p-0"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-4 w-4" />
              ) : (
                <PanelLeftClose className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>

      {collapsed ? (
        <CardContent className="p-2 flex-1 flex flex-col items-center gap-2">
          <Tooltip content="New Session" side="right">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCreateSession}
              aria-label="New session"
              className="h-8 w-8 p-0"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </Tooltip>
          {sessions.slice(0, 5).map((session) => (
            <Tooltip key={session.id} content={session.title || 'Untitled'} side="right">
              <Button
                variant={currentSession?.id === session.id ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => onSelectSession(session)}
                className="h-8 w-8 p-0"
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            </Tooltip>
          ))}
          {sessions.length > 5 && (
            <span className="text-xs text-muted-foreground">+{sessions.length - 5}</span>
          )}
        </CardContent>
      ) : (
        <>
          <CardContent className="p-2 flex-1 overflow-auto">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <MessageSquare className="h-6 w-6 text-muted-foreground mb-2" />
                <p className="text-xs text-muted-foreground">No sessions yet</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCreateSession}
                  className="mt-2 text-xs"
                  aria-label="New session"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  New
                </Button>
              </div>
            ) : (
              <div className="space-y-1">
                {sessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={currentSession?.id === session.id}
                    isProcessing={processingSessionId === session.id}
                    onSelect={() => onSelectSession(session)}
                    onDelete={() => onDeleteSession(session.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>

          {/* Quality Score in Sidebar */}
          {currentSession && hasMessages && (
            <div className="p-2 border-t">
              <QualityScoreCard
                assessment={qualityAssessment}
                loading={loading}
                onRefresh={onRefreshQuality}
                className="border-0 shadow-none"
              />
            </div>
          )}
        </>
      )}
    </Card>
  )
}
