/**
 * LearningAnalyticsCard - Displays learning statistics for a PRD
 *
 * US-6.3: Learning Analytics
 *
 * Features:
 * - Learning count by type (Gotcha, Pattern, Architecture, etc.)
 * - Most frequent gotchas with highlight styling
 * - Visual indicators for gotcha frequency
 * - Real-time updates
 */

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertTriangle,
  RefreshCw,
  Loader2,
  Building2,
  Lightbulb,
  FlaskConical,
  Wrench,
  FileText,
  ChevronDown,
} from 'lucide-react'
import { ralphLoopApi } from '@/lib/backend-api'
import type { LearningType } from '@/types'

interface LearningStats {
  total: number
  byType: Record<LearningType, number>
  topGotchas: Array<{
    content: string
    count: number
    percentage: number
  }>
}

function LearningTypeIcon({
  type,
  className = 'h-4 w-4',
}: {
  type: LearningType
  className?: string
}) {
  switch (type) {
    case 'architecture':
      return <Building2 className={className} />
    case 'gotcha':
      return <AlertTriangle className={className} />
    case 'pattern':
      return <Lightbulb className={className} />
    case 'testing':
      return <FlaskConical className={className} />
    case 'tooling':
      return <Wrench className={className} />
    case 'general':
    default:
      return <FileText className={className} />
  }
}

interface LearningAnalyticsCardProps {
  projectPath: string
  prdName: string
  className?: string
}

export function LearningAnalyticsCard({
  projectPath,
  prdName,
  className = '',
}: LearningAnalyticsCardProps): React.JSX.Element {
  const [stats, setStats] = useState<LearningStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)

  const loadAnalytics = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const file = await ralphLoopApi.getLearnings(projectPath, prdName)

      // Calculate stats
      const byType: Record<LearningType, number> = {
        architecture: 0,
        gotcha: 0,
        pattern: 0,
        testing: 0,
        tooling: 0,
        general: 0,
      }

      // Count by type
      file.entries.forEach((entry) => {
        byType[entry.learningType]++
      })

      // Find most frequent gotchas
      const gotchas = file.entries.filter((e) => e.learningType === 'gotcha')
      const gotchaFrequency: Record<string, number> = {}

      gotchas.forEach((gotcha) => {
        gotchaFrequency[gotcha.content] = (gotchaFrequency[gotcha.content] || 0) + 1
      })

      const topGotchas = Object.entries(gotchaFrequency)
        .map(([content, count]) => ({
          content,
          count,
          percentage: (count / (gotchas.length || 1)) * 100,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3) // Top 3

      setStats({
        total: file.entries.length,
        byType,
        topGotchas,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      console.error('Failed to load learning analytics:', err)
    } finally {
      setLoading(false)
    }
  }, [projectPath, prdName])

  useEffect(() => {
    loadAnalytics()
  }, [loadAnalytics])

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-3 sm:p-4">
          <div className="text-sm text-destructive">{error}</div>
        </CardContent>
      </Card>
    )
  }

  if (!stats) {
    return (
      <Card className={className}>
        <CardContent className="p-3 sm:p-4 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      {/* Compact header - always visible, acts as toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Lightbulb className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <span className="text-sm font-medium truncate">Learnings</span>
          <Badge variant="secondary" className="text-[10px]">
            {stats.total}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              loadAnalytics()
            }}
            disabled={loading}
            className="h-7 w-7 p-0"
            title="Refresh analytics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <CardContent className="pt-0 px-3 pb-3 sm:px-4 sm:pb-4 space-y-3">
          {/* Learning count by type - more compact */}
          {stats.total > 0 ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(stats.byType).map(([type, count]) => {
                  if (count === 0) return null
                  return (
                    <div
                      key={type}
                      className="flex items-center gap-1 px-2 py-1 rounded-md border border-border/50 bg-card text-xs"
                    >
                      <LearningTypeIcon type={type as LearningType} className="h-3 w-3" />
                      <span className="font-medium">{count}</span>
                    </div>
                  )
                })}
              </div>

              {/* Top gotchas - compact */}
              {stats.topGotchas.length > 0 && (
                <div className="space-y-1.5 pt-2 border-t">
                  <div className="flex items-center gap-1 text-xs font-medium text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    Top Gotchas
                  </div>
                  {stats.topGotchas.map((gotcha, idx) => (
                    <div
                      key={idx}
                      className="text-xs p-1.5 rounded border-l-2 border-l-destructive bg-destructive/5 flex items-center justify-between gap-2"
                    >
                      <span className="truncate flex-1">{gotcha.content}</span>
                      <Badge variant="destructive" className="text-[10px] flex-shrink-0">
                        {gotcha.count}x
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-2">
              No learnings accumulated yet
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
