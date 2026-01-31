import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { Plus, MessageSquare, PanelLeftClose, PanelLeftOpen, ChevronDown, ChevronUp, ClipboardCheck } from 'lucide-react'
import { SessionItem } from './SessionItem'
import { QualityScoreCard } from './QualityScoreCard'
import { DiscoveryProgressCard } from './DiscoveryProgressCard'
import { EnhancedQualityChecksList } from './QualityChecksList'
import { cn } from '@/lib/utils'
import type { ChatSession, QualityAssessment, EnhancedQualityReport, DiscoveryProgress } from '@/types'

/** Check if all required discovery areas are covered */
function isDiscoveryComplete(progress?: DiscoveryProgress | null): boolean {
  if (!progress) return false
  return (
    progress.problemCovered &&
    progress.usersCovered &&
    progress.motivationCovered &&
    progress.successCovered
  )
}

/** Number of sessions to show before "Show more" */
const INITIAL_SESSIONS_COUNT = 5

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
  onCloneSession?: (session: ChatSession) => void
  qualityAssessment: QualityAssessment | null
  enhancedQualityReport?: EnhancedQualityReport | null
  discoveryProgress?: DiscoveryProgress | null
  loading: boolean
  onRefreshQuality: () => void
  onRefreshEnhancedQuality?: () => void
  className?: string
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
  onCloneSession,
  qualityAssessment,
  enhancedQualityReport,
  discoveryProgress,
  loading,
  onRefreshQuality,
  onRefreshEnhancedQuality,
  className,
}: SessionsSidebarProps) {
  const [showAll, setShowAll] = useState(false)
  const [showEnhancedChecks, setShowEnhancedChecks] = useState(false)
  const hasMore = sessions.length > INITIAL_SESSIONS_COUNT
  const visibleSessions = showAll ? sessions : sessions.slice(0, INITIAL_SESSIONS_COUNT)

  // Fetch enhanced quality report when session changes and discovery is complete
  const sessionId = currentSession?.id
  useEffect(() => {
    if (sessionId && isDiscoveryComplete(discoveryProgress) && onRefreshEnhancedQuality && !enhancedQualityReport) {
      onRefreshEnhancedQuality()
    }
  }, [sessionId, discoveryProgress, onRefreshEnhancedQuality, enhancedQualityReport])

  return (
    <Card
      className={cn(
        'shrink-0 flex flex-col transition-all duration-200',
        collapsed ? 'w-12' : 'w-48 xl:w-56 2xl:w-64',
        className
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
                className="min-h-11 min-w-11 sm:h-7 sm:w-7 sm:min-h-0 sm:min-w-0 p-0"
              >
                <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onCollapsedChange(!collapsed)}
              aria-label={collapsed ? 'Expand sessions' : 'Collapse sessions'}
              className="min-h-11 min-w-11 sm:h-7 sm:w-7 sm:min-h-0 sm:min-w-0 p-0"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-5 w-5 sm:h-4 sm:w-4" />
              ) : (
                <PanelLeftClose className="h-5 w-5 sm:h-4 sm:w-4" />
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
              className="min-h-11 min-w-11 sm:h-8 sm:w-8 sm:min-h-0 sm:min-w-0 p-0"
            >
              <Plus className="h-5 w-5 sm:h-4 sm:w-4" />
            </Button>
          </Tooltip>
          {sessions.slice(0, 5).map((session) => (
            <Tooltip key={session.id} content={session.title || 'Untitled'} side="right">
              <Button
                variant={currentSession?.id === session.id ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => onSelectSession(session)}
                className="min-h-11 min-w-11 sm:h-8 sm:w-8 sm:min-h-0 sm:min-w-0 p-0"
              >
                <MessageSquare className="h-5 w-5 sm:h-4 sm:w-4" />
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
                {visibleSessions.map((session) => (
                  <SessionItem
                    key={session.id}
                    session={session}
                    isActive={currentSession?.id === session.id}
                    isProcessing={processingSessionId === session.id}
                    onSelect={() => onSelectSession(session)}
                    onDelete={() => onDeleteSession(session.id)}
                    onClone={onCloneSession ? () => onCloneSession(session) : undefined}
                  />
                ))}
                {hasMore && (
                  <button
                    onClick={() => setShowAll(!showAll)}
                    className="w-full flex items-center justify-center gap-1 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showAll ? (
                      <>
                        <ChevronUp className="h-3 w-3" />
                        Show less
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-3 w-3" />
                        Show {sessions.length - INITIAL_SESSIONS_COUNT} more
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </CardContent>

          {/* Discovery Progress & Quality Score in Sidebar */}
          {currentSession && hasMessages && (
            <div className="p-2 border-t space-y-2">
              {/* Show discovery progress during discovery phase */}
              {discoveryProgress && !isDiscoveryComplete(discoveryProgress) && (
                <DiscoveryProgressCard
                  progress={discoveryProgress}
                  compact
                  className="border-0 shadow-none"
                />
              )}
              {/* Show quality score when discovery is complete or assessment is available */}
              {(isDiscoveryComplete(discoveryProgress) || qualityAssessment) && (
                <>
                  <QualityScoreCard
                    assessment={qualityAssessment}
                    loading={loading}
                    onRefresh={onRefreshQuality}
                    className="border-0 shadow-none"
                  />
                  {/* Enhanced Quality Checks Toggle */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-xs text-muted-foreground hover:text-foreground p-1.5 h-auto justify-start gap-1.5"
                    onClick={() => {
                      setShowEnhancedChecks(!showEnhancedChecks)
                      if (!showEnhancedChecks && !enhancedQualityReport && onRefreshEnhancedQuality) {
                        onRefreshEnhancedQuality()
                      }
                    }}
                  >
                    <ClipboardCheck className="h-3.5 w-3.5" />
                    <span className="flex-1 text-left">Detailed Quality Checks</span>
                    {showEnhancedChecks ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  {showEnhancedChecks && enhancedQualityReport && (
                    <EnhancedQualityChecksList
                      report={enhancedQualityReport}
                      className="border-0 shadow-none"
                    />
                  )}
                  {showEnhancedChecks && !enhancedQualityReport && loading && (
                    <div className="text-xs text-muted-foreground text-center py-2">
                      Loading quality checks...
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </Card>
  )
}
